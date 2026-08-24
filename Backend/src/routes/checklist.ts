import { randomBytes } from "node:crypto";
import { NextFunction, Request, Response, Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { appendRow, readTable, updateRow, type SheetRow } from "../services/sheets.js";
import { requireAuth } from "../middleware/auth.js";
import { hasChecklistAccess, isChecklistAdmin } from "./checklistPermissions.js";
import {
  doerFromSheet,
  masterAccountsFromSheet,
  masterAccountsToSheet,
  taskListMasterToSheet,
} from "./checklistMap.js";

export const checklistRouter = Router();

const TASK_LIST_MASTER_TAB = "Task List Master";
const DOER_LIST_TAB = "Doer List";
const MASTER_ACCOUNTS_TAB = "Master Accounts";
const PC_FOLLOWUP_TAB = "PcFollowUp";
const NOTEPAD_REPORT_TAB = "Doer wise Notepad report";

/** Base access to /checklist/* — gated by the Checklist app's OWN sheet
 * (checklistPermissions.ts's hasChecklistAccess), not the generic Sales CRR
 * requireModule("checklist"). Per explicit user decision: that sheet's own
 * Permissions_Process is this app's authoritative "child" permission — see
 * checklistPermissions.ts's own doc comment for why this replaced the earlier
 * requireModule("checklist") gate. */
async function requireChecklistAccess(req: Request, res: Response, next: NextFunction) {
  try {
    const allowed = await hasChecklistAccess(req.user!.employeeId);
    if (!allowed) {
      return res.status(403).json({ error: { code: "FORBIDDEN", message: "No access to Checklist" } });
    }
    next();
  } catch (err) {
    next(err);
  }
}

checklistRouter.use(requireAuth, requireChecklistAccess);

/** Gates the three admin-only views (Assigned Checklist, pending dashboard, follow-up
 * remarks) behind the Checklist app's own USERS tab — see checklistPermissions.ts. */
async function requireChecklistAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const admin = await isChecklistAdmin(req.user!.employeeId);
    if (!admin) {
      return res.status(403).json({ error: { code: "FORBIDDEN", message: "Admin only" } });
    }
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * The old AppSheet schema keyed everything (Doer, Task Allotter, Master Accounts' Email
 * column) off USEREMAIL() — but the live Employee Master's Email column turned out to be
 * genuinely empty for every employee (confirmed directly against the sheet, not assumed).
 * The Apps Script routing/recurrence pipeline never validates or parses this value — it
 * just copies whatever string sits in Task List Master's "Doer" column straight through
 * into Master Accounts' "Email" column — so any stable per-doer identifier works. This app
 * uses the doer's own Employee Id (ZOTO login id, always populated) instead of an email
 * everywhere a "doer email" would have gone. Keeping the sheet's own column name ("Email")
 * unchanged — only what value gets written into it changed.
 */

/** Full Name + Designation for display, looked up from Doer List by Employee Id. Falls back
 * to the bare Employee Id if the doer isn't found there (display-only, never blocks anything). */
async function getDoerDisplayName(employeeId: string): Promise<string> {
  const doers = (await readTable(env.sheets.checklistMaster, DOER_LIST_TAB)).map(doerFromSheet);
  const doer = doers.find((d) => d.EMP_ID?.trim() === employeeId.trim());
  return doer ? `${doer.NAME} (${doer.DESIGNATION})` : employeeId;
}

/** Issues a "UNQ-<8 random hex chars>" id, checked against existing Unique ID values in
 * Task List Master — same random-id + collision-check convention as services/ids.ts's
 * nextIds(), just parameterized by spreadsheetId since that helper hardcodes the
 * Sales-CRR transactions sheet and can't target the Checklist spreadsheet. */
async function nextUniqueId(): Promise<string> {
  const rows = await readTable(env.sheets.checklistMaster, TASK_LIST_MASTER_TAB);
  const existing = new Set(rows.map((r) => r["Unique ID"]));
  let candidate = `UNQ-${randomBytes(4).toString("hex")}`;
  while (existing.has(candidate)) {
    candidate = `UNQ-${randomBytes(4).toString("hex")}`;
  }
  return candidate;
}

/** GET /checklist/doers — the Doer List tab (already fed live from Employee Master). */
checklistRouter.get("/doers", async (_req, res, next) => {
  try {
    const rows = (await readTable(env.sheets.checklistMaster, DOER_LIST_TAB)).map(doerFromSheet);
    res.json({ doers: rows.filter((d) => d.EMP_ID) });
  } catch (err) {
    next(err);
  }
});

const punchTaskSchema = z.object({
  task: z.string().min(1),
  doerId: z.string().min(1),
  department: z.string().min(1),
  frequency: z.enum(["D", "W", "M", "Y", "Q", "F", "E1st", "E2nd", "E3rd", "E4th", "ELast"]),
  dayDate: z.string().min(1),
  times: z.union([z.string(), z.number()]).optional(),
  endDate: z.string().optional(),
});

/** POST /checklist/tasks — punches a new task template into Task List Master. The existing
 * Apps Script trigger (onChangeHANDLER -> sentdata_allchecklist_deptwise, untouched) picks
 * this row up on its own and routes/expands it — this route never touches TRANSFER STATUS,
 * recurrence, or routing itself. */
checklistRouter.post("/tasks", async (req, res, next) => {
  try {
    const body = punchTaskSchema.parse(req.body);
    const uniqueId = await nextUniqueId();
    const now = new Date().toISOString();

    await appendRow(
      env.sheets.checklistMaster,
      TASK_LIST_MASTER_TAB,
      taskListMasterToSheet({
        TASK: body.task,
        DEPARTMENT: body.department,
        DOER: body.doerId,
        FREQUENCY: body.frequency,
        DAY_DATE: body.dayDate,
        UNIQUE_ID: uniqueId,
        TASK_ALLOTTER: req.user!.employeeId,
        TIMESTAMP: now,
        TASK_DATATIME: now,
        TIMES: body.times !== undefined ? String(body.times) : "",
        END_DATE: body.endDate ?? "",
        // TRANSFER STATUS deliberately left blank — the Apps Script trigger uses a blank
        // value here to know this row hasn't been routed to the department sheet yet.
      })
    );

    res.status(201).json({ uniqueId });
  } catch (err) {
    next(err);
  }
});

/** Every Planned/date-ish cell in this sheet is entered as IST wall-clock time (ZOTO is an
 * Indian company) — but Vercel's Node runtime defaults to UTC, so `new Date(y, m, d, h, mi,
 * s)` (which interprets its arguments in the *server's* local timezone) silently reads a
 * sheet value like "20/08/2026 09:40:00 IST" as if it were 09:40 UTC instead of the true
 * 04:10 UTC — a 5.5-hour error that can make an already-overdue task look "not due yet" for
 * hours after IST midnight, or the reverse near IST evening. `IST_OFFSET_MS` corrects this:
 * build the wall-clock value as if it were UTC (`Date.UTC`, unambiguous, no server-timezone
 * dependency) then subtract the offset to land on the real UTC instant that IST moment
 * actually is. Every Planned-date comparison in this file must go through here — never
 * `new Date(y, m, d, ...)` / bare `Date.parse` directly on a sheet value again. */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Google Sheets returns date/datetime cell values as plain text, but NOT always in one
 * consistent format — some rows come back as an ISO-ish string `Date.parse` can read fine
 * ("2026-01-09T10:56:00"), others as a locale-formatted "DD/MM/YYYY HH:mm:ss" plain string
 * (this spreadsheet's own locale is en-GB, day-first) that `Date.parse` either can't read at
 * all (returns NaN) or — worse — silently misreads as MM/DD (JS assumes US month-first for
 * ambiguous slash dates), which would flip e.g. 13/10 into a parse failure but 09/01 into
 * "September 1st" instead of the real "9th January". A row that isDueNow() couldn't parse
 * was being treated as "always due" as a fail-safe, which is exactly how November/December/
 * future-dated rows leaked into the pending list — the fail-safe fired on every row in the
 * locale format, not just genuinely blank ones. Explicit day-first parsing fixes both bugs
 * at once instead of trusting Date.parse's ambiguous guessing. Both branches below build the
 * instant via `Date.UTC` + `IST_OFFSET_MS`, not the server-local `new Date(...)`/bare
 * `Date.parse` — see that constant's own comment for why. */
function parsePlannedDate(planned: string): number | null {
  if (!planned) return null;

  const dayFirst = planned.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(am|pm))?$/i
  );
  if (dayFirst) {
    const [, dd, mm, yyyy, hRaw, min, sec, ampm] = dayFirst;
    let hour = Number(hRaw);
    if (ampm) {
      const isPm = ampm.toLowerCase() === "pm";
      if (isPm && hour < 12) hour += 12;
      if (!isPm && hour === 12) hour = 0;
    }
    const ms =
      Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), hour, Number(min), Number(sec ?? 0)) - IST_OFFSET_MS;
    return Number.isNaN(ms) ? null : ms;
  }

  // ISO-ish strings from Sheets ("2026-01-09T10:56:00") carry no timezone suffix, so they're
  // still an IST wall-clock value, not UTC — same correction applies. A string that DOES
  // carry an explicit offset/`Z` (rare from this source, but possible) is trusted as-is.
  const hasExplicitOffset = /Z$|[+-]\d{2}:?\d{2}$/.test(planned.trim());
  if (hasExplicitOffset) {
    const parsed = Date.parse(planned);
    return Number.isNaN(parsed) ? null : parsed;
  }
  const isoMatch = planned.match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/
  );
  if (isoMatch) {
    const [, yyyy, mm, dd, hh, min, sec] = isoMatch;
    const ms =
      Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min), Number(sec ?? 0)) -
      IST_OFFSET_MS;
    return Number.isNaN(ms) ? null : ms;
  }

  const parsed = Date.parse(planned);
  return Number.isNaN(parsed) ? null : parsed;
}

