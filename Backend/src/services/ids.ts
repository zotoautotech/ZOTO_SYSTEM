import { env } from "../config/env.js";
import { readTable, updateRow, appendRow } from "./sheets.js";

/**
 * Issues the next sequential value for a master ID column by scanning existing
 * values for the highest numeric suffix. Used for master sheets (Customer Code,
 * FG ID) we don't own the schema of and shouldn't add a COUNTERS tab to.
 * `prefix` may be "" for plain-numeric IDs (e.g. FG ID: 1, 2, 3…).
 */
export async function nextSequentialId(
  spreadsheetId: string,
  tab: string,
  idColumn: string,
  prefix: string,
  pad = 4
): Promise<string> {
  const rows = await readTable(spreadsheetId, tab, { refresh: true });
  let max = 0;
  for (const row of rows) {
    const raw = row[idColumn];
    if (!raw) continue;
    const match = raw.match(/(\d+)\s*$/);
    if (match) max = Math.max(max, Number(match[1]));
  }
  const next = max + 1;
  return prefix ? `${prefix}${String(next).padStart(pad, "0")}` : String(next);
}

/**
 * Issues the next sequential ID for a prefix (e.g. "ORD" -> "ORD-2627-0001"),
 * using the COUNTERS tab in the transactions sheet as the single source of truth.
 * Not safe against true concurrent writers (Sheets has no transactions) but the
 * read-then-write window is short and collisions are rare at this scale.
 */
export async function nextId(prefix: string, pad = 4): Promise<string> {
  const spreadsheetId = env.sheets.transactions;
  const counterKey = `${prefix}-${env.fiscalYearSeries}`;

  const rows = await readTable(spreadsheetId, "COUNTERS", { refresh: true });
  const existing = rows.find((r) => r.COUNTER_KEY === counterKey);

  const current = existing ? Number(existing.LAST_VALUE || 0) : 0;
  const next = current + 1;

  if (existing) {
    await updateRow(spreadsheetId, "COUNTERS", "COUNTER_KEY", counterKey, {
      LAST_VALUE: String(next),
    });
  } else {
    await appendRow(spreadsheetId, "COUNTERS", {
      COUNTER_KEY: counterKey,
      LAST_VALUE: String(next),
    });
  }

  return `${counterKey}-${String(next).padStart(pad, "0")}`;
}
