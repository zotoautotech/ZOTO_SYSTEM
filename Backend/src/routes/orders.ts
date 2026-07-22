import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { appendRow, deleteRows, ensureSheetTab, readTable, updateRow, type SheetRow } from "../services/sheets.js";
import { nextId, nextIds } from "../services/ids.js";
import { requireAuth, requireCanDelete, requireModule } from "../middleware/auth.js";
import { punchFromSheet, punchToSheet, saleOrderFromSheet, saleOrderToSheet } from "./orderPunchMap.js";

export const ordersRouter = Router();
ordersRouter.use(requireAuth);
ordersRouter.use(requireModule("punch-order"));

// The transactions sheet's order-header tab was renamed ORDERS -> ORDER_PUNCH and its
// columns given human-readable names; punchToSheet/punchFromSheet translate between the
// API's internal field names and those headers (see orderPunchMap.ts).
const ORDER_TAB = "ORDER_PUNCH";

/** Reads the single ZOTO seller branch (SALLER_MASTER, one row) to auto-fill the order's
 * Seller Details section on save. Returns internal-keyed seller fields (blank on failure). */
async function getSellerFields(): Promise<SheetRow> {
  try {
    const rows = await readTable(env.sheets.customerBilling, "SALLER_MASTER", { ttlMs: 5 * 60_000 });
    const branch = rows.find((r) => r["ADC Firm ID"]) ?? rows[0];
    if (!branch) return {};
    return {
      BRANCH_ID: branch["ADC Firm ID"] || "",
      BRANCH_NAME: branch["Branch Name"] || "",
      SELLER_GSTIN: branch["GSTIN"] || "",
      SELLER_EMAIL: branch["Email"] || "",
      SELLER_CONTACT: branch["Contact No."] || "",
      SELLER_ADDRESS_1: branch["Address Line 1"] || "",
      SELLER_ADDRESS_2: branch["Address Line 2"] || "",
      SELLER_STATE: branch["State"] || "",
      SELLER_PINCODE: branch["Pin Code"] || "",
      SELLER_COUNTRY: branch["Country"] || "India",
    };
  } catch {
    return {};
  }
}

/** Reads the buyer's row from CUSTOMER MASTER T1 to auto-fill buyer contact/segment fields
 * the punch form doesn't capture directly. Returns internal-keyed fields (blank on failure). */
async function getBuyerFields(custId: string): Promise<SheetRow> {
  if (!custId) return {};
  try {
    const rows = await readTable(env.sheets.customerBilling, "CUSTOMER MASTER T1", { headerRow: 2, ttlMs: 5 * 60_000 });
    const c = rows.find((r) => r["CUST ID"] === custId);
    if (!c) return {};
    return {
      BUSINESS_SEGMENT: c["Business Segment"] || "",
      TYPE_OF_CUSTOMER: c["TYPE OF CUSTOMER"] || "",
      BUYER_EMAIL: c["REGISTERED EMAIL ID"] || "",
      BUYER_CONTACT: c["REGISTERED MOBILE NO."] || "",
      PAYMENT_TERMS: c["Payment Terms With Days"] || "",
    };
  } catch {
    return {};
  }
}

// Nothing on Order Punch is mandatory (removed at the user's request so the team can
// punch partial orders and fill gaps in later) — every field here is optional/defaulted.
const itemSchema = z.object({
  fgId: z.string().optional().default(""),
  partNo: z.string().optional().default(""),
  partName: z.string().optional().default(""),
  segment: z.string().optional().default(""),
  category: z.string().optional().default(""),
  strategyId: z.string().optional().default(""),
  price: z.number().optional().default(0),
  qty: z.number().min(0).optional().default(0),
  uom: z.string().optional().default("NOS"),
  discountOn: z.enum(["Percentage", "Rupees"]).optional().default("Percentage"),
  discountRs: z.number().optional().default(0),
  discountPct: z.number().optional().default(0),
  gstSlabPct: z.number().optional().default(0),
  specialInstructions: z.string().optional().default(""),
  packingRequirements: z.string().optional().default(""),
  notes: z.string().optional().default(""),
});

