import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import { appendRow, deleteRows, readTable, updateRow } from "../../services/sheets.js";
import { nextSequentialId } from "../../services/ids.js";
import { logChange } from "../../services/npdChangelog.js";
import {
  nextCategoryCode,
  nextSubCategoryCode,
  nextAgainstId,
  categoryFromAgainstId,
  nextPaintCode,
  generateRmPartCode,
  RmPartCodeLookupError,
  countCategoryDuplicates,
  countSubCategoryDuplicates,
} from "../../services/npdPartCode.js";

/**
 * Sprint 1 taxonomy admin — generic CRUD over the five NPD reference tabs. Unlike Sales CRR's
 * ORDER_PUNCH/ORDER_ITEMS, these are brand-new tabs (either newly added to the live RM sheet —
 * RM ref Category/Category DD/Paint, Vendor Master, Vehicle Compatibility Master — or the
 * already-live FG ref Segment/Category/Category DD/Paint/Sub sub parts on FG_SHEET_ID), so
 * there's no legacy internal-name baggage to translate — every field here is keyed directly by
 * its real live sheet header text, read from NPD/CONTEXT.md's confirmed header dump. Keep it
 * that way (no npdMaps.ts translation layer for these simple reference tables) per this
 * project's "keep code simple, no premature abstraction" convention — only add a translation
 * map if a future header rename ever makes the direct pass-through awkward.
 */
export const taxonomyRouter = Router();

interface TaxonomyTableDef {
  /** URL segment, e.g. /npd/taxonomy/rm-category */
  key: string;
  /** Human-readable label for the frontend table picker, e.g. "RM Category". */
  label: string;
  spreadsheetId: string;
  tab: string;
  idColumn: string;
  idPrefix: string;
  /** Required field names (real sheet headers) on create. */
  requiredFields: string[];
  /** Every writable field name (real sheet headers), required + optional. */
  fields: string[];
  /** Each live tab uses different exact casing for its timestamp/useremail columns
   * (TIMESTAMP/USEREMAIL vs Timestamp/Useremail vs Timestamp-only-Title-Case), and at least
   * one (FG Sub sub parts) has no USEREMAIL column at all — confirmed by dumping real headers
   * (see NPD/CONTEXT.md). Never assume one casing/presence across tabs. */
  timestampField: string;
  useremailField?: string;
  /** @default true. FG/RM SKU catalogs set this false — per the build prompt's workflow, brand
   * new SKU rows are only meant to be created via the New Part Code Request approval flow
   * (routes/npd/partCodeRequest.ts), not this generic "+Add" form. Editing an existing row is
   * still fully supported either way. Enforced both here (hides the UI button, see
   * TaxonomyAdmin.tsx) and server-side in the POST handler below — never trust the UI alone. */
  allowCreate?: boolean;
  /** @default false. The taxonomy reference tables dup-check their one "name" field (first
   * requiredFields entry) because two identical categories/paints would be a real data error.
   * FG/RM SKU catalogs set this true — many legitimately different SKUs share the same Name
   * (e.g. "K4 6PC" ordered by several customers), so a Name-equality dup check there would
   * block valid rows, not catch mistakes. */
  skipDuplicateCheck?: boolean;
  /** Field names (subset of `fields`) whose edits get logged to the generic NPD Changelog
   * (services/npdChangelog.ts) — build-prompt §5.4's price/BOM edit audit trail. Only the FG
   * SKU catalog's price-ish fields use this; every other table's edits go through un-logged,
   * matching the build prompt's own scoping ("every price/BOM edit" — not every edit). */
  auditFields?: string[];
  /** Field names (subset of `fields`) that the POST handler always computes itself and never
   * takes from the client — `rm-category`/`rm-category-dd`'s CODE/AGAINST ID/Category, matching
   * real AppSheet App Formula columns (see npdPartCode.ts's own doc comments). The frontend
   * hides these from the CREATE form entirely (there's nothing for a doer to fill in — the
   * value is decided server-side, and for rm-category-dd's Category, showing an editable input
   * that gets silently discarded would be actively misleading). Still listed in `fields` and
   * still editable via the PUT/edit path, for a manual correction afterward. */
  computedFields?: string[];
}

