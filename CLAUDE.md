# ZOTO SALES CRR — Project Context

Read this first, every session. Keep it current — whenever a change touches architecture,
schema, deploy config, or trips a gotcha worth remembering, update this file in the same
turn as the change. Full change-by-change history lives in `docs/CHANGELOG.md`; this file
is the short, current-state summary — don't let it grow into a second changelog.

## Structure

- `Frontend/` — React + Vite SPA. Deployed on Vercel as `zoto-frontend`.
- `Backend/` — Express API. Deployed on Vercel as `zoto-backend`.
- `docs/` — `01`–`07` are the original planning docs (PRD, TRD, app flow, UI brief, backend
  schema, implementation plan, sheet redesign plan). `CHANGELOG.md` is the running log.

## Deploy

Backend:
```
cd "C:\Users\ADMIN\Desktop\ZOTO SYSTEM\Backend"
npx.cmd vercel --prod
```
Frontend:
```
cd "C:\Users\ADMIN\Desktop\ZOTO SYSTEM\Frontend"
npx.cmd vercel --prod
```
Deploy Backend whenever `Backend/` changed; Frontend whenever `Frontend/` changed. Check
`git status`/the diff to know which (or both).

## HOME (app launcher)

The `/` route is a ZOTO-wide app launcher, not part of the Sales CRR module — mirrors the
old AppSheet setup where one HOME app fanned out to every business process (After Sales,
Checklist, Delegation, IMS, NPD Designs, ONE, Purchase, Sales CRR, Training Videos, HRMS,
…) as its own separate sub-app. Tiles come from a **fourth, separate spreadsheet**
(`ZOTO_HOME_SHEET_ID` env var, tab `ZOTO HOME` — columns `Name`, `View` (a GUID or slug used
as the URL segment), `Image` (icon URL), `Email Permisssions/ Employee ID` (blank = visible
to everyone, else a comma-separated Employee Id allowlist — same fail-open convention as
`USERS.Permissions_Process`), `Filter`), not hardcoded — a new sheet row shows up on next
page load with no deploy. Backend: `Backend/src/routes/home.ts` (`GET /api/v1/home/tiles`,
5 min cache since this data changes rarely). Frontend: `Frontend/src/pages/Home.tsx` renders
the tile grid (same `NavCard`-style layout as `ModuleHome.tsx`); every tile navigates to
`/home/:view` → `ComingSoon.tsx` (now reads the tile's name from router `state` to show
"`{name}` is under construction" instead of the generic message) **except** the tile whose
`Name` starts with `"SALES CRR"`, which routes to `/modules` — the one sub-app actually built
so far. Adding a 2nd real sub-app later means special-casing its tile name in `Home.tsx`'s
`hrefFor()` the same way, not building a new launcher.

## Frontend structure

`Frontend/src/modules/order-punch/` is the main working area: `OrderPunchList.tsx` (shared
list, reused for both Punch Order and Sale Order routes via a `basePath` prop derived from
the URL), `OrderPunchForm.tsx` (4-tab punch form, `form/Tab1-4*.tsx` + `form/types.ts` for
form state), `OrderDetail.tsx` (detail view, also shared between both modules),
`SaleOrderDiscountForm.tsx` / `SaleOrderUploadForm.tsx` (the two Sale Order step modals).
`Frontend/src/modules/so-confirmation/SoConfirmationList.tsx` is the next-stage queue: it
reads saved `SALE_ORDERS` rows, uses the approved list/table pattern with a Completed toggle,
and opens the shared `OrderDetail`/items routes under `/modules/so-confirmation/:orderId`.
The detail action rail opens `SoConfirmationForm.tsx` — Confirmed/Changes/Cancelled is fully
wired: Confirmed captures payment fields, Changes reveals the same Tab1/3/4 punch-form
components prefilled with the order's current data (edits post back and update both
`ORDER_PUNCH`+`SALE_ORDERS`), Cancelled just takes a remark. All three persist via
`POST /orders/:id/so-confirmation`. Changes also gets a 6th "GST Details" tab
(`ConfirmationItemsTab.tsx`) for editing the order's actual line items — same search/qty/
price/GST-slab pattern as the punch form's item editor — which on save **replaces**
`ORDER_ITEMS`+`SALE_ORDER_ITEMS` for that order and recalculates `BASIC_AMOUNT`/`TAX_AMOUNT`/
`TOTAL_AMOUNT` on both `ORDER_PUNCH`/`SALE_ORDERS`; the tab also has its own editable
Invoice Discount (Rs) field (works standalone too — editing it without touching items just
recomputes `TOTAL_AMOUNT` against the existing basic/tax). `Frontend/src/modules/
dispatch-approval/DispatchApprovalList.tsx` is the next-stage queue (same list pattern), fed
by orders whose `ORDER_PUNCH.STATUS` got set to `DISPATCH APPROVAL` on Confirm. Its detail
action rail opens `DispatchApprovalForm.tsx` — Dispatch Approval dropdown (Dispatch Today /
Dispatch Extended / Short Quantity / Excess Quantity) with live validation, persists via
`POST /orders/:id/dispatch-approval`.

