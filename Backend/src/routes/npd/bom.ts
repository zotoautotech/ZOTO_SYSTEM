import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import { appendRow, deleteRows, readTable, updateRow } from "../../services/sheets.js";
import { nextSequentialId } from "../../services/ids.js";
import { logChange } from "../../services/npdChangelog.js";
import { hasNpdRole } from "../npdPermissions.js";

/**
 * BOM Builder (build-prompt §5.3) — `ASSEMBLE RM FG (BOM)` line editor against a FG SKU. New
 * tab on env.sheets.npd, trimmed from the xlsx workbook's 39 columns to the 16 this app
 * actually uses (denormalized FG/RM snapshot columns kept — FG Code/Category/Sub Category —
 * so a BOM line displays without a join back to the FG SKU catalog on every read, matching the
 * workbook's own design intent there).
 *
 * "Verified BOM Items" (the workbook's separate QA sign-off tab) is deliberately folded into
 * this same tab's own `Status` column (`Draft` -> `Verified`) rather than a second join tab —
 * a BOM line's verification state is 1:1 with the line itself, so a separate tab would only
 * ever hold a duplicate FK back here. If a future need arises for a *history* of verification
 * decisions (not just current state), that's when a separate log tab would earn its keep.
 */
export const bomRouter = Router();

const TAB = "ASSEMBLE RM FG (BOM)";
const ID_COLUMN = "Unique ID";

async function fgCatalogRow(fgId: string) {
  const rows = await readTable(env.sheets.fg, "FINAL GOOD SKU");
  return rows.find((r) => r["FG ID"] === fgId);
}

async function rmCatalogRow(rmId: string) {
  const rows = await readTable(env.sheets.npd, "Raw Material SKU");
  return rows.find((r) => r["ID'S"] === rmId);
}

/** Sums every line's "Rate x Quantity Price" for this FG SKU and writes the total back to
 * FINAL GOOD SKU's COST OF GOODS column (additively added there for exactly this purpose —
 * see NPD/CONTEXT.md). Called after every create/edit/delete so the roll-up never drifts. */
async function rollUpCostOfGoods(fgId: string): Promise<number> {
  const lines = await readTable(env.sheets.npd, TAB, { refresh: true });
  const total = lines
    .filter((l) => l["FG ID"] === fgId)
    .reduce((sum, l) => sum + (Number(l["Rate x Quantity Price"]) || 0), 0);
  await updateRow(env.sheets.fg, "FINAL GOOD SKU", "FG ID", fgId, { "COST OF GOODS": String(total) });
  return total;
}

bomRouter.get("/", async (req, res, next) => {
  try {
    const fgId = typeof req.query.fgId === "string" ? req.query.fgId : undefined;
    if (!fgId) return res.status(400).json({ error: { code: "MISSING_FG_ID", message: "fgId query param required" } });
    const rows = await readTable(env.sheets.npd, TAB);
    const lines = rows
      .filter((r) => r["FG ID"] === fgId)
      .sort((a, b) => Number(a["Level Sorting"] || 0) - Number(b["Level Sorting"] || 0));
    res.json({ lines });
  } catch (err) {
    next(err);
  }
});

const CreateSchema = z.object({
  fgId: z.string().trim().min(1),
  rmId: z.string().trim().min(1),
  quantity: z.number().positive(),
  units: z.string().trim().min(1),
  level: z.string().trim().optional(),
  levelSorting: z.number().optional(),
  rate: z.number().nonnegative().optional(),
});

bomRouter.post("/", async (req, res, next) => {
  try {
    const body = CreateSchema.parse(req.body);

    const fg = await fgCatalogRow(body.fgId);
    if (!fg) return res.status(404).json({ error: { code: "FG_NOT_FOUND", message: "FG SKU not found" } });
    const rm = await rmCatalogRow(body.rmId);
    if (!rm) return res.status(404).json({ error: { code: "RM_NOT_FOUND", message: "RM SKU not found" } });

    // Same RM line already on this BOM at the same level is almost certainly a doer
    // double-adding rather than a genuine second use — duplicate check, server-side, matching
    // this project's convention elsewhere (see taxonomy.ts).
    const existingLines = await readTable(env.sheets.npd, TAB, { refresh: true });
    const dup = existingLines.some(
      (l) => l["FG ID"] === body.fgId && l["RM ID"] === body.rmId && (l.Levels || "") === (body.level || "")
    );
    if (dup) {
      return res.status(409).json({ error: { code: "DUPLICATE", message: "This RM is already on this BOM at this level" } });
    }

    const rate = body.rate ?? 0;
    const id = await nextSequentialId(env.sheets.npd, TAB, ID_COLUMN, "BOM");
    await appendRow(env.sheets.npd, TAB, {
      Timestamp: new Date().toISOString(),
      Useremail: req.user!.employeeId,
      [ID_COLUMN]: id,
      "FG ID": body.fgId,
      "FG Code": fg["PART NO."] ?? "",
      Category: fg.CATEGORY ?? "",
      "Sub Category": fg["SUB CATEGORY"] ?? "",
      "RM ID": body.rmId,
      "RM Code": rm["PART NO."] ?? "",
      Quantity: String(body.quantity),
      Units: body.units,
      Levels: body.level ?? "",
      "Level Sorting": String(body.levelSorting ?? 0),
      Rate: String(rate),
      "Rate x Quantity Price": String(rate * body.quantity),
      Status: "Draft",
    });

    const costOfGoods = await rollUpCostOfGoods(body.fgId);
    res.status(201).json({ id, costOfGoods });
  } catch (err) {
    next(err);
  }
});

