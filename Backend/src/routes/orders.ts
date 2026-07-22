import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { appendRow, deleteRows, readTable, updateRow, type SheetRow } from "../services/sheets.js";
import { nextId } from "../services/ids.js";
import { requireAuth, requireCanDelete, requireModule } from "../middleware/auth.js";

export const ordersRouter = Router();
ordersRouter.use(requireAuth);
ordersRouter.use(requireModule("punch-order"));

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
  saleType: z.enum(["Regular", "Sample"]).optional().default("Regular"),
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
  shippingSame: z.enum(["Yes", "No"]).optional(),
  shippingAddress: z.string().optional().default(""),
  shippingState: z.string().optional().default(""),
  shippingPincode: z.string().optional().default(""),
  preferredDeliveryMode: z.string().optional().default(""),
  preferredTransportMode: z.string().optional().default(""),
  freightPaidBy: z.string().optional().default(""),
  freightOnInvoice: z.enum(["Yes", "No"]).optional().default("No"),
  preferredTptId: z.string().optional().default(""),
  items: z.array(itemSchema).optional().default([]),
  dispatchPlan: z.array(dispatchPlanLineSchema).optional().default([]),
});

function money(n: number) {
  return n.toFixed(2);
}

ordersRouter.get("/", async (req, res, next) => {
  try {
    const { stage, status } = req.query as { stage?: string; status?: string };
    const rows = await readTable(env.sheets.transactions, "ORDERS");
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
    const orders = await readTable(env.sheets.transactions, "ORDERS");
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
      readTable(env.sheets.transactions, "ORDERS"),
      readTable(env.sheets.transactions, "ORDER_ITEMS"),
      readTable(env.sheets.transactions, "DISPATCH_PLAN"),
    ]);
    const order = orders.find((o) => o.ORDER_ID === req.params.id);
    if (!order) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Order not found" } });
    }
    res.json({
      order,
      items: items.filter((i) => i.ORDER_ID === req.params.id),
      dispatchPlan: dispatchPlan.filter((d) => d.ORDER_ID === req.params.id),
    });
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
    const deleted = await deleteRows(env.sheets.transactions, "ORDERS", "ORDER_ID", orderIds);
    res.json({ deleted });
  } catch (err) {
    next(err);
  }
});