**PDI and Pre Transport** are the two simple, single-order stages between Dispatch Approval
and the trip system below, driven by one generic, config-based implementation:
- `Frontend/src/lib/stages.ts` — `STAGES` array (just `pdi`/`pre-transport` now — the other
  6 entries this array used to hold were superseded by the trip system, see below), one
  `StageDef` per stage: `key` (also the URL segment and API path), `label`, `prevStatus`/
  `nextStatus` (the `ORDER_PUNCH.STATUS` values that gate its pending queue and that it
  advances to), and a `fields[]` list driving the form (types: `text`/`number`/`date`/
  `datetime-local`/`yesno`/`file`).
- `Frontend/src/components/stage/StageQueueList.tsx` — the one list component for both
  (same Completed-toggle/customer-filter pattern as every other queue), rendered via
  `App.tsx`'s `STAGES.map(...)` route generation.
- `Frontend/src/components/stage/StageForm.tsx` — the one modal form for both, rendering
  whichever fields the `StageDef` declares.
- `OrderDetail.tsx` derives `currentStage` from the URL's module segment and shows a single
  generic "Give `{label}` Form" action whenever `order.STATUS === currentStage.prevStatus` —
  no per-stage QuickAction wiring needed.
- Backend mirror: `Backend/src/routes/stageConfig.ts` (`STAGES`, one `StageConfig` per
  stage — tab name, ID prefix/column, prev/next status, fields) and `stageRoutes.ts`
  (`registerStageRoutes()`, called from `orders.ts` **before** the generic `GET /:id` route
  so Express doesn't swallow e.g. `GET /pdi` as `:id="pdi"`). Each stage's tab (`PDI`,
  `Pre Transport`) is brand-new — plain internal `UPPER_SNAKE` headers, no translation-map
  file needed (unlike `ORDER_PUNCH`/`SO_Confirmation`), created on first use via
  `ensureSheetTab`. **If frontend and backend `stages.ts`/`stageConfig.ts` ever drift out of
  sync again, `App.tsx`'s static route for a leftover frontend-only key will silently shadow
  whatever real module lives at that same URL** — this exact bug happened once already (see
  Known gotchas) and cost a full debugging pass to catch, so always edit both files together.

**Transport through Delivery** (Transport, Transport Reached, Stock Release, Tax Invoice,
Dispatch, Collect LR, Delivery) are **trip-level, not order-level** — reverse-engineered from
the old CRR/ADC system (`docs/Report.md`): one truck/invoice/dispatch/LR/delivery run (a
"trip") can carry several orders at once, matched by the live sheet's `Transport_SO`/
`Tax_Invoice_SO` junction tabs — a deliberate, user-confirmed design choice, not a
simplification of the order-level pattern above.
- Backend: `Backend/src/routes/tripRoutes.ts` (mounted at `/api/v1/transport-trips`) — full
  lifecycle `create` → `attach orders` → `reached` → `stock-release` → `tax-invoice` →
  `pre-dispatch` → `vehicle-dispatch` → `dispatch` → `lr` → `delivery`, each step appending a
  row to its own tab and cascading `ORDER_PUNCH.STATUS` on every attached order. Every
  handler except the very first (`create`) must also call `updateRow(.... "TRANSPORT", ...,
  { Status: ... })` to advance the **trip's own** status column — this was missed once on
  `/lr` (see Known gotchas) and silently stuck every trip forever in the Collect LR queue,
  so when adding a new trip-stage handler, copy an existing one (e.g. `/dispatch` or
  `/delivery`) rather than writing from scratch.
  `Backend/src/routes/tripMap.ts` provides `orderSnapshotToSheet()`/`vehicleSnapshotToSheet()`
  — one shared buyer/billing/logistics/vehicle snapshot object spread into every trip-family
  tab's `appendRow` call (`appendRow` silently drops whichever keys a given tab doesn't have
  as a column, so one spread safely works across tabs with different column sets).
