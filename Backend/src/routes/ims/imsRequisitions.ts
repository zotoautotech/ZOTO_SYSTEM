/**
 * IMS Requisitions — real BOM-explosion + FIFO release logic, replacing the reference app's
 * external, un-shared Google Apps Script (see docs/work/ims-sheet-header-spec.md's "Raw
 * Materials Requisition" section). Flow: flag a Production Batch or Batch Assembly as
 * "Requested" -> explode its BOM via ASSEMBLE RM FG against the batch/assembly's own
 * quantity -> one Raw Materials Requisition / Assembly RM Requisition row per ingredient ->
 * release against Stock Release Log with FIFO semantics -> undo.
 */
import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import { appendRow, appendRows, deleteRows, readTable, updateRow } from "../../services/sheets.js";
import { nextRandomId } from "../../services/ids.js";
import { requireAuth, requireModule } from "../../middleware/auth.js";
import { wholePartBalance } from "../../services/imsBalance.js";

export const imsRequisitionsRouter = Router();
imsRequisitionsRouter.use(requireAuth);

const refresh = (q: unknown) => q === "true" || q === "1";

imsRequisitionsRouter.get("/production", async (req, res, next) => {
  try {
    const rows = await readTable(env.sheets.imsProduction, "Raw Materials Requisition", { refresh: refresh(req.query.refresh) });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});
imsRequisitionsRouter.get("/assembly", async (req, res, next) => {
  try {
    const rows = await readTable(env.sheets.imsProduction, "Assembly RM Requisition", { refresh: refresh(req.query.refresh) });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/** Flags a Production Batch's "Requistion Materials" to Requested, then explodes its BOM
 * (WIP Code's FG counterpart's ASSEMBLE RM FG rows x Plan Quantity) into one Raw Materials
 * Requisition row per ingredient. */
imsRequisitionsRouter.post("/production/:batchId/request", requireModule("ims-requisitions"), async (req, res, next) => {
  try {
    const batches = await readTable(env.sheets.imsProduction, "Batch Production");
    const batch = batches.find((b) => b["Production Batch ID"] === req.params.batchId);
    if (!batch) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Batch not found" } });

    const bom = await readTable(env.sheets.imsRmWip, "ASSEMBLE RM FG");
    const ingredients = bom.filter((b) => b["RM CODE"] === batch["WIP Code"] || b["FG CODE"] === batch["FG Code"]);
    if (ingredients.length === 0) {
      return res.status(400).json({ error: { code: "NO_BOM", message: "No ASSEMBLE RM FG rows found for this batch's WIP/FG code" } });
    }

    const planQty = Number(batch["Plan Quantity"] ?? 0);
    const ids = await nextRandomIdsFor("REQRM", "Raw Materials Requisition", "Requisition ID", ingredients.length);
    const rows = ingredients.map((ing, i) => ({
      Timestamp: new Date().toISOString(),
      "Requisition ID": ids[i],
      "Production Batch ID": req.params.batchId,
      "Assemble RM FG Unique ID": ing["Unique id"],
      "RM Code": ing["RM CODE"],
      Category: ing.Category,
      "Sub Category": ing["Sub Category"],
      "Required Quantity": String(Number(ing["No. Of Qty Use"] ?? 0) * planQty),
      Units: ing.Units,
      Status: "Requested",
    }));
    await appendRows(env.sheets.imsProduction, "Raw Materials Requisition", rows);
    await updateRow(env.sheets.imsProduction, "Batch Production", "Production Batch ID", req.params.batchId, { "Requistion Materials": "Requested" });
    res.status(201).json({ requisitionIds: ids });
  } catch (err) {
    next(err);
  }
});

imsRequisitionsRouter.post("/assembly/:assemblyId/request", requireModule("ims-requisitions"), async (req, res, next) => {
  try {
    const assemblies = await readTable(env.sheets.imsProduction, "Batch Assembly");
    const assembly = assemblies.find((a) => a["Assembly ID"] === req.params.assemblyId);
    if (!assembly) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Assembly not found" } });

    const bom = await readTable(env.sheets.imsRmWip, "ASSEMBLE RM FG");
    const ingredients = bom.filter((b) => b["FG ID"] === assembly["Part ID"]);
    if (ingredients.length === 0) {
      return res.status(400).json({ error: { code: "NO_BOM", message: "No ASSEMBLE RM FG rows found for this assembly's FG" } });
    }

    const qty = Number(assembly["Assembly Quantity"] ?? 0);
    const ids = await nextRandomIdsFor("REQRM", "Assembly RM Requisition", "Requisition ID", ingredients.length);
    const rows = ingredients.map((ing, i) => ({
      Timestamp: new Date().toISOString(),
      "Requisition ID": ids[i],
      "Assembly ID": req.params.assemblyId,
      "Assemble RM FG Unique ID": ing["Unique id"],
      "RM Code": ing["RM CODE"],
      Category: ing.Category,
      "Sub Category": ing["Sub Category"],
      "Required Quantity": String(Number(ing["No. Of Qty Use"] ?? 0) * qty),
      Units: ing.Units,
      Status: "Requested",
    }));
    await appendRows(env.sheets.imsProduction, "Assembly RM Requisition", rows);
    await updateRow(env.sheets.imsProduction, "Batch Assembly", "Assembly ID", req.params.assemblyId, { "Requisition Material": "Requested" });
    res.status(201).json({ requisitionIds: ids });
  } catch (err) {
    next(err);
  }
});

async function nextRandomIdsFor(prefix: string, tab: string, idColumn: string, count: number): Promise<string[]> {
  const { nextRandomIds } = await import("../../services/ids.js");
  return nextRandomIds(env.sheets.imsProduction, prefix, tab, idColumn, count);
}

/**
 * Release RM against a set of ticked requisitions, FIFO (oldest requisition filled first).
 * Business rules per docs/work/ims-sheet-header-spec.md's Stock Release Log section:
 *  - Reject if release quantity exceeds the ticked requisitions' still-pending total.
 *  - Reject if the chosen rack's own balance can't cover the quantity (rack-level, stricter
 *    than RM's whole-part balance check).
 *  - Writes the RM OUT row through the same Record-Entry RM path as a manual entry, with the
 *    requisition id(s) comma-joined into the Batch ID cell.
 */
const releaseSchema = z.object({
  requisitionKind: z.enum(["production", "assembly"]),
  requisitionIds: z.array(z.string().min(1)).min(1),
  rmCode: z.string().min(1),
  oldPartCode: z.string().min(1),
  rack: z.string().min(1),
  quantity: z.string().min(1),
  unit: z.string().optional().default(""),
  remark: z.string().min(1),
});

imsRequisitionsRouter.post("/release", requireModule("ims-requisitions"), async (req, res, next) => {
  try {
    const body = releaseSchema.parse(req.body);
    const tab = body.requisitionKind === "production" ? "Raw Materials Requisition" : "Assembly RM Requisition";
    const allRequisitions = await readTable(env.sheets.imsProduction, tab);
    const ticked = allRequisitions
      .filter((r) => body.requisitionIds.includes(r["Requisition ID"]))
      .sort((a, b) => (a.Timestamp ?? "").localeCompare(b.Timestamp ?? "")); // FIFO: oldest first

    if (ticked.length !== body.requisitionIds.length) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "One or more requisitions not found" } });
    }

    // Allocations JSON is the only place that records what each requisition actually
    // received — the RM OUT row itself carries just one merged quantity.
    const releaseLog = await readTable(env.sheets.imsProduction, "Stock Release Log");
    const alreadyReleasedByReq = new Map<string, number>();
    for (const log of releaseLog) {
      let allocations: Record<string, number> = {};
      try {
        allocations = JSON.parse(log["Allocations JSON"] || "{}");
      } catch {
        continue;
      }
      for (const [id, qty] of Object.entries(allocations)) {
        alreadyReleasedByReq.set(id, (alreadyReleasedByReq.get(id) ?? 0) + Number(qty));
      }
    }

    const pendingByReq = ticked.map((r) => ({
      id: r["Requisition ID"],
      pending: Math.max(0, Number(r["Required Quantity"] ?? 0) - (alreadyReleasedByReq.get(r["Requisition ID"]) ?? 0)),
    }));
    const totalPending = pendingByReq.reduce((sum, r) => sum + r.pending, 0);
    const releaseQty = Number(body.quantity);
    if (releaseQty > totalPending) {
      return res.status(400).json({ error: { code: "EXCEEDS_PENDING", message: `Release qty exceeds ticked requisitions' pending total (${totalPending})` } });
    }

    // Rack-level balance check — stricter than RM's own whole-part Quantity Valid_If.
    const rmRecords = await readTable(env.sheets.imsStock, "Stock Record RM");
    let rackBalance = 0;
    for (const r of rmRecords) {
      if (r["Old Part Code"] !== body.oldPartCode) continue;
      if (r.Type === "IN" && r.To === body.rack) rackBalance += Number(r.Quantity ?? 0);
      if (r.Type === "OUT" && r.From === body.rack) rackBalance -= Number(r.Quantity ?? 0);
    }
    if (releaseQty > rackBalance) {
      return res.status(400).json({ error: { code: "EXCEEDS_RACK_BALANCE", message: `Release qty exceeds this rack's balance (${rackBalance})` } });
    }
    const wholeBalance = wholePartBalance(rmRecords, "Old Part Code", body.oldPartCode);
    if (releaseQty > wholeBalance) {
      return res.status(400).json({ error: { code: "EXCEEDS_BALANCE", message: `Release qty exceeds part's total balance (${wholeBalance})` } });
    }

    // FIFO allocation across ticked requisitions, oldest first.
    let remaining = releaseQty;
    const allocations: Record<string, number> = {};
    for (const { id, pending } of pendingByReq) {
      if (remaining <= 0) break;
      const take = Math.min(pending, remaining);
      if (take > 0) {
        allocations[id] = take;
        remaining -= take;
      }
    }

    const recordId = await nextRandomId(env.sheets.imsStock, "RECD", "Stock Record RM", "Record ID");
    await appendRow(env.sheets.imsStock, "Stock Record RM", {
      Timestamp: new Date().toISOString(),
      Useremail: req.user!.employeeId,
      "Record ID": recordId,
      Type: "OUT",
      From: body.rack,
      "Entry Type": "For Production",
      Quantity: body.quantity,
      Unit: body.unit,
      Description: body.remark,
      Part: "RM",
      "Batch ID": body.requisitionIds.join(","),
      "Old Part Code": body.oldPartCode,
      "Part Code": body.rmCode,
      Category: "RAW MATERIAL",
    });

    const releaseId = await nextRandomId(env.sheets.imsProduction, "REL", "Stock Release Log", "Release ID");
    await appendRow(env.sheets.imsProduction, "Stock Release Log", {
      Timestamp: new Date().toISOString(),
      "Release ID": releaseId,
      "Requisition Kind": body.requisitionKind,
      "Requisition ID": body.requisitionIds[0],
      "Requisition IDs": body.requisitionIds.join(","),
      "Allocations JSON": JSON.stringify(allocations),
      "RM Code": body.rmCode,
      "Old Part Code": body.oldPartCode,
      Rack: body.rack,
      Quantity: body.quantity,
      Unit: body.unit,
      Remark: body.remark,
      "Record ID": recordId,
      "Released By": req.user!.employeeId,
    });

    res.status(201).json({ releaseId, recordId, allocations });
  } catch (err) {
    next(err);
  }
});

/** Undo: remove the RM OUT row first (by Record ID); only if that succeeds does the Stock
 * Release Log row get removed — never the reverse, so the log can never claim material came
 * back if the sheet still shows it gone. */
imsRequisitionsRouter.delete("/release/:releaseId", requireModule("ims-requisitions"), async (req, res, next) => {
  try {
    const logs = await readTable(env.sheets.imsProduction, "Stock Release Log");
    const log = logs.find((l) => l["Release ID"] === req.params.releaseId);
    if (!log) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Release not found" } });

    await deleteRows(env.sheets.imsStock, "Stock Record RM", "Record ID", [log["Record ID"]]);
    await deleteRows(env.sheets.imsProduction, "Stock Release Log", "Release ID", [req.params.releaseId]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
