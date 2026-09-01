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
const RM_PAINT_TAB = "RM ref Paint";
const RM_ALPHABET_TAB = "Alphabet";

/** Shared by nextCategoryCode()/nextSubCategoryCode()/nextPaintCode() — all three real App
 * Formulas follow the identical shape (find the most-recently-created row in the SAME tab,
 * read its own code field, look up the next Letter Increment in the shared RM Alphabet tab),
 * just scoped to a different tab and, since `RM ref Paint`'s code column is titled `Code` not
 * `CODE`, a different exact field name per tab. Bootstraps to the Alphabet's own first letter
 * ("A") when the tab has no rows yet — the real formula's MAXROW would find nothing in that
 * case, matching how the very first live row in any of these tabs had to have been seeded by
 * hand before any formula could take over. */
async function nextCode(tab: string, codeField: string): Promise<string> {
  const rows = await readTable(env.sheets.npd, tab, { refresh: true });
  const withRows = rows.filter((r) => (r["Unique ID"] ?? "").trim());

  let latest: (typeof rows)[number] | undefined;
  for (const r of withRows) {
    const ts = new Date(r.TIMESTAMP ?? "").getTime();
    if (Number.isNaN(ts)) continue;
    if (!latest || ts > new Date(latest.TIMESTAMP).getTime()) latest = r;
  }

  const alphabet = await readTable(env.sheets.npd, RM_ALPHABET_TAB);
  const prevCode = (latest?.[codeField] ?? "").trim();

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
  return nextCode(RM_CATEGORY_TAB, "CODE");
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
  return nextCode(RM_CATEGORY_DD_TAB, "CODE");
}

/**
 * `RM ref Paint.Code` — same real App Formula shape again, pulled directly off the live
 * column:
 *
 *   LOOKUP(LOOKUP(maxrow("RM ref Paint","TIMESTAMP",ISNOTBLANK([Unique ID])),
 *          "RM ref Paint","Paint Description","Code"),
 *          "Alphabet","Letter","Letter Increment")
 *
 * Matches MAXROW's result against `Paint Description` (this table's own label/key field, same
 * as `RM ref Category` matching against `CATEGORY`) rather than `Unique ID` (as `RM ref
 * Category DD` does) — confirms different tables really do have different configured keys in
 * the source app, not a typo. No dead-pointer complication here, unlike `RM ref Category DD`'s
 * `AGAINST ID`/`Category` — this tab has no such fields, `Code` is the only computed column.
 */
export async function nextPaintCode(): Promise<string> {
  return nextCode(RM_PAINT_TAB, "Code");
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
 * `RM ref Category.DUPLICACY` — real App Formula, verbatim:
 *
 *   COUNT(SELECT(RM REF CATEGORY[Unique ID], TRIM([_THISROW].[CATEGORY])=[CATEGORY]))
 *
 * A live count of every existing `RM ref Category` row whose own `CATEGORY` trims-equal this
 * one's — i.e. a duplicate-name counter, not a uniqueness gate (nothing stops the row from
 * being saved even if this comes back > 0; the reference just surfaces the count for a human
 * to notice). Counted against rows that exist BEFORE this one is appended, matching how an
 * App Formula evaluates at compute-time against already-committed data.
 */
export async function countCategoryDuplicates(category: string): Promise<string> {
  const trimmed = category.trim();
  if (!trimmed) return "0";
  const rows = await readTable(env.sheets.npd, RM_CATEGORY_TAB, { refresh: true });
  const count = rows.filter((r) => (r.CATEGORY ?? "").trim() === trimmed).length;
  return String(count);
}