/** End of "today" (IST calendar day) as a real UTC instant — the boundary isDueNow() checks
 * against. Built the same way parsePlannedDate() builds any IST wall-clock instant: read
 * today's Y/M/D as IST fields (by adding IST_OFFSET_MS before using the UTC getters, the
 * same "fake UTC" trick), find the start of tomorrow in that IST timeline via Date.UTC, then
 * subtract IST_OFFSET_MS to land back on the real UTC instant — minus 1ms for the last
 * instant of today rather than the first instant of tomorrow. */
function endOfTodayIstMs(): number {
  const nowIst = new Date(Date.now() + IST_OFFSET_MS);
  const startOfTomorrowIst = Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth(), nowIst.getUTCDate() + 1);
  return startOfTomorrowIst - IST_OFFSET_MS - 1;
}

/** Pending = Status blank AND Planned falls today or earlier (IST calendar day) — not just
 * "the exact time has already passed". A task scheduled for later this afternoon is still
 * shown now (so a doer sees their whole day's list at a glance, not just what's already
 * overdue), it just won't be colored red/yellow yet — see getDelayColor() on the frontend,
 * which reads DELAY_MS and only colors once actually within 15 min of due or overdue. The
 * recurrence engine bulk-generates every instance for a task's whole range up front, so
 * "pending" still can't mean "no status yet" or a doer's queue would flood with tasks
 * scheduled weeks ahead — this only pulls the boundary in to "today", not further. A row
 * with no parseable Planned date is treated as due (shows up) rather than silently hidden —
 * but see parsePlannedDate() above for why "unparseable" must be judged correctly first. */
