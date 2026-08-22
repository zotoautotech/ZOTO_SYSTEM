import { env } from "../config/env.js";
import { readTable } from "../services/sheets.js";

// Was "USERS" — the live sheet renamed this tab to "CHECKLIST USERS" (confirmed by
// dumping the live tab list directly, same discipline this project always uses rather than
// assuming a name still holds). This tab going unnoticed-renamed once already broke
// isChecklistAdmin() silently for every employee at once (readTable tolerates a missing tab
// by treating it as empty, so the lookup just found nobody and everyone's admin check quietly
// went from correct to always-false) — if this tab is ever renamed again, dump the live tab
// list before assuming this constant is still right.
const USERS_TAB = "CHECKLIST USERS";

/**
 * The Checklist app has its OWN Users/Permissions tab — a tab inside
 * ZOTO/CHECKLIST MASTER-FY26-27 itself (Employee Id/Name/Permissions_Process/CAN_ADD/
 * CAN_EDIT/CAN_DELETE). Per the user's explicit decision, THIS tab — not the Sales CRR
 * transactions sheet's own USERS tab — is the authoritative "child" permission for the
 * Checklist app: both whether an employee can use `/checklist/*` at all
 * (`hasChecklistAccess`, gating the router in `checklist.ts` in place of the generic
 * `requireModule("checklist")`) and whether they additionally unlock the admin-only views —
 * Assigned Checklist (all doers' punched templates), the pending dashboard, and follow-up
 * remarks (`isChecklistAdmin`). This was originally split the other way (base access gated
 * by the Sales CRR sheet, only the admin flag read from here) — that meant a doer could be
 * fully set up in this Checklist-specific sheet (`"Home,Checklist"`) while their *separate*
 * Sales CRR `Permissions_Process` simply never had `"Checklist"` added to it, 403ing every
 * `/checklist/*` call for them with no visible cause. Switched to this single source per
 * explicit user request once that drift was found (see docs/CHECKLIST.md and the Permission
 * Audit page, `Backend/src/routes/permissionAudit.ts`, whose own Checklist child-check
 * reads this same tab now, not the Sales CRR one, for the same reason).
 */
async function getChecklistPermissionTokens(employeeId: string): Promise<string[]> {
  const rows = await readTable(env.sheets.checklistMaster, USERS_TAB, { ttlMs: 15_000 });
  const user = rows.find(
    (r) => r["Employee Id"]?.trim().toLowerCase() === employeeId.trim().toLowerCase()
  );
  const raw = user?.Permissions_ ?? user?.["Permissions_Process"] ?? "";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Only "Admin" here unlocks the admin-only views. */
export async function isChecklistAdmin(employeeId: string): Promise<boolean> {
  const tokens = await getChecklistPermissionTokens(employeeId);
  return tokens.includes("admin");
}

/** Gates base access to `/checklist/*` — "Admin" or a literal "Checklist" token. */
export async function hasChecklistAccess(employeeId: string): Promise<boolean> {
  const tokens = await getChecklistPermissionTokens(employeeId);
  return tokens.includes("admin") || tokens.includes("checklist");
}