const TABLES: TaxonomyTableDef[] = [
  {
    key: "rm-category",
    label: "RM Category",
    spreadsheetId: env.sheets.npd,
    tab: "RM ref Category",
    idColumn: "Unique ID",
    idPrefix: "RMCAT",
    // `CODE` (the 2-letter Category code the real RM Part Code is built from — see
    // services/npdPartCode.ts) and `Against id` were added to the live sheet to match the
    // verified legacy ADC schema (confirmed against 714 real Raw Material SKU rows). `CODE`
    // is NOT client-supplied — the real system's own AppSheet formula (pulled directly off
    // the live column, see nextCategoryCode()'s doc comment) auto-generates it as "the next
    // letter after whichever Category was most recently created," and the POST handler below
    // does the same. Still listed in `fields` (so it displays/is editable afterward if a
    // correction is ever needed) but deliberately absent from `requiredFields`.
    // `Against id` and `DUPLICACY` are also real App Formula columns (confirmed directly off
    // the live field-config screenshots) — `Against id` is the same dead-pointer formula
    // already implemented for `RM ref Category DD` (see nextAgainstId()'s doc comment;
    // reused here verbatim, not table-specific), and `DUPLICACY` is a live count of existing
    // rows whose trimmed CATEGORY matches this one's — see countCategoryDuplicates() below.
    requiredFields: ["CATEGORY"],
    fields: ["CATEGORY", "CODE", "Against id", "DUPLICACY"],
    computedFields: ["CODE", "Against id", "DUPLICACY"],
    timestampField: "TIMESTAMP",
    useremailField: "USEREMAIL",
  },
  {
    key: "rm-category-dd",
    label: "RM Sub Category",
    spreadsheetId: env.sheets.npd,
    tab: "RM ref Category DD",
    idColumn: "Unique ID",
    idPrefix: "RMSUB",
    // Live header has `Category ID`, not `KEY` (confirmed directly, headers had drifted since
    // Sprint 1's original seed — same "dump live headers before trusting an assumption"
    // discipline as everywhere else in this codebase). `CODE` is auto-generated the same way
    // as `RM ref Category.CODE` — see nextSubCategoryCode()'s own doc comment for the real
    // App Formula this replicates — so it's deliberately absent from requiredFields.
    // `Category` stays required + shown on the create form even though the POST handler
    // silently overwrites it after the duplicate check runs (see taxonomy.ts's POST handler
    // and categoryFromAgainstId()'s own doc comment) — the submitted value still matters for
    // that dup check, and hiding the field entirely would remove the only place a doer
    // expresses which Category this Sub-Category is meant to belong to, even though the real
    // legacy formula then ignores it. `CODE`/`AGAINST ID` have no such dual role — pure
    // backend-computed, nothing meaningful for a doer to type — so only those two are hidden.
    // `DUPLICACY` — confirmed on the real reference form's own field list too (it does NOT
    // show a `Category` input at all, matching the note above that it's dead there; it DOES
    // show `DUPLICACY`) — a live trimmed-name duplicate count, same shape as `RM ref
    // Category.DUPLICACY` (see countCategoryDuplicates()'s doc comment) but scoped to `SUB
    // CATEGORY` instead — see countSubCategoryDuplicates()'s own doc comment.
    requiredFields: ["Category", "SUB CATEGORY"],
    fields: ["AGAINST ID", "CODE", "SUB CATEGORY", "Category", "Category ID", "DUPLICACY"],
    computedFields: ["CODE", "AGAINST ID", "DUPLICACY"],
    timestampField: "TIMESTAMP",
    useremailField: "USEREMAIL",
  },
  {
    key: "rm-paint",
    label: "RM Paint",
    spreadsheetId: env.sheets.npd,
    tab: "RM ref Paint",
    idColumn: "Unique ID",
    idPrefix: "RMPAINT",
    // `Code` is auto-generated the same way as RM ref Category/Category DD's own CODE
    // columns — see nextPaintCode()'s doc comment for the real App Formula this replicates.
    requiredFields: ["Paint Description"],
    fields: ["Code", "Paint Description"],
    computedFields: ["Code"],
    timestampField: "TIMESTAMP",
    useremailField: "USEREMAIL",
  },
  // The 4th and final lookup table the real RM Part Code formula draws from (see
  // services/npdPartCode.ts) — CODE is a single digit (0/1), PART DESIGN BY names who
  // designed the part. Live sheet seeded with 0="ZOTO DESIGN PART", 1="SUPPLIER DESIGN PART".
  {
    key: "part-design-by",
    label: "Part Design By",
    spreadsheetId: env.sheets.npd,
    tab: "PART DESGIN BY",
    idColumn: "UNIQUE ID",
    idPrefix: "PDB",
    requiredFields: ["CODE", "PART DESIGN BY"],
    fields: ["CODE", "PART DESIGN BY"],
    timestampField: "TIMESTAMP",
    useremailField: "USEREMAIL",
  },
  {
    key: "vendor-master",
    label: "Vendor Master",
    spreadsheetId: env.sheets.npd,
    tab: "Vendor Master",
    idColumn: "Vendor ID",
    idPrefix: "VEN",
    requiredFields: ["Vendor Name"],
    fields: ["Vendor Name", "Contact No.", "Email", "GSTIN", "Address"],
    timestampField: "TIMESTAMP",
    useremailField: "USEREMAIL",
  },
  {
    key: "vehicle-compatibility",
    label: "Vehicle Compatibility",
    spreadsheetId: env.sheets.npd,
    tab: "Vehicle Compatibility Master",
    idColumn: "Unique ID",
    idPrefix: "VEH",
    requiredFields: ["Vehicle Make", "Vehicle Model"],
    fields: ["Vehicle Make", "Vehicle Model", "Model Year / Variant", "Body Type", "Related FINAL GOOD SKUs"],
    timestampField: "TIMESTAMP",
    useremailField: "USEREMAIL",
  },
  // Live on FG_SHEET_ID — the shared Sales CRR goods-master sheet. Additive-only: these routes
  // only ever add/edit rows on tabs that already exist there, never touch FINAL GOOD SKU itself
  // or any column masters.ts depends on.
  {
    key: "fg-segment",
    label: "FG Segment",
    spreadsheetId: env.sheets.fg,
    tab: "FG ref Segment",
    idColumn: "Unique ID",
    idPrefix: "FGSEG",
    requiredFields: ["SEGMENT"],
    fields: ["SEGMENT"],
    timestampField: "TIMESTAMP",
    useremailField: "USEREMAIL",
  },
  {
    key: "fg-category",
    label: "FG Category",
    spreadsheetId: env.sheets.fg,
    tab: "FG ref Category",
    idColumn: "Unique ID",
    idPrefix: "FGCAT",
    requiredFields: ["CATEGORY"],
    fields: ["Against id", "CATEGORY"],
    timestampField: "TIMESTAMP",
    useremailField: "USEREMAIL",
  },
  {
    key: "fg-category-dd",
    label: "FG Sub Category",
    spreadsheetId: env.sheets.fg,
    tab: "FG ref Category DD",
    idColumn: "Unique ID",
    idPrefix: "FGSUB",
    requiredFields: ["Category", "SUB CATEGORY"],
    fields: ["AGAINST ID", "CODE", "SUB CATEGORY", "Category", "SEGMENT", "KEY"],
    timestampField: "TIMESTAMP",
    useremailField: "USEREMAIL",
  },
  {
    // NOTE: live header is "Timestamp" (Title Case) here, unlike every sibling FG ref tab
    // above which uses "TIMESTAMP" — confirmed by dumping real headers, don't "fix" this to
    // match the others.
    key: "fg-sub-sub-parts",
    label: "FG Sub Sub Parts",
    spreadsheetId: env.sheets.fg,
    tab: "FG Sub sub parts",
    idColumn: "Unique ID",
    idPrefix: "FGSSP",
    requiredFields: ["SEGMENT", "Category", "SUB CATEGORY"],
    fields: ["AGAINST ID", "SEGMENT", "Category", "SUB CATEGORY", "STANDARD", "KEY", "CODE"],
    timestampField: "Timestamp",
    // No USEREMAIL column on this tab — see the interface's own doc comment above.
  },
  {
    key: "fg-paint",
    label: "FG Paint",
    spreadsheetId: env.sheets.fg,
    tab: "FG ref Paint",
    idColumn: "Unique ID",
    idPrefix: "FGPAINT",
    requiredFields: ["Code", "Paint Description"],
    fields: ["Code", "Paint Description"],
    timestampField: "TIMESTAMP",
    useremailField: "USEREMAIL",
  },
  // FG & RM SKU catalogs (Sprint 2) — reuse this exact generic CRUD infra rather than a
  // separate router, since editing is identical to every reference table above. Create is
  // disabled (allowCreate: false): new SKU rows come only from an approved New Part Code
  // Request (routes/npd/partCodeRequest.ts), matching the build prompt's §5.2 workflow.
  // `FG ID`/`ID'S` (the id columns) and `TIMESTAMP`/`USEREMAIL` are deliberately excluded from
  // `fields` — they're system-managed, never hand-edited.
  {
    key: "fg-sku",
    label: "FG SKU Catalog",
    spreadsheetId: env.sheets.fg,
    tab: "FINAL GOOD SKU",
    idColumn: "FG ID",
    idPrefix: "FG",
    requiredFields: [],
    fields: [
      "PART NO.",
      "Manupulation Partcode",
      "SEGMENT",
      "CATEGORY",
      "SUB CATEGORY",
      "Name",
      "STANDARD PART",
      "MIN STOCK",
      "MAX STOCK",
      "OPENING STOCK",
      "UNIT",
      "Year",
      "Discount",
      "price",
      "DUPLICACY",
      "Final Price",
    ],
    timestampField: "TIMESTAMP",
    useremailField: "USEREMAIL",
    allowCreate: false,
    skipDuplicateCheck: true,
    auditFields: ["Discount", "price", "Final Price"],
  },
  // Create is now enabled — the real "Raw Material SKU Form" (Frontend/src/npd/RmSkuForm.tsx),
  // matching the legacy reference screen field-for-field. `PART NO.` is server-computed via
  // the real verified App Formula (services/npdPartCode.ts's generateRmPartCode()) — see the
  // POST handler below — never client-supplied, hence `computedFields`. `skipDuplicateCheck`
  // stays true: many legitimately different SKUs share the same Category/Sub Category/Vendor/
  // Paint/Make By (only the generated PART NO. is meant to be unique, and that's computed, not
  // user input, so there's nothing meaningful to dup-check here).
  {
    key: "rm-sku",
    label: "RM SKU Catalog",
    spreadsheetId: env.sheets.npd,
    tab: "Raw Material SKU",
    idColumn: "ID'S",
    idPrefix: "RM",
    requiredFields: ["Category", "Sub Category", "VENDOR NAME", "Paint", "MAKE BY"],
    fields: ["PART NO.", "Category", "Sub Category", "Paint", "MAKE BY", "VENDOR NAME", "IQC PDF UPDATE LAST", "TrF tO Master Rm"],
    computedFields: ["PART NO."],
    timestampField: "TIMESTAMP",
    useremailField: "USEREMAIL",
    skipDuplicateCheck: true,
  },
  // Published customer master (Sprint 5, build-prompt §5.5) — reuses this same generic infra
  // for the same reason fg-sku/rm-sku do: editing an existing published customer is identical
  // to editing any other reference row. Create is disabled — new rows only come from an
  // approved Customer KYC (routes/npd/customer.ts), matching the draft (New Raise Request /
  // Customer KYC) -> published (this tab) distinction the build prompt describes explicitly.
  {
    key: "customer-master-v2",
    label: "Customer Master",
    spreadsheetId: env.sheets.npd,
    tab: "CUSTOMER MASTER V2",
    idColumn: "Customer ID",
    idPrefix: "CUST",
    requiredFields: [],
    fields: [
      "Customer Name",
      "Customer Status",
      "GSTIN",
      "PAN",
      "Contact No.",
      "Email",
      "Credit Days",
      "Grace Period",
      "TDS TCS Applicable",
      "Sales Representative Name",
    ],
    timestampField: "Timestamp",
    useremailField: "Useremail",
    allowCreate: false,
    skipDuplicateCheck: true,
  },
  // WIP MASTER (Sprint 6, build-prompt §5.6/§6): tracks a Raw Material through its
  // production stages (Raw Material -> Sub-Assembly -> Finished Unit, for ZOTO's actual
  // LED/ambient-lighting assembly process — the workbook's own ingot->casted->machined
  // staging was 2-wheeler die-casting specific, not applicable here, see Appendix A's
  // exclusion rationale). Multiple rows per RM ID are expected as it advances stages.
  {
    key: "wip-master",
    label: "WIP Master",
    spreadsheetId: env.sheets.npd,
    tab: "WIP MASTER",
    idColumn: "WIP ID",
    idPrefix: "WIP",
    requiredFields: ["RM ID", "Stage"],
    fields: ["RM ID", "RM Code", "Stage", "Quantity", "Status", "Remarks"],
    timestampField: "Timestamp",
    useremailField: "Useremail",
    skipDuplicateCheck: true,
  },
  // The 6 new ZOTO item-spec tables (build-prompt §15/Appendix A — replace the old app's
  // 2-wheeler die-casting dimension tables, not applicable to ZOTO's product line). Each is a
  // detail record against one RM SKU (`Against ID` = RM ID). Field sets here are this app's
  // own reasonable starting point, NOT transcribed from a live ZOTO spec sheet (unlike every
  // other table in this app, no such source existed to dump — only `LED Light Specifications`
  // had a real header dump available, from the original xlsx workbook read during initial
  // planning; the other 5 categories' fields are invented, plausible-for-the-category
  // placeholders). Treat these as an editable starting schema, not a verified one — ask ZOTO's
  // NPD/Quality team to confirm or correct the field list per category before relying on it
  // for real spec sheets.
  {
    key: "led-specs",
    label: "LED Light Specifications",
    spreadsheetId: env.sheets.npd,
    tab: "LED Light Specifications",
    idColumn: "Spec ID",
    idPrefix: "LEDSPEC",
    requiredFields: ["Against ID"],
    fields: ["Against ID", "Model / Fitment", "Bulb Base Type", "Wattage", "Lumens", "Color Temperature (K)", "Voltage", "IP Rating", "Warranty (Months)", "Brand"],
    timestampField: "Timestamp",
    useremailField: "Useremail",
    skipDuplicateCheck: true,
  },
  {
    key: "ambient-specs",
    label: "Ambient Light Specifications",
    spreadsheetId: env.sheets.npd,
    tab: "Ambient Light Specifications",
    idColumn: "Spec ID",
    idPrefix: "AMBSPEC",
    requiredFields: ["Against ID"],
    fields: ["Against ID", "Model / Fitment", "No. of LEDs", "Wattage", "Color Options", "Voltage", "Wire Length (M)", "IP Rating", "Warranty (Months)", "Brand"],
    timestampField: "Timestamp",
    useremailField: "Useremail",
    skipDuplicateCheck: true,
  },
  {
    key: "projector-specs",
    label: "Projector Light Specifications",
    spreadsheetId: env.sheets.npd,
    tab: "Projector Light Specifications",
    idColumn: "Spec ID",
    idPrefix: "PRJSPEC",
    requiredFields: ["Against ID"],
    fields: ["Against ID", "Model / Fitment", "Lens Size (Inch)", "Wattage", "Lumens", "Color Temperature (K)", "Beam Pattern", "Voltage", "Warranty (Months)", "Brand"],
    timestampField: "Timestamp",
    useremailField: "Useremail",
    skipDuplicateCheck: true,
  },
  {
    key: "android-specs",
    label: "Android Infotainment Specifications",
    spreadsheetId: env.sheets.npd,
    tab: "Android Infotainment Specifications",
    idColumn: "Spec ID",
    idPrefix: "ANDSPEC",
    requiredFields: ["Against ID"],
    fields: ["Against ID", "Model / Fitment", "Screen Size (Inch)", "RAM", "Storage", "Android Version", "Processor", "Connectivity", "Warranty (Months)", "Brand"],
    timestampField: "Timestamp",
    useremailField: "Useremail",
    skipDuplicateCheck: true,
  },
  {
    key: "perfume-specs",
    label: "Car Perfume Specifications",
    spreadsheetId: env.sheets.npd,
    tab: "Car Perfume Specifications",
    idColumn: "Spec ID",
    idPrefix: "PERSPEC",
    requiredFields: ["Against ID"],
    fields: ["Against ID", "Model / Fitment", "Fragrance", "Volume (ML)", "Refill Type", "Warranty (Months)", "Brand"],
    timestampField: "Timestamp",
    useremailField: "Useremail",
    skipDuplicateCheck: true,
  },
  {
    key: "electrical-specs",
    label: "Electrical Accessory Specifications",
    spreadsheetId: env.sheets.npd,
    tab: "Electrical Accessory Specifications",
    idColumn: "Spec ID",
    idPrefix: "ELESPEC",
    requiredFields: ["Against ID"],
    fields: ["Against ID", "Model / Fitment", "Voltage", "Current Rating (A)", "Connector Type", "Material", "Warranty (Months)", "Brand"],
    timestampField: "Timestamp",
    useremailField: "Useremail",
    skipDuplicateCheck: true,
  },
];

