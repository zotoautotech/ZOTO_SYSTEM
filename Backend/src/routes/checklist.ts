import { randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { appendRow, readTable, updateRow, type SheetRow } from "../services/sheets.js";
import { requireAuth, requireModule } from "../middleware/auth.js";
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

checklistRouter.use(requireAuth, requireModule("checklist"));

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

/** Formats a "days/hours overdue" style string from Planned -> now, matching the old
 * AppSheet "Delay Duration" virtual column (=NOW()-[Planned]) shown on the CHECKLIST
 * Account pending view. Blank once the task instance has no Planned date at all. */
function delayDuration(planned: string): string {
  if (!planned) return "";
  const plannedMs = Date.parse(planned);
  if (Number.isNaN(plannedMs)) return "";
  const diffMs = Date.now() - plannedMs;
  if (diffMs <= 0) return "On Time";
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

/** GET /checklist/tasks/mine?status=COMPLETED — the logged-in doer's own task instances from
 * Master Accounts, filtered by their Email (never a client-side filter). Pending = Status
 * blank; Completed = Status set (Done/Rejected/leave types). FULL_NAME and DELAY_DURATION
 * are synthesized here — they're virtual/formula columns in the old AppSheet schema (Full
 * Name = lookup from Doer List by Email, Delay Duration = NOW()-Planned), never physical
 * Master Accounts columns, matching the old app's "CHECKLIST Account" pending view exactly
 * (ColumnOrder: Full Name, Task, Delay Duration, Planned, Task Frequency — its own
 * "Pending Status" entry is a dead reference, no such Master Accounts column exists). */
checklistRouter.get("/tasks/mine", async (req, res, next) => {
  try {
    const employeeId = req.user!.employeeId.trim();
    const wantCompleted = req.query.status === "COMPLETED";
    const fullName = await getDoerDisplayName(employeeId);

    const rows: SheetRow[] = (await readTable(env.sheets.checklistAccounts, MASTER_ACCOUNTS_TAB))
      .map(masterAccountsFromSheet)
      .filter((r) => r.EMAIL?.trim() === employeeId)
      .filter((r) => (wantCompleted ? !!r.STATUS?.trim() : !r.STATUS?.trim()))
      .map((r): SheetRow => ({ ...r, FULL_NAME: fullName, DELAY_DURATION: delayDuration(r.PLANNED) }));

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