const dispatchPlanLineSchema = z.object({
  itemIndex: z.number().int().nonnegative(),
  expectedDate: z.string(),
  plannedQty: z.number().positive(),
  uom: z.string().default("NOS"),
});

const createOrderSchema = z.object({
  poNo: z.string().optional().default(""),
  poDate: z.string().optional().default(""),
  poAttachmentUrl: z.string().optional().default(""),
  otherAttachmentUrl: z.string().optional().default(""),
  poRemarks: z.string().optional().default(""),
  orderType: z.enum(["Order Incoming", "Order Outgoing"]).optional().default("Order Incoming"),
  saleType: z.enum(["Order", "Sample", "Return Order"]).optional().default("Order"),
  paymentType: z.enum(["Credit", "Advance"]).optional().default("Credit"),
  advancePct: z.number().min(0).max(100).optional(),
  custId: z.string().optional().default(""),
  customerName: z.string().optional().default(""),
  buyerGstin: z.string().optional().default(""),
  clientClassification: z.enum(["Existing", "New", "Prospective"]).optional(),
  thisOrderPaymentTerms: z.string().optional().default(""),
  contactPerson: z.string().optional().default(""),
  contactNo: z.string().optional().default(""),
  orderGivenBy: z.string().optional().default(""),
  saleStaffName: z.string().optional().default(""),
  billingAddress: z.string().optional().default(""),
  billingState: z.string().optional().default(""),
  billingPincode: z.string().optional().default(""),
  billingCountry: z.string().optional().default("India"),
  shippingSame: z.enum(["Yes", "No"]).optional(),
  shippingAddress: z.string().optional().default(""),
  shippingState: z.string().optional().default(""),
  shippingPincode: z.string().optional().default(""),
  preferredDeliveryMode: z.string().optional().default(""),
  preferredTransportMode: z.string().optional().default(""),
  freightPaidBy: z.string().optional().default(""),
  freightOnInvoice: z.enum(["Yes", "No"]).optional().default("No"),
  preferredTptId: z.string().optional().default(""),
  preferredTptName: z.string().optional().default(""),
  transporterType: z.string().optional().default(""),
  transporterContactNo: z.string().optional().default(""),
  transporterPersonName: z.string().optional().default(""),
  transporterPersonContactNo: z.string().optional().default(""),
  transporterAddress: z.string().optional().default(""),
  items: z.array(itemSchema).optional().default([]),
  dispatchPlan: z.array(dispatchPlanLineSchema).optional().default([]),
});

function money(n: number) {
  return n.toFixed(2);
}

ordersRouter.get("/", async (req, res, next) => {
  try {
    const { stage, status } = req.query as { stage?: string; status?: string };
    const rows = (await readTable(env.sheets.transactions, ORDER_TAB)).map(punchFromSheet);
    const filtered = rows.filter(
      (r) => (!stage || r.CURRENT_STAGE === stage) && (!status || r.STATUS === status)
    );
    res.json(filtered);
  } catch (err) {
    next(err);
  }
});

/** Most recent order for a customer, used to autofill "Shipping = Same as Previous Order". */
ordersRouter.get("/latest", async (req, res, next) => {
  try {
    const { custId } = req.query as { custId?: string };
    if (!custId) {
      return res.status(400).json({ error: { code: "BAD_REQUEST", message: "custId query param is required" } });
    }
    const orders = (await readTable(env.sheets.transactions, ORDER_TAB)).map(punchFromSheet);
    const customerOrders = orders
      .filter((o) => o.CUST_ID === custId)
      .sort((a, b) => (b.CREATED_AT ?? "").localeCompare(a.CREATED_AT ?? ""));

    if (customerOrders.length === 0) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "No previous order for this customer" } });
    }
    res.json(customerOrders[0]);
  } catch (err) {
    next(err);
  }
});