function isDueNow(planned: string): boolean {
  const plannedMs = parsePlannedDate(planned);
  if (plannedMs === null) return true;
  return plannedMs <= endOfTodayIstMs();
}

/** True only when Planned falls on TODAY's own IST calendar date — narrower than isDueNow()
 * (which also matches anything overdue from earlier days). Used by the Today's Update
 * button below, which should summarize just today's tasks, not roll in every stale overdue
 * task from previous days too. A row with no parseable Planned date is excluded (unlike
 * isDueNow's fail-open "treat as due") since there's no date to call "today" here. */
function isPlannedToday(planned: string): boolean {
  const plannedMs = parsePlannedDate(planned);
  if (plannedMs === null) return false;
  const startOfTodayIst = endOfTodayIstMs() - 24 * 60 * 60 * 1000 + 1;
  return plannedMs >= startOfTodayIst && plannedMs <= endOfTodayIstMs();
}

/** Raw `NOW() - Planned` in milliseconds — positive once overdue, negative while there's
 * still time before the deadline, `null` when unparseable. This is what the frontend's
 * Delay Duration color rule (yellow within 15 min of due, red once overdue — the old
 * AppSheet reference's own conditional-format rule, ported literally) keys off, rather than
 * re-parsing `Planned` a second time client-side — this file already owns the one correct,
 * IST-aware parse (see `parsePlannedDate()`/`IST_OFFSET_MS`); duplicating that logic in the
 * frontend would just be a second place for the exact timezone bug fixed above to recur. */
