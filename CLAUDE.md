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
  `CHECKLIST.md` is the full-system reference for the separate Checklist app (Accounts
  department) — read it before touching `Frontend/src/checklist/` or
  `Backend/src/routes/checklist*.ts`, and keep it current the same way as this file.

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

## Backend security hardening

- `Backend/src/middleware/rateLimit.ts` — `loginRateLimit` (20/15min) on `POST /auth/login`,
  `changePasswordRateLimit` (10/15min) on `POST /auth/change-password`. Best-effort only on
  Vercel: each serverless instance keeps its own in-memory counter (no shared store), so it
  doesn't rate-limit perfectly across a fleet of cold starts, but still meaningfully slows a
  single attacker hammering one warm instance — the realistic threat model for an internal
  app like this. Requires `app.set("trust proxy", 1)` in `app.ts` (Vercel puts every request
  behind a proxy; without this `req.ip` is the proxy's address for every request, collapsing
  everyone into one shared rate-limit bucket).
- Both `jwt.sign`/`jwt.verify` calls (login token in `auth.ts`, attachment view-token in
  `uploads.ts`, verification in `middleware/auth.ts`) now pin `algorithm: "HS256"` explicitly
  — without this, `jsonwebtoken` trusts whatever `alg` the token's own header claims, which is
  how algorithm-confusion attacks forge a valid signature without ever knowing the real secret.
- `app.use(helmet({ contentSecurityPolicy: false }))` in `app.ts` — standard defensive headers
  (X-Content-Type-Options, X-Frame-Options, HSTS, Referrer-Policy). CSP is left off since the
  one HTML page this API serves (`uploads.ts`'s attachment `/viewer`, for the image zoom
  controls) relies on an inline `<script>`; not worth tuning a CSP around one page on an
  internal, login-gated app.
- `Backend/src/middleware/errorHandler.ts` — non-Zod errors thrown to `next(err)` now return a
  generic `"Something went wrong…"` message to the client instead of the raw exception message
  (which could incidentally leak internal details — project IDs, quota info, stack fragments —
  especially from Google API errors). Full detail still always goes to `console.error` server-
  side. Zod validation messages still pass through verbatim (safe, field-level text).
- `JWT_SECRET` was rotated in System 1 (`ZOTO SYSTEM`) after discovering it was still the
  placeholder default (`change-me-to-a-long-random-string`) in both local `.env` and Vercel's
  prod env var — a critical weak-secret vulnerability (anyone could forge a valid login JWT).
  Rotating a live `JWT_SECRET` forces every currently-logged-in session to be rejected on next
  request, so a rotation must be paired with a heads-up to users before/around the redeploy
  that ships it. System 2 (`ZOTO 2 SYSTEM`)'s secret was already strong, no rotation needed.
- Known, deliberately deferred `npm audit` findings (breaking-change fixes only, not silently
  ignored): Backend's `googleapis` chain (uuid/gaxios/googleapis-common) needs a `144→174`
  major bump; both Frontends' `react-router`/`react-router-dom` open-redirect + constructor-
  injection advisories need a `6→7` major bump; both Frontends' `esbuild`/`vite` dev-server
  advisory needs a `vite@5→8` major bump (dev-only, not a prod risk). None applied without
  dedicated regression testing first — ask before forcing any of these.

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

**Mobile action buttons use `Frontend/src/components/FloatingActionButton.tsx`**, matching the
old AppSheet reference's own floating circular button instead of squeezing another small icon
button into an already-crowded header/action row. Two exports: `FloatingActionButton` (bare
fixed bottom-right circle, `stackIndex` prop offsets it upward when more than one is visible
at once, e.g. `TripDetail.tsx`'s "Attach Orders" + "Give Stage Form") and `QuickAction` (the
shared "Give X Form"-style detail-page action — desktop renders the old inline stacked
icon-circle-plus-label button near the top of the page, mobile renders a `FloatingActionButton`
instead so the action is reachable with a thumb without scrolling back up). `QuickAction` is
used by `OrderDetail.tsx`, `PdiItemDetail.tsx`, `DispatchApprovalItemDetail.tsx`, and
`TripDetail.tsx` — previously each of these four files had its own copy-pasted `QuickAction`
function; now there's one shared definition, so a future detail-view action should import it
rather than redefining it locally. List-view "+" create actions (e.g.
`OrderPunchList.tsx`) use plain `FloatingActionButton` directly (desktop keeps the inline
header "+" button, `isMobile` switches to the FAB).

