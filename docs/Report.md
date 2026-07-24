# Old CRR System — Data Flow & ID Architecture Report

Source: **ADC SALE CRR V2** (Google Sheet, `11BFcZ3gHRUgl6KJx44CtpqcQMj5Pg1jtNAFV68PNkeE`), the
AppSheet-era system ZOTO SALES CRR is rebuilding. This document reverse-engineers the full
backend data model directly from the live sheet: every tab, every column, and — the actual
ask — **how records are linked to each other via ID columns** across the ~20-stage pipeline.

No app code exists for this old system (it was AppSheet, config-driven, not a hand-written
backend) — the sheet itself *is* the schema. Everything below was derived by reading each
tab's header row and one sample data row, then tracing which ID column in tab N reappears as
a foreign key in tab N+1.

---

## 1. The pipeline, in order

Each stage is its own tab (or 2–4 tabs: header + items + dispatch-lines). An order flows
through these left-to-right; each arrow is an ID handoff (detailed in §3):

```
Order Punch Initial ──▶ Order Punch ──▶ Order Punch Discount
                              │
                              ▼
                          Sale Order ──▶ SO Confirmation ──▶ SO Confirmation Dispatch
                                                                     │
                    (production side reconnects via Previous Item ID, not Conf ID)
                                                                     │
                     Pre Production Conf Items ──▶ Production Conf Items ──▶ Production Items
                                                                     │
                                                          Dispatch Items Approval
                                                              │            │
                                                       PDI Items      Pre Transport
                                                                              │
              Transport ──▶ Transport_SO ──▶ Transport_Products ──▶ Transport_Reached
                 │                                    │
                 │                              Stock_Release (unused today)
                 ▼                                    ▼
          Tax_Invoice ──▶ Tax_Invoice_SO ──▶ Tax_Invoice_Products
                 │
          Pre Dispatch ──▶ Vehicle Dispatch ──▶ Dispatch ──▶ LR
                                                     │
                                                  Delivery
```

Side ledgers that hang off `Dispatch`/`Transporter ID`, not part of the main chain:
`All Remarks Log`, `Transporter Ledger`, `Transporter Payment`, `Freight Collection Customer`.

Masters (no order data, referenced by ID from everywhere): `Customer Data`, `Transporter Data`,
`ADC Branch`, `CRR DD`, `UI`, `Permissions`.

---

## 2. ID prefix reference

Every transactional ID is `PREFIX-<8 lowercase hex chars>` (a few, like `CUST-0017`, are an
older 4-digit sequential scheme). This is **the exact format ZOTO's `nextId()`/`nextIds()`
already replicates** (`Backend/src/services/ids.ts`) — the ID redesign done earlier in this
project was already matching this system correctly.

