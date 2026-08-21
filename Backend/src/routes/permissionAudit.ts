import { Router } from "express";
import { readTable } from "../services/sheets.js";
import { env } from "../config/env.js";
import { requireAuth } from "../middleware/auth.js";
import { getPermissions, parseModules } from "../services/permissions.js";
import { HOME_TAB, parseHomeAllowlist } from "./home.js";

export const permissionAuditRouter = Router();

const USERS_TAB = "USERS";

/** The two apps that currently have both halves of the parent/child relationship
 * populated — see docs/CHECKLIST.md and CLAUDE.md's Auth & Permissions section for the
 * full story. `homeNamePrefix` matches a `ZOTO HOME` row's `Name` (same
 * startsWith-"SALES CRR" convention `Frontend/src/pages/Home.tsx`'s `hrefFor()` already
 * uses to special-case the Sales CRR tile). `hasChildAccess` decides, from the employee's
 * already-parsed Sales CRR `modules` (via the real `parseModules()` — never a second,
 * hand-rolled parser that could drift from the actual gate), whether they'd actually be
 * able to use the app once inside it. Add a third entry here once another HOME app is
 * real (not a "Coming Soon" placeholder) — this stays a one-line addition. */
const AUDITED_APPS: {
  app: string;
  homeNamePrefix: string;
  hasChildAccess: (modules: string[] | "ALL") => boolean;
}[] = [
  {
    app: "Sales CRR",
    homeNamePrefix: "SALES CRR",
    // No single "salescrr" module key survives parseModules() — it's a grouping label
    // parseModules() deliberately strips (see permissions.ts). Any real module granted
    // (or Admin/"ALL") is what actually lets someone do anything once inside, so that's
    // the meaningful proxy for "has base Sales CRR access" here.
    hasChildAccess: (modules) => modules === "ALL" || modules.length > 0,
  },
  {
    app: "Checklist",
    homeNamePrefix: "CHECKLIST",
    hasChildAccess: (modules) => modules === "ALL" || modules.includes("checklist"),
  },
];

interface PermissionMismatch {
  employeeId: string;
  name: string;
  app: string;
  issue: "missing-child" | "missing-parent";
}

/** GET /api/v1/admin/permission-audit — read-only report of employees whose HOME tile
 * visibility (parent, `ZOTO HOME` sheet) and actual app access (child,
 * `USERS.Permissions_Process` on the Sales CRR transactions sheet) disagree. Admin-only
 * (Sales CRR `Permissions_Process` containing "Admin", i.e. `perms.modules === "ALL"` —
 * this audit spans apps, so it's gated on the Sales CRR Admin flag directly rather than
 * any single `requireModule` key). Purely informational — no edit affordance; the actual
 * fix is still hand-editing the relevant sheet cell, same as every other permission column
 * in this app (see CLAUDE.md's Auth & Permissions section). */
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
        const modules = parseModules(user.Permissions_Process);
        const hasChild = hasChildAccess(modules);

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