`Frontend/src/modules/order-punch/` is the main working area: `OrderPunchList.tsx` (shared
list, reused for both Punch Order and Sale Order routes via a `basePath` prop derived from
the URL — its column list shows `SALE_STAFF_NAME` as "Assigned Person" rather than
`ORDER_TYPE`), `OrderPunchForm.tsx` (4-tab punch form, `form/Tab1-4*.tsx` + `form/types.ts`
for form state), `OrderDetail.tsx` (detail view, also shared between both modules),
`SaleOrderDiscountForm.tsx` / `SaleOrderUploadForm.tsx` (the two Sale Order step modals).
`OrderItemsView.tsx` (the `.../items` route) shows only Part Name/Qty/UOM/Price/Basic
Amount/Tax Amount/Total Amount/Remarks — trimmed down from a wider goods-master-joined
column set (Part No./Part Description/Segment/Category/Sub Category/Paint/Standard Packing
were dropped entirely, along with the `listGoods`/FG-ID-lookup code that fed them, per user
request; re-add both together if those columns come back).
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
  renamed from "Transport Main Form") — opens with `Send Through: ZOTO Vehicle`, `Vehicle
  Arrange for: Customer`, `ZOTO Vehicle ID: VEH-001` and `Freight Applicable On Invoice?: N`,
  matching the Order Punch form's own defaults; VEH-001's Vehicle type/No./Size/Driver fields
  are filled by a `useEffect` rather than inline, since the vehicle master only arrives after
  first render (it bails out once `vehicleType` is set so it can never clobber a doer's edit).
  Its "Select Sale Orders" section is a **checkbox table over the eligible orders** — ticking a
  row queues that whole order client-side (every item at full order quantity, `loadBoxes`
  carried from the item's completed PDI Box Quantity, delivery mode/freight-paid-by taken off
  the order's own preferred fields, `freightPaidAt` mirrored to `"Pay at Customer"` when the
  customer pays, since no such column exists on `ORDER_PUNCH`), plus a header select-all box.
  Items whose `QTY` is blank/0 are dropped from the payload rather than sent — `attachOrders`'
  zod schema requires a positive `qty`, so one bad line would 400 the whole trip. This
  **replaced** the old three-deep nested modal flow (`TransportOrderForm.tsx` "Order Details"/
  "Logistic Details" tabs → `TransportItemsForm.tsx` "Load Limit Details" per-item picker);
  both files are deleted. Their one real capability was a Load Qty *below* the full quantity —
  the user explicitly asked for that to go, so **partial loads are deliberately unsupported**;
  restoring them means rebuilding a per-item quantity input, not just re-adding a button.
  Queuing happens
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
- `CAN_ADD` / `CAN_EDIT` / `CAN_DELETE` columns — `Yes`/`true`/`1` = granted, fail-closed
  (blank = no access). `CAN_DELETE` gates Punch/Sale Order list's bulk-delete; `CAN_EDIT`
  gates the same list's select-mode "Edit" button (`OrderPunchList.tsx`, only enabled with
  exactly one row selected, navigates to that order's detail page — same destination as
  tapping the row, since there's no separate raw edit form; the point is a doer with edit
  rights but not delete rights). `CAN_ADD` is still parsed and exposed on `req.user`/the
  frontend `AuthUser` but not yet gating any route/UI.
All four are managed by hand-editing the sheet, not through an in-app admin UI (deliberate).

**Customer assignment gates punching, not viewing.** `CUSTOMER MASTER`'s
`Field Sale Repersentative` column (misspelled in the live sheet, see Known gotchas) names
the doer a customer belongs to. Deliberately scoped so that:
- **Viewing is never restricted** — `GET /masters/customers` returns every customer to every
  doer, and every order list stays fully visible. An earlier version filtered the picker down
  to just the doer's own customers; that was explicitly rejected — the doer must still be able
  to see and search the whole customer book.
- **Punching is restricted** — `POST /orders` 403s if the customer's assigned rep isn't the
  logged-in doer's `USERS.Name` (case-insensitive). An Admin (`Permissions_Process` contains
  `Admin`, i.e. `perms.modules === "ALL"`) can punch for anyone. A customer with a *blank*
  assigned rep is punchable by anyone — unassigned, not locked.
- The punch form mirrors this as UX only: `OrderFormState.custAssignedTo` is captured when a
  customer is picked, `Tab2OrderDetails.tsx` shows a red "This customer is assigned to X"
  notice, and `validateTab()` blocks moving past the customer's own tab. **None of that is the
  real gate** — the server check is, since the form's is trivially bypassable.
