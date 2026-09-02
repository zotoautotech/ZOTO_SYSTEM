/** IMS Production — Batch Production/Followup, Batch Assembly/Followup, Produced Part. All
 * on IMS_SHEET_PRODUCTION_ID (env.sheets.imsProduction). */
import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import { appendRow, appendRows, readTable, updateRow } from "../../services/sheets.js";
import { nextRandomId } from "../../services/ids.js";
import { requireAuth, requireModule } from "../../middleware/auth.js";

export const imsProductionRouter = Router();
imsProductionRouter.use(requireAuth);

const refresh = (q: unknown) => q === "true" || q === "1";

// ---- Batch Production ---------------------------------------------------------------------
imsProductionRouter.get("/batches", async (req, res, next) => {
  try {
    const rows = await readTable(env.sheets.imsProduction, "Batch Production", { refresh: refresh(req.query.refresh) });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

const batchSchema = z.object({
  wipId: z.string().min(1),
  wipCode: z.string().min(1),
  category: z.string().optional().default(""),
  subCategory: z.string().optional().default(""),
  paint: z.string().optional().default(""),
  fgCode: z.string().optional().default(""),
  requiredQuantity: z.string().optional().default(""),
  planQuantity: z.string().min(1),
  responsiblePerson: z.string().min(1),
  startDateTime: z.string().min(1),
  dueDateTime: z.string().min(1),
  notes: z.string().optional().default(""),
});

imsProductionRouter.post("/batches", requireModule("ims-production"), async (req, res, next) => {
  try {
    const body = batchSchema.parse(req.body);
    const start = new Date(body.startDateTime);
    const due = new Date(body.dueDateTime);
    if (due <= start) return res.status(400).json({ error: { code: "INVALID_DATES", message: "Due must be after Start" } });
    const productionDays = Math.ceil((due.getTime() - start.getTime()) / 86_400_000);

    const batchId = await nextRandomId(env.sheets.imsProduction, "BP", "Batch Production", "Production Batch ID");
    const batchCode = `${new Date().toTimeString().slice(0, 5).replace(":", "")}A-${new Date().toISOString().slice(0, 10)}-${body.wipCode}`;
    await appendRow(env.sheets.imsProduction, "Batch Production", {
      Timestamp: new Date().toISOString(),
      Usermail: req.user!.employeeId,
      "WIP ID": body.wipId,
      "Production Batch ID": batchId,
      "FG Code": body.fgCode,
      "WIP Code": body.wipCode,
      Category: body.category,
      "Sub Category": body.subCategory,
      Paint: body.paint,
      "Required Quantity": body.requiredQuantity,
      "Batch Code": batchCode,
      "Plan Quantity": body.planQuantity,
      "Responsible Person": body.responsiblePerson,
      "Start DateTime": body.startDateTime,
      "Due DateTime": body.dueDateTime,
      "Production Days": String(productionDays),
      Notes: body.notes,
    });
    res.status(201).json({ productionBatchId: batchId, batchCode });
  } catch (err) {
    next(err);
  }
});

/** "Update Casted Parts" — write-once (only while all three are still blank). */
const castedSchema = z.object({
  castedQuantity: z.string().min(1),
  partWeightGrams: z.string().min(1),
  weightImageUrl: z.string().optional().default(""),
});
imsProductionRouter.patch("/batches/:id/casted", requireModule("ims-production"), async (req, res, next) => {
  try {
    const body = castedSchema.parse(req.body);
    const rows = await readTable(env.sheets.imsProduction, "Batch Production");
    const batch = rows.find((r) => r["Production Batch ID"] === req.params.id);
    if (!batch) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Batch not found" } });
    if (batch["Casted Quantity"] || batch["Part Weight as cast (in grams)"]) {
      return res.status(409).json({ error: { code: "ALREADY_SET", message: "Casted parts already recorded" } });
    }
    await updateRow(env.sheets.imsProduction, "Batch Production", "Production Batch ID", req.params.id, {
      "Casted Quantity": body.castedQuantity,
      "Part Weight as cast (in grams)": body.partWeightGrams,
      "Weighing Part Image": body.weightImageUrl,
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/** Batch Followup — Completed requires balance=0 exactly; any other status requires non-zero. */
const followupSchema = z.object({
  productionStatus: z.string().min(1),
  reason: z.string().optional().default(""),
  nextEstimateDateTime: z.string().optional().default(""),
  remarks: z.string().optional().default(""),
  quantityAdjustment: z.enum(["Yes", "No"]).optional().default("No"),
  shortOrExcess: z.string().optional().default(""),
  shortOrExcessReason: z.string().optional().default(""),
  shortOrExcessQuantity: z.string().optional().default("0"),
});
imsProductionRouter.post("/batches/:id/followups", requireModule("ims-production"), async (req, res, next) => {
  try {
    const body = followupSchema.parse(req.body);
    if (body.productionStatus === "Hold" && !body.reason) {
      return res.status(400).json({ error: { code: "REASON_REQUIRED", message: "Reason is required when Status=Hold" } });
    }
    const [batches, followups] = await Promise.all([
      readTable(env.sheets.imsProduction, "Batch Production"),
      readTable(env.sheets.imsProduction, "Batch Followup"),
    ]);
    const batch = batches.find((r) => r["Production Batch ID"] === req.params.id);
    if (!batch) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Batch not found" } });

    const casted = Number(batch["Casted Quantity"] ?? 0);
    const priorReceived = followups
      .filter((f) => f["Production Batch ID"] === req.params.id)
      .reduce((sum, f) => sum + Number(f["Casted Quantity"] ?? 0), 0); // placeholder accumulator; see note below
    const excessTotal = Number(body.shortOrExcess === "Excess" ? body.shortOrExcessQuantity : 0);
    const shortTotal = Number(body.shortOrExcess === "Short" ? body.shortOrExcessQuantity : 0);
    const balance = casted - (priorReceived - excessTotal + shortTotal);

    if (body.productionStatus === "Completed" && balance !== 0) {
      return res.status(400).json({ error: { code: "BALANCE_NOT_ZERO", message: `Balance must be 0 to complete (currently ${balance})` } });
    }
    if (body.productionStatus !== "Completed" && balance === 0) {
      return res.status(400).json({ error: { code: "BALANCE_MUST_BE_NONZERO", message: "Balance must stay non-zero unless Status=Completed" } });
    }

    const followupId = await nextRandomId(env.sheets.imsProduction, "BPF", "Batch Followup", "Followup ID");
    await appendRow(env.sheets.imsProduction, "Batch Followup", {
      Timestamp: new Date().toISOString(),
      Usermail: req.user!.employeeId,
      "Production Batch ID": req.params.id,
      "Followup ID": followupId,
      "WIP Code": batch["WIP Code"],
      Category: batch.Category,
      "Sub Category": batch["Sub Category"],
      Paint: batch.Paint,
      "Required Quantity": batch["Required Quantity"],
      "Batch Code": batch["Batch Code"],
      "Plan Quantity": batch["Plan Quantity"],
      "Casted Quantity": batch["Casted Quantity"],
      "Part Weight as cast (in grams)": batch["Part Weight as cast (in grams)"],
      "Responsible Person": batch["Responsible Person"],
      "Start DateTime": batch["Start DateTime"],
      "Due DateTime": batch["Due DateTime"],
      "Production Days": batch["Production Days"],
      Notes: batch.Notes,
      "Production Status": body.productionStatus,
      Reason: body.reason,
      "Nest Estimate DateTime": body.nextEstimateDateTime,
      Remarks: body.remarks,
      "Quantity Adjustment": body.quantityAdjustment,
      "Short or Excess": body.shortOrExcess,
      "Short or Excess Reason": body.shortOrExcessReason,
      "Short or Excess Quantity": body.shortOrExcessQuantity,
      "Balance in Production": String(balance),
    });
    res.status(201).json({ followupId, balance });
  } catch (err) {
    next(err);
  }
});

// ---- Batch Assembly (line planning) --------------------------------------------------------
imsProductionRouter.get("/assemblies", async (req, res, next) => {
  try {
    const rows = await readTable(env.sheets.imsProduction, "Batch Assembly", { refresh: refresh(req.query.refresh) });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

const assemblySchema = z.object({
  partId: z.string().min(1),
  oldPartCode: z.string().optional().default(""),
  partCode: z.string().optional().default(""),
  partName: z.string().optional().default(""),
  description: z.string().optional().default(""),
  segment: z.string().optional().default(""),
  category: z.string().optional().default(""),
  subCategory: z.string().optional().default(""),
  paint: z.string().optional().default(""),
  assemblyQuantity: z.string().min(1),
  preAssemblyNotes: z.string().optional().default(""),
  responsiblePerson: z.string().optional().default("VEENU"),
});

imsProductionRouter.post("/assemblies", requireModule("ims-production"), async (req, res, next) => {
  try {
    const body = assemblySchema.parse(req.body);
    if (Number(body.assemblyQuantity) < 1) return res.status(400).json({ error: { code: "INVALID_QTY", message: "Assembly Quantity must be at least 1" } });
    const assemblyId = await nextRandomId(env.sheets.imsProduction, "ASSM", "Batch Assembly", "Assembly ID");
    const batchCode = `${new Date().toLocaleDateString("en-GB").replace(/\//g, "-")}-${assemblyId.slice(-8)}`;
    await appendRow(env.sheets.imsProduction, "Batch Assembly", {
      Timestamp: new Date().toISOString(),
      Usermail: req.user!.employeeId,
      "Assembly ID": assemblyId,
      "Part ID": body.partId,
      "Old Part Code": body.oldPartCode,
      "Part Code": body.partCode,
      "Part Name": body.partName,
      Description: body.description,
      Segment: body.segment,
      Category: body.category,
      "Sub Category": body.subCategory,
      Paint: body.paint,
      "Assembly Quantity": body.assemblyQuantity,
      "Pre Assembly Notes": body.preAssemblyNotes,
      "Batch Code": batchCode,
      "Responsible Person": body.responsiblePerson,
    });
    res.status(201).json({ assemblyId, batchCode });
  } catch (err) {
    next(err);
  }
});

const assemblyFollowupSchema = z.object({
  assemblyStatus: z.string().min(1),
  quantity: z.string().min(1),
  notes: z.string().optional().default(""),
});
imsProductionRouter.post("/assemblies/:id/followups", requireModule("ims-production"), async (req, res, next) => {
  try {
    const body = assemblyFollowupSchema.parse(req.body);
    const [assemblies, followups] = await Promise.all([
      readTable(env.sheets.imsProduction, "Batch Assembly"),
      readTable(env.sheets.imsProduction, "Batch Assembly Followup"),
    ]);
    const assembly = assemblies.find((r) => r["Assembly ID"] === req.params.id);
    if (!assembly) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Assembly not found" } });

    const priorFollowups = followups.filter((f) => f["Assembly ID"] === req.params.id);
    const priorQty = priorFollowups.reduce((sum, f) => sum + Number(f.Quantity ?? 0), 0);
    const remaining = Number(assembly["Assembly Quantity"] ?? 0) - priorQty;
    if (Number(body.quantity) > remaining) {
      return res.status(400).json({ error: { code: "EXCEEDS_BALANCE", message: `Quantity exceeds remaining assembly balance (${remaining})` } });
    }

    const followupId = await nextRandomId(env.sheets.imsProduction, "ASSM-FU", "Batch Assembly Followup", "Assembly Followup ID");
    await appendRow(env.sheets.imsProduction, "Batch Assembly Followup", {
      Timestamp: new Date().toISOString(),
      Usermail: req.user!.employeeId,
      "Assembly ID": req.params.id,
      "Assembly Followup ID": followupId,
      "Part ID": assembly["Part ID"],
      "Old Part Code": assembly["Old Part Code"],
      "Part Code": assembly["Part Code"],
      "Part Name": assembly["Part Name"],
      Description: assembly.Description,
      Segment: assembly.Segment,
      Category: assembly.Category,
      "Sub Category": assembly["Sub Category"],
      Paint: assembly.Paint,
      "Assembly Quantity": assembly["Assembly Quantity"],
      "Batch Code": assembly["Batch Code"],
      "Responsible Person": assembly["Responsible Person"],
      "Assembly Status": body.assemblyStatus,
      Quantity: body.quantity,
      Notes: body.notes,
      Status: body.assemblyStatus,
    });

    // WIP-ingredient consumption: one "WIP Stock on Assembly" row per MACHINED WIP
    // ingredient in the FG's BOM, when this followup marks the assembly as Assembled.
    if (body.assemblyStatus === "Assembled") {
      const bom = await readTable(env.sheets.imsRmWip, "ASSEMBLE RM FG");
      const wipIngredients = bom.filter((b) => b["FG ID"] === assembly["Part ID"]);
      const wipMaster = await readTable(env.sheets.imsRmWip, "WIP MASTER");
      const machinedWipCodes = new Set(
        wipMaster.filter((w) => (w["Machined Or Casted"] ?? "").toUpperCase() === "MACHINED").map((w) => w["PART NO."])
      );
      const consumptionRows = wipIngredients
        .filter((ing) => machinedWipCodes.has(ing["RM CODE"]))
        .map((ing) => ({
          Timestamp: new Date().toISOString(),
          Usermail: req.user!.employeeId,
          "Table Name": "Batch Assembly Followup",
          "Related ID": followupId,
          "Stock ID": "", // filled per-row below via nextRandomId, batched not needed given typical small BOM size
          "Stock OUT": String(Number(ing["No. Of Qty Use"] ?? 0) * Number(body.quantity)),
          Type: "OUT",
          Quantity: String(Number(ing["No. Of Qty Use"] ?? 0) * Number(body.quantity)),
          "Part ID": ing["RM ID"],
          Part: "WIP",
          "Batch Code": assembly["Batch Code"],
          "Old Part Code": ing["RM CODE"],
          "Part Code": ing["RM CODE"],
          Category: ing.Category,
          "Sub Category": ing["Sub Category"],
          Status: "Consumed",
        }));
      for (const row of consumptionRows) {
        row["Stock ID"] = await nextRandomId(env.sheets.imsProduction, "STCK", "WIP Stock on Assembly", "Stock ID");
      }
      if (consumptionRows.length > 0) {
        await appendRows(env.sheets.imsProduction, "WIP Stock on Assembly", consumptionRows);
      }
    }

    res.status(201).json({ followupId });
  } catch (err) {
    next(err);
  }
});

// ---- Produced Part --------------------------------------------------------------------------
const producedPartSchema = z.object({
  partId: z.string().min(1),
  oldPartCode: z.string().optional().default(""),
  partCode: z.string().optional().default(""),
  partName: z.string().optional().default(""),
  category: z.string().optional().default(""),
  sendFor: z.enum(["Dispatch", "Warehouse"]),
  customerId: z.string().optional().default(""),
  customerName: z.string().optional().default(""),
  customerGstin: z.string().optional().default(""),
  gatePassUrl: z.string().optional().default(""),
  quantity: z.string().min(1),
  notes: z.string().optional().default(""),
});
imsProductionRouter.post("/produced-parts", requireModule("ims-production"), async (req, res, next) => {
  try {
    const body = producedPartSchema.parse(req.body);
    if (body.sendFor === "Dispatch" && (!body.customerId || !body.gatePassUrl)) {
      return res.status(400).json({ error: { code: "CUSTOMER_REQUIRED", message: "Customer + Gate Pass are required when Send For=Dispatch" } });
    }
    const productionId = await nextRandomId(env.sheets.imsProduction, "PDCN-ITM", "Produced Part", "Production ID");
    await appendRow(env.sheets.imsProduction, "Produced Part", {
      Timestamp: new Date().toISOString(),
      Usermail: req.user!.employeeId,
      "Production ID": productionId,
      "Part ID": body.partId,
      "Old Part Code": body.oldPartCode,
      "Part Code": body.partCode,
      "Part Name": body.partName,
      Category: body.category,
      "Send For": body.sendFor,
      "Customer ID": body.customerId,
      "Customer Name": body.customerName,
      "Customer GSTIN": body.customerGstin,
      "Gate Pass": body.gatePassUrl,
      Quantity: body.quantity,
      Notes: body.notes,
    });
    res.status(201).json({ productionId });
  } catch (err) {
    next(err);
  }
});

/** Warehouse-FG-In: posts a Production FG row once the summed Stock Record FG rows already
 * entered against this Production ID equal the produced quantity. */
imsProductionRouter.post("/produced-parts/:id/warehouse-in", requireModule("ims-production"), async (req, res, next) => {
  try {
    const schema = z.object({ quantity: z.string().min(1) });
    const { quantity } = schema.parse(req.body);
    const produced = (await readTable(env.sheets.imsProduction, "Produced Part")).find((r) => r["Production ID"] === req.params.id);
    if (!produced) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Produced Part not found" } });
    if (produced["Send For"] !== "Warehouse") {
      return res.status(400).json({ error: { code: "NOT_WAREHOUSE", message: "This Produced Part is not routed to Warehouse" } });
    }
    const fgRecords = await readTable(env.sheets.imsStock, "Stock Record FG");
    const alreadyRecorded = fgRecords
      .filter((r) => r["Batch ID"] === req.params.id)
      .reduce((sum, r) => sum + Number(r.Quantity ?? 0), 0);
    if (alreadyRecorded + Number(quantity) !== Number(produced.Quantity ?? 0)) {
      return res
        .status(400)
        .json({ error: { code: "QTY_MISMATCH", message: `Sum of recorded FG stock must equal produced quantity (${produced.Quantity})` } });
    }
    await appendRow(env.sheets.imsStock, "Production FG", {
      Timestamp: new Date().toISOString(),
      Useremail: req.user!.employeeId,
      "Assemble Id": req.params.id,
      Qty: quantity,
    });
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});
