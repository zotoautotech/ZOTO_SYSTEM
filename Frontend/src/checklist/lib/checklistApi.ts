import { api } from "../../lib/api";

export interface DoerRecord {
  EMP_ID: string;
  NAME: string;
  EMAIL: string;
  DESIGNATION: string;
  DEPARTMENT: string;
  EMPLOYEE_STATUS: string;
}

export interface ChecklistTaskRecord {
  EMAIL: string;
  TASK_ID: string;
  FREQUENCY: string;
  TASK: string;
  PLANNED: string;
  ACTUAL: string;
  STATUS: string;
  ATTACHMENT: string;
  REMARKS: string;
  DELAY: string;
  DELAY_STATUS: string;
  ATTACHMENT_FILE: string;
  DELETE_STATUS: string;
  TASK_LIST_ID: string;
  /** `NOW() - Planned` in milliseconds as a string (backend-computed, IST-aware — see
   * checklist.ts's delayMs()/parsePlannedDate()) — positive once overdue, negative while
   * there's still time before the deadline. Feed this to getDelayColor(), don't re-parse
   * PLANNED client-side. */
  DELAY_MS: string;
  [key: string]: string;
}

export async function listDoers() {
  const res = await api.get<{ doers: DoerRecord[] }>("/checklist/doers");
  return res.data.doers;
}

export interface PunchTaskPayload {
  task: string;
  doerId: string;
  department: string;
  frequency: string;
  dayDate: string;
  times?: string;
  endDate?: string;
}

export async function punchTask(payload: PunchTaskPayload) {
  const res = await api.post<{ uniqueId: string }>("/checklist/tasks", payload);
  return res.data;
}

export async function listMyTasks(status?: "COMPLETED") {
  const res = await api.get<{ tasks: ChecklistTaskRecord[] }>("/checklist/tasks/mine", {
    params: status ? { status } : undefined,
  });
  return res.data.tasks;
}

// TEMPORARY — remove once the per-doer scoping mismatch is confirmed fixed (see
// checklist.ts's matching _debugEmployeeId/_debugIsAdmin fields). Surfaces exactly what
// employeeId/admin flag the server resolved for the current session, visible in the UI
// without needing DevTools.
export async function listMyTasksDebug(status?: "COMPLETED") {
  const res = await api.get<{ tasks: ChecklistTaskRecord[]; _debugEmployeeId: string; _debugIsAdmin: boolean }>(
    "/checklist/tasks/mine",
    { params: status ? { status } : undefined }
  );
  return res.data;
}

export interface CompleteTaskPayload {
  status: string;
  attachment: "Yes" | "No";
  remarks?: string;
  attachmentFileId?: string;
}

export async function completeTask(taskId: string, payload: CompleteTaskPayload) {
  const res = await api.post(`/checklist/tasks/${encodeURIComponent(taskId)}/complete`, payload);
  return res.data;
}

// --- Admin-only (gated server-side by the Checklist app's own USERS tab) ---

export async function checkIsChecklistAdmin() {
  const res = await api.get<{ isAdmin: boolean }>("/checklist/admin/check");
  return res.data.isAdmin;
}

export interface AssignedTaskRecord {
  FULL_NAME: string;
  DOER: string;
  TASK: string;
  FREQUENCY: string;
  DAY_DATE: string;
}

export async function listAssignedChecklist() {
  const res = await api.get<{ tasks: AssignedTaskRecord[] }>("/checklist/admin/assigned");
  return res.data.tasks;
}

export interface DashboardDoerEntry {
  doerId: string;
  fullName: string;
  count: number;
}

export async function listDashboard() {
  const res = await api.get<{ doers: DashboardDoerEntry[] }>("/checklist/admin/dashboard");
  return res.data.doers;
}

export async function listPendingForDoer(doerId: string) {
  const res = await api.get<{ tasks: ChecklistTaskRecord[] }>(
    `/checklist/admin/pending/${encodeURIComponent(doerId)}`
  );
  return res.data.tasks;
}

export interface FollowUpPayload {
  remarks: string;
  imageFileId?: string;
  fileFileId?: string;
}

export async function submitFollowUp(taskId: string, payload: FollowUpPayload) {
  const res = await api.post(`/checklist/tasks/${encodeURIComponent(taskId)}/followup`, payload);
  return res.data;
}

/** Old AppSheet reference's own Delay Duration conditional-format rule, ported literally:
 * `SHOW YELLOW WHEN AND([Delay Duration] > "-000:15:00", [Delay Duration] <= "000:00:00")`,
 * `SHOW RED WHEN [Delay Duration] > "000:00:00"` — i.e. yellow inside the 15-minute window
 * before the deadline, red once actually overdue, no color otherwise. Reads the backend's
 * pre-computed `DELAY_MS` (see checklistApi's `ChecklistTaskRecord.DELAY_MS` doc) rather
 * than re-parsing `PLANNED` here — that parsing is IST-timezone-sensitive (see
 * `Backend/src/routes/checklist.ts`'s `parsePlannedDate()`), and duplicating it client-side
 * would just be a second place for that exact bug class to reappear. */
export function getDelayColor(delayMsRaw: string | undefined): string | undefined {
  if (!delayMsRaw) return undefined;
  const delayMs = Number(delayMsRaw);
  if (Number.isNaN(delayMs)) return undefined;
  const FIFTEEN_MIN_MS = 15 * 60 * 1000;
  if (delayMs > 0) return "var(--color-error)"; // the app's one established red/error token
  if (delayMs > -FIFTEEN_MIN_MS) return "#b98900"; // no --color-warning token exists yet
  return undefined;
}
