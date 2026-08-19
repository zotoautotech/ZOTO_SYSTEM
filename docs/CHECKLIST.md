# Checklist App (Accounts department) — full system notes

Read this before touching anything under `Frontend/src/checklist/` or
`Backend/src/routes/checklist*.ts`. Keep it current the same way `CLAUDE.md` is kept
current — update it in the same turn as any change that touches this app's routes, sheet
columns, or permission model.

## What it is

A separate top-level app off HOME (`/checklist`, not nested under `/modules` — same
"each HOME tile is its own independent app" pattern as Sales CRR). Reached from the
`CHECKLIST-ZOTO-V1` HOME tile. **Scope so far: Accounts department only** — the old
AppSheet reference (`CHECKLIST-ADC-V1`) covers 11 departments; the other 10 aren't built.

## Sits on top of an existing, untouched Apps Script pipeline

Not something this app owns or should modify:
`onChangeHANDLER` (on `ZOTO/CHECKLIST MASTER-FY26-27`, tab `Task List Master`) →
`sentdata_allchecklist_deptwise()` routes each new row by its `Department` column into the
matching department's `Task List <Dept>` tab → that department's own `createChecklist1()`
(a separate Apps Script project, e.g. `Checklist-ACCOUNTS`) expands each template into
dated `Master Accounts` instances (recurrence: D/W/M/Y/Q/F/E1st..ELast). This app's backend
only ever **writes the punch-in row** (`POST /checklist/tasks`, leaves `TRANSFER STATUS`
blank on purpose — the Apps Script trigger uses blank to know a row hasn't routed yet) and
**reads/completes the resulting instances** — it never touches routing or recurrence logic.

## Spreadsheets

Two, env vars in `Backend/.env`:
- `CHECKLIST_MASTER_SHEET_ID` — tabs `Task List Master` (templates, punched by
  `POST /checklist/tasks`), `Doer List` (fed live from Employee Master), `PcFollowUp`
  (admin follow-up remark log), `USERS` (this app's **own** admin permission tab, see below).
- `CHECKLIST_ACCOUNTS_SHEET_ID` — tabs `Task List Accounts`, `Master Accounts` (the
  generated dated task instances doers actually complete), `Working Day Calender`,
  `Holiday List`.

## Doer identity is Employee Id, not email

The old AppSheet schema keyed everything off `USEREMAIL()`, but Employee Master's own Email
column is genuinely empty for every employee (confirmed directly against the sheet). So
`Backend/src/routes/checklist.ts` writes the doer's **Employee Id** (ZOTO login id, always
populated) everywhere an email would have gone. The Apps Script pipeline never validates
that value — it just copies it straight through. The sheet's own column name (`Email`) is
unchanged; only what value goes into it changed.

## Backend — `Backend/src/routes/checklist.ts`

Mounted with `requireAuth, requireModule("checklist")` on every route (base gate — anyone
with Checklist in their Sales CRR `USERS.Permissions_Process` gets in).

- `GET /doers` — Doer List tab, filtered to rows with an Employee Id.
- `POST /tasks` — punches a new task template into `Task List Master`. Mints a
  `UNQ-<8 hex>` id via `nextUniqueId()` (same random-id + collision-check convention as
  `services/ids.ts`, just parameterized by spreadsheetId since that helper hardcodes the
  Sales-CRR transactions sheet).
- `GET /tasks/mine?status=COMPLETED` — **department-wide shared queue, not a personal
  inbox** (confirmed by previewing the old app as both an admin and a regular doer — both
  saw the identical full list; the old Show_If only gated the *menu item*, never which
  *rows* a viewer sees). Endpoint path kept as "mine" to avoid a wider rename, but it isn't
  filtered to the caller. Pending = `Status` blank **and** `Planned <= now` (`isDueNow()`)
  — the recurrence engine bulk-generates a task's whole range up front, so without the date
  filter a doer's queue floods with instances scheduled weeks/months ahead. Completed =
  `Status` set (Done/Rejected/leave types), no date filter. `FULL_NAME`/`DELAY_DURATION`
  are synthesized per row (virtual/formula columns in the old schema).
- `POST /tasks/:taskId/complete` — updates the doer's own `Master Accounts` row (matched by
  `Task ID`) with Done/Rejected/leave-type + attachment Yes/No + remarks. Only ever touches
  that one row.