/**
 * RM Part Code generation — as of this pass, implemented against the REAL `PART NO.` App
 * Formula the user pulled directly off the live AppSheet column (not the earlier reverse-
 * engineered approximation), verbatim:
 *
 *   IF(NOT(ISBLANK(LOOKUP([ID'S],"RM ref Category","AGAINST ID","CODE"))),
 *      LOOKUP([ID'S],"RM ref Category","AGAINST ID","CODE"),
 *      ANY(SELECT(RM ref Category[CODE], [_THISROW].[Category]=[CATEGORY])))
 *   &
 *   IF(NOT(ISBLANK(LOOKUP([ID'S],"RM ref Category DD","AGAINST ID","CODE"))),
 *      LOOKUP([ID'S],"RM ref Category DD","AGAINST ID","CODE"),
 *      ANY(SELECT(RM ref Category DD[CODE],
 *          AND([_THISROW].[Category]=[CATEGORY],[_THISROW].[Sub Category]=[SUB CATEGORY]))))
 *   &
 *   RIGHT("000"&COUNT(SELECT(RAW MATERIAL SKU[ID'S], AND(
 *     [_THISROW].[Category]=[Category], [_THISROW].[Sub Category]=[Sub Category],
 *     [_THISROW].[Paint]=[_THISROW].[Paint], [_THISROW].[MAKE BY]=[_THISROW].[MAKE BY],
 *     [_THISROW].[_ROWNUMBER]>=[_ROWNUMBER]))),3)
 *   &
 *   IF(NOT(ISBLANK(LOOKUP([_THISROW].[Paint],"RM ref Paint","Paint Description","Code"))),
 *      LOOKUP([_THISROW].[Paint],"RM ref Paint","Paint Description","Code"),
 *      ANY(SELECT(RM ref Paint[Code], [_THISROW].[Paint]=[Unique ID])))
 *   &
 *   IF(NOT(ISBLANK(LOOKUP([_THISROW].[MAKE BY],"Alphabet","MAKED BY","MAKED CODE"))),
 *      LOOKUP([_THISROW].[MAKE BY],"Alphabet","MAKED BY","MAKED CODE"),
 *      ANY(SELECT(Alphabet[MAKED CODE], [_THISROW].[MAKE BY]=[MAKED CODE])))
 *
 * Four real findings vs the earlier approximation this replaces:
 *
 * 1. Every `IF(NOT(ISBLANK(LOOKUP(...AGAINST ID...))),...)` branch is a dead pointer — it can
 *    only resolve non-blank if some OTHER row's `AGAINST ID` already points back at [ID'S] of
 *    the SKU being created, which is impossible for a brand-new row (nothing can reference an
 *    ID that doesn't exist yet). Implemented verbatim anyway (harmless no-op) — same "match the
 *    legacy formula even where it's functionally dead" instruction as `RM ref Category DD`'s
 *    own `AGAINST ID`/`Category` columns (see nextAgainstId()'s doc comment above). The real
 *    resolution always comes from each formula's `ANY(SELECT(...))` fallback branch.
 * 2. The Design-By digit does NOT come from the `PART DESGIN BY` reference table the earlier
 *    approximation assumed — it comes from the shared `Alphabet` tab's `MAKED BY`/`MAKED CODE`
 *    columns (the same tab `nextCode()` above already reads for the running-letter sequence),
 *    matched against the SKU's own `MAKE BY` field (e.g. "ADC"/"SUPPLIER"). `PART DESGIN BY`
 *    is very likely a dead, unused leftover reference table — left alone/untouched, just no
 *    longer read by this function.
 * 3. The Paint lookup's real branch matches `[_THISROW].[Paint]` against `RM ref Paint`'s
 *    `Unique ID` column (its fallback `ANY(SELECT(...))` branch) — the live app's `Paint` field
 *    stores the ref's row ID, not its description text, so the formula's own FIRST branch
 *    (matching against `Paint Description`) is dead there too. This codebase's own RM SKU form
 *    is built the other way around — its `Paint` field holds the picked `Paint Description`
 *    text directly (see the taxonomy admin's plain `SearchableSelect`, no hidden ref-id
 *    concept) — so for THIS implementation the description-match branch is the one that
 *    actually resolves, and the `Unique ID` branch is checked second as a genuine fallback
 *    (harmless either way, matches the formula's own two-branch shape).
 * 4. The running 3-digit count's `_ROWNUMBER>=[_THISROW].[_ROWNUMBER]` condition is themselves
 *    ambiguous outside a live AppSheet runtime — `_ROWNUMBER` for the row being ADDED isn't a
 *    stable, queryable value the way it is for already-committed rows, so this couldn't be
 *    replicated byte-for-byte against a Sheets-API backend even in principle. Kept as the
 *    already-VERIFIED-against-714-real-rows behavior from the earlier approximation instead:
 *    count of existing rows sharing the same 4-letter Category+Sub-Category prefix, 0-indexed,
 *    ascending — confirmed to match all 714 real `Raw Material SKU` rows' actual `PART NO.`
 *    values when this was first reverse-engineered (see NPD/CONTEXT.md's Sprint 7 notes). This
 *    is the one deliberate deviation from the literal formula text above, and it's a deviation
 *    from something unverifiable, not a guess replacing something known.
 *
 * All lookup tables are edited via the generic taxonomy admin (Backend/src/routes/npd/
 * taxonomy.ts's `rm-category`/`rm-category-dd`/`rm-paint` entries, plus the shared `Alphabet`
 * tab) — this service only does the lookups + the counter + the concatenation.
 */

export class RmPartCodeLookupError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "RmPartCodeLookupError";
  }
}

/** Part A/B of the formula: the Category/Sub-Category CODE for a NEW row being created.
 * `id` is the new row's own `ID'S` — passed through only so the formula's dead `AGAINST ID`
 * branch can be included verbatim (see this file's module doc comment, finding #1); it never
 * actually resolves for a row that doesn't exist yet, so this always falls through to the real
 * `ANY(SELECT(...))` branch below. */