function delayMs(planned: string): number | null {
  const plannedMs = parsePlannedDate(planned);
  return plannedMs === null ? null : Date.now() - plannedMs;
}

/** Formats a "days/hours overdue" style string from Planned -> now, matching the old
 * AppSheet "Delay Duration" virtual column (=NOW()-[Planned]) shown on the CHECKLIST
 * Account pending view. Blank once the task instance has no parseable Planned date. */
function delayDuration(planned: string): string {
  const plannedMs = parsePlannedDate(planned);
  if (plannedMs === null) return "";
  const diffMs = Date.now() - plannedMs;
  if (diffMs <= 0) return "On Time";
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

/** GET /checklist/tasks/mine?status=COMPLETED — the DEPARTMENT'S whole task-instance queue
 * from Master Accounts, not filtered to just the logged-in user. Confirmed directly against
 * the old AppSheet reference (previewed as both an admin email and a regular doer email —
 * both saw the exact same full list) that "CHECKLIST Account" is a shared department-wide
 * board, not a personal inbox: the old Show_If only gated whether the *menu item* appeared
 * (department match or an admin-email allowlist), never which *rows* a viewer could see.
 * Endpoint path kept as "mine" to avoid a wider rename; the name no longer reflects a
 * per-user filter. Pending = Status blank + due now (Planned <= today, see isDueNow — the
 * recurrence engine bulk-generates weeks/months of future rows up front, so "pending" can't
 * just mean "no status yet"); Completed = Status set (Done/Rejected/leave types), no date
 * filter. FULL_NAME and DELAY_DURATION are synthesized per row — they're virtual/formula
 * columns in the old schema (Full Name = lookup from Doer List by Email, Delay Duration =
 * NOW()-Planned) — looked up per row now since rows span every doer, not the caller alone.
 *
 * SUPERSEDES the department-wide-shared-queue behavior this endpoint used to have: a
 * non-admin doer now only sees their OWN rows (`EMAIL === req.user.employeeId`), Admin
 * (per `isChecklistAdmin`) still sees every doer's rows — an explicit, deliberate change
 * from the earlier "confirmed against the old AppSheet reference" shared-board design (see
 * docs/CHECKLIST.md). Don't revert this without checking that doc/the user again first. */
checklistRouter.get("/tasks/mine", async (req, res, next) => {
  try {
    const wantCompleted = req.query.status === "COMPLETED";
    const [nameLookup, admin] = await Promise.all([buildDoerNameLookup(), isChecklistAdmin(req.user!.employeeId)]);
    const employeeId = req.user!.employeeId.trim();

    const rows: SheetRow[] = (await readTable(env.sheets.checklistAccounts, MASTER_ACCOUNTS_TAB))
      .map(masterAccountsFromSheet)
      .filter((r) => (wantCompleted ? !!r.STATUS?.trim() : !r.STATUS?.trim() && isDueNow(r.PLANNED)))
      .filter((r) => admin || r.EMAIL?.trim() === employeeId)
      .map((r): SheetRow => ({
        ...r,
        FULL_NAME: nameLookup.get(r.EMAIL?.trim() ?? "") ?? r.EMAIL ?? "",
        DELAY_DURATION: delayDuration(r.PLANNED),
        DELAY_MS: String(delayMs(r.PLANNED) ?? ""),
      }));

    rows.sort((a, b) => (a.PLANNED ?? "").localeCompare(b.PLANNED ?? ""));
    res.json({ tasks: rows });
  } catch (err) {
    next(err);
  }
});

const completeTaskSchema = z.object({
  status: z.enum(["Done", "Rejected", "Full Day Leave", "First Half Leave", "Second Half Leave"]),
  attachment: z.enum(["Yes", "No"]),
  remarks: z.string().optional(),
  attachmentFileId: z.string().optional(),
});

/** POST /checklist/tasks/:taskId/complete — updates the doer's own Master Accounts row
 * (matched by Task ID) with their completion decision. Only ever touches this one row —
 * never Task List Accounts or the recurrence/routing machinery. */
checklistRouter.post("/tasks/:taskId/complete", async (req, res, next) => {
  try {
    const body = completeTaskSchema.parse(req.body);
    const { taskId } = req.params;

    await updateRow(
      env.sheets.checklistAccounts,
      MASTER_ACCOUNTS_TAB,
      "Task ID",
      taskId,
      masterAccountsToSheet({
        STATUS: body.status,
        ATTACHMENT: body.attachment,
        REMARKS: body.remarks ?? "",
        ATTACHMENT_FILE: body.attachmentFileId ?? "",
        ACTUAL: new Date().toISOString(),
      })
    );

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/** Builds an Employee Id -> "Name (Designation)" lookup once per request, reused across
 * every row instead of re-reading Doer List per row (the admin endpoints below iterate
 * every doer, not just one). */
async function buildDoerNameLookup(): Promise<Map<string, string>> {
  const doers = (await readTable(env.sheets.checklistMaster, DOER_LIST_TAB)).map(doerFromSheet);
  const lookup = new Map<string, string>();
  for (const d of doers) {
    if (d.EMP_ID) lookup.set(d.EMP_ID.trim(), `${d.NAME} (${d.DESIGNATION})`);
  }
  return lookup;
}

/** GET /checklist/admin/check — lets the frontend know whether to show the admin-only nav
 * (Assigned Checklist / Dashboard) without needing to actually load an admin page first. */
checklistRouter.get("/admin/check", async (req, res, next) => {
  try {
    const admin = await isChecklistAdmin(req.user!.employeeId);
    res.json({ isAdmin: admin });
  } catch (err) {
    next(err);
  }
});

/** GET /checklist/admin/assigned — every punched task template across every doer (admin
 * only), matching the old AppSheet "Assigned Checklist" view (ColumnOrder: Full Name, Task,
 * Frequency, Day/Date, Doer — grouped by Full Name). Reads Task List Master directly, not
 * Master Accounts, since this is the template list, not generated instances. */
checklistRouter.get("/admin/assigned", requireChecklistAdmin, async (_req, res, next) => {
  try {
    const [rows, nameLookup] = await Promise.all([
      readTable(env.sheets.checklistMaster, TASK_LIST_MASTER_TAB),
      buildDoerNameLookup(),
    ]);

    const tasks = rows
      .filter((r) => r.Task)
      .map((r) => ({
        FULL_NAME: nameLookup.get((r.Doer ?? "").trim()) ?? r.Doer ?? "",
        DOER: r.Doer ?? "",
        TASK: r.Task ?? "",
        FREQUENCY: r.Frequency ?? "",
        DAY_DATE: r["Day/Date"] ?? "",
      }));

    tasks.sort((a, b) => a.FULL_NAME.localeCompare(b.FULL_NAME));
    res.json({ tasks });
  } catch (err) {
    next(err);
  }
});

/** GET /checklist/admin/dashboard — pending task-instance count per doer (admin only),
 * matching the old "Dashboard - Pending Checklist" donut view's underlying data (a doer ->
 * count breakdown). One donut per department was the old app's own visual layout; this
 * app has only Accounts built so far, so this is a flat per-doer list — extend once more
 * departments exist. */
checklistRouter.get("/admin/dashboard", requireChecklistAdmin, async (_req, res, next) => {
  try {
    const [rows, nameLookup] = await Promise.all([
      readTable(env.sheets.checklistAccounts, MASTER_ACCOUNTS_TAB).then((rows) => rows.map(masterAccountsFromSheet)),
      buildDoerNameLookup(),
    ]);

    const counts = new Map<string, number>();
    for (const r of rows) {
      // Same "pending" definition as GET /tasks/mine: Status blank AND due now (Planned <=
      // today) — a bare blank-Status check (the old behavior here) counted every future-
      // dated instance the recurrence engine has already bulk-generated too, inflating the
      // dashboard number far past what's actually due.
      if (r.STATUS?.trim() || !isDueNow(r.PLANNED)) continue;
      const key = r.EMAIL?.trim();
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const doers = Array.from(counts.entries())
      .map(([doerId, count]) => ({ doerId, fullName: nameLookup.get(doerId) ?? doerId, count }))
      .sort((a, b) => b.count - a.count);

    res.json({ doers });
  } catch (err) {
    next(err);
  }
});

/** GET /checklist/admin/pending/:doerId — one doer's pending task instances, for admins
 * drilling into a dashboard entry (same shape as GET /tasks/mine's pending branch, just
 * parameterized by an arbitrary doer instead of the logged-in user). */
checklistRouter.get("/admin/pending/:doerId", requireChecklistAdmin, async (req, res, next) => {
  try {
    const { doerId } = req.params;
    const fullName = await getDoerDisplayName(doerId);

    const rows: SheetRow[] = (await readTable(env.sheets.checklistAccounts, MASTER_ACCOUNTS_TAB))
      .map(masterAccountsFromSheet)
      .filter((r) => r.EMAIL?.trim() === doerId && !r.STATUS?.trim() && isDueNow(r.PLANNED))
      .map(
        (r): SheetRow => ({
          ...r,
          FULL_NAME: fullName,
          DELAY_DURATION: delayDuration(r.PLANNED),
          DELAY_MS: String(delayMs(r.PLANNED) ?? ""),
        })
      );

    rows.sort((a, b) => (a.PLANNED ?? "").localeCompare(b.PLANNED ?? ""));
    res.json({ tasks: rows });
  } catch (err) {
    next(err);
  }
});

const followUpSchema = z.object({
  remarks: z.string().min(1),
  imageFileId: z.string().optional(),
  fileFileId: z.string().optional(),
});

/** POST /checklist/tasks/:taskId/followup — admin-only "Update Remark" action, writes a
 * row to the PcFollowUp tab (Basic Details/Timestamp/Useremail/Remark ID/Task ID/Task List
 * id/Assignee Name/FollowUp Detail/Remarks/Image/File — headers dumped directly off the
 * live sheet). Never touches Master Accounts itself — this is a separate audit-trail log,
 * same append-only convention as Order Punch Discount in the Sales CRR app. */
checklistRouter.post("/tasks/:taskId/followup", requireChecklistAdmin, async (req, res, next) => {
  try {
    const body = followUpSchema.parse(req.body);
    const { taskId } = req.params;

    const task = (await readTable(env.sheets.checklistAccounts, MASTER_ACCOUNTS_TAB)).find(
      (r) => r["Task ID"] === taskId
    );
    if (!task) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Task not found" } });
    }

    const fullName = await getDoerDisplayName(task.Email ?? "");
    const remarkId = `RMK-${randomBytes(4).toString("hex")}`;

    await appendRow(env.sheets.checklistMaster, PC_FOLLOWUP_TAB, {
      Timestamp: new Date().toISOString(),
      Useremail: req.user!.employeeId,
      "Remark ID": remarkId,
      "Task ID": taskId,
      "Task List id": task["Task List id"] ?? "",
      "Assignee Name": fullName,
      "FollowUp Detail": body.remarks,
      Remarks: body.remarks,
      Image: body.imageFileId ?? "",
      File: body.fileFileId ?? "",
    });

    res.status(201).json({ remarkId });
  } catch (err) {
    next(err);
  }
});

/** Builds the "Today's Update" text: every one of the logged-in doer's own task instances
 * whose Planned falls on today's IST calendar date (isPlannedToday, not isDueNow — this
 * report is specifically about today, not a rolling overdue list), split into Completed vs
 * Pending sections. Shared by both routes below so the GET preview and the POST save always
 * see identical wording. */
async function buildTodayReportText(employeeId: string): Promise<string> {
  const rows = (await readTable(env.sheets.checklistAccounts, MASTER_ACCOUNTS_TAB))
    .map(masterAccountsFromSheet)
    .filter((r) => r.EMAIL?.trim() === employeeId && isPlannedToday(r.PLANNED));

  const completed = rows.filter((r) => r.STATUS?.trim());
  const pending = rows.filter((r) => !r.STATUS?.trim());

  const todayIst = new Date(Date.now() + IST_OFFSET_MS);
  const dateLabel = `${String(todayIst.getUTCDate()).padStart(2, "0")}/${String(todayIst.getUTCMonth() + 1).padStart(2, "0")}/${todayIst.getUTCFullYear()}`;

  const lines: string[] = [`Today's Update - ${dateLabel}`, ""];
  lines.push(`Completed (${completed.length})`);
  if (completed.length === 0) lines.push("  —");
  else completed.forEach((r, i) => lines.push(`  ${i + 1}. ${r.TASK || "—"} (${r.STATUS})`));
  lines.push("");
  lines.push(`Pending (${pending.length})`);
  if (pending.length === 0) lines.push("  —");
  else pending.forEach((r, i) => lines.push(`  ${i + 1}. ${r.TASK || "—"}`));

  return lines.join("\n");
}

/** GET /checklist/today-report — auto-generates the update text (see buildTodayReportText
 * above) for the "Today's Update" button on MyTasksList.tsx to show in its notepad popup.
 * Read-only — nothing is written until the doer actually saves it via the POST below. */
checklistRouter.get("/today-report", async (req, res, next) => {
  try {
    const text = await buildTodayReportText(req.user!.employeeId.trim());
    res.json({ text });
  } catch (err) {
    next(err);
  }
});

const saveTodayReportSchema = z.object({ text: z.string().min(1) });

/** POST /checklist/today-report — appends the doer's (possibly hand-edited) report text as
 * one new row to "Doer wise Notepad report" — always a fresh append, never updates a prior
 * row, so re-saving the same day keeps a full history of each update rather than
 * overwriting the last one. "Doer" stores the Employee Id, matching every other "Doer"/
 * "Email" column in this app (Task List Master's Doer, Master Accounts' Email) — never a
 * display name. */
checklistRouter.post("/today-report", async (req, res, next) => {
  try {
    const body = saveTodayReportSchema.parse(req.body);
    await appendRow(env.sheets.checklistMaster, NOTEPAD_REPORT_TAB, {
      Doer: req.user!.employeeId,
      Timestemp: new Date().toISOString(),
      "Today Report": body.text,
    });
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});
