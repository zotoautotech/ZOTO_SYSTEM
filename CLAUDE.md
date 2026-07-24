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

**The 8 stages after Dispatch Approval** (PDI, Transport, Transport Reached, Stock Release,
Tax Invoice, Dispatch, Collect LR, Delivery — reverse-engineered from the old CRR system,
see `docs/Report.md`) are all driven by one generic, config-based implementation instead of
8 bespoke module folders:
- `Frontend/src/lib/stages.ts` — `STAGES` array, one `StageDef` per stage: `key` (also the
  URL segment and API path), `label`, `prevStatus`/`nextStatus` (the `ORDER_PUNCH.STATUS`
  values that gate its pending queue and that it advances to), and a `fields[]` list driving
  the form (types: `text`/`number`/`date`/`datetime-local`/`yesno`/`file`).
- `Frontend/src/components/stage/StageQueueList.tsx` — the one list component for all 8
  (same Completed-toggle/customer-filter pattern as every other queue), rendered via
  `App.tsx`'s `STAGES.map(...)` route generation.
- `Frontend/src/components/stage/StageForm.tsx` — the one modal form for all 8, rendering
  whichever fields the `StageDef` declares.
- `OrderDetail.tsx` derives `currentStage` from the URL's module segment and shows a single
  generic "Give `{label}` Form" action whenever `order.STATUS === currentStage.prevStatus` —
  no per-stage QuickAction wiring needed.
- Backend mirror: `Backend/src/routes/stageConfig.ts` (`STAGES`, one `StageConfig` per
  stage — tab name, ID prefix/column, prev/next status, fields) and `stageRoutes.ts`
  (`registerStageRoutes()`, called from `orders.ts` **before** the generic `GET /:id` route
  so Express doesn't swallow e.g. `GET /pdi` as `:id="pdi"`). Each stage's tab
  (`PDI`/`TRANSPORT`/`TRANSPORT_REACHED`/`STOCK_RELEASE`/`TAX_INVOICE`/`DISPATCH`/`LR`/
  `DELIVERY`) is brand-new — plain internal `UPPER_SNAKE` headers, no translation-map file
  needed (unlike `ORDER_PUNCH`/`SO_Confirmation`), created on first use via `ensureSheetTab`.
  Adding a 9th stage later means one new entry in each `STAGES` array — no new components,
  routes, or files.
`Frontend/src/lib/` holds the API clients (`ordersApi.ts` — includes the generic
`listStageOrders(stageKey, status?)`/`submitStageForm(stageKey, orderId, payload)` used by
all 8 stages, `mastersApi.ts`, `attachments.ts` for the upload-viewer flow, `api.ts` for the
shared axios instance + auth header).

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

Three spreadsheets, IDs in `Backend/.env` (`ZOTO_TRANSACTIONS_SHEET_ID`,
`CUSTOMER_BILLING_SHEET_ID`, `TRANSPORT_SHEET_ID`, `FG_SHEET_ID`).

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
- `ORDER_PUNCH_DISCOUNT` — audit log of every discount applied, auto-created on first use
  via `ensureSheetTab()` (additive only, never touches existing tabs).
- `COUNTERS` — leftover from the old sequential-ID scheme, no longer written to (see IDs
  below). Don't delete it — just not the ID source anymore.
- `CRR DD` — dropdown value lists (e.g. Sale Type: Order/Sample/Return Order/Pilot Lot).

**Customer/Billing sheet** — `CUSTOMER MASTER T1` (buyer segment/contact auto-fill source),
`SALLER_MASTER` (seller/branch — currently one branch, `ZOTO-001`, auto-filled on every
punch save), `BILLING STRATEGY MASTER`.

**Pipeline so far:** Punch (`ORDER_PUNCH`, `STATUS: PENDING`) → discount applied
(`STATUS: PENDING SALE ORDER`, logged to `ORDER_PUNCH_DISCOUNT`) → Sale Order form uploaded
(`STATUS: SALE ORDER`, full row written to `SALE_ORDERS`/`SALE_ORDER_ITEMS`) → SO Confirmation
queue (`GET /orders/sale-orders`) → `POST /orders/:id/so-confirmation` outcome:
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

From there, the generic stage pipeline (see Frontend structure above) carries the order
through: `DISPATCH APPROVAL COMPLETED → PDI COMPLETED → TRANSPORT ASSIGNED → TRANSPORT
REACHED → STOCK RELEASED → TAX INVOICE COMPLETED → DISPATCHED → LR COLLECTED → DELIVERED`.
Each arrow is one `POST /orders/:id/<stageKey>` call (`pdi`/`transport`/`transport-reached`/
`stock-release`/`tax-invoice`/`dispatch`/`collect-lr`/`delivery`), appending one row to that
stage's own tab and advancing `ORDER_PUNCH.STATUS` to the next stage's trigger value. `GET
/orders/<stageKey>?status=COMPLETED` mirrors the existing pattern — but note each stage's
"Completed" view only shows orders **currently sitting** at that exact status; once the
order advances to the next stage it leaves the previous stage's Completed view too (same
already-existing behavior as SO Confirmation/Dispatch Approval, not a bug).

**`SO_Confirmation` / `SO_Confirmation_Items` / `Dispatch_Approval`** are separate,
pre-built append-only snapshot/audit-log tabs (human-readable headers, mapped in
`Backend/src/routes/soConfirmationMap.ts`) — **not** the live source of truth, which stays
`ORDER_PUNCH`/`SALE_ORDERS`/`ORDER_ITEMS`/`SALE_ORDER_ITEMS` exactly as above (nothing reads
these three tabs back into the app). One full snapshot row is appended to `SO_Confirmation`
+ one row per item to `SO_Confirmation_Items` on every `/so-confirmation` submit (any
outcome); one row per item is appended to `Dispatch_Approval` on every
`/dispatch-approval` submit. Item snapshots are sourced from `SALE_ORDER_ITEMS` (not
`ORDER_ITEMS`) so `SALE_ORDER_ITEM_ID` is always populated. `DispatchApprovalForm.tsx` now
actually persists (previously UI-only) via this route.

## IDs

`Backend/src/services/ids.ts`. Format: `PREFIX-<8 random hex chars>` (e.g. `ORD-e76026d8`),
not the old sequential `ORD-2627-0001`. **Always use `nextIds(prefix, tab, column, count)`
when generating more than one ID in a loop** (dispatch plan lines, sale-order-item copies) —
it reads the tab once and checks uniqueness in-memory. Calling `nextId()` per item in a loop
forces one uncached network read *per item* — a real perf regression that happened once
already, don't reintroduce it.

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
