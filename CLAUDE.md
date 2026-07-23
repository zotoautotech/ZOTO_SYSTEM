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
(`STATUS: SALE ORDER`, full row written to `SALE_ORDERS`/`SALE_ORDER_ITEMS`). Stages beyond
Sale Order (SO Confirmation, Dispatch Approval, …) aren't wired yet.

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

Drive auth uses **domain-wide delegation**, impersonating `operations@theairtrap.com`
(`Backend/src/services/googleAuth.ts`, `DRIVE_IMPERSONATE_USER` env var) — necessary because
a plain service account has zero storage quota and can't own files it creates in someone
else's folder. Sheets access is a separate, unimpersonated auth client (sheets are shared
directly with the service account, no impersonation needed there).

## Known gotchas

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