const UpdateSchema = z.object({
  quantity: z.number().positive().optional(),
  units: z.string().trim().min(1).optional(),
  level: z.string().trim().optional(),
  levelSorting: z.number().optional(),
  rate: z.number().nonnegative().optional(),
});

bomRouter.put("/:id", async (req, res, next) => {
  try {
    const body = UpdateSchema.parse(req.body);
    const lines = await readTable(env.sheets.npd, TAB, { refresh: true });
    const line = lines.find((l) => l[ID_COLUMN] === req.params.id);
    if (!line) return res.status(404).json({ error: { code: "NOT_FOUND", message: "BOM line not found" } });

    const quantity = body.quantity ?? (Number(line.Quantity) || 0);
    const rate = body.rate ?? (Number(line.Rate) || 0);

    if (body.rate !== undefined && String(body.rate) !== line.Rate) {
      await logChange({
        entity: "bom-rate",
        entityId: req.params.id,
        field: "Rate",
        oldValue: line.Rate ?? "",
        newValue: String(body.rate),
        employeeId: req.user!.employeeId,
      });
    }

    const patch: Record<string, string> = {};
    if (body.quantity !== undefined) patch.Quantity = String(body.quantity);
    if (body.units !== undefined) patch.Units = body.units;
    if (body.level !== undefined) patch.Levels = body.level;
    if (body.levelSorting !== undefined) patch["Level Sorting"] = String(body.levelSorting);
    if (body.rate !== undefined) patch.Rate = String(body.rate);
    patch["Rate x Quantity Price"] = String(rate * quantity);

    await updateRow(env.sheets.npd, TAB, ID_COLUMN, req.params.id, patch);
    const costOfGoods = await rollUpCostOfGoods(line["FG ID"]);
    res.json({ id: req.params.id, costOfGoods });
  } catch (err) {
    next(err);
  }
});

bomRouter.delete("/:id", async (req, res, next) => {
  try {
    const lines = await readTable(env.sheets.npd, TAB, { refresh: true });
    const line = lines.find((l) => l[ID_COLUMN] === req.params.id);
    if (!line) return res.status(404).json({ error: { code: "NOT_FOUND", message: "BOM line not found" } });

    await deleteRows(env.sheets.npd, TAB, ID_COLUMN, [req.params.id]);
    const costOfGoods = await rollUpCostOfGoods(line["FG ID"]);
    res.json({ deleted: 1, costOfGoods });
  } catch (err) {
    next(err);
  }
});

/** QA sign-off — Quality/Admin only. Blocks nothing downstream yet (no stock-issue flow exists
 * in this app yet to actually gate), but records the decision, matching the build prompt's
 * "block stock issue until Verified = true" intent for whenever that flow is built. */
bomRouter.post("/:id/verify", async (req, res, next) => {
  try {
    const allowed = await hasNpdRole(req.user!.employeeId, ["quality"]);
    if (!allowed) return res.status(403).json({ error: { code: "FORBIDDEN", message: "Quality or Admin only" } });

    const lines = await readTable(env.sheets.npd, TAB, { refresh: true });
    const line = lines.find((l) => l[ID_COLUMN] === req.params.id);
    if (!line) return res.status(404).json({ error: { code: "NOT_FOUND", message: "BOM line not found" } });

    await updateRow(env.sheets.npd, TAB, ID_COLUMN, req.params.id, { Status: "Verified" });
    res.json({ id: req.params.id, status: "Verified" });
  } catch (err) {
    next(err);
  }
});
