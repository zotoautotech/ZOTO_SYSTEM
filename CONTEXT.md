# ZOTO NPD Platform — Module Context

Read this first, every NPD session — mirrors how the root `CLAUDE.md` works for Sales CRR/
Checklist. Keep it current: whenever a sprint changes architecture, schema, or a gotcha worth
remembering surfaces, update this file in the same turn. The full build brief lives in
`ZOTO_AUTOTECH_NPD_E2E_Build_Prompt.md` and `ZOTO_AUTOTECH_Backend_Sheet_Headers.xlsx` (both
originally under `Downloads\files`, not in this repo — copy them in here if they need to travel
with the code); the approved build plan is `C:\Users\ADMIN\.claude\plans\
c-users-admin-downloads-files-zoto-auto-mighty-crescent.md`. This file is the short, current-state
summary — don't let it grow into a second copy of either source doc.

## What this is

ZOTO's old AppSheet "NPD DESIGNS" PLM tool (289 tables / 7,676 columns / 419 views / 869 actions),
rebuilt as a real sibling app inside the existing ZOTO SYSTEM codebase — same relationship to the
main app as `Frontend/src/checklist/` + `Backend/src/routes/checklist*.ts`, reached from the
HOME launcher's "NPD" tile (currently falls through to `ComingSoon`, per `Home.tsx`'s `hrefFor()`
not yet recognizing it).

Covers: project intake → design/attachment review → FG/RM SKU master data → BOM assembly →
part-code request workflow → pricing audit → vendor/customer master + KYC → purchase/GST/invoice
→ WIP & finished-goods stock, plus new ZOTO-specific item-spec tables (LED/Ambient/Projector/
Android/Perfume/Electrical Accessory + Vehicle Compatibility) replacing the old app's 2‑wheeler
mechanical-parts tables (axle/drum/shocker/die-casting), which don't apply to ZOTO's product line.

**Architecture: Option A — Google Sheets as the backend**, matching Sales CRR/Checklist exactly
(service-account Sheets API via the existing `Backend/src/services/sheets.ts`, no new database).

## Status

