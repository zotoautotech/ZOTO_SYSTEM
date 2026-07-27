import { getSheetsClient } from "./googleAuth.js";

export type SheetRow = Record<string, string>;

type RawTable = { headers: string[]; rows: string[][] };
type CacheEntry = RawTable & { expiresAt: number };
const cache = new Map<string, CacheEntry>();
// Every write path (appendRow/updateRow/deleteRows) busts this tab's cache entry
// immediately, so a long read TTL costs nothing on correctness — it only cuts how
// often an idle GET has to make a live Sheets API round trip (typically 300-800ms).
const DEFAULT_TTL_MS = 5 * 60_000;

function cacheKey(spreadsheetId: string, tab: string, headerRow: number) {
  return `${spreadsheetId}::${tab}::${headerRow}`;
}

async function fetchRaw(spreadsheetId: string, tab: string, headerRow: number): Promise<RawTable> {
  const sheets = await getSheetsClient();
  let values: string[][];
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${tab}!A${headerRow}:ZZ`,
    });
    values = (res.data.values as string[][] | undefined) ?? [];
  } catch (err) {
    // A tab that doesn't exist yet (never created, or referenced speculatively by code
    // written ahead of the sheet) shouldn't 500 the whole request — treat it as empty,
    // same as an existing-but-blank tab. Any other error still throws.
    const message = (err as { errors?: { message?: string }[] })?.errors?.[0]?.message ?? "";
    if (message.startsWith("Unable to parse range")) {
      values = [];
    } else {
      throw err;
    }
  }
  if (values.length === 0) return { headers: [], rows: [] };
  return { headers: values[0].map((h) => String(h ?? "").trim()), rows: values.slice(1) };
}

/** One shared cache backs readTable AND every write helper below (append/update/delete all
 * need the header row, and update/delete also need the existing rows to locate a record) —
 * a single live Sheets API read serves all of them instead of each doing its own, which used
 * to mean e.g. appendRow always re-fetched headers live and updateRow always re-fetched the
 * whole tab live even when the caller had just read that exact tab moments earlier. */
async function getCachedTable(
  spreadsheetId: string,
  tab: string,
  headerRow: number,
  opts: { refresh?: boolean; ttlMs?: number } = {}
): Promise<RawTable> {
  const key = cacheKey(spreadsheetId, tab, headerRow);
  const cached = cache.get(key);
  if (!opts.refresh && cached && cached.expiresAt > Date.now()) return cached;

  const raw = await fetchRaw(spreadsheetId, tab, headerRow);
  cache.set(key, { ...raw, expiresAt: Date.now() + (opts.ttlMs ?? DEFAULT_TTL_MS) });
  return raw;
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
  const { headers, rows } = await getCachedTable(spreadsheetId, tab, headerRow, opts);
  if (headers.length === 0) return [];

  return rows.map((row) => {
    const record: SheetRow = {};
    headers.forEach((header, i) => {
      if (!header || header in record) return;
      record[header] = row[i] !== undefined ? String(row[i]) : "";
    });
    return record;
  });
}

/** Creates `tab` with the given header row if it doesn't already exist in the spreadsheet.
 * Additive only — never touches an existing tab's data, even if its headers differ. */
export async function ensureSheetTab(spreadsheetId: string, tab: string, headers: string[]): Promise<void> {
  const sheets = await getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = (meta.data.sheets ?? []).some((s) => s.properties?.title === tab);
  if (exists) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title: tab } } }] },
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${tab}!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [headers] },
  });
}

/** Appends one or more rows in a SINGLE Sheets API call, mapping each object's keys to the
 * tab's existing header order (row 1 unless `headerRow` is given). Writing N rows one at a
 * time (N round trips) instead of batched was a real bottleneck for anything with line
 * items — always prefer this over looping appendRow when every row is already known upfront. */
export async function appendRows(
  spreadsheetId: string,
  tab: string,
  records: SheetRow[],
  headerRow = 1
): Promise<void> {
  if (records.length === 0) return;
  const { headers } = await getCachedTable(spreadsheetId, tab, headerRow);
  if (headers.length === 0) {
    throw new Error(`Tab "${tab}" has no header row — cannot append`);
  }

  // Mirror readTable's first-occurrence-wins rule: only the first column with a given
  // header name gets written, so a value meant for one field can't bleed into a later,
  // identically-named column on a legacy sheet (e.g. repeated "CUSTOMER NAME" columns).
  const values = records.map((record) => {
    const seen = new Set<string>();
    return headers.map((h) => {
      if (!h || seen.has(h) || !(h in record)) return "";
      seen.add(h);
      return record[h];
    });
  });

  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${tab}!A${headerRow}`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values },
  });

  cache.delete(cacheKey(spreadsheetId, tab, headerRow));
}

