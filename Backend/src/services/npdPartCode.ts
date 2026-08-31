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