ordersRouter.get("/:id", async (req, res, next) => {
  try {
    const [orders, items, dispatchPlan] = await Promise.all([
      readTable(env.sheets.transactions, ORDER_TAB),
      readTable(env.sheets.transactions, "ORDER_ITEMS"),
      readTable(env.sheets.transactions, "DISPATCH_PLAN"),
    ]);
    const sheetOrder = orders.find((o) => o.ORDER_ID === req.params.id);
    if (!sheetOrder) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Order not found" } });
    }
    res.json({
      order: punchFromSheet(sheetOrder),
      items: items.filter((i) => i.ORDER_ID === req.params.id),
      dispatchPlan: dispatchPlan.filter((d) => d.ORDER_ID === req.params.id),
    });
  } catch (err) {
    next(err);
  }
});

/** Returns the SALE_ORDERS row for an order (once its Sale Order form has been saved), or null. */
ordersRouter.get("/:id/sale-order", async (req, res, next) => {
  try {
    const rows = await readTable(env.sheets.transactions, "SALE_ORDERS");
    const row = rows.find((r) => r.ORDER_ID === req.params.id);
    res.json(row ? saleOrderFromSheet(row) : null);
  } catch (err) {
    next(err);
  }
});

const deleteOrdersSchema = z.object({ orderIds: z.array(z.string().min(1)).min(1) });

/** Permanently deletes the given orders and their line items / dispatch plan rows. */
ordersRouter.delete("/", requireCanDelete, async (req, res, next) => {
  try {
    const { orderIds } = deleteOrdersSchema.parse(req.body);
    await deleteRows(env.sheets.transactions, "ORDER_ITEMS", "ORDER_ID", orderIds);
    await deleteRows(env.sheets.transactions, "DISPATCH_PLAN", "ORDER_ID", orderIds);
    const deleted = await deleteRows(env.sheets.transactions, ORDER_TAB, "ORDER_ID", orderIds);
    res.json({ deleted });
  } catch (err) {
    next(err);
  }
});