/** Exported so partCodeRequest.ts/customer.ts can append an approved request's row into the
 * right catalog tab without duplicating each table's spreadsheetId/tab/idColumn/idPrefix/
 * timestamp/useremail field names — single source of truth stays this TABLES array. */
export function getCatalogTable(key: "fg-sku" | "rm-sku" | "customer-master-v2"): TaxonomyTableDef {
  const table = TABLES.find((t) => t.key === key);
  if (!table) throw new Error(`Unknown catalog table: ${key}`);
  return table;
}

function findTable(key: string): TaxonomyTableDef | undefined {
  return TABLES.find((t) => t.key === key);
}

taxonomyRouter.get("/", async (_req, res) => {
  res.json({
    tables: TABLES.map((t) => ({
      key: t.key,
      label: t.label,
      idColumn: t.idColumn,
      fields: t.fields,
      requiredFields: t.requiredFields,
      allowCreate: t.allowCreate ?? true,
      computedFields: t.computedFields ?? [],
    })),
  });
});

// Read-only preview of what CODE/Against id `POST /rm-category` would actually generate,
// without writing anything — lets `RmCategoryForm.tsx` show the doer a real live value
// instead of a "Generated on Save" placeholder before they've saved. Pure reads of the same
// nextCategoryCode()/nextAgainstId() helpers the real POST handler uses; registered before
// the generic "/:key" route below isn't actually necessary (different segment count so
// Express can't confuse the two), but kept adjacent to it for discoverability.
taxonomyRouter.get("/rm-category/preview", async (_req, res, next) => {
  try {
    const [code, againstId] = await Promise.all([nextCategoryCode(), nextAgainstId()]);
    res.json({ code, againstId });
  } catch (err) {
    next(err);
  }
});