- Frontend: `Frontend/src/lib/tripsApi.ts` (API client), `Frontend/src/lib/tripStages.ts`
  (`TRIP_STAGES`, 6 entries — Transport itself has no entry here, it's `TransportList.tsx`'s
  own route since it's the only one with a create-trip action instead of a stage form),
  `Frontend/src/components/stage/TripQueueList.tsx` (one generic list for all 7
  Transport-family routes), `Frontend/src/modules/transport/` — `TransportList.tsx`
  (wraps `TripQueueList` + `CreateTripModal`), `CreateTripModal.tsx` ("Transport Main Form"
  clone), `TripDetail.tsx` (shared detail page across all 7 routes, derives the current
  stage from the URL segment the same way `OrderDetail.tsx` does), `AttachOrdersModal.tsx`
  (multi-select eligible-orders picker), `forms/` (one component per stage — `ReachedForm`,
  `StockReleaseForm`, `TaxInvoiceForm`, `DispatchForm`, `LRForm`, `DeliveryForm`; field
  layouts sourced from the old AppSheet frontend screenshots in `docs/04-UIUX-BRIEF.md` §9).
  `DispatchForm` is a deliberate UI compression: the old frontend nested Vehicle Dispatch →
  Dispatch Details → per-entry Dispatch Form 3 levels deep, but the doer-facing fields all
  collapse onto one screen here, which calls `pre-dispatch`→`vehicle-dispatch`→`dispatch`
  sequentially on save.

`Frontend/src/lib/` holds the API clients (`ordersApi.ts` — includes the generic
`listStageOrders(stageKey, status?)`/`submitStageForm(stageKey, orderId, payload)` used by
the two order-level stages, `tripsApi.ts` for the trip system above, `mastersApi.ts`,
`attachments.ts` for the upload-viewer flow, `api.ts` for the shared axios instance + auth
header).

Env: `Frontend/.env.local` needs `VITE_API_BASE_URL` pointing at the deployed Backend in
prod (local dev proxies relative `/api/v1` to the Backend dev server instead).

## Auth & Permissions

Login is by **Employee Id + Password** (not email) against the `USERS` tab — columns
`Employee Id`, `Password`, `Name`, `Permissions_Process`, `CAN_ADD`, `CAN_EDIT`, `CAN_DELETE`
(exact header text, matched case-insensitively on `Employee Id`; password is plain text,
matched exactly). JWT-based (`Backend/src/middleware/auth.ts`, `JWT_SECRET` env var);
`AuthUser`/JWT payload carries `employeeId`/`name`/`modules`/`canAdd`/`canEdit`/`canDelete` —
no `email`/`role` fields anymore. The Login page's field is labelled "ID", not "Email"
(`Frontend/src/pages/Login.tsx`).

Permissions are read **live** from the `USERS` sheet on every request (not trusted from the
JWT), so an admin edit to a user's row takes effect within seconds:
- `Permissions_Process` column — comma-separated module/process names (or blank/`ALL` =
  unrestricted, fail-open). `"Admin"` anywhere in the list = full access (`modules: "ALL"`).
  Aliases old Process names case-insensitively (`Sale Order` etc.) — see `permissions.ts`.
- `CAN_ADD` / `CAN_EDIT` / `CAN_DELETE` columns — `Yes`/`true`/`1` = granted. Only
  `CAN_DELETE` is currently wired to a route guard (Punch Order list's bulk-delete,
  fail-closed: blank = no access, since it's irreversible); `CAN_ADD`/`CAN_EDIT` are parsed
  and exposed on `req.user`/the frontend `AuthUser` but not yet gating any route/UI.
All four are managed by hand-editing the sheet, not through an in-app admin UI (deliberate).
Passwords are the one exception: a logged-in doer can self-service change their own password
via Settings (`POST /auth/change-password`, requires the current password, writes straight
back to their `Employee Id` row's `Password` cell — nobody else's row can be targeted since
the row is matched on the JWT's own `employeeId`, not a request param).

## Google Sheets (source of truth)

Four spreadsheets, IDs in `Backend/.env` (`ZOTO_TRANSACTIONS_SHEET_ID`,
`CUSTOMER_BILLING_SHEET_ID`, `TRANSPORT_SHEET_ID`, `FG_SHEET_ID`, `ZOTO_HOME_SHEET_ID` — the
last one is the HOME app-launcher tile list, see the HOME section above, unrelated to Sales
CRR order data).

**Transactions sheet** — key tabs:
- `ORDER_PUNCH` — the order header (renamed from `ORDERS`, human-readable column names like
  `Purchase_Order_No.`). The API keeps old internal field names (`PO_NO`, `CUSTOMER_NAME`,
  …) and translates via `Backend/src/routes/orderPunchMap.ts` (`punchToSheet`/
  `punchFromSheet`) on every read/write. No `CURRENT_STAGE` column exists — reads synthesize
  `CURRENT_STAGE: "Punch"`. **Pending vs Completed lists filter on `STATUS`, not
  `CURRENT_STAGE`** (`STATUS === "SALE ORDER"` = completed).
- `ORDER_ITEMS` — line items, column names unchanged (`FG_ID`, `PART_NO`, `PRICE`, `QTY`, …).
- `SALE_ORDERS` / `SALE_ORDER_ITEMS` — created when the Sale Order form is saved: a full
  copy of the punch order-header fields + carried discount + `SO_NO`/`SO_DATE`/attachment,
  and a copy of each `ORDER_ITEMS` row respectively. Mapped via `SALE_ORDER_MAP` (reuses
  `ORDER_PUNCH_MAP`, only the discount column name differs). `SALE_ORDER_ITEMS` uses the
  *same* column names as `ORDER_ITEMS` — no translation needed there.
- `Order Punch Discount` — pre-built audit log of every discount applied (headers: `Timestamp`,
  `Useremail`, `ORDER_ID`, `ITEM_ID`, `Punch Discount ID`, `Discount Reasion` [tab's own
  typo], `Description`, `Default Discount on`, `Discount (Rs)`, `Discount (%)`, `Status`).
  `ensureSheetTab()` is still called defensively but the tab already exists live — don't
  confuse this with the old auto-created `ORDER_PUNCH_DISCOUNT` name, which is now dead/
  orphaned (a past mismatch, since fixed). **`POST /orders/:id/discount` writes this log row
  BEFORE flipping `ORDER_PUNCH.STATUS`** (not after) — a real production case surfaced an
  order whose status had advanced to `PENDING SALE ORDER` with zero matching row in this tab
  (root cause not pinned down after direct reproduction attempts against the live sheet came
  back clean), so the write order was flipped defensively: if the log append ever fails, the
  order now stays exactly as-is with the Discount action still showing, instead of silently
  advancing with no audit trail. Follow this same log-then-advance order for any other
  status-changing route that also writes to an audit-log tab.
  **The discount is now applied per line item, not just at the order level** (`ITEM_ID` used
  to be permanently blank here — the sheet had it ready for this "future" use, per the sheet-
  redesign plan doc, before it was actually wired up): the doer's single reason/description/
  type/amount still applies once, but the route reads `ORDER_ITEMS`, splits the Rs amount
  across items **proportional to each item's current `BASIC_AMOUNT`** (so every item ends up
  with the same effective % off, whether the doer entered a flat Rs or a %), recalculates each
  item's CGST/SGST/IGST via `splitGst()` off its new discounted basic amount, and writes one
  `Order Punch Discount` row per item (with that item's own `ITEM_ID` and its *own* discount
  share, not the order total). `ORDER_ITEMS.DISCOUNT_RS`/`DISCOUNT_PCT` are cumulative — they
  always represent the item's total discount to date (punch-time + every Sale Order discount
  applied since), so `BASIC_AMOUNT = Price×Qty − DISCOUNT_RS` keeps holding everywhere else
  that reads it. `ORDER_PUNCH.BASIC_AMOUNT`/`TAX_AMOUNT`/`TOTAL_AMOUNT` are then resummed from
  the (now-discounted) items, same as the SO Confirmation Changes item-replace flow already
  does. A partial punch with no items yet falls back to the old order-level-only behavior
  (one log row, blank `ITEM_ID`, discount applied straight against the order's own totals).
- `COUNTERS` — leftover from the old sequential-ID scheme, no longer written to (see IDs
  below). Don't delete it — just not the ID source anymore.
- `CRR DD` — dropdown value lists (e.g. Sale Type: Order/Sample/Return Order/Pilot Lot).

**Customer/Billing sheet** — `CUSTOMER MASTER T1` (buyer segment/contact auto-fill source),
`SALLER_MASTER` (seller/branch — currently one branch, `ZOTO-001`, auto-filled on every
punch save), `BILLING STRATEGY MASTER`.

**Pipeline so far:** Punch (`ORDER_PUNCH`, `STATUS: PENDING`) → discount applied
(`STATUS: PENDING SALE ORDER`, logged to `Order Punch Discount`) → Sale Order form uploaded
(`STATUS: SALE ORDER`, full row written to `SALE_ORDERS`/`SALE_ORDER_ITEMS`) → SO Confirmation
queue (`GET /orders/sale-orders`) → `POST /orders/:id/so-confirmation` outcome:

**Undoing a discount**: there's no in-app "undo" button (matches the app's hand-edit-the-sheet
convention elsewhere) — a doer deletes the order's row from `Order Punch Discount` directly in
the sheet, and `orders.ts`'s `revertOrphanedDiscounts()` (called from `GET /orders` and
`GET /orders/:id`) detects at read time that an order is `PENDING SALE ORDER` with no matching
log row and no `SALE_ORDERS` row yet, and reports it back as `PENDING` with the discount zeroed
— purely a read-time computation, nothing is written back to `ORDER_PUNCH`. Once `SALE_ORDERS`
exists for the order (Sale Order form uploaded), the discount is considered locked in and
deleting the log row no longer does anything — revert only applies while still at the discount
stage, a deliberate scope decision (not "always revert regardless of stage").
- **Confirmed** → `SALE_ORDERS.STATUS: COMPLETED`, `ORDER_PUNCH.STATUS: DISPATCH APPROVAL`
  (this is what feeds the Dispatch Approval queue — `GET /orders/dispatch-approvals` reads
  `ORDER_PUNCH` filtered on that status, **not** `SALE_ORDERS`, since `SALE_ORDERS` has no
  `Approval_Status`/`Status`-for-this-purpose columns of its own).
