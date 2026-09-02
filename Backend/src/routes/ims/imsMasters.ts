/**
 * IMS Masters — FG / RM / WIP / Customer catalogues. FG uses IMS_SHEET_MASTER_FG_ID's
 * "MASTER OF FG INVENTORY" (distinct from Sales CRR's own lean FG_SHEET_ID SKU picker — see
 * docs/work/ims-sheet-header-spec.md's Resolved Ambiguities). RM/WIP use IMS_SHEET_STOCK_ID's
 * "MASTER RM OR OTHER" and IMS_SHEET_RM_WIP_ID's "WIP MASTER" respectively. Customer uses
 * IMS_SHEET_CUSTOMER_ID's "CUSTOMER MASTER V2".
 */
import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import { appendRow, readTable, updateRow } from "../../services/sheets.js";
import { nextRandomId } from "../../services/ids.js";
import { requireAuth, requireModule } from "../../middleware/auth.js";

export const imsMastersRouter = Router();
imsMastersRouter.use(requireAuth);

const refresh = (q: unknown) => q === "true" || q === "1";

// ---- FG master --------------------------------------------------------------------------
const FG_TAB = "MASTER OF FG INVENTORY";
// Sheet-side virtual/rollup columns the app must never write plain values into — they're
// either formula columns on the live sheet or computed live by imsBalance.ts instead.
const FG_VIRTUAL_COLUMNS = ["Monthly Stock In", "Monthly Stock Out", "Adjust FG", "Verified FG Stock", "Inhouse Stock Issue", "Assembled Parts"];

