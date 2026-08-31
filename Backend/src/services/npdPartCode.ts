import { env } from "../config/env.js";
import { readTable, updateRow } from "./sheets.js";

/**
 * FG Part Code generation — kept as originally built in Sprint 2 (base code + next unused
 * Alphabet letter). Unlike the RM scheme below, this was NEVER verified against real FG data
 * the way RM was (see NPD/CONTEXT.md's Sprint 7 notes) — real `FINAL GOOD SKU.PART NO.` values
 * are almost entirely blank in production, so there was no real pattern to reverse-engineer
 * against. Still used by partCodeRequest.ts for FG-type requests; do not assume it's correct
 * the way the RM generator below now is.
 */
const ALPHABET_TAB = "Alphabet";

export class NoLettersAvailableError extends Error {
  constructor() {
    super("No unused letters left in the Alphabet tab — add more rows before generating another part code.");
    this.name = "NoLettersAvailableError";
  }
}

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

/**
 * `RM ref Category.CODE` auto-generation — this is no longer a guess or a manually-typed
 * convention. The user pulled the ACTUAL AppSheet App Formula off the live column:
 *
 *   LOOKUP(LOOKUP(maxrow("RM ref Category","TIMESTAMP",ISNOTBLANK([Unique ID])),
 *          "RM ref Category","CATEGORY","CODE"),
 *          "Alphabet","Letter","Letter Increment")
 *
 * Decoded: find the most-recently-created `RM ref Category` row (MAXROW by TIMESTAMP among
 * non-blank rows — i.e. the row immediately before the one being added), read ITS `CODE`, then
 * look that letter up in the `Alphabet` tab's `Letter` column and return the matching `Letter
 * Increment` — the next letter in sequence. This is a real, provable formula, not the "hand-
 * typed convention" this codebase assumed back in Sprint 7 before this formula was found.
 *
 * `Alphabet` here is a NEW tab on env.sheets.npd (the RM spreadsheet) — NOT the same tab as
 * `generatePartCode()` above, which reads `env.sheets.fg`'s own separate `Alphabet` tab. Two
 * different spreadsheets, two different Alphabet tabs, same shape (SR NO./Letter/Letter
 * Increment/MAKED BY/MAKED CODE), seeded with the full A→Z→AA→AB…→ZZ sequence (702 rows) the
 * user provided directly from the live `ZOTO/PRODUCT MASTER FG` sheet's own Alphabet tab.
 */
const RM_CATEGORY_TAB = "RM ref Category";
const RM_CATEGORY_DD_TAB = "RM ref Category DD";
const RM_ALPHABET_TAB = "Alphabet";

/** Shared by nextCategoryCode() and nextSubCategoryCode() — both real App Formulas follow the
 * identical shape (find the most-recently-created row in the SAME tab, read its CODE, look up
 * the next Letter Increment in the shared RM Alphabet tab), just scoped to a different tab.
 * Bootstraps to the Alphabet's own first letter ("A") when the tab has no rows yet — the real
 * formula's MAXROW would find nothing in that case, matching how the very first live row in
 * either tab had to have been seeded by hand before any formula could take over. */
async function nextCode(tab: string): Promise<string> {
  const rows = await readTable(env.sheets.npd, tab, { refresh: true });
  const withRows = rows.filter((r) => (r["Unique ID"] ?? "").trim());

  let latest: (typeof rows)[number] | undefined;
  for (const r of withRows) {
    const ts = new Date(r.TIMESTAMP ?? "").getTime();
    if (Number.isNaN(ts)) continue;
    if (!latest || ts > new Date(latest.TIMESTAMP).getTime()) latest = r;
  }

  const alphabet = await readTable(env.sheets.npd, RM_ALPHABET_TAB);
  const prevCode = (latest?.CODE ?? "").trim();

  if (!prevCode) {
    const first = alphabet.find((r) => (r.Letter ?? "").trim());
    if (!first) throw new Error("Alphabet tab is empty — cannot generate a starting CODE");
    return first.Letter.trim();
  }

  const match = alphabet.find((r) => (r.Letter ?? "").trim() === prevCode);
  if (!match || !(match["Letter Increment"] ?? "").trim()) {
    throw new Error(`No next letter found after CODE "${prevCode}" in the Alphabet tab — add more rows`);
  }
  return match["Letter Increment"].trim();
}

