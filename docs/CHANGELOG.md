# Changelog

Running log of updates to the ZOTO Sales CRR app. Newest entries first. Each entry names the affected area and links back to the git commit for full detail.

## 2026-07-23

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
