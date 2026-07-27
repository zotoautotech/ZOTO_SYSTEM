import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { appendRow, appendRows, deleteRows, ensureSheetTab, readTable, updateRow, type SheetRow } from "../services/sheets.js";
import { nextId, nextIds } from "../services/ids.js";
import { requireAuth, requireCanDelete, requireModule } from "../middleware/auth.js";
import { punchFromSheet, punchToSheet, saleOrderFromSheet, saleOrderToSheet } from "./orderPunchMap.js";
import { dispatchApprovalToSheet, soConfirmationItemToSheet, soConfirmationToSheet } from "./soConfirmationMap.js";
import { registerStageRoutes } from "./stageRoutes.js";
import { itemFromSheet, itemToSheet } from "./itemMap.js";

export const ordersRouter = Router();
ordersRouter.use(requireAuth);
ordersRouter.use(requireModule("punch-order"));

// The transactions sheet's order-header tab was renamed ORDERS -> ORDER_PUNCH and its
// columns given human-readable names; punchToSheet/punchFromSheet translate between the
// API's internal field names and those headers (see orderPunchMap.ts).
const ORDER_TAB = "ORDER_PUNCH";

/** Reads the single ZOTO seller branch (SALLER_MASTER, one row) to auto-fill the order's
 * Seller Details section on save. Returns internal-keyed seller fields (blank on failure). */
