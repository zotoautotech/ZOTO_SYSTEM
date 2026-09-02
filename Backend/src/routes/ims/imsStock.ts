/**
 * IMS Stock — Record Entry IN/OUT/TRANSFER for FG/RM/WIP/Other, each with its own balance
 * rule (see services/imsBalance.ts). One handler per product type rather than one generic
 * parameterized handler — the docs specs show the four genuinely differ (rack-scoped vs
 * whole-part vs batch-capped vs no rule at all, plus different column shapes), so forcing a
 * shared abstraction here would be more fragile than four similar-but-independent handlers
 * (matches this repo's own stated preference, see CLAUDE.md's Dispatch/PDI revert functions).
 */
import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import { appendRow, appendRows, readTable } from "../../services/sheets.js";
import { nextRandomId } from "../../services/ids.js";
import { requireAuth, requireModule } from "../../middleware/auth.js";
import { fgRackBalance, wholePartBalance, wipBatchInQty } from "../../services/imsBalance.js";

export const imsStockRouter = Router();
imsStockRouter.use(requireAuth);

const refresh = (q: unknown) => q === "true" || q === "1";
const nowParts = () => {
  const d = new Date();
  return {
    DATE: d.toISOString().slice(0, 10),
    Year: String(d.getFullYear()),
    Month: String(d.getMonth() + 1),
    "Month Name": d.toLocaleString("en-US", { month: "long" }),
  };
};

const TABS = {
  fg: "Stock Record FG",
  rm: "Stock Record RM",
  wip: "Stock Record WIP",
  other: "Stock Record Other",
} as const;
type ProductType = keyof typeof TABS;

