import { Router } from "express";
import { readTable } from "../services/sheets.js";
import { env } from "../config/env.js";
import { requireAuth } from "../middleware/auth.js";

export const homeRouter = Router();

export const HOME_TAB = "ZOTO HOME";

/** Parses one HOME row's "Email Permisssions/ Employee ID" cell into the set of lowercased
 * Employee Ids it allows, or `null` for a blank cell (fail-open — visible/allowed to
 * everyone, same convention as USERS.Permissions_Process). Exported so
 * `permissionAudit.ts` can reuse the exact same parsing this route's own gate uses, rather
 * than a second hand-rolled copy that could silently drift from it. */
export function parseHomeAllowlist(cell: string | undefined): Set<string> | null {
  const allowlist = (cell ?? "").trim();
  if (!allowlist) return null;
  return new Set(allowlist.split(",").map((s) => s.trim().toLowerCase()));
}

/** Blank permissions cell = visible to everyone (same fail-open convention as
 * USERS.Permissions_Process); a non-blank cell is a comma-separated Employee Id allowlist. */
homeRouter.get("/tiles", requireAuth, async (req, res, next) => {
  try {
    const rows = await readTable(env.sheets.home, HOME_TAB, { ttlMs: 5 * 60_000 });
    const employeeId = req.user!.employeeId.trim().toLowerCase();

    const tiles = rows
      .filter((r) => {
        const allowlist = parseHomeAllowlist(r["Email Permisssions/ Employee ID"]);
        return !allowlist || allowlist.has(employeeId);
      })
      .map((r) => ({
        name: r.Name ?? "",
        view: r.View ?? "",
        image: r.Image ?? "",
        filter: r.Filter ?? "",
      }))
      .filter((t) => t.name);

    res.json({ tiles });
  } catch (err) {
    next(err);
  }
});
