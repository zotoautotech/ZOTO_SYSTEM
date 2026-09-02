# IMS Google Sheets — header spec (mined from ims-adc-share-main)

Source priority used throughout: (1) `docs/*.md` hand-verified live-header dumps,
(2) `lib/mirror.ts`'s `TAB_HEADERS` (exact column arrays, verified live 2026-07-11
through 2026-07-16 per its own comments), (3) `app/api/*/route.ts` literal
append-row arrays / field references, (4) `app/api/sync/route.ts`'s per-tab sync
functions (field names referenced — confirms existence/spelling, NOT always
exact left-to-right order), (5) `supabase/schema.sql` as a last-resort type/
existence cross-check only.

Confidence key used in each section header:
- **VERIFIED** — exact column order pinned down (docs live-header dump, or
  `mirror.ts` TAB_HEADERS, or an explicit append-row array).
- **PARTIAL** — every column name is real (seen in sync/route.ts field
  references or route code), but left-to-right order is not independently
  confirmed beyond a few anchor columns.
- **PROPOSED** — no concrete source at all; header set invented from a sibling
  tab's real shape, explicitly not to be trusted as-is.

---

## Resolved ambiguities

### Area 3 — `IMS_SHEET_SALE_ID` (resolved before this task, restated for completeness)
The reference project's Sales tabs (`Order Punch Initial`, `SO Confirmation`,
`Tax_Invoice`, `Pre Transport`, `Transport_Products`, etc.) are demo/stub data
in `ims-adc-share-main` — the real, live equivalents are Sales CRR's own
`ORDER_PUNCH`/`SALE_ORDERS`/`SO_Confirmation`/`Dispatch Items Approval`/`PDI`/
`TRANSPORT`/`Transport_Products` tabs already running in ZOTO SYSTEM's
`ZOTO_TRANSACTIONS_SHEET_ID` and `TRANSPORT_SHEET_ID`. **No new spreadsheet is
created for area 3** — IMS reads/writes those existing sheets directly. Not
covered further in this document.

### Area 7 — `IMS_SHEET_MASTER_FG_ID` vs existing `FG_SHEET_ID`
**Decision: create as a genuinely NEW, separate spreadsheet — do not reuse
`FG_SHEET_ID`'s `FINAL GOOD SKU` tab.**

ZOTO SYSTEM's existing `FG_SHEET_ID` → `FINAL GOOD SKU` tab (per
`Backend/src/routes/masters.ts`) has exactly 9 columns: `TIMESTAMP`,
`USEREMAIL`, `FG ID`, `PART NO.`, `SEGMENT`, `CATEGORY`, `Name`, `UNIT`,
`price` — a lean SKU-lookup table for Sales CRR's item picker.

The reference project's IMS master FG tab (`MASTER OF FG INVENTORY`, synced by
`syncMasterFgInventory()` in `app/api/sync/route.ts`) is a materially richer,
inventory-focused table with 26 real columns (stock thresholds, discount,
final price, warehouse-transfer flag, etc. — see item 7 below) plus several
sheet-side computed/virtual columns (`Monthly Stock In/Out`, `Adjust FG`,
`Verified FG Stock`, `Inhouse Stock Issue`, `Assembled Parts`) that the app
explicitly does NOT write to (`sheetRowToSnake` overrides them to `undefined`
before upsert — they're formula/rollup columns on the live sheet, not
plain data). This is a distinct schema serving a distinct purpose (IMS
inventory tracking vs. Sales CRR SKU lookup), not a duplicate of the same
data — hence a new spreadsheet/tab, `MASTER OF FG INVENTORY`, in
`IMS_SHEET_MASTER_FG_ID`. `FG_SHEET_ID`'s `FINAL GOOD SKU` is left completely
untouched; IMS does not read or write it.