ordersRouter.post("/", async (req, res, next) => {
  try {
    const body = createOrderSchema.parse(req.body);
    const now = new Date().toISOString();
    const orderId = await nextId("ORD");

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

    for (const plan of body.dispatchPlan) {
      const targetItem = itemRows[plan.itemIndex];
      if (!targetItem) continue;
      const dspId = await nextId("DSP");
      await appendRow(env.sheets.transactions, "DISPATCH_PLAN", {
        DSP_ID: dspId,
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

    await appendRow(env.sheets.transactions, "ORDERS", {
      ORDER_ID: orderId,
      PO_NO: body.poNo,
      PO_DATE: body.poDate,
      PO_ATTACHMENT_URL: body.poAttachmentUrl,
      OTHER_ATTACHMENT_URL: body.otherAttachmentUrl,
      PO_REMARKS: body.poRemarks,
      ORDER_TYPE: body.orderType,
      SALE_TYPE: body.saleType,
      PAYMENT_TYPE: body.paymentType,
      ADVANCE_PCT: body.advancePct !== undefined ? String(body.advancePct) : "",
      CUST_ID: body.custId,
      CUSTOMER_NAME: body.customerName,
      BUYER_GSTIN: body.buyerGstin,
      CLIENT_CLASSIFICATION: body.clientClassification ?? "",
      THIS_ORDER_PAYMENT_TERMS: body.thisOrderPaymentTerms,
      CONTACT_PERSON: body.contactPerson,
      CONTACT_NO: body.contactNo,
      ORDER_GIVEN_BY: body.orderGivenBy,
      SALE_STAFF_NAME: body.saleStaffName,
      BILLING_ADDRESS: body.billingAddress,
      BILLING_STATE: body.billingState,
      BILLING_PINCODE: body.billingPincode,
      SHIPPING_SAME: body.shippingSame ?? "",
      SHIPPING_ADDRESS: body.shippingAddress,
      SHIPPING_STATE: body.shippingState,
      SHIPPING_PINCODE: body.shippingPincode,
      PREFERRED_DELIVERY_MODE: body.preferredDeliveryMode,
      PREFERRED_TRANSPORT_MODE: body.preferredTransportMode,
      FREIGHT_PAID_BY: body.freightPaidBy,
      FREIGHT_ON_INVOICE: body.freightOnInvoice,
      PREFERRED_TPT_ID: body.preferredTptId,
      BASIC_AMOUNT: money(basicAmount),
      TAX_AMOUNT: money(taxAmount),
      TOTAL_AMOUNT: money(basicAmount + taxAmount),
      CURRENT_STAGE: "Punch",
      APPROVAL_STATUS: "",
      APPROVAL_REMARKS: "",
      STATUS: "PENDING",
      CREATED_AT: now,
      CREATED_BY: req.user!.email,
      UPDATED_AT: now,
      UPDATED_BY: req.user!.email,
      ROW_VERSION: "1",
    });

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

/** Applies the Sale Order discount, recalculates TOTAL_AMOUNT, and pushes the order into
 * the Sale Order stage's pending queue. */
ordersRouter.post("/:id/discount", async (req, res, next) => {
  try {
    const body = discountSchema.parse(req.body);
    const orders = await readTable(env.sheets.transactions, "ORDERS");
    const order = orders.find((o) => o.ORDER_ID === req.params.id);
    if (!order) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Order not found" } });
    }

    const basicAmount = Number(order.BASIC_AMOUNT || 0);
    const taxAmount = Number(order.TAX_AMOUNT || 0);
    const discountRs = body.type === "Percentage" ? (basicAmount * (body.discountPct ?? 0)) / 100 : body.discountRs ?? 0;
    const totalAmount = basicAmount + taxAmount - discountRs;

    await updateRow(env.sheets.transactions, "ORDERS", "ORDER_ID", req.params.id, {
      DISCOUNT_REASON: body.reason,
      DISCOUNT_DESCRIPTION: body.description,
      DISCOUNT_TYPE: body.type,
      DISCOUNT_PCT: body.type === "Percentage" ? String(body.discountPct) : "",
      DISCOUNT_RS: money(discountRs),
      TOTAL_AMOUNT: money(totalAmount),
      // Stays in the "Punch" stage (still shows in both Punch Order's and Sale Order's
      // pending queues — there's no separate Sale Order stage/sheet yet) but the status
      // label flips so it reads as reviewed-with-discount rather than freshly punched.
      STATUS: "PENDING SALE ORDER",
      UPDATED_AT: new Date().toISOString(),
      UPDATED_BY: req.user!.email,
    });

    res.json({ orderId: req.params.id, discountRs: money(discountRs), totalAmount: money(totalAmount) });
  } catch (err) {
    next(err);
  }
});

/** Advances an order to the next pipeline stage (marks current stage record COMPLETED). */
ordersRouter.post("/:id/stage", async (req, res, next) => {
  try {
    const schema = z.object({ toStage: z.string(), remarks: z.string().optional() });
    const { toStage, remarks } = schema.parse(req.body);
    await updateRow(env.sheets.transactions, "ORDERS", "ORDER_ID", req.params.id, {
      CURRENT_STAGE: toStage,
      UPDATED_AT: new Date().toISOString(),
      UPDATED_BY: req.user!.email,
      ...(remarks ? { APPROVAL_REMARKS: remarks } : {}),
    });
    res.json({ orderId: req.params.id, currentStage: toStage });
  } catch (err) {
    next(err);
  }
});