async function categoryCodeForNewRow(id: string, category: string): Promise<string> {
  const rows = await readTable(env.sheets.npd, RM_CATEGORY_TAB, { refresh: true });
  const dead = rows.find((r) => (r["AGAINST ID"] ?? "").trim() === id);
  if (dead && (dead.CODE ?? "").trim()) return dead.CODE.trim();
  const real = rows.find((r) => (r.CATEGORY ?? "").trim().toLowerCase() === category.trim().toLowerCase());
  if (!real || !(real.CODE ?? "").trim()) {
    throw new RmPartCodeLookupError(
      "MISSING_CATEGORY_CODE",
      `No CODE found on "RM ref Category" for CATEGORY="${category}" — add it via Taxonomy admin first.`
    );
  }
  return real.CODE.trim();
}

async function subCategoryCodeForNewRow(id: string, category: string, subCategory: string): Promise<string> {
  const rows = await readTable(env.sheets.npd, RM_CATEGORY_DD_TAB, { refresh: true });
  const dead = rows.find((r) => (r["AGAINST ID"] ?? "").trim() === id);
  if (dead && (dead.CODE ?? "").trim()) return dead.CODE.trim();
  const real = rows.find(
    (r) =>
      (r.Category ?? "").trim().toLowerCase() === category.trim().toLowerCase() &&
      (r["SUB CATEGORY"] ?? "").trim().toLowerCase() === subCategory.trim().toLowerCase()
  );
  if (!real || !(real.CODE ?? "").trim()) {
    throw new RmPartCodeLookupError(
      "MISSING_SUBCATEGORY_CODE",
      `No CODE found on "RM ref Category DD" for Category="${category}" / SUB CATEGORY="${subCategory}" — add it via Taxonomy admin first.`
    );
  }
  return real.CODE.trim();
}

/** Part D: matches the real formula's own two branches (description-text match, then
 * Unique-ID match) — see finding #3 above for why the description branch is the one that
 * actually resolves against this codebase's own RM SKU form. */
async function paintCodeFor(paintValue: string): Promise<string> {
  const rows = await readTable(env.sheets.npd, RM_PAINT_TAB, { refresh: true });
  const byDescription = rows.find(
    (r) => (r["Paint Description"] ?? "").trim().toLowerCase() === paintValue.trim().toLowerCase()
  );
  if (byDescription && (byDescription.Code ?? "").trim()) return byDescription.Code.trim();
  const byUniqueId = rows.find((r) => (r["Unique ID"] ?? "").trim() === paintValue.trim());
  if (!byUniqueId || !(byUniqueId.Code ?? "").trim()) {
    throw new RmPartCodeLookupError(
      "MISSING_PAINT_CODE",
      `No Code found on "RM ref Paint" for Paint="${paintValue}" — add it via Taxonomy admin first.`
    );
  }
  return byUniqueId.Code.trim();
}

/** Part E: the Design-By digit, off the shared `Alphabet` tab's `MAKED BY`/`MAKED CODE`
 * columns — see finding #2 above for why this is `Alphabet`, not `PART DESGIN BY`. */
async function makeByDigitFor(makeBy: string): Promise<string> {
  const rows = await readTable(env.sheets.npd, RM_ALPHABET_TAB, { refresh: true });
  const row = rows.find((r) => (r["MAKED BY"] ?? "").trim().toLowerCase() === makeBy.trim().toLowerCase());
  if (!row || !(row["MAKED CODE"] ?? "").trim()) {
    throw new RmPartCodeLookupError(
      "MISSING_MAKE_BY_CODE",
      `No MAKED CODE found on "Alphabet" for MAKED BY="${makeBy}" — add it via Taxonomy admin first.`
    );
  }
  return row["MAKED CODE"].trim();
}

export interface RmPartCodeInput {
  /** The new SKU row's own `ID'S` (minted before this is called) — see finding #1 above. */
  id: string;
  category: string;
  subCategory: string;
  paint: string;
  makeBy: string;
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
    categoryCodeForNewRow(input.id, input.category),
    subCategoryCodeForNewRow(input.id, input.category, input.subCategory),
    paintCodeFor(input.paint),
    makeByDigitFor(input.makeBy),
  ]);

  const prefix = categoryCode + subCategoryCode;
  const skuRows = await readTable(env.sheets.npd, "Raw Material SKU", { refresh: true });
  const count = skuRows.filter((r) => (r["PART NO."] ?? "").startsWith(prefix)).length;
  const countStr = String(count).padStart(3, "0");

  const partCode = `${prefix}${countStr}${paintCode}${designByDigit}`;
  return { partCode, categoryCode, subCategoryCode, count: countStr, paintCode, designByDigit };
}