- `GET /admin/check` — `{isAdmin}`, lets the frontend decide whether to show admin nav
  without loading an admin page first.
- `GET /admin/assigned` — **admin only**, every punched template across every doer (Full
  Name, Task, Frequency, Day/Date, Doer), reads `Task List Master` directly (the templates,
  not generated instances).
- `GET /admin/dashboard` — **admin only**, pending-instance count per doer, reads
  `Master Accounts`. Old app had one donut per department; this app only has Accounts, so
  it's a flat per-doer list — extend once more departments exist.
- `GET /admin/pending/:doerId` — **admin only**, one doer's pending instances (drill-down
  from the dashboard), same filter shape as `/tasks/mine`'s pending branch.
- `POST /tasks/:taskId/followup` — **admin only**, "Update Remark" action, appends to
  `PcFollowUp` (Timestamp/Useremail/Remark ID/Task ID/Task List id/Assignee Name/
  FollowUp Detail/Remarks/Image/File — headers dumped directly off the live sheet). Never
  touches `Master Accounts` — separate append-only audit log, same convention as Order
  Punch Discount in Sales CRR.

**Google Sheets date cells come back inconsistently** — some rows parse fine with
`Date.parse`, others come back as a locale `"DD/MM/YYYY HH:mm:ss"` plain-text string
`Date.parse` misreads as US month-first. `parsePlannedDate()` parses day-first explicitly
instead of trusting `Date.parse`'s guessing — an unparseable row used to fail-safe to
"always due," which fired on every locale-format row and leaked future-dated tasks into the
pending list. Reuse `parsePlannedDate()` (or its pattern) anywhere else this app reads a
Planned/date-ish cell back from Sheets.

## Admin permission model — `Backend/src/routes/checklistPermissions.ts`

This app has its **own** `USERS` tab, live inside `ZOTO/CHECKLIST MASTER-FY26-27` itself
(`CHECKLIST_MASTER_SHEET_ID`) — **separate from the Sales CRR `USERS` sheet** that gates
the base `requireModule("checklist")` login/module check. `isChecklistAdmin(employeeId)`
matches the row by Employee Id (case-insensitive) and checks `Permissions_`/
`Permissions_Process` (trimmed) `=== "admin"`. Only `"Admin"` **here** unlocks the three
admin-only views (Assigned Checklist, Dashboard - Pending Checklist, follow-up remarks) —
a Sales CRR Admin flag does not carry over. This split was a deliberate user decision even
though both apps share the same login session — don't collapse the two permission sources
into one without asking again.

## Frontend — `Frontend/src/checklist/`

Routes (`App.tsx`):
- `/checklist` → `MyTasksList.tsx` — the shared department pending/completed queue
  (`GET /tasks/mine`), "Give Task Form" opens `TaskCompleteForm.tsx`.
- `/checklist/assigned` → `AssignedChecklistList.tsx` — admin-only, every punched template
  across every doer. Layout: `CustomerFilterPanel` doer-grouped sidebar (All + one row per
  doer with a count badge) + resizable divider (drag to resize 160–480px, double-click
  resets to 260px, same pattern as `OrderPunchList.tsx`/`SoConfirmationList.tsx`) + 5-column
  `DataTable` (Full Name, Task, Frequency, Day/Date, Doer). Outer wrapper uses
  `minHeight: calc(100vh - 128px)` so the sidebar/divider/table all stretch to full page
  height regardless of row count — **don't drop this wrapper shape**, an earlier version
  without it left the divider/sidebar visibly stopping short after just a few rows instead
  of running the full page height like every other list view. No in-page `<h2>` title —
  relies solely on the breadcrumb bar (`Layout.tsx`) for the page label, matching
  `OrderPunchList.tsx`'s convention; a duplicate `<h2>Assigned Checklist</h2>` here used to
  repeat what the breadcrumb already showed and was removed.
  "+ Add" header button opens `TaskPunchForm.tsx` (posts to `POST /checklist/tasks`).
