import { Router } from "express";
import { readTable } from "../services/sheets.js";
import { env } from "../config/env.js";
import { requireAuth } from "../middleware/auth.js";

export const homeRouter = Router();

const HOME_TAB = "ZOTO HOME";

/** Blank permissions cell = visible to everyone (same fail-open convention as
 * USERS.Permissions_Process); a non-blank cell is a comma-separated Employee Id allowlist. */
homeRouter.get("/tiles", requireAuth, async (req, res, next) => {
  try {
    const rows = await readTable(env.sheets.home, HOME_TAB, { ttlMs: 5 * 60_000 });
    const employeeId = req.user!.employeeId.trim().toLowerCase();

    const tiles = rows
      .filter((r) => {
        const allowlist = (r["Email Permisssions/ Employee ID"] ?? "").trim();
        if (!allowlist) return true;
        return allowlist
          .split(",")
          .map((s) => s.trim().toLowerCase())
          .includes(employeeId);
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