/** Appends a single row — see appendRows() for the batching details. */
export async function appendRow(
  spreadsheetId: string,
  tab: string,
  record: SheetRow,
  headerRow = 1
): Promise<void> {
  return appendRows(spreadsheetId, tab, [record], headerRow);
}

/** Updates the row whose idColumn matches idValue with the given patch (partial record). */
export async function updateRow(
  spreadsheetId: string,
  tab: string,
  idColumn: string,
  idValue: string,
  patch: SheetRow
): Promise<void> {
  const { headers, rows } = await getCachedTable(spreadsheetId, tab, 1);
  if (headers.length === 0) throw new Error(`Tab "${tab}" is empty`);

  const idColIndex = headers.indexOf(idColumn);
  if (idColIndex === -1) throw new Error(`Column "${idColumn}" not found in tab "${tab}"`);

  const rowIndex = rows.findIndex((r) => r[idColIndex] === idValue);
  if (rowIndex === -1) throw new Error(`Row with ${idColumn}=${idValue} not found in "${tab}"`);

  const existing = rows[rowIndex];
  const merged = headers.map((h, i) => (h in patch ? patch[h] : existing[i] ?? ""));

  const sheetRowNumber = rowIndex + 2; // +1 for the header row, +1 to go from 0-indexed to 1-indexed
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${tab}!A${sheetRowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [merged] },
  });

  cache.delete(cacheKey(spreadsheetId, tab, 1));
}

/** Deletes every row whose idColumn value is in idValues. Returns how many rows were removed. */
export async function deleteRows(
  spreadsheetId: string,
  tab: string,
  idColumn: string,
  idValues: string[]
): Promise<number> {
  if (idValues.length === 0) return 0;
  const idSet = new Set(idValues);
  const sheets = await getSheetsClient();

  const [{ headers, rows }, metaRes] = await Promise.all([
    getCachedTable(spreadsheetId, tab, 1),
    sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties" }),
  ]);
  if (headers.length === 0) return 0;

  const idColIndex = headers.indexOf(idColumn);
  if (idColIndex === -1) throw new Error(`Column "${idColumn}" not found in tab "${tab}"`);

  const sheetId = metaRes.data.sheets?.find((s) => s.properties?.title === tab)?.properties?.sheetId;
  if (sheetId === undefined || sheetId === null) throw new Error(`Tab "${tab}" not found`);

  // Absolute 0-indexed sheet row numbers (rows here excludes the header, which occupies
  // absolute row 0 — so data row i sits at absolute index i+1), descending so deleting one
  // row doesn't shift the index of the next one still to be deleted.
  const rowIndices = rows
    .map((r, i) => (idSet.has(r[idColIndex]) ? i + 1 : -1))
    .filter((i) => i !== -1)
    .sort((a, b) => b - a);

  if (rowIndices.length === 0) return 0;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: rowIndices.map((rowIndex) => ({
        deleteDimension: {
          range: { sheetId, dimension: "ROWS", startIndex: rowIndex, endIndex: rowIndex + 1 },
        },
      })),
    },
  });

  cache.delete(cacheKey(spreadsheetId, tab, 1));
  return rowIndices.length;
}

export function clearCache() {
  cache.clear();
}