ordersRouter.post("/", async (req, res, next) => {
  try {
    const body = createOrderSchema.parse(req.body);
    const now = new Date().toISOString();
    const orderId = await nextId("ORD", ORDER_TAB, "ORDER_ID");

    let basicAmount = 0;
    let taxAmount = 0;

    const itemRows: SheetRow[] = [];
    for (const item of body.items) {
      const itemId = `${orderId}-${String(itemRows.length + 1).padStart(2, "0")}`;
      const lineBasic = item.price * item.qty - item.discountRs;
      const cgst = (lineBasic * item.gstSlabPct) / 2 / 100;
      const sgst = cgst;
      const lineTax = cgst + sgst;
      basicAmount += lineBasic;
      taxAmount += lineTax;

      itemRows.push({
        ITEM_ID: itemId,
        ORDER_ID: orderId,
        FG_ID: item.fgId,
        PART_NO: item.partNo,
        PART_NAME: item.partName,
        SEGMENT: item.segment,
        CATEGORY: item.category,
        STRATEGY_ID: item.strategyId,
        PRICE: money(item.price),
        QTY: String(item.qty),
        UOM: item.uom,
        DISCOUNT_ON: item.discountOn,
        DISCOUNT_RS: money(item.discountRs),
        DISCOUNT_PCT: String(item.discountPct),
        BASIC_AMOUNT: money(lineBasic),
        GST_SLAB_PCT: String(item.gstSlabPct),
        CGST: money(cgst),
        SGST: money(sgst),
        IGST: "0.00",
        TAX_AMOUNT: money(lineTax),
        TOTAL_AMOUNT: money(lineBasic + lineTax),
        SPECIAL_INSTRUCTIONS: item.specialInstructions,
        PACKING_REQUIREMENTS: item.packingRequirements,
        NOTES: item.notes,
        STATUS: "PENDING",
        // ORDER_ITEMS uses Timestamp/Useremail (not CREATED_AT/BY); include both — the
        // extra CREATED_* keys below are harmlessly ignored (no matching header).
        Timestamp: now,
        Useremail: req.user!.email,
        CREATED_AT: now,
        CREATED_BY: req.user!.email,
        UPDATED_AT: now,
        UPDATED_BY: req.user!.email,
        ROW_VERSION: "1",
      });
    }

    for (const row of itemRows) {
      await appendRow(env.sheets.transactions, "ORDER_ITEMS", row);
    }

    const dspIds = await nextIds("DSP", "DISPATCH_PLAN", "DSP_ID", body.dispatchPlan.length);
    for (const [i, plan] of body.dispatchPlan.entries()) {
      const targetItem = itemRows[plan.itemIndex];
      if (!targetItem) continue;
      await appendRow(env.sheets.transactions, "DISPATCH_PLAN", {
        DSP_ID: dspIds[i],
        ITEM_ID: targetItem.ITEM_ID,
        ORDER_ID: orderId,
        EXPECTED_DATE: plan.expectedDate,
        PLANNED_QTY: String(plan.plannedQty),
        UOM: plan.uom,
        STATUS: "PENDING",
        CREATED_AT: now,
        CREATED_BY: req.user!.email,
        UPDATED_AT: now,
        UPDATED_BY: req.user!.email,
        ROW_VERSION: "1",
      });
    }

    // Auto-fill the Seller Details section (fixed ZOTO branch) and buyer contact/segment
    // fields from the masters, then translate everything to ORDER_PUNCH's sheet headers.
    const [seller, buyer] = await Promise.all([getSellerFields(), getBuyerFields(body.custId)]);
    await appendRow(
      env.sheets.transactions,
      ORDER_TAB,
      punchToSheet({
        ORDER_ID: orderId,
        CREATED_AT: now,
        CREATED_BY: req.user!.email,
        PO_NO: body.poNo,
        PO_DATE: body.poDate,
        PO_ATTACHMENT_URL: body.poAttachmentUrl,
        OTHER_ATTACHMENT_URL: body.otherAttachmentUrl,
        PO_REMARKS: body.poRemarks,
        ORDER_TYPE: body.orderType,
        SALE_TYPE: body.saleType,
        PAYMENT_TYPE: body.paymentType,
        ADVANCE_PCT: body.advancePct !== undefined ? String(body.advancePct) : "",
        ...seller,
        CUST_ID: body.custId,
        CUSTOMER_NAME: body.customerName,
        ...buyer,
        BUYER_GSTIN: body.buyerGstin,
        THIS_ORDER_PAYMENT_TERMS: body.thisOrderPaymentTerms,
        CONTACT_PERSON: body.contactPerson,
        CONTACT_NO: body.contactNo,
        ORDER_GIVEN_BY: body.orderGivenBy,
        SALE_STAFF_NAME: body.saleStaffName,
        BILLING_ADDRESS: body.billingAddress,
        BILLING_STATE: body.billingState,
        BILLING_PINCODE: body.billingPincode,
        BILLING_COUNTRY: body.billingCountry,
        SHIPPING_SAME: body.shippingSame ?? "",
        SHIPPING_ADDRESS: body.shippingAddress,
        SHIPPING_STATE: body.shippingState,
        SHIPPING_PINCODE: body.shippingPincode,
        PREFERRED_DELIVERY_MODE: body.preferredDeliveryMode,
        PREFERRED_TRANSPORT_MODE: body.preferredTransportMode,
        FREIGHT_PAID_BY: body.freightPaidBy,
        FREIGHT_ON_INVOICE: body.freightOnInvoice,
        PREFERRED_TPT_ID: body.preferredTptId,
        PREFERRED_TPT_NAME: body.preferredTptName,
        TRANSPORTER_TYPE: body.transporterType,
        TRANSPORTER_CONTACT: body.transporterContactNo,
        TRANSPORTER_PERSON_NAME: body.transporterPersonName,
        TRANSPORTER_PERSON_CONTACT: body.transporterPersonContactNo,
        TRANSPORTER_ADDRESS: body.transporterAddress,
        BASIC_AMOUNT: money(basicAmount),
        TAX_AMOUNT: money(taxAmount),
        TOTAL_AMOUNT: money(basicAmount + taxAmount),
        APPROVAL_STATUS: "",
        APPROVAL_REMARKS: "",
        STATUS: "PENDING",
      })
    );

    res.status(201).json({ orderId });
  } catch (err) {
    next(err);
  }
});

