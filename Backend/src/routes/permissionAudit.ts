import { Router } from "express";
import { readTable } from "../services/sheets.js";
import { env } from "../config/env.js";
import { requireAuth } from "../middleware/auth.js";
import { getPermissions, parseModules } from "../services/permissions.js";
import { HOME_TAB, parseHomeAllowlist } from "./home.js";
import { hasChecklistAccess } from "./checklistPermissions.js";

export const permissionAuditRouter = Router();

const USERS_TAB = "USERS";

/** The two apps that currently have both halves of the parent/child relationship
 * populated — see docs/CHECKLIST.md and CLAUDE.md's Auth & Permissions section for the
 * full story. `homeNamePrefix` matches a `ZOTO HOME` row's `Name` (same
 * startsWith-"SALES CRR" convention `Frontend/src/pages/Home.tsx`'s `hrefFor()` already
 * uses to special-case the Sales CRR tile). `hasChildAccess` decides whether a given
 * employee would actually be able to use the app once inside it — each app reads its OWN
 * authoritative permission source, not necessarily the Sales CRR sheet:
 * - Sales CRR: the Sales CRR transactions sheet's own `USERS.Permissions_Process`, via the
 *   real `parseModules()` (never a second, hand-rolled parser that could drift from the
 *   actual `requireModule` gate). Any real module granted (or Admin/"ALL") counts, since
 *   no single "salescrr" module key survives `parseModules()` — it's a grouping label the
 *   parser deliberately strips.
 * - Checklist: the Checklist app's OWN sheet (`hasChecklistAccess`,
 *   `checklistPermissions.ts`) — this is the actual gate `/checklist/*` uses
 *   (`requireChecklistAccess` in `checklist.ts`), not the Sales CRR sheet. This was
 *   deliberately switched here (previously checked the Sales CRR sheet's
 *   `Permissions_Process` for a `"checklist"` token) once it was confirmed the Checklist
 *   app's own sheet is the actual source of truth its own gate reads — auditing against
 *   the Sales CRR sheet instead would talk past the real gate and could flag/miss the
 *   wrong things entirely.
 * Add a third entry here once another HOME app is real (not a "Coming Soon" placeholder) —
 * this stays a small, self-contained addition. */
const AUDITED_APPS: {
  app: string;
  homeNamePrefix: string;
  hasChildAccess: (employeeId: string, salesCrrUser: import("../services/sheets.js").SheetRow) => boolean | Promise<boolean>;
}[] = [
  {
    app: "Sales CRR",
    homeNamePrefix: "SALES CRR",
    hasChildAccess: (_employeeId, salesCrrUser) => {
      const modules = parseModules(salesCrrUser.Permissions_Process);
      return modules === "ALL" || modules.length > 0;
    },
  },
  {
    app: "Checklist",
    homeNamePrefix: "CHECKLIST",
    hasChildAccess: (employeeId) => hasChecklistAccess(employeeId),
  },
];

interface PermissionMismatch {
  employeeId: string;
  name: string;
  app: string;
  issue: "missing-child" | "missing-parent";
}

/** GET /api/v1/admin/permission-audit — read-only report of employees whose HOME tile
 * visibility (parent, `ZOTO HOME` sheet) and actual app access (child — each app's own
 * authoritative permission source, see `AUDITED_APPS` above) disagree. Admin-only (Sales
 * CRR `Permissions_Process` containing "Admin", i.e. `perms.modules === "ALL"` — this audit
 * spans apps, so it's gated on the Sales CRR Admin flag directly rather than any single
 * `requireModule` key). Purely informational — no edit affordance; the actual fix is still
 * hand-editing the relevant sheet cell, same as every other permission column in this app
 * (see CLAUDE.md's Auth & Permissions section). */
permissionAuditRouter.get("/permission-audit", requireAuth, async (req, res, next) => {
  try {
    const perms = await getPermissions(req.user!.employeeId);
    if (!perms) {
      return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Account inactive or removed" } });
    }
    if (perms.modules !== "ALL") {
      return res.status(403).json({ error: { code: "FORBIDDEN", message: "Admin only" } });
    }

    const [homeRows, userRows] = await Promise.all([
      readTable(env.sheets.home, HOME_TAB, { ttlMs: 5 * 60_000 }),
      readTable(env.sheets.transactions, USERS_TAB, { ttlMs: 15_000 }),
    ]);

    const userByEmployeeId = new Map(
      userRows
        .filter((u) => u["Employee Id"]?.trim())
        .map((u) => [u["Employee Id"]!.trim().toLowerCase(), u])
    );

    const mismatches: PermissionMismatch[] = [];

    for (const { app, homeNamePrefix, hasChildAccess } of AUDITED_APPS) {
      const homeRow = homeRows.find((r) => (r.Name ?? "").trim().toUpperCase().startsWith(homeNamePrefix));
      if (!homeRow) continue;

      const parentAllowlist = parseHomeAllowlist(homeRow["Email Permisssions/ Employee ID"]);

      // Only real Employee Ids that actually exist in the Sales CRR USERS sheet are
      // meaningful here — an orphaned id in either allowlist is a separate, pre-existing
      // data-quality issue this audit doesn't try to catch.
      for (const [employeeId, user] of userByEmployeeId) {
        const hasParent = !parentAllowlist || parentAllowlist.has(employeeId);
        const hasChild = await hasChildAccess(user["Employee Id"]!, user);

        if (hasParent && !hasChild) {
          mismatches.push({ employeeId: user["Employee Id"]!, name: user.Name ?? "", app, issue: "missing-child" });
        } else if (!hasParent && hasChild) {
          mismatches.push({ employeeId: user["Employee Id"]!, name: user.Name ?? "", app, issue: "missing-parent" });
        }
      }
    }

    mismatches.sort((a, b) => a.app.localeCompare(b.app) || a.employeeId.localeCompare(b.employeeId));
    res.json({ mismatches });
  } catch (err) {
    next(err);
  }
});
