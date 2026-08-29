import { Router } from "express";
import { env } from "../../config/env.js";
import { readTable } from "../../services/sheets.js";

/**
 * Read-only view onto NPD Changelog (services/npdChangelog.ts) — the "Price Change Queue"
 * (build-prompt §7 screen 8) scoped down to a plain chronological log rather than a real
 * approval queue. The build prompt describes this screen as "pending price/BOM edits awaiting
 * Finance approval" — that would mean gating the FG SKU catalog's price-field edits behind a
 * Finance-approval step before they take effect, which is a real workflow change to the
 * generic taxonomy PUT route this app doesn't have anywhere else (every other module's edits
 * apply immediately, audited after the fact — see CLAUDE.md's discount-log convention). Scoped
 * down to "make every price/BOM edit visible" for now, deliberately not "block edits pending
 * approval" — revisit if a real Finance-approval-gate requirement comes up.
 */
export const changelogRouter = Router();

changelogRouter.get("/", async (req, res, next) => {
  try {
    const entity = typeof req.query.entity === "string" ? req.query.entity : undefined;
    const entityId = typeof req.query.entityId === "string" ? req.query.entityId : undefined;
    const rows = await readTable(env.sheets.npd, "NPD Changelog");
    const filtered = rows.filter(
      (r) => (!entity || r.Entity === entity) && (!entityId || r["Entity ID"] === entityId)
    );
    res.json({ entries: filtered.slice().reverse() });
  } catch (err) {
    next(err);
  }
});