- **Changes** → both `ORDER_PUNCH` and `SALE_ORDERS` get the edited fields + `APPROVAL_STATUS:
  CHANGES`, stays in the pending SO Confirmation queue.
- **Cancelled** → `SALE_ORDERS.STATUS: COMPLETED`, `ORDER_PUNCH.STATUS: CANCELLED`.

Confirmed → Dispatch Approval queue (`GET /orders/dispatch-approvals`) → `POST
/orders/:id/dispatch-approval` sets `ORDER_PUNCH.STATUS: DISPATCH APPROVAL COMPLETED` (which
is what `?status=COMPLETED` on that same GET route filters on).

Confirmed → Dispatch Approval queue (`GET /orders/dispatch-approvals`) → `POST
/orders/:id/dispatch-approval` sets `ORDER_PUNCH.STATUS: DISPATCH APPROVAL COMPLETED` (which
is what `?status=COMPLETED` on that same GET route filters on), appending one row per item
to **`Dispatch Items Approval`** (renamed from `Dispatch_Approval` in the sheet's "final"
pass — see Known gotchas).

From there, two simple single-order stages (`Backend/src/routes/stageConfig.ts` /
`stageRoutes.ts`, `Frontend/src/lib/stages.ts`): `DISPATCH APPROVAL COMPLETED → PDI
COMPLETED → PRE TRANSPORT COMPLETED` (`POST /orders/:id/pdi`, `POST
/orders/:id/pre-transport`, one row per item appended to `PDI`/`Pre Transport`). Both are
"per-item" stages — `StageConfig.perItem: true` — auto-filling buyer/order snapshot fields
via `orderSnapshotToSheet()` (`tripMap.ts`), same helper the trip system below uses.