/** `RM ref Category.CODE` — see this file's module-level doc comment for the decoded formula. */
export async function nextCategoryCode(): Promise<string> {
  return nextCode(RM_CATEGORY_TAB);
}

/**
 * `RM ref Category DD.CODE` — same real App Formula shape, pulled directly off the live
 * column, scoped to this tab instead:
 *
 *   LOOKUP(LOOKUP(MAXROW("RM ref Category DD","TIMESTAMP",ISNOTBLANK([Unique ID])),
 *          "RM ref Category DD","Unique ID","CODE"),
 *          "Alphabet","Letter","Letter Increment")
 *
 * Note this tab's own formula matches MAXROW's result against `Unique ID` (its real key
 * column), unlike `RM ref Category`'s formula which matches against `CATEGORY` (that table's
 * own key is its label field) — different tables, different configured keys, same underlying
 * "next letter after whichever row was most recently created" logic either way.
 *
 * The `AGAINST ID` and `Category` App Formulas on this same tab (see nextAgainstId()/
 * categoryFromAgainstId() below) are the same "most recently created SKU, app-wide"
 * dead-pointer pattern documented on `RM ref Category`'s own `Against id` column (see
 * NPD/CONTEXT.md's "the real mechanism" section) — flagged to the user as functionally
 * meaningless and would overwrite the real, doer-picked `Category` value with it; implemented
 * anyway on the user's explicit, informed instruction to match the legacy formulas verbatim.
 * NPD's own `Category` field on this tab WAS a real, doer-picked value before this change —
 * copying the legacy formula would make it *worse*, not more correct.
 */
export async function nextSubCategoryCode(): Promise<string> {
  return nextCode(RM_CATEGORY_DD_TAB);
}

/**
 * `RM ref Category DD.AGAINST ID` — real App Formula, verbatim:
 *
 *   any(SELECT(Raw Material SKU[ID'S], [ID'S]=MAXROW("Raw Material SKU","TIMESTAMP",[ID'S]<>"")))
 *
 * Returns the `ID'S` of whichever `Raw Material SKU` row currently has the latest `TIMESTAMP`
 * — a live, constantly-shifting pointer to "the most recently created SKU app-wide," not a
 * real link to the Sub-Category row it's written on. See this file's module doc comment above.
 */
export async function nextAgainstId(): Promise<string> {
  const rows = await readTable(env.sheets.npd, "Raw Material SKU", { refresh: true });
  const withIds = rows.filter((r) => (r["ID'S"] ?? "").trim());

  let latest: (typeof rows)[number] | undefined;
  for (const r of withIds) {
    const ts = new Date(r.TIMESTAMP ?? "").getTime();
    if (Number.isNaN(ts)) continue;
    if (!latest || ts > new Date(latest.TIMESTAMP).getTime()) latest = r;
  }
  return (latest?.["ID'S"] ?? "").trim();
}

/**
 * `RM ref Category DD.Category` — real App Formula, verbatim:
 *
 *   LOOKUP([_THISROW].[AGAINST ID],"Raw Material SKU","ID'S","Category")
 *
 * Reads the `Category` off whatever `AGAINST ID` currently points to — since that's the same
 * dead "most recent SKU app-wide" pointer above, this returns "the Category of whatever the
 * newest SKU happens to be," not the Category this Sub-Category actually belongs to.
 */
export async function categoryFromAgainstId(againstId: string): Promise<string> {
  if (!againstId) return "";
  const rows = await readTable(env.sheets.npd, "Raw Material SKU");
  const row = rows.find((r) => (r["ID'S"] ?? "").trim() === againstId);
  return (row?.Category ?? "").trim();
}