export async function getSellerFields(): Promise<SheetRow> {
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
      // Auto-picked, not user-entered — the punch form has no GSTIN input of its own.
      BUYER_GSTIN: c["Company GSTIN NO."] || "",
      // Auto-picked from the customer master (not user-entered) — only the Sales
      // Representative's Name column, not the "customer with id" field next to it.
      // NB: the live sheet's header is actually misspelled "Repersentative".
      SALE_STAFF_NAME: c["Field Sale Repersentative"] || "",
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
  clientClassification: z.enum(["Existing", "New", "Prospective"]).optional(),
  thisOrderPaymentTerms: z.string().optional().default(""),
  contactPerson: z.string().optional().default(""),
  contactNo: z.string().optional().default(""),
  orderGivenBy: z.string().optional().default(""),
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

/** GST invoices round the order-level Total Amount off to the nearest whole rupee (never
 * per line item — that would make the line items' sum drift from the header total). Applied
 * automatically wherever TOTAL_AMOUNT is (re)computed at the order/sale-order level. */
function roundOff(n: number): number {
  return Math.round(n);
}

/** Intra-state (buyer's billing state matches the seller branch's state) splits the line's
 * GST evenly into CGST+SGST; inter-state charges the full rate as IGST instead. Blank state
 * on either side falls back to the old always-CGST/SGST behavior rather than guessing. */
function splitGst(lineBasic: number, gstSlabPct: number, buyerState: string, sellerState: string) {
  const totalTax = (lineBasic * gstSlabPct) / 100;
  const buyer = buyerState.trim().toLowerCase();
  const seller = sellerState.trim().toLowerCase();
  const sameState = !buyer || !seller || buyer === seller;
  if (sameState) {
    const half = totalTax / 2;
    return { cgst: half, sgst: half, igst: 0, lineTax: totalTax };
  }
  return { cgst: 0, sgst: 0, igst: totalTax, lineTax: totalTax };
}

/** Recomputes one item's discount/GST fields for a given TOTAL (cumulative) discount amount —
 * shared by both applying a new Sale Order discount (cumulative = prior + this transaction's
 * share) and reverting one (cumulative = 0, i.e. as if no Sale Order discount had ever been
 * applied). Keeping this in one place means "apply" and "undo" can never drift apart. */
function computeItemDiscountFields(item: SheetRow, cumulativeDiscountRs: number, buyerState: string, sellerState: string) {
  const priceQty = Number(item.PRICE || 0) * Number(item.QTY || 0);
  const basicAmount = priceQty - cumulativeDiscountRs;
  const { cgst, sgst, igst, lineTax } = splitGst(basicAmount, Number(item.GST_SLAB_PCT || 0), buyerState, sellerState);
  return {
    basicAmount,
    lineTax,
    patch: itemToSheet({
      DISCOUNT_RS: money(cumulativeDiscountRs),
      DISCOUNT_PCT: priceQty > 0 ? ((cumulativeDiscountRs / priceQty) * 100).toFixed(2) : "0.00",
      BASIC_AMOUNT: money(basicAmount),
      CGST: money(cgst),
      SGST: money(sgst),
      IGST: money(igst),
      TAX_AMOUNT: money(lineTax),
      TOTAL_AMOUNT: money(roundOff(basicAmount + lineTax)),
    }),
  };
}

/** A doer can undo a discount by hand-deleting its row(s) from the Order Punch Discount
 * sheet — there's no in-app "undo" button (matches the app's existing hand-edit-the-sheet
 * convention). Detects that case (an order at the discount stage with no discount-log row
 * left and no Sale Order form uploaded yet) and PHYSICALLY reverts it: resets every item back
 * to zero Sale-Order-stage discount (same computeItemDiscountFields() used to apply one, just
 * with cumulative=0) and resums the order's own totals — not just a read-time display trick,
 * since the doer checks the raw sheet directly, not only the app. Only reverts orders still
 * sitting at the discount stage — once SALE_ORDERS exists, the discount is locked in and
 * deleting the log row no longer does anything. Runs from a GET, which is unusual (GETs
 * shouldn't normally have side effects), but there's no other trigger available here — the
 * app only ever finds out about a hand-edit made directly in Sheets by reading it. Idempotent
 * either way: once reverted, STATUS is "PENDING" so nothing here fires again until another
 * discount is applied. */
async function revertOrphanedDiscounts(rows: SheetRow[]): Promise<SheetRow[]> {
  if (!rows.some((r) => r.STATUS === "PENDING SALE ORDER")) return rows;

  // Must bypass the normal cache here: a doer deleting a row directly in Google Sheets never
  // goes through our API, so nothing ever busts that cache entry for them — reading the
  // cached copy could serve stale (pre-deletion) data and make this feature silently not
  // work right after someone edits the sheet by hand.
  const [discountLog, saleOrders] = await Promise.all([
    readTable(env.sheets.transactions, DISCOUNT_LOG_TAB, { refresh: true }),
    readTable(env.sheets.transactions, "SALE_ORDERS", { refresh: true }),
  ]);
  const loggedIds = new Set(discountLog.map((r) => r.ORDER_ID));
  // A placeholder SALE_ORDERS row now exists as soon as the discount step is done (see
  // createPlaceholderSaleOrder) — its own presence no longer means "form actually uploaded".
  // Only a filled-in Sale Order No. means that; a blank one is still just the placeholder.
  const uploadedSaleOrderIds = new Set(saleOrders.filter((r) => r["Sale Order No."]).map((r) => r.ORDER_ID));

  const orphaned = rows.filter(
    (r) => r.STATUS === "PENDING SALE ORDER" && !loggedIds.has(r.ORDER_ID) && !uploadedSaleOrderIds.has(r.ORDER_ID)
  );
  if (orphaned.length === 0) return rows;

  const allItems = await readTable(env.sheets.transactions, "ORDER_ITEMS", { refresh: true });
  const revertedById = new Map<string, SheetRow>();

  for (const order of orphaned) {
    const orderItems = allItems.filter((i) => i.ORDER_ID === order.ORDER_ID).map(itemFromSheet);
    let basicAmount = Number(order.BASIC_AMOUNT || 0);
    let taxAmount = Number(order.TAX_AMOUNT || 0);

    if (orderItems.length > 0) {
      basicAmount = 0;
      taxAmount = 0;
      for (const item of orderItems) {
        const { basicAmount: itemBasic, lineTax, patch } = computeItemDiscountFields(
          item,
          0,
          order.BILLING_STATE || "",
          order.SELLER_STATE || ""
        );
        basicAmount += itemBasic;
        taxAmount += lineTax;
        await updateRow(env.sheets.transactions, "ORDER_ITEMS", "ITEM_ID", item.ITEM_ID, patch);
      }
    }

    const totalAmount = money(roundOff(basicAmount + taxAmount));
    await updateRow(
      env.sheets.transactions,
      ORDER_TAB,
      "ORDER_ID",
      order.ORDER_ID,
      punchToSheet({
        BASIC_AMOUNT: money(basicAmount),
        TAX_AMOUNT: money(taxAmount),
        INVOICE_DISCOUNT_RS: "0.00",
        TOTAL_AMOUNT: totalAmount,
        STATUS: "PENDING",
      })
    );

    // Also remove the blank placeholder SALE_ORDERS/SALE_ORDER_ITEMS rows createPlaceholderSaleOrder()
    // wrote when the (now-undone) discount was applied — leaving them around would show a
    // phantom Sale Order entry for an order that's back to square one.
    await deleteRows(env.sheets.transactions, "SALE_ORDER_ITEMS", "ORDER_ID", [order.ORDER_ID]);
    await deleteRows(env.sheets.transactions, "SALE_ORDERS", "ORDER_ID", [order.ORDER_ID]);

    revertedById.set(order.ORDER_ID, {
      ...order,
      STATUS: "PENDING",
      INVOICE_DISCOUNT_RS: "0.00",
      BASIC_AMOUNT: money(basicAmount),
      TAX_AMOUNT: money(taxAmount),
      TOTAL_AMOUNT: totalAmount,
    });
  }

  return rows.map((r) => revertedById.get(r.ORDER_ID) ?? r);
}

ordersRouter.get("/", async (req, res, next) => {
  try {
    const { stage, status } = req.query as { stage?: string; status?: string };
    const rows = await revertOrphanedDiscounts((await readTable(env.sheets.transactions, ORDER_TAB)).map(punchFromSheet));
    const filtered = rows.filter(
      (r) => (!stage || r.CURRENT_STAGE === stage) && (!status || r.STATUS === status)
    );
    res.json(filtered);
  } catch (err) {
    next(err);
  }
});

/** Saved Sale Orders waiting for review in the SO Confirmation queue. */
ordersRouter.get("/sale-orders", async (_req, res, next) => {
  try {
    const rows = await readTable(env.sheets.transactions, "SALE_ORDERS");
    res.json(rows.map(saleOrderFromSheet));
  } catch (err) {
    next(err);
  }
});

/** Confirmed orders become the pending queue for Dispatch Approval. Reads ORDER_PUNCH (not
 * SALE_ORDERS) — SALE_ORDERS has no Approval_Status/Status columns of its own to filter on,
 * ORDER_PUNCH.STATUS is what /:id/so-confirmation actually sets to "DISPATCH APPROVAL". */
ordersRouter.get("/dispatch-approvals", async (req, res, next) => {
  try {
    const { status } = req.query as { status?: string };
    const rows = (await readTable(env.sheets.transactions, ORDER_TAB))
      .map(punchFromSheet)
      .filter((row) => (status === "COMPLETED" ? row.STATUS === "DISPATCH APPROVAL COMPLETED" : row.STATUS === "DISPATCH APPROVAL"));
    res.json(rows);
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

// Must be registered before the generic GET/POST "/:id..." routes below, since Express
// matches routes in registration order and "/:id" would otherwise swallow e.g. GET "/pdi".
registerStageRoutes(ordersRouter);

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
    const [order] = await revertOrphanedDiscounts([punchFromSheet(sheetOrder)]);
    res.json({
      order,
      items: items.filter((i) => i.ORDER_ID === req.params.id).map(itemFromSheet),
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

    // Fetched early (not just at write time below) because the seller's state is needed
    // to decide CGST+SGST vs IGST per line item.
    const [seller, buyer] = await Promise.all([getSellerFields(), getBuyerFields(body.custId)]);

    let basicAmount = 0;
    let taxAmount = 0;

    const itemRows: SheetRow[] = [];
    for (const item of body.items) {
      const itemId = `${orderId}-${String(itemRows.length + 1).padStart(2, "0")}`;
      const lineBasic = item.price * item.qty - item.discountRs;
      const { cgst, sgst, igst, lineTax } = splitGst(lineBasic, item.gstSlabPct, body.billingState, String(seller.SELLER_STATE || ""));
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
        IGST: money(igst),
        TAX_AMOUNT: money(lineTax),
        TOTAL_AMOUNT: money(roundOff(lineBasic + lineTax)),
        SPECIAL_INSTRUCTIONS: item.specialInstructions,
        PACKING_REQUIREMENTS: item.packingRequirements,
        NOTES: item.notes,
        STATUS: "PENDING",
        CREATED_AT: now,
        CREATED_BY: req.user!.employeeId,
      });
    }

    await appendRows(env.sheets.transactions, "ORDER_ITEMS", itemRows.map(itemToSheet));

    const dspIds = await nextIds("DSP", "DISPATCH_PLAN", "DSP_ID", body.dispatchPlan.length);
    const dispatchPlanRows: SheetRow[] = [];
    for (const [i, plan] of body.dispatchPlan.entries()) {
      const targetItem = itemRows[plan.itemIndex];
      if (!targetItem) continue;
      dispatchPlanRows.push({
        DSP_ID: dspIds[i],
        ITEM_ID: targetItem.ITEM_ID,
        ORDER_ID: orderId,
        EXPECTED_DATE: plan.expectedDate,
        PLANNED_QTY: String(plan.plannedQty),
        UOM: plan.uom,
        STATUS: "PENDING",
        CREATED_AT: now,
        CREATED_BY: req.user!.employeeId,
        UPDATED_AT: now,
        UPDATED_BY: req.user!.employeeId,
        ROW_VERSION: "1",
      });
    }
    await appendRows(env.sheets.transactions, "DISPATCH_PLAN", dispatchPlanRows);

    // Seller/buyer master fields were already fetched above (needed for the GST split);
    // translate everything to ORDER_PUNCH's sheet headers here.
    await appendRow(
      env.sheets.transactions,
      ORDER_TAB,
      punchToSheet({
        ORDER_ID: orderId,
        CREATED_AT: now,
        CREATED_BY: req.user!.employeeId,
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
        THIS_ORDER_PAYMENT_TERMS: body.thisOrderPaymentTerms,
        CONTACT_PERSON: body.contactPerson,
        CONTACT_NO: body.contactNo,
        ORDER_GIVEN_BY: body.orderGivenBy,
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
        TOTAL_AMOUNT: money(roundOff(basicAmount + taxAmount)),
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

const discountItemSchema = z.object({
  itemId: z.string().min(1),
  type: z.enum(["Percentage", "Rupees"]),
  discountPct: z.number().min(0).max(100).optional(),
  discountRs: z.number().min(0).optional(),
});

// Discount Applicable: No -> zero discount, order still advances (just no reason/scope needed).
// Yes -> either one lump amount split proportionally across every item ("Invoice" scope, the
// original behavior), or an explicit Rs/% chosen per selected item ("Item" scope, each item's
// own discount is exactly what the doer typed for it — no proportional splitting involved).
// A plain z.union (not discriminatedUnion) — two branches both need applicable:true (differing
// on `scope` instead), and zod's discriminatedUnion requires the discriminator value to be
// unique across every branch; reusing `true` on two branches makes it throw at import time
// ("Discriminator property applicable has duplicate value true"), taking the whole API down.
const discountSchema = z.union([
  z.object({ applicable: z.literal(false) }),
  z.object({
    applicable: z.literal(true),
    reason: z.string().min(1),
    description: z.string().optional().default(""),
    scope: z.literal("Invoice"),
    type: z.enum(["Percentage", "Rupees"]),
    discountPct: z.number().min(0).max(100).optional(),
    discountRs: z.number().min(0).optional(),
  }),
  z.object({
    applicable: z.literal(true),
    reason: z.string().min(1),
    description: z.string().optional().default(""),
    scope: z.literal("Item"),
    items: z.array(discountItemSchema).min(1),
  }),
]);

function requiresMatchingAmount(type: "Percentage" | "Rupees", discountPct?: number, discountRs?: number): string | null {
  if (type === "Percentage" && discountPct === undefined) return "discountPct is required for Percentage";
  if (type === "Rupees" && discountRs === undefined) return "discountRs is required for Rupees";
  return null;
}

// Matches the live sheet's pre-built "Order Punch Discount" tab exactly (headers dumped
// from the sheet directly — note "Discount Reasion" is the tab's own typo, not ours, and
// "Discount Details"/"ITEM_ID" are present for a future per-item discount but unused today
// since discounts are still applied at the order level).
const DISCOUNT_LOG_TAB = "Order Punch Discount";
// Dumped directly from the live tab via the Sheets API rather than assumed — the live header
// is actually "Discount Reason " with a trailing space, but sheets.ts trims every header on
// both read and write, so the key our own code sees/writes is the trimmed "Discount Reason".
// There's no separate "Description" column (the form's Description goes into "Discount
// Details" instead), and "Default Discount Type" (Invoice/Item scope) is a different column
// from "Default Discount on" (Percentage/Rupees) — easy to conflate the two by name alone.
const DISCOUNT_LOG_HEADERS = [
  "Timestamp",
  "Useremail",
  "ORDER_ID",
  "ITEM_ID",
  "Punch Discount ID",
  "Discount Details",
  "Discount Applicable",
  "Discount Reason",
  "Default Discount Type",
  "Default Discount on",
  "Discount (Rs)",
  "Discount (%)",
  "Status",
];

/** Creates a placeholder SALE_ORDERS + SALE_ORDER_ITEMS row the moment the discount step is
 * done — Sale Order No./Date/Attachment/Remarks stay blank until the doer actually uploads
 * the Sale Order form (which fills those in via updateRow, not another append; see
 * `/:id/sale-order-form`), STATUS starts as "PENDING SALE ORDER" to mirror the order's own
 * status while it waits. A deliberate choice (confirmed with the user) over the previous
 * behavior of only creating this row at upload time — no-op if one already exists (e.g. the
 * doer reverted and reapplied a discount before ever uploading). */
async function createPlaceholderSaleOrder(orderId: string, employeeId: string): Promise<void> {
  const existing = (await readTable(env.sheets.transactions, "SALE_ORDERS")).find((r) => r.ORDER_ID === orderId);
  if (existing) return;

  const [orderRow, items] = await Promise.all([
    readTable(env.sheets.transactions, ORDER_TAB).then((rows) => rows.find((r) => r.ORDER_ID === orderId)),
    readTable(env.sheets.transactions, "ORDER_ITEMS").then((rows) => rows.filter((r) => r.ORDER_ID === orderId)),
  ]);
  if (!orderRow) return;
  const order = punchFromSheet(orderRow);

  const now = new Date().toISOString();
  const saleOrderId = await nextId("SO", "SALE_ORDERS", "SALE_ORDER_ID");
  await appendRow(
    env.sheets.transactions,
    "SALE_ORDERS",
    saleOrderToSheet({
      ...order,
      CREATED_AT: now,
      CREATED_BY: employeeId,
      ORDER_ID: orderId,
      SALE_ORDER_ID: saleOrderId,
      SO_NO: "",
      SO_DATE: "",
      SO_ATTACHMENT_URL: "",
      SO_REMARKS: "",
      STATUS: "PENDING SALE ORDER",
    })
  );

  if (items.length === 0) return;
  const soItemIds = await nextIds("SOI", "SALE_ORDER_ITEMS", "SALE_ORDER_ITEM_ID", items.length);
  await appendRows(
    env.sheets.transactions,
    "SALE_ORDER_ITEMS",
    items.map((item, i) => ({ ...item, Timestamp: now, Useremail: employeeId, SALE_ORDER_ID: saleOrderId, SALE_ORDER_ITEM_ID: soItemIds[i] }))
  );
}

/** Applies the Sale Order discount, splits it across the order's line items (proportional to
 * each item's current basic amount, so every item absorbs the same effective % regardless of
 * whether the doer entered a flat Rs amount or a percentage), recalculates each item's GST and
 * the order's totals, logs one Order Punch Discount row per item, and pushes the order into
 * the Sale Order stage's pending queue. */
ordersRouter.post("/:id/discount", async (req, res, next) => {
  try {
    const body = discountSchema.parse(req.body);
    if (body.applicable && body.scope === "Invoice") {
      const err = requiresMatchingAmount(body.type, body.discountPct, body.discountRs);
      if (err) return res.status(400).json({ error: { code: "BAD_REQUEST", message: err } });
    }
    if (body.applicable && body.scope === "Item") {
      for (const line of body.items) {
        const err = requiresMatchingAmount(line.type, line.discountPct, line.discountRs);
        if (err) return res.status(400).json({ error: { code: "BAD_REQUEST", message: `Item ${line.itemId}: ${err}` } });
      }
    }
    const orders = (await readTable(env.sheets.transactions, ORDER_TAB)).map(punchFromSheet);
    const order = orders.find((o) => o.ORDER_ID === req.params.id);
    if (!order) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Order not found" } });
    }

    const now = new Date().toISOString();
    const orderItems = (await readTable(env.sheets.transactions, "ORDER_ITEMS"))
      .filter((i) => i.ORDER_ID === req.params.id)
      .map(itemFromSheet);

    const orderBasicAmount = Number(order.BASIC_AMOUNT || 0);
    const orderTaxAmount = Number(order.TAX_AMOUNT || 0);

    let newBasicAmount = orderBasicAmount;
    let newTaxAmount = orderTaxAmount;
    let discountRs = 0;
    const logRows: SheetRow[] = [];
    const itemUpdates: { itemId: string; patch: SheetRow }[] = [];

    if (!body.applicable) {
      // "Discount Applicable: No" — nothing to apportion, order still advances with zero
      // discount. Still logs one row (blank ITEM_ID) so the discount-revert logic doesn't
      // mistake "declined" for "log row got deleted" and bounce the order back to PENDING.
      logRows.push({
        Timestamp: now,
        Useremail: req.user!.employeeId,
        ORDER_ID: req.params.id,
        "Discount Applicable": "No",
        "Discount Reason": "No Discount Applied",
        "Default Discount Type": "",
        "Default Discount on": "",
        "Discount (Rs)": "0.00",
        "Discount (%)": "0.00",
        Status: "PENDING SALE ORDER",
      });
    } else if (body.scope === "Item") {
      const byId = new Map(orderItems.map((i) => [i.ITEM_ID, i]));
      for (const line of body.items) {
        if (!byId.has(line.itemId)) {
          return res.status(400).json({ error: { code: "BAD_REQUEST", message: `Item ${line.itemId} does not belong to this order` } });
        }
      }
      newBasicAmount = 0;
      newTaxAmount = 0;
      for (const item of orderItems) {
        const line = body.items.find((l) => l.itemId === item.ITEM_ID);
        if (!line) {
          // Not selected for this discount — carry its current amounts through unchanged.
          newBasicAmount += Number(item.BASIC_AMOUNT || 0);
          newTaxAmount += Number(item.TAX_AMOUNT || 0);
          continue;
        }
        const itemBasicAmount = Number(item.BASIC_AMOUNT || 0);
        const itemDiscountRs = line.type === "Percentage" ? (itemBasicAmount * (line.discountPct ?? 0)) / 100 : line.discountRs ?? 0;
        const priorDiscountRs = Number(item.DISCOUNT_RS || 0);
        const cumulativeDiscountRs = priorDiscountRs + itemDiscountRs;
        const priceQty = Number(item.PRICE || 0) * Number(item.QTY || 0);
        const { basicAmount: itemNewBasicAmount, lineTax, patch } = computeItemDiscountFields(
          item,
          cumulativeDiscountRs,
          order.BILLING_STATE || "",
          order.SELLER_STATE || ""
        );

        newBasicAmount += itemNewBasicAmount;
        newTaxAmount += lineTax;
        discountRs += itemDiscountRs;
        itemUpdates.push({ itemId: item.ITEM_ID, patch });

        logRows.push({
          Timestamp: now,
          Useremail: req.user!.employeeId,
          ORDER_ID: req.params.id,
          ITEM_ID: item.ITEM_ID,
          "Discount Applicable": "Yes",
          "Discount Reason": body.reason,
          "Discount Details": body.description,
          "Default Discount Type": "Item",
          "Default Discount on": line.type,
          "Discount (Rs)": money(itemDiscountRs),
          "Discount (%)": priceQty > 0 ? ((itemDiscountRs / priceQty) * 100).toFixed(2) : "0.00",
          Status: "PENDING SALE ORDER",
        });
      }
    } else if (orderItems.length > 0) {
      // Invoice scope — one lump amount split proportionally across every item, so each ends
      // up with the same effective % off regardless of whether the doer entered a flat Rs or a %.
      discountRs = body.type === "Percentage" ? (orderBasicAmount * (body.discountPct ?? 0)) / 100 : body.discountRs ?? 0;
      const itemsBasicTotal = orderItems.reduce((sum, i) => sum + Number(i.BASIC_AMOUNT || 0), 0);
      newBasicAmount = 0;
      newTaxAmount = 0;

      for (const item of orderItems) {
        const itemBasicAmount = Number(item.BASIC_AMOUNT || 0);
        const share = itemsBasicTotal > 0 ? itemBasicAmount / itemsBasicTotal : 0;
        const itemDiscountRs = discountRs * share;
        // DISCOUNT_RS/DISCOUNT_PCT track the item's TOTAL discount to date (punch-time + every
        // Sale Order discount applied since) so BASIC_AMOUNT = Price*Qty - DISCOUNT_RS always holds.
        const priorDiscountRs = Number(item.DISCOUNT_RS || 0);
        const cumulativeDiscountRs = priorDiscountRs + itemDiscountRs;
        const priceQty = Number(item.PRICE || 0) * Number(item.QTY || 0);
        const { basicAmount: itemNewBasicAmount, lineTax, patch } = computeItemDiscountFields(
          item,
          cumulativeDiscountRs,
          order.BILLING_STATE || "",
          order.SELLER_STATE || ""
        );

        newBasicAmount += itemNewBasicAmount;
        newTaxAmount += lineTax;
        itemUpdates.push({ itemId: item.ITEM_ID, patch });

        logRows.push({
          Timestamp: now,
          Useremail: req.user!.employeeId,
          ORDER_ID: req.params.id,
          ITEM_ID: item.ITEM_ID,
          "Discount Applicable": "Yes",
          "Discount Reason": body.reason,
          "Discount Details": body.description,
          "Default Discount Type": "Invoice",
          "Default Discount on": body.type,
          "Discount (Rs)": money(itemDiscountRs),
          "Discount (%)": priceQty > 0 ? ((itemDiscountRs / priceQty) * 100).toFixed(2) : "0.00",
          Status: "PENDING SALE ORDER",
        });
      }
    } else {
      // No items yet (partial punch) — nothing to apportion into, so the discount is applied
      // straight against the order's own totals instead (basic/tax stay as-is).
      discountRs = body.type === "Percentage" ? (orderBasicAmount * (body.discountPct ?? 0)) / 100 : body.discountRs ?? 0;
      logRows.push({
        Timestamp: now,
        Useremail: req.user!.employeeId,
        ORDER_ID: req.params.id,
        "Discount Applicable": "Yes",
        "Discount Reason": body.reason,
        "Discount Details": body.description,
        "Default Discount Type": "Invoice",
        "Default Discount on": body.type,
        "Discount (Rs)": money(discountRs),
        "Discount (%)": body.type === "Percentage" ? String(body.discountPct) : "",
        Status: "PENDING SALE ORDER",
      });
      newBasicAmount = orderBasicAmount - discountRs;
      newTaxAmount = orderTaxAmount;
    }

    const totalAmount = roundOff(newBasicAmount + newTaxAmount);

    // Write the audit-log entries BEFORE touching item/order rows — if the log write fails,
    // nothing else has changed yet, so the doer can just retry from a clean state.
    await ensureSheetTab(env.sheets.transactions, DISCOUNT_LOG_TAB, DISCOUNT_LOG_HEADERS);
    const punchDiscountIds = await nextIds("DISC", DISCOUNT_LOG_TAB, "Punch Discount ID", logRows.length);
    await appendRows(
      env.sheets.transactions,
      DISCOUNT_LOG_TAB,
      logRows.map((row, i) => ({ ...row, "Punch Discount ID": punchDiscountIds[i] }))
    );

    for (const { itemId, patch } of itemUpdates) {
      await updateRow(env.sheets.transactions, "ORDER_ITEMS", "ITEM_ID", itemId, patch);
    }

    await updateRow(
      env.sheets.transactions,
      ORDER_TAB,
      "ORDER_ID",
      req.params.id,
      punchToSheet({
        BASIC_AMOUNT: money(newBasicAmount),
        TAX_AMOUNT: money(newTaxAmount),
        INVOICE_DISCOUNT_RS: money(discountRs),
        TOTAL_AMOUNT: money(totalAmount),
        // Status flips so the order reads as reviewed-with-discount; the full discount
        // detail is captured in the ORDER_PUNCH_DISCOUNT log above (and, in phase 2, SALE_ORDERS).
        STATUS: "PENDING SALE ORDER",
      })
    );

    await createPlaceholderSaleOrder(req.params.id, req.user!.employeeId);

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

/** Creates a placeholder SO_Confirmation + SO_Confirmation_Items row the moment the Sale
 * Order form is uploaded — Confirmation/Received Payment Amount/Payment Amount (%)/Payment
 * Attachment/Confirmation Remarks stay blank until the doer actually submits a decision
 * (`/:id/so-confirmation` then updates this same row in place, see `logSoConfirmation()`),
 * STATUS starts as "PENDING". No-op if one already exists for this order. */
async function createPlaceholderSoConfirmation(orderId: string, saleOrderId: string, employeeId: string): Promise<void> {
  const existing = (await readTable(env.sheets.transactions, "SO_Confirmation")).find((r) => r.ORDER_ID === orderId);
  if (existing) return;

  const [orderRow, items] = await Promise.all([
    readTable(env.sheets.transactions, ORDER_TAB).then((rows) => rows.find((r) => r.ORDER_ID === orderId)),
    readTable(env.sheets.transactions, "SALE_ORDER_ITEMS").then((rows) => rows.filter((r) => r.ORDER_ID === orderId)),
  ]);
  if (!orderRow) return;
  const order = punchFromSheet(orderRow);

  const now = new Date().toISOString();
  const confId = await nextId("CONF", "SO_Confirmation", "Conf_ID");
  await appendRow(
    env.sheets.transactions,
    "SO_Confirmation",
    soConfirmationToSheet({
      ...order,
      CREATED_AT: now,
      CREATED_BY: employeeId,
      ORDER_ID: orderId,
      SALE_ORDER_ID: saleOrderId,
      CONF_ID: confId,
      CONFIRMATION: "",
      RECEIVED_PAYMENT_AMOUNT: "",
      PAYMENT_AMOUNT_PCT: "",
      PAYMENT_ATTACHMENT_URL: "",
      CONFIRMATION_REMARKS: "",
      STATUS: "PENDING",
    })
  );

  if (items.length === 0) return;
  const confItemIds = await nextIds("CONFI", "SO_Confirmation_Items", "Conf Item ID", items.length);
  await appendRows(
    env.sheets.transactions,
    "SO_Confirmation_Items",
    items.map((item, i) =>
      soConfirmationItemToSheet({
        ...itemFromSheet(item),
        CREATED_AT: now,
        CREATED_BY: employeeId,
        ORDER_ID: orderId,
        SALE_ORDER_ID: saleOrderId,
        CONF_ID: confId,
        CONF_ITEM_ID: confItemIds[i],
        STATUS: "PENDING",
      })
    )
  );
}

/** Saves the Sale Order form. `createPlaceholderSaleOrder()` (called from the discount route)
 * already created the SALE_ORDERS + SALE_ORDER_ITEMS rows with Sale Order No./Date/
 * Attachment/Remarks blank — this fills those in via updateRow instead of appending a second
 * row (falls back to a fresh append if somehow no placeholder exists yet), then also creates
 * a placeholder SO_Confirmation + SO_Confirmation_Items row the same way, for the next stage. */
ordersRouter.post("/:id/sale-order-form", async (req, res, next) => {
  try {
    const body = saleOrderFormSchema.parse(req.body);
    const orders = (await readTable(env.sheets.transactions, ORDER_TAB)).map(punchFromSheet);
    const order = orders.find((o) => o.ORDER_ID === req.params.id);
    if (!order) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Order not found" } });
    }

    const now = new Date().toISOString();
    const existingSaleOrder = (await readTable(env.sheets.transactions, "SALE_ORDERS")).find((r) => r.ORDER_ID === req.params.id);
    const saleOrderId = existingSaleOrder?.SALE_ORDER_ID ?? (await nextId("SO", "SALE_ORDERS", "SALE_ORDER_ID"));

    const saleOrderFields = saleOrderToSheet({
      ...order,
      CREATED_AT: now,
      CREATED_BY: req.user!.employeeId,
      ORDER_ID: req.params.id,
      SALE_ORDER_ID: saleOrderId,
      SO_NO: body.soNo,
      SO_DATE: body.soDate,
      SO_ATTACHMENT_URL: body.soAttachmentUrl,
      SO_REMARKS: body.soRemarks,
      STATUS: "PENDING",
    });
    if (existingSaleOrder) {
      await updateRow(env.sheets.transactions, "SALE_ORDERS", "ORDER_ID", req.params.id, saleOrderFields);
    } else {
      await appendRow(env.sheets.transactions, "SALE_ORDERS", saleOrderFields);
    }

    // SALE_ORDER_ITEMS uses the same column names as ORDER_ITEMS (no renaming). The
    // placeholder copy from discount time might be stale if anything changed since, so
    // resync from scratch rather than assume it's still accurate.
    const items = (await readTable(env.sheets.transactions, "ORDER_ITEMS")).filter(
      (i) => i.ORDER_ID === req.params.id
    );
    await deleteRows(env.sheets.transactions, "SALE_ORDER_ITEMS", "ORDER_ID", [req.params.id]);
    if (items.length > 0) {
      const soItemIds = await nextIds("SOI", "SALE_ORDER_ITEMS", "SALE_ORDER_ITEM_ID", items.length);
      await appendRows(
        env.sheets.transactions,
        "SALE_ORDER_ITEMS",
        items.map((item, i) => ({
          ...item,
          Timestamp: now,
          Useremail: req.user!.employeeId,
          SALE_ORDER_ID: saleOrderId,
          SALE_ORDER_ITEM_ID: soItemIds[i],
        }))
      );
    }

    // The punch order's part in the pipeline is done; mark it so the Sale Order actions hide.
    await updateRow(
      env.sheets.transactions,
      ORDER_TAB,
      "ORDER_ID",
      req.params.id,
      punchToSheet({ STATUS: "SALE ORDER", CREATED_BY: req.user!.employeeId })
    );

    await createPlaceholderSoConfirmation(req.params.id, saleOrderId, req.user!.employeeId);

    res.json({ orderId: req.params.id, saleOrderId });
  } catch (err) {
    next(err);
  }
});

const confirmationChangesSchema = z.object({
  poNo: z.string().optional(), poDate: z.string().optional(), poAttachmentUrl: z.string().optional(), otherAttachmentUrl: z.string().optional(), poRemarks: z.string().optional(),
  saleType: z.string().optional(), orderType: z.string().optional(), paymentType: z.string().optional(), advancePct: z.number().optional(),
  custId: z.string().optional(), customerName: z.string().optional(), buyerGstin: z.string().optional(),
  billingAddress: z.string().optional(), billingState: z.string().optional(), billingPincode: z.string().optional(), billingCountry: z.string().optional(),
  shippingSame: z.string().optional(), shippingAddress: z.string().optional(), shippingState: z.string().optional(), shippingPincode: z.string().optional(),
  preferredDeliveryMode: z.string().optional(), preferredTransportMode: z.string().optional(), freightPaidBy: z.string().optional(), freightOnInvoice: z.string().optional(),
  preferredTptId: z.string().optional(), preferredTptName: z.string().optional(), transporterType: z.string().optional(), transporterContactNo: z.string().optional(), transporterPersonName: z.string().optional(), transporterPersonContactNo: z.string().optional(), transporterAddress: z.string().optional(),
  items: z.array(itemSchema).optional(),
  invoiceDiscountRs: z.number().min(0).optional(),
});

const soConfirmationSchema = z.object({
  outcome: z.enum(["Confirmed", "Changes", "Cancelled"]),
  remarks: z.string().min(1),
  receivedPaymentAmount: z.string().optional(),
  paymentAmountPct: z.string().optional(),
  paymentAttachmentUrl: z.string().optional(),
  changes: confirmationChangesSchema.optional(),
});

/**
 * Fills in this SO Confirmation decision on the placeholder row `createPlaceholderSoConfirmation()`
 * already created when the Sale Order form was uploaded (blank Confirmation/payment fields,
 * STATUS "PENDING") — updates it in place rather than appending a second row. Falls back to
 * appending fresh if somehow no placeholder exists yet. SO_Confirmation_Items is resynced
 * (delete + re-append) since the item list may have changed since the placeholder was made
 * (e.g. a "Changes" outcome editing items).
 */
async function logSoConfirmation(
  orderId: string,
  finalPunch: SheetRow,
  saleOrderId: string,
  items: SheetRow[],
  outcome: string,
  remarks: string,
  payment: { receivedPaymentAmount?: string; paymentAmountPct?: string; paymentAttachmentUrl?: string },
  userEmployeeId: string
) {
  const now = new Date().toISOString();
  const existing = (await readTable(env.sheets.transactions, "SO_Confirmation")).find((r) => r.ORDER_ID === orderId);
  const confId = existing?.Conf_ID ?? (await nextId("CONF", "SO_Confirmation", "Conf_ID"));

  const confirmationFields = soConfirmationToSheet({
    ...finalPunch,
    CREATED_AT: now,
    CREATED_BY: userEmployeeId,
    ORDER_ID: orderId,
    SALE_ORDER_ID: saleOrderId,
    CONF_ID: confId,
    CONFIRMATION: outcome,
    RECEIVED_PAYMENT_AMOUNT: payment.receivedPaymentAmount ?? "",
    PAYMENT_AMOUNT_PCT: payment.paymentAmountPct ?? "",
    PAYMENT_ATTACHMENT_URL: payment.paymentAttachmentUrl ?? "",
    CONFIRMATION_REMARKS: remarks,
    STATUS: outcome,
  });
  if (existing) {
    await updateRow(env.sheets.transactions, "SO_Confirmation", "ORDER_ID", orderId, confirmationFields);
  } else {
    await appendRow(env.sheets.transactions, "SO_Confirmation", confirmationFields);
  }

  await deleteRows(env.sheets.transactions, "SO_Confirmation_Items", "ORDER_ID", [orderId]);
  if (items.length === 0) return;
  const confItemIds = await nextIds("CONFI", "SO_Confirmation_Items", "Conf Item ID", items.length);
  await appendRows(
    env.sheets.transactions,
    "SO_Confirmation_Items",
    items.map((item, i) =>
      soConfirmationItemToSheet({
        ...item,
        CREATED_AT: now,
        CREATED_BY: userEmployeeId,
        ORDER_ID: orderId,
        SALE_ORDER_ID: saleOrderId,
        CONF_ID: confId,
        CONF_ITEM_ID: confItemIds[i],
        STATUS: outcome,
      })
    )
  );
}

/** Saves the SO Confirmation decision. Confirmed orders advance to Dispatch Approval;
 * cancelled orders finish in this queue; requested changes update both source rows and stay pending. */
ordersRouter.post("/:id/so-confirmation", async (req, res, next) => {
  try {
    const body = soConfirmationSchema.parse(req.body);
    const [punchRows, saleRows] = await Promise.all([
      readTable(env.sheets.transactions, ORDER_TAB),
      readTable(env.sheets.transactions, "SALE_ORDERS"),
    ]);
    const punch = punchRows.find((row) => row.ORDER_ID === req.params.id);
    const saleOrder = saleRows.find((row) => row.ORDER_ID === req.params.id);
    if (!punch || !saleOrder) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Sale Order not found" } });
    }

    const changes = body.changes
      ? {
          PO_NO: body.changes.poNo, PO_DATE: body.changes.poDate, PO_ATTACHMENT_URL: body.changes.poAttachmentUrl,
          OTHER_ATTACHMENT_URL: body.changes.otherAttachmentUrl, PO_REMARKS: body.changes.poRemarks,
          SALE_TYPE: body.changes.saleType, ORDER_TYPE: body.changes.orderType, PAYMENT_TYPE: body.changes.paymentType,
          ADVANCE_PCT: body.changes.advancePct === undefined ? undefined : String(body.changes.advancePct),
          CUST_ID: body.changes.custId, CUSTOMER_NAME: body.changes.customerName, BUYER_GSTIN: body.changes.buyerGstin,
          BILLING_ADDRESS: body.changes.billingAddress, BILLING_STATE: body.changes.billingState, BILLING_PINCODE: body.changes.billingPincode, BILLING_COUNTRY: body.changes.billingCountry,
          SHIPPING_SAME: body.changes.shippingSame, SHIPPING_ADDRESS: body.changes.shippingAddress, SHIPPING_STATE: body.changes.shippingState, SHIPPING_PINCODE: body.changes.shippingPincode,
          PREFERRED_DELIVERY_MODE: body.changes.preferredDeliveryMode, PREFERRED_TRANSPORT_MODE: body.changes.preferredTransportMode,
          FREIGHT_PAID_BY: body.changes.freightPaidBy, FREIGHT_ON_INVOICE: body.changes.freightOnInvoice,
          PREFERRED_TPT_ID: body.changes.preferredTptId, PREFERRED_TPT_NAME: body.changes.preferredTptName, TRANSPORTER_TYPE: body.changes.transporterType,
          TRANSPORTER_CONTACT: body.changes.transporterContactNo, TRANSPORTER_PERSON_NAME: body.changes.transporterPersonName,
          TRANSPORTER_PERSON_CONTACT: body.changes.transporterPersonContactNo, TRANSPORTER_ADDRESS: body.changes.transporterAddress,
        }
      : {};
    const withoutUndefined = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined));

    if (body.outcome === "Changes") {
      let amountFields: Record<string, string> = {};
      const existingPunch = punchFromSheet(punch);
      // Reviewer can edit the discount directly on this tab, independent of touching items.
      const discountRs = body.changes?.invoiceDiscountRs ?? Number(existingPunch.INVOICE_DISCOUNT_RS || 0);

      // Replacing the item list means the order's amounts must be recalculated from
      // scratch — same per-line GST math as creating an order — and both ORDER_ITEMS
      // and SALE_ORDER_ITEMS need to reflect the new lines (SALE_ORDER_ITEMS is a copy
      // taken at Sale Order save time and otherwise never revisited).
      if (body.changes?.items && body.changes.items.length > 0) {
        const now = new Date().toISOString();
        let basicAmount = 0;
        let taxAmount = 0;
        const newItemRows: SheetRow[] = [];
        // Billing state may itself be part of this Changes edit; seller state was fixed at
        // order-creation time and stored on the order row, so it doesn't need re-fetching.
        const gstBuyerState = body.changes?.billingState ?? existingPunch.BILLING_STATE ?? "";
        const gstSellerState = String(existingPunch.SELLER_STATE || "");
        for (const item of body.changes.items) {
          const itemId = `${req.params.id}-${String(newItemRows.length + 1).padStart(2, "0")}`;
          const lineBasic = item.price * item.qty - item.discountRs;
          const { cgst, sgst, igst, lineTax } = splitGst(lineBasic, item.gstSlabPct, gstBuyerState, gstSellerState);
          basicAmount += lineBasic;
          taxAmount += lineTax;
          newItemRows.push({
            ITEM_ID: itemId, ORDER_ID: req.params.id, FG_ID: item.fgId, PART_NO: item.partNo, PART_NAME: item.partName,
            SEGMENT: item.segment, CATEGORY: item.category, STRATEGY_ID: item.strategyId, PRICE: money(item.price),
            QTY: String(item.qty), UOM: item.uom, DISCOUNT_ON: item.discountOn, DISCOUNT_RS: money(item.discountRs),
            DISCOUNT_PCT: String(item.discountPct), BASIC_AMOUNT: money(lineBasic), GST_SLAB_PCT: String(item.gstSlabPct),
            CGST: money(cgst), SGST: money(sgst), IGST: money(igst), TAX_AMOUNT: money(lineTax), TOTAL_AMOUNT: money(roundOff(lineBasic + lineTax)),
            SPECIAL_INSTRUCTIONS: item.specialInstructions, PACKING_REQUIREMENTS: item.packingRequirements, NOTES: item.notes,
            STATUS: "PENDING", CREATED_AT: now, CREATED_BY: req.user!.employeeId,
          });
        }

        await deleteRows(env.sheets.transactions, "ORDER_ITEMS", "ORDER_ID", [req.params.id]);
        await appendRows(env.sheets.transactions, "ORDER_ITEMS", newItemRows.map(itemToSheet));
        await deleteRows(env.sheets.transactions, "SALE_ORDER_ITEMS", "ORDER_ID", [req.params.id]);
        await appendRows(
          env.sheets.transactions,
          "SALE_ORDER_ITEMS",
          newItemRows.map((row) => ({ ...itemToSheet(row), SALE_ORDER_ID: saleOrder.SALE_ORDER_ID }))
        );

        const totalAmount = roundOff(basicAmount + taxAmount - discountRs);
        amountFields = {
          BASIC_AMOUNT: money(basicAmount), TAX_AMOUNT: money(taxAmount), TOTAL_AMOUNT: money(totalAmount),
          INVOICE_DISCOUNT_RS: money(discountRs),
        };
      } else if (body.changes?.invoiceDiscountRs !== undefined) {
        // Discount edited without touching items — keep the existing basic/tax, just
        // recompute the total against the new discount.
        const basicAmount = Number(existingPunch.BASIC_AMOUNT || 0);
        const taxAmount = Number(existingPunch.TAX_AMOUNT || 0);
        const totalAmount = roundOff(basicAmount + taxAmount - discountRs);
        amountFields = { TOTAL_AMOUNT: money(totalAmount), INVOICE_DISCOUNT_RS: money(discountRs) };
      }

      await Promise.all([
        updateRow(env.sheets.transactions, ORDER_TAB, "ORDER_ID", req.params.id, punchToSheet({ ...withoutUndefined, ...amountFields, APPROVAL_STATUS: "CHANGES", APPROVAL_REMARKS: body.remarks, CREATED_BY: req.user!.employeeId })),
        updateRow(env.sheets.transactions, "SALE_ORDERS", "ORDER_ID", req.params.id, saleOrderToSheet({ ...withoutUndefined, ...amountFields, APPROVAL_STATUS: "CHANGES", APPROVAL_REMARKS: body.remarks, CREATED_BY: req.user!.employeeId })),
      ]);

      const snapshotItems = (await readTable(env.sheets.transactions, "SALE_ORDER_ITEMS")).filter((i) => i.ORDER_ID === req.params.id).map(itemFromSheet);
      await logSoConfirmation(
        req.params.id,
        { ...existingPunch, ...saleOrderFromSheet(saleOrder), ...(withoutUndefined as SheetRow), ...amountFields },
        saleOrder.SALE_ORDER_ID,
        snapshotItems,
        "Changes",
        body.remarks,
        {},
        req.user!.employeeId
      );

      return res.json({ orderId: req.params.id, status: "PENDING" });
    }

    const confirmed = body.outcome === "Confirmed";
    await Promise.all([
      updateRow(env.sheets.transactions, "SALE_ORDERS", "ORDER_ID", req.params.id, saleOrderToSheet({ STATUS: "COMPLETED", APPROVAL_STATUS: confirmed ? "CONFIRMED" : "CANCELLED", APPROVAL_REMARKS: body.remarks, CREATED_BY: req.user!.employeeId })),
      updateRow(env.sheets.transactions, ORDER_TAB, "ORDER_ID", req.params.id, punchToSheet({ STATUS: confirmed ? "DISPATCH APPROVAL" : "CANCELLED", APPROVAL_STATUS: confirmed ? "CONFIRMED" : "CANCELLED", APPROVAL_REMARKS: body.remarks, CREATED_BY: req.user!.employeeId })),
    ]);

    const snapshotItems = (await readTable(env.sheets.transactions, "SALE_ORDER_ITEMS")).filter((i) => i.ORDER_ID === req.params.id).map(itemFromSheet);
    await logSoConfirmation(
      req.params.id,
      { ...punchFromSheet(punch), ...saleOrderFromSheet(saleOrder), STATUS: confirmed ? "DISPATCH APPROVAL" : "CANCELLED" },
      saleOrder.SALE_ORDER_ID,
      snapshotItems,
      confirmed ? "Confirmed" : "Cancelled",
      body.remarks,
      {
        receivedPaymentAmount: body.receivedPaymentAmount,
        paymentAmountPct: body.paymentAmountPct,
        paymentAttachmentUrl: body.paymentAttachmentUrl,
      },
      req.user!.employeeId
    );

    res.json({ orderId: req.params.id, status: "COMPLETED", nextStage: confirmed ? "dispatch-approval" : undefined });
  } catch (err) {
    next(err);
  }
});

const dispatchApprovalSchema = z.object({
  outcome: z.enum(["Dispatch Today", "Dispatch Extended", "Short Quantity", "Excess Quantity"]),
  approvedQty: z.number().optional(),
  shortQty: z.number().optional(),
  excessQty: z.number().optional(),
  nextExtendedDate: z.string().optional(),
  remarks: z.string().min(1),
  // Manually typed for now (no Inventory Management System connected yet). availableStockQty
  // has nowhere to go — no matching column on "Dispatch Items Approval" — so it's accepted
  // but not written anywhere; balanceDispatchQty/unit do have columns and get persisted.
  availableStockQty: z.number().optional(),
  balanceDispatchQty: z.number().optional(),
  unit: z.string().optional(),
});

/** Saves the Dispatch Approval decision: appends one Dispatch_Approval row per item
 * (audit log — same append-only pattern as SO Confirmation) and marks the order done
 * so it drops out of the pending Dispatch Approval queue. */
ordersRouter.post("/:id/dispatch-approval", async (req, res, next) => {
  try {
    const body = dispatchApprovalSchema.parse(req.body);
    const [punchRows, items] = await Promise.all([
      readTable(env.sheets.transactions, ORDER_TAB),
      readTable(env.sheets.transactions, "SALE_ORDER_ITEMS"),
    ]);
    const punch = punchRows.find((row) => row.ORDER_ID === req.params.id);
    if (!punch) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Order not found" } });
    }
    const order = punchFromSheet(punch);
    const orderItems = items.filter((i) => i.ORDER_ID === req.params.id).map(itemFromSheet);

    const now = new Date().toISOString();
    const qtyField =
      body.outcome === "Dispatch Today" ? { APPROVED_QTY: body.approvedQty }
      : body.outcome === "Short Quantity" ? { SHORT_QTY: body.shortQty }
      : body.outcome === "Excess Quantity" ? { EXCESS_QTY: body.excessQty }
      : {};

    const dispatchIds = await nextIds("DA", "Dispatch Items Approval", "Disp Conf Item ID", Math.max(orderItems.length, 1));
    const rowsToWrite = orderItems.length > 0 ? orderItems : [{ ITEM_ID: "", SALE_ORDER_ITEM_ID: "" } as SheetRow];
    await appendRows(
      env.sheets.transactions,
      "Dispatch Items Approval",
      rowsToWrite.map((item, i) =>
        dispatchApprovalToSheet({
          CREATED_AT: now,
          CREATED_BY: req.user!.employeeId,
          ORDER_ID: req.params.id,
          ITEM_ID: item.ITEM_ID ?? "",
          DISPATCH_ID: dispatchIds[i],
          CUST_ID: order.CUST_ID,
          CUSTOMER_NAME: order.CUSTOMER_NAME,
          BUSINESS_SEGMENT: order.BUSINESS_SEGMENT,
          TYPE_OF_CUSTOMER: order.TYPE_OF_CUSTOMER,
          SALE_TYPE: order.SALE_TYPE,
          BUYER_GSTIN: order.BUYER_GSTIN,
          SEGMENT: item.SEGMENT ?? "",
          CATEGORY: item.CATEGORY ?? "",
          PART_NAME: item.PART_NAME ?? "",
          PART_NO: item.PART_NO ?? "",
          SPECIAL_INSTRUCTIONS: item.SPECIAL_INSTRUCTIONS ?? "",
          PACKING_REQUIREMENTS: item.PACKING_REQUIREMENTS ?? "",
          NOTES: item.NOTES ?? "",
          ORDER_QTY: item.QTY ?? "",
          // Manually typed on the form for now (no Inventory Management System connected
          // yet) — falls back to the item's own Unit if the doer left it blank.
          UOM: body.unit || item.UOM || "NOS",
          DISPATCH_APPROVAL: body.outcome,
          ...(Object.fromEntries(
            Object.entries(qtyField)
              .filter(([, v]) => v !== undefined)
              .map(([k, v]) => [k, money(v as number)])
          ) as SheetRow),
          BALANCE_DISPATCH_QTY: body.balanceDispatchQty !== undefined ? money(body.balanceDispatchQty) : "",
          NEXT_EXTENDED_DATE: body.nextExtendedDate ?? "",
          DISPATCH_REMARKS: body.remarks,
          STATUS: body.outcome,
        })
      )
    );

    await updateRow(
      env.sheets.transactions,
      ORDER_TAB,
      "ORDER_ID",
      req.params.id,
      punchToSheet({ STATUS: "DISPATCH APPROVAL COMPLETED", APPROVAL_REMARKS: body.remarks, CREATED_BY: req.user!.employeeId })
    );

    res.json({ orderId: req.params.id, status: "DISPATCH APPROVAL COMPLETED" });
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
      punchToSheet({ APPROVAL_REMARKS: remarks ?? "", CREATED_BY: req.user!.employeeId })
    );
    res.json({ orderId: req.params.id, currentStage: toStage });
  } catch (err) {
    next(err);
  }
});