*Separately, note there is ALSO a distinct `FINAL GOOD SKU` tab name reused
inside `IMS_SHEET_RM_WIP_ID`'s sync source (`sheetName: 'FINAL GOOD SKU'`,
line 135 of `sync/route.ts`, synced into `ims_final_good_sku` — the FG-side
counterpart of `WIP MASTER`/`Raw Material SKU`) — this is the reference app's
own SKU master feeding line-planning/assembly (`Part ID` picker in
`docs/line-planning.md`), separate again from both of the above. Since the
plan's item 2 (`IMS_SHEET_RM_WIP_ID`) only calls out `WIP MASTER`/`WIP
ATTACHMENT PARTCODE`/`WIP Image`/`ASSEMBLE RM FG`, and item 7 already covers
an FG master, this reference-app "FINAL GOOD SKU" (id_s/old_part_code/part_no/
part_name/segment/category/sub_category/paint/standard_part/customer_name/
description/status/machining_other_cost — used by Line Planning's Part ID
picker) is effectively the SAME data area as item 7's `MASTER OF FG INVENTORY`
(both are the FG SKU master, just synced via two differently-named source
tabs in the reference's own two-sheet split). Recommend `IMS_SHEET_MASTER_FG_ID`
→ `MASTER OF FG INVENTORY` (the richer, inventory-column-bearing shape) be the
ONE canonical FG SKU master in the new system, and Line Planning's Part ID
picker (item 5) reads from it — do not create a second FG master tab for it.**

---

## 1. `IMS_SHEET_STOCK_ID`

### Stock Record FG — VERIFIED (25 cols, `mirror.ts` + `docs/record-entry-fg-form-spec.md`)

| # | Header | Auto/Manual | Notes |
|---|---|---|---|
| 1 | Timestamp | Auto | `=NOW()`, IST |
| 2 | Useremail | Auto | logged-in user |
| 3 | Record ID | Auto | `RECD-<8 hex>` |
| 4 | Batch ID | Auto (override) | `BTCH-<8 hex>`; Warehouse-FG-In flow overrides to the Production ID; RM tab's Stock Release override writes requisition id(s) here instead |
| 5 | Record Details | — | blank section-header column |
| 6 | Type | Manual | `IN`/`OUT`/`TRANSFER`, required, no default |
| 7 | From | Manual | Rack No.; required for OUT/TRANSFER |
| 8 | To | Manual | Rack No.; required for IN/TRANSFER |
| 9 | Quantity | Manual | 5dp decimal; OUT validated against rack balance (SUM IN−OUT for that Old Part No in that rack) |
| 10 | Unit | Manual | from UNITS master, allow-other |
| 11 | Description | Manual | required for IN/OUT; blank on TRANSFER marker row |
| 12 | Signature | Manual | drawn PNG → Drive, path in cell; required |
| 13 | Part Details | — | blank section-header column |
| 14 | Part | Auto | fixed `"FG"` |
| 15 | Old Part No | Manual | required if Part No blank |
| 16 | Part No | Manual/lookup | |
| 17 | Segment | Manual/lookup | full FG-master list, not narrowed by Category |
| 18 | Category | Manual/lookup | full list |
| 19 | Sub Category | Manual/lookup | full list |
| 20 | Standard Part | Manual | free enum, values sourced from existing column data (only `"FINISHED"` seen live) |
| 21 | Attachment | Manual (optional) | omitted in rebuilt web form; see separate `Attachment FG In-Out` child tab |
| 22 | DATE | Auto | `=DATE(NOW())` |
| 23 | Year | Auto | |
| 24 | Month | Auto | |
| 25 | Month Name | Auto | |

TRANSFER writes 3 rows in one call: the marker (Type=TRANSFER) + a companion
IN row + companion OUT row (own Record ID/Batch ID each) — replicates the old
AppSheet "Transfer data bot" since bots don't fire on direct API writes.

### Stock Record RM — VERIFIED (28 cols, `mirror.ts` + `docs/record-entry-rm-form-spec.md`)

| # | Header | Auto/Manual | Notes |
|---|---|---|---|
| 1 | Timestamp | Auto | |
| 2 | Useremail | Auto | |
| 3 | Record ID | Auto | `RECD-<8 hex>` |
| 4 | Record Details | — | blank |
| 5 | Type | Manual | IN/OUT/TRANSFER |
| 6 | From | Manual | rack; OUT/TRANSFER |
| 7 | Entry Type | Manual | `Opening Stock`/`For Production`/`Store Rejection`, optional |
| 8 | To | Manual | rack; IN/TRANSFER |
| 9 | Quantity | Manual | OUT validated against **part's total balance** (not rack-scoped) |
| 10 | Unit | Manual/lookup | initial from master by Old Part Code |
| 11 | Reason | — | blank; purchase-flow only |
| 12 | Reference No. | — | blank; purchase-flow only |
| 13 | Reference Attachment | — | blank; purchase-flow only |
| 14 | Description | Manual | required IN/OUT |
| 15 | Signature | Manual | required |
| 16 | Vendor Name | — | blank; purchase-flow only |
| 17 | Part Details | — | blank |
| 18 | Part | Auto | fixed `"RM"` |
| 19 | Batch ID | Auto (override) | `BTCH-<8 hex>`; Stock Release writes requisition id(s) here |
| 20 | Old Part Code | Manual | required if Part Code blank |
| 21 | Part Code | Manual | required if Old Part Code blank |
| 22 | Part Name | Auto/lookup | from MASTER RM OR OTHER |
| 23 | Category | Auto/lookup | `"RAW MATERIAL"` for every RM part |
| 24 | Specification PDF | — | blank; purchase-flow only |
| 25 | DATE | Auto | |
| 26 | Year | Auto | |
| 27 | Month | Auto | |
| 28 | Month Name | Auto | |

### Stock Record WIP — VERIFIED (27 cols, `mirror.ts` + `docs/record-entry-wip-form-spec.md`)

| # | Header | Auto/Manual | Notes |
|---|---|---|---|
| 1 | Timestamp | Auto | |
| 2 | Useremail | Auto | |
| 3 | Record ID | Auto | `RECD-<8 hex>` |
| 4 | Record Details | — | blank |
| 5 | Type | Manual | IN/OUT/TRANSFER |
| 6 | From | Manual | **Ground Lane racks only**; OUT/TRANSFER |
| 7 | To | Manual | Ground Lane racks only; IN/TRANSFER |
| 8 | Entry Type | Manual | `For Assembly`/`For Production`/`Transfer`, initial `For Production` |
| 9 | Quantity | Manual | **no OUT balance rule**; IN with Batch Code capped at that batch's Casted Quantity minus already-recorded qty |
| 10 | Unit | Manual | initial `"PCS"` |
| 11 | WIP Part Weight (in grams) | Manual | required only on the batch's first entry (no existing weight yet) |
| 12 | WIP Part Weigth Image | Manual (optional) | *(sic — misspelled live)* |
| 13 | Description | Manual | always visible/required on WIP |
| 14 | Signature | Manual | required |
| 15 | Part Details | — | blank |
| 16 | Part | Auto | fixed `"WIP"` |
| 17 | Batch Code | Manual | required when Type=IN + Entry Type=`For Production` + Part Code set |
| 18 | Old Part Code | Manual | required if Part Code blank |
| 19 | Part Code | Manual | required if Old Part Code blank |
| 20 | Category | Auto/lookup | from WIP MASTER |
| 21 | Sub Category | Auto/lookup | |
| 22 | Paint | Auto/lookup | |
| 23 | Attachment | — | blank; omitted from web form |
| 24 | DATE | Auto | |
| 25 | Year | Auto | |
| 26 | Month | Auto | |
| 27 | Month Name | Auto | |

*(No Batch ID column on this tab.)*

### Stock Record Other — VERIFIED (28 cols, `mirror.ts` + `docs/record-entry-other-form-spec.md`)

Same shape as Stock Record RM (RM part-block layout), with `Part` fixed to
`"Oth."` and `Category` defaulting to `"CONSUMABLE"`. Live write order
differs slightly from the RM form's ColumnOrder (`From` comes before `Entry
Type` on the sheet):

| # | Header | Auto/Manual | Notes |
|---|---|---|---|
| 1 | Timestamp | Auto | |
| 2 | Useremail | Auto | |
| 3 | Record ID | Auto | `RECD-<8 hex>` |
| 4 | Record Details | — | blank |
| 5 | Type | Manual | IN/OUT/TRANSFER |
| 6 | From | Manual | **all racks**, no Ground-Lane/balance restriction |
| 7 | Entry Type | Manual | `For Production`/`Opening Stock`/`Store Rejection` |
| 8 | To | Manual | all racks |
| 9 | Quantity | Manual | **no OUT balance rule at all** |
| 10 | Unit | Manual | |
| 11 | Reason | — | blank; purchase-flow only |
| 12 | Reference No. | — | blank; purchase-flow only |
| 13 | Reference Attachment | — | blank; purchase-flow only |
| 14 | Description | Manual | optional (no Required_If on Other) |
| 15 | Signature | Manual | required |
| 16 | Vendor Name | — | blank; purchase-flow only |
| 17 | Part Details | — | blank |
| 18 | Part | Auto | fixed `"Oth."` |
| 19 | Batch ID | Auto | `BTCH-<8 hex>` |
| 20 | Old Part Code | Manual | filtered to `CATEGORY="CONSUMABLE"` in the master picker |
| 21 | Part Code | Manual | |
| 22 | Part Name | Auto/lookup | |
| 23 | Category | Auto/lookup | |
| 24 | Specification PDF | — | blank; purchase-flow only |
| 25 | DATE | Auto | |
| 26 | Year | Auto | |
| 27 | Month | Auto | |
| 28 | Month Name | Auto | |

### Racks — PARTIAL (`app/api/sync/route.ts` `syncRacks()` + doc cross-refs)

Key column is `Rack ID` (sync skips rows where blank). Doc cross-references
(`record-entry-*-form-spec.md`, `record-entry-other-form-spec.md`'s Racks
Oth. view `HeaderColumns [Rack No., Type, Floor, Unit]`) confirm these real
columns exist; exact full left-to-right order NOT independently verified —
`sheetRowToSnake` generic mapping was used in the sync function, meaning the
live tab's exact header text/order wasn't hardcoded there either.

| # (approx) | Header | Auto/Manual | Notes |
|---|---|---|---|
| — | Rack ID | Auto | key column, `SELECT(...,[Rack ID]<>"")` used everywhere as "is this rack real" |
| — | Rack No. | Manual | the human-facing rack code used by every Record Entry form's From/To picker |
| — | Floor | Manual | e.g. `Basement`/`Ground Floor`/`1st Floor`… (per legacy `ims_racks` CHECK constraint in `supabase/schema.sql`, cross-check only) |
| — | Unit | Manual | e.g. `Unit I`/`Unit II`/`Unit III` (same cross-check) |
| — | Type | Manual | `Rack` / `Ground` / **`Ground Lane`** (WIP's From/To picker filters on `[Type]="Ground Lane"`) |
| — | Status | Auto/Manual | referenced in `syncRacks()`, defaulted to `"Completed"` if blank — purpose unclear from reference alone |

**Recommendation**: create with columns `Rack ID, Rack No., Floor, Unit, Type,
Status` in that order (closest defensible reconstruction); confirm against
first real use since order is not pinned down.

### Production FG — VERIFIED (4 cols, `app/api/assembly-action/route.ts` comment + append call)

| # | Header | Auto/Manual | Notes |
|---|---|---|---|
| 1 | Timestamp | Auto | |
| 2 | Useremail | Auto | |
| 3 | Assemble Id | Auto | actually the **Production ID** (`PDCN-ITM-<hex>` from Produced Part) passed through, despite the column name |
| 4 | Qty | Manual (validated) | must exactly equal the sum of Stock Record FG rows already entered against that Production ID (`Batch ID` = Production ID) |

Written only by the "Warehouse FG In Seprately" flow (`kind:'warehouse-fg-in'`
in assembly-action route), gated on the Produced Part row's `Send For =
"Warehouse"`.

### FG/RM/WIP/Other Adj — VERIFIED (`mirror.ts` + `docs/*-form-spec.md` + `app/api/inline-entry/route.ts`)

**Stock Record FG Adj** (22 cols):
Timestamp, Useremail, Adjustment ID, Record Details(""), Entry Type
(`Opening`/`Adjustment`), Type (`IN`/`OUT`), Quantity, Unit, Description,
Signature, Attachment(""), Part Details(""), Part(`"FG"`), Old Part No, Part
No, Segment, Category, Sub Category, DATE, Year, Month, Month Name.
Auto: Timestamp/Useremail/Adjustment ID(`ADJ-<8hex>`)/DATE-Year-Month-MonthName/Part.
Manual: everything else (part-block fields carried from the FG detail page's
own context, not typed fresh).

**Stock Record RM Adj** (21 cols):
Timestamp, Useremail, Adjustment ID, Record Details(""), Entry Type, Type,
Quantity, Unit, Description, Signature, Attachment(""), Part Details(""),
Part(`"RM"`), Old Part Code, Part Code, Part Name, Category, DATE, Year,
Month, Month Name.

**Stock Record WIP Adj** (22 cols):
Timestamp, Useremail, Adjustment ID, Record Details(""), Entry Type, Type,
Quantity, Unit, Description, Signature, Attachment(""), Part Details(""),
Part(`"WIP"`), Old Part Code, Part Code, Category, Sub Category, Paint, DATE,
Year, Month, Month Name.

**Stock Record Other Adj** (21 cols): same shape as RM Adj with
Part(`"Oth."`); Old Part Code Valid_If `CATEGORY="CONSUMABLE"`, required if
Part Code blank.
Timestamp, Useremail, Adjustment ID, Record Details(""), Entry Type, Type,
Quantity, Unit, Description, Signature, Attachment(""), Part Details(""),
Part(`"Oth."`), Old Part Code, Part Code, Part Name, Category, DATE, Year,
Month, Month Name.

All four: ID prefix `ADJ-`, Record Details column always blank (section
header). Quantity must be a non-zero number; Entry Type from a fixed 2-value
list (`Opening`/`Adjustment`); Type from `IN`/`OUT`.

### FG/RM/WIP/Other Verified — VERIFIED (`mirror.ts` + inline-entry route)

**Stock FG Verified** (21 cols):
Timestamp, Useremail, Veified id *(sic)*, Record Details(""), Handover
Quantity, Unit, Assignee Name, Assigne Sign *(sic)*, Any Other Remark's,
Attachement *(sic)*, Part Details(""), Part(`"FG"`), Old Part No, Part No,
Segment, Category, Sub Category, DATE, Year, Month, Month Name.

**Stock RM Verified** (20 cols):
Timestamp, Useremail, Veified id, Record Details(""), Handover Quantity,
Unit, Assignee Name, Assigne Sign, Any Other Remark's, Attachement, Part
Details(""), Part(`"RM"`), Old Part Code, Part Code, Part Name, Category,
DATE, Year, Month, Month Name.

**Stock WIP Verified** (21 cols):
Timestamp, Useremail, Veified id, Record Details(""), Handover Quantity,
Unit, Assignee Name, Assigne Sign, Any Other Remark's, Attachement, Part
Details(""), Part(`"WIP"`), Old Part Code, Part Code, Category, Sub Category,
Paint, DATE, Year, Month, Month Name.

**Stock Other Verified** (20 cols): same as RM Verified, Part(`"Oth."`).
⚠️ Export quirk noted in source doc: the AppSheet export's Old Part Code
Valid_If said `[CATEGORY]="RAW MATERIAL"` for this tab, likely a copy-paste
bug — reference app uses `CONSUMABLE` to match its own live behavior; confirm
against the live sheet before trusting either.

All: ID prefix `VERFY-`. Handover Quantity is a plain number (no sign
convention documented beyond "must be a number"). No Type/From/To columns —
this is a handover-confirmation log, not a stock movement.

### FG/RM/WIP/Other Item Allotment — VERIFIED (`mirror.ts` + inline-entry route)

**FG Item Allotment** (24 cols):
Timestamp, Useremail, Out ID, Out Record(""), Type(`"OUT"` fixed), From,
Quantity, Unit, Purpose, Name, Return Date, Part Details(""), Part(`"FG"`),
Old Part No, Part No, Segment, Category, Sub Category, Standard Part,
Attachment(""), DATE, Year, Month, Month Name.
*(Attachment sits AFTER the part block + Standard Part on FG — differs from
RM/WIP/Other below.)*

**RM Item Allotment** (22 cols):
Timestamp, Useremail, Out ID, Out Record(""), Type(`"OUT"`), From, Quantity,
Unit, Purpose, Name, Return Date, Attachment(""), Part Details(""),
Part(`"RM"`), Old Part Code, Part Code, Part Name, Category, DATE, Year,
Month, Month Name.

**WIP Item Allotment** (23 cols):
Timestamp, Useremail, Out ID, Out Record(""), Type(`"OUT"`), From, Quantity,
Unit, Purpose, Name, Return Date, Attachment(""), Part Details(""),
Part(`"WIP"`), Old Part Code, Part Code, Category, Sub Category, Paint, DATE,
Year, Month, Month Name.

**Other Item Allotment** (22 cols): same as RM Item Allotment, Part(`"Oth."`).
Its form ColumnOrder has no Attachment field at all (unlike RM), but the live
sheet still carries the column, blank.

All: ID prefix `OUT-`, Type always fixed initial `"OUT"`. Return Date is a
datetime the doer sets when material is expected back.

### FG/RM/Other Item IN Allotmet — VERIFIED (`mirror.ts` + `app/api/item-in/route.ts`)

*(Sheet tab name is misspelled live: "Allotmet", not "Allotment" — reproduce
exactly. WIP has no equivalent tab in the reference at all — not listed by
the plan either, so skip it; only FG/RM/Other exist.)*

**FG Item IN Allotmet** (24 cols):
Timestamp, Useremail, OUT ID, IN ID, In Record(""), Type(`"IN"` fixed), To,
Quantity, Unit, Person Name, Remark, Part Details(""), Part(`"FG"`
prefilled from the OUT row), Old Part No, Part No, Segment, Category, Sub
Category, Standard Part, Attachment(""), DATE, Year, Month, Month Name.
FG's Quantity has a hard Valid_If: must equal the FULL originating OUT
quantity ("Quantity mismatch. Please verify.").

**RM Item IN Allotmet** (22 cols):
Timestamp, Useremail, OUT ID, IN ID, In Record(""), Type(`"IN"`), To,
Quantity, Unit, Person Name, Remark, Attachment(""), Part Details(""),
Part(`"RM"`), Old Part Code, Part Code, Part Name, Category, DATE, Year,
Month, Month Name. No quantity rule (partial returns allowed).

**Other Item IN Allotmet** (22 cols): same shape as RM, Part(`"Oth."`). No
quantity rule.

All: ID prefix `IN-`; `OUT ID` is the originating allotment's Out ID
(required, must exist in the matching `<CH> Item Allotment` tab), To/Quantity/
Unit/part-block all prefill from that OUT row.

### Attachment FG/RM/WIP/Other In-Out — VERIFIED (`app/api/record-entry/route.ts`, 8 cols)

Timestamp, Useremail, Record ID, Batch ID, Attachment id, Type, Image, File.
Auto: everything — one child row per attached photo (up to 5) on a Record
Entry save. `Attachment id` prefix `ATT-FG-`/`ATT-RM-`/`ATT-WIP-`/`ATT-OTH-`.
Batch ID is blank for WIP (the WIP parent tab itself has no Batch ID column).
`File` column is written blank by the app (image-only uploads implemented).

---

## 2. `IMS_SHEET_RM_WIP_ID`

### WIP MASTER — PARTIAL (`app/api/sync/route.ts` `syncWIPMaster()` + `app/api/wip-master/route.ts`'s explicit column-letter writes)

Column letters D/S/T/U/V are explicitly confirmed live by the wip-master
PATCH route (`'D'` = PART NO. match key, `O`=n/a here — actually
`S`=Casted Weight (in grams), `T`=Casted Weight Image, `U`=Machined Weight (in
grams), `V`=Machined Weight Image). Combined with the sync function's field
list (in the order it builds the record — a reasonable proxy for sheet order
since most sync functions read tabs top-to-bottom), reconstructed order:

| # | Header | Auto/Manual | Notes |
|---|---|---|---|
| 1 | Timestamp | Auto | |
| 2 | Useremail | Auto | |
| 3 | ID'S | Auto | key column (`id_s`), used as the WIP Part ID everywhere |
| 4 (D) | PART NO. | Manual | **confirmed live** as column D (match key for PATCH) |
| 5 | Category | Manual | |
| 6 | Sub Category | Manual | |
| 7 | Paint | Manual | |
| 8 | MAKE BY | Manual | `Inhouse`/`Outsource` |
| 9 | VENDOR NAME | Manual | |
| 10 | Old Part Code | Manual | |
| 11 | Old Part Name | Manual | |
| 12 | IQC PDF | Manual | attachment path |
| 13 | IQC PDF UPDATE LAST | Auto | timestamp of last IQC PDF change |
| 14 | Machined Or Casted | Manual | `MACHINED`/`CASTED` |
| 15 | Year | Manual | |
| 16 | MIN STOCK | Manual | |
| 17 | MAX STOCK | Manual | |
| 18 | Ingot Weight (in grams) | Manual | |
| 19 (S) | Casted Weight (in grams) | Manual | **confirmed live column S**; write-once (only while blank) |
| 20 (T) | Casted Weight Image | Manual | **confirmed live column T** |
| 21 (U) | Machined Weight (in grams) | Manual | **confirmed live column U** |
| 22 (V) | Machined Weight Image | Manual | **confirmed live column V** |

Column count/positions between #3 and #18 are a best-effort reconstruction
from sync-function field order, not independently re-verified beyond the
D/S/T/U/V anchors — confirm against the live tab before finalizing.
"Casted" weight updates are additionally gated to 4 specific emails
(`dme1/2/3@`, `wip.incharge@`) in the reference — reimplement as a
`USERS.Permissions_Process`-driven check (e.g. a distinct `ims-wip-weight`
sub-permission) rather than a hardcoded email list.

### WIP ATTACHMENT PARTCODE — VERIFIED (`mirror.ts`, 5 cols)

Basic Details(""), Timestamp, Useremail, Task ID, PART NO.
Auto: Timestamp/Useremail/Task ID(`PHO-<8hex>`). Manual: PART NO. (the part
this photo session is against). Parent row of a "Take Image" session; ID prefix
`PHO-`.

### WIP Image — VERIFIED (`mirror.ts`, 11 cols)

Basic Details(""), Timestamp, Useremail, Task ID, PART NO., UNIQUE ID, Log
Details(""), Image, Attachment, Drawing, Video.
Auto: Timestamp/Useremail/Task ID (parent's, carried through)/UNIQUE
ID(`TAS-<8hex>`). Manual: PART NO. (parent's), Image/Attachment/Drawing/Video
(at least one file required per child row; up to 5 child rows per session).

### ASSEMBLE RM FG (BOM) — VERIFIED (`app/api/sync/route.ts` `syncAssembleRmFg()` field list)

Confirmed real column names (order not independently pinned beyond what the
generic `sheetRowToSnake` fallback plus explicit overrides implies — treat as
PARTIAL for exact left-to-right order, VERIFIED for the column set itself):

| # (approx) | Header | Auto/Manual | Notes |
|---|---|---|---|
| — | Unique id | Auto | the BOM row's own key — this is the id `ims_assemble_rm_fg.unique_id` and what `PRE-ITM-*` / Reserved BOM keys reference |
| — | FG ID | Manual/ref | FG SKU id this BOM row belongs to |
| — | FG CODE | Manual/lookup | new-code FG part number |
| — | FG CATEGORY | Auto/lookup | |
| — | FG SUB CATEGORY | Auto/lookup | |
| — | FG PAINT | Auto/lookup | |
| — | FG STANDARD | Auto/lookup | |
| — | Category | Manual | the RM/WIP ingredient's own category |
| — | Sub Category | Manual | |
| — | RM ID | Manual/ref | the ingredient's id — can point at either an RM part or a WIP part (Batch Assembly Followup's "Send to Assembly Stock" logic filters these by `Machined Or Casted="MACHINED"` in `ims_products_wip` to tell WIP ingredients apart from RM ones) |
| — | RM CODE | Manual/lookup | new-code ingredient part number — this is the code Raw Materials Requisition/Assembly RM Requisition key their totals on |
| — | DUPLICATE | Auto/Manual | boolean flag |
| — | Serviceable | Auto/Manual | boolean flag |
| — | No. Of Qty Use | Manual | **BOM quantity-per-unit** — `requiredQty = No. Of Qty Use × batch quantity` (referenced in `lib/requisitions.ts`'s `BOM_COLS`, not explicitly in the sync function above — confirm it's this exact header text on the live tab) |
| — | Units | Manual | unit for `No. Of Qty Use` |

`lib/requisitions.ts`'s `BOM_COLS` constant confirms the exact Supabase
column names used downstream: `unique_id, rm_code, category, sub_category,
no_of_qty_use, units` — the live sheet headers these map from are `Unique
id`, `RM CODE`, `Category`, `Sub Category`, `No. Of Qty Use` (or similar —
title-case not independently confirmed), `Units`.

---

## 3. `IMS_SHEET_PURCHASE_ID`

**Better than "nothing concrete" — three real tabs exist and are actively
synced**, though full left-to-right column order is NOT pinned down (all use
the generic `sheetRowToSnake` fallback plus a handful of explicit type/date
overrides — PARTIAL confidence on order, VERIFIED on column existence/names).
A `Purchase Order`/`PO Items` pair of sync handlers also exists in the source
(`syncPurchaseOrders`/`syncPurchaseOrderItems`) but has **no `SOURCES` entry
wired to any spreadsheet/tab** — i.e. dead/orphaned code in the reference,
never actually connected to a live sheet. Treat those two as PROPOSED only.

### Vendor Tax Invoices — PARTIAL

Real columns referenced: `Vendor Tax Invoice ID`, `Vendor Name`, Vendor
Details(section), Upload Invoice Details(section), GST Details(section),
Payment Details(section), Deduction Remarks(section), `Timestamp`, `Purchase
Tax Invoice Date`, `Advance Amount (%)`, `Freight Charges Amount`, `Discount
(On invoice)`, `TDS Amount`, `Disc Amount`, `Basic Amount`, `CGST Amount`,
`SGST Amount`, `IGST Amount`, `Total Tax Amount`, `Total Amount Inc Tax`,
`Total Amount After Disc`. Auto: Timestamp, ID. Manual: everything else
(vendor + invoice + payment capture form). Section-header columns (Vendor
Details/Upload Invoice Details/GST Details/Payment Details/Deduction
Remarks) are blank spacer columns matching the AppSheet form-section
convention seen throughout this project.

### Upload Tax Invoice — PARTIAL

Real columns referenced: `Tax Invoice ID`, `Vendor Name`, Item
Details(section), Material Receiving Details(section), Upload Invoice
Details(section), GST Details(section), `Timestamp`, `Purchase Tax Invoice
Date`, `Advance Amount (%)`, `Rate`, `Received Qty`, `DISC Amount`, `TDS
Amount`, `Basic Amount`, `CGST %`, `SGST %`, `IGST %`, `CGST Amount`, `SGST
Amount`, `IGST Amount`, `Total Tax Amount`, `Total Amount Inc Tax`, `Total
Amount After Disc`. This is the item-level / material-receiving companion to
Vendor Tax Invoices (per-part rate/qty/GST breakdown vs. the invoice-level
totals above).

### Store In — PARTIAL

Real columns referenced: `STR_IN ID`, `Vendor Name`, `Timestamp`, `Sent to
IMS`, `Received Qty`, `Weight 10 Pcs (In Grams)`, `Qty Diff`, `Actual
Received Quantity`. This is the physical goods-receipt / QC-weighing step
that follows a Tax Invoice upload — `Sent to IMS` flag presumably gates
whether the received stock has already been posted into Stock Record RM/
Other as an IN entry (mirrors the Vendor-Invoice → Store-In → Stock-Record-IN
pipeline implied by the RM/Other forms' blank "purchase-flow columns"
Reason/Reference No./Reference Attachment/Vendor Name/Specification PDF).

### Purchase Order / PO Items — PROPOSED (orphaned in reference, no live tab ever wired)

Field names the dead sync code references (for reference only, NOT verified
against any live sheet since none is wired):
- **Purchase Order**: PO ID, Vendor Name, PO No., PO Attachment, Tally,
  Payment Type, Advance Amount (%), Total Amount (After Tax) / Total Amount,
  CGST Amount, SGST Amount, IGST Amount, DISC Amount, Status, Email Capture,
  Timestamp.
- **PO Items**: PO ID, Item Name, Our Code, Quantity, Per, Rate, GST Slab,
  DISC AMOUNT, DISC%, Basic Amount, DISC, DISC Amount, Status, Timestamp.

**Recommendation for the new IMS_SHEET_PURCHASE_ID**: create the 3 real,
actively-used tabs above (`Vendor Tax Invoices`, `Upload Tax Invoice`,
`Store In`) with the field sets listed (order to be confirmed on first real
use — none of the three is order-verified). Do NOT build the `Purchase
Order`/`PO Items` pair unless the user explicitly asks for a PO-raising
workflow — the reference app itself never finished wiring it to a sheet.

---

## 4. `IMS_SHEET_PRODUCTION_ID`

### Batch Assembly — VERIFIED (22 cols, `mirror.ts` + `docs/line-planning.md` + assembly-action route)

Details(""), Timestamp, Usermail, Assembly ID, Part Details(""), Part ID,
Old Part Code, Part Code, Part Name, Description, Segment, Category, Sub
Category, Paint, Pre Assembly Details(""), Assembly Quantity, Pre Assembly
Notes, Batch Code, Responsible Person, Status, PDF, Requisition Material.

Auto: Timestamp, Usermail, Assembly ID (`ASSM-<8hex>`), Batch Code
(`<DD-MM-YYYY>-<8hex>`), Old Part Code…Paint (lookup from the chosen FG SKU).
Manual: Assembly Quantity (min 1), Pre Assembly Notes, Responsible Person
(defaults `"VEENU"` but editable). Status/PDF/Requisition Material left
blank by the form — Requisition Material is later flipped to `"Requested"`
by the requisition-flag route.

### Batch Assembly Followup — VERIFIED (25 cols, `mirror.ts` + assembly-action route)

Details(""), Timestamp, Usermail, Assembly ID, Assembly Followup ID, Part
Details(""), Part ID, Old Part Code, Part Code, Part Name, Description,
Segment, Category, Sub Category, Paint, Pre Assembly Details(""), Assembly
Quantity, Pre Assembly Notes, Batch Code, Responsible Person, Post Assembly
Details(""), Assembly Status, Quantity, Notes, Status.

Auto: Timestamp, Usermail, Assembly Followup ID (`ASSM-FU-<8hex>`), plus the
whole parent-Assembly snapshot block (Part ID…Responsible Person) copied from
the Batch Assembly row. Manual: Assembly Status, Quantity (validated ≤
remaining balance on the assembly = Assembly Quantity − Σ prior followups),
Notes. When `Assembly Status = "Assembled"`, this ALSO triggers WIP-ingredient
consumption rows on `WIP Stock on Assembly` (26 cols — Details, Timestamp,
Usermail, Table Name, Related ID, Stock ID(`STCK-<8hex>`), Stock
Details(""), Stock IN, Stock OUT, Type, Quantity, UOM, Description,
Signature, Part Details(""), Part ID, Part(`"WIP"`), Batch Code, Old Part
Code, Part Code, Category, Sub Category, Paint, Made by, Manufacturer Name,
Status — one row per MACHINED WIP ingredient in the FG's BOM).

### Produced Part — VERIFIED (25 cols, `mirror.ts` + assembly-action route)

Details(""), Timestamp, Usermail, Production ID, Part Details(""), Part ID,
Old Part Code, Part Code, Part Name, Description, Segment, Category, Sub
Category, Paint, Stock, Production Details(""), Send For, Customer ID,
Customer Code, Customer Name, Customer GSTIN, Gate Pass, Quantity, Notes,
Status.

Auto: Timestamp, Usermail, Production ID (`PDCN-ITM-<8hex>`), Old Part
Code…Paint (FG SKU lookup), Stock (the FG's current Assembly-Line stock at
save time — validated: Quantity ≤ Stock). Manual: Send For (`Dispatch` /
`Warehouse`); Customer ID/Code/Name/GSTIN + Gate Pass image required only
when Send For=`Dispatch`; Quantity, Notes. Status left blank by the form.

### Batch Production — VERIFIED (25 cols, `mirror.ts` + `app/api/batch/route.ts`)

Timestamp, Usermail, WIP ID, Production Batch ID, WIP Details(""), FG Code,
WIP Code, Category, Sub Category, Paint, Required Quantity, Batch
Details(""), Batch Code, Plan Quantity, Casted Quantity, Part Weight as cast
(in grams), Weighing Part Image, Ingot Weight as Cast (g), Responsible
Person, Start DateTime, Due DateTime, Production Days, Notes, Status,
Requistion Materials *(sic — misspelled live)*.

Auto: Timestamp, Usermail, Production Batch ID (`BP-<8hex>`), FG Code
(BOM lookup by WIP Code), WIP Code/Category/Sub Category/Paint (WIP MASTER
lookup), Required Quantity (WIP master's own Shortfall Quantity at save
time), Batch Code (auto-generated `HHMMA/B-DD-MMM-YY-<WIPCode>` pattern,
doer-editable), Production Days (whole-date diff, Due must be after Start).
Manual: Plan Quantity (>0), Responsible Person, Start/Due DateTime, Notes.
Casted Quantity / Part Weight as cast / Weighing Part Image start blank and
are filled ONLY via a later "Update Casted Parts" action (PATCH by
Production Batch ID, write-once — only while all three are still blank).
Status/Requistion Materials left blank by creation; Requistion Materials is
later flipped to `"Requested"` by the requisition-flag route.

### Batch Followup — VERIFIED (31 cols, `mirror.ts` + `app/api/batch/route.ts` PUT handler)

Timestamp, Usermail, Production Batch ID, Followup ID, WIP Details(""), WIP
Code, Category, Sub Category, Paint, Required Quantity, Batch Details(""),
Batch Code, Plan Quantity, Casted Quantity, Part Weight as cast (in grams),
Weighing Part Image, Responsible Person, Start DateTime, Due DateTime,
Production Days, Notes, Followup Details(""), Production Status, Reason,
Nest Estimate DateTime, Remarks, Quantity Adjustment, Short or Excess, Short
or Excess Reason, Short or Excess Quantity, Balance in Production.

Auto: Timestamp, Usermail, Followup ID (`BPF-<8hex>`), the whole parent
Batch Production snapshot block (WIP Code…Notes) copied from the Batch
Production row, Balance in Production (computed — see rule below). Manual:
Production Status (required), Reason (required if Status=`Hold`), Nest
Estimate DateTime (only when Status≠`Completed`), Remarks, Quantity
Adjustment (`Yes`/`No`, only meaningful when Status=`Completed`), Short or
Excess + its Reason + Quantity (required together when Quantity
Adjustment=`Yes`).
**Balance rule**: `balance = Casted − (Received − ΣExcess + ΣShort)`
(including this row's own adjustment) — `Completed` requires balance to land
exactly on 0; any other status requires balance to stay non-zero. Enforced
server-side before the row is written.

### Raw Materials Requisition — PROPOSED (no dedicated sheet route in reference; written externally)

The reference app's own comments (`app/api/requisition/route.ts`) state
explicitly: an **external Google Apps Script** (installed on the Production
spreadsheet, "reviewed in ~/ims-scripts/script2" — not part of this repo)
does the BOM explosion and appends the actual `Raw Materials Requisition`
rows once this app flips `Batch Production.Requistion Materials` to
`"Requested"`. This app only ever READS the result back via a Supabase
mirror table `ims_rm_requisition` with columns `batch_production_id,
assemble_rm_fg_id` (join keys only — see `lib/requisitions.ts`'s
`pLinks`/`ims_rm_requisition` usage). **No concrete header list for the
sheet tab itself exists anywhere in the reference.**

Per the ZOTO plan (item 5's explicit instruction: "real BOM-explosion logic
written here" replacing the external Apps Script), propose reconstructing
this tab's shape from what the app needs to read back — one row per
(Production Batch, BOM ingredient):

| # | Header | Auto/Manual | Notes (proposed) |
|---|---|---|---|
| 1 | Timestamp | Auto | |
| 2 | Requisition ID | Auto | new prefix, e.g. `REQRM-<8hex>` |
| 3 | Production Batch ID | Auto | FK → Batch Production |
| 4 | Assemble RM FG Unique ID | Auto | FK → ASSEMBLE RM FG's `Unique id` (the BOM row that produced this line) |
| 5 | RM Code | Auto | copied from the BOM row for readability |
| 6 | Category | Auto | copied from the BOM row |
| 7 | Sub Category | Auto | copied from the BOM row |
| 8 | Required Quantity | Auto | `No. Of Qty Use × batch's Plan Quantity` |
| 9 | Units | Auto | copied from the BOM row |
| 10 | Status | Auto | `Requested` → later `Done` once mailed/actioned |

**Flag clearly: this is a PROPOSED reconstruction, not a verified header
list** — build it to fit the BOM-explosion logic being written fresh anyway
(per the plan), not to match an unknown legacy sheet exactly.

### Assembly RM Requisition — PROPOSED (same situation as above, assembly side)

Mirrors `ims_assembly_rm_requisition` (columns `assembly_id, rm_id` per
`lib/requisitions.ts`). Same external-Apps-Script gap. Propose the identical
shape as Raw Materials Requisition above but keyed on `Assembly ID` instead
of `Production Batch ID`, sourced from `Batch Assembly.Assembly Quantity` ×
BOM `No. Of Qty Use`.

### Stock Release Log — NEW (design lifted directly from `supabase/schema.sql`'s `ims_stock_release`, per the plan's explicit instruction)

| # | Header | Auto/Manual | Notes |
|---|---|---|---|
| 1 | Timestamp | Auto | `released_at` |
| 2 | Release ID | Auto | new prefix, e.g. `REL-<8hex>` |
| 3 | Requisition Kind | Auto | `assembly` / `production` |
| 4 | Requisition ID | Auto | first of the ticked set, for readability |
| 5 | Requisition IDs | Auto | comma-joined full ticked set |
| 6 | Allocations JSON | Auto | FIFO split actually written, e.g. `{"BP-12C62B83":400,"BP-55CEFAEB":100}` — **this is the only place that can say what each batch actually received**, since the Stock Record RM OUT row itself carries only one merged quantity |
| 7 | RM Code | Manual | ASSEMBLE RM FG's new-code `RM CODE` |
| 8 | Old Part Code | Auto/lookup | legacy code the RM ledger is actually keyed on |
| 9 | Rack | Manual | source rack released from |
| 10 | Quantity | Manual | total released in this action |
| 11 | Unit | Auto/lookup | |
| 12 | Remark | Manual | required |
| 13 | Record ID | Auto | the `RECD-…` id of the Stock Record RM OUT row this release wrote |
| 14 | Released By | Auto | doer's identity |

Business rules to reimplement (from `app/api/requisitions/release/route.ts`):
- Releasing more than the ticked requisitions' still-pending total is
  rejected outright before any write happens.
- The RM OUT row is written through the SAME Record-Entry RM path as a
  manual entry, with the requisition id(s) placed in the **Batch ID** cell
  (comma-joined) instead of a random `BTCH-` id.
- The release is additionally rack-level blocked — stricter than the raw RM
  Quantity Valid_If (which only checks the part's whole-inventory balance):
  reject if the chosen rack's own balance can't cover the quantity.
- FIFO allocation: walk ticked requisitions oldest-first, filling each until
  it hits its own required quantity before moving to the next.
- Undo/delete: remove the OUT row from Stock Record RM first (by Record ID);
  only if that succeeds does the Stock Release Log row get removed — never
  the reverse, so the log can never claim material came back if the sheet
  still shows it gone.

---

## 5. `IMS_SHEET_FG_ID`

### Customer KYC — PARTIAL (`app/api/kyc/route.ts` field references)

Real columns referenced (pending-queue filter + search fields):
`Customer Name`, `Company GSTIN NO.`, `Contact Person Name`, `Contact No.
1`, `Reviews Status` (blank = pending review). Full column set/order not
independently confirmed beyond these — this tab is described in the plan as
"pending review-status queue," i.e. a KYC intake form whose approved rows
later get copied into `MASTER CUSTOMER DATA` (item 10 below) via the KYC
flow. Propose reconstructing the full form fields from the same block used
in `buildMasterDataRow()` (item 10) since that's the only place the reference
enumerates what a customer's KYC-relevant fields actually are — but this is
inference, not a verified header dump.

| # (approx) | Header | Auto/Manual | Notes |
|---|---|---|---|
| — | Timestamp | Auto | |
| — | Customer Name | Manual | |
| — | Company GSTIN NO. | Manual | |
| — | Contact Person Name | Manual | |
| — | Contact No. 1 | Manual | |
| — | Reviews Status | Auto/Manual | blank = pending; set once reviewed |

**Flag**: column list beyond these 6 is genuinely unconfirmed — mark as
PARTIAL/needs-manual-confirmation for the rest of the form (KYC forms in the
old AppSheet reference typically also capture address/contact/document
fields; none of those show up anywhere in the reference app's code, since
the reference app never actually reads or writes anything back to `Customer
KYC` itself — only reads the pending list for its own dashboard).

---

## 6. `IMS_SHEET_MASTER_FG_ID`

### MASTER OF FG INVENTORY — VERIFIED (`app/api/sync/route.ts` `syncMasterFgInventory()`)

Real column names confirmed (order approximate — generic `sheetRowToSnake`
fallback plus explicit overrides, so treat position as PARTIAL, existence as
VERIFIED):

| # (approx) | Header | Auto/Manual | Notes |
|---|---|---|---|
| — | TIMESTAMP | Auto | |
| — | USEREMAIL | Auto | |
| — | FG ID | Auto | key column |
| — | OLD PART NO. | Manual | key fallback if FG ID blank |
| — | PART NO. | Manual | |
| — | Part Name | Manual | |
| — | Old Part Name | Manual | |
| — | Description | Manual | |
| — | SEGMENT | Manual | |
| — | Category | Manual | |
| — | Sub Category | Manual | |
| — | Standard Part | Manual | |
| — | CUSTOMER NAME | Manual | |
| — | Paint | Manual | |
| — | Status | Manual | |
| — | MACHINING & OTHER COST | Manual | numeric |
| — | Manupulation Partcode | Manual | *(sic — misspelled live)* |
| — | Data Sent To Stock Warehouse | Auto/Manual | flag |
| — | Year | Manual | |
| — | MIN STOCK | Manual | |
| — | MAX STOCK | Manual | |
| — | OPENING STOCK | Manual | |
| — | Discount | Manual | |
| — | price | Manual | |
| — | Final Price | Auto | computed from price − discount, presumably |

Additional **sheet-side computed/virtual columns explicitly NOT written by
this app** (the sync function overrides them to `undefined` before upsert —
they're rollups the sheet itself formula-computes from Stock Record FG /
FG Adj / FG Verified / FG Item Allotment / Batch Assembly rows, matching the
"Stocks Oth." virtual-column pattern documented for Other/RM):
`Monthly Stock In`, `Monthly Stock Out`, `Adjust FG`, `Verified FG Stock`,
`Inhouse Stock Issue`, `Assembled Parts`. **Do not create these as plain
data columns to be written to** — either implement them as computed values
in the backend (matching the plan's `services/imsBalance.ts` intent) or, if
kept as sheet formula columns, leave them entirely untouched by the API.

---

## 7. `IMS_SHEET_PRODUCT_MASTER_ID`

### Product Master — VERIFIED (`app/api/sync/route.ts` `syncProductMaster()`)

A single combined RM/WIP product catalogue (unlike the Stock spreadsheet's
per-channel masters) — real column names confirmed, order approximate:

| # (approx) | Header | Auto/Manual | Notes |
|---|---|---|---|
| — | Sr. No. | Auto | |
| — | Part Name | Manual | key fallback |
| — | Part Code | Manual | key |
| — | Category | Manual | |
| — | Segment | Manual | |
| — | Rate Type | Manual | |
| — | Production Use | Manual | flag — drives the Other-channel "Stocks Oth." slice filter (`CATEGORY="CONSUMABLE" AND Production Use="TRUE"`) |
| — | ISOMETRIC VIEW | Manual | attachment/link |
| — | New Part  Codes | Manual | *(sic — double space live)* |
| — | Critical Dimension Drawing | Manual | attachment |
| — | Drawing Full Dimension | Manual | attachment |
| — | Real Photo | Manual | attachment |
| — | Part Code Type | Manual | |
| — | Unit | Manual | |
| — | Part Category | Manual | |
| — | Last Rate Date | Manual | |
| — | Last Purchased Rate | Manual | numeric |
| — | Purchase Frequency (Days) | Manual | numeric |
| — | Current Week Rate | Manual | numeric |
| — | Current Rate | Manual | numeric |
| — | Last Purchased Weight | Manual | numeric |

Also has sheet-side virtuals explicitly suppressed by the sync function
(not real columns / not to be written): `IQC Standard`, `Model 3D`, `Test
Report`, `Video 3D`, `Specifications`, `Duplicacy By Part Name`, `Duplicacy
By Part Code`.

**Overlap note**: this "Product Master" tab appears to be a general RM/WIP
catalogue distinct from `MASTER RM OR OTHER` (item 1's Stock spreadsheet
master, used for the Record Entry RM/Other pickers and the consumables
safety-stock formulas) and `WIP MASTER` (item 2). Reproduce as its own
separate tab per the plan's item 8 wording ("RM/WIP product master
catalogues") rather than trying to merge it into either.

---

## 8. `IMS_SHEET_DATA_STORAGE_ID`

### Data Storage FG / RM / WIP / OTH. — VERIFIED (`app/api/sync/route.ts` `syncDataStorage()`, shared handler for all 4)

Identical 8-column shape across all four tabs (tab names differ:
`Data Storage FG`, `Data Storage RM`, `Data Storage WIP`, `Data Storage
OTH.` — note the OTH. tab name is abbreviated with a trailing period, not
spelled out "Other" like every other product-type tab elsewhere in this
project):

| # | Header | Auto/Manual | Notes |
|---|---|---|---|
| 1 | Storage ID | Auto | key column |
| 2 | Timestemp *(sic)* | Auto | live header is misspelled — reproduce exactly, sync function accepts either `Timestemp` or `Timestamp` as a fallback |
| 3 | Storage Details | — | blank section-header column |
| 4 | Old Part No. | Manual | |
| 5 | Part Code | Manual | |
| 6 | Quantity | Manual | a period snapshot quantity, not a live transaction |
| 7 | Each Price | Manual | |
| 8 | Price | Auto | presumably Quantity × Each Price |

These are the quarterly/period stock-value snapshots backing the
"Inventory" quarterly views (per the plan's item 9 description) — a
point-in-time archive, not a ledger; each row is a frozen snapshot for one
part in one period, not something the app appends to on every transaction.

---

## 9. `IMS_SHEET_CUSTOMER_ID`

### CUSTOMER MASTER V2 — VERIFIED (`app/api/sync/route.ts` `syncCustomerMaster()`)

| # (approx) | Header | Auto/Manual | Notes |
|---|---|---|---|
| — | Timestamp | Auto | |
| — | Useremail | Auto | |
| — | Customer ID | Auto | key column |
| — | Customer Status | Manual | |
| — | Account Type | Manual | |
| — | Customer Code | Manual | the human-facing code used everywhere else (KYC search, Billing Strategy join, etc.) |
| — | Customer Name | Manual | |
| — | Customer Category | Manual | |
| — | Customer Category (%) | Manual | numeric |
| — | Business Segment | Manual | mapped through `SEG_V2_TO_MASTERDATA` when copied into MASTER CUSTOMER DATA |
| — | Business Type | Manual | |
| — | Marka Code | Manual | |
| — | Website | Manual | |
| — | Logo | Manual | attachment |
| — | Joining Date | Manual | |
| — | Sales Repersentative ID | Manual | *(sic — misspelled live, matches the "Field Sale Repersentative" typo pattern already documented in ZOTO's own CLAUDE.md)* |
| — | Sales Repersentative Name | Manual | *(sic)* |
| — | CRM Email ID | Manual | |
| — | CRM ID | Manual | |
| — | CRM Name | Manual | |
| — | KYC Status | Manual | |
| — | Company GSTIN NO. | Manual | |
| — | Company PAN NO. | Manual | |
| — | Name on PAN | Manual | |
| — | Registered Email ID | Manual | |
| — | Registered Contact No. | Manual | |
| — | Firm Type | Manual | |
| — | Credit Status | Manual | |
| — | Payment terms (Days) | Manual | numeric |
| — | Grace Period (Days) | Manual | numeric |
| — | Risk Score | Manual | numeric |
| — | Credit Limit Days | Manual | numeric |
| — | Credit Limit | Manual | numeric |
| — | TDS and TCS Applicable | Manual | |
| — | Trf Status | Manual | |

Read range in `app/api/kyc/route.ts` is `A1:AN` (40 columns) — the sync
function above only lists ~33 real fields, so a handful of trailing columns
in the live tab are not accounted for by the reference's own sync code;
confirm the remaining ~7 columns against the live sheet directly rather than
guessing.

### Customer Addresses — PARTIAL (`lib/kyc-import.ts` field references, `app/api/kyc/route.ts` read range `A1:T`, 20 cols)

Real columns referenced: `Customer ID`, `Address Type` (matched
case-insensitively against `"registered"` to pick the KYC-import address),
`Full Address`, `City`, `State`, `Pin Code`. Full 20-column order not
independently confirmed — only 6 of 20 columns are named anywhere in the
reference code.

### Customer Contacts — PARTIAL (`lib/kyc-import.ts`, read range `A1:W`, 23 cols)

Real columns referenced: `Customer ID`, `Contact Person Name`, `Contact No.
1`, `Contact Person Designation`. Only 4 of 23 columns are named anywhere in
the reference code.

### Customer Revisions — PARTIAL (`lib/kyc-import.ts`, read range `A1:Z`, 26 cols)

Real columns referenced: `Customer ID`, `Grace Period (Days)`. Only 2 of 26
columns are named anywhere in the reference code — this tab evidently tracks
customer-terms revision history, but almost nothing about its shape is
recoverable from the reference beyond the one field it actually reads.

**For all three of the above**: the reference app treats these purely as
read-only lookup sources feeding the KYC-copy flow — it never writes to any
of them, and never needed more than the handful of fields listed. Building
these tabs with ONLY the confirmed columns risks being incomplete for
whatever the live AppSheet forms actually captured; flag for manual
confirmation against the live sheets before finalizing full header sets.

---

## 10. `IMS_SHEET_MASTER_CUST_ID`

### MASTER CUSTOMER DATA — VERIFIED, sparse (`lib/kyc-import.ts`'s `buildMasterDataRow()`/`masterDataRowArray()`)

This tab is confirmed to be **302 columns wide** (`masterDataRowArray(md,
width = 302)`), of which the reference app only ever writes to a specific
sparse subset — every other column is either untouched (left blank on a new
row) or is itself an ARRAYFORMULA/derived column that must NEVER be written
to directly (writing even `''` into a spilled-formula column blanks the
whole column, the same class of bug already documented in ZOTO's own
CLAUDE.md for `CUSTOMER MASTER T1`'s `CUST ID` column — this reference app
explicitly designed around that exact failure mode).

**Columns confirmed written** (0-based index → 1-based column letter is
`index+1`; letters given for readability):

| Col (0-idx) | Letter | Header (as documented in source) | Source |
|---|---|---|---|
| 3 | D | Field Sale Representative | manual (`manual.fieldSalesRep`) |
| 4 | E | CUSTOMER NAME | copied from V2 `Customer Name` |
| 8 | I | Status Of Customer Manual | manual (`manual.statusManual`, default `"EXISTING"`) |
| 10 | K | Customer Category | `"<category> Category <pct>%"` composed string |
| 11 | L | Business Segment | mapped via `SEG_V2_TO_MASTERDATA` |
| 12 | M | TYPE OF CUSTOMER | V2 `Business Type`, upper-cased |
| 16 | Q | KYC REQUIRED | fixed `"Yes"` |
| 17 | R | KYC STATUS | fixed `"OK"` |
| 19 | T | Company GSTIN NO. | copied from V2 |
| 28 | AC | REGISTERED MOBILE NO. | copied from V2 `Registered Contact No.` |
| 35 | AJ | (Registered) Full Address | copied from Customer Addresses |
| 36 | AK | (Registered) City | |
| 37 | AL | (Registered) Country | fixed `"INDIA"` |
| 38 | AM | (Registered) State | |
| 39 | AN | (Registered) Pin Code | |
| 40 | AO | Select addres *(sic)* | fixed `"GSTIN REG."` |
| 41 | AP | (Billing) Full Address | copy of Registered address |
| 42 | AQ | (Billing) City | |
| 43 | AR | (Billing) Country | fixed `"INDIA"` |
| 44 | AS | (Billing) State | |
| 45 | AT | (Billing) Pin Code | |
| 49 | AX | Billing PLACE OF SUPPLY | = State |
| 57 | BF | Ship 1 label | fixed `"Ship1"` |
| 58 | BG | Ship 1 GSTIN | = Company GSTIN NO. |
| 59 | BH | Ship 1 PAN | derived: `MID(gstin,3,10)` |
| 60 | BI | Ship 1 Name | = Customer Name |
| 61 | BJ | Ship 1 Full Address | = Registered full address |
| 62 | BK | Ship 1 City | |
| 63 | BL | Ship 1 District (per existing rows) | fixed `"INDIA"` in code (comment flags this as odd — literally the country value written into what the doc calls "District") |
| 64 | BM | Ship 1 State | |
| 65 | BN | Ship 1 Pin Code | |
| 66 | BO | Ship 1 Ind Area (per existing rows) | = State (same "seems wrong" flag as BL) |
| 68 | BQ | Ship 1 Country | fixed `"India"` |
| 69 | BR | Ship 1 (further state field) | = State |
| 190 | GI | CONTACT PERSON NAME | copied from Customer Contacts |
| 191 | GJ | MOBILE NO. 1 | copied from Customer Contacts `Contact No. 1` |
| 194 | GM | DESIGNATION | copied from Customer Contacts |
| 225 | HR | BILLING PAYMENT TERMS EDIT | copied from V2 `Payment terms (Days)` — the EDIT/source column a downstream formula reads, not the formula column itself |
| 226 | HS | GRACE DAYS EDIT | copied from Customer Revisions `Grace Period (Days)` |
| 297 | KL | CUSTOMER MARKA CODE | copied from V2 `Marka Code` |
| 300 | KO | Account Type | copied from V2 `Account Type`, default `"Customer"` |

**Columns explicitly documented as ARRAYFORMULA/derived — NEVER write to
these directly**: A (s.no), B (DATE OF JOINING ADC), C (CUST ID — same
spill-formula pattern as `CUSTOMER MASTER T1`'s own `CUST ID`), F (customer
with id), G (Payment Terms With Days — derives from HR), H (Grace Days With
Days — derives from HS), J (Status Of Customer — derives from I), V (Company
PAN NO. — derives from T via MID), AU (Billing STATE CODE), plus HT/HU/KJ/
KK/CJ/KM (unlabeled derived columns per the source comment).

**All ~260 other columns of the 302-wide tab are genuinely unconfirmed** —
this reference app was built to replicate exactly what hand-filled rows
already contained (verified against MASTER CUSTOMER DATA rows 816-818 per
the source comment) for the ~35 columns above, and never needed the rest.
Building this tab in full requires either (a) a live header dump of all 302
columns before creating it, or (b) accepting that ZOTO's new IMS KYC flow
will only ever populate the same ~35-column subset and leave the remaining
columns blank on every new row (matching the reference's own behavior) —
this is a product decision, not something inferable from the reference
alone.

---

## Needs manual confirmation

Every item below could not be pinned down to a verified, ordered header list
from the reference project alone — each needs a live-sheet dump (once the
new spreadsheets exist, or against the reference's own live AppSheet if
still accessible) before being treated as final:

1. **Racks** (item 1) — column set is a reasonable reconstruction (`Rack ID,
   Rack No., Floor, Unit, Type, Status`) but exact order/full column count
   unverified; the sync function used a fully-generic mapping.
2. **ASSEMBLE RM FG** (item 2) — column names are real (confirmed via sync
   function + `lib/requisitions.ts`'s `BOM_COLS`) but left-to-right order is
   inferred, not verified.
3. **Vendor Tax Invoices / Upload Tax Invoice / Store In** (item 4/Purchase)
   — column existence and rough purpose confirmed; exact order unverified.
   `Purchase Order`/`PO Items` exist only as orphaned/never-wired reference
   code — treat as a proposal, not a spec, if built at all.
4. **Raw Materials Requisition / Assembly RM Requisition** (item 5) — no
   sheet-tab source exists anywhere in the reference (an external, un-shared
   Apps Script wrote these live); the header sets in this document are
   entirely PROPOSED, designed to fit the BOM-explosion logic ZOTO's own
   plan already commits to writing fresh.
5. **Customer KYC** (item 6) — only 6 fields are confirmed; the reference
   app never reads/writes the rest of this tab's presumed form fields.
6. **MASTER OF FG INVENTORY / Product Master** (items 7/8) — column names
   confirmed via sync function, order approximate (generic mapping fallback
   used in the sync code itself, not a hardcoded/verified column-letter
   list).
7. **Customer Addresses / Customer Contacts / Customer Revisions** (item 10)
   — only 6, 4, and 2 columns respectively (out of 20/23/26-wide tabs) are
   named anywhere in the reference; the remainder is completely unknown.
8. **MASTER CUSTOMER DATA** (item 11) — only ~35 of 302 columns are
   confirmed; building the tab in full requires either a live dump or a
   product decision to leave the rest blank matching the reference's own
   scope.