imsStockRouter.get("/:type/records", async (req, res, next) => {
  try {
    const type = req.params.type as ProductType;
    if (!(type in TABS)) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Unknown product type" } });
    const rows = await readTable(env.sheets.imsStock, TABS[type], { refresh: refresh(req.query.refresh) });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ---- FG Record Entry ------------------------------------------------------------------
const fgEntrySchema = z.object({
  type: z.enum(["IN", "OUT", "TRANSFER"]),
  from: z.string().optional().default(""),
  to: z.string().optional().default(""),
  quantity: z.string().min(1),
  unit: z.string().optional().default(""),
  description: z.string().optional().default(""),
  signatureUrl: z.string().min(1),
  oldPartNo: z.string().min(1),
  partNo: z.string().optional().default(""),
  segment: z.string().optional().default(""),
  category: z.string().optional().default(""),
  subCategory: z.string().optional().default(""),
  standardPart: z.string().optional().default(""),
});

imsStockRouter.post("/fg/records", requireModule("ims-stock"), async (req, res, next) => {
  try {
    const body = fgEntrySchema.parse(req.body);
    if ((body.type === "OUT" || body.type === "TRANSFER") && !body.from) {
      return res.status(400).json({ error: { code: "FROM_REQUIRED", message: "From rack is required for OUT/TRANSFER" } });
    }
    if ((body.type === "IN" || body.type === "TRANSFER") && !body.to) {
      return res.status(400).json({ error: { code: "TO_REQUIRED", message: "To rack is required for IN/TRANSFER" } });
    }

    const existing = await readTable(env.sheets.imsStock, TABS.fg);
    if (body.type === "OUT") {
      const balance = fgRackBalance(existing, body.oldPartNo, body.from);
      if (Number(body.quantity) > balance) {
        return res.status(400).json({ error: { code: "EXCEEDS_BALANCE", message: `Out qty exceeds rack balance (${balance})` } });
      }
    }

    const base = {
      Timestamp: new Date().toISOString(),
      Useremail: req.user!.employeeId,
      Part: "FG",
      "Old Part No": body.oldPartNo,
      "Part No": body.partNo,
      Segment: body.segment,
      Category: body.category,
      "Sub Category": body.subCategory,
      "Standard Part": body.standardPart,
      Unit: body.unit,
      Description: body.description,
      Signature: body.signatureUrl,
      ...nowParts(),
    };

    if (body.type === "TRANSFER") {
      // Replicates the old AppSheet "Transfer data bot": one marker row + a companion IN
      // row + a companion OUT row, since bots don't fire on direct API writes.
      const [markerId, inId, outId] = await nextRandomId2(3);
      await appendRows(env.sheets.imsStock, TABS.fg, [
        { ...base, "Record ID": markerId, "Batch ID": `BTCH-${markerId.slice(-8)}`, Type: "TRANSFER", From: body.from, To: body.to, Quantity: body.quantity },
        { ...base, "Record ID": inId, "Batch ID": `BTCH-${inId.slice(-8)}`, Type: "IN", To: body.to, Quantity: body.quantity },
        { ...base, "Record ID": outId, "Batch ID": `BTCH-${outId.slice(-8)}`, Type: "OUT", From: body.from, Quantity: body.quantity },
      ]);
      return res.status(201).json({ recordId: markerId });
    }

    const recordId = await nextRandomId(env.sheets.imsStock, "RECD", TABS.fg, "Record ID");
    await appendRow(env.sheets.imsStock, TABS.fg, {
      ...base,
      "Record ID": recordId,
      "Batch ID": `BTCH-${recordId.slice(-8)}`,
      Type: body.type,
      From: body.from,
      To: body.to,
      Quantity: body.quantity,
    });
    res.status(201).json({ recordId });
  } catch (err) {
    next(err);
  }
});

async function nextRandomId2(count: number): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < count; i++) ids.push(await nextRandomId(env.sheets.imsStock, "RECD", TABS.fg, "Record ID"));
  return ids;
}

// ---- RM / Other Record Entry (shared shape, different Category default + balance rule) --
function rmOtherEntrySchema() {
  return z.object({
    type: z.enum(["IN", "OUT", "TRANSFER"]),
    from: z.string().optional().default(""),
    to: z.string().optional().default(""),
    entryType: z.string().optional().default(""),
    quantity: z.string().min(1),
    unit: z.string().optional().default(""),
    description: z.string().optional().default(""),
    signatureUrl: z.string().min(1),
    oldPartCode: z.string().min(1),
    partCode: z.string().optional().default(""),
    partName: z.string().optional().default(""),
    category: z.string().optional().default(""),
  });
}

function registerRmOtherEntry(type: "rm" | "other", partTag: "RM" | "Oth.", enforceBalance: boolean) {
  imsStockRouter.post(`/${type}/records`, requireModule("ims-stock"), async (req, res, next) => {
    try {
      const body = rmOtherEntrySchema().parse(req.body);
      if ((body.type === "OUT" || body.type === "TRANSFER") && !body.from) {
        return res.status(400).json({ error: { code: "FROM_REQUIRED", message: "From rack is required for OUT/TRANSFER" } });
      }
      if ((body.type === "IN" || body.type === "TRANSFER") && !body.to) {
        return res.status(400).json({ error: { code: "TO_REQUIRED", message: "To rack is required for IN/TRANSFER" } });
      }

      if (enforceBalance && body.type === "OUT") {
        const existing = await readTable(env.sheets.imsStock, TABS[type]);
        const balance = wholePartBalance(existing, "Old Part Code", body.oldPartCode);
        if (Number(body.quantity) > balance) {
          return res.status(400).json({ error: { code: "EXCEEDS_BALANCE", message: `Out qty exceeds part balance (${balance})` } });
        }
      }

      const recordId = await nextRandomId(env.sheets.imsStock, "RECD", TABS[type], "Record ID");
      await appendRow(env.sheets.imsStock, TABS[type], {
        Timestamp: new Date().toISOString(),
        Useremail: req.user!.employeeId,
        "Record ID": recordId,
        Type: body.type,
        From: body.from,
        "Entry Type": body.entryType,
        To: body.to,
        Quantity: body.quantity,
        Unit: body.unit,
        Description: body.description,
        Signature: body.signatureUrl,
        Part: partTag,
        "Batch ID": `BTCH-${recordId.slice(-8)}`,
        "Old Part Code": body.oldPartCode,
        "Part Code": body.partCode,
        "Part Name": body.partName,
        Category: body.category,
        ...nowParts(),
      });
      res.status(201).json({ recordId });
    } catch (err) {
      next(err);
    }
  });
}

registerRmOtherEntry("rm", "RM", true); // whole-part balance enforced
registerRmOtherEntry("other", "Oth.", false); // no OUT balance rule per the docs spec

// ---- WIP Record Entry -------------------------------------------------------------------
const wipEntrySchema = z.object({
  type: z.enum(["IN", "OUT", "TRANSFER"]),
  from: z.string().optional().default(""),
  to: z.string().optional().default(""),
  entryType: z.enum(["For Assembly", "For Production", "Transfer"]).optional().default("For Production"),
  quantity: z.string().min(1),
  unit: z.string().optional().default("PCS"),
  weightGrams: z.string().optional().default(""),
  weightImageUrl: z.string().optional().default(""),
  description: z.string().min(1),
  signatureUrl: z.string().min(1),
  batchCode: z.string().optional().default(""),
  oldPartCode: z.string().optional().default(""),
  partCode: z.string().optional().default(""),
  category: z.string().optional().default(""),
  subCategory: z.string().optional().default(""),
  paint: z.string().optional().default(""),
});

imsStockRouter.post("/wip/records", requireModule("ims-stock"), async (req, res, next) => {
  try {
    const body = wipEntrySchema.parse(req.body);
    if ((body.type === "OUT" || body.type === "TRANSFER") && !body.from) {
      return res.status(400).json({ error: { code: "FROM_REQUIRED", message: "From rack (Ground Lane) is required for OUT/TRANSFER" } });
    }
    if ((body.type === "IN" || body.type === "TRANSFER") && !body.to) {
      return res.status(400).json({ error: { code: "TO_REQUIRED", message: "To rack (Ground Lane) is required for IN/TRANSFER" } });
    }
    if (body.type === "IN" && body.entryType === "For Production" && body.partCode && !body.batchCode) {
      return res.status(400).json({ error: { code: "BATCH_CODE_REQUIRED", message: "Batch Code is required for this entry" } });
    }

    if (body.type === "IN" && body.batchCode) {
      const [existing, batches] = await Promise.all([
        readTable(env.sheets.imsStock, TABS.wip),
        readTable(env.sheets.imsProduction, "Batch Production"),
      ]);
      const batch = batches.find((b) => b["Batch Code"] === body.batchCode);
      const castedQty = Number(batch?.["Casted Quantity"] ?? 0);
      if (batch && castedQty > 0) {
        const already = wipBatchInQty(existing, body.batchCode);
        if (already + Number(body.quantity) > castedQty) {
          return res.status(400).json({
            error: { code: "EXCEEDS_CASTED_QTY", message: `IN qty would exceed batch's Casted Quantity (${castedQty}, already recorded ${already})` },
          });
        }
      }
    }

    const recordId = await nextRandomId(env.sheets.imsStock, "RECD", TABS.wip, "Record ID");
    await appendRow(env.sheets.imsStock, TABS.wip, {
      Timestamp: new Date().toISOString(),
      Useremail: req.user!.employeeId,
      "Record ID": recordId,
      Type: body.type,
      From: body.from,
      To: body.to,
      "Entry Type": body.entryType,
      Quantity: body.quantity,
      Unit: body.unit,
      "WIP Part Weight (in grams)": body.weightGrams,
      "WIP Part Weigth Image": body.weightImageUrl,
      Description: body.description,
      Signature: body.signatureUrl,
      Part: "WIP",
      "Batch Code": body.batchCode,
      "Old Part Code": body.oldPartCode,
      "Part Code": body.partCode,
      Category: body.category,
      "Sub Category": body.subCategory,
      Paint: body.paint,
      ...nowParts(),
    });
    res.status(201).json({ recordId });
  } catch (err) {
    next(err);
  }
});