**From `PRE TRANSPORT COMPLETED` onward, everything is trip-level, not order-level** —
`Backend/src/routes/tripRoutes.ts` (mounted at `/api/v1/transport-trips`, separate from
`ordersRouter`). One truck/invoice/dispatch/LR/delivery can carry **several orders at
once** (via the `Transport_SO`/`Tax_Invoice_SO` junction tabs), matching the old ADC system
exactly (`docs/Report.md`) — this is a deliberate, user-confirmed design choice, not a
simplification. Lifecycle:
1. `POST /transport-trips` — create a trip (vehicle details), mints `Transport_ID`.
2. `POST /transport-trips/:id/orders` — attach one or more orders (from `GET
   /transport-trips/eligible-orders`, `STATUS === "PRE TRANSPORT COMPLETED"`). Appends one
   `Transport_SO` row per order + one `Transport_Products` row per item, sets
   `ORDER_PUNCH.STATUS: TRANSPORT ASSIGNED` for every attached order.
3. `.../reached`, `.../stock-release`, `.../tax-invoice`, `.../pre-dispatch`,
   `.../vehicle-dispatch`, `.../dispatch`, `.../lr`, `.../delivery` — each appends to its
   own tab (`Transport_Reached`, `STOCK_RELEASE`, `TAX_INVOICE`+`Tax_Invoice_SO`+
   `Tax_Invoice_Products`, `Pre Dispatch`, `Vehicle Dispatch`, `Dispatch`, `LR`,
   `DELIVERY`) and **cascades the resulting `ORDER_PUNCH.STATUS` to every order attached to
   the trip** (`TRANSPORT REACHED → STOCK RELEASED → TAX INVOICE COMPLETED → PRE DISPATCH
   COMPLETED → VEHICLE DISPATCH COMPLETED → DISPATCHED → LR COLLECTED → DELIVERED`).
   `Dispatch`/`LR`/`DELIVERY` have no `ORDER_ID` column at all (trip/dispatch-level only) —
   `LR`/`Delivery` resolve which `Dispatch ID` to attach to via the trip's own latest
   `Dispatch` row, not a lookup from the order.