const discountSchema = z
  .object({
    reason: z.string().min(1),
    description: z.string().optional().default(""),
    type: z.enum(["Percentage", "Rupees"]),
    discountPct: z.number().min(0).max(100).optional(),
    discountRs: z.number().min(0).optional(),
  })
  .refine((b) => (b.type === "Percentage" ? b.discountPct !== undefined : b.discountRs !== undefined), {
    message: "discountPct is required for Percentage, discountRs is required for Rupees",
  });

// Matches the old ADC system's "Order Punch Discount" tab (Timestamp, Useremail, Punch ID,
// Punch Discount ID, Discount Reason, Description, Discount Type/%/Rs, Status) — created
// automatically on first use since it isn't part of the current sheet's pre-built tabs.
const DISCOUNT_LOG_TAB = "ORDER_PUNCH_DISCOUNT";
const DISCOUNT_LOG_HEADERS = [
  "TIMESTAMP",
  "USEREMAIL",
  "ORDER_ID",
  "PUNCH_DISCOUNT_ID",
  "DISCOUNT_REASON",
  "DESCRIPTION",
  "DISCOUNT_TYPE",
  "DISCOUNT_PCT",
  "DISCOUNT_RS",
  "STATUS",
];

/** Applies the Sale Order discount, recalculates TOTAL_AMOUNT, logs the action to the
 * Order Punch Discount tab, and pushes the order into the Sale Order stage's pending queue. */
ordersRouter.post("/:id/discount", async (req, res, next) => {
  try {
    const body = discountSchema.parse(req.body);
    const orders = (await readTable(env.sheets.transactions, ORDER_TAB)).map(punchFromSheet);
    const order = orders.find((o) => o.ORDER_ID === req.params.id);
    if (!order) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Order not found" } });
    }

    const basicAmount = Number(order.BASIC_AMOUNT || 0);
    const taxAmount = Number(order.TAX_AMOUNT || 0);
    const discountRs = body.type === "Percentage" ? (basicAmount * (body.discountPct ?? 0)) / 100 : body.discountRs ?? 0;
    const totalAmount = basicAmount + taxAmount - discountRs;
    const now = new Date().toISOString();

    await updateRow(
      env.sheets.transactions,
      ORDER_TAB,
      "ORDER_ID",
      req.params.id,
      punchToSheet({
        INVOICE_DISCOUNT_RS: money(discountRs),
        TOTAL_AMOUNT: money(totalAmount),
        // Status flips so the order reads as reviewed-with-discount; the full discount
        // detail is captured in the ORDER_PUNCH_DISCOUNT log below (and, in phase 2, SALE_ORDERS).
        STATUS: "PENDING SALE ORDER",
      })
    );

    await ensureSheetTab(env.sheets.transactions, DISCOUNT_LOG_TAB, DISCOUNT_LOG_HEADERS);
    const punchDiscountId = await nextId("DISC", DISCOUNT_LOG_TAB, "PUNCH_DISCOUNT_ID");
    await appendRow(env.sheets.transactions, DISCOUNT_LOG_TAB, {
      TIMESTAMP: now,
      USEREMAIL: req.user!.email,
      ORDER_ID: req.params.id,
      PUNCH_DISCOUNT_ID: punchDiscountId,
      DISCOUNT_REASON: body.reason,
      DESCRIPTION: body.description,
      DISCOUNT_TYPE: body.type,
      DISCOUNT_PCT: body.type === "Percentage" ? String(body.discountPct) : "",
      DISCOUNT_RS: money(discountRs),
      STATUS: "PENDING SALE ORDER",
    });

    res.json({ orderId: req.params.id, discountRs: money(discountRs), totalAmount: money(totalAmount) });
  } catch (err) {
    next(err);
  }
});

