# Changelog

Running log of updates to the ZOTO Sales CRR app. Newest entries first. Each entry names the affected area and links back to the git commit for full detail.

## 2026-07-24

- **Built the remaining 8 pipeline stages end-to-end** (PDI, Transport, Transport Reached,
  Stock Release, Tax Invoice, Dispatch, Collect LR, Delivery) — the tail of the pipeline
  reverse-engineered from the old CRR system in `docs/Report.md`. Rather than 8 bespoke
  modules, built one generic, config-driven implementation:
  - `Backend/src/routes/stageConfig.ts` (`STAGES` array — tab name, ID prefix, prev/next
    `ORDER_PUNCH.STATUS` values, field list per stage) + `stageRoutes.ts`
    (`registerStageRoutes()`, registers `GET /orders/<stageKey>` and `POST
    /orders/:id/<stageKey>` for every stage; registered **before** the generic `GET /:id`
    route so Express doesn't swallow e.g. `GET /pdi` as `:id="pdi"`). Each stage appends one
    row to its own brand-new tab (`PDI`/`TRANSPORT`/`TRANSPORT_REACHED`/`STOCK_RELEASE`/
    `TAX_INVOICE`/`DISPATCH`/`LR`/`DELIVERY`, created on first use via `ensureSheetTab`,
    additive only) and advances `ORDER_PUNCH.STATUS` so the next stage's queue picks the
    order up — same append-only-log pattern as SO Confirmation/Dispatch Approval.
  - `Frontend/src/lib/stages.ts` mirrors the backend config field-for-field.
    `components/stage/StageQueueList.tsx` and `components/stage/StageForm.tsx` are the one
    list and one form component shared by all 8 stages; `App.tsx` generates their routes via
    `STAGES.map(...)`; `OrderDetail.tsx` derives the current stage from the URL and shows one
    generic "Give `{label}` Form" action instead of 8 hand-wired QuickActions.
  - Verified against the live sheet end-to-end: punched a test order through the full
    pipeline (Punch → Discount → Sale Order → SO Confirmation → Dispatch Approval → PDI →
    Transport → Transport Reached → Stock Release → Tax Invoice → Dispatch → Collect LR →
    Delivery), confirming every stage's tab got a correctly-ID'd row and `ORDER_PUNCH.STATUS`
    advanced correctly at each step; also drove the PDI stage through the actual UI (queue →
    detail → form → save → order correctly appears in Transport's queue next).
  - Adding a 9th stage later is one entry in each `STAGES` array — no new files needed.

- **Buyer GSTIN now auto-fills from the customer master too.** The Punch form never had a
  manual GSTIN input at all, so `BUYER_GSTIN` was always saved blank; `getBuyerFields()`
  now also picks it from `CUSTOMER MASTER T1`'s "Company GSTIN NO." column (found via the
  same `getBuyerFields()` that was just fixed for Sale Staff Name — same root cause pattern:
  a field the form silently sent as `""`, overriding whatever the auto-fill spread had set).
  Removed the now-dead `buyerGstin` field from the create-order payload/schema; SO
  Confirmation's Changes flow keeps its own editable Buyer GSTIN field for corrections after
  the fact. Verified against the live sheet: punching for CUST-0006 now correctly fills
  `33AADCV8736A1ZI`.
- **Frontend now revalidates `index.html` on every load instead of relying on a hard
  refresh.** Added explicit `Cache-Control` headers in `Frontend/vercel.json`:
  `no-cache, must-revalidate` for `/` and `/index.html`, `public, max-age=31536000,
  immutable` for hashed `/assets/*` files. Without this, a client whose browser cached an
  old `index.html` (which references the old build's hashed JS/CSS by filename) could keep
  serving a stale build indefinitely on normal navigation — a doer reported missing a
  feature that was actually live for everyone else. Assets are safe to cache forever since
  Vite content-hashes their filenames; only the HTML shell needed the no-cache treatment.
- **Removed the hardcoded "Tally 1 (Registered)" placeholder** from the Punch Order list
  column and the Order Detail "Order Details" section — it never reflected anything real.
- **Sale Staff Name now actually auto-fills.** `getBuyerFields()` in
  `Backend/src/routes/orders.ts` was reading `CUSTOMER MASTER T1`'s "Field Sale
  Representative" column, but the live sheet's header is spelled "Field Sale
  **Repersentative**" — the lookup always missed and the field stayed blank. Fixed to read
  the actual (misspelled) header; also removed the old manual `saleStaffName` input from the
  create-order payload since it's now fully auto-picked from the customer master, not
  user-entered. Verified against the live sheet: punching an order for CUST-0006 now
  correctly fills "Abhishek".

- **Self-service password change**, and a permanent fix for "Order not found" on every
  order. Added `POST /auth/change-password` (requires current password, writes to the
  caller's own `Employee Id` row's `Password` cell — row is matched on the JWT, not a
  request param, so nobody can target another account) plus a Change Password card on the
  Settings page. While testing found and fixed a real bug this surfaced: the frontend's
  global 401 interceptor (`Frontend/src/lib/api.ts`) was treating a wrong-current-password
  401 the same as an expired session, silently logging the user out — added an allowlist
  (`/auth/login`, `/auth/change-password`) so those endpoints' own 401s just show an inline
  error instead. Separately, `readTable` (`Backend/src/services/sheets.ts`) now tolerates a
  referenced-but-nonexistent sheet tab (catches the Sheets API's "Unable to parse range"
  error and returns `[]` instead of throwing) — this is what made `GET /orders/:id` 500 for
  *every* order ("Order not found" in the UI), because it unconditionally read a
  `DISPATCH_PLAN` tab that was never created on the live sheet. Verified both fixes against
  the live sheet/app: order detail loads correctly now, and a full change-password round
  trip (wrong password rejected without logout → correct change → login with new password →
  reverted back) all behaved correctly.

- **Dispatch Approval now persists, and SO Confirmation / Dispatch Approval log to their new
  dedicated sheet tabs.** The sheet grew three new pre-built tabs — `SO_Confirmation`,
  `SO_Confirmation_Items`, `Dispatch_Approval` — with their own human-readable columns
  (Seller/Buyer/Billing/Shipping/Consignee/Logistics/GST sections, matching ORDER_PUNCH's
  style). Added `soConfirmationMap.ts` (write-only field maps) and wired both routes to
  append one snapshot row per submit: `POST /orders/:id/so-confirmation` now also appends to
  `SO_Confirmation` (+ one row per item to `SO_Confirmation_Items`, sourced from
  `SALE_ORDER_ITEMS` so `SALE_ORDER_ITEM_ID` carries through) for every outcome
  (Confirmed/Changes/Cancelled); added a new `POST /orders/:id/dispatch-approval` route that
  appends one row per item to `Dispatch_Approval` and flips `ORDER_PUNCH.STATUS` to
  `DISPATCH APPROVAL COMPLETED`. These three tabs are append-only audit logs — the live
  source of truth is unchanged (`ORDER_PUNCH`/`SALE_ORDERS`/`ORDER_ITEMS`/`SALE_ORDER_ITEMS`
  keep being read/written exactly as before; nothing reads the new tabs back into the app).
  `DispatchApprovalForm.tsx` (previously UI-only, explicitly deferred) now actually saves via
  this route and navigates back to the queue. Verified against the live sheet end-to-end:
  punched a test order through discount → sale order form → SO Confirmation (Confirmed) →
  Dispatch Approval (Dispatch Today / Short Quantity), confirming each stage's snapshot row
  lands correctly including `SALE_ORDER_ITEM_ID`/`Sale Order No.` linkage.
  *(Also flagged, not fixed here: `GET /orders/:id` currently 500s for every order because it
  unconditionally reads a `DISPATCH_PLAN` tab that doesn't exist in the live sheet — spun off
  as a separate task.)*

- **Login switched from Email to Employee ID.** The `USERS` sheet was restructured (by hand)
  to `Employee Id`/`Password`/`Name`/`Permissions_Process`/`CAN_ADD`/`CAN_EDIT`/`CAN_DELETE`
  columns, replacing the old `EMAIL`/`ROLE`/`MODULES`/`ACTIVE` shape. Remapped
  `Backend/src/routes/auth.ts`, `services/permissions.ts`, and `middleware/auth.ts` to match
  (JWT/`AuthUser` now carries `employeeId` instead of `email`/`role`; `Permissions_Process`
  parses the same way `MODULES` did, "Admin" still means full access). Removed the unused
  self-service `/auth/set-password` route (dead code — the new sheet ships every row with a
  password already set, and nothing in the frontend called it). Login page's "Email" field
  is now "ID" (`Frontend/src/pages/Login.tsx`); Settings page shows the ID instead of an
  email address. Verified against the live sheet: both an Admin row and a restricted
  (`Permissions_Process: "Home,Sales CRR,Order Punch,SO Confirmation"`) row log in correctly
  with the right module scoping.

## 2026-07-23

- **Removed Production/Remarks/Sample module cards** — matches the confirmed 12-module set.
- **Editable Invoice Discount in SO Confirmation's GST Details tab**, above Basic Amount.
  Works whether or not items are also being edited: editing just the discount recomputes
  `TOTAL_AMOUNT` against the existing basic/tax; editing items recomputes everything
  together. Verified both paths against the live sheet.
- **Dispatch Approval detail form scaffolded (UI-only)** — `DispatchApprovalForm.tsx`, a
  single "Dispatch Details" tab with the Dispatch Approval dropdown (Dispatch Today /
  Dispatch Extended / Short Quantity / Excess Quantity), matching the reference exactly.
  Fields per choice and persistence are a later phase, by request.
- **SO Confirmation gets a real item/GST editor.** Added a 6th "GST Details" tab to the
  Changes flow (`ConfirmationItemsTab.tsx`, same search/qty/price/GST-slab pattern as the
  punch form's item editor), prefilled with the order's actual current items. Saving
  replaces `ORDER_ITEMS`+`SALE_ORDER_ITEMS` for that order and recalculates
  `BASIC_AMOUNT`/`TAX_AMOUNT`/`TOTAL_AMOUNT` on both `ORDER_PUNCH`/`SALE_ORDERS` — verified
  against the live sheet that an existing discount survives the recalculation correctly.
  Also fixed the tab-bar header (was `overflowX: auto`, rendering as an unreadable squished
  line with scrollbar arrows on some setups) to use explicit `‹`/`›` scroll buttons instead,
  and fixed a real pre-existing bug found while wiring this: `OrderPunchForm.tsx` sent item
  remarks as `remarks`, but the backend's item schema field is actually named `notes` — item
  remarks entered at Punch were silently being dropped (zod ignored the unknown key) ever
  since items were added to the punch form.
- **SO Confirmation → Dispatch Approval fully wired.** `SoConfirmationForm.tsx` now actually
  persists (`POST /orders/:id/so-confirmation`): Confirmed captures payment fields and
  advances the order to Dispatch Approval; Changes reveals the punch form's own Tab1/3/4
  components prefilled with the order's live data, letting the reviewer edit and post those
  edits back to both `ORDER_PUNCH` and `SALE_ORDERS`; Cancelled takes a single required
  remark. Added `DispatchApprovalList.tsx` (same list/Completed-toggle pattern as the other
  queues) fed by the newly-fixed `GET /orders/dispatch-approvals` — it was reading
  `SALE_ORDERS.APPROVAL_STATUS`, a column that doesn't exist on that sheet, so it always
  returned empty; now reads `ORDER_PUNCH.STATUS` instead, which `so-confirmation` actually
  sets. Verified against the live sheet: Confirmed correctly flips both rows' status and the
  fixed dispatch-approvals query picks the order up.
- **Attachment viewer now has an explicit Download button, not just the raw file.** Raw
  browser navigation to an image gives no toolbar/download control (only PDFs get one, and
  even then it's Chrome's own chrome, not ours) — added `GET /uploads/:fileId/viewer`, a
  small self-contained HTML page (dark header, filename, one clearly visible Download link)
  that embeds the file via `/stream`; `openAttachment()` now opens this page instead of the
  raw stream URL directly.
- **Attachments: fully private on Drive, viewed only via our own proxy.** Uploaded files no longer get any public "anyone" Drive permission at all. `POST /uploads` returns a bare `fileId`; viewing goes through `GET /uploads/:fileId/view-url` (mints a 5-minute token) → `GET /uploads/:fileId/stream` (token-gated, streams the file inline) — the doer sees the file in the browser's native viewer, never Drive's own UI (Share dialog, edit permissions). Also removed the attachments folder's lingering "Anyone with the link" permission entirely, which cascaded to make the one already-uploaded file private too. *(`44a4223`)*
- **Fixed a real security hole: uploaded files were publicly editable.** The attachments folder had "Anyone with the link: Editor" set (pre-existing, not caused by this app); every uploaded file inherited that as-is because the upload code's permission call was a silent no-op against the inherited grant. Downgraded to Viewer as an interim fix before the full private-by-default change above. *(`f8ef2d6`)*
- **GST Details now shows Invoice Discount (Rs)** on the Punch Order detail view, matching the reference layout. *(`b92ba7e`)*
- **Attachments render as inline field rows** (label left, "View attachment" link right) matching the reference layout, instead of a separate floating link block. Purchase Order Attachment / Other Order Attachment are now shown at all (previously missing entirely from the detail view). *(`b6ac5f8`)*
- **Fixed Sale Order Completed view and action visibility.** The pending/completed toggle was filtering on a hardcoded `CURRENT_STAGE` constant that never changed — nothing could ever reach "Completed." Now filters on `STATUS === "SALE ORDER"` (set once the Sale Order form is uploaded), and both the discount/upload quick-actions correctly hide once that stage is done. *(`2fc543e`)*
- **Sale Type toggle** (Order / Sample / Return Order) added to the Order Punch form, saved to `ORDER_PUNCH`'s `Sale_Type` column; added "Return Order" to the `CRR DD` dropdown list since it didn't exist there before. *(`635c773`)*
- **Fixed a real perf regression:** the ID-uniqueness check added the same day was calling `nextId()` once per line item inside loops (dispatch plan lines, sale-order-item copies), each forcing an uncached full-tab network read — an 8-item order meant 8 sequential round trips. Added `nextIds(prefix, tab, column, count)`, which reads the tab once and generates the whole batch from an in-memory set. *(`76ae827`)*
- **IDs are now provably unique**, not just statistically unlikely to collide: `nextId()` checks the target tab's ID column and retries (up to 5×) on a collision. *(`a85f414`)*
- **Switched every generated ID to `PREFIX-<8 random hex chars>`** (e.g. `ORD-e76026d8`), matching the old ADC system's ID style, replacing the fiscal-year sequential counter. *(`589144a`)*
- **Transporter details captured at Punch are now actually saved**, not just the transporter ID — Type, Contact No., Person Name/Contact, Address were auto-filled in the form but never made it into the save payload or the sheet map (4 columns were missing from the map entirely). *(`d4dddcb`)*
- **Sale Order phase 2:** saving the Sale Order form now creates a full `SALE_ORDERS` row (copy of every punch order-header field + carried discount + SO No./Date/Attachment/Remarks + a generated `SALE_ORDER_ID`) and copies each `ORDER_ITEMS` row into `SALE_ORDER_ITEMS`. *(`b0353b2`, `37d7537`)*
- **Sheet remap phase 1:** the transactions sheet's order-header tab was renamed `ORDERS` → `ORDER_PUNCH` with human-readable column names and new Seller/Consignee sections. Added `orderPunchMap.ts` (one field map, `punchToSheet`/`punchFromSheet`) so the API's internal field names stay stable while translating to the real headers on every read/write. Seller Details auto-fills from `SALLER_MASTER`; buyer segment/contact auto-fills from `CUSTOMER MASTER T1`. *(`9fee25d`)*

## 2026-07-22

- **Sale Order discount form**, matching the reference: Discount Reason, Type toggle (%/Rs), the matching amount field, saved via `POST /orders/:id/discount` which recalculates `TOTAL_AMOUNT` and flips status to `PENDING SALE ORDER`. Also logs to a new `ORDER_PUNCH_DISCOUNT` audit tab (auto-created), mirroring the old ADC system's discount log.
- **Sale Order module** now mirrors Punch Order's list/detail views (same underlying data), minus the "+" create button — new orders are only punched from Order Punch.
- **Sidebar branding**: cropped the real logo artwork for a crest icon + "My ZOTO" wordmark (not recreated text), sized and spaced to match the reference.
- Customer ID is now required before leaving Order Details on the Punch form (matching the old CRR), and various smaller form fixes (UOM default reconciliation against the live dropdown list, default UOM changed to SET, "Existing/New" toggles removed from Customer/Part sections in favor of a single search-select).

---

*Older history: see `git log` for anything before this file existed.*
