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

**Every modal form uses the shared `Frontend/src/components/form/FormModal.tsx`** — a fixed
desktop frame (`small: 400×420`, `standard: 800×560`; mobile ignores these and stays
full-width/`100dvh`) so a modal never resizes/jumps as conditional fields appear (the bug that
used to require one-off `minHeight` hacks to stop `SearchableSelect` dropdowns being clipped —
gone now that height is never content-driven). `size` picks the tier, `zIndex` for nested
modals (e.g. Arrange Vehicle 50 → Transport Form 55 → Load Limit Details 60), `sectionLabel`
for a static centered header bar, `headerActions` to replace the ✕ close button with custom
buttons. Every form's fields stack single-column (a two-column grid layout was tried and
explicitly rejected by the user — it visually shifted paired fields like Purchase Order No./
Purchase Order Date left/right instead of the plain top-to-bottom stack expected — so don't
reintroduce a `gridTemplateColumns`-based field layout without asking first).

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

**PDI** is the one simple, single-order stage between Dispatch Approval and the trip system
below, driven by one generic, config-based implementation (Pre Transport was removed — a
manual doer-filled stage the user wants system-auto-decided instead, deferred to a future
version; PDI's `nextStatus` now goes straight to `"PRE TRANSPORT COMPLETED"`, the same string
the trip system's `eligible-orders`/`eligible-items` already filter on, so nothing downstream
needed to change):
- `Frontend/src/lib/stages.ts` — `STAGES` array (just `pdi` now — the other stages this array
  used to hold were superseded by the trip system, see below), one
  `StageDef` per stage: `key` (also the URL segment and API path), `label`, `prevStatus`/
  `nextStatus` (the `ORDER_PUNCH.STATUS` values that gate its pending queue and that it
  advances to), and a `fields[]` list driving the form (types: `text`/`number`/`date`/
  `datetime-local`/`yesno`/`file`).
- `Frontend/src/components/stage/StageQueueList.tsx` — the generic list component (same
  Completed-toggle/customer-filter pattern as every other queue) — but PDI itself now uses
  a dedicated item-level `PdiList.tsx` instead (see below), so this is currently unused
  until a future stage is added to `STAGES`.
- `Frontend/src/components/stage/StageForm.tsx` — the one modal form, rendering whichever
  fields the `StageDef` declares.
- `OrderDetail.tsx` derives `currentStage` from the URL's module segment and shows a single
  generic "Give `{label}` Form" action whenever `order.STATUS === currentStage.prevStatus` —
  no per-stage QuickAction wiring needed.