// Same idea, scoped to `RM ref Category DD` — see the endpoint above's own comment.
taxonomyRouter.get("/rm-category-dd/preview", async (_req, res, next) => {
  try {
    const [code, againstId] = await Promise.all([nextSubCategoryCode(), nextAgainstId()]);
    res.json({ code, againstId });
  } catch (err) {
    next(err);
  }
});

taxonomyRouter.get("/:key", async (req, res, next) => {
  try {
    const table = findTable(req.params.key);
    if (!table) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Unknown taxonomy table" } });
    const rows = await readTable(table.spreadsheetId, table.tab);
    res.json({ rows });
  } catch (err) {
    next(err);
  }
});

taxonomyRouter.post("/:key", async (req, res, next) => {
  try {
    const table = findTable(req.params.key);
    if (!table) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Unknown taxonomy table" } });
    if (table.allowCreate === false) {
      return res.status(403).json({
        error: { code: "CREATE_DISABLED", message: "New rows here come only from an approved Part Code Request" },
      });
    }

    const shape: Record<string, z.ZodTypeAny> = {};
    for (const f of table.fields) shape[f] = z.string().trim().optional();
    for (const f of table.requiredFields) shape[f] = z.string().trim().min(1);
    const body = z.object(shape).parse(req.body);

    // Minted up front (not after the CODE/PART NO. computations below, as it originally was)
    // because rm-sku's PART NO. formula needs this row's own ID'S as an input (see
    // generateRmPartCode()'s doc comment, finding #1) — every other table just ignores it
    // being available a little earlier, so this is safe to hoist unconditionally.
    const id = await nextSequentialId(table.spreadsheetId, table.tab, table.idColumn, table.idPrefix);

    // Duplicate detection — server-side, the real gate, matching this project's convention
    // (Sales CRR's customer-assignment gate, part-code duplicate check, etc.). Case-insensitive
    // match on ALL required fields together, not just the first one — a table like
    // "RM ref Category DD" requires both Category AND Sub Category, and Category alone
    // legitimately repeats across many different sub-categories, so checking only the first
    // required field would 409 every legitimate second sub-category under the same category
    // (a real bug caught during Sprint 2 verification: creating "LED Modules & Drivers" / "Driver
    // ICs" was rejected as a duplicate of the *category* "LED Modules & Drivers" / "COB LED
    // Chips" row, even though the actual Category+Sub Category combination was unique). Skipped
    // entirely for tables that legitimately allow repeated names (skipDuplicateCheck).
    //
    // Deliberately runs BEFORE the CODE/AGAINST ID/Category auto-generation below — those
    // overwrite `body.Category` with a computed (and, for rm-category-dd, functionally
    // meaningless — see categoryFromAgainstId()'s own doc comment) value, so checking against
    // the CLIENT'S submitted Category here, before it gets clobbered, is what makes this dup
    // check mean anything at all for this table.
    if (!table.skipDuplicateCheck && table.requiredFields.length > 0) {
      const existing = await readTable(table.spreadsheetId, table.tab, { refresh: true });
      const dup = existing.some((r) =>
        table.requiredFields.every(
          (f) => (r[f] ?? "").trim().toLowerCase() === (body[f] as string).trim().toLowerCase()
        )
      );
      if (dup) {
        return res.status(409).json({
          error: { code: "DUPLICATE", message: `${table.requiredFields.join(" + ")} combination already exists` },
        });
      }
    }

    // `RM ref Category.CODE` / `RM ref Category DD.CODE` are both auto-generated, matching the
    // real AppSheet App Formulas pulled directly off the live columns — see nextCategoryCode()/
    // nextSubCategoryCode()'s own doc comments for the decoded formulas. Only auto-fills when
    // the caller didn't already supply one (e.g. a manual correction via edit), so this never
    // silently overwrites an intentional override.
    if (table.key === "rm-category" && !body.CODE) {
      body.CODE = await nextCategoryCode();
    }
    // `Against id` (the same dead-pointer formula as rm-category-dd's own `AGAINST ID`, just
    // this table's own differently-cased column name) and `DUPLICACY` (a live duplicate-name
    // count, see countCategoryDuplicates()'s doc comment) — both real App Formula columns,
    // always computed, never client-supplied.
    if (table.key === "rm-category") {
      body["Against id"] = await nextAgainstId();
      body.DUPLICACY = await countCategoryDuplicates((body.CATEGORY as string) ?? "");
    }
    if (table.key === "rm-category-dd" && !body.CODE) {
      body.CODE = await nextSubCategoryCode();
    }
    if (table.key === "rm-paint" && !body.Code) {
      body.Code = await nextPaintCode();
    }
    // `AGAINST ID`/`Category` on rm-category-dd are real AppSheet App Formula columns in the
    // legacy sheet, meaning they were never client-editable there either — always computed,
    // unconditionally overriding anything the client sent, matching that. See
    // nextAgainstId()/categoryFromAgainstId()'s own doc comments for why these are known to be
    // functionally meaningless (implemented on the user's explicit, informed instruction to
    // match the legacy formulas verbatim, not because they're believed to be useful). Runs
    // AFTER the duplicate check above, not before — see that check's own comment for why.
    if (table.key === "rm-category-dd") {
      const againstId = await nextAgainstId();
      body["AGAINST ID"] = againstId;
      body.Category = await categoryFromAgainstId(againstId);
      body.DUPLICACY = await countSubCategoryDuplicates((body["SUB CATEGORY"] as string) ?? "");
    }
    // `PART NO.` — the real, verified App Formula (see services/npdPartCode.ts's
    // generateRmPartCode() doc comment). Server-computed, never client-supplied.
    if (table.key === "rm-sku") {
      const result = await generateRmPartCode({
        id,
        category: (body.Category as string) ?? "",
        subCategory: (body["Sub Category"] as string) ?? "",
        paint: (body.Paint as string) ?? "",
        makeBy: (body["MAKE BY"] as string) ?? "",
      });
      body["PART NO."] = result.partCode;
    }

    const record: Record<string, string> = {
      [table.idColumn]: id,
      [table.timestampField]: new Date().toISOString(),
      ...(table.useremailField ? { [table.useremailField]: req.user!.employeeId } : {}),
      ...body,
    };
    await appendRow(table.spreadsheetId, table.tab, record);
    res.status(201).json({ id, ...body });
  } catch (err) {
    // A missing-CODE lookup failure (e.g. rm-sku's Category/Sub Category/Paint/Make By don't
    // resolve to a CODE yet — see generateRmPartCode()'s own doc comment) is a real, actionable
    // 422, not an unexpected server error — surface its actual message instead of letting the
    // generic error handler mask it as "Something went wrong" (see CLAUDE.md's errorHandler note).
    if (err instanceof RmPartCodeLookupError) {
      return res.status(422).json({ error: { code: err.code, message: err.message } });
    }
    next(err);
  }
});