| Prefix | Meaning | First appears in |
|---|---|---|
| `CUST-####` | Customer | Customer Data (master) |
| `TPT-########` | **Overloaded** — see gotcha below: both a *Transporter* (master, the company) and a *Transport* (a specific trip/vehicle dispatch event) | Transporter Data / Transport |
| `PRE-########` | Original draft order ("Previous ID") — created once, carried forward through *every* downstream tab as a stable join key | Order Punch Initial |
| `PRE-ITM-########` | Draft line item ("Previous Item ID") | Order Punch Items Initial |
| `PRE-DISP-########` | Draft dispatch-plan line | Order Punch Dispatch Initial |
| `PNCH-########` | Finalized/confirmed order ("Punch ID") | Order Punch |
| `PNCH-ITM-########` | Finalized line item | Order Punch Items |
| `PNCH-DIS-########` | Finalized dispatch-plan line | Order Punch Dispatch |
| `REV-########` / `ITM-REV-########` / `DIS-REV-########` | Revision IDs — a Punch/Item/Dispatch can be re-punched; each revision gets a new ID while `Previous ID` stays constant | Order Punch / Items / Dispatch |
| `PUNCH-DISC-########` | Discount applied to a Punch | Order Punch Discount |
| `SALE-########` / `SALE-ITM-########` | Sale Order (header/item) | Sale Order(-Items) |
| `CONF-########` / `CONF-ITM-########` / `CONF-DIS-########` | SO Confirmation (header/item/dispatch-line) | SO Confirmation(-Items/-Dispatch) |
| `PRE-PD-CONF-########` | Pre-Production Confirmation line | Pre Production Conf Items |
| `PD-CONF-ITM########` | Production Confirmation line (no hyphen before hex — inconsistent formatting in the source) | Production Conf Items |
| `PDCN-ITM-########` | Production run line | Production Items |
| `DISP-CONF-ITM-########` | Dispatch **Approval** line (= ZOTO's Dispatch Approval) | Dispatch Items Approval |
| `PDI-ITM-########` | Quality inspection line | PDI Items |
| `PRE-TPT-########` | Pre-Transport (packaging/load) line | Pre Transport |
| `TPT-SO-########` | Transport × Order junction | Transport_SO |
| `TPT-PD-########` | Transport × Order × Item junction | Transport_Products |
| `TPT-RCH-########` | Vehicle-arrived confirmation | Transport_Reached |
| `Stock_Pd_ID` | Stock release line (column exists, tab is currently empty — never used in production) | Stock_Release |
| `INVC-########` / `INVC-SO-########` / `INVC-PD-########` | Tax Invoice (header/order/item) | Tax_Invoice(-SO/-Products) |
| `PRE-DISP-########` (2nd use) | Pre-Dispatch record — **reuses the same prefix** as the unrelated draft-dispatch ID above, in a different tab/context | Pre Dispatch |
| `VHCL-DISP-########` | Vehicle-level dispatch confirmation | Vehicle Dispatch |
| `DISP-########` | Final gate-out record | Dispatch |
| `LR-########` | Lorry Receipt | LR |
| `DLRY-########` | Proof of delivery | Delivery |
| `RMK-########` | Cross-stage remark (polymorphic — see §5) | All Remarks Log |
| `LEDG-########` | Transporter ledger entry | Transporter Ledger |
| `TPT-PMT-########` | Transporter payment | Transporter Payment |
| `DD-########` | Dropdown value | CRR DD |

---

## 3. The ID handoff chain (how one order's data actually flows)

Reading a single order's journey through the IDs, stage by stage:

1. **Order Punch Initial** — a quick-capture draft. Generates `Previous ID` (`PRE-...`) for
   the header, `Previous Item ID` (`PRE-ITM-...`) per item, `Previous Dispatch ID`
   (`PRE-DISP-...`) per planned dispatch line. `Previous ID` is the one constant that survives
   into **every single downstream tab**, all the way to Delivery — it's the closest thing this
   system has to a canonical "Order ID."
2. **Order Punch** — the formal/confirmed version. Takes `Previous ID` and mints `Punch ID`
   (`PNCH-...`) + `Revision ID` (`REV-...`). **Revisions are real**: the sample data shows two
   rows sharing one `Previous ID` but different `Punch ID`/`Revision ID` — labeled "Tally 1
   (Registered)" and "Tally 2 (Unregistered)" (see §5 for what "Tally" actually meant).
   `Order Punch Items` links `Previous Item ID → Punch Item ID` (+ `Item Revision ID`);
   `Order Punch Dispatch` links `Previous Dispatch ID → Punch Dispatch ID` (+
   `Dispatch Revision ID`).
3. **Order Punch Discount** — logged against `Punch ID`, mints `Punch Discount ID`.
4. **Sale Order** — takes `Punch ID → Sale ID` (`SALE-...`). Items: `Punch Item ID → Sale
   Item ID`. Still carries `Previous ID` and `Punch ID` for traceability.
5. **SO Confirmation** — `Sale ID → Conf ID` (`CONF-...`). Items: `Sale Item ID → Conf Item
   ID`. `SO Confirmation Dispatch` chains `Punch Dispatch ID → Conf Dispatch ID`.
6. **Pre Production Conf Items** — here the chain **branches away from the Sale/Conf
   lineage** and reconnects directly to `Previous Item ID` (the very first draft ID), minting
   `Pre Pd Conf Item ID`. Production planning is tied to the physical part from the earliest
   capture point, not to whichever confirmation revision is current.
7. **Production Conf Items** — `Pre Pd Conf Item ID → Pd Conf Item ID`. This is the
   "can we actually fulfill this" check: `Balance Quantity`, `Available Stock`,
   `To be Produced`, `New Balance Quantity`.
8. **Production Items** — `Pd Conf Item ID → Production Item ID`. Real production tracking:
   `Production Quantity`, `Production Stage`, `Production Remarks`, running balance.
9. **Dispatch Items Approval** — also branches from `Pre Pd Conf Item ID → Disp Conf Item
   ID`. **This is the direct ancestor of ZOTO's Dispatch Approval module** — same four
   outcomes exist here already: `Dispatch Approval` column values include "Dispatch Today,"
   plus `Approved Quantity` / `Short Quantity` / `Excess Quantity` / `Next Extended Date` /
   `Dispatch Remarks` columns — an exact match to what was just built in
   `Frontend/src/modules/dispatch-approval/DispatchApprovalForm.tsx`.
10. **PDI Items** — quality inspection, `Disp Conf Item ID → PDI Item ID`. Captures sample
    size, box quantity, PDI attachment, and a `Send PDI to Customer` flag.
11. **Pre Transport** — packaging/load-limit planning, `Disp Conf Item ID → Pre Transport
    ID`.
12. **Transport** — a **vehicle/trip-level** record, its own `Transport_ID`. Not linked to any
    specific order by itself — one truck can carry multiple orders.
    - **Transport_SO** — junction: `Transport_ID` + `Previous ID` (order) → `Transport_SO_ID`.
    - **Transport_Products** — junction: `Previous Item ID` + `Transport_ID` +
      `Transport_SO_ID` → `Transport_Pd_ID` (the actual load quantity per item per trip).
    - **Transport_Reached** — `Transport_ID → Transport_Reach_ID` (vehicle arrival ping).
13. **Stock_Release** — designed to link `Transport_Pd_ID → Stock_Pd_ID` for inventory
    release bookkeeping. **Currently empty (0 data rows) — dead/unused in production**, but
    the column structure is real (Vehicle Details + Stock Release Details with a
    `Release Quantity`/`Type`/`From` breakdown).
14. **Tax_Invoice** — `Transport_ID → Invoice_ID`. **Tax_Invoice_SO**:
    `Transport_SO_ID → Invoice_SO_ID`. **Tax_Invoice_Products**: `Transport_Pd_ID →
    Invoice_Pd_ID` (adds `COGS`, `GP Per Piece`, `GP Per Order Qty` — this is where margin
    gets computed).
15. **Pre Dispatch** — `Transport_ID → Pre Dispatch ID`, pulls in the Tax Invoice/E-Way Bill
    attachment references ahead of the final gate-out.
16. **Vehicle Dispatch** — `Transport_ID → Vehicle_Dispatch_ID` (vehicle-level dispatch
    confirmation + freight terms).
17. **Dispatch** — `Transport_ID` + `Pre Dispatch ID` + `Vehicle_Dispatch_ID → Dispatch ID`.
    The actual gate-out event: gate pass attachment, freight/other charges, payment status.
18. **LR** — `Dispatch ID → LR ID` (Lorry Receipt document, LR charges, payment status).
19. **Delivery** — `Dispatch ID → Delivery ID` (proof of delivery: `Delivered` flag,
    `Receiving Attachment`, any extra charges).

**Cross-cutting, not part of the linear chain:**
- **All Remarks Log** is polymorphic — `Step ID` + `Step` (a stage name string, e.g.
  "Production Confirmation") let one tab hold comments against records from *any* other
  stage, keyed by whatever ID that stage uses.
- **Transporter Ledger / Transporter Payment / Freight Collection Customer** are accounting
  side-ledgers keyed off `Dispatch ID` / `Transporter ID`, tracking freight
  payable/receivable, independent of the order pipeline itself.

---

## 4. Masters (referenced by ID, not part of the order chain)

| Tab | Role | Key column(s) |
|---|---|---|
| `Customer Data` | Buyer master | `CUST ID` |
| `Transporter Data` | Transport company master | `Transporter ID` (`TPT-...` — see gotcha) |
| `ADC Branch` | Seller/branch master | `Branch ID` — direct ancestor of ZOTO's `SALLER_MASTER` |
| `CRR DD` | Dropdown value list | `DD ID`, `Column`, `Value (Text)` — carried into the new sheet's `CRR DD` tab essentially unchanged |
| `UI` | Module/view registry: `Name`, `View`, `Location`, per-module `Show Permission Email` list, `ADD`/`EDIT`/`DELETE` flags | direct ancestor of ZOTO's `Frontend/src/lib/modules.ts` + the `CAN_ADD`/`CAN_EDIT`/`CAN_DELETE` columns on `USERS` |
| `Permissions` | `Email`, `Password`, `Process` (comma-separated module names) | direct ancestor of ZOTO's old email-based `USERS` sheet (before the Employee-Id restructure) — `Process` values map 1:1 to what `parseModules()` in `Backend/src/services/permissions.ts` already aliases |

---

## 5. Data-quality notes and gotchas (worth knowing before replicating any of this)

- **`TPT-` prefix is overloaded.** It's used for both the *Transporter* master record
  (a company, e.g. `TPT-659f4c7b` = "SALIM TRANSPORT") and the *Transport* trip/dispatch
  event (e.g. `TPT-764a0cb2`, a specific vehicle run). If/when ZOTO builds its own Transport
  module, give these genuinely different prefixes (e.g. `TPTR-` vs `TRIP-`) to avoid the
  ambiguity this system has.
- **"Tally 1 (Registered)" / "Tally 2 (Unregistered)"** is a real GST-registration split —
  each Order Punch revision represents a separate invoicing line for registered vs.
  unregistered buyer variants, not a placeholder. This is *unrelated* to the `"Tally 1
  (Registered)"` **hardcoded dead string** that was in the new ZOTO Punch Order list/detail
  view (removed earlier this session) — that one was leftover UI scaffolding that was never
  wired to real per-registration logic, since the new system doesn't (yet) implement
  dual-registration invoicing.
- **`Previous ID` is the real "Order ID," not any of the later stage-specific IDs.** ZOTO's
  new design already improves on this: a single stable `ORDER_ID` is generated once at Punch
  and reused everywhere (`ORDER_PUNCH`, `SALE_ORDERS`, `ORDER_ITEMS`, `SALE_ORDER_ITEMS`),
  rather than needing a `Previous ID`/`Punch ID`/`Sale ID`/`Conf ID` chain plus a separate
  "what's the real order" convention. Keep that simplification — don't reintroduce a
  multi-ID chain when building out Production/Transport/Tax Invoice/Dispatch/LR/Delivery.
- **Revisions have no ZOTO equivalent yet.** The old system lets one order get re-punched
  into a brand-new `Punch ID`/`Revision ID` while keeping `Previous ID` constant. ZOTO's
  closest analog is SO Confirmation's "Changes" outcome, but that mutates the existing
  `ORDER_PUNCH`/`SALE_ORDERS` rows in place rather than creating a new revisioned record —
  a deliberate simplification, not an oversight, but worth flagging if audit-trail-per-
  revision ever becomes a requirement.
- **`Customer Data` returned only 1 data row on export** despite clearly being the buyer
  master (referenced by hundreds of `CUST ID`s elsewhere) — likely a formula-driven view
  (e.g. `QUERY()`) whose spilled range doesn't get captured by CSV export, not an indication
  the master is actually empty. Don't take tab row-counts at face value for formula-backed
  tabs.
- **`_PII_`** appearing in place of a `Useremail` value (seen in `Transport_SO`) is Google
  Workspace's automatic PII redaction on a shared/exported view — not a literal stored value.
- **`#REF!` / `#N/A` / `#VALUE!`** appear scattered across several tabs (`ADC Branch` row 2,
  `Customer Data` row 2, all of `Sheet60`) — broken formula references from sheet edits over
  time. `Sheet60` in particular (8 unlabeled columns, `#VALUE!` data) appears fully orphaned
  and should not be treated as a real tab.
- **`Copy of Transport 1`, `Copy of Transport_SO`, `Copy of Transporter Ledger`** are
  abandoned duplicate/backup tabs sitting alongside the live ones — not part of the active
  pipeline, safe to ignore entirely.
- **`Reserved BOM`** (19,290 rows, just `Previous Item ID` + `BOM Key`) is a bill-of-materials
  reservation join table — likely inventory/production planning support that never got a
  visible UI tab of its own in the enumerated module list.

---

## 6. What ZOTO has already built vs. what this maps to

| Old system stage(s) | ZOTO status |
|---|---|
| Order Punch Initial + Order Punch (+ Discount) | **Built** — `ORDER_PUNCH`/`ORDER_ITEMS`, `ORDER_PUNCH_DISCOUNT` |
| Sale Order (+ Items) | **Built** — `SALE_ORDERS`/`SALE_ORDER_ITEMS` |
| SO Confirmation (+ Items) | **Built** — `SO_Confirmation`/`SO_Confirmation_Items` snapshot logs, live state on `ORDER_PUNCH`/`SALE_ORDERS` |
| Dispatch Items Approval | **Built** — `Dispatch_Approval`, `DispatchApprovalForm.tsx`, just wired to persist |
| Pre Production Conf Items → Production Conf Items → Production Items | Not started. `permissions.ts`'s `production` module alias is a forward-looking placeholder for this |
| PDI Items | Not started. `pdi` module alias already stubbed |
| Pre Transport, Transport, Transport_SO, Transport_Products, Transport_Reached | Not started. `transport` / `transport-reached` module aliases already stubbed |
| Stock_Release | Not started (and effectively unused in the old system too) |
| Tax_Invoice (+ SO/Products) | Not started. `tax-invoice` module alias already stubbed |
| Pre Dispatch, Vehicle Dispatch, Dispatch | Not started. `dispatch` module alias already stubbed |
| LR | Not started. `collect-lr` module alias already stubbed |
| Delivery | Not started. `delivery` module alias already stubbed |
| All Remarks Log, Transporter Ledger, Transporter Payment, Freight Collection Customer | Not started — no module alias yet; would need one if/when built |

The `Backend/src/services/permissions.ts` `MODULE_ALIASES` map already anticipates almost
this entire remaining pipeline by name — whoever set those up previously was clearly working
from this same old sheet.

---

*This report is a point-in-time read of the old sheet (fetched via CSV export of every tab,
header row + one sample row each) — it does not modify anything in either the old or new
sheet.*