`Backend/src/routes/tripMap.ts` — `orderSnapshotToSheet()`/`vehicleSnapshotToSheet()`, the
shared buyer/billing/shipping/consignee/GST/logistics/vehicle column spread reused by every
trip-family tab (they all repeat the same ~30 denormalized columns; `appendRow` silently
drops whichever don't exist on a given tab, so one spread works everywhere).
**Frontend for the trip system does not exist yet** — `tripRoutes.ts` is verified end-to-end
via API only so far; the "Transport" module UI still needs a trip list/detail + multi-order
picker, not just a form (unlike every other module so far).

**`SO_Confirmation` / `SO_Confirmation_Items` / `Dispatch Items Approval`** are separate,
pre-built append-only snapshot/audit-log tabs (human-readable headers, mapped in
`Backend/src/routes/soConfirmationMap.ts`) — **not** the live source of truth, which stays
`ORDER_PUNCH`/`SALE_ORDERS`/`ORDER_ITEMS`/`SALE_ORDER_ITEMS` exactly as above (nothing reads
these three tabs back into the app). All three carry `ORDER_ID` directly (`SO_Confirmation_
Items`/`Dispatch Items Approval` also carry `ITEM_ID`) as the join key — see the next
paragraph for why this matters.

## IDs

`Backend/src/services/ids.ts`. Format: `PREFIX-<8 random hex chars>` (e.g. `ORD-e76026d8`),
not the old sequential `ORD-2627-0001`. **Always use `nextIds(prefix, tab, column, count)`
when generating more than one ID in a loop** (dispatch plan lines, sale-order-item copies) —
it reads the tab once and checks uniqueness in-memory. Calling `nextId()` per item in a loop
forces one uncached network read *per item* — a real perf regression that happened once
already, don't reintroduce it.

## Sheets read/write performance

`Backend/src/services/sheets.ts` keeps ONE cache (headers + raw rows, 5 min TTL, busted
immediately on any write to that tab) shared by `readTable`, `appendRow(s)`, `updateRow`, and
`deleteRows` — previously `appendRow` always re-fetched the header row live and `updateRow`/
`deleteRows` always re-fetched the *entire* tab live, even when the caller had just read that
same tab moments earlier (e.g. SO Confirmation's handler already reads `ORDER_PUNCH`/
`SALE_ORDERS` before calling `updateRow` on both). **Always use `appendRows(spreadsheetId,
tab, records[])` instead of looping `appendRow` per item** — it writes every row in one
Sheets API call instead of one round trip per row. `orders.ts` is fully converted;
`tripRoutes.ts`/`stageRoutes.ts` still have a few old per-item `appendRow` loops left to
convert (tracked as a follow-up, not yet done).

## Google Drive uploads

`Backend/src/routes/uploads.ts`. Files are uploaded **fully private** — no public "anyone"
Drive permission at all. Flow: `POST /uploads` → returns a bare `fileId` → frontend calls
`GET /uploads/:fileId/view-url` (authenticated, mints a 5-min token) → opens
`GET /uploads/:fileId/stream?token=...` in a new tab, which streams the file inline. This
means the doer never sees Drive's own UI (Share dialog, edit permissions) — just the file
in the browser's native viewer. **Never re-add an "anyone" Drive permission** — a past bug
had the attachments folder itself set to "Anyone with the link: Editor" (not caused by this
app, but everything uploaded inherited it); that's been removed at the source.

The attachment viewer follows Google Drive's dark-canvas preview: images start centered and
fitted to the viewport. A bottom `−` / `Fit` / `+` control zooms images; the content pane's
right-side scrollbar is for navigating a zoomed image, not for an oversized default preview.

Drive auth uses **domain-wide delegation**, impersonating `operations@theairtrap.com`
(`Backend/src/services/googleAuth.ts`, `DRIVE_IMPERSONATE_USER` env var) — necessary because
a plain service account has zero storage quota and can't own files it creates in someone
else's folder. Sheets access is a separate, unimpersonated auth client (sheets are shared
directly with the service account, no impersonation needed there).