- Backend mirror: `Backend/src/routes/stageConfig.ts` (`STAGES`, one `StageConfig` per
  stage — tab name, ID prefix/column, prev/next status, fields) and `stageRoutes.ts`
  (`registerStageRoutes()`, called from `orders.ts` **before** the generic `GET /:id` route
  so Express doesn't swallow e.g. `GET /pdi` as `:id="pdi"`). Each stage's tab (`PDI`,
  `PDI`) is brand-new — plain internal `UPPER_SNAKE` headers, no translation-map
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
  (wraps `TripQueueList` + `CreateTripModal`), `CreateTripModal.tsx` ("Arrange Vehicle Form",
  renamed from "Transport Main Form") — its "Select Sale Orders" section queues one or more
  orders client-side (each via the nested `TransportOrderForm.tsx` "Order Details"/"Logistic
  Details" tabs → `TransportItemsForm.tsx` "Load Limit Details" per-item quantity picker)
  before the trip exists; Save creates the trip then calls `attachOrders()` once for every
  queued order, matching the old CRR reference's nested New-row flow instead of the previous
  "create trip, then separately attach whole orders from the trip detail page" two-step
  process. `POST /transport-trips/:id/orders` (`tripRoutes.ts`) now takes `{ orders: [{
  orderId, items?: [{ itemId, qty }] }] }` — `items` omitted attaches the whole order at full
  item quantities (unchanged old behavior, still used by `TripDetail.tsx`'s
  `AttachOrdersModal.tsx`, multi-select eligible-orders picker), given attaches only the
  picked items at the doer's chosen quantity (the "Load Limit" concept). `TripDetail.tsx`
  (shared detail page across all 7 routes, derives the current
  stage from the URL segment the same way `OrderDetail.tsx` does), `forms/` (one component per stage — `ReachedForm`,
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
  `CURRENT_STAGE`** — Completed means the order has moved past the Punch/discount stage,
  i.e. `STATUS` is anything other than `PENDING`/`PENDING SALE ORDER` (not narrowly
  `=== "SALE ORDER"`, since SO Confirmation moves a confirmed order on to `DISPATCH APPROVAL`
  and further — it doesn't sit at `SALE ORDER` forever, so a strict-equality filter made an
  order that had progressed disappear from both the Pending and Completed views at once).
- `ORDER_ITEMS` — line items, column names unchanged (`FG_ID`, `PART_NO`, `PRICE`, `QTY`, …).
- `SALE_ORDERS` / `SALE_ORDER_ITEMS` — created when the Sale Order form is saved: a full
  copy of the punch order-header fields + carried discount + `SO_NO`/`SO_DATE`/attachment,
  and a copy of each `ORDER_ITEMS` row respectively. Mapped via `SALE_ORDER_MAP` (reuses
  `ORDER_PUNCH_MAP`, only the discount column name differs). `SALE_ORDER_ITEMS` uses the
  *same* column names as `ORDER_ITEMS` — no translation needed there — **except**
  `SALE_ORDER_ITEM_ID` (plus `Timestamp`/`Useremail`/`SALE_ORDER_ID`), which only exists on
  this tab. `itemFromSheet()` only knows `ORDER_ITEMS`' own columns, so calling it directly
  on a `SALE_ORDER_ITEMS` row silently drops `SALE_ORDER_ITEM_ID` — this left every
  `SO_Confirmation_Items` row's own `SALE_ORDER_ITEM_ID` blank (`createPlaceholderSoConfirmation()`
  and both `logSoConfirmation()` call sites in `orders.ts` all read `SALE_ORDER_ITEMS` through
  it). Fixed via a `saleOrderItemFromSheet()` wrapper that reads `SALE_ORDER_ITEM_ID` back
  from the raw row — **always use it instead of bare `itemFromSheet()` when the source table
  is `SALE_ORDER_ITEMS`**, not `ORDER_ITEMS`.
- `Order Punch Discount` — pre-built audit log of every discount applied (headers, dumped live
  and kept current in `DISCOUNT_LOG_HEADERS`: `Timestamp`, `Useremail`, `ORDER_ID`, `ITEM_ID`,
  `Punch Discount ID`, `Discount Details` [no longer written to — held the form's free-text
  Description field, which the user removed from both the live sheet and the form itself;
  left blank on every new row now], `Discount Applicable` [Yes/No], `Discount Reason` [was
  `Discount Reasion`, a typo, until a live sheet edit fixed the spelling but added a trailing
  space — `sheets.ts` trims every header on both read and write, so the key our code actually
  uses is the trimmed `Discount Reason`, not the raw sheet text], `Default Discount Type`
  [Invoice/Item scope — **not** the same column as the next one], `Default Discount on`
  [Percentage/Rupees], `Discount (Rs)`, `Discount (%)`, `Status`. This tab has drifted its
  headers before **and did again** — a doer reported reason/description silently not
  appearing after a form redesign, and the cause was exactly this kind of unannounced header
  change; dump the tab's actual live headers before trusting any assumption about its columns,
  including everything written here. `ensureSheetTab()` is still called defensively but the
  tab already exists live — don't
  confuse this with the old auto-created `ORDER_PUNCH_DISCOUNT` name, which is now dead/
  orphaned (a past mismatch, since fixed). **`POST /orders/:id/discount` writes this log row
  BEFORE flipping `ORDER_PUNCH.STATUS`** (not after) — a real production case surfaced an
  order whose status had advanced to `PENDING SALE ORDER` with zero matching row in this tab
  (root cause not pinned down after direct reproduction attempts against the live sheet came
  back clean), so the write order was flipped defensively: if the log append ever fails, the
  order now stays exactly as-is with the Discount action still showing, instead of silently
  advancing with no audit trail. Follow this same log-then-advance order for any other
  status-changing route that also writes to an audit-log tab.
  **The discount can be applied per line item, not just at the order level** (`ITEM_ID` used
  to be permanently blank here — the sheet had it ready for this "future" use, per the sheet-
  redesign plan doc, before it was actually wired up). The Sale Order Discount Form
  (`Frontend/src/modules/order-punch/SaleOrderDiscountForm.tsx`) is a conditional flow: first
  just "Discount Applicable" Yes/No — No submits `{applicable:false}` immediately (order still
  advances with zero discount, still logs one blank-`ITEM_ID` row so revert-detection below
  doesn't confuse "declined" with "log row got deleted"). Yes reveals Reason/Description and a
  "Discount Type": **Invoice** (one lump Rs/% applied once, `POST /orders/:id/discount` splits
  it across `ORDER_ITEMS` **proportional to each item's current `BASIC_AMOUNT`** so every item
  ends up with the same effective % off) or **Item** (doer checks specific items in a table and
  types an explicit, independent Rs/% *per selected item* — no proportional splitting, unchecked
  items are left completely untouched and just carried through into the resummed order total).
  Either way, each touched item's CGST/SGST/IGST is recalculated via `splitGst()` off its new
  discounted basic amount, and one `Order Punch Discount` row is written per touched item (with
  that item's own `ITEM_ID` and its *own* discount share, not the order total).
  `ORDER_ITEMS.DISCOUNT_RS`/`DISCOUNT_PCT` are cumulative — they always represent the item's
  total discount to date (punch-time + every Sale Order discount applied since, across however
  many discount actions), so `BASIC_AMOUNT = Price×Qty − DISCOUNT_RS` keeps holding everywhere
  else that reads it. `ORDER_PUNCH.BASIC_AMOUNT`/`TAX_AMOUNT`/`TOTAL_AMOUNT` are then resummed
  from ALL items (touched + untouched), same as the SO Confirmation Changes item-replace flow
  already does — `TOTAL_AMOUNT` (both per item and at the order level) is rounded off to the
  nearest whole rupee via `roundOff()`; the per-item Basic/CGST/SGST/Tax figures are deliberately
  left at full paise precision, only the Total line rounds, matching standard GST invoice
  round-off convention. A partial punch with no items yet falls back to the old order-level-
  only behavior (one log row, blank `ITEM_ID`, discount applied straight against the order's
  own totals) — the Item scope toggle is still shown for such an order but the item table
  underneath just renders "This order has no items" since there's nothing to pick from.
- `COUNTERS` — leftover from the old sequential-ID scheme, no longer written to (see IDs
  below). Don't delete it — just not the ID source anymore.
- `CRR DD` — dropdown value lists (e.g. Sale Type: Order/Sample/Return Order/Pilot Lot).

**Customer/Billing sheet** — `CUSTOMER MASTER T1` (buyer segment/contact auto-fill source),
`SALLER_MASTER` (seller/branch — currently one branch, `ZOTO-001`, auto-filled on every
punch save), `BILLING STRATEGY MASTER`.

**Pipeline so far:** Punch (`ORDER_PUNCH`, `STATUS: PENDING`) → discount applied
(`STATUS: PENDING SALE ORDER`, logged to `Order Punch Discount`) → Sale Order form uploaded
(`STATUS: SALE ORDER`) → SO Confirmation queue (`GET /orders/sale-orders`, filters out
`SALE_ORDERS.STATUS === "PENDING SALE ORDER"` — the blank placeholder row from the discount
step below, before the doer has actually uploaded the form; without this filter an order
jumped the queue early showing blank Sale Order No./Date) → `POST
/orders/:id/so-confirmation` outcome:

**`SALE_ORDERS`/`SALE_ORDER_ITEMS` and `SO_Confirmation`/`SO_Confirmation_Items` rows now get
created as blank placeholders one stage EARLIER than the form that actually fills them in**
(a deliberate, user-confirmed design — was originally "only create the row when its own form
is submitted", changed after a doer asked for the row to exist and be visible from the
previous stage onward, blank fields and all). `createPlaceholderSaleOrder()` runs at the end
of `POST /orders/:id/discount` — copies the current `ORDER_PUNCH`/`ORDER_ITEMS` state into
`SALE_ORDERS`/`SALE_ORDER_ITEMS` with `Sale Order No.`/`Date`/`Attachment`/`Remarks` blank and
`STATUS: PENDING SALE ORDER`; no-ops if a row already exists (discount can be applied more
than once before upload, e.g. after a revert). `POST /orders/:id/sale-order-form` then
**updates that same row** (`updateRow` by `ORDER_ID`, not another `appendRow`) to fill in the
four form fields and set `STATUS: PENDING`, and resyncs `SALE_ORDER_ITEMS` from scratch in
case anything changed since the placeholder was made. It also calls
`createPlaceholderSoConfirmation()` the same way for `SO_Confirmation`/`SO_Confirmation_Items`
(blank `Confirmation`/payment fields, `STATUS: PENDING`), which `logSoConfirmation()` (called
from `POST /orders/:id/so-confirmation`) then fills in via `updateRow` instead of appending a
second row — so `SO_Confirmation` is no longer purely append-only; only `SO_Confirmation_Items`
still gets delete+recreated each time (item list can change on a "Changes" outcome).
**`createPlaceholderSoConfirmation()` now takes the Sale Order form's four fields explicitly**
(`soNo`/`soDate`/`soAttachmentUrl`/`soRemarks`) rather than trying to source them from
`ORDER_PUNCH` — `ORDER_PUNCH` has no Sale Order No./Date/Attachment/Remarks columns of its
own (they only live on `SALE_ORDERS`), so the placeholder's `...order` spread could never
have carried them; they were sitting blank on every `SO_Confirmation` row until this fix.
`updateRow`'s merge-by-header behavior (only overwrites keys present in the patch, keeps
everything else) means `logSoConfirmation()`'s later `updateRow` call safely leaves these
four fields alone since it never includes them in its own patch.
**This changed what "does `SALE_ORDERS` exist" means** — it used to mean "form was uploaded";
now it exists from the discount step onward, so `revertOrphanedDiscounts()` (below) checks
`Sale Order No.` is actually filled in, not just row-existence, and revert additionally
deletes the (now-orphaned) placeholder `SALE_ORDERS`/`SALE_ORDER_ITEMS` rows it created.

**Undoing a discount**: there's no in-app "undo" button (matches the app's hand-edit-the-sheet
convention elsewhere) — a doer deletes the order's row(s) from `Order Punch Discount` directly
in the sheet, and `orders.ts`'s `revertOrphanedDiscounts()` (called from `GET /orders` and
`GET /orders/:id`) detects that an order is `PENDING SALE ORDER` with no matching log row and
no `SALE_ORDERS` row yet, and **physically writes the reverted state back** to both
`ORDER_ITEMS` (every item reset to zero Sale-Order-stage discount via the same
`computeItemDiscountFields()` the discount route itself uses, just with `cumulativeDiscountRs:
0`) and `ORDER_PUNCH` (`STATUS: PENDING`, `INVOICE_DISCOUNT_RS: 0`, totals resummed from the
now-reverted items) — an earlier version of this only overrode the API *response* without
writing back, which looked fine in the app but left the raw sheet cells still showing the
discounted values, confusing doers who check the sheet directly (as they routinely do here).
Runs from a GET, which is unusual (GETs are normally side-effect-free), but there's no other
trigger available — the only way the app ever learns about a hand-edit made directly in Sheets
is by reading it, so the read handler doubles as the corrective write when it detects one.
Idempotent: once reverted, `STATUS` is `PENDING`, so nothing here fires again until another
discount is applied. Once the Sale Order form is actually uploaded (`SALE_ORDERS`' own `Sale
Order No.` is filled in — **not** just the row existing, since a blank placeholder row now
exists from the discount step onward, see above), the discount is considered locked in and
deleting the log row no longer does anything — revert only applies while still at the
discount stage, a deliberate scope decision (not "always revert regardless of stage"). Revert
also deletes the placeholder `SALE_ORDERS`/`SALE_ORDER_ITEMS` rows for that order, since
they're for a discount that no longer exists.

**The same revert-on-delete convention now runs at every remaining single-order stage**, one
function per stage in `orders.ts`, all following the identical shape (check orders sitting
exactly at a stage's `nextStatus`, look for the row/field that should exist by now, revert
`STATUS` back to `prevStatus` if it's missing):
- `revertOrphanedSaleOrder()` — `STATUS "SALE ORDER"` with `SALE_ORDERS`' own `Sale Order No.`
  cleared reverts to `"PENDING SALE ORDER"`; resets that `SALE_ORDERS` row's upload fields
  back to blank (not deleted, since the placeholder is expected to persist continuously) and
  clears the downstream `SO_Confirmation`/`SO_Confirmation_Items` placeholder rows created at
  upload time. Runs from `GET /orders` and `GET /orders/:id`.
- `revertOrphanedSoConfirmation()` — `STATUS "DISPATCH APPROVAL"`/`"CANCELLED"` with
  `SO_Confirmation`'s own `Confirmation` field cleared reverts to `"SALE ORDER"` (and
  `SALE_ORDERS.STATUS` back from `COMPLETED` to `PENDING` alongside it); resets the
  `SO_Confirmation` row's decision fields back to blank. Runs from `GET /orders`,
  `GET /orders/:id`, and `GET /orders/sale-orders` (as a side-effect call using a fresh
  `ORDER_PUNCH` read, since that endpoint's own response is shaped from `SALE_ORDERS`).
- `revertOrphanedDispatchApproval()` — `STATUS "DISPATCH APPROVAL COMPLETED"` with no
  matching rows left in `Dispatch Items Approval` reverts to `"DISPATCH APPROVAL"`. Runs from
  `GET /orders`, `GET /orders/:id`, `GET /orders/dispatch-approvals`, and
  `GET /orders/dispatch-approvals/items`.

(`revertOrphanedPdi()`, described further below, already covered the PDI stage before this.)
Each only reverts orders sitting **exactly** at that stage's own status — same scoping as the
discount revert — so an order that's since progressed even further is left alone. Deliberately
kept as separate hand-written functions rather than one generic helper: each stage's "does the
downstream row/field still exist" check and its placeholder-reset shape differ enough (blank
field vs missing row vs no placeholder concept at all) that forcing one shared abstraction
would have been more fragile than three similar-looking but independent functions.
- **Confirmed** → `SALE_ORDERS.STATUS: COMPLETED`, `ORDER_PUNCH.STATUS: DISPATCH APPROVAL`
  (this is what feeds the Dispatch Approval queue — `GET /orders/dispatch-approvals` reads
  `ORDER_PUNCH` filtered on that status, **not** `SALE_ORDERS`, since `SALE_ORDERS` has no
  `Approval_Status`/`Status`-for-this-purpose columns of its own).
- **Changes** → both `ORDER_PUNCH` and `SALE_ORDERS` get the edited fields + `APPROVAL_STATUS:
  CHANGES`, stays in the pending SO Confirmation queue.
- **Cancelled** → `SALE_ORDERS.STATUS: COMPLETED`, `ORDER_PUNCH.STATUS: CANCELLED`.

Since `SALE_ORDERS.STATUS` alone can't tell Confirmed apart from Cancelled (both write
`COMPLETED`), `GET /orders/sale-orders` (`orders.ts`) joins in `ORDER_PUNCH_STATUS` per row —
`SoConfirmationList.tsx`'s Status badge and row styling key off that instead: `CANCELLED`
renders a red badge and the whole row in red strikethrough (matching the old CRR reference),
everything else uses `SALE_ORDERS.STATUS` as before. `DataTable.tsx` gained a `getRowStyle`
prop for this.

Confirmed → Dispatch Approval queue (`GET /orders/dispatch-approvals`) → `POST
/orders/:id/dispatch-approval` sets `ORDER_PUNCH.STATUS: DISPATCH APPROVAL COMPLETED`.
`?status=COMPLETED` on that GET route no longer does a strict `=== "DISPATCH APPROVAL
COMPLETED"` check — broadened to "any status past Dispatch Approval" (not `PENDING`/`PENDING
SALE ORDER`/`SALE ORDER`/`DISPATCH APPROVAL`/blank), same fix already applied once to Punch
Order's Completed filter — an order that progressed even further (into PDI, Transport, etc.)
was silently disappearing from both the pending AND Completed Dispatch Approval views at
once under the old strict check.

Confirmed → Dispatch Approval queue (`GET /orders/dispatch-approvals`) →
**`POST /orders/:orderId/items/:itemId/dispatch-approval`** appends **one** row to
**`Dispatch Items Approval`** (renamed from `Dispatch_Approval` in the sheet's "final"
pass — see Known gotchas) for that single item — approving one item never touches the rest
of the order's items (a real bug this session: it used to loop every item on the order and
write the exact same decision to all of them, so approving one item silently auto-approved
every other item too). `ORDER_PUNCH.STATUS` only advances to `DISPATCH APPROVAL COMPLETED`
once **every** item on the order has its own row — checked by re-reading `Dispatch Items
Approval` after each item's write and comparing against that order's full item list.
`revertOrphanedDispatchApproval()` (below) mirrors this: reverts if **any** item is missing
its row, not just "zero rows left." `POST /orders/:id/so-confirmation`'s Confirmed/Cancelled branch
also sets `ORDER_PUNCH.APPROVAL_TIME` (was mapped but never actually written before) — this
is "SO Confirmation Time" on the Dispatch Approval queue's pending table, the moment the
order entered that queue. **The pending Dispatch Approval table is item-level, not
order-level** — `GET /orders/dispatch-approvals/items` (`Frontend/src/modules/dispatch-
approval/DispatchApprovalList.tsx`) returns one row per item (SO Confirmation Time/Customer
Name/Part Name/Order Quantity), matching the old CRR reference view; Available Stock/Short/
Excess Quantity are shown as "—" there since they're only decided when the doer actually
submits the approval form, not before. The Completed toggle stays the order-level table
(`GET /orders/dispatch-approvals`, unchanged) since those three columns don't apply to it.
Clicking a pending item row goes to a dedicated **item-level detail page**
(`Frontend/src/modules/dispatch-approval/DispatchApprovalItemDetail.tsx`, routed at
`modules/dispatch-approval/:orderId/items/:itemId` — this one URL pattern uses a different
component than every other module's generic `OrderItemDetail`, see `App.tsx`), matching the
old CRR/AppSheet reference layout: Buyer Details, Special Instructions, Planned Dispatch
Dates (from `DISPATCH_PLAN` rows filtered to this `ITEM_ID`, already carries `ITEM_ID` per
row so no new backend work was needed there), Goods Details (same `goods`-master lookup
pattern as `OrderItemDetail`), Quantity Details, and a Dispatch Approval Follow-ups history
table. Quantity Details' Balance/Approved/Short/Excess Qty come from the item's own **latest**
`Dispatch Items Approval` log row (blank until the doer actually submits a decision); FG Stock
in Warehouse/Assembly Line/Booked/Total have no backing data source (no IMS yet, same gap as
Available Stock Quantity on the form itself) and are shown as "—" rather than a form field,
since this is a read-only page. New backend: `GET
/orders/:orderId/items/:itemId/dispatch-approval-log` (`orders.ts`) reads `Dispatch Items
Approval` filtered to that order+item — the first time this tab has ever been read back by
the app (previously write-only, see the `SO_Confirmation`/`Dispatch Items Approval` paragraph
below); added `dispatchApprovalFromSheet()` (`soConfirmationMap.ts`, a `reverseTranslate()`
mirroring the existing `translate()`) to support it. The "Give Dispatch Approval Form" quick
action lives **only** on this item detail page now — removed entirely from the order-level
`OrderDetail.tsx` (was previously shown there with an unconditional/order-level check; now
gone since a single order-level form can't express "just this item"). `DispatchApprovalForm`
takes an `itemId` prop and calls the item-scoped endpoint above; its Unit field is a real UOM
`<select>` (`CRR DD`-backed `dropdownValues(dropdowns, "UOM")`, falling back to
`UOM_OPTIONS`, defaulting to `"SET"`), same list/reconciliation pattern as the Order Punch
item editor's own UOM select, not a free-typed `TextField` like Available Stock/Balance
Dispatch Quantity still are. The quick action itself is gated on both `order.STATUS ===
"DISPATCH APPROVAL"` **and** this item having no existing log rows yet, since the order can
stay at that status while some of its items are already individually decided.

From there, two simple single-order stages (`Backend/src/routes/stageConfig.ts` /
`stageRoutes.ts`, `Frontend/src/lib/stages.ts`): `DISPATCH APPROVAL COMPLETED → PDI
COMPLETED → PRE TRANSPORT COMPLETED` (`POST /orders/:id/pdi`, `POST
/orders/:id/pre-transport`, one row per item appended to `PDI`/`Pre Transport`). Both are
"per-item" stages — `StageConfig.perItem: true` — auto-filling buyer/order snapshot fields
via `orderSnapshotToSheet()` (`tripMap.ts`), same helper the trip system below uses.
`stageRoutes.ts`'s per-item append also writes `Quantity`/`Unit` (from the item's own
`QTY`/`UOM`) onto every per-item stage tab now, not just PDI/Pre Transport's own declared
fields — needed for the PDI item-level table below, harmless for Pre Transport since it's
just two more populated columns. **PDI's form fields were trimmed to match the old CRR
reference** (`PDI No.`/`PDI Date`/`PDI Attachment`/`Box Quantity`/`PDI Remarks` — dropped
Product Weight/Sample Size/Send PDI to Customer, which the live `PDI` tab still has as
columns, just no longer written to from this form). `PDI No.` is a **real, separate live
sheet column** from the internal auto-generated `PDI ID` (`idColumn`/`ids.ts` convention) —
manually typed by the doer, matching the reference form; verified this by dumping the live
`PDI` tab's actual headers rather than assuming, same discipline as everywhere else in this
project. Fixing this form also caught a real pre-existing bug: the frontend field key was
`remarks` while `stageConfig.ts`'s was `pdiRemarks` — since `StageForm.tsx` posts the payload
keyed directly by `field.key`, and `stageRoutes.ts`'s `buildBodySchema` builds its required-
field zod shape off that same key, this meant `pdiRemarks` was never present in the request
body and `schema.parse()` was silently rejecting every PDI submission (whatever remarks text
the doer typed under a mismatched key). Renamed to match — if a stage form field ever
"doesn't seem to save," check the frontend `StageField.key` against the backend
`StageConfig` field's `key` first, they must be identical since neither is translated.

**The PDI queue's table is item-level, not order-level, in both the pending and Completed
toggle states** (`Frontend/src/modules/stage/PdiList.tsx`, replacing the generic
`StageQueueList` only for `pdi` in `App.tsx`'s route registration — same override pattern as
Dispatch Approval) — Timestamp/Part Name/Customer Name/Buyer GSTIN No./Quantity/Unit/PDI
Date/PDI Attachment/PDI Remarks, matching the old CRR reference view.

**PDI now gets its own blank placeholder row one stage EARLIER, same convention as
`SALE_ORDERS`/`SO_Confirmation`/`Dispatch Items Approval`** — `createPlaceholderPdi()`
(`stageRoutes.ts`, exported, called from `orders.ts`'s `/:orderId/items/:itemId/
dispatch-approval` handler) fires the instant a single item's Dispatch Approval outcome is
`"Dispatch Today"` (i.e. the moment its Dispatch Items Approval row shows the readable
`"Dispatch Approved"` label — see below), appending one blank `PDI` row for that item
(Quantity/Unit/etc. filled in via the same `orderSnapshotToSheet`, PDI No./Date/Attachment/
Box Quantity/Remarks blank, `Status: "PDI Pending"`) — **independent of sibling items on the
same order**, not waiting for `ORDER_PUNCH.STATUS` to reach `"DISPATCH APPROVAL COMPLETED"`
(which only happens once every item is decided). This is why the PDI pending queue
(`GET /orders/pdi/items`, no `status` query) now reads pending items straight off the `PDI`
tab's own `Status: "PDI Pending"` rows instead of joining `ORDER_PUNCH`+`ORDER_ITEMS` — an
item shows up in PDI the moment it's individually approved, even while a sibling item is
still sitting undecided in Dispatch Approval. A legacy fallback in the same route still joins
`ORDER_ITEMS`+`Dispatch Items Approval` the old way for any item with no `PDI` row at all
(pre-migration orders, or if placeholder creation ever silently fails), same "don't lose data
to a mid-flight convention change" safety net used elsewhere. `registerPdiSubmitRoute()`
(`POST /orders/:orderId/items/:itemId/pdi`) now **updates that placeholder row in place** by
its own `PDI ID` (`Status: "PDI Completed"`) instead of always appending a second row — same
bug class and same fix already applied once to Dispatch Items Approval's own submit handler,
fixed here from the start rather than found broken in production. `ORDER_PUNCH.STATUS` still
only advances to `"PRE TRANSPORT COMPLETED"` once **every** item's `PDI` row has
`Status: "PDI Completed"` (not just row-existence — a lingering `"PDI Pending"` placeholder
doesn't count). `revertOrphanedPdi()` mirrors this the same way `revertOrphanedDispatchApproval()`
does, also keyed off `Status: "PDI Completed"` rather than row-existence. Row click opens a
dedicated **item-level detail page** (`Frontend/src/modules/stage/PdiItemDetail.tsx`, routed
at `modules/pdi/:orderId/items/:itemId`) instead of the order-level `OrderDetail.tsx` — the
"Give PDI Form" quick action lives only there now (`OrderDetail.tsx`'s generic
`currentStage`-driven action explicitly excludes `"pdi"` so it doesn't also show at the order
level), gated on just this item not already being done (checked via
`listPdiItems("COMPLETED")`) — **not** on `order.STATUS`, since the placeholder convention
above means an item can be individually PDI-eligible well before the order as a whole reaches
`"DISPATCH APPROVAL COMPLETED"`. `StageForm.tsx` gained an optional `itemId` prop — when
given, it posts to `submitPdiItemForm()` instead of the old order-level `submitStageForm()`.

**Every per-item log tab's own `Status` column now shows a stable, human-readable label
instead of the raw internal `ORDER_PUNCH`-style status string** — `Dispatch Items Approval`
shows `"Dispatch Approved"`/`"Dispatch Date Extended"` (mapped from the form's raw
`"Dispatch Today"`/`"Dispatch Extended"` outcome values in `orders.ts`'s dispatch-approval
handler) and `PDI` shows `"PDI Pending"`/`"PDI Completed"` (`stageRoutes.ts`) — neither ever
touches `ORDER_PUNCH.STATUS` itself, which keeps progressing through the full order lifecycle
exactly as before. If a future per-item stage tab is added, give it the same readable,
never-auto-changing-after-the-fact `Status` column rather than writing a raw stage/status
constant into it.

**The live sheet's `"Cutomer Name"` typo is gone — the user manually renamed it to the
correctly-spelled `"Customer Name"` on every tab that had it** (`ORDER_PUNCH`, `SALE_ORDERS`,
`SO_Confirmation`, `Dispatch Items Approval`, `PDI`, `TRANSPORT`, `Transport_Products`,
`Pre Dispatch`, `Dispatch`, `LR`, `DELIVERY`, `Tax_Invoice_SO`, and presumably every other
trip-family tab, confirmed by dumping live headers directly rather than assuming). All three
places that used to map `CUSTOMER_NAME -> "Cutomer Name"` — `orderPunchMap.ts`'s
`ORDER_PUNCH_MAP`, `soConfirmationMap.ts`'s `SO_CONFIRMATION_MAP`, and `tripMap.ts`'s
`ORDER_SNAPSHOT_MAP` (shared by every trip-family tab) — are now `"Customer Name"`, plus one
literal read in `tripRoutes.ts`'s `eligible-items` Completed branch. **If the live sheet's
headers ever get hand-edited again, dump them directly before assuming any of these three
maps is still correct** — this exact class of drift has now hit `Cutomer Name`→`Customer
Name` (this fix), the `Discount Reason` trailing space, and the "final pass" header rename
(see Known gotchas) three separate times in this project.

**PDI has its own revert-on-delete**, mirroring the discount revert convention exactly:
`revertOrphanedPdi()` (`stageRoutes.ts`, called from `GET /orders/pdi/items` whenever
`status !== "COMPLETED"`) detects an order sitting at `STATUS === "PRE TRANSPORT COMPLETED"`
(PDI's own `nextStatus`) with no matching row in the live `PDI` tab, and reverts it back to
`"DISPATCH APPROVAL COMPLETED"` (PDI's `prevStatus`) so deleting the PDI row directly in
Sheets makes the order reappear in the PDI pending queue instead of vanishing from every
queue. Same scoping as discount revert: only reverts orders still sitting exactly at that
status, not ones that have since progressed further into Transport. Verified against a
scratch `ORDER_PUNCH` row.

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
`CreateTripModal.tsx`'s Transporter ID is a searchable select against the `Transporter Data`
master (`GET /masters/transporters`, `TRANSPORT_SHEET_ID`) — selecting one auto-fills
Transporter Name, same pattern as the Order Punch logistics tab.

**The nested Arrange Vehicle → Transport Form → Load Limit Details flow now matches the old
CRR reference field-for-field** — the user manually restructured the live `Transport_SO`/
`Transport_Products`/`TRANSPORT` tabs to match (confirmed directly against the old CRR
reference spreadsheet, not assumed): `Transport_Products` gained a full "Goods Details" +
"Load Limit Details" column section it was previously missing entirely (`Part Name`/`Part
No.`/`Segment`/`Category`/`Quantity`/`Unit`/`Balance Qty to Dispatch`/`Load Qty`/`New Balance
Qty to Dispatch`/`Load Boxes` — all silently dropped by `appendRow` before these columns
existed). `CreateTripModal.tsx` gained "Freight GST Applicable" (Yes/No, alongside Freight
Charge). `TransportOrderForm.tsx`'s Preferred Delivery Mode / Freight Paid by are now live
`ToggleGroup`s (pre-filled from the order's own preferred fields but editable, matching the
reference) instead of disabled text, with "Freight Paid at" revealed only when Freight Paid
by = Customer. `TransportItemsForm.tsx` now shows read-only Quantity/Unit/Balance Qty to
Dispatch (no cross-trip balance tracking exists yet, so Balance is just the item's own order
quantity — same "no IMS" gap as Available Stock Quantity elsewhere) plus editable required
Load Qty (validated against Balance) and Load Boxes. `tripRoutes.ts`'s `POST
/:transportId/orders` writes all of this to both `Transport_SO`/`Transport_Products` via the
per-order `preferredDeliveryMode`/`freightPaidBy`/`freightPaidAt` and per-item `loadBoxes`
fields now accepted in the attach payload. **`Transport_SO`'s live header is still `"Cutomer
Name"` (the typo) while every other trip-family tab, including `Transport_Products`, uses the
correctly-spelled `"Customer Name"`** — `ORDER_SNAPSHOT_MAP` can only carry one spelling, so
`"Cutomer Name"` is written explicitly alongside it in the `Transport_SO` append only; dump
this tab's live header again before assuming either spelling if it's ever hand-edited further.
**`TransportList.tsx`'s
main view is item-level, not the generic trip list** — matches the old CRR "Pending
Transport" reference exactly (customer filter sidebar via `CustomerFilterPanel`, main table,
header actions row with a "Completed Transport" toggle + "+ Arrange Vehicle" button, same
list pattern as `PdiList.tsx`), replacing the earlier `TripQueueList`-based trip list on this
one route (the other 6 Transport-family routes still use `TripQueueList` unchanged, see
above). Columns: Timestamp/CUST ID/Customer Name/Quantity/Unit/Part No./Part Name/Status
(`GET /transport-trips/eligible-items`, `?status=COMPLETED` optional). Balance Quantity/
Balance BOX Quantity/NUG/BOX Quantity/Packing Type from that reference came from the
now-removed Pre Transport stage's own manual entry and are deliberately left out, not
fabricated — "Quantity" here is just the item's own order quantity, not a tracked balance.
Pending reads live `ORDER_PUNCH.STATUS === "PRE TRANSPORT COMPLETED"` (label `"Transport
Pending"`); Completed reads `Transport_Products` directly instead of a live status filter
(label `"Vehicle Arrange Completed"`) — same reasoning as PDI's own Completed view (see
above): a live-status equality check would make an order that's since progressed even
further (Transport Reached, etc.) silently vanish from this Completed view too.

**`SO_Confirmation` / `SO_Confirmation_Items` / `Dispatch Items Approval`** are separate,
pre-built snapshot/audit-log tabs (human-readable headers, mapped in
`Backend/src/routes/soConfirmationMap.ts`) — **not** the live source of truth, which stays
`ORDER_PUNCH`/`SALE_ORDERS`/`ORDER_ITEMS`/`SALE_ORDER_ITEMS` exactly as above. `SO_Confirmation`
is one exception to "nothing reads these tabs back into the app" — `logSoConfirmation()`
reads it first to find (and update in place) the placeholder row created at Sale Order upload
time, see above. `Dispatch Items Approval` is the other — `GET
/orders/:orderId/items/:itemId/dispatch-approval-log` reads it back (via the new
`dispatchApprovalFromSheet()`) for the item-level Dispatch Approval detail page's Quantity
Details + Follow-ups table, see above. `SO_Confirmation_Items` is still write-only from the
app's perspective. All three carry `ORDER_ID` directly (`SO_Confirmation_
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

`Backend/src/services/sheets.ts` keeps ONE cache (headers + raw rows, 30s TTL — was 5 min
until a doer hand-editing the live sheet directly [outside the app] needed to show up sooner
than that; nothing busts this cache for an edit made outside our own API, so it's on a timer
instead) shared by `readTable`, `appendRow(s)`, `updateRow`, and
`deleteRows` — previously `appendRow` always re-fetched the header row live and `updateRow`/
`deleteRows` always re-fetched the *entire* tab live, even when the caller had just read that
same tab moments earlier (e.g. SO Confirmation's handler already reads `ORDER_PUNCH`/
`SALE_ORDERS` before calling `updateRow` on both). **Always use `appendRows(spreadsheetId,
tab, records[])` instead of looping `appendRow` per item** — it writes every row in one
Sheets API call instead of one round trip per row. `orders.ts` is fully converted;
`tripRoutes.ts`/`stageRoutes.ts` still have a few old per-item `appendRow` loops left to
convert (tracked as a follow-up, not yet done).

`Frontend/src/lib/sync.tsx`'s `AUTO_SYNC_MS` (the periodic full `invalidateQueries()` that
drives the "Sync complete"/"Syncing…" header indicator) is 30s for the same reason as the
backend TTL above — both were 5 min, tuned down together so the app catches up to a manual
sheet edit in well under a minute instead of up to 5. This is deliberately still polling, not
a real push/webhook system (a doer explicitly chose the simple/short-poll tradeoff over
standing up a Google Apps Script trigger + webhook + live browser connection) — don't build
that heavier system without asking again first, the tradeoff was discussed and decided.

