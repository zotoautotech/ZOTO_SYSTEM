import { getSheetsClient } from "./googleAuth.js";

export type SheetRow = Record<string, string>;

type CacheEntry = { data: SheetRow[]; expiresAt: number };
const cache = new Map<string, CacheEntry>();
const DEFAULT_TTL_MS = 30_000;

function cacheKey(spreadsheetId: string, tab: string, headerRow: number) {
  return `${spreadsheetId}::${tab}::${headerRow}`;
}

/**
 * Reads a tab as an array of objects keyed by its header row (row 1 by default —
 * pass `headerRow` for sheets like CUSTOMER MASTER T1 whose real field names sit
 * on a later row under a group-header row). Duplicate header names keep the
 * FIRST occurrence's value, since some legacy master sheets repeat field names
 * (e.g. "CUSTOMER NAME") in later, usually-blank sections.
 */
export async function readTable(
  spreadsheetId: string,
  tab: string,
  opts: { refresh?: boolean; ttlMs?: number; headerRow?: number } = {}
): Promise<SheetRow[]> {
  const headerRow = opts.headerRow ?? 1;
  const key = cacheKey(spreadsheetId, tab, headerRow);
  const cached = cache.get(key);
  if (!opts.refresh && cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tab}!A${headerRow}:ZZ`,
  });

  const rows = res.data.values ?? [];
  if (rows.length === 0) return [];

  const headers = rows[0].map((h) => String(h ?? "").trim());
  const records: SheetRow[] = rows.slice(1).map((row) => {
    const record: SheetRow = {};
    headers.forEach((header, i) => {
      if (!header || header in record) return;
      record[header] = row[i] !== undefined ? String(row[i]) : "";
    });
    return record;
  });

  cache.set(key, { data: records, expiresAt: Date.now() + (opts.ttlMs ?? DEFAULT_TTL_MS) });
  return records;
}

/** Appends one row, mapping the object's keys to the tab's existing header order (row 1 unless `headerRow` is given). */
export async function appendRow(
  spreadsheetId: string,
  tab: string,
  record: SheetRow,
  headerRow = 1
): Promise<void> {
  const sheets = await getSheetsClient();
  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tab}!A${headerRow}:ZZ${headerRow}`,
  });
  const headers = (headerRes.data.values?.[0] ?? []).map((h) => String(h ?? "").trim());
  if (headers.length === 0) {
    throw new Error(`Tab "${tab}" has no header row — cannot append`);
  }

  // Mirror readTable's first-occurrence-wins rule: only the first column with a given
  // header name gets written, so a value meant for one field can't bleed into a later,
  // identically-named column on a legacy sheet (e.g. repeated "CUSTOMER NAME" columns).
  const seen = new Set<string>();
  const row = headers.map((h) => {
    if (!h || seen.has(h) || !(h in record)) return "";
    seen.add(h);
    return record[h];
  });

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${tab}!A${headerRow}`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] },
  });

  cache.delete(cacheKey(spreadsheetId, tab, headerRow));
}

/** Updates the row whose idColumn matches idValue with the given patch (partial record). */
export async function updateRow(
  spreadsheetId: string,
  tab: string,
  idColumn: string,
  idValue: string,
  patch: SheetRow
): Promise<void> {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tab}!A1:ZZ`,
  });
  const rows = res.data.values ?? [];
  if (rows.length === 0) throw new Error(`Tab "${tab}" is empty`);

  const headers = rows[0].map((h) => String(h ?? "").trim());
  const idColIndex = headers.indexOf(idColumn);
  if (idColIndex === -1) throw new Error(`Column "${idColumn}" not found in tab "${tab}"`);

  const rowIndex = rows.findIndex((r, i) => i > 0 && r[idColIndex] === idValue);
  if (rowIndex === -1) throw new Error(`Row with ${idColumn}=${idValue} not found in "${tab}"`);

  const existing = rows[rowIndex];
  const merged = headers.map((h, i) => (h in patch ? patch[h] : existing[i] ?? ""));

  const sheetRowNumber = rowIndex + 1; // 1-indexed, includes header row
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${tab}!A${sheetRowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [merged] },
  });

  cache.delete(cacheKey(spreadsheetId, tab, 1));
}

export function clearCache() {
  cache.clear();
}