**Post-Sprint-6 correction (2026-08-29): RM Part Code generation was rebuilt from scratch**
after direct investigation of the real legacy ADC spreadsheets (`Copy of ADC/PRODUCT MASTER-RM`
and `-FG`, not this project's own NPD_SHEET_ID) revealed the original Sprint-2 implementation
was architecturally wrong on two counts — see "RM Part Code — the real mechanism" below for the
full trace. **All 6 sprints from the original build plan are done (2026-08-29).** NPD is a real, working
sibling app — Auth/RBAC, taxonomy + FG/RM SKU catalogs, New Part Code Request, BOM Builder,
Price Change Log, Projects board + attachment review, Customer Onboarding/KYC, Purchase, Stock
& WIP Dashboard, Notifications, all built, backend+frontend, and verified live against the real
production sheets (not just typecheck) — see each Sprint's own detail section below for exactly
what was built, what was deliberately scoped out (and why), and every real bug this caught.
**Deliberately NOT built, flagged clearly rather than faked**: part-code/IQC PDF generation and
the "Send to Customer" document bundle (needs a real Docs template that doesn't exist yet —
see Sprint 4's detail); 5 of 6 item-spec tables' field lists are invented placeholders, not
verified against a real ZOTO spec sheet (see Sprint 6's detail). Below is Sprint 1's own
original completion note, kept for its own detail:

**Sprint 1 is fully done** (2026-08-29), backend and frontend both built and verified live:
- Backend: `npdPermissions.ts` (role-based RBAC via `NPD USERS`), `routes/npd/index.ts` (base
  router, `requireAuth`+`requireNpdAccess`), `routes/npd/taxonomy.ts` (generic CRUD over the 10
  taxonomy tables below, now also returning `label`/`idColumn` per table so the frontend never
  hardcodes field names), mounted at `/api/v1/npd`. Verified via curl: list/create/duplicate-409/
  update/delete/401-without-token, all against the real live sheets.
- Frontend: `Frontend/src/npd/NpdHome.tsx` (landing page, one card per NPD section — only
  Taxonomy so far), `TaxonomyAdmin.tsx` (table picker + `DataTable`, generic across all 10
  tables), `TaxonomyRowForm.tsx` (generic create/edit `FormModal`, fields driven entirely by the
  backend's metadata — no table-specific form code). Routes added to `App.tsx`
  (`npd`, `npd/taxonomy`, `npd/taxonomy/:key`); `Home.tsx`'s `hrefFor()` and `Layout.tsx`'s
  `APP_SECTIONS`/breadcrumb logic both updated for the `npd` app root, mirroring Checklist.
  **Verified live in the actual browser** (not just curl/typecheck) — logged in, navigated
  `/npd` → Taxonomy → created a real RM Category row through the UI, confirmed it round-trips to
  the live Google Sheet and the list refetches automatically; confirmed FG Segment (read from
  `FG_SHEET_ID`) renders correctly empty, matching that live tab's real state.

## The two-spreadsheet split (confirmed live, not just from the workbook)

**No third `NPD_SHEET_ID` spreadsheet was created** — the service account has zero Drive storage
quota (no impersonation is configured at all anymore, see "Drive/Docs auth — corrected" below),
so it can't create a new file in its own Drive. Per explicit user decision, `NPD_SHEET_ID` now
points at the **same live "ZOTO/PRODUCT MASTER-RM" spreadsheet** the RM SKU catalog already lives
on (`1As0rIUQbEm58URBbp3ic69IpCWVGhWQk95Bf2CNMoDs`) — it hosts `Raw Material SKU` plus every
NPD-specific tab (`NPD USERS`, `RM ref Category/Category DD/Paint`, `Vendor Master`,
`Vehicle Compatibility Master` already added; Projects/BOM/Part Code Request/pricing-audit/
Customer Master V2/Purchase/WIP/item-spec tabs to be added the same way as later sprints need
them — `env.sheets.npd` in `Backend/src/config/env.ts`). So there are really just **two**
spreadsheets NPD touches: `FG_SHEET_ID` (shared with Sales CRR, additive-only) and `NPD_SHEET_ID`
(= the RM sheet, NPD's own to grow freely).

The companion `ZOTO_AUTOTECH_Backend_Sheet_Headers.xlsx` (68 real tabs, transcribed from the old
AppSheet app) is **not** what's actually live in ZOTO's production sheets — verified directly via
the same service-account credentials the Backend already uses:

1. **`FG_SHEET_ID`** (already in `Backend/.env`, already used by Sales CRR's `masters.ts` for
   goods search) **is the exact same spreadsheet as "ZOTO/PRODUCT MASTER FG"**
   (`1Pbsp8ZSpHKrrTTZi0a_ZJsmaevNSsvXYnzosfDVM2aA`). It already has **live** production tabs:
   `FINAL GOOD SKU`, `FG ref Segment`, `FG ref Category`, `FG ref Category DD`, `FG Sub sub
   parts`, `FG ref Paint`, `Alphabet` — i.e. build-prompt Group 02 already exists, just with a
   **much simpler schema than the xlsx workbook assumed**. None of the workbook's 2-wheeler
   BOM-linkage ID columns (Drum ID, Shocker IDs, Wheel Rim ID, Clutch Cover ID, Sprocket Hub,
   Cylinder Head, Bearing, Yoke/Lever, Hozing, Belt Pulley, various `DIE CASTING <code>` columns)
   exist on the live sheet — they were an old-app artifact, never actually shipped to production.
   **NPD reads/writes this sheet directly, additively only** — new columns/tabs may be added, but
   nothing `Backend/src/routes/masters.ts` depends on may ever be renamed or removed. Check that
   file before any schema change here.
2. **The RM sheet ("ZOTO/PRODUCT MASTER-RM", `1As0rIUQbEm58URBbp3ic69IpCWVGhWQk95Bf2CNMoDs`,
   already shared Editor with the same service account) is `NPD_SHEET_ID` itself** — it already
   has a live, minimal `Raw Material SKU` tab (11 columns, no vendor-rate/dimension/spec fields
   yet), and now also carries every NPD-specific tab (`NPD USERS`, `RM ref Category/Category DD/
   Paint`, `Vendor Master`, `Vehicle Compatibility Master`, added 2026-08-29). **No separate
   `NPD_RM_SHEET_ID` exists** — one env var, `NPD_SHEET_ID`, covers both. As later sprints reach
   the ~50 remaining workbook tables with no live equivalent (Projects/Conversation/Attachments/
   Employee Data, BOM assembly, Part Code Request/KYC/pricing-audit tabs, Purchase, Customer
   Master V2/Customer Data, WIP, `archive price`, the new ZOTO item-spec tables), add them as more
   tabs on this same spreadsheet (`ensureSheetTab`-style, additive) — seed each one's headers
   verbatim from the xlsx workbook (no live equivalent to check against) but **drop** the
   confirmed-dormant 2-wheeler columns.

**Before writing any `npdMaps.ts` entry, dump that tab's real live headers again** — headers can
drift further before a given sprint starts. Don't trust the xlsx workbook or this file's own
column lists without re-checking, same "dump live headers, don't assume" discipline the root
`CLAUDE.md` documents repeatedly for Sales CRR.

## Live header snapshots (as read at the time this file was written — re-verify if stale)

`FINAL GOOD SKU` (on `FG_SHEET_ID`): `TIMESTAMP`, `USEREMAIL`, `FG ID`, `PART NO.`,
`Manupulation Partcode`, `SEGMENT`, `CATEGORY`, `SUB CATEGORY`, *(blank header)*, `Name`,
`STANDARD PART`, `MIN STOCK`, `MAX STOCK`, `OPENING STOCK`, `UNIT`, `Year`, `Discount`, `price`,
`DUPLICACY`, `Final Price`.

`FG ref Segment`: `TIMESTAMP`, `USEREMAIL`, `Unique ID`, `SEGMENT`.
`FG ref Category`: `TIMESTAMP`, `USEREMAIL`, `Unique ID`, `Against id`, `CATEGORY`.
`FG ref Category DD`: `TIMESTAMP`, `AGAINST ID`, `Unique ID`, `CODE`, `USEREMAIL`,
`SUB CATEGORY`, `Category`, `SEGMENT`, `KEY`.
`FG Sub sub parts`: `Timestamp`, `Unique ID`, `AGAINST ID`, `SEGMENT`, `Category`,
`SUB CATEGORY`, `STANDARD`, `KEY`, `CODE`.
`FG ref Paint`: `TIMESTAMP`, `USEREMAIL`, `Unique ID`, `Code`, `Paint Description`.
`Alphabet`: `SR NO.`, `Letter`, `Letter Increment`, `MAKED BY`, `MAKED CODE`.

`Raw Material SKU` (on the RM sheet): `TIMESTAMP`, `USEREMAIL`, `ID'S`, `PART NO.`, `Category`,
`Sub Category`, `Paint`, `MAKE BY`, `VENDOR NAME`, `IQC PDF UPDATE LAST`, `TrF tO Master Rm`.

The `CODE`/`KEY` columns on `FG ref Category DD`/`FG Sub sub parts` and `Alphabet`'s
`Letter`/`Letter Increment`/`MAKED CODE` confirm the part-code composition machinery from
build-prompt §5.2 (`Segment code + Category code + Sub-category code + running Alphabet
sequence`) is real and already live.

## Reused building blocks — do not rebuild these

- **Sheets service**: `Backend/src/services/sheets.ts` (`readTable`/`appendRow(s)`/`updateRow`/
  `deleteRows`/`ensureSheetTab`), spreadsheet-ID-agnostic.
- **IDs**: `nextSequentialId(spreadsheetId, tab, idColumn, prefix, pad, headerRow)` from
  `services/ids.ts` — spreadsheet-agnostic, use this for NPD (`nextIds`/`nextId` are hardcoded to
  the Sales CRR transactions sheet, don't reuse those for NPD).
- **Auth**: `requireAuth` + new `requireNpdAccess` (mirroring Checklist's `requireChecklistAccess`)
  built on `npdPermissions.ts`'s `hasNpdAccess`/`isNpdAdmin`/per-role checks, reading `NPD USERS`
  from `env.sheets.npd`. NPD gets its **own** permission tab, independent from Sales CRR's `USERS`
  sheet — same reasoning Checklist already documented for going its own way.
- **Frontend shell**: shared `lib/api.ts` axios instance (`/npd/...` paths, no new client);
  `components/DataTable.tsx`, `components/form/FormModal.tsx`, `components/form/SearchableSelect.tsx`,
  `components/CustomerFilterPanel.tsx`, `components/FloatingActionButton.tsx`/`QuickAction`,
  `components/stage/StageQueueList.tsx`+`StageForm.tsx` (generic field-list-driven form/queue
  pattern — reuse for every NPD status-pipeline screen instead of hand-coding one form per table).
- **Uploads/Drive**: `Backend/src/routes/uploads.ts` + `services/drive.ts` — same private-Drive
  file + view-token flow for every image/drawing/PDF/attachment column.
- **PDF generation**: same Docs-API-copy-and-fill pattern as `services/gatePass.ts` (own throttled
  `docsCall()`, own template Doc IDs, own isolated Docs-scope client) for part-code/IQC/tax-invoice
  PDFs.

## New code locations

- Backend (Sprint 1 built): `Backend/src/routes/npd/index.ts` (base router, mounted at
  `/api/v1/npd` in `app.ts`, `requireAuth`+`requireNpdAccess` gate), `Backend/src/routes/npd/
  taxonomy.ts` (generic CRUD over the 10 reference tables — RM ref Category/Category DD/Paint,
  Vendor Master, Vehicle Compatibility Master on `NPD_SHEET_ID`; FG ref Segment/Category/
  Category DD/Sub sub parts/Paint on `FG_SHEET_ID`, additive-only), `Backend/src/routes/
  npdPermissions.ts` (`hasNpdAccess`/`isNpdAdmin`/`hasNpdRole`, role read from `NPD USERS`).
  Not yet needed: `npdMaps.ts` (the taxonomy tables are simple enough to key directly by their
  real sheet headers — no translation layer; add one only if a future table's headers make
  direct pass-through awkward), `npdIds.ts` (taxonomy uses the shared `nextSequentialId` as-is;
  add a dedicated service once part-code generation — a genuinely new algorithm, not just an ID
  — lands in Sprint 2).
- Frontend: not started. Plan unchanged: `Frontend/src/npd/` (flat pages, mirroring
  `checklist/`), `Frontend/src/modules/npd/` (heavier stage-pipeline features — Projects board,
  BOM builder), `Frontend/src/npd/lib/npdApi.ts`. New `App.tsx` routes under `path="npd"`;
  `Home.tsx`'s `hrefFor()` needs `if (name.startsWith("NPD")) return "/npd";`.

## Sprint plan

1. **Done (2026-08-29).** Auth/RBAC (`NPD USERS`, `npdPermissions.ts`, seeded with one Admin row
   for `Employee Id "Admin"` / Santosh Sahni) + taxonomy admin backend (live FG ref tabs on
   `FG_SHEET_ID`; RM ref tabs + Vendor Master + Vehicle Compatibility Master added to
   `NPD_SHEET_ID`). Vehicle Compatibility seeding with the 13 vehicle models (Fronx/Grand Vitara/
   Brezza/Scorpio Classic/Ertiga/Thar/Thar Roxx/Swift/Seltos/Creta 2020/Creta 2024/Scorpio N/
   Scorpio N with Vents) not yet done — only Fronx/Maruti added as a smoke-test row so far.
   Taxonomy admin frontend shipped later that same day — Sprint 1 fully done.
2. **Done (2026-08-29).** FG & RM SKU catalogs + New Part Code Request workflow. See "Sprint 2"
   below for full detail — this line kept short since the section covers it.
3. **Done (2026-08-29).** BOM Builder + generic audit-log service + Price Change Queue. See
   "Sprint 3" below for full detail.
4. **Done (2026-08-29), PDF generation deferred.** Projects board + NPD Attachment review
   pipeline (status state-machine, server-enforced). See "Sprint 4" below for full detail and
   why part-code/IQC PDF generation was scoped out.
5. **Done (2026-08-29), `Customer Data`/`Items GST` folded in as scope cuts.** Customer
   Onboarding & KYC + Purchase. See "Sprint 5" below for full detail.
6. **Done (2026-08-29). ALL 6 SPRINTS NOW COMPLETE.** Stock & WIP Dashboard, the 6 new item-spec
   tables, Notifications, mobile verification pass. See "Sprint 6" below for full detail.

## Roles

`NPD USERS` tab: Employee Id + role token (Admin / Design-NPD-Engineer / Quality-Design-HOD /
Sales-CRM / Purchase / Finance / Store-Warehouse / Viewer). Route-level guards per role (not
per-view email allow-lists — the build prompt explicitly steers away from the old app's
`Show Permission Email` pattern). Admin bypasses every gate; Viewer is read-only everywhere.

## Cross-cutting rules

- Every table: `Timestamp`/`Useremail` on every insert/update.
- Enum fields (Segment/Category/Sub-category/Paint/Vendor) are always live dropdowns off their ref
  tabs, never free text — a recurring integrity gap in the old app's data, don't repeat it.
- Auto-ID via `nextSequentialId`, sequential/zero-padded, never a per-item loop (perf regression
  risk, same as the transactions-sheet ID service already documents).
- Duplicate detection (FG/RM SKU name+code, category, customer) is a **server-side** check — the
  real gate, never trust client-side/form validation alone.
- Search: in-memory filter over `readTable`'s cached rows (same approach `masters.ts`/
  `OrderPunchList` already use), not a manual lookup table like the old app's "Searching RM" tab.

## Sprint 2 detail (2026-08-29) — FG & RM SKU catalogs + New Part Code Request

**FG/RM SKU catalogs reuse taxonomy.ts's exact generic CRUD infra, not a new router.** Two new
`TABLES` entries, `fg-sku` (tab `FINAL GOOD SKU` on `FG_SHEET_ID`, idColumn `FG ID`) and `rm-sku`
(tab `Raw Material SKU` on `NPD_SHEET_ID`, idColumn `ID'S`), both with `allowCreate: false` (new
rows only come from an approved Part Code Request — enforced server-side in the POST handler,
not just hidden in the UI) and `skipDuplicateCheck: true` (many legitimately different SKUs
share the same Name, e.g. several customers each ordering "K4 6PC"). `getCatalogTable(key)` is
exported from `taxonomy.ts` so `partCodeRequest.ts` can append an approved request's row into
the right catalog without duplicating spreadsheetId/tab/idColumn/field-name knowledge.

**Part-code generation** (`Backend/src/services/npdPartCode.ts`) implements build-prompt §5.2's
"Segment code + Category code + Sub-category code + running Alphabet sequence" as: base code =
the chosen `FG ref Category DD`/`RM ref Category DD` row's own `CODE` column (a doer fills that
in once when creating the taxonomy row) + the next unused letter from the `Alphabet` tab (on
`FG_SHEET_ID` — shared by both FG and RM generation, one running sequence). **`Alphabet` turned
out to already hold real production data** when actually read (not blank as first assumed) — a
`Letter`/`Letter Increment` sequence A→B→C→…→Z→AA→AB… (99 rows deep) with `MAKED BY`/`MAKED CODE`
columns, only A and B already marked used. Never seeded this tab (would have overwritten real
data); `generatePartCode()` just treats the first row with a blank `MAKED CODE` as available,
matched by its `Letter` value, and writes only `MAKED BY`/`MAKED CODE` — `SR NO.`/`Letter
Increment` are left untouched since their exact pre-existing meaning isn't fully understood.

**New Part Code Request** (`Backend/src/routes/npd/partCodeRequest.ts`, tab `New Part Code
Request` added to `NPD_SHEET_ID`, trimmed from the xlsx workbook's 25 columns to 16 actually
used): `POST /` creates (`Status: Requested`), duplicate-checked against the real target catalog
(FG: `Name` match; RM: `Category`+`Sub Category` combo, since RM's catalog has no name-like
field of its own). `POST /:id/approve` (Design/Admin only, `hasNpdRole(["design"])`) looks up the
base CODE, calls `generatePartCode()`, inserts the new catalog row, marks the request Approved
with its generated Part Code. `POST /:id/reject` (same role gate) just records a note. Both
enforce `ALREADY_DECIDED` (409) if the request isn't still `Requested`.

**Real bug found and fixed during verification** (not just typechecked — this only surfaced by
actually exercising the UI): `taxonomy.ts`'s duplicate-check originally compared only
`requiredFields[0]`. For a single-required-field table (RM Category, FG Paint, …) that's fine,
but `*-category-dd` tables require **two** fields (`Category` + `SUB CATEGORY`), and `Category`
alone legitimately repeats across many sub-categories — the old check 409'd every legitimate
second sub-category under an already-used category. Fixed to compare **all** `requiredFields`
together as a combination. Caught live: creating "LED Modules & Drivers" / "Driver ICs" was
wrongly rejected as a dup of the existing "LED Modules & Drivers" / "COB LED Chips" row.

**Also fixed**: `PartCodeRequestList.tsx` originally used a blocking `window.alert()` on
approve, inconsistent with every other inline-error-message convention in this app (and awkward
in the harness's own browser automation, which doesn't screenshot native dialogs) — replaced
with an inline success line matching the existing error-message pattern.

**Frontend**: `PartCodeRequestForm.tsx`'s Category/Sub Category field is a `SearchableSelect`
sourced from the live `*-category-dd` taxonomy rows (not free-typed) — picking a real row avoids
a doer typing a combo whose taxonomy row doesn't exist, or exists but has no `CODE` yet, either
of which only fails later at approval time (`MISSING_TAXONOMY_CODE`). The select's option
`value` is the row's own array index into the filtered combo list, not a delimited
`${Category} ${SubCategory}` string — categories routinely contain spaces ("LED Modules &
Drivers"), so a delimited-string split would have silently corrupted the lookup for any
multi-word category (caught and fixed before it ever shipped, during initial review of the
diff — not a live bug like the two above, but worth remembering as the reason this file uses an
index instead of the seemingly more readable composite-string approach).

**Verified end-to-end live** (curl AND actual browser): create → duplicate-409 → approve
(generates real part code, writes real catalog row, letter sequence advances correctly:
`RMLEDC`+`C`=`RMLEDCC`, then `RMDRV`+`D`=`RMDRVD`) → already-decided-409 → reject-with-note →
missing-CODE-422, all confirmed against the live sheets through the real UI, not just typecheck.

## Drive/Docs auth — corrected (this repo's own `googleAuth.ts`, more current than root CLAUDE.md)

The root `CLAUDE.md`'s "Google Drive uploads" section still describes domain-wide-delegation
impersonation of `operations@theairtrap.com`. **That's stale.** `Backend/src/services/
googleAuth.ts` as it actually stands has **no impersonation anywhere, by deliberate policy** —
fully revoked after a 2026-08-27 incident where impersonated Drive access permanently deleted
production spreadsheets. Consequences for NPD:
- Sheets access stays as it always was: unimpersonated, every sheet shared directly with the
  service account (`getGoogleAuth()`).
- Drive/Docs access is now **also** plain/unimpersonated. Anything the service account creates or
  owns must live inside a genuine Shared Drive it's a member of (it has zero storage quota of its
  own otherwise) — this is exactly why `NPD_SHEET_ID` couldn't be freshly created and instead
  reuses the live RM spreadsheet (owned by the user's own Drive, shared Editor).
- Flag this drift to whoever next edits root `CLAUDE.md`'s Google Drive section — it should be
  updated to match `googleAuth.ts`'s current doc comment rather than left describing a revoked
  impersonation setup.

## Sprint 3 detail (2026-08-29) — BOM Builder + audit-log service + Price Change Queue

**New tabs on `NPD_SHEET_ID`**: `ASSEMBLE RM FG (BOM)` (trimmed from the xlsx workbook's 39
columns to 16 — Timestamp/Useremail/Unique ID/FG ID/FG Code/Category/Sub Category/RM ID/RM Code/
Quantity/Units/Levels/Level Sorting/Rate/Rate x Quantity Price/Status) and `NPD Changelog`
(Timestamp/Useremail/Entity/Entity ID/Field/Old Value/New Value/Reason). **New column on the
shared `FG_SHEET_ID`**: `COST OF GOODS` appended additively to `FINAL GOOD SKU` (had to widen
the sheet's grid column count first — same "exceeds grid limits" issue CLAUDE.md's
`Transport_Products` gotcha already documents, same fix: `updateSheetProperties` with a bigger
`gridProperties.columnCount` before the first write to the new column). Confirmed via
`masters.ts` that `FINAL GOOD SKU` is actively read **and written** by Sales CRR's own "Add New
Part" inline-creation flow — `price`/`Final Price`/`Discount` already mean something there, so
`COST OF GOODS` is a deliberately new, never-before-used column name, not a repurposing.

**BOM Builder** (`Backend/src/routes/npd/bom.ts`) denormalizes each line's FG Code/Category/Sub
Category from the FG SKU catalog and RM Code from the RM SKU catalog at create time (avoids a
join on every read, matching the workbook's own design intent for those columns). Duplicate
check: same FG+RM+Level combo, server-side. Every create/edit/delete recomputes and writes back
`rollUpCostOfGoods()` — sums all of that FG's lines' `Rate x Quantity Price`, writes the total to
`FINAL GOOD SKU`'s `COST OF GOODS`. **"Verified BOM Items" (the workbook's separate QA sign-off
tab) was deliberately folded into the BOM line's own `Status` column** (`Draft` → `Verified`,
`POST /npd/bom/:id/verify`, Quality/Admin only) rather than a second join tab — a line's
verification state is 1:1 with the line itself, so a separate tab would only ever hold a
duplicate FK back to it. Revisit only if a real need for a verification *history* (not just
current state) comes up.

**Generic changelog service** (`Backend/src/services/npdChangelog.ts`) replaces the workbook's
four separate tabs (Price Inputs/Price Logs/Edit Inputs/Collect logs) with one shared
`NPD Changelog` tab, keyed by `Entity`/`Entity ID` — exactly what build-prompt §8 itself asks
for ("implement once as a generic changelog service... instead of one bespoke log table per
module"). Wired into two write paths: `taxonomy.ts`'s generic PUT handler (via a new
`auditFields` flag on `TaxonomyTableDef`, set on `fg-sku` for `Discount`/`price`/`Final Price` —
logs only fields that actually changed value, before the write, same "log then advance"
ordering as the Sales CRR discount-log convention) and `bom.ts`'s PUT handler (Rate changes
only). **Price Change Queue** (`GET /npd/changelog`, `Frontend/src/npd/PriceChangeQueue.tsx`) is
deliberately scoped down to a read-only chronological log, NOT a real Finance-approval gate —
the build prompt's screen description ("pending edits awaiting Finance approval") would mean
blocking FG SKU price edits behind an approval step, a real workflow change to the generic
taxonomy PUT route that no other module in this app has (every other edit applies immediately,
audited after the fact). Documented as a deliberate scope cut in `changelog.ts`'s own doc
comment — revisit if a real approval-gate requirement comes up.

**Verified end-to-end live** (curl AND actual browser): create BOM line → cost roll-up (50) →
duplicate-409 → edit Rate 12.5→15 (roll-up recomputes to 60, changelog entry logged) → verify
(Status flips, button disappears) → delete (roll-up resets to 0) → missing-fgId-400; FG SKU price
edit via the catalog's generic PUT logs a changelog entry; added a second BOM line through the
real UI (RM SKU picker showing real RM SKUs, roll-up correctly reaching 67.00); Price Change
Queue page renders both changelog entries newest-first against the live sheet.

## Sprint 4 detail (2026-08-29) — Projects board + NPD Attachment review pipeline

**New tabs on `NPD_SHEET_ID`**: `PROJECTS` (trimmed from the xlsx workbook's 22 columns to 13 —
dropped `Approval Details`/`Priority Timestamp`/attachment-count columns, since attachments are
read live from `NPD ATTACHMENT` instead of duplicated onto the project row), `CONVERSATION`
(Timestamp/Useremail/Project ID/Message — a plain per-project comment thread, no reply-threading),
`NPD ATTACHMENT` (Timestamp/Useremail/Attachment ID/Project ID/Doc Type/File/Quality Review
[+Remarks+Timestamp]/Design HOD Review [+Remarks+Timestamp]). Attachment file bytes reuse the
existing `Backend/src/routes/uploads.ts` private-Drive-file flow unchanged — the tab only stores
the returned fileId, same as every other attachment field in this app.

**Status state-machine** (`Backend/src/services/npdProjectStatus.ts`) — pure functions, not ad
hoc field writes, matching this codebase's `ORDER_PUNCH.STATUS` convention: `Open` → `In Review`
(on a project's first `NPD ATTACHMENT` upload) → `Pending Customer` (once **every** attachment on
the project has both `Quality Review` AND `Design HOD Review` = `Approved`) → `Closed` (manual
only, `POST /npd/projects/:id/close`, never automatic — only a person can judge a project
genuinely done). "Quality Review" and "Design HOD Review" are both gated on the single `quality`
NPD role — the build prompt's own Roles table lists them as one combined role ("Quality/Design
HOD"), so this app has no separate `design-hod` role to split them; add one if that's ever needed.

**Deliberately deferred: PDF generation** (part-code PDF / IQC PDF, and the build prompt's
"Send to Customer" customer-facing document bundle). This would need a real Google Docs template
— like `services/gatePass.ts`'s Dispatch Gate Pass — and no such template exists for NPD yet.
Rather than fabricate a fake template or guess at its layout, this was scoped out explicitly
(see `npdProjectStatus.ts`'s own doc comment) rather than silently skipped. **Ask the user for a
real template Doc (or its exact field layout) before building this** — don't invent one.

**Real bug found and fixed during browser verification**: the attachment review "Approved"/
"Rejected" labels were colored with `var(--color-primary)`/`var(--color-error)` — this app's
theme has both as near-identical shades of red (`--color-primary: #e53935`,
`--color-error: #d32f2f`), so "Approved" and "Rejected" were nearly indistinguishable at a
glance. Fixed to match `components/StatusBadge.tsx`'s own established green/red convention
(`#2E7D32`/`#C62828`) instead — the only place in this app that already draws this exact
approve/reject-style distinction. Worth checking any future NPD screen showing an
approve/reject/success state against `StatusBadge.tsx`'s colors rather than reaching for
`--color-primary`, which is a brand-red accent color, not a semantic "positive" color — this
theme has no dedicated success token (confirmed by grepping `theme/tokens.css`).

**Verified end-to-end live** (curl AND actual browser): created a project (`Open`) → uploaded an
attachment (status auto-advanced to `In Review`) → approved Quality Review only (status correctly
stayed `In Review`, confirming the "every attachment, both reviews" gate isn't satisfied by a
single review) → approved Design HOD Review (status auto-advanced to `Pending Customer`) →
closed with remarks (`Closed`) → re-close correctly 409'd. Repeated the upload-through-both-
reviews sequence live in the browser end to end (file upload itself via curl, since a native OS
file picker isn't automatable through the browser tool — the upload endpoint itself is
unchanged, pre-existing, and already covered by this app's own upload tests elsewhere) and
confirmed the Projects Board's four Kanban columns correctly reflect both live projects' current
Status.

## Sprint 5 detail (2026-08-29) — Customer Onboarding & KYC + Purchase

**New tabs on `NPD_SHEET_ID`**: `New Raise Request` (customer basics + commercial terms —
Credit Days/Grace Period/TDS-TCS), `Customer KYC` (GSTIN/PAN/contact/documents, optionally
linked to a Raise Request via `Request ID`), `CUSTOMER MASTER V2` (published record — reuses
taxonomy.ts's generic CRUD exactly like `fg-sku`/`rm-sku` do, `allowCreate: false`), `Upload Tax
Invoice`, `Store In`.

**Two workbook tabs deliberately NOT built**, both documented as scope cuts in `customer.ts`'s
own doc comment: **`Customer Data`** (the workbook's separate "extended commercial/CRM profile"
tab) — its fields overlap heavily with `CUSTOMER MASTER V2`'s own Financial Details section, and
this app has no CRM module yet to justify a second near-duplicate profile tab. **`Items GST`**
(per-item purchase-order GST breakdown) — this app captures GST at the invoice level only (no
per-item purchase-order line structure exists yet to attach it to).

**Customer Onboarding** (`Backend/src/routes/npd/customer.ts`): `POST /raise-requests` creates
(`Status: Pending`); `POST /kyc` creates (`KYC Status: Pending`, optional `requestId` link);
`POST /kyc/:id/decide` (Sales/CRM or Admin only) — Approved publishes straight into
`CUSTOMER MASTER V2` via `getCatalogTable("customer-master-v2")`, carrying over the linked Raise
Request's Credit Days/Grace Period/TDS-TCS (the KYC tab itself never collects those — they only
ever live on the Raise Request); Rejected just records remarks. `ALREADY_DECIDED` (409) guards
re-deciding. **Frontend's `KycForm.tsx`** auto-fills Customer Name from the linked Raise Request
the moment one is picked, verified live.

**Purchase** (`Backend/src/routes/npd/purchase.ts`): `POST /tax-invoices` (Purchase or Admin
only) looks up the vendor from Sprint 1's `Vendor Master` taxonomy table, computes
`Total Amount Inc Tax = Basic + CGST + SGST + IGST − TDS − Discount` **server-side** (matches
Sales CRR's own "never trust client math" convention for tax invoices) — the frontend shows a
live preview of the same formula, labeled explicitly as a preview, not the real figure.
`POST /store-in` (Store/Warehouse, Purchase, or Admin) validates both the invoice and RM SKU
exist, records a QC decision (`Passed`/`Failed`) + optional weight-check image (reuses the
existing `FileDropzone`/uploads.ts flow, no new upload mechanism) — **does not yet move any
stock-on-hand number anywhere**; `WIP MASTER`/`MASTER OF FG INVENTORY` (the actual stock ledger
this would eventually update) are Sprint 6.

**Real bug found and fixed during browser verification**: `TaxonomyAdmin.tsx`'s "no create"
banner was hardcoded to say "come from an approved Part Code Request" — true for `fg-sku`/
`rm-sku`, but wrong once `customer-master-v2` reused the same generic component (its rows come
from an approved KYC, not a Part Code Request). Caught by actually opening the Customer Master
Catalog tab and reading the banner. Fixed to name both real sources generically rather than
hardcoding one.

**Verified end-to-end live** (curl AND actual browser): Raise Request → linked KYC → Approve &
Publish (customer correctly appeared in the Customer Master Catalog with carried-over credit
terms) → re-decide correctly 409'd; Tax Invoice upload with real vendor picker (GST math
verified: 10000+900+900+0−100−50 = 11650) → Store In against it with real RM SKU picker,
QC Passed/Failed toggle, and file upload control all rendering correctly; invalid vendor/RM IDs
correctly 404'd.

## Sprint 6 detail (2026-08-29) — Stock & WIP Dashboard, item specs, Notifications, mobile

**ALL 6 SPRINTS FROM THE ORIGINAL BUILD PLAN ARE NOW DONE.** Future work on NPD is either
polish/bug-fixing on what exists, or genuinely new scope the user asks for — not "continuing
the sprint plan," which has no more numbered items left.

**New tabs on `NPD_SHEET_ID`**: `WIP MASTER` (RM ID/Stage/Quantity/Status — tracks a raw
material through Raw Material → Sub-Assembly → Finished Unit, ZOTO's actual assembly process;
explicitly NOT the workbook's ingot→casted→machined staging, which was 2-wheeler die-casting
specific) and the 6 new ZOTO item-spec tables (`LED Light Specifications`, `Ambient Light
Specifications`, `Projector Light Specifications`, `Android Infotainment Specifications`,
`Car Perfume Specifications`, `Electrical Accessory Specifications`), each a detail record
against one RM SKU via an `Against ID` field. **All 7 reuse taxonomy.ts's generic CRUD** — same
pattern as every reference table since Sprint 1 — so they showed up in the Taxonomy admin
picker with zero new frontend code beyond the backend `TABLES` entries.

**Important limitation, flagged in `taxonomy.ts`'s own doc comment**: only `LED Light
Specifications`'s field list came from a real source (the original xlsx workbook's header dump,
read during initial planning). **The other 5 categories' fields are invented, plausible-for-
the-category placeholders** — no live ZOTO spec sheet existed to dump for Ambient/Projector/
Android/Perfume/Electrical Accessory. Treat these as an editable starting schema, not a
verified one; ask ZOTO's NPD/Quality team to confirm or correct the field list per category
before relying on it for real spec sheets. This is the one table set in the whole NPD build
that breaks the project's usual "dump live headers, never guess" discipline — done deliberately
and documented, because no live source existed to dump in the first place (same situation the
build prompt itself was in when it invented these tables to begin with).

**Stock & WIP Dashboard** (`Backend/src/routes/npd/dashboard.ts` `GET /stock`,
`Frontend/src/npd/StockWipDashboard.tsx`) reads `FINAL GOOD SKU` live and flags `lowStock` only
when `MIN STOCK` is actually set (`min > 0 && opening < min`) — most of the 78 seed rows have
entirely blank stock fields (confirmed live), so a naive `0 < 0` check would have flagged every
single one. WIP itself is browsed via Taxonomy → WIP Master (linked from this dashboard) rather
than a bespoke stage-tracker UI — same "reuse the generic table, don't build a fifth CRUD
screen" reasoning as everywhere else.

**Notifications** (`GET /npd/dashboard/notifications`, `Frontend/src/npd/Notifications.tsx`) —
live-computed "what needs attention right now" across 4 categories (attachments awaiting
review, KYC pending, low-stock FG, recent price/BOM changes), **not** a persisted/markable-read
feed — no email/push delivery mechanism exists anywhere in this codebase to build real
notifications on top of, so this is deliberately scoped as the query layer such a mechanism
would eventually sit on, not a fake "notification" that doesn't actually notify anyone. Each
row deep-links to the actual place to act on it (e.g. an attachment notification links straight
to its project, even a Closed one — verified this correctly surfaces a not-yet-reviewed
attachment on an otherwise-closed project, a real edge case the live data happened to expose).

**Real bug found during mobile/navigation verification**: `Layout.tsx`'s breadcrumb builder had
a `CHECKLIST_SEGMENT_LABELS` map (`dashboard` → `"Dashboard - Pending Checklist"`) applied
**unconditionally to every app's path segments**, not just Checklist's own. The new
`/npd/dashboard` route collided with it — both the breadcrumb and the header search
placeholder showed "Dashboard - Pending Checklist" on NPD's own Stock dashboard, nothing to do
with Checklist at all. This is the same class of bug CLAUDE.md's own "stale frontend-only route
can silently shadow a real one" gotcha describes, just via a label map instead of a route table.
Fixed by gating `CHECKLIST_SEGMENT_LABELS` lookup on `pathSegments[0] === "checklist"` — every
other app's segments now always fall through to the generic `seg.replace(/-/g, " ")` label. If
a future NPD (or any other app's) route name ever collides with a Checklist-specific segment
name again, this is now safe — but the underlying pattern (a segment-label map with no app
scoping) is worth checking again if Checklist itself ever adds new segment names.

**Mobile verified live** (resize_window to the `mobile` preset, not just assumed from the
shared components): Projects Board's Kanban columns correctly stack vertically instead of
scrolling horizontally; Taxonomy Admin's `DataTable` correctly collapses to one card per row.
Both inherited "for free" from `FormModal`/`DataTable`'s existing mobile handling — no NPD-
specific mobile CSS was needed anywhere across all 6 sprints, confirming the "reuse the shared
components" approach paid off exactly as intended.

**One live-data change worth knowing about**: `MIN STOCK` was set to `50` on FG ID `1` (K4 6PC)
during this sprint's own low-stock verification — a real write to the shared `FG_SHEET_ID`
sheet Sales CRR also depends on. Left in place (a plausible real threshold, not obviously fake
test junk, matching this session's established convention of leaving reasonable seed data) —
clear or adjust it directly in the sheet if `50` isn't the real intended threshold.

## Gotcha found and fixed: cwd-relative paths break under `.claude/launch.json`'s preview

Two separate instances of the same root cause, both discovered by actually exercising
`preview_start` (the harness's normal way to run+verify this app) rather than trusting
typecheck — **not NPD-specific bugs, both would have broken `preview_start`-based verification
for the whole app**, caught here because Sprint 1/2 verification was the first time anyone had
actually driven this app through `preview_start` rather than a manually-`cd`'d terminal:

1. `Backend/src/config/env.ts` used to be a plain `import "dotenv/config"`, which resolves
   `.env` relative to `process.cwd()`. `.claude/launch.json`'s `backend-dev` config launches
   `node Backend/node_modules/tsx/dist/cli.mjs watch Backend/src/index.ts` from the **repo
   root** — cwd is the repo root, not `Backend/`, so `Backend/.env` silently never loaded. Every
   env var fell back to its default/empty string, surfacing as a 500 on `POST /auth/login` with
   no obvious cause. **Fixed** by resolving `.env` relative to `env.ts`'s own file location
   (`path.resolve(dirname(fileURLToPath(import.meta.url)), "../../.env")`) instead of cwd.
2. Once (1) was fixed, `GOOGLE_APPLICATION_CREDENTIALS` (`./secrets/service-account-key.json`,
   itself a cwd-relative path stored *inside* `.env`) hit the exact same bug one layer down —
   `Backend/src/services/googleAuth.ts`'s `readFileSync(env.googleApplicationCredentials)`
   still resolved against `process.cwd()` (the repo root), producing `ENOENT` for
   `<repo root>\secrets\service-account-key.json` instead of the real
   `Backend\secrets\service-account-key.json`. **Fixed** the same way — resolve relative
   credential paths against a `BACKEND_ROOT` constant computed from `googleAuth.ts`'s own file
   location, not cwd.

**If a future cwd-relative path bug turns up anywhere else in `Backend/`, apply this same
fix-relative-to-the-file's-own-location pattern rather than a fresh one-off fix** — grep for
other bare `readFileSync`/relative-path env vars first, since there may be more.

## RM Part Code — the real mechanism (investigated 2026-08-29, post-Sprint-6)

The user gave direct read access to the **actual legacy ADC spreadsheets** this whole system
was reverse-engineered from — `Copy of ADC/PRODUCT MASTER-RM`
(`1j1coihwiZwpwka2bZzMGDuWcTv8ewlrGV7U9s7WIml0`) and `-FG`
(`1ELVEZtU-97REG2omhUT9cW41WjhwOYaFJXMrCGQIhB4`) — separate from this project's own live sheets.
Reading them directly (61 tabs on RM, all headers dumped, then real row data cross-checked)
overturned the Sprint-2 assumption that part codes were auto-generated by an Alphabet-letter
suffix. They aren't — they never were, on either side.

**Two architectural corrections, both confirmed from real data, not inferred:**

1. **`New Part Code Request` is NOT a code-creation flow.** Every real row in the legacy tab
   has `Part Add or Assign = "Assign"` and an *already-filled* `Part Code` — it's a **Sales**
   request to assign an ALREADY-EXISTING part to a new customer (matching the
   `Parts Allocation` many-customers-per-part pattern found on the FG side: one real row listed
   34 different distributor names in a single `Customers Name` cell). NPD's
   `partCodeRequest.ts` (Sprint 2) does the opposite of this — anyone submits, auto-generates a
   brand-new code — and is now known to model the wrong workflow. **Not yet rebuilt** — still
   generates FG codes via the old Alphabet-suffix scheme (never verified against real FG data,
   since real `FINAL GOOD SKU.PART NO.` values are almost entirely blank in production — there
   was nothing to reverse-engineer against on that side). Fixing the FG side to a real
   sales-assignment model is unstarted; ask before touching it, since it needs its own
   `Parts Allocation`-style table design decision.

2. **RM Part Code IS deterministic — verified against all 714 real `Raw Material SKU` rows,
   100% pattern match.** Full breakdown, each piece independently confirmed:

   ```
   PART NO. = [Category CODE] + [Sub-Category CODE] + [3-digit count] + [Paint CODE] + [Design-By digit]
   ```

   - **Category CODE** (2 letters) — `RM ref Category.CODE`, one row per Category. Proven 1:1
     against every real row (e.g. `LEVER` → `AG`, `CAM` → `AH`).
   - **Sub-Category CODE** (2 letters) — `RM ref Category DD.CODE`, one row per Category+Sub
     Category pair. Also proven 1:1.
   - **3-digit count** — NOT stored anywhere; a monotonic counter scoped to the 4-letter
     (Category+Sub-Category) prefix, starting `000`, incrementing per new part under that
     prefix, in creation order. Verified: 62 of 64 real multi-part prefixes matched exactly;
     the 2 "mismatches" were both explained by one deleted row in one prefix group, not a
     different rule.
   - **Paint CODE** (1 letter) — `RM ref Paint.Code`, a real 22-row lookup (A–V). This is the
     piece that disproved an earlier wrong theory ("the letter identifies which of the ~26
     category-specific dimension tabs holds the spec") — BUSH and BRAKE SHOE are different
     dimension tabs but share the same paint (`"WITHOUT COTTING AND PLATING"` = code `B`) and
     both correctly produce `B1`, which is what actually broke that theory and pointed at Paint
     instead. **The user supplied this correction directly**, having already found and screen-
     shotted the real `RM ref Paint` and `PART DESGIN BY` legacy tabs before I'd located them.
   - **Design-By digit** (1 digit) — `PART DESGIN BY.CODE`: `0 = ADC Design Party` (in-house),
     `1 = Supplier Design`.

   **Why RM has a real formula and FG doesn't**: unclear — possibly FG's process matured later
   and never got the same rigor, or FG parts are customer-bespoke often enough that a fixed
   formula didn't fit. Not resolved; noted as an open question, not guessed at further.

**Live sheet changes** (user made these manually in `NPD_SHEET_ID`, the live
`ZOTO/PRODUCT MASTER-RM` spreadsheet, matching the verified legacy shape): `RM ref Category`
gained `CODE` + `Against id` columns; `RM ref Category DD` gained `Category ID` (its `KEY`
column from the Sprint-1 seed was never live — a header-drift catch, same discipline as
everywhere else); new `PART DESGIN BY` tab created and seeded with `0 = ZOTO DESIGN PART`,
`1 = SUPPLIER DESIGN PART` (ZOTO-branded, not the legacy "ADC DESIGN PARTY" wording).

**Rebuilt to match**:
- `Backend/src/services/npdPartCode.ts` — `generateRmPartCode()` does the 4 lookups (Category/
  Sub-Category/Paint/Design-By) + the prefix-scoped counter + concatenation. The OLD Alphabet-
  suffix `generatePartCode()` is kept alongside it (renamed nothing, just no longer RM's own)
  since `partCodeRequest.ts` still uses it for FG — see correction #1 above for why FG wasn't
  touched.
- `Backend/src/routes/npd/rmPartCode.ts` (new) — `POST /npd/rm-part-code/generate`, Design/
  Admin only, creates the actual `Raw Material SKU` row directly. This is now the real
  Design-side entry point — **not** `partCodeRequest.ts`, which stays a (still not yet
  rebuilt) placeholder for the Sales-assignment model.
- `taxonomy.ts` — `rm-category` gained `CODE`+`Against id` fields (now required), `rm-category-
  dd`'s stale `KEY` field replaced with the real `Category ID`, new `part-design-by` table
  entry added — all reusing the same generic CRUD as everything else.
- Frontend: `RmPartCodeGenerator.tsx` (new page, `/npd/rm-part-code`) — 4 cascading
  `SearchableSelect`s (Sub Category filtered live by the chosen Category) sourced from the real
  taxonomy tables, submits to the new endpoint, shows the generated code with each component
  labeled. `TaxonomyAdmin.tsx`'s "no create" banner corrected — no longer claims RM SKUs come
  from New Part Code Request.

**Verified end-to-end live** (curl AND actual browser): seeded a real Category/Sub-Category/
Paint through the taxonomy API, generated `AAAA000A0` then `AAAA001A1` (count incrementing
correctly, different Design-By digit correctly changing the last character), confirmed a
missing-paint lookup 422s with a clear message, then repeated the full flow through the actual
UI (cascading dropdowns, real Category→Sub-Category filtering, generated `AAAA002A0` correctly
continuing the count) and confirmed the new row appears in the RM SKU Catalog.

**Not done as part of this correction** (flagged, not silently skipped):
- FG Part Code generation still uses the unverified Alphabet-suffix scheme — real FG data had
  nothing to reverse-engineer against, so there's no known-correct target to rebuild toward yet.
- `New Part Code Request` still models "anyone requests, system generates" rather than the real
  "Sales requests an existing part be allocated to a new customer" — rebuilding it needs a
  `Parts Allocation`-style many-to-many SKU↔Customer table design decision the user hasn't made
  yet. Ask before building it.

## `RM ref Category.CODE` auto-generation (2026-08-29, post-Sprint-6 continued)

The user found and shared the **actual live AppSheet App Formula** for `RM ref Category.CODE` by
opening the column's own settings in the AppSheet editor — not inferred from data this time, the
literal formula:

```
LOOKUP(LOOKUP(maxrow("RM ref Category","TIMESTAMP",ISNOTBLANK([Unique ID])),
       "RM ref Category","CATEGORY","CODE"),
       "Alphabet","Letter","Letter Increment")
```

Decoded: find the most-recently-created `RM ref Category` row (`MAXROW` by `TIMESTAMP`), read
**its** `CODE`, look that letter up in an `Alphabet` tab's `Letter` column, return the matching
`Letter Increment` — i.e. **new CODE = the letter right after whichever Category was added last**.
The user also pulled the real `Alphabet` tab's full content directly from the live
`ZOTO/PRODUCT MASTER FG` sheet (a 702-row `SR NO./Letter/Letter Increment/MAKED BY/MAKED CODE`
table, A→Z→AA→AB→…→ZZ, with only the first 2 rows' `MAKED BY`/`MAKED CODE` populated —
`CASTED`/`ZOTO`/`0` and `MACHINED`/`SUPPLIER`/`1`).

**Implemented to match exactly, not just documented:**
- New `Alphabet` tab created on `env.sheets.npd` (the RM spreadsheet) — same shape, same 702
  rows, generated programmatically (a `colName()` bijective base-26 function), not hand-pasted.
  **This is a separate tab from `env.sheets.fg`'s own `Alphabet`** (used by the FG Part Code's
  unverified Alphabet-suffix scheme, see the section above) — two different spreadsheets, two
  independent Alphabet tabs, same layout only.
- `Backend/src/services/npdPartCode.ts` — new `nextCategoryCode()`, implementing the formula
  exactly: finds the most-recent `RM ref Category` row by `TIMESTAMP`, reads its `CODE`, looks up
  the next `Letter Increment` in the new RM `Alphabet` tab. Bootstraps to the Alphabet's first
  letter (`"A"`) when no Category rows exist yet — the real formula's `MAXROW` would find nothing
  in that case, matching how the very first live Category had to be seeded by hand originally.
- `taxonomy.ts`'s `rm-category` entry: `CODE` dropped from `requiredFields` (still in `fields`,
  so it's visible and editable for a manual correction, just never required from the client) —
  the `POST /npd/taxonomy/rm-category` handler now auto-fills `body.CODE` via `nextCategoryCode()`
  whenever the caller didn't already supply one, before the duplicate check and insert.

**Verified end-to-end live** (curl AND actual browser): existing `LED Driver` row already had
`CODE: AA` (seeded earlier); created `Wiring Harness` and `Connector Housing` via curl without
specifying `CODE` at all — got `AB` then `AC`, exactly sequential; duplicate-`CATEGORY`-name
check still correctly 409s even with `CODE` no longer required. Repeated live through the actual
`TaxonomyAdmin` UI — the form's `CODE` field correctly shows no required-asterisk now, created
`Terminal Block` with `CODE` left blank, and the real live sheet shows it landed as `AD`,
continuing the exact same sequence.

**Scope note (superseded — see the two sections below)**: this correction originally covered
only `RM ref Category.CODE`. `RM ref Category DD.CODE`/`AGAINST ID`/`Category` and
`RM ref Paint.Code` have since been pulled and implemented too — see "RM ref Category DD's real
App Formulas" and the paragraph after it, below.

## RM ref Category DD's real App Formulas (2026-08-29, same day, continued)

The user pulled 3 more real App Formulas directly from the live AppSheet editor for
`RM ref Category DD` — `CODE`, `AGAINST ID`, and `Category` — and asked for all 3 to be applied
verbatim. Only `CODE` is real, useful logic; the other 2 are the same dead-cruft pattern already
documented above, confirmed a second time on a different table:

- **`CODE`**: `LOOKUP(LOOKUP(MAXROW("RM ref Category DD","TIMESTAMP",ISNOTBLANK([Unique ID])),
  "RM ref Category DD","Unique ID","CODE"),"Alphabet","Letter","Letter Increment")` — same
  "next letter after whichever row was most recently created" shape as `RM ref Category.CODE`,
  just matching `MAXROW`'s result against `Unique ID` (this table's real key) instead of
  `CATEGORY` (that table's key is its own label field — confirmed these really are two
  different configured keys, not a typo). Implemented via a shared `nextCode(tab, codeField)`
  helper in `npdPartCode.ts` (generalized once `RM ref Paint` needed a 3rd caller with yet
  another field name — see below).
- **`AGAINST ID`**: `any(SELECT(Raw Material SKU[ID'S], [ID'S]=MAXROW("Raw Material
  SKU","TIMESTAMP",[ID'S]<>"")))` — the identical "most recently created SKU app-wide, live and
  constantly shifting" dead-pointer pattern as `RM ref Category`'s own `Against id`.
- **`Category`**: `LOOKUP([_THISROW].[AGAINST ID],"Raw Material SKU","ID'S","Category")` — reads
  through that same dead `AGAINST ID` pointer, so it returns "the Category of whatever the
  newest SKU happens to be," not the real Category this Sub-Category belongs to.

**I flagged this clearly before implementing** — NPD's own `Category` field on this tab was a
real, doer-picked value, and copying the legacy formula makes it *strictly worse*, not more
correct; it would silently discard whatever Category the doer actually selected. **The user's
explicit response, after seeing that explanation, was to implement all 3 verbatim anyway** ("All
3, exactly as shown" — see the AskUserQuestion result in this session). Implemented exactly as
instructed:

- `Backend/src/services/npdPartCode.ts` — `nextAgainstId()` and `categoryFromAgainstId()`,
  matching the two formulas above literally.
- `Backend/src/routes/npd/taxonomy.ts`'s POST handler for `rm-category-dd`: unconditionally
  overwrites `body["AGAINST ID"]`/`body.Category` with the computed values, **after** the
  duplicate-check runs (moved the whole dup-check block earlier in the handler specifically for
  this — otherwise the check would compare the post-override garbage `Category` instead of what
  the doer actually submitted, making it meaningless. This reordering benefits every table, not
  just this one, and is a general correctness fix, not a special case).
- Frontend: new `computedFields` metadata on `TaxonomyTableMeta` (`GET /npd/taxonomy`'s response)
  — `TaxonomyRowForm.tsx` hides any field listed there from the CREATE form only (still shown/
  editable on EDIT, since the PUT path never auto-computes anything). `rm-category`:
  `["CODE"]`. `rm-category-dd`: `["CODE","AGAINST ID"]` — deliberately NOT `Category`, since
  `Category` is still a real required input the dup-check needs, even though the legacy formula
  then discards it; hiding it entirely would remove the only place a doer expresses intent.

**Verified end-to-end live** (curl AND the actual browser create form): submitted
`Category: "Wiring Harness"` on a new Sub-Category — the saved row came back with
`Category: "LED Driver"` (whatever the most-recently-created `Raw Material SKU` row's Category
was at that moment), `AGAINST ID: "RM0007"` (that same SKU's own ID), and `CODE: "AB"`
(sequential after the existing `AA` row) — confirming the override reproduces the real formula's
behavior exactly, including its known dysfunction. The create form correctly hides `CODE`/
`AGAINST ID` with a "generated automatically once saved" note, while still showing `Category` as
a required input.

## RM ref Paint's real App Formula (2026-08-29, same day, continued again)

Same day, third table: the user pulled `RM ref Paint.Code`'s real App Formula too —
`LOOKUP(LOOKUP(maxrow("RM ref Paint","TIMESTAMP",ISNOTBLANK([Unique ID])),"RM ref
Paint","Paint Description","Code"),"Alphabet","Letter","Letter Increment")` — identical shape
again, matching against `Paint Description` (this table's own label/key field). No dead-pointer
complication this time — `RM ref Paint` has no `AGAINST ID`/`Category`-style fields, `Code` is
the only computed column. Implemented via the same shared `nextCode()` helper (generalized to
take the code field name as a parameter, since this tab's own column is titled `Code`, not
`CODE` like the other two) — `nextPaintCode()` in `npdPartCode.ts`, wired into `taxonomy.ts`'s
`rm-paint` POST handling and `computedFields: ["Code"]`.

**Verified live via curl**: existing `Black Powder Coating` row already had `Code: A`; created
`Matte Grey Finish` and `Gloss White` without specifying `Code` at all — got `B` then `C`,
exactly sequential.

**Running tally of RM ref Category-family tables now on the real formulas**: `RM ref Category`
(CODE), `RM ref Category DD` (CODE, AGAINST ID, Category), `RM ref Paint` (Code). Not yet pulled
or implemented: `PART DESGIN BY.CODE` and anything on the FG side — ask before assuming the same
pattern applies there; get the real formula first, the same way each of these was obtained,
rather than guessing it's identical.

## Frontend rebuilt to match the real legacy reference screens (2026-08-29, same day, continued)

The user gave direct access to the running legacy AppSheet app itself (`NPD DESIGNS-ADC-V2`,
`platform.appsheet.com`) — full screenshots of its Home → Product Master hub, RM SKU list/
detail/form, FG SKU list/detail/form, and the BOM/Assemble Data sub-list — and asked for the
generic Taxonomy-admin-driven RM/FG SKU browsing to be replaced with dedicated screens matching
these exactly, reusing this codebase's own Sales CRR UI components ("CRR UI context") rather
than inventing new ones.

**New `Product Master` hub** (`Frontend/src/npd/ProductMasterHome.tsx`, `/npd/product-master`)
— 5 tiles (Raw Material SKU / Final Good SKU / RM Search / FG Search / Assemble Data), using
the **real icon images**, not emoji — pulled directly from the live `NPD USER` tab on
`ZOTO/PRODUCT MASTER FG` (Name/Image/View/Permissions columns), the exact same pattern the
top-level ZOTO HOME launcher already uses (`Backend/src/routes/home.ts`). RM/FG Search tiles
currently just link to the same catalog pages (no separate global-search UI built yet — the
catalog's own header search box already searches across all fields, so a dedicated search
screen wasn't obviously distinct enough to justify building separately without being asked).

**New RM/FG SKU catalog + detail pages**, replacing the generic Taxonomy-table view for these
two tables specifically (`rm-sku`/`fg-sku` now excluded from `TaxonomyAdmin.tsx`'s picker —
still generic-CRUD on the backend, just no longer browsable there in the frontend, so there's
one place to look for each):

- `RmSkuCatalog.tsx` (`/npd/rm-sku`) / `FgSkuCatalog.tsx` (`/npd/fg-sku`) — left sidebar =
  Category names + live counts, main area = cards grouped by Sub Category header. Reuses
  **`CustomerFilterPanel`** (Sales CRR's own list-screen sidebar component, e.g. `OrderPunchList`)
  even though it's filtering Categories here, not customers — already generic
  (`{name,count}[]`), no new sidebar component needed.
- `RmSkuDetail.tsx` (`/npd/rm-sku/:id`) / `FgSkuDetail.tsx` (`/npd/fg-sku/:id`) — plain field
  list matching the reference's core fields.

**Deliberately NOT built, flagged clearly rather than silently approximated**: the reference's
right-side category-specific dimension panel (e.g. "Bearing Dimensions" — would need ~26
category-specific RM dimension tables, a much larger version of the 6 FG-side item-spec tables
already built in Sprint 6), the left icon actions (Upload Images & Drawings / UPDATE IQC PDF /
Verified RM item / Update All Vendor PDFs / MACHINING & OTHER CHARGES / Verify BOM Item — all
need file-upload and verification workflows this app doesn't have), and the "Drawing Videos"/
"Fitment Details" panels on FG SKU detail (need a `Customer Wise Fitment` table + file upload).
Each of these is a real, separate build — ask before starting any of them rather than assuming
scope.

**Verified live in the actual browser**, not just typechecked: navigated the real Product
Master hub (icons rendering correctly from the live Freepik CDN URLs), into RM SKU Catalog
(sidebar showing real `LED Driver` category with its real count, cards grouped by
`3W Constant Current Driver` showing the actual live `AAAA000A0`...`AAAA006A0` SKUs from
earlier verification work), into a real detail page, and into FG SKU Catalog (all 78 real
production rows, correctly split into `Ambient Light` (1) and `Uncategorized` (77) — matching
the live sheet's real, mostly-blank `CATEGORY` column exactly as documented in this file's
"Live header snapshots" section).

## NPD landing page collapsed into the Product Master hub (31 Aug 2026)

`Frontend/src/npd/NpdHome.tsx` (route `/npd`) now renders the exact same 5-tile grid that used
to live only at `/npd/product-master` (RAW MATERIAL SKU / FINAL GOOD SKU / RM SEARCH /
FG SEARCH / ASSEMBLE DATA, real Freepik icon images) — matching the real legacy app, whose
HOME tile opens straight into this screen with no intermediate menu. `ProductMasterHome.tsx`
was deleted (its content is now `NpdHome.tsx` verbatim) and the `/npd/product-master` route
was removed from `App.tsx`; `Home.tsx`'s `hrefFor()` points `NPD*` tiles back at plain `/npd`.

**Every other section that used to be on the old 11-card NPD landing page was deleted from the
frontend entirely on explicit user instruction** — not just unlinked, the page components and
their routes are gone: `TaxonomyAdmin.tsx`/`TaxonomyRowForm.tsx` (`/npd/taxonomy`),
`PartCodeRequestList.tsx`/`PartCodeRequestForm.tsx` (`/npd/part-code-requests`),
`RmPartCodeGenerator.tsx` (`/npd/rm-part-code`), `PriceChangeQueue.tsx`
(`/npd/price-changes`), `ProjectsBoard.tsx`/`ProjectDetail.tsx`/`ProjectForm.tsx`
(`/npd/projects`), `CustomerOnboarding.tsx`/`KycForm.tsx`/`RaiseRequestForm.tsx`
(`/npd/customer-onboarding`), `Purchase.tsx`/`TaxInvoiceForm.tsx`/`StoreInForm.tsx`
(`/npd/purchase`), `StockWipDashboard.tsx` (`/npd/dashboard`), `Notifications.tsx`
(`/npd/notifications`). The corresponding backend routes/services (`Backend/src/routes/npd/`,
`npdPartCode.ts`, etc.) were **not** touched — this was a frontend-only removal; if any of
these sections come back, the backend endpoints are still there to build a UI against, just
write the pages fresh rather than trying to resurrect deleted files from git history blindly
(check the API shape still matches first).

## RM/FG SKU Catalog page chrome rebuilt to match Sales CRR's own list screens (31 Aug 2026)

`RmSkuCatalog.tsx`/`FgSkuCatalog.tsx` looked visually inconsistent with the rest of this app —
the card content already matched the real legacy reference, but the page chrome around it
(a plain "+Add" button floating above the grid, a fixed-width non-resizable sidebar, no
header-row actions) didn't match how every other list screen in this codebase looks
(`OrderPunchList.tsx` and friends: draggable-width `CustomerFilterPanel`, a filter icon in
the header-actions row via `useSetHeaderActions`, not inline page content). Both catalogs
were rebuilt to that exact chrome — draggable divider (`onDividerMouseDown`/`Move`/`Up`,
160–480px clamp, double-click resets to 260px, same as `OrderPunchList.tsx`) + a header-row
filter icon button (not yet wired to anything, matching the same inert placeholder every
other list screen's filter icon currently is). **`RmSkuCatalog`'s old "+Add" button (which
pointed at `/npd/rm-part-code`) was dropped, not moved** — that route/page was deleted in the
same session's earlier frontend cleanup (see "NPD landing page collapsed..." above) and no
replacement RM SKU create flow exists yet; add a header "+" button back once one is built,
following the same `useSetHeaderActions` pattern already in place.

## RM Part Code — corrected to the REAL App Formula, and a real "Raw Material SKU Form" built (31 Aug 2026)

The user supplied the actual live `PART NO.` App Formula off the `Raw Material SKU` column
(not a reconstruction) — `Backend/src/services/npdPartCode.ts`'s `generateRmPartCode()` was
rewritten to match it verbatim, replacing the earlier Sprint 7 approximation. Four real
findings from the literal formula text (full derivation + the formula itself is in that
file's own module doc comment, don't duplicate it here):

1. Every `AGAINST ID` branch on Category/Sub-Category is a dead pointer for a brand-new row
   (nothing can reference an ID that doesn't exist yet) — implemented anyway for fidelity,
   always no-ops, same "match the legacy formula even where it's dead" convention as
   `RM ref Category DD`'s own `AGAINST ID`/`Category` columns above.
2. **The Design-By digit comes from the shared `Alphabet` tab's `MAKED BY`/`MAKED CODE`
   columns, NOT the `PART DESGIN BY` reference table** the earlier approximation assumed.
   Confirmed by reading the live `Alphabet` tab directly: only 2 of its 702 rows have a
   non-blank `MAKED BY` — `MAKED BY: "ZOTO", MAKED CODE: "0"` and `MAKED BY: "SUPPLIER",
   MAKED CODE: "1"`. **The value is `"ZOTO"`, not `"ADC"`** — the old reference screenshot's
   button labelled "ADC" is from the legacy "Copy of ADC" spreadsheet (ADC = this business's
   old company name before its ZOTO rebrand); the live production `Alphabet` tab has already
   been updated to `"ZOTO"`. `RmSkuForm.tsx`'s Make By toggle is `"ZOTO"`/`"SUPPLIER"` — sending
   `"ADC"` 422s (neither of the formula's two lookup branches can resolve it).
3. The Paint lookup's real branch (per the live app) matches against `RM ref Paint`'s `Unique
   ID` column, not `Paint Description` — but this codebase's own RM SKU form stores the picked
   `Paint Description` text directly (no hidden ref-id concept), so for THIS implementation the
   description-match branch is the one that actually resolves; the `Unique ID` branch is kept
   as a genuine second fallback, matching the formula's own two-branch shape either way.
4. The running 3-digit count's `_ROWNUMBER>=[_THISROW].[_ROWNUMBER]` condition isn't a stable,
   queryable value outside a live AppSheet runtime for a row that doesn't exist yet — kept as
   the already-VERIFIED-against-714-real-rows behavior from the Sprint 7 approximation instead
   (count of existing rows sharing the 4-letter prefix, 0-indexed ascending). The one
   deliberate deviation from the literal formula text, and a deviation from something
   unverifiable, not a guess replacing something known.

**A real "Raw Material SKU Form" now exists** (`Frontend/src/npd/RmSkuForm.tsx`, opened via a
header "+ New" button on `RmSkuCatalog.tsx`, matching the reference screen) — Category → Sub
Category (dependent dropdown, scoped to the picked Category) → Vendor Name (free text, not a
`vendor-master` SearchableSelect — that table has zero rows in production and the real RM SKU
rows' own `VENDOR NAME` values are plain text on the row itself, not a Vendor Master ref) →
Paint → Make By. `PART NO.` is never a form input — `rm-sku`'s taxonomy table entry
(`Backend/src/routes/npd/taxonomy.ts`) now has `allowCreate: true`, `requiredFields:
["Category","Sub Category","VENDOR NAME","Paint","MAKE BY"]`, and `computedFields: ["PART
NO."]`; its `POST` handler mints the row's `ID'S` up front (moved earlier in the handler,
since `generateRmPartCode()` needs it for the dead `AGAINST ID` branches) then calls
`generateRmPartCode()` before writing. **This replaced the old dedicated `/npd/rm-part-code/
generate` endpoint + `RmPartCodeGenerator.tsx` page** (`Backend/src/routes/npd/rmPartCode.ts`
deleted, unmounted from `Backend/src/routes/npd/index.ts`) — that route's frontend was
already deleted earlier this same session as part of the NPD landing-page cleanup, and its own
create logic didn't even set `MAKE BY`, so there was nothing worth keeping from it.
`RmPartCodeLookupError` (a missing-CODE lookup failure — e.g. a Category with no `CODE` yet)
now gets its own `422` in `taxonomy.ts`'s POST handler instead of falling through to the
generic error handler's masked "Something went wrong" — this project's `errorHandler.ts`
deliberately hides raw exception messages (see CLAUDE.md), so a genuinely actionable 422 needs
its own explicit catch to not get swallowed the same way; caught this exact case live during
verification before the fix (Make By: "ADC" 500'd with no useful message until this was added).

**Verified live against the real production `env.sheets.npd` RM sheet** (not a scratch/test
sheet — the local dev backend points at the same live spreadsheet the deployed app uses):
created a real row through the new form (Category "LED Driver" / Sub Category "3W Constant
Current Driver", same prefix as the 7 existing seed rows) and got `PART NO.: AAAA007A0` —
correctly continuing the existing 000–006 sequence at 007, with the right Paint code and "0"
Design-By digit for ZOTO. The test row (`RM0008`) was deleted immediately after via the
taxonomy DELETE endpoint to leave production clean — don't leave verification rows behind in
a live sheet; delete them the same way once confirmed.

## RmSkuForm.tsx is a deliberate exception to FormModal.tsx's centered-modal convention (31 Aug 2026)

The "Raw Material SKU Form" now opens as a right-docked, full-height sliding panel over a
dimmed backdrop (X + title + Cancel/Save in the header row, a "Page 1" tab-underline strip,
scrollable body below) — matching the real legacy AppSheet reference screen's own panel exactly,
on explicit request. This does **not** use the shared `FormModal.tsx` (CLAUDE.md's "every modal
form uses FormModal" convention) — it's a bespoke layout built directly in `RmSkuForm.tsx`
itself, since `FormModal` is a fixed-size *centered* modal by design and has no right-docked-
panel mode. This is a one-off exception for this one form, not a precedent — don't copy this
custom layout into other forms without being asked; if a right-docked-panel pattern is wanted
more broadly later, that's a `FormModal.tsx` variant to build deliberately, not something to
silently reproduce form-by-form.

## RmSkuForm.tsx field-level match to the reference (31 Aug 2026)

A side-by-side against the real legacy screenshot caught three more mismatches beyond the
panel-vs-modal layout (see above), all fixed:
- Field labels now use the live sheet's own exact casing — `VENDOR NAME`/`MAKE BY` (real
  ALL-CAPS headers), not the Title Case `Vendor Name`/`Make By` this form had been using.
  `Category`/`Sub Category`/`Paint` stay Title Case since those ARE the real header casing.
- `PART NO.` is marked required (red asterisk) even though it's a disabled/read-only
  "Generated on Save" field — matches the reference form's own required-styled read-only
  field. Deliberately does NOT reproduce the reference's "PART CODE LENGTH IS NOT EQUAL TO 9
  DIGIT" validation message underneath it — that message only makes sense for a hand-typed
  field, and this one is never hand-typed here, so showing it would misrepresent this form's
  own actual behavior.
- Vendor Name gets a decorative inline "+" icon on the right edge, matching the reference —
  purely visual, no click handler, since there's no separate "add a new vendor" flow to open
  (typing a new name directly into the field already works, per the field's own doc comment).
- Added the reference's "Drawing RM entries that reference this entry in the AGAINST ID
  column" block at the bottom (label + an inert "New" bar) for visual parity — also purely
  decorative, not wired to anything. AGAINST ID is the dead-pointer formula documented
  elsewhere in this file (a live pointer to "whichever SKU was most recently created
  app-wide", not a real link to this specific SKU), and this form only ever creates a
  brand-new row that can't have anything referencing it yet regardless — same reason the
  reference form's own version of this block always starts empty too.

## RmSkuForm.tsx: bolder always-on field borders, scoped to this form only (1 Sep 2026)

Every input/dropdown box on this form now has a permanent, bolder (`1.5px`) border matching
the reference form's own visual weight — not just on focus. Implemented as a scoped
`<style>` block keyed off a `.rm-sku-form` wrapper class, not by editing `TextField.tsx`/
`SearchableSelect.tsx`'s own default styles — those two components are used app-wide, so
bolding their base border globally would be a much bigger, unrequested visual change than
what was actually asked for (confirmed with the user: this form only, not every field in the
app). The scoped rule explicitly excludes `[role="listbox"] input` — `SearchableSelect`'s own
open-dropdown search box has an intentional borderless/bottom-border-only look that the bold
rule would otherwise clobber via `!important`.

**Three rounds total to actually match, corrected each time against direct user feedback**:
1. First pass made every field's border permanently bold (per an explicit answer to a
   clarifying question that turned out to still be a misread).
2. Second pass fixed square corners (`border-radius: 0`) but kept the border always-on.
3. **User corrected this directly: the bold border was only ever supposed to show on
   focus/touch, matching the app's own idle-vs-focused convention everywhere else** — the
   `.rm-sku-form` stylesheet now only bolds the border in the `:focus`/`:focus-visible` rule
   (idle fields fall through to `TextField`/`SearchableSelect`'s own normal default border,
   with `border-radius: 0` still applied at all times for the square-corner look). The Make
   By toggle wrapper's border was reverted the same way (plain default, not bold).
   **Panel width was also corrected** to match a real measurement the user provided
   (~1030px of a 1912px-wide screenshot, ~54%) — now `min(54vw, 1040px)`, up from the
   original `min(46vw, 620px)` guess.
4. **Exact field/layout dimensions matched to a second set of real measurements**: the field
   column itself is a fixed `630px` (wrapped in a `.rm-sku-fields` div, separate from the
   panel's own `min(54vw, 1040px)` width — the panel can be wider than the field column,
   matching the reference's own padding around it), every input/dropdown box is `51px` tall
   (`.rm-sku-form input, button[aria-haspopup="listbox"] { height: 51px }`), the gap between
   fields is `7px` (`.rm-sku-fields > div { margin-bottom: 7px }`, overriding `TextField`'s/
   `SearchableSelect`'s own shared `20px` default the same scoped-not-global way as
   everything else in this section), and the footer Cancel/Save bar is a fixed `54px` tall.
5. The fixed-`630px` field column was briefly centered (`margin: "0 auto"`), then the user
   supplied an exact dimension spec from the real AppSheet reference, superseding every guess
   above at once: panel `min(1024px, 96vw)` wide (not `54vw`-scaled), field column a fixed
   `568px` (not `630px`), **left-aligned with `125px` of left padding from the drawer edge**
   (explicitly NOT centered — the earlier centering was wrong), field height `46px` (not
   `51px`), `~30px` vertical gap between fields and `~11px` label-to-field gap (both via the
   same `.rm-sku-fields > div` / `> div > label` scoped rules, values just updated), and the
   Make By toggle got a `48px`-tall row with a `1px` divider line between its two buttons
   (a `background: var(--color-border)` bar under a `gap: 1px` flex row, rather than a plain
   borderless split).
6. **Superseded again by a second, more precise measurement pass** (same viewport, exact
   pixel offsets this time: drawer left edge ≈854px, form left edge ≈974px, form right edge
   ≈1516px, all at a 1917px-wide viewport) — panel `min(1063px, 96vw)` (was `1024px`), field
   column a fixed `542px` (was `568px`) with `120px` left padding (was `125px`), field height
   `53px` (was `46px`), `~28px` gap between fields (was `~30px`), a `72px`-tall header with
   the title **left-aligned next to the close icon** rather than absolute-centered in the
   drawer (an earlier pass here had wrongly centered it), and the Make By row explicitly
   `542px` wide with two `~271px` buttons.
7. **The fixed-px numbers still didn't visually match after a redeploy was confirmed**, and a
   display-scaling check came back 100% (ruling out the most likely non-code explanation) —
   the user was unable to get a DevTools-measured ground-truth width to settle it definitively.
   **Converted the whole horizontal layout from fixed px to the equivalent percentages**
   instead: drawer `min(55.45vw, 1120px)` (≈1063/1917), left padding `11.29%` of the drawer's
   width (≈120/1063), field column `51%` of the drawer's width (≈542/1063), Make By row
   `100%` of the field column (was hardcoded to `542px` directly, now inherits). Vertical
   dimensions (heights, gaps) stayed in px — only the horizontal sizing was the disputed part.
   Percentage sizing scales correctly across different screen/window sizes, which a value
   copied from one screenshot's pixel coordinates can't guarantee.
8. **Still didn't visually match — this time actually verified live via DevTools**, not
   guessed at again. Added a temporary unauthenticated route (`/__dev-rm-sku-form`, rendering
   `RmSkuForm` directly, bypassing login since this form otherwise sits behind
   `RequireAuth`), measured it with `getBoundingClientRect()` at `window.innerWidth: 1917`,
   then removed the route in the same pass (never shipped/committed). Drawer and padding were
   already exactly right (`1062.97px` / `854.03px` start, target `1063`/`854`) — **the field
   column was the one genuinely broken value**: `width: "51%"` measured only `468.67px`, not
   `≈542px`, because CSS `%` width resolves against the element's own immediate containing
   block (the *padded* content wrapper, already narrowed by the drawer's own padding), not
   the drawer two levels up. Fixed by sizing the field column directly off the viewport
   instead of off its parent's percentage (`min(28.27vw, 571px)`, the equivalent `542/1917`
   ratio) — re-measured afterward, confirmed `541.92px`. **This is the authoritative,
   verified layout** — the `%`-relative-to-immediate-parent trap is worth remembering
   anywhere else in this app that nests a percentage-sized element inside a padded
   percentage-sized parent; if this form's layout is ever revisited, reuse the same
   temporary-unauthenticated-route + DevTools measurement technique rather than reading
   another screenshot.
9. **Pixel-matching the reference exactly left the field column visibly lopsided** — a large
   empty gap on the right of the drawer, since the drawer itself is proportionally wider than
   the reference's own AppSheet chrome. The user asked to center it instead of continuing to
   chase the exact left-offset match. Reverted the fixed-left-padding layout back to
   horizontal centering (`margin: "0 auto"` on `.rm-sku-fields`, plain `24px` padding on all
   sides instead of the asymmetric `11.29%`-left version) — same centering this form had
   briefly in an earlier round, now the final choice. Field width/height/gaps are unchanged.
10. **Centering still left empty space on both sides**, so the user asked to remove it
    entirely — `.rm-sku-fields` now simply `width: "100%"` of its padded container (just the
    drawer's own `24px` padding on each side), not capped to any narrow column width at all.
    This is simpler and more robust than every capped-width attempt above (whether left-
    padded or centered): the fields now always fill whatever width the drawer actually is,
    so there's no ratio to get right or re-derive if the drawer's own width ever changes
    again. Re-verified live the same way (temp unauthenticated route + screenshot).
11. **A detailed 12-point restyle spec superseded most of the above at once** — literal hex
    colors (`#1A1A1A` text, `#D1D5DB` borders, `#C0392B` selected/primary red, `#F3F4F6`/
    `#F9FAFB` light greys) instead of this app's `--color-*` theme tokens (so this form does
    NOT adapt to dark mode, unlike every other form in this app — a known, deliberate
    tradeoff of pixel-matching an external reference), panel `min(48.18vw, 925px)` (≈925/1920),
    64px header (title only), 48px-tall 6px-rounded fields (not square-cornered — the earlier
    "match the reference's square corners" round is superseded), PART NO. shown with a light
    grey `#F9FAFB` disabled-look background, Sub Category visually greyed + `pointer-events:
    none` until a Category is picked, Vendor Name's decorative `+` now a circular button
    (28px, grey outline) instead of a plain `+` glyph, Make By recolored to filled `#C0392B`/
    white when selected vs `#F3F4F6`/dark-grey text when not (was white-bg/border before), and
    the "Drawing RM entries…" helper text now red italic `12px` matching the spec's own
    warning-text treatment.
12. **Cancel/Save moved three times across three direct follow-ups in the same round**: the
    12-point spec explicitly asked for them in the header (moving them out of the footer bar
    a prior round had put them in); the very next message asked to move them back to a
    footer bar; the message after that asked to split them left/right within that footer
    (`justifyContent: "space-between"` instead of `"flex-end"` — Cancel left, Save right).
    Footer-with-space-between is where they've landed as of this pass. If asked to move them
    again, don't assume header vs footer from this history — confirm which is currently
    wanted, since this has flipped repeatedly.

## PART NO. is a real editable field with live 9-digit validation again (1 Sep 2026)

Reverted the "disabled, blank, `Generated on Save` placeholder" treatment — the user pointed
out the reference form's own PART NO. field is genuinely editable with live client-side
validation (a red-bordered "PART CODE LENGTH IS NOT EQUAL TO 9 DIGIT" message, shown/hidden
as the doer types), and asked for the same behavior. **This is UI-only, not a new create-time
input path**: `partNo` state exists purely so the doer gets the same instant feedback the
reference gives, using `TextField`'s existing `error` prop (`error: partNo.length > 0 &&
partNo.length !== 9 ? "PART CODE LENGTH..." : undefined`) rather than hand-building a
warning-icon paragraph outside the field's own wrapper div (that would have needed a
negative-margin hack to sit inside the `.rm-sku-fields > div` 30px-gap rule; using the built-
in `error` prop keeps it correctly nested instead). **`partNo` is never sent in the
`createTaxonomyRow("rm-sku", ...)` payload** — `PART NO.` stays 100% server-computed
(`services/npdPartCode.ts`'s `generateRmPartCode()`, the real verified formula), matching how
the reference form's own field actually behaves too: it's editable and validated live, but an
"Auto Compute" App Formula silently overwrites whatever was typed the instant the row is
actually saved. Verified live: typing `"AAAA000"` (7 chars) shows the red border + error;
completing it to `"AAAA000A0"` (9 chars) clears both.

## PART NO. now shows a real live-computed preview, not a typed field (1 Sep 2026)

Reverted the "editable with live validation" behavior from the previous round — the user
shared the reference form's own field-config screenshot directly, which settles it
definitively: PART NO.'s "Auto Compute" section literally says *"Compute the value for this
column instead of allowing user input"* — it was never meant to be typed into at all, only to
update live and reactively as the doer picks the other fields. `RmSkuForm.tsx` now computes
`livePartNo` client-side as a **read-only preview**, mirroring the exact same pieces
`services/npdPartCode.ts`'s `generateRmPartCode()` computes server-side (Category CODE + Sub
Category CODE + running per-prefix count + Paint Code + Make By digit), from data already
loaded for the dropdowns (`categoryRows`/`subCategoryRows`/`paintRows`) plus one extra query
(`rm-sku` rows, for the same running-count logic `RmSkuCatalog.tsx` needs) — each piece
resolves independently and concatenates as soon as its own inputs are picked, so the field
fills in progressively exactly like the reference (e.g. `"AA000"` once Category+Sub Category
are in, growing to the full 9 characters as Paint/Make By are picked too). **`livePartNo` is
purely cosmetic — never sent in the `createTaxonomyRow` payload**; the backend's own
`generateRmPartCode()` remains the sole source of truth for the real, saved `PART NO.`.

**Caught and fixed one real bug while wiring this up**: `makeBy` used to default to `"ZOTO"`
on mount, which meant its `"0"` digit contributed to `livePartNo` before the doer had touched
anything — a freshly-opened form showed `"0"` with a validation error already active. Changed
`makeBy`'s type to `"ZOTO" | "SUPPLIER" | null`, defaulting to `null` (no default selection,
matching the reference's own required-with-no-default Make By state) — `canSave()`/
`handleSave()` updated to require it explicitly. Verified live: the field is correctly blank
(shows the `"000"` placeholder) on a fresh open now.

## "+ New" Category, opened from RmSkuForm.tsx, with the real RM ref Category App Formulas (1 Sep 2026)

The Category `SearchableSelect` on `RmSkuForm.tsx` now has a real create-inline flow — its
existing generic `onAddNew`/`addNewLabel` props (already built into `SearchableSelect.tsx`,
just unused everywhere in NPD until now) open `RmCategoryForm.tsx`, a nested right-docked
panel (zIndex 60, stacked over RmSkuForm's own 50) matching the real legacy "RM ref Category
Form" field-for-field, sourced directly from the user's own AppSheet field-config
screenshots:

- `RM ref Category.Against id` and `.DUPLICACY` are BOTH real App Formula columns —
  confirmed live, not assumed. `Against id` is the exact same dead-pointer formula as `RM ref
  Category DD`'s own `AGAINST ID` (reused `nextAgainstId()` verbatim, just written to this
  table's differently-cased `"Against id"` column). `DUPLICACY` — `COUNT(SELECT(RM REF
  CATEGORY[Unique ID], TRIM([_THISROW].[CATEGORY])=[CATEGORY]))` — is new:
  `countCategoryDuplicates()` in `services/npdPartCode.ts`, a live count of existing rows
  whose trimmed `CATEGORY` matches, NOT a uniqueness gate (a duplicate can still be saved,
  the count is just surfaced). Both added to the `rm-category` taxonomy table's `fields`/
  `computedFields` and wired into `taxonomy.ts`'s POST handler the same way `CODE` already
  was.
- **Every auto field shows a real LIVE value, not a "Generated on Save" placeholder** —
  matching the reference's own live-updating preview, confirmed directly off the user's
  screenshots showing values changing as they interacted with the real form:
  - `TIMESTAMP` — a ticking clock (`setInterval`, updates every second while open).
  - `USEREMAIL` — this app has no email field on doers (Employee Id + Password login); shows
    the logged-in doer's Employee Id instead, the same substitution used everywhere else in
    this app.
  - `CODE` / `Against id` — real previews from a new **`GET /npd/taxonomy/rm-category/
    preview`** endpoint (`taxonomy.ts`), a pure read-only call to the exact same
    `nextCategoryCode()`/`nextAgainstId()` helpers the real POST handler uses — what's shown
    is genuinely what would be saved (barring a race with another doer creating a category in
    between). Falls back to `"—"` on a failed/errored preview fetch rather than hanging on
    `"Loading…"` forever (caught live: an unauthenticated preview request left `CODE` stuck
    on "Loading…" indefinitely before this fix — `isError` from the query now drives the
    fallback).
  - `DUPLICACY` — computed live client-side from `categoryRows` (passed down as a prop from
    `RmSkuForm.tsx`, already loaded there — no extra fetch), recomputing on every keystroke
    against whatever `CATEGORY` is currently typed.
  - `Unique ID` — the one field that genuinely can't be previewed for real without minting an
    actual row (`nextSequentialId()` isn't a pure/read-only lookup the way the CODE/Against id
    helpers are) — shown as a client-generated random hex string instead, cosmetically
    matching the reference's own opaque-looking ID but explicitly NOT the value that will
    actually be saved (the server mints its own on POST). Documented clearly in the component
    itself so this distinction isn't lost later.

On save, `RmSkuForm.tsx` invalidates the `rm-category` taxonomy query and auto-selects the
newly created category (clearing Sub Category, same as picking any other Category).

**Verification note**: this feature's actual save round-trip (and the CODE/Against id/
DUPLICACY previews, which need a valid auth token to return real data) could not be fully
exercised live — this form sits behind `requireAuth`, and no test credentials were available
this session (see "Bold border only on focus" section's earlier note on the same
constraint). What WAS verified live: the "+ New" row renders inside the Category dropdown,
clicking it opens the nested panel with the correct fields/layout, TIMESTAMP visibly ticks,
Unique ID generates a fresh value, and CODE's fallback-to-"—" (instead of hanging on
"Loading…") behaves correctly under a real failed request. The DUPLICACY/CODE/Against-id
*real* live values, and the full create-and-select round trip, are unverified against actual
authenticated data — worth a manual pass before relying on this in production.

## Sub Category gets the same "+ New" inline-create flow (1 Sep 2026)

Same treatment as Category's own "+ New" flow above, this time for Sub Category —
`RmSubCategoryForm.tsx`, opened via the Sub Category `SearchableSelect`'s `onAddNew`, matches
the real "RM ref Category DD Form" field-for-field, confirmed off the user's own field-config
screenshot in this exact order: `TIMESTAMP`, `AGAINST ID`, `Unique ID`, `CODE`, `USEREMAIL`,
`SUB CATEGORY`, `DUPLICACY`. **The reference form has no `Category` input at all** —
confirming what was already known (`categoryFromAgainstId()`'s doc comment): `Category` on
this table is a dead App Formula column, nothing meaningful for a doer to pick, so unlike the
generic taxonomy admin form (which still shows it, for the dup-check's sake), this dedicated
form follows the reference and omits it entirely — the parent-picked `category` is still sent
in the create payload (needed for the dup-check), just not rendered as a field.

`RM ref Category DD.DUPLICACY` is new, mirroring `RM ref Category.DUPLICACY`'s shape (a
trimmed-name duplicate count) but scoped to `SUB CATEGORY` — `countSubCategoryDuplicates()`
in `services/npdPartCode.ts`. Unlike the `RM ref Category` formulas, the exact `DUPLICACY`
formula text for this table wasn't captured directly — it's inferred by direct analogy to
the sibling table's confirmed formula, not independently guessed; worth double-checking
against the live field config if it's ever in doubt. Also added `GET /npd/taxonomy/
rm-category-dd/preview` (same shape as `rm-category`'s own preview endpoint) so `CODE`/
`AGAINST ID` show real live values here too, same "—" fallback on a failed fetch.

The "+ New" row only appears once a Category is already picked (`addNewLabel`/`onAddNew`
both `undefined` until then) — a new Sub Category needs a Category to belong under, and the
Sub Category dropdown itself is already disabled/inert until one is picked.

**Verification note**: same constraint as the Category "+ New" flow above — this form sits
behind `requireAuth`, and no valid session was available to exercise the real save round-trip
or the actual CODE/AGAINST ID/DUPLICACY live values. What WAS verified: `tsc --noEmit` clean
on both sides, and the form mounts with no console errors beyond the expected 401s from the
unauthenticated data queries (via the same temporary-route technique used throughout this
file). Give this a manual pass with a real login before relying on it.

## Paint gets the same "+ New" inline-create flow — and a real bug caught: Unique ID previews were fake (1 Sep 2026)

Third and final of the three RM taxonomy "+ New" flows — `RmPaintForm.tsx`, opened from the
Paint `SearchableSelect`. Simpler than its two siblings: the real "RM ref Paint Form"
reference (confirmed off the user's own field-config screenshot) has just `TIMESTAMP`,
`USEREMAIL`, `Unique ID`, `Code`, `Paint Description` — no `Against id`/dead-pointer column
and no `DUPLICACY` at all, matching what was already known (`RM ref Paint` has no such
columns — see `nextPaintCode()`'s own doc comment). New `GET /npd/taxonomy/rm-paint/preview`
mirrors the other two preview endpoints, minus the `againstId` half.

**Caught directly by the user comparing this form's Unique ID against the live sheet: they
didn't match at all** (`a195c0f2` shown vs `RMCAT0001` actually saved). The earlier
"can't be previewed for real" reasoning for `Unique ID` turned out to be wrong —
`Backend/src/services/ids.ts`'s `nextSequentialId()` is a pure function (max existing numeric
suffix + 1, zero-padded to 4) of rows already loaded for each form's own dropdown, not
something that needed minting a real row to know. Added `previewSequentialId()` to
`lib/npdApi.ts` — the identical regex/max/pad-4 logic, client-side — and wired it into all
three "+ New" forms (`RmCategoryForm.tsx` off `categoryRows`/`"RMCAT"`,
`RmSubCategoryForm.tsx` off `subCategoryRows`/`"RMSUB"`, `RmPaintForm.tsx` off a newly-added
`paintRows` prop/`"RMPAINT"`), replacing the cosmetic random-hex placeholder everywhere it
appeared. Now shows the REAL value that will be saved, not an approximation — the one
remaining caveat is it can only be as accurate as the `*Rows` data actually loaded client-side
(same as `DUPLICACY`'s own live-computation caveat elsewhere in this section), which is
correct once a real authenticated session has the real rows loaded, same as everything else
in these forms.

**Verification note**: same constraint as the other two "+ New" flows — full authenticated
save round-trip unverified, no login session available. What WAS verified live this time: the
real `previewSequentialId()` output (`"RMCAT0001"`, matching the intended format exactly) in
place of the old random-hex placeholder, confirming the fix actually works even though the
underlying data was empty (no auth) in the test session.

## Real fix: NPD taxonomy tables' Unique ID switched to plain random hex, matching the live sheet (1 Sep 2026)

The "matches the real saved value" claim from the previous section turned out to be wrong —
the user showed the actual live `Unique ID` column values (`800ecd70`, `f6db8404`, `24a775fa`,
…, `c92170ea`) and pointed at "use CRR IDS for hint": none of them are sequential
`RMCAT0001`-style values, they're plain random hex, the same *idea* (not literal format) as
this codebase's existing Sales CRR `nextIds()`/`nextId()` convention
(`Backend/src/services/ids.ts`, `${prefix}-${8 random hex chars}`, e.g. `ORD-e76026d8`) —
random + collision-checked against existing IDs, not a counter.

**The backend generator itself was wrong, not just the frontend preview** — every NPD
taxonomy table (`Backend/src/routes/npd/taxonomy.ts`'s generic `POST /:key` handler,
covering ALL of them: `rm-category`, `rm-category-dd`, `rm-paint`, `vendor-master`,
`vehicle-compatibility`, `fg-segment`, …, not just the three with dedicated "+ New" forms)
was minting its own row ID via `nextSequentialId()` — a plain max-existing-numeric-suffix+1
scan with no real atomicity guarantee against two doers creating a row at the same instant
(both could read the same "current max" before either write lands). Switched to a new
`nextPlainRandomId()` in `services/ids.ts` — same random+collision-check idea as `nextIds()`,
but spreadsheet-agnostic (unlike `nextIds()`/`nextId()`, which stay hardcoded to
`env.sheets.transactions` for their existing Sales CRR callers) and with NO prefix/dash,
matching the live sheet's own real values exactly (`nextIds()`'s own dash-prefixed shape was
NOT what the real `Unique ID` values look like — confirmed directly, not assumed). Also added
the general-purpose `nextRandomIds()`/`nextRandomId()` (spreadsheet-agnostic siblings of
`nextIds()`/`nextId()`, keeping the `PREFIX-hex` shape) alongside it, for any FUTURE NPD ID
column that DOES want a prefix — `nextPlainRandomId()` is specifically for `Unique ID`
columns matching this exact no-prefix shape, not a general "the new NPD ID scheme."
`idPrefix` on `TaxonomyTableDef` is no longer used for ID generation as a result (left in
place on the interface/table defs rather than removed — harmless, and removing it is a
bigger, unrelated cleanup).

**Frontend previews corrected to match**: the three "+ New" forms' `Unique ID` preview
(`RmCategoryForm.tsx`/`RmSubCategoryForm.tsx`/`RmPaintForm.tsx`) no longer tries to predict
an exact real value at all — `previewPlainRandomId()` in `lib/npdApi.ts` just matches the
new FORMAT (plain 8-hex-char) cosmetically, same as the very first (correctly cosmetic, just
wrongly-formatted) version before the "real sequential value" detour. `RmPaintForm.tsx`'s
now-unused `paintRows` prop was removed along with it (nothing else in that form needed it —
`RM ref Paint` has no `DUPLICACY` to compute either).

**Verification note**: same constraint as every "+ New" flow in this file — no login session
available to exercise the real authenticated save round-trip against a live sheet write.
`tsc --noEmit` clean on both sides; the change is a straightforward function swap with no new
untested branching, lower verification risk than the earlier live-value features in this
section.

## Real bug caught: Sub Category dropdown silently hid valid options (1 Sep 2026)

The user created a new Category ("CONTROLLER SET") and a new Sub Category ("MASTER
CONTROLLER") via the "+ New" flows, then noticed the just-created Sub Category never showed
up in `RmSkuForm.tsx`'s Sub Category dropdown at all — reopening it showed "No matches".

**Root cause**: `subCategoryOptions` filtered on `r.Category === category` (the picked parent
Category), matching the punch form's own dependent-dropdown pattern elsewhere in this app —
but `RM ref Category DD.Category` is the dead App Formula documented extensively elsewhere in
this file (`categoryFromAgainstId()`'s doc comment): a live pointer to "whichever SKU was
most recently created app-wide," not a real link to the Sub Category's actual parent. **This
is true on every row, including ones from the real production AppSheet** — not something this
session's new "+ New" flows introduced, just newly visible because a fresh, empty NPD
database has nothing else masking it. Filtering against it silently hid the correct row every
time the filter's own match failed (which is most of the time, since the dead pointer rarely
happens to equal the currently-picked Category by coincidence).

**Fix**: removed the filter entirely — `subCategoryOptions` now lists every `SUB CATEGORY` row
once a Category is picked (still gated on picking one first, for the same top-to-bottom UX
the punch form uses, just not narrowed further, since there's no reliable field to narrow by).
There is currently NO reliable way to scope Sub Category to its real parent Category in this
data — if that's ever needed for real (e.g. a Category with 200 Sub Categories becoming
unwieldy as one flat list), it would need a NEW, real column added to the live sheet
(replacing or supplementing the dead `Category`/`AGAINST ID` pair), not a client-side filter
against data that was never trustworthy for this purpose.

Also: the sheet's `RM ref Category DD.Category` column showing blank for a freshly-created
row (not "CONTROLLER SET", the Category actually picked) is correct, expected behavior — that
dead formula resolves to `""` when `AGAINST ID` is blank (no `Raw Material SKU` rows exist
yet to point to), matching `categoryFromAgainstId()`'s own documented behavior exactly, not a
bug.

## Correction: `RM ref Category DD.Category` keeps the real value, not the dead pointer (1 Sep 2026)

The previous section's fix (dropping the Sub Category filter entirely) was itself wrong —
the user pushed back with the real live app's own `Raw Material SKU.Sub Category` ref field
Valid If, confirmed directly off its field-config screenshot:
`SELECT(RM ref Category DD[SUB CATEGORY], [_THISROW].[Category]=[Category])`. This formula
only works in the real AppSheet at all because of a runtime-only mechanism: AppSheet
evaluates a nested "+ New" form's own `AGAINST ID`/`Category` App Formulas against the
**in-progress, not-yet-saved** parent `Raw Material SKU` row too (its local device state
includes pending unsaved rows, not just committed ones) — so when a doer opens the nested Sub
Category form from partway through filling out a new SKU, `AGAINST ID`'s `MAXROW` picks up
that very in-progress row, and `Category` correctly resolves to whatever the doer already
picked. This stateless REST backend has no equivalent: the SKU row genuinely doesn't exist
yet when `POST /taxonomy/rm-category-dd` is called from the nested form, so mirroring the
formula literally (`categoryFromAgainstId(nextAgainstId())`) always resolves to something
else or blank — which is exactly what broke the dropdown in the first place.

**Fix, superseding both the original dead-pointer mirroring AND the "just remove the
filter" fix**: `taxonomy.ts`'s `rm-category-dd` POST handler no longer overwrites `Category`
at all — it keeps the doer's own submitted value (already a required field, already flowing
through `RmSubCategoryForm.tsx`'s `category` prop). `AGAINST ID` is still computed via
`nextAgainstId()` for parity (harmless, nothing else reads it). With `Category` now holding
the real value, `RmSkuForm.tsx`'s `subCategoryOptions` filter (`r.Category === category`) was
restored — it's correct again, matching the real app's own Valid If, now that the field it
filters on actually holds what that formula assumes it holds.

**The general lesson, worth remembering for any other "verbatim, even if it looks dead"
formula in this app**: a legacy App Formula can rely on client-runtime behavior (unsaved-row
visibility, live recalculation, `_THISROW` semantics inside a still-open form) that has no
faithful equivalent in a stateless backend — mirroring such a formula's literal text can
produce something that's provably wrong in this architecture even though it's "correct" in
the source system. When that happens, matching the *practical result* the user actually
needs (a working dependent dropdown) is the right call over matching the formula text
byte-for-byte — but only when directly confirmed by the user pointing at the real downstream
formula that depends on it, as happened here, not as a excuse to freelance around any
inconvenient-looking legacy formula.

## RM SKU Detail rebuilt as a two-column dashboard, matching the reference (1 Sep 2026)

`RmSkuDetail.tsx` was a flat single-column field list — the user pointed out it doesn't look
like the reference's actual two-column dashboard layout at all. Rebuilt to match: a left
column with the icon-action row (Upload Images & Drawings / UPDATE IQC PDF / Verified RM
item — circular blue icon buttons, visual only for now, no upload/verification workflow
behind them yet per the user: functionality to follow in a later pass) above the field card,
and a right column of related-data cards (a `"{Category} Dimensions"` table, `"RM Images &
Drawings"`). Two more real fields were added while at it — `Old Part Code` and `IQC PDF` —
both already present in the live sheet and already returned by `GET /npd/taxonomy/rm-sku`
(that endpoint returns the full raw row, not filtered by the table's `fields` allowlist,
which only gates create/edit — see `taxonomy.ts`'s `GET /:key` handler), so no backend change
was needed, just reading two more keys off the row already being fetched.

**The right-side cards are genuinely empty, not faked** — this app has no per-category
dimension tables (the reference needs ~26 of them, one per RM category — a much bigger
version of the 6 FG-side item-spec tables already built in Sprint 6) or an image-upload
feature yet. Shown as real empty states (`"Not available yet."`, count badge `0`, inert
Expand/Add links) matching the reference's own card shape, rather than omitted entirely or
filled with fabricated rows — same "flag it, don't fake it" convention as everywhere else in
this app.

**Verification note**: could not get a live-data screenshot this pass — `RmSkuDetail.tsx`
sits behind `requireAuth` like every other NPD page, and unlike the other forms verified via
a temp *route*, this one's `useQuery` supplies its own explicit `queryFn` (calling the real
API), which takes priority over a `QueryClientProvider`'s default `queryFn` — a mocked-data
preview harness tried here didn't actually intercept the real (failing, unauthenticated)
fetch, so it rendered the component's own "not found" state instead of the mocked row.
Confirmed `tsc --noEmit` clean and reviewed the JSX structure directly; a real screenshot
comparison against the reference still needs a genuine login session.

## RM SKU Detail — seventh pass: Edit/Prev/Next moved into the real header-actions slot (2 Sep 2026, same day)

Two more concrete fixes:

- **Edit + Previous/Next now live in `lib/headerActions.tsx`'s `useSetHeaderActions` slot** —
  the same top-right breadcrumb-row mechanism `RmSkuCatalog.tsx`'s own "+ New" button already
  uses, not a second row rendered by this page itself. This is what the reference screenshot
  actually showed (Edit/arrows sitting IN the breadcrumb row) — the earlier five passes kept
  trying to build that as a second header row on the page, which either duplicated the
  breadcrumb or looked wrong next to it. Registered via a new `HeaderNavButton` (same 38×38
  bordered icon-button shape `RmSkuCatalog.tsx`'s header action already uses). The standalone
  "‹ Back" button was removed entirely, per the user's own explicit request — no longer needed
  once Edit/Prev/Next live in the breadcrumb row and the breadcrumb itself still provides a way
  back to the catalog.
- **Removed the trailing chevron (`›`) from Category/Paint** — the `FieldLink` variant added a
  "this links elsewhere" affordance with no real drill-through behind it yet; the user asked
  for it gone. Both fields are now plain `Field`s like every other row; `FieldLink` deleted
  entirely (dead code once nothing used it).

**A hook-ordering note for future edits to this file**: `useSetHeaderActions` (and any other
hook) must be called before the `isLoading`/`!row` early returns — React forbids a
conditional hook call, so the header-actions registration and the `prevRow`/`nextRow`
computation both happen unconditionally near the top of the component now, not after the row
is confirmed to exist.

## RM SKU Detail — sixth pass: rebuilt on TripDetail.tsx's real pattern, not hand-guessed hex (2 Sep 2026, same day)

Four passes of hand-guessing colors/spacing against the AppSheet reference screenshot still
didn't land — the user then showed a screenshot of **this app's own `TripDetail.tsx`**
(Sales CRR's Transport trip detail page) and said "i want like this." Rebuilt the whole file
on that real, already-working pattern instead of continuing to invent styling:

- `Section`/`Field`/`FieldFile`-shaped private helpers, copied in structure from
  `TripDetail.tsx` (not imported — they're private to that file, same small-helper-per-file
  convention used elsewhere rather than extracting a shared component for a two-file reuse).
- The three action buttons (Upload Images & Drawings / UPDATE IQC PDF / Verified RM item) are
  now real `QuickAction`s (`components/FloatingActionButton.tsx`) — the same shared red
  circular action button `TripDetail.tsx`/`OrderDetail.tsx`/`PdiItemDetail.tsx`/
  `DispatchApprovalItemDetail.tsx` already use, stacked via `stackIndex`, not a custom blue
  icon row invented in an earlier pass. Still no real handler behind them (`onClick={() => {}}`)
  — per the user, functionality is a follow-up.
- `className="card"` + this app's `--color-*` tokens throughout, replacing every literal hex
  color from the prior four passes — there was never a real reason for this one page to opt
  out of the app's light/dark theming (unlike `RmSkuForm.tsx`'s own literal-hex exception,
  which pixel-matches a specific panel the user asked to match exactly).
- Dimensions/Drawing & Photos/RM Images are now `TableCard`-shaped (title + count badge + red
  "Expand" + table), matching `TripDetail.tsx`'s own list-card shape — still genuinely 0 rows,
  no fabricated data.
- Field list unchanged from the previous pass (real live headers): TIMESTAMP, USEREMAIL,
  ID'S, PART NO., Category, Sub Category, Paint, MAKE BY, VENDOR NAME, IQC PDF, IQC PDF
  UPDATE LAST.

Every earlier "pixel spec"/AppSheet-reference-matching pass in the sections below is now
superseded by this one — kept in this file as history of what was tried and why it didn't
land, not as still-current guidance for this page.

## RM SKU Detail — fifth pass: one card, clickable-looking action buttons (2 Sep 2026, same day)

Still "not look same": the Action row and the field list were two SEPARATE white bordered
cards with a visible gap between them; the reference has no such gap/second border — it reads
as one continuous card. Merged into a single card (action row on top, a `border-bottom`
divider, then the field rows — no second `border`/gap). Also: "every button is clickable — i
will tell me later" — the three action-card buttons had `cursor: default` and a "Coming soon"
tooltip making them look inert; changed to `cursor: pointer` with no inert styling, even
though the actual upload/verify/update handlers behind them are still a genuine follow-up (not
built this pass, per the user's own "i will tell me later").

## RM SKU Detail — fourth pass: header dedupe + real field order/columns (2 Sep 2026, same day)

Still not matching — two further concrete fixes, both against the LIVE sheet, not assumption:

- **Double-header bug, finally caught**: the page had TWO stacked headers — this app's own
  global route-driven breadcrumb (`Layout.tsx`, unrelated to this file) PLUS this file's own
  circular-back-button + big "id" heading row directly underneath it, duplicating what the
  breadcrumb already showed. The reference has one clean header line (breadcrumb + Edit +
  Previous/Next, nothing else). Removed the redundant back-button/heading row entirely — this
  file's own header is now just right-aligned Edit + Previous/Next, letting the existing
  breadcrumb (which already ends in the bolded id) be the only "where am I" indicator, same as
  the reference.
- **Field list was wrong** — dumped the real live `Raw Material SKU` header row directly
  (`TIMESTAMP, USEREMAIL, ID'S, PART NO., Category, Sub Category, Paint, MAKE BY, VENDOR NAME,
  Old Part Code, Old Part Name, IQC PDF, IQC PDF UPDATE LAST, TrF tO Master Rm`) rather than
  continuing to assume the order from the second pass (which was `ID'S`-first and missing `Old
  Part Name` entirely) — reordered to match exactly, added the missing field.
  **`Old Part Code`/`Old Part Name` were then deleted from the live sheet by the user only
  minutes later** ("I DELETE") — removed from this file's field list again immediately after,
  so the current field list is `TIMESTAMP, USEREMAIL, ID'S, PART NO., Category, Sub Category,
  Paint, MAKE BY, VENDOR NAME, IQC PDF, IQC PDF UPDATE LAST` (`TrF tO Master Rm` still excluded
  — an internal transfer-tracking field). **This tab's schema is evidently still being actively
  edited live** — re-dump headers before trusting this file's field list again if it's touched
  further, same discipline this project already applies everywhere else a tab has drifted.
- Also shrank the Drawing & Photos tile to a fixed width (220px) rather than stretching it
  full-card-width, leaving visible whitespace beside it — matches the reference's own tile
  proportions, where there's clearly room for more tiles in a row.

A separate ambiguous instruction ("THESE COLUMN SHOW IN CENTER", sent alongside a screenshot
of the live sheet's own bold, center-aligned header row) was left unactioned this pass —
confirmed on follow-up ("yes center align the values too") to mean the Details card's
**values** column, which was right-aligned. Changed to center-aligned (labels stay
left-aligned in their own 195px column, unchanged).

## RM SKU Detail — third pass, pixel spec applied (2 Sep 2026, same day)

Still "not same" after the second pass — the user supplied a very detailed, coordinate-level
pixel spec (sidebar/header measurements, exact hex colors, card positions/sizes, table column
widths, typography sizes) generated against the real reference screenshot, and asked for a
pixel-accurate rebuild.

Applied faithfully: literal hex colors (`#2f82d5`/`#438edb` blue action icons/Edit button —
not this app's red `--color-primary`, same deliberate pixel-match-over-theme exception
`RmSkuForm.tsx` already takes; `#243b53` headings, `#4e6276` labels, `#8a969f` muted,
`#e9edf1`/`#596b7b` badge, `#dedede`/`#dfe3e6` borders), Details card's 195px label column +
52px row height, an Edit button (blue, pencil icon, visual-only — no RM SKU edit form exists
yet, same treatment as the 3 action icons), Dimensions rebuilt as a REAL table (Unique ID/
TIMESTAMP/AGAINST ID/CATEGORY headers, matching the reference's actual table shape — still
genuinely 0 rows, shown as an empty table body rather than a placeholder sentence, since no
per-category dimension tables exist yet), Drawing & Photos rebuilt as the reference's own
photo-tile shape (PART NO. + Category text over a large empty bordered area, no fabricated
thumbnail).

**One deliberate deviation from the supplied spec, flagged rather than silently followed**:
the spec's x/y coordinates place the Action card and Details card SIDE BY SIDE (three columns:
Action | Details | Dimensions-stack). Every actual screenshot of this screen the user has
shared — the real AppSheet reference AND this app's own two earlier attempts — shows the
Action card stacked ABOVE the Details card in one left column, with Dimensions/Drawing &
Photos/RM Images in a separate right column. The coordinate spec reads like an automated
screenshot-to-code tool's guess rather than a hand-verified measurement, and contradicts every
piece of real visual evidence gathered so far — kept the two-column stacked structure that
actually matches what's been shown, applied every other color/spacing/typography/table detail
from the spec. If this is still wrong, the next step is a fresh screenshot of the ACTUAL
current deployed page (not the reference) to compare pixel-for-pixel, since three iterations
of code-only guessing haven't converged.

**Verification note**: typechecked clean; same live-screenshot limitation as the two prior
passes at this file (`useQuery`'s own `queryFn` always wins over a mocked provider default) —
reviewed the JSX/layout/color logic directly instead of a rendered screenshot.

## RM SKU Detail corrected to match the reference more closely, using CRR's own chrome (2 Sep 2026)

The user compared the deployed detail page against the real reference screenshot side by side
("are you sure both look same?, i want same to same") and found two real gaps:

- **A whole card was missing.** The reference's right column has THREE cards — a category
  dimensions table, **"Drawing & Photos"**, and **"RM Images & Drawings"** — this file only had
  two (skipped "Drawing & Photos" entirely, an oversight from the first pass, not a deliberate
  cut). Added as a third `RelatedCard`, same genuinely-empty treatment as the other two (no
  backing upload feature yet — see this file's own module doc comment).
- **Header chrome had no Edit/prev-next affordances at all**, unlike the reference's
  breadcrumb + Edit button + `<`/`>` record navigation. Rather than copying the reference's
  literal chrome (blue circular icons, its own breadcrumb style), the user's explicit
  instruction was to **"take CRR details hint"** — so the back button was changed from a
  full-width "← Back to RM SKU Catalog" button to the exact same 30×30 circular bordered "‹"
  button + title-below-it shape `OrderDetail.tsx` (Sales CRR) already uses, and a new
  `NavCircleButton` component (same visual shape) adds Previous/Next record navigation by
  walking the already-loaded `rows` array in list order — genuinely new (no CRR page has
  prev/next), but built in the same visual language rather than inventing something else. An
  "Edit" action was NOT added — there's no RM SKU edit form built yet, unlike the reference's
  own; flagged rather than stubbed with a non-functional button.

**Verification note**: typechecked clean; could not get a live-data screenshot again for the
same reason as the first pass at this file (see the entry below) — `useQuery`'s own explicit
`queryFn` always wins over a mocked `QueryClientProvider` default, so the temp-route mock
harness renders "not found" instead of real data. Reviewed the JSX/layout logic directly
instead; a real visual comparison against the reference still needs a genuine login session.

## Standard Part's own STANDARD field is now a dropdown, not free text (3 Sep 2026, same day)

Direct follow-up to the correction above — the user asked to "give me this in dropdown" after
typing an unrecognized STANDARD value ("a") with no indication why `CODE` stayed blank. New
`listFgStandardStages()` (`npdPartCode.ts`) returns every non-blank `Alphabet.SR NO.` value —
the real, guaranteed-to-resolve set (`CASTED`/`MACHINED`/`FINISHED`) — via a new `GET
/npd/taxonomy/fg-sub-sub-parts/standard-options` endpoint. `FgQuickCreateForm.tsx`'s
`"standard-part"` kind now renders STANDARD as a `SearchableSelect` sourced from that list
instead of a plain `TextField` — a doer can no longer type something that silently never
resolves a CODE.

## Correction: FG Sub sub parts' CODE doc comment had an unverified assumption (3 Sep 2026, same day)

The user asked "why CODE not show" on the Standard Part "+ New" form — turned out to be
correct, expected behavior (CODE only resolves once `STANDARD` is typed AND matches a real
`Alphabet.SR NO.` value), not a bug: `nextFgStandardPartCode()`'s actual matching logic was
already right. What WAS wrong was this file's own doc comment on that function — it claimed
`SR NO.` "holds plain sequential numbers" and would therefore "resolve blank for essentially
every real value," an assumption that had never actually been checked against the live sheet.
Dumped `Alphabet` directly to confirm: `SR NO.` genuinely holds real manufacturing-stage names
(`CASTED`, `MACHINED`, `FINISHED`), the same shape `STANDARD` itself is meant to hold — so the
formula is real and resolves whenever a doer types one of those exact stage names (matched
case-insensitively, already handled). Doc comments corrected in both `npdPartCode.ts` and
`FgQuickCreateForm.tsx`; no functional code changed. Same lesson as the `FG ref Brand.Code`
correction just above — verify an assumption against the real live sheet before writing it
into a comment as fact, even when nothing is visibly broken.

## Correction: FG ref Brand's CODE is a plain number, not a letter (3 Sep 2026, same day)

Caught live — the user reported "CODE is not showing" (a real `—` in the "+ New" Brand
form's live preview, confirmed via screenshot). Root cause: an earlier pass here had DISMISSED
the user's own pasted formula for this column (`MAX(SELECT(FG ref Paint[_RowNumber],
ISNOTBLANK([Unique ID])))`) as "inconsistent with every sibling ref-table's letter-increment
CODE" and implemented the letter scheme instead. That assumption was wrong — the real live
`FG ref Brand` rows (shown directly in an earlier screenshot in this same conversation) hold
plain incrementing numbers in `Code` (`1, 2, 3, 4, 5, 6, 7`), not letters. Looking a numeric
value up against the Alphabet tab's `Letter` column can never match, so `nextFgBrandCode()`
was silently throwing on every single call — which is exactly what showed up as `—` in the
preview.

**Real fix**: `nextFgBrandCode()` no longer calls the shared `nextFgCode()` letter-lookup
helper — it now reads every existing `Code` value on `FG ref Brand`, finds the highest number,
and returns that plus one (a plain max+1), matching the real observed data and the spirit of
the user's own `MAX(...)`-based formula. The lesson already written into this file once for
RM's own dead-pointer fields applies here too: an assumption that a new column "should" follow
an existing pattern is not the same as verifying it against the real live data — the pasted
formula was right, the earlier dismissal of it wasn't.

## Brand and Standard Part are now required on FINAL GOOD SKU (3 Sep 2026, same day)

Both fields were optional (matching an earlier, more cautious pass) — per explicit follow-up,
now required: `taxonomy.ts`'s `fg-sku` `requiredFields` gained `"Brand"`/`"STANDARD PART"`,
`FgSkuForm.tsx`'s `canSave()` now checks both, both `SearchableSelect`s show the red `*`, and
the create payload sends them unconditionally (was a conditional spread before — safe now
since `canSave()` guarantees both are non-empty by the time Save is actually clickable).

## Correction: Standard Part's KEY/CODE preview was frozen at "—" (3 Sep 2026, same day)

The previous pass's `standardPartKeyPreview` required `value.trim()` (the doer's typed
STANDARD text) before showing ANYTHING — so KEY stayed at "—" even after typing, since the
gate itself was on the wrong condition (verified live: `Against id` correctly showed a real
value like "87", but KEY/CODE looked frozen). Fixed: KEY now shows progressively as soon as
Segment/Category/Sub Category are known (same "grows as fields are picked" behavior RM SKU's
own PART NO. preview already has), concatenating in STANDARD as it's typed rather than staying
blank until the whole thing is filled in. Verified live via the same temp-route harness used
elsewhere this session: typing into STANDARD now visibly extends the KEY preview in real time.

## FG SKU Form: Brand moved up, Standard Part becomes a real ref table + Brand DUPLICACY (3 Sep 2026)

The user gave four more real App Formulas directly, all implemented:

- **`FG ref Brand.Duplicacy`** — `COUNT(SELECT(FG ref Brand[Unique ID],[_THISROW].[Brand
  Description]=[Brand Description]))`. Not written to the sheet (`FG ref Brand` genuinely has
  no `Duplicacy` column, confirmed live) — computed client-side only, for the "+ New" panel's
  live preview (new `countFgBrandDuplicates()`, same shape as every other client-preview
  DUPLICACY in this app).
- **`FG Sub sub parts.CODE`** — `IF(ISBLANK([STANDARD]),"",LOOKUP([_THISROW].[STANDARD],
  "Alphabet","SR NO.","Letter"))`. Matches the doer-typed `STANDARD` text against `Alphabet`'s
  own `SR NO.` column (NOT the letter-increment shape every other ref-table CODE uses) —
  implemented literally (`nextFgStandardPartCode()`) even though it will resolve blank for
  essentially every real value (SR NO. holds sequential numbers, STANDARD holds a doer-typed
  name) — same "implement even where it's very unlikely to resolve" discipline as every dead
  AGAINST-ID branch elsewhere in this app.
- **`FG Sub sub parts.KEY`** — `[SEGMENT]&[Category]&[SUB CATEGORY]&[STANDARD]`, plain
  concatenation (`fgStandardPartKey()`) — a real, always-computable value (unlike CODE above).
- **`FG Sub sub parts.DUPLICACY`** — same client-preview-only treatment as Brand's (no live
  column exists), scoped to the KEY above.

**`FG Sub sub parts` already had a taxonomy entry from Sprint 1** (`fg-sub-sub-parts`) that had
never been wired into any form — added `STANDARD` to its `requiredFields`, `AGAINST ID`/`KEY`/
`CODE` to `computedFields`, and a POST-handler block computing all three (`AGAINST ID` via the
same dead-pointer `nextFgAgainstId()` every other AGAINST ID in this app uses; `SEGMENT`/
`Category`/`SUB CATEGORY`/`STANDARD` stay client-submitted, not overwritten by the dead
pointer — same decision already made for `fg-category-dd`). New preview endpoint `GET
/npd/taxonomy/fg-sub-sub-parts/preview?standard=...` — the one preview in this app that takes
a query param, since CODE genuinely depends on the not-yet-saved row's own typed `STANDARD`
value, not just existing sheet data.

**`FgSkuForm.tsx`**: **Standard Part is now a real `SearchableSelect` ref into `fg-sub-sub-
parts`** (was a plain Yes/No toggle) — filtered by SEGMENT+Category+SUB CATEGORY, greyed/inert
until Sub Category is picked (same pattern Sub Category itself uses for Category), with its
own "+ New" flow. This also means `generateFgPartCode()`'s `FG Sub sub parts` CODE component
now resolves for real whenever a genuine value is picked, instead of the earlier pass's
near-always-blank Yes/No guess. **Field order changed**: Brand and Standard Part moved to
right after Sub Category (matching the reference screenshot's own order — Sub Category → Brand
→ Standard Part), ahead of Name/Unit; both previously sat near the bottom of the form. Brand
also gained its own "+ New" flow (was a plain `SearchableSelect` with no create option).

`FgQuickCreateForm.tsx` grew two more kinds (`"brand"`, `"standard-part"`) — collapsing what
would otherwise be two more near-identical nested-form files into the same shared, `kind`-
parameterized component every other FG "+ New" flow already uses.

## Live rename: Raw Material SKU's own "Paint" column → "Brand" (3 Sep 2026)

The user renamed the `Raw Material SKU` tab's own column directly in the live sheet — a
DIFFERENT rename from the earlier `RM ref Paint`→`RM ref Brand` tab/`Brand Description` rename
(that one was the taxonomy reference table; this one is the RM SKU row's own field that stores
the picked Brand value). Updated every place that reads/writes this specific key:

- `taxonomy.ts`'s `rm-sku` table: `requiredFields`/`fields` now say `"Brand"`, not `"Paint"`.
- The POST handler's `generateRmPartCode()` call now reads `body.Brand` (was `body.Paint`) —
  the function's own `paint` parameter name is left as-is (internal naming only; it still
  looks up against the separately-named `RM ref Brand.Brand Description`, unaffected).
- `RmSkuForm.tsx`: `editRow?.Brand` for the initial prefill, `editRow.Brand` in the
  `editUnchanged` check, and both `createTaxonomyRow`/`updateTaxonomyRow` payloads now send
  `Brand:` — the component's own internal `paint`/`setPaint` state names are left alone (same
  "don't churn internal names for an external rename" reasoning as the backend).
- `RmSkuDetail.tsx`: the Brand field now reads `row.Brand` instead of `row.Paint`.

Verified with a full-repo grep across `Backend/src` for `"Paint"`/`.Paint` — no other route
(`purchase.ts`, `partCodeRequest.ts`, `bom.ts`) touches this specific field.

## SEGMENT locked to "Car Accessories" — no dropdown, no "+ New" (2 Sep 2026, same day)

Per explicit instruction: this app's entire FG product line is Car Accessories, so SEGMENT on
`FgSkuForm.tsx` should never be an editable choice. Changed from a `SearchableSelect` (sourced
from `fg-segment`) to a fixed `const FIXED_SEGMENT = "Car Accessories"`, rendered as a disabled
`TextField` — same treatment as the already-disabled live-preview `PART NO.` field just above
it. Removed the Segment "+ New" flow entirely (no reason to add a second segment that will
never be selectable), the now-unused `fg-segment` query/options, and the `creatingSegment`
state. `FgQuickCreateForm.tsx`'s `"segment"` kind is left defined (dead code, not deleted) in
case a future SKU type genuinely needs more than one segment.

## Correction: FgQuickCreateForm.tsx also shows Against id, quoting the real formula (2 Sep 2026, same day)

Even after the previous pass added TIMESTAMP/USEREMAIL/Unique ID/CODE/DUPLICACY, the user
pointed out `Against id` was still missing — quoting the exact real formula again
(`any(SELECT(FINAL GOOD SKU[ID'S],[ID'S]=MAXROW("FINAL GOOD SKU","TIMESTAMP",[ID'S]<>""))`).
This is the same dead-pointer shape RM's own `nextAgainstId()` already implements (a row can't
be pointed at by an AGAINST ID before it exists — see that function's own doc comment) — never
implemented for FG at all until now, since it had been judged lower-priority in the original
PART NO. formula pass. Added `nextFgAgainstId()` (`npdPartCode.ts`, same shape as its RM
sibling, scoped to `FINAL GOOD SKU`/`env.sheets.fg`), wired into both `fg-category`'s and
`fg-category-dd`'s POST handlers as an always-computed field (`Against id`/`AGAINST ID`
respectively — `fg-category` has no DUPLICACY column on the live sheet, confirmed live, so
only `Against id` is computed there, unlike its RM sibling), and two live-preview endpoints
(`GET /npd/taxonomy/fg-category/preview`, and `fg-category-dd/preview` now returns both `code`
and `againstId`). `FgQuickCreateForm.tsx` shows `Against id` for both "category" and
"sub-category" kinds now — "segment" still has nothing to show (`FG ref Segment` genuinely has
no computed columns on the live sheet at all).

## Correction: FgQuickCreateForm.tsx gets the same live-preview fields as RM's nested forms (2 Sep 2026, same day)

The first version of `FgQuickCreateForm.tsx` (below) skipped every live-preview field on the
reasoning that CODE/DUPLICACY/AGAINST ID are all server-computed anyway — the user pointed out
directly, with a side-by-side screenshot against `RmCategoryForm.tsx`, that it didn't "look
same." Added TIMESTAMP (ticking clock)/USEREMAIL/Unique ID (format-matching preview, same as
every RM nested form) to all three kinds. `FG ref Segment`/`FG ref Category` genuinely have no
CODE/DUPLICACY columns on the live sheet at all (confirmed live) — those two kinds stop there.
Only `FG ref Category DD` (Sub Category) has a real CODE to preview — new
`GET /npd/taxonomy/fg-category-dd/preview` (mirroring the existing `rm-category-dd/preview`
pattern, pure read of `nextFgCategoryDdCode()`) plus a client-computed DUPLICACY count (scoped
to SEGMENT+Category+SUB CATEGORY, mirroring `countFgSubCategoryDuplicates()`'s own real
formula) from the parent `FgSkuForm.tsx`'s already-loaded `fg-category-dd` rows, passed down
as a new `subCategoryRows` prop.

## FG SKU gets its real PART NO. formula + Brand field + Segment/Category/Sub Category "+ New" (2 Sep 2026, same day)

The user pasted the real live App Formulas for `FINAL GOOD SKU.PART NO.`, `FG ref
Category.Against id`, `FG ref Category DD.AGAINST ID/CODE/Category/SEGMENT/KEY/DUPLICACY`,
`FG ref Brand.Code/Duplicacy` (confirming the tab rename `FG ref Paint` → `FG ref Brand`,
`Paint Description` → `Brand Description` — same pattern as RM's own identical rename earlier
the same day), and `FG Sub sub parts.AGAINST ID/SEGMENT/Category/SUB CATEGORY/KEY/CODE/
DUPLICACY` — directly superseding this file's own earlier "no verified formula exists for FG"
statement, which was written before these were available.

**Verified live before implementing anything** (this app's standing discipline): dumped
`FINAL GOOD SKU`'s real headers again and confirmed **there is no `Paint` column on it at
all** — the pasted formula's `[_THISROW].[Paint]` term has nothing to write to on this live
sheet. Per the user's own explicit "Paint change to brand" instruction, implemented as a NEW
additive `Brand` column instead of trying to force the literal dead name through — same
"Paint→Brand" rename RM SKU already went through, applied consistently here too.

**`generateFgPartCode()`** (`npdPartCode.ts`) implements the formula's four real
`&`-concatenated parts: (A) the combined Category+Sub-Category CODE off `FG ref Category DD`
(matched by SEGMENT+Category+SUB CATEGORY together — the formula's own dead AGAINST-ID branch
is skipped the same way RM's own dead branches are, see below), (B) a 3-digit running count
scoped by SEGMENT+CATEGORY+SUB CATEGORY, (C) `FG Sub sub parts`' own CODE (best-effort/
optional — `FINAL GOOD SKU`'s `STANDARD PART` field is still the plain Yes/No toggle it
already was, not wired as a real ref into `FG Sub sub parts` this pass, so this term usually
resolves blank rather than throwing), (D) the Brand CODE (optional, same graceful-blank
treatment). `FG ref Brand.Code`'s own pasted formula (`MAX(SELECT(...[_RowNumber]...))`,
which computes a row NUMBER) was NOT implemented literally — kept on the same proven
letter-increment shape every sibling ref-table CODE column already uses (consistent with
`nextCode()`'s own pattern), since a row-number code would be inconsistent with what
`fgBrandCodeFor()` needs to look up against and with every other tab's own observed
single-letter CODE values.

**Every `IF(NOT(ISBLANK(LOOKUP(...AGAINST ID...))),...)` branch across all these formulas is
the same dead pointer already found and reverted once this session** for RM ref Category DD's
own `Category` field (a row can't be pointed at by an AGAINST ID before it exists) — rather
than repeat that exact bug, `FG ref Category DD`'s `SEGMENT`/`Category` stay CLIENT-SUBMITTED
(now both required fields on that taxonomy table), never overwritten by the dead LOOKUP.
`CODE` (`nextFgCategoryDdCode()`) and `DUPLICACY` (`countFgSubCategoryDuplicates()`, scoped to
SEGMENT+Category+SUB CATEGORY) are real, always computed. `FG ref Category`'s own `Against
id` and `FG Sub sub parts`' full auto-compute chain were NOT implemented this pass (same dead-
pointer class, genuinely lower priority — nothing else reads `FG ref Category.Against id`, and
`FG Sub sub parts`' own CODE lookup already degrades gracefully to blank when unmatched) —
flagged as a follow-up, not silently skipped.

**`FgSkuForm.tsx`**: PART NO. is now a disabled live-preview field (client-side mirror of the
server formula, same pattern RM SKU's own PART NO. preview uses — reads already-loaded
dropdown data, no extra network round trip). Added a `Brand` `SearchableSelect` (off `fg-paint`,
now pointing at the real `FG ref Brand` tab). **Segment/Category/Sub Category each get a real
"+ New" inline-create flow** — per the user's explicit follow-up request, mirroring RM SKU's
own Category/Sub Category/Paint/Vendor pattern — via one new shared `FgQuickCreateForm.tsx`
(parameterized by `kind`, collapsing what would otherwise be three near-identical files into
one, since all three cases are genuinely just "one free-text field" with no CODE/DUPLICACY
live preview to show — those are all server-computed on save now). `taxonomy.ts`'s `fg-sku`
table: `PART NO.` moved to `computedFields`, dropped from `requiredFields`; `Brand` added to
`fields`.

## Correction: FINAL GOOD SKU Form rebuilt on RmSkuForm.tsx's own panel chrome (2 Sep 2026, same day)

The first version of `FgSkuForm.tsx` (below) used the shared `FormModal.tsx` centered-dialog
convention — reasonable on its own, but it sat right next to `RmSkuForm.tsx`'s custom
right-docked panel in the same app and looked nothing like it. The user caught this
immediately ("are you sure this look same") with a side-by-side screenshot. Rebuilt on the
EXACT same chrome as `RmSkuForm.tsx`: right-docked panel (`min(48.18vw, 925px)` wide),
64px header/footer bars, same literal-hex field styling (`#D1D5DB` borders, `#C0392B` focus/
selected red) — not `FormModal.tsx`'s pattern. Same reasoning `RmSkuForm.tsx` already
documents for its own deviation from `FormModal.tsx` applies here too: visual consistency
between the app's own two SKU forms matters more than following the generic modal shape.
Field logic/behavior is unchanged from the first version — only the outer chrome changed.

## FINAL GOOD SKU Form — the "+ New" create form the earlier scoping question deferred (2 Sep 2026, later)

The earlier FG SKU Detail rebuild was explicitly scoped to the Detail page only (a direct
question confirmed this) — the user then asked for the create form too. Built it:

- **`taxonomy.ts`'s `fg-sku` table has `allowCreate` back on** (was `allowCreate: false` — new
  rows were meant to only come from an approved New Part Code Request; the user's direct
  instruction overrides that for now). `requiredFields` set to `["PART NO.", "SEGMENT",
  "CATEGORY", "SUB CATEGORY", "Name"]`.
- **Caught a real bug before it shipped**: `FG ID` (the id column) is a **plain sequential
  integer** on the live sheet (`1, 2, 3 … 86`, confirmed live) — a literal cell value, not an
  ARRAYFORMULA the way `CUSTOMER MASTER.CUST ID`/`vendor-master.Vendor Id` are, and NOT random
  hex the way RM SKU's own `ID'S` is. The generic taxonomy POST handler defaults every table to
  `nextPlainRandomId` — would have written a random hex string into a column whose every
  existing row is a bare number. Fixed with the same `idStrategy: "sequential"` escape hatch
  `vendor-master` uses, empty prefix + `idSequencePad: 1` (no zero-padding), so a new row gets
  plain "87", "88", … matching the real existing rows exactly.
- **`FgSkuForm.tsx`** — built on this app's own shared `FormModal.tsx` convention (unlike
  `RmSkuForm.tsx`'s deliberate custom-panel exception, which pixel-matches a specific reference
  panel — no such request existed here). **PART NO. is a plain required text field, not
  auto-computed** — confirmed off the reference screenshot (no disabled/greyed "Auto Compute"
  styling the way RM SKU's PART NO. has), and there's no verified real App Formula for FG's own
  part-code scheme the way RM SKU's `generateRmPartCode()` exists. Segment/Category/Sub
  Category are real `SearchableSelect`s off the FG taxonomy tables (`fg-segment`/`fg-category`/
  `fg-category-dd`, all already built in Sprint 1), Sub Category filtered by the picked
  Category. **No "+ New" inline-create flow for these three yet** (unlike RM SKU's Category/
  Sub Category/Paint/Vendor, which each got one) — flagged as a follow-up, not silently
  limited; a doer needing a brand-new Segment/Category/Sub Category has no in-form way to add
  one yet.
- `FgSkuCatalog.tsx` gained the same "+ New" header-action wiring `RmSkuCatalog.tsx` already
  has (desktop `+` button in the header-actions slot, mobile FAB), opening `FgSkuForm.tsx` and
  navigating to the new row's detail page on save.

Edit on `FgSkuDetail.tsx` is still visual-only — `FgSkuForm.tsx` has no edit-mode/`editRow`
support yet (unlike `RmSkuForm.tsx`'s), a reasonable next step once this create flow is
confirmed working end-to-end.

## FG SKU Detail rebuilt on the same real pattern as RM SKU Detail (2 Sep 2026, later)

The user asked to do "the same" for FG SKU after seeing RM SKU Detail's rebuild, sharing
AppSheet reference screenshots (Update All Vendor PDFs / MACHINING & OTHER CHARGES / Verify
BOM Item icons, Drawing Videos + Fitment Details cards, a BOM Items table). Scoped via an
explicit question first — Detail page only, not the "+ New" create form (which stays
`allowCreate: false` on `taxonomy.ts`'s `fg-sku` table, a deliberate existing decision: new
FG SKU rows only come from an approved New Part Code Request).

`FgSkuDetail.tsx` rebuilt on the exact same pattern `RmSkuDetail.tsx` now uses (itself copied
from `TripDetail.tsx`): `QuickAction` icons (Update All Vendor PDFs / MACHINING & OTHER
CHARGES / Verify BOM Item — visual-only, no backing workflow yet), `Section`/`Field` cards,
Edit + Previous/Next in the `useSetHeaderActions` header slot. **Edit is disabled/visual-only
here** (unlike RM SKU's real Edit) — there's no `FgSkuForm.tsx` yet to open.

**Field list stays exactly what the previous version of this file already had** — the live
`FINAL GOOD SKU` tab only has ~20 real columns (see the "Verified directly against the
workbook" section above), NOT the reference screenshot's `Old Part Name`/`Description`/
`Paint` fields (those belong to the old 2-wheeler ADC schema that never made it to ZOTO's live
sheet) — showing them would be fabricating fields that don't exist, so they were deliberately
left out rather than copied from the screenshot.

Two of the three new cards are honestly empty (Drawing Videos, Fitment Details — no upload
feature or customer-fitment tracking table exists yet, same "flag it, don't fake it"
convention as RM SKU Detail's Dimensions/Drawing & Photos cards). The third, **BOM Items, is
genuinely real** — `listBomLines(fgId)`, the exact same `ASSEMBLE RM FG (BOM)` data
`BomBuilder.tsx` already reads/writes, not a placeholder; its "Expand" navigates to the
existing `/npd/bom/:fgId` route.

## Real bug caught via the new Edit flow: "Brand Description" column rename + trailing-space data (2 Sep 2026, later)

Testing the just-shipped Edit flow surfaced a real bug: opening Edit on an existing RM SKU
showed every field prefilled correctly EXCEPT Brand, which showed the placeholder instead of
the row's real saved value (e.g. "WHITE LABLE"). Two live-data causes, found by dumping the
actual sheet cells directly rather than guessing:

1. **The `RM ref Brand` tab's own column was renamed a second time** — `Paint Description` →
   `Brand Description` (on top of the earlier tab rename `RM ref Paint` → `RM ref Brand`) —
   confirmed live. Every place that read `r["Paint Description"]` was silently getting
   `undefined` back: `npdPartCode.ts`'s `paintCodeFor()` (now reads a new
   `RM_PAINT_DESCRIPTION_FIELD = "Brand Description"` constant), `taxonomy.ts`'s `rm-paint`
   table's `requiredFields`/`fields` (now `["Code", "Brand Description"]` — NOT `fg-paint`'s
   own separate `Paint Description` entry, which lives on the unrelated `FG_SHEET_ID`
   spreadsheet and was correctly left alone), `RmSkuForm.tsx`'s `paintOptions`/`paintCode`
   lookups, and `RmPaintForm.tsx`'s create payload + field label + placeholder text.
2. **The tab's real Brand Description values carry a trailing space** (`"WHITE LABLE "`,
   confirmed live) that the RM SKU row's own saved `Paint` value does not (`"WHITE LABLE"`) —
   a strict `===` match between the two would never succeed even with the column name fixed.
   Hardened EVERY option-matching comparison in `RmSkuForm.tsx` with `.trim()` — not just
   Brand, but Category/Sub Category/Vendor Name too (`categoryOptions`, `subCategoryOptions`
   + its Category filter, `paintOptions`, `vendorOptions`, `categoryCode`/`subCategoryCode`/
   `paintCode` lookups, and the edit-mode `editUnchanged` comparison) — the same kind of
   stray whitespace could just as easily show up on any of those tabs later, and now none of
   them would silently break the same way Brand just did.

Verified with a full-repo sweep (`grep -rn '\["Paint Description"\]'`) confirming zero
remaining functional references to the old column key anywhere in Backend or Frontend — the
only surviving mentions of "Paint Description"/"RM ref Paint" are historical comments quoting
the original AppSheet App Formula text verbatim (deliberately left, per this project's
"formula wording is historical fact, don't edit it" convention) or `fg-paint`'s own unrelated,
still-correctly-named column on the FG spreadsheet.

## RM SKU Detail's Edit button now really opens the edit form (2 Sep 2026, later)

Edit was visual-only since the first `RmSkuDetail.tsx` rebuild — the user asked for it to
actually work. `RmSkuForm.tsx` gained an optional `editRow: TaxonomyRow` prop:

- **Prefill**: `category`/`subCategory`/`vendorName`/`paint`/`makeBy` state all initialize
  from `editRow`'s existing values instead of blank/`null`.
- **PART NO. on edit — the tricky part**: the live-preview formula's running "count" (how many
  existing rows already share this Category+Sub Category prefix) counts the row being edited
  too, so naively recomputing it for an unchanged row would silently produce a DIFFERENT, wrong
  PART NO. purely from being in that count. Fixed with an `editUnchanged` check — while
  Category/Sub Category/Paint/Make By all still match what the row was saved with, PART NO.
  shows the row's own real saved value verbatim; only once the doer actually changes one of
  those four does the live formula take back over (same behavior as create).
- **Save**: `editRow` present → `updateTaxonomyRow("rm-sku", id, {...fields, "PART NO.":
  livePartNo})` (PUT) instead of `createTaxonomyRow` (POST). The generic PUT
  `/npd/taxonomy/:key/:id` route (`taxonomy.ts`) does NOT recompute PART NO. server-side the
  way POST does (that's a create-only `computedFields` step) — sending the client's own
  `livePartNo` in the update body is what keeps it correct if those four inputs changed.
- Panel title switches to "Edit Raw Material SKU" when `editRow` is present.

`RmSkuDetail.tsx`'s Edit button (in the header-actions slot from the previous pass) now opens
`RmSkuForm` with `editRow={row}`, disabled until the row itself has loaded; `onSaved`
invalidates the `rm-sku` rows query so the detail page picks up the change immediately.

## Paint → Brand: label rename followed by a real live tab rename (2 Sep 2026, later)

After the "Paint" field label was renamed to "Brand" (display-only, previous entry), the user
went and renamed the LIVE SHEET TAB itself from `RM ref Paint` to `RM ref Brand` (confirmed by
dumping the spreadsheet's tab list directly — columns unchanged: TIMESTAMP/USEREMAIL/Unique
ID/Code/Paint Description). Updated everywhere this app hardcodes that tab name:
- `npdPartCode.ts`'s `RM_PAINT_TAB` constant → `"RM ref Brand"`, and its
  `MISSING_PAINT_CODE` error message text.
- `taxonomy.ts`'s `rm-paint` table entry → `tab: "RM ref Brand"`, `label: "RM Brand"` (`key`
  stays `"rm-paint"` — internal API contract, no reason to rename just because the display
  name/tab did).
- `RmPaintForm.tsx`'s panel title → "RM ref Brand Form" (was "RM ref Paint Form").

Doc comments elsewhere in `npdPartCode.ts` that quote the ORIGINAL AppSheet App Formula text
verbatim still say "RM ref Paint" — that's the formula's own historical wording (what the real
legacy formula literally said when it was decoded), left unedited on purpose; only the
functional tab-name constant and the user-facing form title changed. `Paint Description` stays
the real column name — only the tab and the app's field label changed, not that header.

## Vendor dropdown label shows "Vendor Firm Name - product" (2 Sep 2026, later)

`RmSkuForm.tsx`'s Vendor Name `SearchableSelect` options now display as e.g. "J.C.I
Cables(India) - CABLES" — the real `ZOTO/MASTER-VENDOR` sheet's `product` column (column Y,
confirmed live) appended to the firm name — per the user's explicit request, to help tell
apart vendors with similar names but different goods. Display-only: the saved `value` stays
just the plain firm name (what's actually written to the RM SKU row's own `VENDOR NAME`
field) — only the dropdown's visible `label` changes. No backend change needed: `GET
/npd/taxonomy/vendor-master` already returns the full raw row (including `product`) regardless
of the table's `fields` whitelist, same as every other taxonomy table.

## VENDOR NAME connected to the real live "ZOTO/MASTER-VENDOR" spreadsheet (2 Sep 2026)

The user shared Editor access to a genuinely separate, already-live production spreadsheet —
**"ZOTO/MASTER-VENDOR"** (`1LHuLmcZmkYG461Tfvvusbv2zcKzhi96W88Z3usiTUjw`, new env var
`VENDOR_MASTER_SHEET_ID`, `env.sheets.vendorMaster`) — one tab, `Vendor Master`, already
holding 27+ real rows (`VEND-0001`… sequential IDs, real firms like "J.C.I Cables(India)").
**This is NOT the same as the empty placeholder `Vendor Master` tab that already existed on
`env.sheets.npd`** (`taxonomy.ts`'s Sprint-1 `vendor-master` entry, headers `Vendor Name`/
`Vendor ID`/`Contact No.`/`GSTIN`/`Address` — invented, never populated). Confirmed the real
sheet's actual headers by dumping them directly (this app's standing discipline) rather than
guessing from the screenshot alone: `Date Of Joining`, `Vendor Id`, `Vendor Firm Name`,
`Status`, `Payement Terms`, `Contact Person Name`, `Address`, `Email`, `Country Name`,
`Pin Code`, `Mobile`, `Mobile No.2`, a second `Contact Person Name`, `Contact Person Mobile
No.`, `Contact Person Designaiton`, `Vendor GSTIN`, `State Name`, `Logo's`, `Payment Term
(Days)`, `Bank Name`, `BRANCH IFSC CODE`, `Account No. RTGS`, `GOODS TYPE SUPPLY`, `Segment`,
`product`, `Account Type` — 26 columns total, no `Timestamp`/`Useremail` pair (uses `Date Of
Joining` as its own timestamp-ish column, no per-row editor-email column at all).

`taxonomy.ts`'s `vendor-master` table entry was repointed at this real sheet (`spreadsheetId:
env.sheets.vendorMaster`, `idColumn: "Vendor Id"`), exposing only a practical subset of the 26
real columns for now (`Vendor Firm Name`, `Status`, `Contact Person Name`, `Email`, `Mobile`,
`Address`, `Vendor GSTIN`) — every other real column stays intact on the sheet untouched, just
not surfaced through this generic taxonomy form yet.

**Frontend**: `RmSkuForm.tsx`'s VENDOR NAME field — previously a plain free-text `<input>`
with a decorative "+" icon (written when this sheet's existence wasn't yet known, see that
field's own now-superseded doc comment/history) — is now a real `SearchableSelect` sourced
from `vendor-master`'s live rows, with the same "+ New" inline-create flow as Category/Sub
Category/Paint. New `RmVendorForm.tsx` (mirrors `RmPaintForm.tsx`'s shape/simplicity) captures
Vendor Firm Name (required) + Contact Person Name/Email/Mobile (optional), submitting a new
vendor straight into the real live sheet with `Status: "NEW"` (distinguishing app-created
vendors from the sheet's pre-existing `"EXISTING"` rows at a glance).

### Correction (2 Sep 2026, same day): Vendor Id is a live ARRAYFORMULA — the first pass here was wrong

The first version of this feature minted a sequential `VEND-000N` id server-side
(`TaxonomyTableDef.idStrategy: "sequential"`, mirroring `nextSequentialId`) and wrote it as a
literal into the sheet's `Vendor Id` column, reasoning that the real rows "looked sequential."
**This was the exact same bug already documented in CLAUDE.md's Known Gotchas for
`CUSTOMER MASTER.CUST ID`** — the user showed the real cell formula
(`=ARRAYFORMULA(IF(C2:C<>"","VEND-"&TEXT(ROW(C2:C)-1,"0000"),""))`) live in the sheet, which a
literal value in that column's spill range would have broken (Google Sheets refuses to expand
an ARRAYFORMULA into a cell that already holds content, turning the source formula cell into
`#REF!` and blanking every other row's id). This would have silently corrupted every one of
the 27 existing vendors' ids the first time a doer used this feature — caught before it ever
shipped to a real user, but only because the user happened to have the sheet open and pointed
it out directly.

**Real fix**: `TaxonomyTableDef.idStrategy`/`idSequencePrefix`/`idSequencePad` were replaced
for this table by `idGeneratedByArrayFormula: true` — the POST handler now never mints or
writes into `Vendor Id` at all (the key is omitted entirely from the `appendRow` record, not
even sent as `""` — an empty string still counts as "content" for the spill-range check, per
the same lesson from the `CUST ID` fix), then re-reads the tab after appending and picks up
whatever id the sheet's own formula generated for the new last row — mirroring
`masters.ts`'s existing `CUST_ID_NOT_GENERATED` recovery pattern for the identical situation
on `CUSTOMER MASTER`. 500s with a clear message if the formula somehow didn't fire, same as
that pattern's `CUST_ID_NOT_GENERATED`. Every other taxonomy table is unaffected — this is a
per-table opt-in, not a change to the default `nextPlainRandomId` path.

**Frontend**: `RmVendorForm.tsx`'s Vendor Id field is a **live preview**, not a static
"Generated on Save" placeholder (the user explicitly asked for this) — computed client-side as
`VEND-${(vendorRows.length + 1) padded to 4 digits}`, mirroring the sheet's own formula logic
(`"next row number"`) using `vendorRows` already loaded by the parent `RmSkuForm` for the
dropdown options. This is a *prediction*, not the source of truth — the real id actually
written is still whatever the sheet's ARRAYFORMULA generates server-side and is read back
after save — but it's reliable for the normal case of one doer creating one vendor at a time,
same "live preview of a server-computed value" spirit as the Category/Sub Category/Paint
CODE previews (those preview a *formula-derived* value via a real backend endpoint; this one
predicts a *row-position-derived* value client-side since there's no meaningful lookup to
preview — just "how many rows exist right now").

**Verification note**: typechecked clean on both sides (`tsc --noEmit`) after this fix too;
still did not run a live create-and-verify round-trip against the real vendor sheet (per the
user's own stated token-budget preference, live-sheet verification scripts are skipped by
default unless asked for) — so the actual "does the sheet still cleanly regenerate every id
after an app-created row" behavior is unverified beyond code review. Worth a real create once
deployed, watching column B in the live sheet directly.

## Drawing FG Form + Assemble RM FG Form (4 Sep 2026)

Two new standalone create forms, matching two real live tabs on `FG_SHEET_ID` the user
screenshotted directly from the AppSheet reference and confirmed against a live Sheets header
dump — both use the same generic `taxonomy.ts`/`createTaxonomyRow` infra every other NPD
reference form does, no bespoke route needed:

- **`drawing-fg`** → live tab `Drawing FG`: `TIMESTAMP`/`AGAINST ID`/`Unique ID`/`USEREMAIL`/
  `SEGMENT`/`CATEGORY`/`SUB CATEGORY`/`STANDARD`/`PAINT` + 9 attachment columns (`2D Drawing`/
  `2D Top View`/`2D Bottom View`/`2D Front View`/`3D Isometric View`/`Rear Photo`/`Rear Video`/
  `3D Video`/`Animation Process / CAE`). `AGAINST ID` is the same dead-pointer formula as every
  other one in this app. `Frontend/src/npd/DrawingFgForm.tsx` takes the parent FG SKU row as a
  prop and reads SEGMENT/CATEGORY/SUB CATEGORY/STANDARD/PAINT straight off it (disabled,
  matching the reference's own greyed pre-filled look) — the doer only fills in the 9
  attachment fields. **Those 9 fields are plain text (Drive fileId or URL) for now** — no
  generic upload-picker component exists anywhere in NPD yet; real wiring to `uploads.ts`'s
  private-Drive-file flow is a follow-up, flagged rather than faked.
- **`assemble-rm-fg`** → live tab `ASSEMBLE RM FG` (note: **not** the same tab as
  `bom.ts`'s own `ASSEMBLE RM FG (BOM)` — different tab, don't conflate them): `TIMESTAMP`/
  `USEREMAIL`/`Unique id`/`FG ID`/`FG CODE`/`FG CATEGORY`/`FG SUB CATEGORY`/`FG PAINT`/
  `FG STANDARD`/`Category`/`Sub Category`/`RM ID`/`RM CODE`/`DUPLICATE`/`No. Of Qty Use`/
  `Units`/`Levels`/`Part Specs.`. FG ID is fixed from the parent FG SKU; every `FG *`/`RM CODE`
  column is a server-computed snapshot off the picked FG ID/RM ID (never client-supplied),
  same denormalization convention as `tripMap.ts`'s `ORDER_SNAPSHOT_MAP`. `DUPLICATE` is a live
  count of existing rows already pairing that exact FG ID + RM ID. `Category`/`Sub Category`
  here are the **RM side's own** taxonomy (`RM ref Category`/`RM ref Category DD`), used only
  to narrow the RM ID picker, same "narrow the search first" pattern `RmSkuForm.tsx` uses.
  `Frontend/src/npd/AssembleRmFgForm.tsx` live-previews the FG-/RM-CODE snapshot + DUPLICATE via
  a new `GET /npd/taxonomy/assemble-rm-fg/preview?fgId=&rmId=` endpoint as the doer picks RM ID.

Both forms are opened from `FgSkuDetail.tsx`'s quick-action rail ("Give Drawing FG Form" /
"Give Assemble RM FG Form", replacing two previously-inert placeholder buttons there) — same
right-docked panel chrome as `FgSkuForm.tsx`/`FgQuickCreateForm.tsx`. Backend: two new
`TABLES` entries in `taxonomy.ts` + two new `/preview` GET endpoints + two new POST
special-cases (mirroring `fg-sub-sub-parts`'s own shape). Typechecked clean both sides; not
yet verified against the live sheet (per the user's own stated token-budget preference, no
live create-and-verify round trip run this pass — worth doing once deployed).

## Small follow-ups (5 Sep 2026)

- **Removed the "Unit" field from `FgSkuForm.tsx`** ("FINAL GOOD SKU Form") per explicit
  instruction — was a plain optional free-text field, not on the reference form at all.
- **"BOM Items" card's Expand button (`FgSkuDetail.tsx`) now opens `AssembleRmFgForm` directly**
  instead of navigating to `BomBuilder.tsx`'s separate page — matches the reference's own
  nested "BOM ITEMS* → New" flow (the FG SKU form's own BOM Items section opens the ASSEMBLE
  RM FG Form, not a separate BOM builder screen). `BomBuilder.tsx`/`bom.ts` (the *other*
  `ASSEMBLE RM FG (BOM)` tab) are unchanged and still reachable at `/npd/bom/:id` directly —
  just no longer the click target from this one card.

## Known gotchas (add to as they're found)

- The `NPD` folder didn't exist on disk when this file was created (2026-08-29) despite the user's
  Explorer showing one dated 8/7/2026 — if that's ever a real discrepancy again, don't assume a
  stale screenshot; verify with `Test-Path`/`ls` before proceeding.
- `FINAL GOOD SKU` has a blank header between `SUB CATEGORY` and `Name` — leave it alone (don't
  guess a name for it), and don't let `npdMaps.ts` silently misalign columns because of it; index
  by header text, never by raw column position.
- The two **legacy** ADC reference spreadsheets (`Copy of ADC/PRODUCT MASTER-RM`/`-FG`, IDs
  above) are separate from this project's own live sheets (`FG_SHEET_ID`/`NPD_SHEET_ID`) — they
  exist purely as read-only historical reference for reverse-engineering real business rules,
  never write to them, and don't confuse their tab names with this project's own (e.g. both
  files have a `Raw Material SKU`/`FINAL GOOD SKU` tab with a *different* real schema than ours).