Matching is on the doer's **Name**, not Employee Id, so `USERS.Name` must match the customer
master's rep spelling exactly. Assigning a customer to a doer who isn't in `USERS` (or a name
typo) silently locks that customer to Admins only.
Passwords are the one exception: a logged-in doer can self-service change their own password
via Settings (`POST /auth/change-password`, requires the current password, writes straight
back to their `Employee Id` row's `Password` cell — nobody else's row can be targeted since
the row is matched on the JWT's own `employeeId`, not a request param).

**Module permissions are per-route, never per-router.** `ordersRouter` used to carry a
blanket `requireModule("punch-order")` and `tripsRouter` a blanket
`requireModule("transport")`. Because PDI's routes are mounted on `ordersRouter` and Stock
Release's on `tripsRouter`, a doer whose only module was PDI (or Stock Release) got
"No access to this module" when saving their OWN stage's form — the guard asked for a module
they were never meant to need. The frontend gates navigation on the real module list, so
they could reach the form and only failed at Save, which made it look like a form bug.
Each route now declares its own guard:
- Stage-specific WRITES use `requireModule(<that stage's key>)` — `pdi` on the PDI routes,
  `stock-release` on stock-release, `dispatch-approval`, `tax-invoice`, `collect-lr`, etc.
- Shared order READS (`GET /orders`, `/orders/:id`, trip lists/details) use
  `requireAnyModule(ORDER_FAMILY_MODULES)` — a PDI-only doer's item detail page still has to
  fetch its order, so gating those on one specific module is what caused the lockout.
**Never reintroduce a router-level `requireModule`** — adding a new stage route means adding
its own guard, not relying on the router's.

**A route inside a module CAN be gated tighter than the module itself**, via
`requireNamedUsers(names)` (`Backend/src/middleware/auth.ts`) stacked after `requireModule` on
one specific route — this primitive exists and is still exported, but is **not currently used
anywhere**. It briefly gated the Sale Order Discount form (`POST /orders/:id/discount`) and
Sale Order upload form (`POST /orders/:id/sale-order-form`) to Admin/Jyoti only, with everyone
else in the module (Abhishek Sharma, Kashish) read-only; this was deliberately reverted back
to plain `requireModule("sale-order")` — whoever the `USERS.Permissions_Process` sheet grants
Sale Order to can use every action in it, full stop, matching every other module's convention.
If a future stage genuinely needs a "wider module view, narrower module write" split, reach for
`requireNamedUsers([...])` again rather than narrowing the module's own `Permissions_Process`-
driven `requireModule` gate — but don't add it without being asked; the sheet-defined
permission is meant to be the single source of truth for who can do what in a module.

**HOME tile visibility (parent) and actual app access (child) are two separate,
independently hand-edited permission sources that can silently drift out of sync** — this is
a real, confirmed production bug pattern, not a hypothetical. HOME's own `ZOTO HOME` sheet
(`Backend/src/routes/home.ts`, `Email Permisssions/ Employee ID` column) only controls
whether an employee sees/can click a HOME tile at all; it has **no relationship** to whether
`requireModule`/`requireAnyModule` will actually let them use the app once inside — that's
governed entirely separately by the Sales CRR transactions sheet's own `USERS
.Permissions_Process`. An employee can be listed in HOME's allowlist for an app (parent: yes)
while their `Permissions_Process` doesn't grant that module (child: no) — they see and click
the tile, then every API call inside 403s silently, and the resulting empty state looks
identical to a legitimate "nothing to show" result. This exact case hit **five different
doers** (Abhishek Sharma, Jyoti, Kashish, Sumit Kumar, Deepak) for the Checklist app
simultaneously before being caught — confirmed live via `GET /api/v1/admin/permission-audit`
(admin-only, `Backend/src/routes/permissionAudit.ts`; UI at `/settings/permission-audit`,
linked from an Admin-only section in `Settings.tsx`). This is a **read-only report, not an
editor** — the fix for a flagged mismatch is still hand-editing the relevant
`Permissions_Process` cell, same convention as every other permission column in this app;
don't build an in-app permission editor without being asked. The audit currently only covers
Sales CRR and Checklist (the two HOME apps with a real module system behind them) — extend
`AUDITED_APPS` in `permissionAudit.ts` (one line: `homeNamePrefix` + a `hasChildAccess`
predicate) once another HOME app graduates from "Coming Soon" to a real app with its own
module keys.

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
Box Quantity/Remarks blank, `Status: "PDI Pending"`, plus the triggering Dispatch Items
Approval row's own `Disp Conf Item ID` carried onto the placeholder's identically-named
column — the live `PDI` tab has its own `Disp Conf Item ID` column right after `ITEM_ID`,
confirmed by dumping live headers directly, not assumed) — **independent of sibling items on
the same order**, not waiting for `ORDER_PUNCH.STATUS` to reach `"DISPATCH APPROVAL COMPLETED"`
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

**Transport also has its own revert-on-delete**, same convention as every earlier stage —
`revertOrphanedTransportAssigned()` (`tripRoutes.ts`, called from `GET /eligible-orders` and
the pending branch of `GET /eligible-items`) detects an order stuck at `STATUS ===
"TRANSPORT ASSIGNED"` (the status `attachOrders` cascades to) with no matching `Transport_SO`
row left, and reverts it back to `"PRE TRANSPORT COMPLETED"` so hand-deleting a trip's
`Transport_SO`/`Transport_Products` rows directly in the sheet makes the order reappear in
the Transport pending queue instead of vanishing from every queue (the exact gap a doer hit
in production — deleting `Transport_Products` rows left the order stuck invisible). Unlike
PDI's two-directional revert, this one is single-direction only — `attachOrders` writes every
row and cascades `STATUS` synchronously in one handler, so there's no placeholder-then-fill
race that could leave an order at `prevStatus` with the rows already genuinely present.

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

**Docs API access (for the Dispatch Gate Pass below) is deliberately a SEPARATE JWT
client/scope set from the plain Drive client above**, not just "documents" scope added
to `DRIVE_SCOPES` — domain-wide delegation authorizes a Client ID for one exact scope set
at a time, so combining scopes on the already-working Drive client would have made the
existing upload feature wait on a Workspace admin re-authorizing the combined set too.
`getDocsClient()`/`getDriveClientForDocs()` (`googleAuth.ts`) use their own `DOCS_SCOPES`
(`drive` + `documents`) client instead, so uploads keep working regardless of when Docs
access gets authorized. If a future feature needs yet another new scope, follow this same
isolate-it-on-its-own-client pattern rather than expanding an existing client's scopes.

## Dispatch Gate Pass (auto-generated PDF)

`Backend/src/services/gatePass.ts` — `ensureDispatchGatePass(transportId)`, called both from
`tripRoutes.ts`'s `attachOrders` (`POST /:transportId/orders`, right after `cascadeStatus` —
the "instant, on Save" trigger) and from `GET /:transportId` (self-healing retry, same
`revertOrphaned*()` reasoning used elsewhere in this app: the only way the app learns a
generation attempt failed is by seeing the column still blank on the next read). Generated
**once per trip** (not per order — the doer's own call, even though the template only shows
one Bill To/Ship To), combining every attached order's `Transport_Products` items into one
table; the **first** attached order's buyer/billing/shipping snapshot fills Bill To/Ship To.
No-ops instantly if a `"Dispatch Gate Pass"` value already exists on any `Transport_SO` row
for that trip — safe because a trip can never gain additional orders after its first attach
(`TripDetail.tsx`'s own "Attach Orders" quick action only shows when `orders.length === 0`).
Never throws — every failure is caught, logged, and turned into `null`.

Copies the "Sales-CRR Gate Pass Template" Google Doc
(`DISPATCH_GATE_PASS_TEMPLATE_DOC_ID` env var) — an old AppSheet document-merge template
(`<<[Transport ID].[Customer Name]>>`, `<<Start:...>>...<<End>>` for the repeating item row,
`<<sum(select(...))>>` for totals) that this app has to fill in by hand via the real Docs
API, since there's no AppSheet backend anymore. Two things about this template were **not**
obvious from its visible header labels and cost real debugging time — dump the template's
actual cell structure directly (`docs.documents.get`) before assuming either holds if the
template is ever redesigned:
- **The item table has 8 underlying cells per row, not the 6 visible column headers** — two
  blank spacer cells (index 3 and 4) sit between PART NAME and QUANTITY, invisible because
  the header row merges/hides them. `ITEM_ROW_COLUMN_COUNT = 8` and `valueForCell()`'s
  switch in `gatePass.ts` account for this; writing to index 3/4 as if they were
  Quantity/Unit (the "obvious" 6-column mapping) silently landed values in the wrong,
  invisible cells while leaving the real Quantity/Unit/Box cells untouched.
- **The TOTAL row's sum placeholders use `select(...)` with a parenthesis**, not
  `select[...]` with a square bracket as a quick screenshot read suggested — `replaceAllText`
  requires an exact substring match, so a one-character guess was enough to leave both totals
  showing the raw `<<sum(...)>>` token instead of a number.

Row-filling algorithm (`fillItemTable`/`fillRow` in `gatePass.ts`): the template's single
placeholder data row is filled first (clear + insert per cell, right-to-left, with a fresh
`documents.get()` before touching each cell — Docs API character indices shift after every
edit, so re-fetching is what keeps the index math correct across a multi-step edit instead
of chasing stale positions). Every additional item gets an `insertTableRow` below the last
row filled, then the same per-cell fill. The item table is re-located on every fresh read by
searching for its header row's `"SR. NO."` text (`locateItemTable`) rather than tracking raw
indices across edits — the header row is never edited, so this anchor stays valid throughout
the whole multi-step process. Scalar fields (customer, addresses, vehicle, date, totals) are
filled in one final `replaceAllText` batch, safe to run last since none of those tokens live
inside the item table by that point.

After filling, the copied Doc is exported to PDF (`drive.files.export`), uploaded as a
normal private Drive file via the same `uploadBufferToDrive()` helper the doer-facing
uploads route uses (`Backend/src/services/drive.ts`, factored out of `uploads.ts` for this
reuse), and the intermediate native Doc copy is deleted — only the final PDF is kept. The
resulting fileId is written to `"Dispatch Gate Pass"` on every `Transport_SO` row for that
trip and exposed via `openAttachment()` (same "View attachment" pattern as every other
attachment in this app) on `TripDetail.tsx`'s Vehicle Details section — no new viewer UI was
needed since it's just a normal PDF fileId by that point.

**Large orders can hit the Docs API's write-quota rate limit** — `fillRow`/`fillItemTable`
deliberately do one `documents.get` + one `batchUpdate` per cell (re-fetching before every
edit is the only way to keep index math correct as earlier edits shift later indices), which
for a 20-item order is 300+ sequential Docs API calls. Confirmed live: a real trip's gate
pass was silently failing with a 429 `rateLimitExceeded` ("write operations per minute per
user"), caught by `ensureDispatchGatePass`'s own outer try/catch and turned into a `null`
that looked identical to "never generated" — nothing surfaced the real cause anywhere in the
app. Fixed with `docsCall()` (`gatePass.ts`): a `DOCS_CALL_MIN_GAP_MS = 350` proactive
throttle between every Docs API call (backoff-after-the-fact alone wasn't enough — the quota
stayed saturated continuously across that many calls, not just tripped once) plus
exponential-backoff retry on any 429 that still slips through. **Do not "fix" this by
batching multiple cells into fewer API calls** — that would reintroduce the exact
stale-index bug the per-cell refetch exists to prevent; throttling/retrying is the correct
fix, not restructuring the fill algorithm.

**This throttling makes gate pass generation slow for large orders — confirmed ~133s for a
20-item order** — which is well past Vercel's default serverless function timeout (10s on
Hobby, 60s on Pro by default). `Backend/vercel.json` now sets `functions["api/index.ts"]
.maxDuration: 300` to cover this; Vercel silently clamps this down to whatever the actual
plan allows if 300s exceeds it, so this is safe to leave even on a lower-tier plan, but
means a large enough order could still time out mid-generation on a Hobby plan specifically.
If gate passes for very large orders keep failing after this fix, the next lever is either a
higher Vercel plan/`maxDuration`, or moving generation out of the request/response cycle
entirely (a background job) — not a smaller retry budget or per-call delay, since those
would just reintroduce the original 429 failures.

## Per-stage Transport queue views

Each of the 6 TRIP_STAGES now has its OWN Completed view showing the fields that stage
actually records, instead of every stage repeating the same generic trip table:
- `TripStageDef` carries `tab` (the stage's own sheet tab) + `completedColumns`
  (`{header, field}` pairs where `field` is the LITERAL live sheet header — these six tabs
  range from 18 to 95 columns and share no internal field-name map).
- `GET /transport-trips/stage-rows?tab=X` returns that tab's raw rows. The tab name is
  checked against a hardcoded allowlist (`STAGE_ROW_TABS`) — without it the endpoint would
  dump any tab in the spreadsheet. Registered BEFORE `/:transportId` so "stage-rows" isn't
  swallowed as a transport id.
- `TripQueueList` renders the stage's own columns when Completed is toggled; the PENDING
  view stays trip-level, which is genuinely what's pending (a trip awaiting that form).
- `STOCK_RELEASE` is the only item-level tab of the six (ORDER_ID/ITEM_ID, no
  Transport_ID), so its rows aren't clickable through to a trip; `LR`/`DELIVERY` key off
  `Dispatch ID`. Row keys fall through several id columns for that reason.

**Every one of the 44 declared `completedColumns` fields was verified to exist on its live
tab** — re-run that check if the sheets are hand-edited, since a wrong string here renders a
silent column of "—" rather than failing.

## Split / partial dispatch (multi-round Dispatch Approval)

An item's order quantity can be decided across **several Dispatch Approval rounds** — e.g.
12 SET ordered, 10 approved today, the remaining 2 decided later — rather than one decision
closing the item forever. Core helpers live in `orders.ts`: `summarizeDispatchDecisions()`
(sums every round per item) and `dispatchBalance()` (order qty − decided, floored at 0).
These **replaced** the old `latestDispatchDecisionByItemId()`/`isDispatchItemDecided()`
latest-row-wins pair — don't reintroduce a "latest row decides everything" check anywhere.

- Each round contributes: **Dispatch Today** → its Approved Quantity; **Short Quantity** →
  its own figure (a short still *accounts* for that portion — it isn't an open balance);
  **Excess Quantity** → closes the whole remaining balance to 0 outright; **Dispatch
  Extended** → contributes nothing (a hold on the current balance, not a decision).
- **Row-per-round**: the first round still fills in the SO-Confirmation-time placeholder in
  place (unchanged single-decision behavior); once a *real* decision exists, every later
  round **appends its own new `Dispatch Items Approval` row** with its own `Disp Conf Item
  ID`. `hasRealDecision` is what distinguishes the two paths.
- Server rejects a round exceeding the outstanding balance (`EXCEEDS_BALANCE`, 400) or one
  submitted against a fully-decided item (`ALREADY_DECIDED`, 409). The form mirrors both as
  live validation — Excess Quantity is deliberately exempt from the cap.
- `ORDER_PUNCH.STATUS` only reaches `DISPATCH APPROVAL COMPLETED` once **every** item's
  balance hits 0, not merely once every item has a row.
- The pending queue keeps showing an item (with a shrinking **Balance Order Quantity**)
  until its balance is 0; Status reads `"Pending Order Quantity"` once a round has happened
  but balance remains, vs plain `"Pending"` when untouched.

**PDI is per-round, not per-item, as a result.** `createPlaceholderPdi()` fires once per
"Dispatch Today" round, carrying **only that round's approved quantity** (not the item's
full order quantity) and keyed on that round's own `Disp Conf Item ID` — so the same item
can legitimately have several PDI rows. Consequences to preserve:
- The placeholder no-op check keys on `Disp Conf Item ID`, **not** `ORDER_ID`+`ITEM_ID`
  (that would wrongly skip the second round's placeholder).
- PDI's submit route only ever fills a still-`PDI Pending` row (oldest first) — matching
  regardless of Status risked overwriting an already-completed round's data.
- It deliberately does **not** write `Quantity`/`Unit` on the update path, since
  `updateRow`'s merge-by-header would overwrite the placeholder's correct approved quantity
  back to the item's full `QTY`. Those are only set on the fresh-append legacy fallback.
- "Item done" = **every** PDI row for it is `PDI Completed`, or it has zero rows (its whole
  quantity went Short/Excess so no PDI was ever needed) — never "at least one row done".

**Transport is now per-round too.** `Transport_Products` gained a `Disp Conf Item ID`
column (added via the API; the tab grid had to be widened from 41 to 42 columns first —
`values.update` fails with "exceeds grid limits" otherwise). `unattachedPdiRounds()` in
`tripRoutes.ts` is the single source for what Transport can pick up: every PDI row whose
Status is `PDI Completed` and whose round id is not already on a `Transport_Products` row.
- **No ORDER_PUNCH.STATUS gate.** `eligible-orders`/`eligible-items` deliberately do NOT
  filter on `PRE TRANSPORT COMPLETED` — that status only lands once EVERY item is fully
  decided AND PDI'd, which held a finished 20 SET hostage to an undecided 10 on the same
  item. A round that has cleared PDI travels on its own.
- `attachOrders` iterates the PICKS, not the order's items — the same item can appear twice
  (one row per round, each with its own quantity) and writes each round's `Disp Conf Item
  ID` onto its `Transport_Products` row. Keying a Map by `itemId` would collapse them.
- Rows attached before that column existed carry no round id, so `unattachedPdiRounds()`
  falls back to `ORDER_ID`+`ITEM_ID` for those only — without it, already-shipped legacy
  items would reappear as pending.

Stock Release / Tax Invoice / Dispatch / LR / Delivery still cascade at trip level, which is
correct (they act on a whole vehicle), but they inherit whichever rounds the trip carries.

## Editing a punched order

`PUT /orders/:id` reopens an already-punched order in the same 4-tab punch form
(`modules/punch-order/:orderId/edit`, and the mirrored `sale-order` path since
`OrderPunchList` is shared). `OrderPunchForm` switches to edit mode purely on the presence
of the `:orderId` param; `orderToFormState()` (`form/types.ts`) rehydrates the saved
ORDER_PUNCH row + ORDER_ITEMS back into form state.

- **Restricted to `STATUS === "PENDING"`** — the server 409s otherwise, and the list's Edit
  button is disabled unless exactly one selected row is PENDING. Once a discount is applied
  the order has `SALE_ORDERS`/`Order Punch Discount` rows derived from its exact amounts;
  rewriting the punch underneath them would silently desync every downstream copy. Editing
  later in the lifecycle is what SO Confirmation's Changes flow is for.
- Items are **replaced wholesale** (delete + re-append, renumbered `<orderId>-01`…), same
  strategy the Changes flow uses. `DISPATCH_PLAN` rows are rebuilt too since they reference
  item IDs the renumbering invalidates.
- `punchFieldsFromBody()`/`buildItemRows()`/`blockedByCustomerAssignment()` (`orders.ts`) are
  shared by create and edit so the two can't drift as fields are added — **add new punch
  fields to the helper, not to one handler.**
- **`ORDER_ITEMS` has no FG ID column at all** (verified against live headers), so
  `itemToSheet` silently drops `FG_ID` on write and an edited order always comes back with
  `fgId` blank. `validateTab()` therefore accepts `partName` *or* `fgId` as "a part is
  selected" — reverting that check to `fgId`-only makes every edit unable to leave Tab 2.
  Same class of gap: `Client Classification` and every `ZOTO Vehicle *` column are mapped in
  `orderPunchMap.ts` but don't exist in the live sheet, so those never persist either.
- **`SHIPPING_SAME` and `IS_SHIPPING_SAME` share one column** (`Is Shipping Address Same`);
  reads only return whichever the reverse map made canonical, so `orderToFormState` accepts
  either. Reading just `SHIPPING_SAME` leaves it blank and Tab 3 refuses to advance.

## Checklist app (Accounts department)

A separate top-level app off HOME (`/checklist`, not nested under `/modules` — same
"each tile is its own app" pattern as Sales CRR, see the HOME section above), reached from
the `CHECKLIST-ZOTO-V1` tile. Scope so far: **Accounts department only** — the old AppSheet
reference (`CHECKLIST-ADC-V1`) covers 11 departments; the other 10 aren't built yet, same
shape repeats when they are.

**Sits on top of an existing, untouched Apps Script pipeline** (not something this app owns
or should modify casually): `onChangeHANDLER` (on `ZOTO/CHECKLIST MASTER-FY26-27`, tab
`Task List Master`) → `sentdata_allchecklist_deptwise()` routes each new row by its
`Department` column into the matching department's `Task List <Dept>` tab → that
department's own `createChecklist1()` (a separate Apps Script project, e.g.
`Checklist-ACCOUNTS`) expands each template into dated `Master Accounts` instances
(D/W/M/Y/Q/F/E1st..ELast recurrence). This app's backend only ever writes the punch-in row
and reads/completes the resulting instances — it never touches routing or recurrence logic.

**Two spreadsheets** — env vars `CHECKLIST_MASTER_SHEET_ID` (`Task List Master`, `Doer
List`, `PcFollowUp`, `USERS`) and `CHECKLIST_ACCOUNTS_SHEET_ID` (`Task List Accounts`,
`Master Accounts`, `Working Day Calender`, `Holiday List`). **Doer identity is Employee Id,
not email** — the old AppSheet schema keyed everything off `USEREMAIL()`, but Employee
Master's own Email column is genuinely empty for every employee (confirmed directly), so
`Backend/src/routes/checklist.ts` writes the doer's Employee Id everywhere an email would
have gone; the Apps Script pipeline never validates that value, just copies it through.

**`GET /checklist/tasks/mine` is a shared department-wide queue, not a personal inbox** —
confirmed by previewing the old app as both an admin email and a regular doer email: both
saw the identical full list. Anyone with Checklist access sees and can complete *any* pending
row, not just their own. "Pending" = `Status` blank **and** `Planned <= now` — the recurrence
engine bulk-generates a task's entire range up front, so without the date filter a doer's
queue floods with instances scheduled weeks/months ahead.

**Admin-only views** (gated by a `"USERS"` tab *inside* `ZOTO/CHECKLIST MASTER-FY26-27`
itself — `checklistPermissions.ts`'s `isChecklistAdmin()`, separate from the Sales CRR USERS
sheet that gates base `requireModule("checklist")` access), shown as sidebar sub-links
indented under Checklist only while inside the app: **Assigned Checklist** (every punched
template across every doer, reads `Task List Master` directly with a
`CustomerFilterPanel`-style doer filter + count badges + "+ Add" to punch from there — this
is the *only* place a task gets punched now, not the shared queue page) and **Dashboard -
Pending Checklist** (per-doer pending count, click-through to that doer's list, "Update
Remark" writes to `PcFollowUp`).

**Google Sheets date cells come back inconsistently** — some rows parse fine with
`Date.parse`, others come back as a locale `"DD/MM/YYYY HH:mm:ss"` plain-text string that
`Date.parse` either can't read (NaN) or silently misreads as US month-first. An unparseable
row was being fail-safed to "always due", which fired on every locale-format row and leaked
future-dated tasks into the pending list. `checklist.ts`'s `parsePlannedDate()` parses
day-first explicitly instead of trusting `Date.parse`'s guessing — reuse it (or the same
pattern) anywhere else this app reads a Planned/date-ish cell back from Sheets.

## IMS module (Inventory Management System)

A third top-level app off HOME (`/ims`, flat routes like Checklist/NPD — not nested under
`/modules`), reached from the `IMS-*` tile via `Home.tsx`'s `hrefFor()`. Rebuilt from a
reference Next.js+Supabase app (`ims-adc-share-main`, given to Claude as a functional/data-
model spec only — nothing ported code-for-code) as a plain Sheets-backed module matching
every other app in this repo: no Supabase, no sync/mirror pipeline, reads go straight through
`readTable`'s existing 30s cache. The reference's own `docs/*.md` form specs and
`lib/google-sheets.ts` were mined into **`docs/work/ims-sheet-header-spec.md`** — the literal
column spec every new tab was created from; consult it (not the reference project directly)
before touching any IMS tab's shape.

**10 new spreadsheets**, created by the one-off `Backend/create-ims-sheets.mjs` script (not a
route — run once, safe to rerun since it resumes from an `ALREADY_CREATED` checkpoint rather
than duplicating). IDs live in `Backend/.env` / `env.sheets.ims*` (`imsStock`, `imsRmWip`,
`imsPurchase`, `imsProduction`, `imsFg`, `imsMasterFg`, `imsProductMaster`, `imsDataStorage`,
`imsCustomer`, `imsMasterCust`) — **not yet added to Vercel's env vars**, do that before
deploying Backend. **IMS's Sale/Transport data deliberately has no spreadsheet of its own** —
the reference's own "Sale" tabs (`SO_Confirmation`, `Dispatch Items Approval`, `Pre
Transport`, `Tax_Invoice`+`Tax_Invoice_SO`/`Products`, etc.) turned out to be the same tabs
Sales CRR's pipeline already writes on `ZOTO_TRANSACTIONS_SHEET_ID`/`TRANSPORT_SHEET_ID` —
confirmed by dumping live headers directly, not assumed. If IMS ever needs to read/write
sales-pipeline data, use those existing sheet ids, never create a duplicate.

**Why a brand-new spreadsheet at all, rather than reusing an existing one**: the service
account is plain/unimpersonated with **zero Drive storage quota of its own** (see
`googleAuth.ts`'s Drive comment — impersonation was fully revoked after a real incident, see
Known Gotchas) — it can't own a spreadsheet created in a normal Drive location. Every IMS
spreadsheet was instead created as a file **inside the existing Shared Drive folder**
(`DRIVE_FOLDER_ID`, via the Drive API with `parents: [DRIVE_FOLDER_ID]` +
`supportsAllDrives: true`), which has real storage independent of who creates a file in it —
the same reasoning `drive.ts`'s upload path already relies on. If a future module needs yet
another new spreadsheet, create it the same way — never assume the service account can just
`spreadsheets.create()` a standalone file in "My Drive".

**Header-name-driven, not column-position-driven.** Several of the reference's own tabs
(`Racks`, `WIP MASTER`, `ASSEMBLE RM FG`, `MASTER OF FG INVENTORY`, `Product Master`,
`CUSTOMER MASTER V2`, `MASTER CUSTOMER DATA`) only had column *names* confirmed, not exact
left-to-right order — this doesn't matter here the way it mattered for the old AppSheet
reference's own column-letter-driven forms, because this repo's `sheets.ts` (`readTable`/
`appendRows`) matches every field by **header text**, not position. `MASTER CUSTOMER DATA` in
particular was reproduced with only its ~35 actually-used columns (not the reference's full
302-column width) for the same reason — the unused ~267 columns would never be read or
written by anything in this app.

**Backend**: `Backend/src/routes/ims/` — `imsMasters.ts` (FG/RM/WIP/Other/Customer
catalogues), `imsStock.ts` (Record Entry IN/OUT/TRANSFER for FG/RM/WIP/Other — four separate
handlers, not one parameterized one, since each product type's balance rule and field shape
genuinely differs: FG is rack-scoped, RM is whole-part, WIP has no OUT rule but caps IN at a
batch's Casted Quantity, Other has no rule at all), `imsRacks.ts`, `imsProduction.ts` (Batch
Production/Followup, Batch Assembly/Followup, Produced Part + warehouse-in), `imsKyc.ts`
(Customer -> KYC copy flow), `imsInventory.ts` (live balances + read-only quarterly
snapshots), `imsSettings.ts` (requisition-email recipient storage only — no actual send path
yet, see below), and `imsRequisitions.ts` — all mounted under `/api/v1/ims/*` in `app.ts`.
`Backend/src/services/imsBalance.ts` holds the shared balance formulas so every route agrees
on the same number.

**`imsRequisitions.ts` replaces the reference's external, un-shared Google Apps Script** (the
reference app only ever flipped a `Requested` flag and read the result back from a Supabase
mirror — the actual BOM-explosion lived in a script this repo never had access to). Real
implementation here: `POST /production/:batchId/request` / `/assembly/:assemblyId/request`
explode `ASSEMBLE RM FG` (`No. Of Qty Use` x batch/assembly quantity) into one Raw Materials
Requisition / Assembly RM Requisition row per ingredient. `POST /release` does FIFO release
(oldest requisition filled first) against a new `Stock Release Log` tab (this tab has no
reference-app sheet counterpart — reconstructed from the reference's Supabase-only
`ims_stock_release` table, since a Sheets-only build needs a real tab, not an app-side-only
log) — rejects a release exceeding either the ticked requisitions' pending total or the
chosen rack's own balance, writes the RM OUT row through the same Stock Record RM path a
manual entry uses (requisition ids comma-joined into the `Batch ID` cell), and records exactly
what each requisition received in an `Allocations JSON` column (the OUT row itself only ever
carries one merged quantity). `DELETE /release/:id` undoes it — removes the RM OUT row first,
only removing the log row if that succeeds, so the log can never claim material came back if
the ledger still shows it gone (same ordering discipline as this project's other audit-log-
then-advance routes).

**Permissions**: `ims` + per-area sub-keys (`ims-masters`, `ims-stock`, `ims-racks`,
`ims-production`, `ims-requisitions`, `ims-kyc`, `ims-inventory`, `ims-settings`,
`ims-wip-weight`) added to `permissions.ts`'s `MODULE_ALIASES`. Every write route uses its
own specific `requireModule(...)` — **no blanket router-level guard**, per this repo's own
documented PDI/Stock-Release gotcha. `ims-wip-weight` specifically replaces the reference's
hardcoded 4-email restriction on Casted Weight updates with a real sheet-driven permission.
Not yet added to `permissionAudit.ts`'s `AUDITED_APPS` — do that once the HOME tile is live.

**Frontend**: `Frontend/src/ims/` — flat routes (`ims`, `ims/masters/:type`,
`ims/stock/:type`, `ims/racks`) registered in `App.tsx` next to Checklist/NPD's own,
`lib/imsApi.ts` (typed wrappers for every backend route, including the ones with no page
yet), `ImsHome.tsx` (landing nav grid, honestly marks which areas have a page built vs
backend-only), `ImsMastersList.tsx`, `ImsStockRecordEntry.tsx`, `ImsRacksList.tsx` — all
composing the existing `DataTable`/`FormModal` primitives, no new list/modal code.

**What's NOT built yet** (backend routes exist and are verified; no frontend page):
Production (batches/assembly), Requisitions, KYC, Inventory (balances/snapshots), Settings.
`imsSettingsRouter` only stores the requisition-email recipient list — actual sending was
deliberately not built, since ZOTO SYSTEM has no existing Gmail/email-send path to reuse and
this repo's own convention (see the Docs API section above) is to isolate a new Google API
scope on its own client rather than add one speculatively; wire it up as its own follow-up
when requisition-mail is actually needed, sharing `getGoogleAuth()`'s pattern of a
dedicated scope/client per feature.

**Verification performed**: Backend typechecks clean; every new GET route exercised live
against the real new sheets (all empty, as expected for brand-new data); every write helper
(`appendRow`/`updateRow`/`deleteRows`) round-tripped directly against `Stock Record RM`,
`Racks`, and `Batch Production` with headers matching exactly, then cleaned up. Frontend
typechecks clean; dev server boots with zero console errors; `/ims` correctly redirects to
`/login` under `RequireAuth`. **Not verified**: any authenticated frontend flow (no login
credentials available this pass), the requisition BOM-explosion/release logic against real
`ASSEMBLE RM FG` data (the new sheets have no BOM rows yet), and the "PARTIAL"-confidence
tabs' exact real-world usability (`Racks`, `WIP MASTER`, `ASSEMBLE RM FG`, `MASTER OF FG
INVENTORY`, `Product Master`, `CUSTOMER MASTER V2`'s ~7 unaccounted trailing columns,
`Customer Addresses`/`Contacts`/`Revisions`) — these were built from the header spec's best
reconstruction, not a live dump, since no live IMS sheet existed before this session; treat
as reference's Needs-manual-confirmation list until a doer actually uses each form once.

## Known gotchas

- **A brand-new Backend dependency can fail `tsc` on Vercel with "This expression is not
  callable" on its default import, even though it type-checks and works fine locally** —
  hit this with both `helmet` and `express-rate-limit` the first time each was deployed.
  Vercel restored its build cache from the last deployment (predating the new dependency),
  then `npm install` added just that one package incrementally on top of the stale cached
  `node_modules` — the new package's dual ESM/CJS `"exports"` map type resolution comes out
  broken/non-callable in that specific state, purely a type-only artifact (the runtime import
  itself is fine). Fix: cast the import to its known-callable shape instead of chasing the
  cache — see `Backend/src/app.ts`'s `helmet` cast and `Backend/src/middleware/rateLimit.ts`'s
  `rateLimit` cast for the pattern (`import fooImport from "foo"; const foo = fooImport as
  unknown as <real callable type>;`). If a *future* new Backend dependency throws this exact
  error on its first Vercel deploy, apply the same cast rather than debugging further.
- **The FG (goods) master tab was renamed live in Sheets from `"MASTER OF FG INVENTORY"` to
  `"FINAL GOOD SKU"`** — `Backend/src/routes/masters.ts` (`GET`/`POST /masters/goods`, plus
  the FG-ID counter) hardcoded the old name in three places, so the Order Punch item search
  silently returned "No matches" for every part after the rename until this was caught and
  fixed. Same tab, same `FG_SHEET_ID` spreadsheet, shared identically by both System 1 and
  System 2 — if this tab (or any other FG master tab) gets renamed again in Sheets, grep
  `Backend/src/routes/masters.ts` for the literal tab name string, same as any other header-
  drift fix in this project.
- **`TripQueueList.tsx` had no mobile branch at all**, unlike every other list component —
  its `CustomerFilterPanel` + `DataTable` wrapper used an unconditional
  `display: flex; minHeight: calc(100vh - 128px)`. On mobile, `CustomerFilterPanel` renders a
  horizontal chip row instead of a sidebar, and flexbox row's default `align-items: stretch`
  stretched that chip row to the full container height — a giant blank-looking pink column
  that squeezed the actual `DataTable` to nothing. This made Transport Reached/Stock Release/
  Tax Invoice/Dispatch/Collect LR/Delivery render as blank pink blobs on phone width in
  production. Fixed by adding the same `isMobile ? stack-vertically : flex-row` branch every
  other list component (`TransportList.tsx`, `PdiList.tsx`, etc.) already had. If a future
  list-style component ever "looks blank" on mobile only, suspect a missing mobile branch on
  a flex-row wrapper around `CustomerFilterPanel` first.
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
- **The customer master's `CUST ID` column is ARRAYFORMULA-generated — never write a literal
  into it.** Cell `C4` of `CUSTOMER MASTER T1`/`T2` holds
  `=ARRAYFORMULA(IF(E4:E<>"","CUST-"&TEXT(ROW(E4:E)-3,"0000"),""))`, which spills an id down
  the entire column (so a customer's id is purely a function of its row: `ROW - 3`). Google
  Sheets refuses to expand an array formula if **any** cell in the spill range already holds
  content, and turns the source cell into `#REF!` — blanking the id for *every other* row.
  `POST /masters/customers` used to mint its own id via `nextSequentialId()` and write it into
  this column; the first customer added through the app (System 2's `C69` = literal
  `"CUST-0066"`) did exactly this and silently reduced the punch form's customer picker from
  66 customers to 1, because `GET /masters/customers` filters on `/^CUST-\d+$/` and every
  other id had gone blank. Note the failure is invisible from the app side — the list endpoint
  returns 200 with a short array, it doesn't error. Fixed by clearing that one cell (the
  formula regenerates the *identical* `CUST-0066` for that row, so nothing referencing it
  broke) and by changing the route to append **without** `CUST ID`, then read the row back to
  pick up the id the sheet generated, 500ing with `CUST_ID_NOT_GENERATED` if it can't. An
  empty string is still content as far as the spill is concerned — clearing such a cell needs
  `values.clear()`, not writing `""`. If the picker ever looks short again, dump column C with
  `valueRenderOption: "FORMULA"` and look for a literal below `C4`.
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
