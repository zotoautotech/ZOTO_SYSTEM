import type { SheetRow } from "../services/sheets.js";

/**
 * Header translation maps for the Checklist app's sheets, same convention as
 * orderPunchMap.ts — internal field names on the left (what API/frontend use), exact live
 * sheet header text on the right. Some headers here have apostrophes/slashes ("Remark's",
 * "Day/Date") that must match exactly.
 */

// ZOTO/CHECKLIST MASTER-FY2026-27 — "Task List Master" tab (the punch-in form target).
export const TASK_LIST_MASTER_MAP: Record<string, string> = {
  TASK: "Task",
  DEPARTMENT: "Department",
  DOER: "Doer",
  FREQUENCY: "Frequency",
  DAY_DATE: "Day/Date",
  UNIQUE_ID: "Unique ID",
  TASK_ALLOTTER: "Task Allotter",
  TASK_DELETER: "Task Deleter",
  DELETE_STATUS: "Delete Status",
  REASON: "Reason",
  TIMESTAMP: "Timestamp",
  DELETE_DONE: "Delete Done",
  TASK_DATATIME: "TASK DATATIME",
  TRANSFER_STATUS: "TRANSFER STATUS",
  STATUS: "Status",
  TIMES: "Times",
  END_DATE: "End Date",
};

// ZOTO/CHECKLIST MASTER-FY2026-27 — "Doer List" tab (already fed live from Employee Master
// via the ARRAYFORMULA set up earlier).
export const DOER_LIST_MAP: Record<string, string> = {
  EMP_ID: "EMP ID",
  NAME: "NAME",
  EMAIL: "EMAIL ID",
  DESIGNATION: "DESIGNATION",
  DEPARTMENT: "DEPARTMENT",
  EMPLOYEE_STATUS: "EMPLOYEE STATUS",
};

// ZOTO/CHECKLIST ACCOUNTS-FY2026-27 — "Master Accounts" tab (one row per generated task
// instance; this is what the doer actually reads/completes).
export const MASTER_ACCOUNTS_MAP: Record<string, string> = {
  EMAIL: "Email",
  TASK_ID: "Task ID",
  FREQUENCY: "Frequency",
  TASK: "Task",
  PLANNED: "Planned",
  ACTUAL: "Actual",
  STATUS: "Status",
  ATTACHMENT: "Attachment",
  REMARKS: "Remark's",
  DELAY: "Delay",
  DELAY_STATUS: "Delay Status",
  ATTACHMENT_FILE: "Attachment File",
  DELETE_STATUS: "Delete Status",
  TASK_LIST_ID: "Task List id",
};

function translate(record: SheetRow, map: Record<string, string>): SheetRow {
  const out: SheetRow = {};
  for (const [key, value] of Object.entries(record)) {
    const header = map[key];
    if (header) out[header] = value;
  }
  return out;
}

function reverseMap(map: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [internal, header] of Object.entries(map)) {
    if (!(header in out)) out[header] = internal;
  }
  return out;
}

function fromSheet(row: SheetRow, map: Record<string, string>): SheetRow {
  const headerToInternal = reverseMap(map);
  const out: SheetRow = {};
  for (const [header, value] of Object.entries(row)) {
    const internal = headerToInternal[header];
    if (internal) out[internal] = value;
  }
  return out;
}

export function taskListMasterToSheet(record: SheetRow): SheetRow {
  return translate(record, TASK_LIST_MASTER_MAP);
}

export function doerFromSheet(row: SheetRow): SheetRow {
  return fromSheet(row, DOER_LIST_MAP);
}

export function masterAccountsFromSheet(row: SheetRow): SheetRow {
  return fromSheet(row, MASTER_ACCOUNTS_MAP);
}

export function masterAccountsToSheet(record: SheetRow): SheetRow {
  return translate(record, MASTER_ACCOUNTS_MAP);
}