const saleOrderFormSchema = z.object({
  soNo: z.string().min(1),
  soDate: z.string().min(1),
  soAttachmentUrl: z.string().min(1),
  soRemarks: z.string().optional().default(""),
});

/** Saves the Sale Order form: creates a full SALE_ORDERS row (a copy of the punch order +
 * the carried discount + SO No./Date/Attachment/Remarks) and marks the punch order done. */
ordersRouter.post("/:id/sale-order-form", async (req, res, next) => {
  try {
    const body = saleOrderFormSchema.parse(req.body);
    const orders = (await readTable(env.sheets.transactions, ORDER_TAB)).map(punchFromSheet);
    const order = orders.find((o) => o.ORDER_ID === req.params.id);
    if (!order) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Order not found" } });
    }

    const now = new Date().toISOString();
    const saleOrderId = await nextId("SO", "SALE_ORDERS", "SALE_ORDER_ID");

    await appendRow(
      env.sheets.transactions,
      "SALE_ORDERS",
      saleOrderToSheet({
        // Copy every order-header field captured at Punch (PO, seller, buyer, billing,
        // shipping, consignee, logistics, amounts, carried discount)...
        ...order,
        // ...then set the sale-order-specific fields (these win over the spread).
        CREATED_AT: now,
        CREATED_BY: req.user!.email,
        ORDER_ID: req.params.id,
        SALE_ORDER_ID: saleOrderId,
        SO_NO: body.soNo,
        SO_DATE: body.soDate,
        SO_ATTACHMENT_URL: body.soAttachmentUrl,
        SO_REMARKS: body.soRemarks,
        STATUS: "PENDING",
      })
    );

    // SALE_ORDER_ITEMS uses the same column names as ORDER_ITEMS (no renaming), so each
    // punch item row is copied over as-is, just adding the two sale-order link IDs.
    const items = (await readTable(env.sheets.transactions, "ORDER_ITEMS")).filter(
      (i) => i.ORDER_ID === req.params.id
    );
    const soItemIds = await nextIds("SOI", "SALE_ORDER_ITEMS", "SALE_ORDER_ITEM_ID", items.length);
    for (const [i, item] of items.entries()) {
      await appendRow(env.sheets.transactions, "SALE_ORDER_ITEMS", {
        ...item,
        Timestamp: now,
        Useremail: req.user!.email,
        SALE_ORDER_ID: saleOrderId,
        SALE_ORDER_ITEM_ID: soItemIds[i],
      });
    }

    // The punch order's part in the pipeline is done; mark it so the Sale Order actions hide.
    await updateRow(
      env.sheets.transactions,
      ORDER_TAB,
      "ORDER_ID",
      req.params.id,
      punchToSheet({ STATUS: "SALE ORDER", CREATED_BY: req.user!.email })
    );

    res.json({ orderId: req.params.id, saleOrderId });
  } catch (err) {
    next(err);
  }
});

/** Advances an order to the next pipeline stage. Note: ORDER_PUNCH has no stage column, so
 * this reflects the change via STATUS only until the pipeline tabs are wired (phase 2). */
ordersRouter.post("/:id/stage", async (req, res, next) => {
  try {
    const schema = z.object({ toStage: z.string(), remarks: z.string().optional() });
    const { toStage, remarks } = schema.parse(req.body);
    await updateRow(
      env.sheets.transactions,
      ORDER_TAB,
      "ORDER_ID",
      req.params.id,
      punchToSheet({ APPROVAL_REMARKS: remarks ?? "", CREATED_BY: req.user!.email })
    );
    res.json({ orderId: req.params.id, currentStage: toStage });
  } catch (err) {
    next(err);
  }
});