## Known gotchas

- **A "final" pass on the transactions sheet silently renamed almost every `ORDER_PUNCH`/
  `SALE_ORDERS`/`ORDER_ITEMS`/`SALE_ORDER_ITEMS` header** from `Underscore_Style` to
  `"Space Style"` (e.g. `Cutomer_Name` → `Cutomer Name`, `PART_NO` written by code → real
  header `"Part No."`). This broke ~67 of 71 `ORDER_PUNCH_MAP` entries and **all** of
  `ORDER_ITEMS`' fields at once (the item-writing code used literal `ALL_CAPS` keys with no
  translation map at all, since it used to match 1:1). Fixed by regenerating
  `orderPunchMap.ts` against live headers and adding `Backend/src/routes/itemMap.ts`
  (`itemToSheet`/`itemFromSheet`) — **every** place that reads or writes `ORDER_ITEMS`/
  `SALE_ORDER_ITEMS` now must go through `itemFromSheet`/`itemToSheet`, not raw
  `readTable`/`appendRow`. If item fields (Part No./Price/Qty/amounts) come back blank
  after any future sheet edit, dump the tab's real headers and diff against `itemMap.ts`/
  `orderPunchMap.ts` first — don't assume the map is still correct just because it
  typechecks (a wrong string literal is a silent runtime failure, not a compile error).
  `Dispatch_Approval` was also renamed to `Dispatch Items Approval` in the same pass.
