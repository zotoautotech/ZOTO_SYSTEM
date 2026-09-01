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
