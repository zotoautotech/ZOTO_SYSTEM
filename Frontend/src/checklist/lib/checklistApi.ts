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
