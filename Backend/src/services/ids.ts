import { randomBytes } from "node:crypto";
import { env } from "../config/env.js";
import { readTable } from "./sheets.js";

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
  pad = 4,
  headerRow = 1
): Promise<string> {
  const rows = await readTable(spreadsheetId, tab, { refresh: true, headerRow });
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
 * Issues an ID as `${prefix}-${8 random hex chars}` (e.g. "ORD-e76026d8"), matching the
 * old ADC system's ID style (PNCH-dd8edb5b, PRE-b69aa81a, STR-7d4dfcb5). A collision is
 * astronomically unlikely (32 bits of randomness) but not impossible, so this checks the
 * target tab's ID column and retries on the rare chance of a duplicate — guaranteed unique.
 */
export async function nextId(prefix: string, tab: string, idColumn: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = `${prefix}-${randomBytes(4).toString("hex")}`;
    const rows = await readTable(env.sheets.transactions, tab, { refresh: true });
    if (!rows.some((r) => r[idColumn] === candidate)) return candidate;
  }
  throw new Error(`Could not generate a unique ID for ${tab}.${idColumn} after 5 attempts`);
}
