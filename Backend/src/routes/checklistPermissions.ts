import { env } from "../config/env.js";
import { readTable } from "../services/sheets.js";

const USERS_TAB = "USERS";

/**
 * The Checklist app has its OWN Users/Permissions tab — a "USERS" tab inside
 * ZOTO/CHECKLIST MASTER-FY26-27 itself (Employee Id/Name/Permissions_Process/CAN_ADD/
 * CAN_EDIT/CAN_DELETE), separate from the Sales CRR USERS tab that gates the base
 * `requireModule("checklist")` login/module check. Per the user's explicit decision this
 * app has its own permissions even though it shares the same login session — this is the
 * source of that. Only "Admin" here (not the Sales CRR sheet's Admin flag) unlocks the
 * admin-only views: Assigned Checklist (all doers' punched templates), the pending
 * dashboard, and follow-up remarks.
 */
export async function isChecklistAdmin(employeeId: string): Promise<boolean> {
  const rows = await readTable(env.sheets.checklistMaster, USERS_TAB, { ttlMs: 15_000 });
  const user = rows.find(
    (r) => r["Employee Id"]?.trim().toLowerCase() === employeeId.trim().toLowerCase()
  );
  const perms = (user?.Permissions_ ?? user?.["Permissions_Process"] ?? "").trim().toLowerCase();
  return perms === "admin";
}
