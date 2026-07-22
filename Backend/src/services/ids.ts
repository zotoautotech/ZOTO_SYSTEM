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

function randomId(prefix: string): string {
  return `${prefix}-${randomBytes(4).toString("hex")}`;
}

/**
 * Issues `count` IDs as `${prefix}-${8 random hex chars}` (e.g. "ORD-e76026d8"), matching
 * the old ADC system's ID style (PNCH-dd8edb5b, PRE-b69aa81a, STR-7d4dfcb5). A collision is
 * astronomically unlikely (32 bits of randomness) but not impossible, so existing IDs in
 * the target tab are fetched ONCE (not per ID — important when issuing many at once, e.g.
 * one per line item) and every candidate is checked against that plus this batch's own IDs.
 * Uses the normal 30s cache (no forced refresh) since this isn't a hot correctness path.
 */
export async function nextIds(prefix: string, tab: string, idColumn: string, count: number): Promise<string[]> {
  if (count <= 0) return [];
  const rows = await readTable(env.sheets.transactions, tab);
  const existing = new Set(rows.map((r) => r[idColumn]));
  const issued: string[] = [];
  while (issued.length < count) {
    const candidate = randomId(prefix);
    if (!existing.has(candidate)) {
      existing.add(candidate);
      issued.push(candidate);
    }
  }
  return issued;
}

/** Issues a single ID — see nextIds() for the collision-check details. */
export async function nextId(prefix: string, tab: string, idColumn: string): Promise<string> {
  return (await nextIds(prefix, tab, idColumn, 1))[0];
}