- `/checklist/dashboard` → `DashboardList.tsx` — admin-only. A 6-column donut-chart card
  grid matching the old AppSheet reference (`CHECKLIST-ADC-V1`)'s "Dashboard - Pending
  Checklist" card layout (title + donut only — no "Full Name" row, no filter icon, no "Back
  to My Tasks" button; a first pass had all three, removed on user feedback since they
  either duplicated info or added noise the reference doesn't have). **Only "Pending
  Checklist Account" is real data** (`GET /admin/dashboard`) — rendered as **one donut
  segment per doer** (colors cycled from `PALETTE`), each carrying that doer's name in
  `DonutSegment.label`. **Hover tooltip is custom-built, not the native SVG `<title>`** — a
  first pass used `<title>`, which has a noticeable OS-level delay before appearing and
  can't be styled; `DonutChart` now tracks `onMouseMove`/`onMouseLeave` per segment into
  local state and renders its own small floating card (colored dot + name + value,
  `pointer-events: none`, positioned via `getBoundingClientRect()` off a wrapping
  `position: relative` container) that appears the instant the cursor moves over that arc.
  The center always shows just the
  **total** pending count (`DonutChart`'s `centerValue` prop), never a per-segment number —
  keeps the card readable at a glance while the breakdown is still one hover away. Clicking
  the card drills into `/checklist/dashboard/:doerId` when there's exactly one doer.
  **Every other department card (`OTHER_DEPARTMENTS`: Design, HR, JM, Purchasing,
  Management, Sale, Store, System, Quality ×2, Admin) renders blank** — a flat gray ring, no
  number — since none of those departments has a real sheet/routing built yet (see "What it
  is" above). **Do not fabricate numbers for these** — an earlier version hardcoded the old
  reference's example numbers as if they were real data and was deliberately reverted to
  blank; wire a real query in for a department (same shape as the Account card) only once
  that department's own backend route actually exists. `DonutChart.tsx` is the reusable
  pure-SVG donut behind every card (no charting library) — zero/empty segments render the
  flat gray ring. No in-page `<h2>` title — same breadcrumb-only convention as Assigned
  Checklist above.

  **`GET /admin/dashboard`'s pending definition must match `GET /tasks/mine`'s** — Status
  blank **and** `isDueNow(Planned)` (due today or overdue), not a bare blank-Status check.
  An earlier version of this route only checked Status, which counted every future-dated
  instance the recurrence engine has already bulk-generated (weeks/months ahead) as
  "pending," wildly inflating the dashboard's numbers past what's actually due — the exact
  bug class `isDueNow()`/`parsePlannedDate()` (see above) already exists to prevent
  elsewhere. Fixed to reuse the same `isDueNow()` check.
- `/checklist/dashboard/:doerId` → `DoerPendingList.tsx` — admin-only, one doer's pending
  tasks (`GET /admin/pending/:doerId`), "Update Remark" opens `FollowUpForm.tsx`
  (`POST /checklist/tasks/:taskId/followup`).

`Frontend/src/checklist/lib/checklistApi.ts` — the API client for all of the above.

Sidebar nav (`Layout.tsx`): admin-only sub-links are shown indented under Checklist **only
while inside the app** and only if `GET /checklist/admin/check` says `isAdmin: true`. Each
carries a distinct icon matching the old AppSheet reference's own icon for that view (not
the generic `AppSectionIcon` every top-level app section uses) — `EyeIcon` for "Assigned
Checklist", `DashboardMonitorIcon` for "Dashboard" (label shortened from "Dashboard -
Pending Checklist" to just "Dashboard" in the sidebar only; the breadcrumb/page title still
reads the full name via `CHECKLIST_SEGMENT_LABELS`). Indented sub-nav items render their
icon like every other nav item now — an earlier version of `navItems.map()` hid the icon
whenever `item.indent` was set (`{!item.indent && <Icon />}`), which is why these sub-links
used to show as text-only; don't reintroduce that condition.
