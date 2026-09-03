import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import { appendRow, deleteRows, readTable, updateRow } from "../../services/sheets.js";
import { nextPlainRandomId, nextSequentialId } from "../../services/ids.js";
import { logChange } from "../../services/npdChangelog.js";
import {
  nextCategoryCode,
  nextSubCategoryCode,
  nextAgainstId,
  nextPaintCode,
  generateRmPartCode,
  RmPartCodeLookupError,
  countCategoryDuplicates,
  countSubCategoryDuplicates,
  nextFgCategoryDdCode,
  nextFgBrandCode,
  countFgSubCategoryDuplicates,
  generateFgPartCode,
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
  /** @default "random" (nextPlainRandomId, matching every brand-new NPD taxonomy tab's real
   * live Unique ID format). `vendor-master` is the one exception: it points at an already-live
   * production sheet whose real rows are sequential `VEND-0001` IDs (confirmed live, 27+ real
   * rows) — minting a random-hex ID there would be inconsistent with every existing row, not
   * matching-the-sheet like it is everywhere else. Set `idStrategy: "sequential"` +
   * `idSequencePrefix`/`idSequencePad` for that case. */
  idStrategy?: "random" | "sequential";
  idSequencePrefix?: string;
  idSequencePad?: number;
  /** @default false. The id column is a live spreadsheet ARRAYFORMULA (e.g. vendor-master's
   * `Vendor Id`) rather than a value this app is meant to write — same trap as Sales CRR's
   * `CUSTOMER MASTER.CUST ID` (see CLAUDE.md's Known Gotchas). When true, the POST handler
   * never mints or writes the id column at all (appendRow leaves that cell blank, letting the
   * formula spill into it), then re-reads the tab to pick up whatever id the sheet actually
   * generated for the new row, mirroring masters.ts's own `CUST_ID_NOT_GENERATED` recovery. */
  idGeneratedByArrayFormula?: boolean;
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
  // Live tab renamed "RM ref Paint" → "RM ref Brand" (2 Sep 2026, confirmed live) alongside the
  // frontend's "Paint" field label becoming "Brand" — `key` stays "rm-paint" (internal API
  // contract, no reason to rename just because the display name/tab did), only `label`/`tab`
  // changed at first. A SECOND live rename followed shortly after: the tab's own "Paint
  // Description" column was also renamed to "Brand Description" (caught because it broke
  // RM SKU Form's edit-mode prefill — see npdPartCode.ts's own comment on
  // RM_PAINT_DESCRIPTION_FIELD for the full story). `requiredFields`/`fields` updated to match.
  {
    key: "rm-paint",
    label: "RM Brand",
    spreadsheetId: env.sheets.npd,
    tab: "RM ref Brand",
    idColumn: "Unique ID",
    idPrefix: "RMPAINT",
    // `Code` is auto-generated the same way as RM ref Category/Category DD's own CODE
    // columns — see nextPaintCode()'s doc comment for the real App Formula this replicates.
    requiredFields: ["Brand Description"],
    fields: ["Code", "Brand Description"],
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
  // Points at the real, already-live "ZOTO/MASTER-VENDOR" spreadsheet (27+ real rows,
  // VEND-0001... sequential IDs), shared Editor with the service account directly by the user
  // (2 Sep 2026) — NOT the empty placeholder tab this entry used to point to on `env.sheets.npd`
  // (see env.ts's `vendorMaster` doc comment). Fields/headers below are the real live headers,
  // dumped directly rather than assumed (this app's standing discipline) — `Vendor Firm Name`/
  // `Vendor Id`, not `Vendor Name`/`Vendor ID`. Only a subset of the real sheet's 26 columns are
  // exposed here (the ones a doer creating a vendor from the RM SKU Form's "+ New" flow would
  // plausibly fill); every other real column (GSTIN, Bank details, Segment, etc.) stays intact
  // on the sheet, just not surfaced through this generic form.
  // Vendor Id (column B) is an ARRAYFORMULA spilling down from row 2 —
  // =ARRAYFORMULA(IF(C2:C<>"","VEND-"&TEXT(ROW(C2:C)-1,"0000"),"")) — confirmed live, the
  // EXACT same trap as CUSTOMER MASTER's own `CUST ID` column (see CLAUDE.md's Known
  // Gotchas): writing any literal into a cell in the spill range breaks the formula and
  // blanks every other row's id. `idStrategy: "sequential"` was the WRONG fix (it would have
  // written a literal VEND-0028 straight into this column) — never mint/write this table's
  // id column; `idGeneratedByArrayFormula: true` instead leaves it untouched on append and
  // reads back whatever the sheet's own formula generated for the new row.
  {
    key: "vendor-master",
    label: "Vendor Master",
    spreadsheetId: env.sheets.vendorMaster,
    tab: "Vendor Master",
    idColumn: "Vendor Id",
    idPrefix: "VEND",
    idGeneratedByArrayFormula: true,
    requiredFields: ["Vendor Firm Name"],
    fields: ["Vendor Firm Name", "Status", "Contact Person Name", "Email", "Mobile", "Address", "Vendor GSTIN"],
    timestampField: "Date Of Joining",
    skipDuplicateCheck: true,
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
  // `CODE` is now auto-generated (`nextFgCategoryDdCode()`, same letter-increment shape as
  // every sibling ref-table CODE column) and `DUPLICACY` is a live count scoped to SEGMENT+
  // Category+SUB CATEGORY (`countFgSubCategoryDuplicates()`) — both real App Formulas the user
  // pasted directly. `SEGMENT`/`Category` stay CLIENT-SUBMITTED, never overwritten by the
  // formula's own dead AGAINST-ID-based LOOKUP branches — same fix already proven for RM ref
  // Category DD's own `Category` field earlier the same day (see npdPartCode.ts's own header
  // comment on this FG section for why).
  {
    key: "fg-category-dd",
    label: "FG Sub Category",
    spreadsheetId: env.sheets.fg,
    tab: "FG ref Category DD",
    idColumn: "Unique ID",
    idPrefix: "FGSUB",
    requiredFields: ["SEGMENT", "Category", "SUB CATEGORY"],
    fields: ["AGAINST ID", "CODE", "SUB CATEGORY", "Category", "SEGMENT", "KEY", "DUPLICACY"],
    computedFields: ["CODE", "DUPLICACY"],
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
  // Live tab renamed "FG ref Paint" → "FG ref Brand" (confirmed live, same day as RM's own
  // identical rename) — column "Paint Description" → "Brand Description" too. `Code` is now
  // auto-generated (`nextFgBrandCode()`) — see that function's own doc comment for why it's on
  // the same letter-increment shape as every sibling ref-table CODE column rather than the
  // pasted MAX(_RowNumber) formula.
  {
    key: "fg-paint",
    label: "FG Brand",
    spreadsheetId: env.sheets.fg,
    tab: "FG ref Brand",
    idColumn: "Unique ID",
    idPrefix: "FGPAINT",
    requiredFields: ["Brand Description"],
    fields: ["Code", "Brand Description"],
    computedFields: ["Code"],
    timestampField: "TIMESTAMP",
    useremailField: "USEREMAIL",
  },
  // FG SKU catalog — reuses this exact generic CRUD infra, same as every reference table
  // above. **Create was `allowCreate: false`** (new rows meant to only come from an approved
  // New Part Code Request, routes/npd/partCodeRequest.ts, per the build prompt's §5.2
  // workflow) — re-enabled on the user's direct instruction to build a real "FINAL GOOD SKU
  // Form".
  // **`PART NO.` is now server-computed via the real App Formula** (`generateFgPartCode()` —
  // the user pasted it directly) — a correction from this table's own earlier state (a plain
  // doer-typed field), added once the real formula was actually provided.
  // **`Brand`** is a NEW additive column on `FINAL GOOD SKU` (not `Paint` — the formula's own
  // `[_THISROW].[Paint]` term has no real column to write to on this live sheet, and the
  // "Paint"→"Brand" rename applies here too per the user's own explicit instruction — see
  // npdPartCode.ts's own header comment on the FG section for the full reasoning).
  // `skipDuplicateCheck` stays true — many legitimately different FG SKUs can share a Category/
  // Sub Category/Segment; only PART NO. itself is meant to be unique, and that's computed now,
  // not doer-typed, so there's nothing meaningful left to dup-check here (matches RM SKU's own
  // reasoning for the same flag).
  // `FG ID` (the id column) and `TIMESTAMP`/`USEREMAIL` stay excluded from `fields` — still
  // system-managed, never hand-edited.
  // **`FG ID` is a plain sequential integer** (1, 2, 3 … 86, confirmed live — a literal cell
  // value, not an ARRAYFORMULA the way `CUSTOMER MASTER.CUST ID`/`vendor-master.Vendor Id`
  // are), NOT random hex like RM SKU's `ID'S`. The generic taxonomy POST handler defaults to
  // `nextPlainRandomId` for every table — would have written a random hex string into a column
  // whose every existing row is a bare number, caught before this ever shipped. Uses the same
  // `idStrategy: "sequential"` escape hatch `vendor-master` uses, with an empty prefix and no
  // zero-padding (`idSequencePad: 1`) so `nextSequentialId` just returns "27", "28", … matching
  // the real existing rows exactly.
  {
    key: "fg-sku",
    label: "FG SKU Catalog",
    spreadsheetId: env.sheets.fg,
    tab: "FINAL GOOD SKU",
    idColumn: "FG ID",
    idPrefix: "FG",
    idStrategy: "sequential",
    idSequencePrefix: "",
    idSequencePad: 1,
    requiredFields: ["SEGMENT", "CATEGORY", "SUB CATEGORY", "Name"],
    fields: [
      "PART NO.",
      "Manupulation Partcode",
      "SEGMENT",
      "CATEGORY",
      "SUB CATEGORY",
      "Name",
      "STANDARD PART",
      "Brand",
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
    computedFields: ["PART NO."],
    timestampField: "TIMESTAMP",
    useremailField: "USEREMAIL",
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

// `RM ref Paint` has no `Against id`/dead-pointer column at all (confirmed live — see
// nextPaintCode()'s own doc comment), so this preview is just the CODE half of the other two.
taxonomyRouter.get("/rm-paint/preview", async (_req, res, next) => {
  try {
    const code = await nextPaintCode();
    res.json({ code });
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
    // `idGeneratedByArrayFormula` tables (vendor-master) skip this entirely — there is no id
    // to mint, the sheet's own formula generates it once the row is appended (see below).
    const id = table.idGeneratedByArrayFormula
      ? ""
      : table.idStrategy === "sequential"
        ? await nextSequentialId(
            table.spreadsheetId,
            table.tab,
            table.idColumn,
            table.idSequencePrefix ?? table.idPrefix,
            table.idSequencePad ?? 4
          )
        : await nextPlainRandomId(table.spreadsheetId, table.tab, table.idColumn);

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
    // FG mirrors of the two lines above — same shape, different spreadsheet/tabs. See
    // npdPartCode.ts's own header comment on the FG section for why `fg-category-dd` keeps
    // the client-submitted `SEGMENT`/`Category` (no dead-pointer overwrite) while `CODE` and
    // `DUPLICACY` are always computed.
    if (table.key === "fg-category-dd") {
      if (!body.CODE) body.CODE = await nextFgCategoryDdCode();
      body.DUPLICACY = await countFgSubCategoryDuplicates(
        (body.SEGMENT as string) ?? "",
        (body.Category as string) ?? "",
        (body["SUB CATEGORY"] as string) ?? ""
      );
    }
    if (table.key === "fg-paint" && !body.Code) {
      body.Code = await nextFgBrandCode();
    }
    // `AGAINST ID` on rm-category-dd is a real AppSheet App Formula column in the legacy
    // sheet — always computed, unconditionally overriding anything the client sent, matching
    // that. See nextAgainstId()'s own doc comment for why it's known to be functionally
    // meaningless in THIS backend (implemented on the user's explicit, informed instruction
    // to match the legacy formula verbatim) — kept purely for that parity, harmless either
    // way since nothing else reads it. Runs AFTER the duplicate check above, not before — see
    // that check's own comment for why.
    //
    // `Category`, unlike `AGAINST ID`, is deliberately NOT overwritten anymore — an earlier
    // pass here DID overwrite it with `categoryFromAgainstId(againstId)` (the same dead
    // pointer), matching the legacy formula's literal text too. But the real live app's own
    // `Raw Material SKU.Sub Category` ref field has its own Valid If —
    // `SELECT(RM ref Category DD[SUB CATEGORY], [_THISROW].[Category]=[Category])` — which
    // only works at all because AppSheet's client evaluates `AGAINST ID`'s MAXROW against the
    // in-progress unsaved SKU row too (a client-side runtime quirk this stateless REST
    // backend has no equivalent for: the SKU row genuinely doesn't exist yet when a doer
    // opens the nested Sub Category form). Mirroring the dead-pointer version here left every
    // new Sub Category's `Category` blank, which then broke that same Valid-If-style filter
    // on the frontend (RmSkuForm.tsx's own Sub Category options) for real — a doer's own
    // just-created Sub Category silently never appeared in the dropdown. Keeping the client-
    // submitted `Category` (the doer's own picked value, already a required field) instead
    // makes both sides actually correct, at the cost of no longer literally mirroring the
    // formula text — the formula's own behavior depends on an AppSheet-only mechanism, so
    // "mirror it exactly" and "make the feature actually work" aren't both achievable here.
    if (table.key === "rm-category-dd") {
      body["AGAINST ID"] = await nextAgainstId();
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
    // FG SKU's own PART NO. — see services/npdPartCode.ts's generateFgPartCode() doc comment.
    // Server-computed, never client-supplied. `standardPart`/`brand` are both optional/
    // best-effort per that function's own comments (neither is wired as a real ref field on
    // this form yet), so pass through whatever the client sent (possibly blank).
    if (table.key === "fg-sku") {
      const result = await generateFgPartCode({
        segment: (body.SEGMENT as string) ?? "",
        category: (body.CATEGORY as string) ?? "",
        subCategory: (body["SUB CATEGORY"] as string) ?? "",
        standardPart: (body["STANDARD PART"] as string) ?? "",
        brand: (body.Brand as string) ?? "",
      });
      body["PART NO."] = result.partCode;
    }

    // vendor-master's real live rows format their timestamp column as "DD.MM.YYYY HH:mm:ss"
    // (e.g. "02.09.2026 13:40:21"), not ISO — match the sheet's own existing convention rather
    // than mixing formats down one column.
    const now = new Date();
    const timestampValue =
      table.key === "vendor-master"
        ? `${String(now.getDate()).padStart(2, "0")}.${String(now.getMonth() + 1).padStart(2, "0")}.${now.getFullYear()} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`
        : now.toISOString();

    const record: Record<string, string> = {
      // Never write into an ARRAYFORMULA-generated id column — see idGeneratedByArrayFormula's
      // own doc comment. Leaving the key out entirely (not even `""`) matters: an empty string
      // is still "content" as far as the sheet's spill range is concerned (confirmed the hard
      // way on CUSTOMER MASTER's identical CUST ID formula — see CLAUDE.md's Known Gotchas), so
      // `appendRow` must never send this cell any value at all, blank or otherwise.
      ...(table.idGeneratedByArrayFormula ? {} : { [table.idColumn]: id }),
      [table.timestampField]: timestampValue,
      ...(table.useremailField ? { [table.useremailField]: req.user!.employeeId } : {}),
      ...body,
    };
    await appendRow(table.spreadsheetId, table.tab, record);

    if (table.idGeneratedByArrayFormula) {
      // Read back the id the sheet's own ARRAYFORMULA just generated for the row we appended
      // (it's the very last row in the tab — appendRow always writes to the next empty row) —
      // same "the write happened, now find out what id resulted" pattern as masters.ts's own
      // CUST_ID_NOT_GENERATED recovery for CUSTOMER MASTER's identical formula. Bail loudly
      // rather than returning a blank id that would silently orphan anything keyed on it.
      const afterRows = await readTable(table.spreadsheetId, table.tab, { refresh: true });
      const generatedId = (afterRows[afterRows.length - 1]?.[table.idColumn] ?? "").trim();
      if (!generatedId) {
        return res.status(500).json({
          error: {
            code: "ID_NOT_GENERATED",
            message: `Row was saved, but "${table.tab}" did not generate an id. Check that column "${table.idColumn}" still holds its ARRAYFORMULA and that no literal value was typed into it (a literal blocks the formula and blanks every id).`,
          },
        });
      }
      return res.status(201).json({ id: generatedId, ...body });
    }

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