- **`CUSTOMER MASTER T1`'s "Field Sale Repersentative" column is misspelled in the live
  sheet** (not "Representative") — `getBuyerFields()` in `Backend/src/routes/orders.ts`
  reads that exact (misspelled) header to auto-fill `SALE_STAFF_NAME` on Order Punch. If a
  lookup against this sheet silently returns blank, suspect a header-spelling mismatch
  first — dump the tab's actual headers rather than assuming the "obviously correct"
  spelling. `BUYER_GSTIN` is also auto-picked there now, from "Company GSTIN NO." (correctly
  spelled) — the Punch form has no manual GSTIN input of its own; it's only editable later,
  as a correction, in SO Confirmation's Changes flow.
- **`readTable` (`Backend/src/services/sheets.ts`) tolerates a missing tab** — if a tab
  referenced by code doesn't exist yet in the live sheet, the Sheets API throws "Unable to
  parse range", which `readTable` now catches and treats as an empty table instead of
  bubbling up as a 500. This is what fixed `GET /orders/:id` permanently 500ing ("Order not
  found" in the UI) because it unconditionally read a `DISPATCH_PLAN` tab that was never
  created on the live sheet. Any other Sheets API error still throws normally.
- **A stale frontend-only route can silently shadow a real one at the same URL.** React
  Router resolves two `<Route>`s with the identical literal path by declaration order, not
  by which one is "correct" — `Frontend/src/lib/stages.ts` once still had a leftover
  `transport` entry from before the trip system existed, so `App.tsx`'s `{STAGES.map(...)}`
  block registered `modules/transport` with the old dead `StageQueueList` *before* the real
  `<Route path="modules/transport" element={<TransportList />} />`, and the old one silently
  won. Caught only by an actual browser page-text check, not by typecheck. If a module route
  ever renders unexpectedly stale content, check for a duplicate static path in `App.tsx`
  before assuming a data/API bug.
- **Every trip-stage backend handler (`Backend/src/routes/tripRoutes.ts`) must update the
  `TRANSPORT` row's own `Status` column, not just cascade `ORDER_PUNCH.STATUS` on the
  attached orders** — `/lr` once cascaded orders correctly but forgot the
  `updateRow(..., "TRANSPORT", ..., { Status: "LR COLLECTED" })` call every other handler
  has, so the trip stayed stuck showing "pending" in the Collect LR queue forever even
  though the LR row had been written. Caught by a live UI walkthrough (resubmitting the form
  never cleared the queue), not by curl testing alone. Copy an existing handler's status
  update line when adding a new stage rather than writing one from scratch.
- **`vercel env add` via a PowerShell pipe silently prepends a BOM** (`﻿`) to the value
  on this machine — happened twice, broke domain-wide delegation both times
  (`invalid_grant: Invalid email or User ID`). Don't pipe values into it. If an env var needs
  setting/fixing programmatically, call the Vercel REST API directly with Node `fetch`
  (token in `%APPDATA%\xdg.data\com.vercel.cli\auth.json`, project id in
  `Backend/.vercel/project.json`) — write the script with the Write tool, not a PowerShell
  heredoc, to avoid any shell-encoding surprises. Verify afterward.
- **Vercel CLI on Windows PowerShell needs `npx.cmd`, not `npx`** — bare `npx` fails to
  resolve here.
- **`vercel env pull` masks values as `[SENSITIVE]`** in this environment — can't read secret
  values back that way; use a temporary diagnostic route (removed after use) if you need to
  verify what's actually stored, or the REST API's list endpoint (values are still encrypted
  there, but existence/target/timestamps are visible).

## User preferences

- Keep code simple and direct — no premature abstractions, no long-winded implementations.
- Verify against the live Google Sheet / live Drive folder before declaring something fixed
  — this project has repeatedly had bugs that only showed up against real data/real Google
  API behavior, not in typecheck alone.
- Don't guess at ambiguous requests spanning real security or data-destructive choices — ask.
