import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import { appendRow, readTable } from "../../services/sheets.js";
import { nextSequentialId } from "../../services/ids.js";
import { hasNpdRole } from "../npdPermissions.js";

/**
 * Purchase → Goods Receipt (build-prompt §5.6). New `Upload Tax Invoice` and `Store In` tabs
 * on env.sheets.npd (trimmed from the xlsx workbook — no `Items GST` line-item breakdown tab;
 * this app captures GST at the invoice level only, a deliberate scope cut given no per-item
 * purchase-order structure exists yet to attach line-level GST to). Vendor Master already
 * exists from Sprint 1 (taxonomy.ts's `vendor-master` table) — reused here via `vendorId`.
 * `WIP MASTER`/`MASTER OF FG INVENTORY` (the actual stock ledger this goods receipt would
 * eventually update) are Sprint 6 — `Store In` here just records the receipt event and its QC
 * decision, it doesn't yet move any stock-on-hand number anywhere.
 */
export const purchaseRouter = Router();

const INVOICE_TAB = "Upload Tax Invoice";
const INVOICE_ID_COLUMN = "Invoice ID";
const STORE_IN_TAB = "Store In";
const STORE_IN_ID_COLUMN = "Store In ID";

purchaseRouter.get("/tax-invoices", async (_req, res, next) => {
  try {
    const rows = await readTable(env.sheets.npd, INVOICE_TAB);
    res.json({ invoices: rows });
  } catch (err) {
    next(err);
  }
});

const InvoiceSchema = z.object({
  vendorId: z.string().trim().min(1),
  invoiceNo: z.string().trim().min(1),
  invoiceDate: z.string().trim().optional(),
  basicAmount: z.number().nonnegative(),
  cgst: z.number().nonnegative().default(0),
  sgst: z.number().nonnegative().default(0),
  igst: z.number().nonnegative().default(0),
  tds: z.number().nonnegative().default(0),
  discount: z.number().nonnegative().default(0),
});

purchaseRouter.post("/tax-invoices", async (req, res, next) => {
  try {
    const allowed = await hasNpdRole(req.user!.employeeId, ["purchase"]);
    if (!allowed) return res.status(403).json({ error: { code: "FORBIDDEN", message: "Purchase or Admin only" } });

    const body = InvoiceSchema.parse(req.body);
    const vendors = await readTable(env.sheets.npd, "Vendor Master");
    const vendor = vendors.find((v) => v["Vendor ID"] === body.vendorId);
    if (!vendor) return res.status(404).json({ error: { code: "VENDOR_NOT_FOUND", message: "Vendor not found" } });

    // Server-computed, never trust client math — same convention as Sales CRR's own Tax
    // Invoice handling (see CLAUDE.md's "compute Total Amount Inc Tax server-side" note).
    const totalAmountIncTax = body.basicAmount + body.cgst + body.sgst + body.igst - body.tds - body.discount;

    const id = await nextSequentialId(env.sheets.npd, INVOICE_TAB, INVOICE_ID_COLUMN, "INV");
    await appendRow(env.sheets.npd, INVOICE_TAB, {
      Timestamp: new Date().toISOString(),
      Useremail: req.user!.employeeId,
      [INVOICE_ID_COLUMN]: id,
      "Vendor ID": body.vendorId,
      "Vendor Name": vendor["Vendor Name"] ?? "",
      "Invoice No.": body.invoiceNo,
      "Invoice Date": body.invoiceDate ?? "",
      "Basic Amount": String(body.basicAmount),
      CGST: String(body.cgst),
      SGST: String(body.sgst),
      IGST: String(body.igst),
      TDS: String(body.tds),
      Discount: String(body.discount),
      "Total Amount Inc Tax": String(totalAmountIncTax),
      Status: "Recorded",
    });
    res.status(201).json({ id, totalAmountIncTax });
  } catch (err) {
    next(err);
  }
});

// --- Store In (goods receipt against an invoice) ---

purchaseRouter.get("/store-in", async (req, res, next) => {
  try {
    const invoiceId = typeof req.query.invoiceId === "string" ? req.query.invoiceId : undefined;
    const rows = await readTable(env.sheets.npd, STORE_IN_TAB);
    res.json({ entries: invoiceId ? rows.filter((r) => r["Invoice ID"] === invoiceId) : rows });
  } catch (err) {
    next(err);
  }
});

const StoreInSchema = z.object({
  invoiceId: z.string().trim().min(1),
  rmId: z.string().trim().min(1),
  quantity: z.number().positive(),
  qcStatus: z.enum(["Passed", "Failed"]),
  weightCheckImage: z.string().trim().optional(),
  remarks: z.string().trim().optional(),
});

purchaseRouter.post("/store-in", async (req, res, next) => {
  try {
    const allowed = await hasNpdRole(req.user!.employeeId, ["store", "purchase"]);
    if (!allowed) return res.status(403).json({ error: { code: "FORBIDDEN", message: "Store/Warehouse, Purchase, or Admin only" } });

    const body = StoreInSchema.parse(req.body);
    const invoices = await readTable(env.sheets.npd, INVOICE_TAB);
    const invoice = invoices.find((i) => i[INVOICE_ID_COLUMN] === body.invoiceId);
    if (!invoice) return res.status(404).json({ error: { code: "INVOICE_NOT_FOUND", message: "Tax invoice not found" } });

    const rmRows = await readTable(env.sheets.npd, "Raw Material SKU");
    const rm = rmRows.find((r) => r["ID'S"] === body.rmId);
    if (!rm) return res.status(404).json({ error: { code: "RM_NOT_FOUND", message: "RM SKU not found" } });

    const id = await nextSequentialId(env.sheets.npd, STORE_IN_TAB, STORE_IN_ID_COLUMN, "STIN");
    await appendRow(env.sheets.npd, STORE_IN_TAB, {
      Timestamp: new Date().toISOString(),
      Useremail: req.user!.employeeId,
      [STORE_IN_ID_COLUMN]: id,
      "Invoice ID": body.invoiceId,
      "RM ID": body.rmId,
      "RM Code": rm["PART NO."] ?? "",
      Quantity: String(body.quantity),
      "QC Status": body.qcStatus,
      "Weight Check Image": body.weightCheckImage ?? "",
      Remarks: body.remarks ?? "",
    });
    res.status(201).json({ id });
  } catch (err) {
    next(err);
  }
});