`Frontend/src/main.tsx`'s query client leaves `refetchOnMount` at the library default (`true`)
— a past version of this file set it to `false` to stop every page revisit re-fetching from
scratch, but that also meant: mutate on page A (e.g. save a new order) → `invalidateQueries()`
runs while page B's query has no active observer yet (not mounted) → nothing actually
refetches → navigate to page B → it mounts showing the STALE cached data anyway, since
`refetchOnMount:false` blocks catching up even on data that's explicitly invalid, not just
"still fresh." This produced a whole recurring class of "why doesn't my new order show up"
reports. `staleTime: 60_000` already solves the original "refetch on every revisit" complaint
on its own (a mount only refetches if the cached data is actually stale/invalidated) — don't
reintroduce `refetchOnMount: false` to fix a perceived perf issue without re-checking this.
For any one call site that mutates and then immediately navigates to a page whose query
needs to be fresh, prefer `queryClient.refetchQueries(...)` over `invalidateQueries(...)` —
the former always fires the network request now; the latter only does if something is
actively observing that query key at the moment it's called, which a not-yet-mounted
destination page never is (see `OrderPunchForm.tsx`'s post-save handler).

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

- **A negative "!== done" check on `ORDER_PUNCH.STATUS` resurrects quick-action buttons on
  orders that have long since moved past that stage** — `OrderDetail.tsx`'s Sale Order
  quick actions used `order.STATUS !== "SALE ORDER"` to decide whether to show "Add
  Discounts"/"Upload Sale Order Form", and the Dispatch Approval quick action had no status
  check at all. Since `STATUS` keeps advancing through many later values (Dispatch Approval,
  PDI, Transport, ...), "not equal to the one status that means done" is true for all of
  them too, so a fully-completed order kept showing edit actions again. Fixed by flipping
  both to a strict **positive allowlist** of the exact pre-completion statuses instead (only
  `"PENDING"`/`"PENDING SALE ORDER"` for Sale Order, only `"DISPATCH APPROVAL"` for Dispatch
  Approval) — this is the same "STATUS drift" bug family as the Completed-view-vanishing
  fixes elsewhere in this file, just inverted (there, a *positive* strict-equality check was
  too narrow; here, a *negative* strict-equality check was too broad). Any other per-module
  quick action gated on `order.STATUS` should use the same positive-allowlist shape, not a
  `!== "wherever this stage ends"` check.
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
  reads that exact (misspelled) header to auto-fill `SALE_STAFF_NAME` on Order Punch. The
  **Add New Customer** modal's "Sale Representative" dropdown writes into this same column
  (`POST /masters/customers`, `fieldSaleRepresentative`) — its options come from a *different*
  tab, `Master Form_Apps_etc`'s "Field Representative Person" column (correctly spelled there;
  that tab's own note literally says "manually typing for flow Sale Staff Name master... "),
  exposed via `GET /masters/field-representatives`. If a lookup against this sheet silently
  returns blank, suspect a header-spelling mismatch first — dump the tab's actual headers
  rather than assuming the "obviously correct" spelling. `BUYER_GSTIN` is also auto-picked
  there now, from "Company GSTIN NO." (correctly spelled) — the Punch form has no manual
  GSTIN input of its own; it's only editable later,
  as a correction, in SO Confirmation's Changes flow.
- **`readTable` (`Backend/src/services/sheets.ts`) tolerates a missing tab** — if a tab
  referenced by code doesn't exist yet in the live sheet, the Sheets API throws "Unable to
  parse range", which `readTable` now catches and treats as an empty table instead of
  bubbling up as a 500. This is what fixed `GET /orders/:id` permanently 500ing ("Order not
  found" in the UI) because it unconditionally read a `DISPATCH_PLAN` tab that was never
  created on the live sheet. Any other Sheets API error still throws normally.
- **`ensureSheetTab` now also fixes a tab that exists but has a genuinely blank row 1**, not
  just a fully-missing tab — `POST /transport-trips/:id/orders` was throwing `Tab
  "Transport_SO" has no header row — cannot append` because `Transport_SO` (unlike every
  other trip-family tab) never actually had `ensureSheetTab` called for it at all. Since
  `readTable` treats "tab doesn't exist" the same as "empty table" (see above), `appendRow`'s
  own `headers.length === 0` check can't tell "missing tab" apart from "tab exists but
  blank" — `ensureSheetTab` now handles both, and `tripRoutes.ts` calls it defensively before
  every `Transport_SO` append using headers derived from `tripMap.ts`'s (now exported)
  `ORDER_SNAPSHOT_MAP`, matching the literal shape of the object actually being appended.
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
