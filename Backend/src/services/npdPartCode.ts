import { env } from "../config/env.js";
import { readTable, updateRow } from "./sheets.js";

/**
 * Part-code generation (build-prompt §5.2): "Segment code + Category code + Sub-category code
 * + running Alphabet sequence". In the live schema, the segment+category+sub-category portion
 * is already pre-composed as the `CODE` column on `FG ref Category DD` / `RM ref Category DD`
 * (a doer fills that in once when creating the taxonomy row — see npd/taxonomy.ts) — this
 * service only handles the "+ running Alphabet sequence" suffix.
 *
 * The `Alphabet` tab (on FG_SHEET_ID — shared by both FG and RM code generation, one running
 * sequence, matching the build prompt's single Alphabet table) turned out to already hold REAL
 * production data when first read (not the blank reference table assumed) — a `Letter`/
 * `Letter Increment` sequence (A→B→C→…→Z→AA→AB…) plus `MAKED BY`/`MAKED CODE` columns, with
 * only the first two letters (A, B) already marked used. This service treats any row whose
 * `MAKED CODE` is blank as the next available letter, matched by its `Letter` value (unique,
 * sequential) — it never touches `SR NO.`/`Letter Increment`, whose exact meaning on the
 * pre-existing rows isn't fully understood; only `MAKED BY`/`MAKED CODE` are written.
 */
const ALPHABET_TAB = "Alphabet";

export class NoLettersAvailableError extends Error {
  constructor() {
    super("No unused letters left in the Alphabet tab — add more rows before generating another part code.");
    this.name = "NoLettersAvailableError";
  }
}

/** Consumes the next unused Alphabet letter and returns `${baseCode}${letter}`. Marks the
 * letter's row used (MAKED BY/MAKED CODE) so the next call picks a different one — this is a
 * real, cache-busting write, so only call it once a Part Code Request is actually being
 * approved (not on every duplicate-check or preview). */
export async function generatePartCode(baseCode: string, employeeId: string): Promise<string> {
  const rows = await readTable(env.sheets.fg, ALPHABET_TAB, { refresh: true });
  const next = rows.find((r) => (r.Letter ?? "").trim() && !(r["MAKED CODE"] ?? "").trim());
  if (!next) throw new NoLettersAvailableError();

  const letter = next.Letter.trim();
  const fullCode = `${baseCode}${letter}`;
  await updateRow(env.sheets.fg, ALPHABET_TAB, "Letter", letter, {
    "MAKED BY": employeeId,
    "MAKED CODE": fullCode,
  });
  return fullCode;
}