imsMastersRouter.get("/fg", async (req, res, next) => {
  try {
    const rows = await readTable(env.sheets.imsMasterFg, FG_TAB, { refresh: refresh(req.query.refresh) });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

const fgSchema = z.object({
  "PART NO.": z.string().min(1),
  "Part Name": z.string().min(1),
  SEGMENT: z.string().optional().default(""),
  Category: z.string().optional().default(""),
  "Sub Category": z.string().optional().default(""),
  "Standard Part": z.string().optional().default(""),
  "CUSTOMER NAME": z.string().optional().default(""),
  Paint: z.string().optional().default(""),
  "MIN STOCK": z.string().optional().default(""),
  "MAX STOCK": z.string().optional().default(""),
  price: z.string().optional().default(""),
  Discount: z.string().optional().default(""),
});

imsMastersRouter.post("/fg", requireModule("ims-masters"), async (req, res, next) => {
  try {
    const body = fgSchema.parse(req.body);
    const fgId = await nextRandomId(env.sheets.imsMasterFg, "FG", FG_TAB, "FG ID");
    await appendRow(env.sheets.imsMasterFg, FG_TAB, {
      TIMESTAMP: new Date().toISOString(),
      USEREMAIL: req.user!.employeeId,
      "FG ID": fgId,
      ...body,
    });
    res.status(201).json({ fgId });
  } catch (err) {
    next(err);
  }
});

// ---- RM master ----------------------------------------------------------------------------
const RM_TAB = "MASTER RM OR OTHER";

imsMastersRouter.get("/rm", async (req, res, next) => {
  try {
    const rows = await readTable(env.sheets.imsStock, RM_TAB, { refresh: refresh(req.query.refresh) });
    res.json(rows.filter((r) => (r.Category ?? "").toUpperCase() === "RAW MATERIAL"));
  } catch (err) {
    next(err);
  }
});

imsMastersRouter.get("/other", async (req, res, next) => {
  try {
    const rows = await readTable(env.sheets.imsStock, RM_TAB, { refresh: refresh(req.query.refresh) });
    res.json(rows.filter((r) => (r.Category ?? "").toUpperCase() === "CONSUMABLE"));
  } catch (err) {
    next(err);
  }
});

const rmOtherSchema = z.object({
  "Part Code": z.string().min(1),
  "Old Part Code": z.string().optional().default(""),
  "Part Name": z.string().min(1),
  Category: z.enum(["RAW MATERIAL", "CONSUMABLE"]),
  "Sub Category": z.string().optional().default(""),
  Segment: z.string().optional().default(""),
  Unit: z.string().optional().default(""),
  "MIN STOCK": z.string().optional().default(""),
  "MAX STOCK": z.string().optional().default(""),
});

imsMastersRouter.post("/rm", requireModule("ims-masters"), async (req, res, next) => {
  try {
    const body = rmOtherSchema.parse(req.body);
    await appendRow(env.sheets.imsStock, RM_TAB, body);
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});
imsMastersRouter.post("/other", requireModule("ims-masters"), async (req, res, next) => {
  try {
    const body = rmOtherSchema.parse(req.body);
    await appendRow(env.sheets.imsStock, RM_TAB, body);
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---- WIP master ---------------------------------------------------------------------------
const WIP_TAB = "WIP MASTER";

imsMastersRouter.get("/wip", async (req, res, next) => {
  try {
    const rows = await readTable(env.sheets.imsRmWip, WIP_TAB, { refresh: refresh(req.query.refresh) });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

const wipSchema = z.object({
  "PART NO.": z.string().min(1),
  Category: z.string().optional().default(""),
  "Sub Category": z.string().optional().default(""),
  Paint: z.string().optional().default(""),
  "MAKE BY": z.enum(["Inhouse", "Outsource"]).optional().default("Inhouse"),
  "VENDOR NAME": z.string().optional().default(""),
  "Old Part Code": z.string().optional().default(""),
  "Old Part Name": z.string().optional().default(""),
  "Machined Or Casted": z.enum(["MACHINED", "CASTED"]),
  "MIN STOCK": z.string().optional().default(""),
  "MAX STOCK": z.string().optional().default(""),
  "Ingot Weight (in grams)": z.string().optional().default(""),
});

imsMastersRouter.post("/wip", requireModule("ims-masters"), async (req, res, next) => {
  try {
    const body = wipSchema.parse(req.body);
    const idS = await nextRandomId(env.sheets.imsRmWip, "WIP", WIP_TAB, "ID'S");
    await appendRow(env.sheets.imsRmWip, WIP_TAB, {
      Timestamp: new Date().toISOString(),
      Useremail: req.user!.employeeId,
      "ID'S": idS,
      Year: String(new Date().getFullYear()),
      ...body,
    });
    res.status(201).json({ idS });
  } catch (err) {
    next(err);
  }
});

/** Casted-weight updates: gated to `ims-wip-weight`, matching the reference's own
 * hardcoded-email restriction reimplemented as a real permission sub-key (per CLAUDE.md's
 * "reimplement as a USERS.Permissions_Process-driven check" note). Write-once: only fills
 * Casted Weight / Casted Weight Image while both are still blank. */
imsMastersRouter.patch("/wip/:idS/casted-weight", requireModule("ims-wip-weight"), async (req, res, next) => {
  try {
    const schema = z.object({ weightGrams: z.string().min(1), imageUrl: z.string().optional().default("") });
    const { weightGrams, imageUrl } = schema.parse(req.body);
    const rows = await readTable(env.sheets.imsRmWip, WIP_TAB);
    const row = rows.find((r) => r["ID'S"] === req.params.idS);
    if (!row) return res.status(404).json({ error: { code: "NOT_FOUND", message: "WIP part not found" } });
    if (row["Casted Weight (in grams)"] || row["Casted Weight Image"]) {
      return res.status(409).json({ error: { code: "ALREADY_SET", message: "Casted weight already recorded" } });
    }
    await updateRow(env.sheets.imsRmWip, WIP_TAB, "ID'S", req.params.idS, {
      "Casted Weight (in grams)": weightGrams,
      "Casted Weight Image": imageUrl,
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---- Customer master ----------------------------------------------------------------------
const CUSTOMER_TAB = "CUSTOMER MASTER V2";

imsMastersRouter.get("/customers", async (req, res, next) => {
  try {
    const rows = await readTable(env.sheets.imsCustomer, CUSTOMER_TAB, { refresh: refresh(req.query.refresh) });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

const customerSchema = z.object({
  "Customer Code": z.string().min(1),
  "Customer Name": z.string().min(1),
  "Customer Category": z.string().optional().default(""),
  "Business Segment": z.string().optional().default(""),
  "Business Type": z.string().optional().default(""),
  "Company GSTIN NO.": z.string().optional().default(""),
  "Registered Contact No.": z.string().optional().default(""),
  "Sales Repersentative Name": z.string().optional().default(""),
});

imsMastersRouter.post("/customers", requireModule("ims-masters"), async (req, res, next) => {
  try {
    const body = customerSchema.parse(req.body);
    const customerId = await nextRandomId(env.sheets.imsCustomer, "CUST", CUSTOMER_TAB, "Customer ID");
    await appendRow(env.sheets.imsCustomer, CUSTOMER_TAB, {
      Timestamp: new Date().toISOString(),
      Useremail: req.user!.employeeId,
      "Customer ID": customerId,
      "Customer Status": "Active",
      "Account Type": "Customer",
      "KYC Status": "Pending",
      ...body,
    });
    res.status(201).json({ customerId });
  } catch (err) {
    next(err);
  }
});

export { FG_VIRTUAL_COLUMNS };
