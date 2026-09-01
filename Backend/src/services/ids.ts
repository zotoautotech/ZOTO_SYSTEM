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
 *
 * Spreadsheet-agnostic — takes `spreadsheetId` explicitly, unlike `nextIds()`/`nextId()`
 * below (which stay hardcoded to `env.sheets.transactions` for backward compatibility with
 * their existing Sales CRR callers). Use this one directly for any other spreadsheet (e.g.
 * NPD's `env.sheets.npd`) instead of the transactions-only wrappers.
 */
export async function nextRandomIds(
  spreadsheetId: string,
  prefix: string,
  tab: string,
  idColumn: string,
  count: number
): Promise<string[]> {
  if (count <= 0) return [];
  const rows = await readTable(spreadsheetId, tab);
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

/** Issues `count` IDs against the Sales CRR transactions sheet — see nextRandomIds() (the
 * spreadsheet-agnostic version) for the collision-check details. */
export async function nextIds(prefix: string, tab: string, idColumn: string, count: number): Promise<string[]> {
  return nextRandomIds(env.sheets.transactions, prefix, tab, idColumn, count);
}

/** Issues a single ID against the Sales CRR transactions sheet — see nextRandomIds() for the
 * collision-check details. */
export async function nextId(prefix: string, tab: string, idColumn: string): Promise<string> {
  return (await nextIds(prefix, tab, idColumn, 1))[0];
}

/** Issues a single ID against any spreadsheet — see nextRandomIds() for the collision-check
 * details. */
export async function nextRandomId(spreadsheetId: string, prefix: string, tab: string, idColumn: string): Promise<string> {
  return (await nextRandomIds(spreadsheetId, prefix, tab, idColumn, 1))[0];
}

/**
 * Plain (no prefix, no dash) 8-hex-char random ID — e.g. "800ecd70". Confirmed directly
 * against the live NPD sheets' own real `Unique ID` column values (the user showed real
 * saved values from the sheet: `800ecd70`, `f6db8404`, `24a775fa`, …, none of them prefixed
 * or dash-separated) — this is NOT the same shape as `nextRandomId()`'s `PREFIX-hex` format
 * above, even though both use the same "random hex, checked against existing IDs" idea (the
 * "CRR IDs" the user pointed at as the reference technique, not the literal dash format).
 * Replaced `nextSequentialId()`'s max+1 scan for every NPD taxonomy table's own ID column
 * (`Backend/src/routes/npd/taxonomy.ts`'s generic POST handler) — sequential max+1 has no
 * real atomicity guarantee against two doers creating a row at the same moment (both could
 * read the same "current max" before either write lands), where random-with-collision-check
 * genuinely can't collide in practice. `idPrefix` on `TaxonomyTableDef` is no longer used for
 * ID generation as a result — left in place on the interface/table defs rather than removed,
 * since it's harmless and removing it is a bigger, unrelated cleanup.
 */
export async function nextPlainRandomId(spreadsheetId: string, tab: string, idColumn: string): Promise<string> {
  const rows = await readTable(spreadsheetId, tab);
  const existing = new Set(rows.map((r) => r[idColumn]));
  let candidate = randomBytes(4).toString("hex");
  while (existing.has(candidate)) {
    candidate = randomBytes(4).toString("hex");
  }
  return candidate;
}