/**
 * RM Part Code generation — reverse-engineered and VERIFIED against the real legacy ADC
 * spreadsheet (`Copy of ADC/PRODUCT MASTER-RM`), not guessed. Confirmed against all 714 real
 * `Raw Material SKU` rows: every single one matched this exact 5-part shape.
 *
 * `PART NO.` = [Category CODE] + [Sub-Category CODE] + [3-digit running count] + [Paint CODE]
 *              + [Design-By digit]
 *
 *   - Category CODE (2 letters) — `RM ref Category.CODE`, one row per Category.
 *   - Sub-Category CODE (2 letters) — `RM ref Category DD.CODE`, one row per Category+Sub
 *     Category pair.
 *   - 3-digit count — NOT stored anywhere; a simple monotonic counter scoped to the 4-letter
 *     (Category+Sub-Category) prefix, starting "000", incrementing per new part under that
 *     prefix. Verified: 62 of 64 real multi-part prefixes matched this exactly (the other 2
 *     were explained by a deleted row, not a different rule).
 *   - Paint CODE (1 letter) — `RM ref Paint.Code`, looked up by the part's actual paint/finish.
 *   - Design-By digit (1 digit) — `PART DESGIN BY.CODE`, e.g. 0 = in-house, 1 = supplier.
 *
 * All four lookup tables are edited via the generic taxonomy admin (Backend/src/routes/npd/
 * taxonomy.ts's `rm-category`/`rm-category-dd`/`rm-paint`/`part-design-by` entries) — this
 * service only does the lookups + the counter + the concatenation, matching the real legacy
 * behavior (every piece hand-picked by Design from a fixed vocabulary, the code itself
 * assembled deterministically from what they picked — see NPD/CONTEXT.md's Sprint 7 notes for
 * the full trace).
 */

export class RmPartCodeLookupError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "RmPartCodeLookupError";
  }
}

async function lookupCode(tab: string, matchField: string, matchValue: string, codeField: string): Promise<string> {
  const rows = await readTable(env.sheets.npd, tab);
  const row = rows.find((r) => (r[matchField] ?? "").trim().toLowerCase() === matchValue.trim().toLowerCase());
  const code = (row?.[codeField] ?? "").trim();
  if (!code) {
    throw new RmPartCodeLookupError(
      "MISSING_CODE",
      `No CODE found on "${tab}" for ${matchField}="${matchValue}" — add it via Taxonomy admin first.`
    );
  }
  return code;
}

export interface RmPartCodeInput {
  category: string;
  subCategory: string;
  paintDescription: string;
  designByLabel: string;
}

export interface RmPartCodeResult {
  partCode: string;
  categoryCode: string;
  subCategoryCode: string;
  count: string;
  paintCode: string;
  designByDigit: string;
}

export async function generateRmPartCode(input: RmPartCodeInput): Promise<RmPartCodeResult> {
  const [categoryCode, subCategoryCode, paintCode, designByDigit] = await Promise.all([
    lookupCode("RM ref Category", "CATEGORY", input.category, "CODE"),
    lookupCode("RM ref Category DD", "SUB CATEGORY", input.subCategory, "CODE"),
    lookupCode("RM ref Paint", "Paint Description", input.paintDescription, "Code"),
    lookupCode("PART DESGIN BY", "PART DESIGN BY", input.designByLabel, "CODE"),
  ]);

  const prefix = categoryCode + subCategoryCode;
  const skuRows = await readTable(env.sheets.npd, "Raw Material SKU", { refresh: true });
  const count = skuRows.filter((r) => (r["PART NO."] ?? "").startsWith(prefix)).length;
  const countStr = String(count).padStart(3, "0");

  const partCode = `${prefix}${countStr}${paintCode}${designByDigit}`;
  return { partCode, categoryCode, subCategoryCode, count: countStr, paintCode, designByDigit };
}