taxonomyRouter.put("/:key/:id", async (req, res, next) => {
  try {
    const table = findTable(req.params.key);
    if (!table) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Unknown taxonomy table" } });

    const shape: Record<string, z.ZodTypeAny> = {};
    for (const f of table.fields) shape[f] = z.string().trim().optional();
    const body = z.object(shape).partial().parse(req.body);

    // Log every audited field that's actually changing, BEFORE writing — same "log then
    // advance" ordering this codebase uses elsewhere for audit trails (see CLAUDE.md's
    // discount-log note), so a failed changelog write leaves the row unmodified rather than
    // silently advancing with no audit trail.
    if (table.auditFields?.length) {
      const existing = await readTable(table.spreadsheetId, table.tab, { refresh: true });
      const row = existing.find((r) => r[table.idColumn] === req.params.id);
      for (const field of table.auditFields) {
        if (!(field in body)) continue;
        const oldValue = row?.[field] ?? "";
        const newValue = (body[field] as string) ?? "";
        if (oldValue === newValue) continue;
        await logChange({
          entity: table.key,
          entityId: req.params.id,
          field,
          oldValue,
          newValue,
          employeeId: req.user!.employeeId,
        });
      }
    }

    await updateRow(table.spreadsheetId, table.tab, table.idColumn, req.params.id, body);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

taxonomyRouter.delete("/:key/:id", async (req, res, next) => {
  try {
    const table = findTable(req.params.key);
    if (!table) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Unknown taxonomy table" } });
    const count = await deleteRows(table.spreadsheetId, table.tab, table.idColumn, [req.params.id]);
    res.json({ deleted: count });
  } catch (err) {
    next(err);
  }
});
