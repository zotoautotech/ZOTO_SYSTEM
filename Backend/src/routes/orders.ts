import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { appendRow, appendRows, deleteRows, ensureSheetTab, readTable, updateRow, type SheetRow } from "../services/sheets.js";
import { nextId, nextIds } from "../services/ids.js";
import { requireAuth, requireCanDelete, requireModule, requireAnyModule, ORDER_FAMILY_MODULES } from "../middleware/auth.js";
import { getPermissions } from "../services/permissions.js";
import { summarizeDispatchDecisions, dispatchBalance } from "./dispatchBalance.js";
import { punchFromSheet, punchToSheet, saleOrderFromSheet, saleOrderToSheet } from "./orderPunchMap.js";
import { DISPATCH_APPROVAL_MAP, dispatchApprovalFromSheet, dispatchApprovalToSheet, soConfirmationItemToSheet, soConfirmationToSheet } from "./soConfirmationMap.js";
import { createPlaceholderPdi, registerStageRoutes } from "./stageRoutes.js";
import { itemFromSheet, itemToSheet } from "./itemMap.js";
import { generateSaleOrderPdf, blankIfNA } from "../services/saleOrderDoc.js";
import { amountInWords } from "../services/amountWords.js";

// itemFromSheet only knows ORDER_ITEMS' own columns, so reading SALE_ORDER_ITEMS through it
// silently drops SALE_ORDER_ITEM_ID (a column that only exists on that tab) — read it back
// from the raw row alongside every other itemFromSheet call against SALE_ORDER_ITEMS.
function saleOrderItemFromSheet(row: SheetRow): SheetRow {
  return { ...itemFromSheet(row), SALE_ORDER_ITEM_ID: row.SALE_ORDER_ITEM_ID ?? "" };
}

export const ordersRouter = Router();
ordersRouter.use(requireAuth);
// NO blanket requireModule here. Every route under /orders used to sit behind
// requireModule("punch-order"), which meant a doer whose only module was PDI (or Stock
// Release) got "No access to this module" when saving their OWN stage's form — the guard
// asked for Order Punch regardless of which stage the route actually served. Each route
// now declares its own module below: stage-specific WRITES require that stage's key, while
// the shared order READS accept any order-family module (a PDI item detail page still has
// to be able to fetch its order). See middleware/auth.ts's requireAnyModule.
const anyOrderModule = requireAnyModule(ORDER_FAMILY_MODULES);

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
      // The legal company name for documents (e.g. "ZOTO AUTOTECH PRIVATE LIMITED") —
      // distinct from Branch Name ("Delhi"), which is just this branch's location, not
      // something that should ever appear as the letterhead on a customer-facing PDF.
      FIRM_NAME: branch["Firm Name"] || "",
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
  preferredZotoVehicleId: z.string().optional().default(""),
  zotoVehicleDetails: z.string().optional().default(""),
  zotoVehicleType: z.string().optional().default(""),
  zotoVehicleNo: z.string().optional().default(""),
  zotoVehicleSize: z.string().optional().default(""),
  zotoVehicleDriverName: z.string().optional().default(""),
  zotoVehicleDriverContactNo: z.string().optional().default(""),
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

/** Same revert-on-delete convention as revertOrphanedDiscounts, one stage later: an order at
 * STATUS "SALE ORDER" (form uploaded) whose SALE_ORDERS row has had its Sale Order No.
 * cleared (or the whole row deleted) reverts back to "PENDING SALE ORDER" — the Sale Order
 * upload's own prevStatus — so it reappears in the pending Sale Order queue. Resets the
 * existing SALE_ORDERS row's upload fields back to blank (matching the original placeholder
 * createPlaceholderSaleOrder wrote) rather than deleting it, since a placeholder row is
 * expected to exist continuously from the discount step onward. Also clears the downstream
 * SO_Confirmation placeholder (created at upload time) since it's now for an upload that no
 * longer exists — a fresh one gets created next time the form is actually re-uploaded. */
async function revertOrphanedSaleOrder(rows: SheetRow[]): Promise<SheetRow[]> {
  if (!rows.some((r) => r.STATUS === "SALE ORDER")) return rows;

  const saleOrders = await readTable(env.sheets.transactions, "SALE_ORDERS", { refresh: true });
  const saleOrderByOrderId = new Map(saleOrders.map((r) => [r.ORDER_ID, r]));

  const orphaned = rows.filter((r) => {
    if (r.STATUS !== "SALE ORDER") return false;
    const so = saleOrderByOrderId.get(r.ORDER_ID);
    return !so || !so["Sale Order No."];
  });
  if (orphaned.length === 0) return rows;

  const revertedById = new Map<string, SheetRow>();
  for (const order of orphaned) {
    await updateRow(env.sheets.transactions, ORDER_TAB, "ORDER_ID", order.ORDER_ID, punchToSheet({ STATUS: "PENDING SALE ORDER" }));

    const so = saleOrderByOrderId.get(order.ORDER_ID);
    if (so) {
      await updateRow(
        env.sheets.transactions,
        "SALE_ORDERS",
        "ORDER_ID",
        order.ORDER_ID,
        saleOrderToSheet({ SO_NO: "", SO_DATE: "", SO_ATTACHMENT_URL: "", SO_REMARKS: "", STATUS: "PENDING SALE ORDER" })
      );
    }

    await deleteRows(env.sheets.transactions, "SO_Confirmation_Items", "ORDER_ID", [order.ORDER_ID]);
    await deleteRows(env.sheets.transactions, "SO_Confirmation", "ORDER_ID", [order.ORDER_ID]);

    revertedById.set(order.ORDER_ID, { ...order, STATUS: "PENDING SALE ORDER" });
  }

  return rows.map((r) => revertedById.get(r.ORDER_ID) ?? r);
}

/** One stage later still: an order at STATUS "DISPATCH APPROVAL"/"CANCELLED" (an SO
 * Confirmation decision was made) whose SO_Confirmation row's own Confirmation field has been
 * cleared reverts back to "SALE ORDER" — so it reappears in the pending SO Confirmation
 * queue — and SALE_ORDERS.STATUS reverts from "COMPLETED" back to "PENDING" alongside it.
 * Resets the existing SO_Confirmation row's decision fields back to blank rather than
 * deleting it, same placeholder-stays-present reasoning as revertOrphanedSaleOrder. */
async function revertOrphanedSoConfirmation(rows: SheetRow[]): Promise<SheetRow[]> {
  if (!rows.some((r) => r.STATUS === "DISPATCH APPROVAL" || r.STATUS === "CANCELLED")) return rows;

  const confirmations = await readTable(env.sheets.transactions, "SO_Confirmation", { refresh: true });
  const confByOrderId = new Map(confirmations.map((r) => [r.ORDER_ID, r]));

  const orphaned = rows.filter((r) => {
    if (r.STATUS !== "DISPATCH APPROVAL" && r.STATUS !== "CANCELLED") return false;
    const conf = confByOrderId.get(r.ORDER_ID);
    return !conf || !conf["Confirmation"];
  });
  if (orphaned.length === 0) return rows;

  const revertedById = new Map<string, SheetRow>();
  for (const order of orphaned) {
    await Promise.all([
      updateRow(env.sheets.transactions, ORDER_TAB, "ORDER_ID", order.ORDER_ID, punchToSheet({ STATUS: "SALE ORDER", APPROVAL_STATUS: "", APPROVAL_REMARKS: "" })),
      updateRow(env.sheets.transactions, "SALE_ORDERS", "ORDER_ID", order.ORDER_ID, saleOrderToSheet({ STATUS: "PENDING", APPROVAL_STATUS: "", APPROVAL_REMARKS: "" })),
    ]);

    const conf = confByOrderId.get(order.ORDER_ID);
    if (conf) {
      await updateRow(
        env.sheets.transactions,
        "SO_Confirmation",
        "ORDER_ID",
        order.ORDER_ID,
        soConfirmationToSheet({
          CONFIRMATION: "",
          RECEIVED_PAYMENT_AMOUNT: "",
          PAYMENT_AMOUNT_PCT: "",
          PAYMENT_ATTACHMENT_URL: "",
          CONFIRMATION_REMARKS: "",
          STATUS: "PENDING",
        })
      );
    }

    revertedById.set(order.ORDER_ID, { ...order, STATUS: "SALE ORDER" });
  }

  return rows.map((r) => revertedById.get(r.ORDER_ID) ?? r);
}

/** One stage later still: an order at STATUS "DISPATCH APPROVAL COMPLETED" where at least one
 * of its items no longer has a matching row in "Dispatch Items Approval" (deleted directly in
 * Sheets) reverts back to "DISPATCH APPROVAL" — so it reappears in the pending Dispatch
 * Approval queue. Dispatch Approval is per-item (see /:orderId/items/:itemId/dispatch-approval
 * above — approving one item never advances the order on its own; STATUS only flips once
 * EVERY item has its own row), so revert has to check the same "every item" condition in
 * reverse: **any** item missing its row is enough to send the whole order back, not just "zero
 * rows left." Nothing to reset in place here (unlike the two stages above) since Dispatch
 * Items Approval has no early-created placeholder. */
async function revertOrphanedDispatchApproval(rows: SheetRow[]): Promise<SheetRow[]> {
  if (!rows.some((r) => r.STATUS === "DISPATCH APPROVAL COMPLETED")) return rows;

  const [dispatchRows, rawItemRows] = await Promise.all([
    readTable(env.sheets.transactions, "Dispatch Items Approval", { refresh: true }),
    readTable(env.sheets.transactions, "ORDER_ITEMS", { refresh: true }),
  ]);
  const summaryByItemId = summarizeDispatchDecisions(dispatchRows);
  // "Undecided" now means real balance remains, not merely "no row exists" — an item can
  // have several rows (one per round) and still have balance left over.
  const itemsByOrderId = new Map<string, { itemId: string; qty: number }[]>();
  for (const r of rawItemRows) {
    if (!itemsByOrderId.has(r.ORDER_ID)) itemsByOrderId.set(r.ORDER_ID, []);
    itemsByOrderId.get(r.ORDER_ID)!.push({ itemId: r.ITEM_ID, qty: Number(itemFromSheet(r).QTY || 0) });
  }

  const orphaned = rows.filter((r) => {
    if (r.STATUS !== "DISPATCH APPROVAL COMPLETED") return false;
    const orderItems = itemsByOrderId.get(r.ORDER_ID) ?? [];
    return orderItems.some(({ itemId, qty }) => dispatchBalance(qty, summaryByItemId.get(itemId)) > 0);
  });
  if (orphaned.length === 0) return rows;

  const revertedById = new Map<string, SheetRow>();
  for (const order of orphaned) {
    await updateRow(env.sheets.transactions, ORDER_TAB, "ORDER_ID", order.ORDER_ID, punchToSheet({ STATUS: "DISPATCH APPROVAL", APPROVAL_TIME: "" }));
    revertedById.set(order.ORDER_ID, { ...order, STATUS: "DISPATCH APPROVAL" });
  }

  return rows.map((r) => revertedById.get(r.ORDER_ID) ?? r);
}

ordersRouter.get("/", anyOrderModule, async (req, res, next) => {
  try {
    const { stage, status } = req.query as { stage?: string; status?: string };
    let rows = (await readTable(env.sheets.transactions, ORDER_TAB)).map(punchFromSheet);
    rows = await revertOrphanedDiscounts(rows);
    rows = await revertOrphanedSaleOrder(rows);
    rows = await revertOrphanedSoConfirmation(rows);
    rows = await revertOrphanedDispatchApproval(rows);
    const filtered = rows.filter(
      (r) => (!stage || r.CURRENT_STAGE === stage) && (!status || r.STATUS === status)
    );
    res.json(filtered);
  } catch (err) {
    next(err);
  }
});

/** Saved Sale Orders waiting for review in the SO Confirmation queue. Excludes
 * "PENDING SALE ORDER" rows — those are just the blank placeholder createPlaceholderSaleOrder()
 * writes at the discount step (see below), before the doer has actually uploaded the Sale
 * Order form; showing them here let an order jump the queue with blank Sale Order No./Date
 * still showing "—". Only "PENDING" (uploaded, awaiting confirmation), "CHANGES", and
 * "COMPLETED" are real SO Confirmation states. `SALE_ORDERS.STATUS` alone can't distinguish
 * Confirmed from Cancelled — both set it to "COMPLETED" (see the Confirmed/Cancelled branch
 * below); only `ORDER_PUNCH.STATUS` does ("DISPATCH APPROVAL" vs "CANCELLED"), so it's joined
 * in here as `ORDER_PUNCH_STATUS` for the list view's Status column/row styling. */
ordersRouter.get("/sale-orders", requireModule("so-confirmation"), async (_req, res, next) => {
  try {
    // Revert-on-delete needs a fresh ORDER_PUNCH read — reused below instead of reading
    // ORDER_PUNCH a second time, since revertOrphanedSoConfirmation already returns the
    // corrected (reverted, if anything was) rows in the same shape.
    const [punchRowsAfterRevert, saleOrderRows] = await Promise.all([
      revertOrphanedSoConfirmation((await readTable(env.sheets.transactions, ORDER_TAB, { refresh: true })).map(punchFromSheet)),
      readTable(env.sheets.transactions, "SALE_ORDERS", { refresh: true }),
    ]);
    const punchStatusByOrderId = new Map(punchRowsAfterRevert.map((r) => [r.ORDER_ID, r.STATUS]));
    const rows = saleOrderRows
      .map(saleOrderFromSheet)
      .filter((row) => row.STATUS !== "PENDING SALE ORDER")
      .map((row) => ({ ...row, ORDER_PUNCH_STATUS: punchStatusByOrderId.get(row.ORDER_ID) ?? "" }));
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/** Statuses that mean an order hasn't reached Dispatch Approval Completed yet — anything
 * else (DISPATCH APPROVAL COMPLETED itself, or any later pipeline stage: PDI, PRE TRANSPORT
 * COMPLETED, TRANSPORT ASSIGNED, ... DELIVERED) counts as "Completed" for THIS stage's own
 * view. A strict `=== "DISPATCH APPROVAL COMPLETED"` check used to make an order that had
 * since progressed further (e.g. into PDI or Transport) silently vanish from both the
 * pending AND Completed Dispatch Approval views at once — same bug class already fixed once
 * for Punch Order's own Completed filter (see OrderPunchList.tsx). */
const BEFORE_DISPATCH_APPROVAL_COMPLETED = new Set(["", "PENDING", "PENDING SALE ORDER", "SALE ORDER", "DISPATCH APPROVAL"]);

/** Confirmed orders become the pending queue for Dispatch Approval. Reads ORDER_PUNCH (not
 * SALE_ORDERS) — SALE_ORDERS has no Approval_Status/Status columns of its own to filter on,
 * ORDER_PUNCH.STATUS is what /:id/so-confirmation actually sets to "DISPATCH APPROVAL". */
ordersRouter.get("/dispatch-approvals", requireModule("dispatch-approval"), async (req, res, next) => {
  try {
    const { status } = req.query as { status?: string };
    let punchRows = (await readTable(env.sheets.transactions, ORDER_TAB, { refresh: true })).map(punchFromSheet);
    if (status !== "COMPLETED") {
      punchRows = await revertOrphanedDispatchApproval(punchRows);
    }
    const rows = punchRows.filter((row) =>
      status === "COMPLETED"
        ? !BEFORE_DISPATCH_APPROVAL_COMPLETED.has(row.STATUS ?? "")
        : row.STATUS === "DISPATCH APPROVAL"
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/** Item-level rows for the pending Dispatch Approval queue's table (SO Confirmation Time,
 * Customer Name, Part Name, Order Quantity, Balance Quantity — one row per item, not per
 * order, matching the old CRR reference view). Available Stock/Short/Excess Quantity aren't
 * included here since they're only decided when the doer actually submits the approval, not
 * before — Balance Quantity IS knowable beforehand though (it's just order qty minus
 * whatever's already been decided across earlier rounds), so it's computed and shown. */
ordersRouter.get("/dispatch-approvals/items", requireModule("dispatch-approval"), async (_req, res, next) => {
  try {
    const [punchRowsRaw, itemRows, dispatchRows] = await Promise.all([
      readTable(env.sheets.transactions, ORDER_TAB, { refresh: true }),
      readTable(env.sheets.transactions, "ORDER_ITEMS"),
      readTable(env.sheets.transactions, "Dispatch Items Approval"),
    ]);
    const punchRows = await revertOrphanedDispatchApproval(punchRowsRaw.map(punchFromSheet));
    const orders = punchRows.filter((o) => o.STATUS === "DISPATCH APPROVAL");
    const orderById = new Map(orders.map((o) => [o.ORDER_ID, o]));
    // Dispatch Approval is per-item — an order can sit at STATUS "DISPATCH APPROVAL" with
    // some of its items already fully decided (order only flips to COMPLETED once every
    // item's balance is fully closed), so those must not show as pending too. An item can
    // now be decided across multiple rounds (partial approvals) — it stays in this pending
    // list, with a shrinking Balance Quantity, until its balance actually reaches zero.
    const summaryByItemId = summarizeDispatchDecisions(dispatchRows);
    const rows = itemRows
      .map(itemFromSheet)
      .filter((item) => orderById.has(item.ORDER_ID) && dispatchBalance(Number(item.QTY || 0), summaryByItemId.get(item.ITEM_ID)) > 0)
      .map((item) => {
        const order = orderById.get(item.ORDER_ID)!;
        const summary = summaryByItemId.get(item.ITEM_ID);
        const orderQty = Number(item.QTY || 0);
        const balanceQty = dispatchBalance(orderQty, summary);
        return {
          ORDER_ID: order.ORDER_ID,
          ITEM_ID: item.ITEM_ID,
          SO_CONFIRMATION_TIME: order.APPROVAL_TIME || "",
          CUSTOMER_NAME: order.CUSTOMER_NAME || "",
          PART_NAME: item.PART_NAME || "",
          ORDER_QTY: item.QTY || "",
          BALANCE_QTY: String(balanceQty),
          UOM: item.UOM || "",
          DISPATCH_EXTENDED: summary?.latestOutcome === "Dispatch Extended",
          NEXT_EXTENDED_DATE: summary?.latestNextExtendedDate || "",
          // A round has already happened but balance remains — the "12 ordered, 10
          // approved, 2 still pending" case — vs. genuinely untouched (nothing decided yet).
          PARTIALLY_DECIDED: !!summary?.hasRealDecision && balanceQty < orderQty,
        };
      });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/** Per-item detail bundle for the item-level pending Dispatch Approval page (matches the old
 * CRR reference's PRE-PD-CONF item view): Quantity Details' Approved/Short/Excess/Balance Qty
 * come from the item's own latest "Dispatch Items Approval" log row (if any decision has been
 * made yet), and the Follow-ups table is the full history of those log rows for this item. */
ordersRouter.get("/:orderId/items/:itemId/dispatch-approval-log", requireModule("dispatch-approval"), async (req, res, next) => {
  try {
    const { orderId, itemId } = req.params;
    const rows = (await readTable(env.sheets.transactions, "Dispatch Items Approval"))
      .map(dispatchApprovalFromSheet)
      // Excludes the blank placeholder row created at SO Confirmation time (see
      // createPlaceholderDispatchItemsApproval) — it's not a real decision, so it shouldn't
      // show up as an empty entry in this item's Follow-ups history.
      .filter((r) => r.ORDER_ID === orderId && r.ITEM_ID === itemId && r.DISPATCH_APPROVAL)
      .sort((a, b) => (a.CREATED_AT ?? "").localeCompare(b.CREATED_AT ?? ""));
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/** Most recent order for a customer, used to autofill "Shipping = Same as Previous Order". */
ordersRouter.get("/latest", anyOrderModule, async (req, res, next) => {
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

ordersRouter.get("/:id", anyOrderModule, async (req, res, next) => {
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
    let [order] = await revertOrphanedDiscounts([punchFromSheet(sheetOrder)]);
    [order] = await revertOrphanedSaleOrder([order]);
    [order] = await revertOrphanedSoConfirmation([order]);
    [order] = await revertOrphanedDispatchApproval([order]);
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
ordersRouter.get("/:id/sale-order", anyOrderModule, async (req, res, next) => {
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
ordersRouter.delete("/", requireModule("punch-order"), requireCanDelete, async (req, res, next) => {
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

type PunchBody = z.infer<typeof createOrderSchema>;

/** The ORDER_PUNCH fields that come straight off the punch form, shared by create
 * (POST /) and edit (PUT /:id) so the two can't drift apart as fields are added. Excludes
 * everything the two handlers set differently — ORDER_ID/CREATED_AT/STATUS/amounts. */
function punchFieldsFromBody(body: PunchBody, seller: SheetRow, buyer: SheetRow): SheetRow {
  return {
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
    PREFERRED_ZOTO_VEHICLE_ID: body.preferredZotoVehicleId,
    ZOTO_VEHICLE_DETAILS: body.zotoVehicleDetails,
    ZOTO_VEHICLE_TYPE: body.zotoVehicleType,
    ZOTO_VEHICLE_NO: body.zotoVehicleNo,
    ZOTO_VEHICLE_SIZE: body.zotoVehicleSize,
    ZOTO_VEHICLE_DRIVER_NAME: body.zotoVehicleDriverName,
    ZOTO_VEHICLE_DRIVER_CONTACT: body.zotoVehicleDriverContactNo,
  };
}

/** Builds ORDER_ITEMS rows and the order's basic/tax totals, applying the same per-line
 * GST split used everywhere else. Item IDs are positional (`<orderId>-01`, `-02`, …), so
 * an edit that replaces the item list renumbers from scratch. */
function buildItemRows(
  orderId: string,
  items: PunchBody["items"],
  billingState: string,
  sellerState: string,
  now: string,
  employeeId: string
): { itemRows: SheetRow[]; basicAmount: number; taxAmount: number } {
  let basicAmount = 0;
  let taxAmount = 0;
  const itemRows: SheetRow[] = [];
  for (const item of items) {
    const itemId = `${orderId}-${String(itemRows.length + 1).padStart(2, "0")}`;
    const lineBasic = item.price * item.qty - item.discountRs;
    const { cgst, sgst, igst, lineTax } = splitGst(lineBasic, item.gstSlabPct, billingState, sellerState);
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
      CREATED_BY: employeeId,
    });
  }
  return { itemRows, basicAmount, taxAmount };
}

/** Blocks punching for a customer assigned to a different doer. Shared by create and edit —
 * an edit can change the customer, so it needs the same gate. Returns the assigned rep's
 * name when the punch should be refused, else null. */
async function blockedByCustomerAssignment(employeeId: string, userName: string, buyer: SheetRow): Promise<string | null> {
  const perms = await getPermissions(employeeId);
  const assignedTo = String(buyer.SALE_STAFF_NAME || "").trim();
  if (perms && perms.modules !== "ALL" && assignedTo && assignedTo.toLowerCase() !== userName.trim().toLowerCase()) {
    return assignedTo;
  }
  return null;
}

ordersRouter.post("/", requireModule("punch-order"), async (req, res, next) => {
  try {
    const body = createOrderSchema.parse(req.body);
    const now = new Date().toISOString();
    const orderId = await nextId("ORD", ORDER_TAB, "ORDER_ID");

    // Fetched early (not just at write time below) because the seller's state is needed
    // to decide CGST+SGST vs IGST per line item.
    const [seller, buyer] = await Promise.all([getSellerFields(), getBuyerFields(body.custId)]);

    // Punching is restricted to the doer a customer is assigned to (CUSTOMER MASTER's
    // "Field Sale Repersentative", already resolved into SALE_STAFF_NAME above); an Admin
    // can punch for anyone. Viewing is deliberately NOT restricted — every doer sees every
    // customer in the picker and every order in the lists; this is the one gate. Enforced
    // here rather than only in the UI, since the form's own check is just a courtesy
    // message. Permissions are read live from USERS, not trusted from the JWT.
    const blockedBy = await blockedByCustomerAssignment(req.user!.employeeId, req.user!.name, buyer);
    if (blockedBy) {
      return res.status(403).json({
        error: { code: "FORBIDDEN", message: `This customer is assigned to ${blockedBy} — only they can punch an order for it.` },
      });
    }

    const { itemRows, basicAmount, taxAmount } = buildItemRows(
      orderId,
      body.items,
      body.billingState,
      String(seller.SELLER_STATE || ""),
      now,
      req.user!.employeeId
    );

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
        ...punchFieldsFromBody(body, seller, buyer),
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

/**
 * Edits an already-punched order in place — the "Edit" action on the Punch Order list.
 * Deliberately restricted to orders still sitting at STATUS "PENDING": the moment a
 * discount is applied the order gains SALE_ORDERS/Order Punch Discount rows derived from
 * these exact amounts, and rewriting the punch underneath them would silently desync every
 * downstream copy. Editing later in the lifecycle is what SO Confirmation's "Changes" flow
 * is for, which updates ORDER_PUNCH and SALE_ORDERS together.
 *
 * Items are replaced wholesale (delete + re-append, renumbered `<orderId>-01`…) rather than
 * diffed, matching the same replace strategy the Changes flow already uses. DISPATCH_PLAN
 * rows are rebuilt too, since they reference item IDs that this renumbering invalidates.
 */
ordersRouter.put("/:id", requireModule("punch-order"), async (req, res, next) => {
  try {
    const body = createOrderSchema.parse(req.body);
    const now = new Date().toISOString();
    const orderId = req.params.id;

    const rows = await readTable(env.sheets.transactions, ORDER_TAB);
    const existing = rows.find((r) => r.ORDER_ID === orderId);
    if (!existing) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Order not found" } });
    }
    const existingPunch = punchFromSheet(existing);
    if ((existingPunch.STATUS || "") !== "PENDING") {
      return res.status(409).json({
        error: {
          code: "NOT_EDITABLE",
          message: `This order has already moved on to "${existingPunch.STATUS}" and can no longer be edited here.`,
        },
      });
    }

    const [seller, buyer] = await Promise.all([getSellerFields(), getBuyerFields(body.custId)]);

    const blockedBy = await blockedByCustomerAssignment(req.user!.employeeId, req.user!.name, buyer);
    if (blockedBy) {
      return res.status(403).json({
        error: { code: "FORBIDDEN", message: `This customer is assigned to ${blockedBy} — only they can punch an order for it.` },
      });
    }

    const { itemRows, basicAmount, taxAmount } = buildItemRows(
      orderId,
      body.items,
      body.billingState,
      String(seller.SELLER_STATE || ""),
      now,
      req.user!.employeeId
    );

    await deleteRows(env.sheets.transactions, "ORDER_ITEMS", "ORDER_ID", [orderId]);
    await appendRows(env.sheets.transactions, "ORDER_ITEMS", itemRows.map(itemToSheet));

    await deleteRows(env.sheets.transactions, "DISPATCH_PLAN", "ORDER_ID", [orderId]);
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

    // updateRow merges by header, so ORDER_ID/CREATED_AT/CREATED_BY and anything else not
    // in this patch keep their original values — only what the form owns is rewritten.
    await updateRow(
      env.sheets.transactions,
      ORDER_TAB,
      "ORDER_ID",
      orderId,
      punchToSheet({
        ...punchFieldsFromBody(body, seller, buyer),
        BASIC_AMOUNT: money(basicAmount),
        TAX_AMOUNT: money(taxAmount),
        TOTAL_AMOUNT: money(roundOff(basicAmount + taxAmount)),
      })
    );

    res.json({ orderId });
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
    scope: z.literal("Invoice"),
    type: z.enum(["Percentage", "Rupees"]),
    discountPct: z.number().min(0).max(100).optional(),
    discountRs: z.number().min(0).optional(),
  }),
  z.object({
    applicable: z.literal(true),
    reason: z.string().min(1),
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
// The form's Description field was removed (the user dropped it from the live sheet too) —
// "Discount Details" is no longer written to from here, just left blank on every new row.
// "Default Discount Type" (Invoice/Item scope) is a different column from "Default Discount
// on" (Percentage/Rupees) — easy to conflate the two by name alone.
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
ordersRouter.post("/:id/discount", requireModule("sale-order"), async (req, res, next) => {
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
async function createPlaceholderSoConfirmation(
  orderId: string,
  saleOrderId: string,
  employeeId: string,
  saleOrderFormFields: { soNo: string; soDate: string; soAttachmentUrl: string; soRemarks: string }
): Promise<void> {
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
      // ORDER_PUNCH has no Sale Order No./Date/Attachment/Remarks columns of its own (those
      // only live on SALE_ORDERS) — the ...order spread above can't carry them, so they're
      // passed in explicitly from the /sale-order-form route that just wrote them.
      SO_NO: saleOrderFormFields.soNo,
      SO_DATE: saleOrderFormFields.soDate,
      SO_ATTACHMENT_URL: saleOrderFormFields.soAttachmentUrl,
      SO_REMARKS: saleOrderFormFields.soRemarks,
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
        ...saleOrderItemFromSheet(item),
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

/**
 * Completes the Sale Order stage for one order, given the four Sale Order fields.
 * `createPlaceholderSaleOrder()` (called from the discount route) already created the
 * SALE_ORDERS + SALE_ORDER_ITEMS rows with those fields blank — this fills them in via
 * updateRow instead of appending a second row (falling back to a fresh append if somehow no
 * placeholder exists), resyncs SALE_ORDER_ITEMS, advances ORDER_PUNCH.STATUS, and creates the
 * SO_Confirmation placeholder for the next stage.
 *
 * Shared by BOTH the manual upload route and the one-click Create Sale Order route below, so
 * the two can't drift — the only difference between them is where the four field values come
 * from (doer-typed vs auto-generated).
 */
async function finalizeSaleOrder(
  orderId: string,
  employeeId: string,
  fields: { soNo: string; soDate: string; soAttachmentUrl: string; soRemarks: string }
): Promise<{ saleOrderId: string } | { error: { code: string; message: string } }> {
  const orders = (await readTable(env.sheets.transactions, ORDER_TAB)).map(punchFromSheet);
  const order = orders.find((o) => o.ORDER_ID === orderId);
  if (!order) return { error: { code: "NOT_FOUND", message: "Order not found" } };

  const now = new Date().toISOString();
  const existingSaleOrder = (await readTable(env.sheets.transactions, "SALE_ORDERS")).find(
    (r) => r.ORDER_ID === orderId
  );
  const saleOrderId = existingSaleOrder?.SALE_ORDER_ID ?? (await nextId("SO", "SALE_ORDERS", "SALE_ORDER_ID"));

  const saleOrderFields = saleOrderToSheet({
    ...order,
    CREATED_AT: now,
    CREATED_BY: employeeId,
    ORDER_ID: orderId,
    SALE_ORDER_ID: saleOrderId,
    SO_NO: fields.soNo,
    SO_DATE: fields.soDate,
    SO_ATTACHMENT_URL: fields.soAttachmentUrl,
    SO_REMARKS: fields.soRemarks,
    STATUS: "PENDING",
  });
  if (existingSaleOrder) {
    await updateRow(env.sheets.transactions, "SALE_ORDERS", "ORDER_ID", orderId, saleOrderFields);
  } else {
    await appendRow(env.sheets.transactions, "SALE_ORDERS", saleOrderFields);
  }

  // SALE_ORDER_ITEMS uses the same column names as ORDER_ITEMS (no renaming). The
  // placeholder copy from discount time might be stale if anything changed since, so
  // resync from scratch rather than assume it's still accurate.
  const items = (await readTable(env.sheets.transactions, "ORDER_ITEMS")).filter((i) => i.ORDER_ID === orderId);
  await deleteRows(env.sheets.transactions, "SALE_ORDER_ITEMS", "ORDER_ID", [orderId]);
  if (items.length > 0) {
    const soItemIds = await nextIds("SOI", "SALE_ORDER_ITEMS", "SALE_ORDER_ITEM_ID", items.length);
    await appendRows(
      env.sheets.transactions,
      "SALE_ORDER_ITEMS",
      items.map((item, i) => ({
        ...item,
        Timestamp: now,
        Useremail: employeeId,
        SALE_ORDER_ID: saleOrderId,
        SALE_ORDER_ITEM_ID: soItemIds[i],
      }))
    );
  }

  // The punch order's part in the pipeline is done; mark it so the Sale Order actions hide.
  // Deliberately still the literal "SALE ORDER" — revertOrphanedSaleOrder(), the SO
  // Confirmation stage and BEFORE_DISPATCH_APPROVAL_COMPLETED all key off this exact value.
  await updateRow(
    env.sheets.transactions,
    ORDER_TAB,
    "ORDER_ID",
    orderId,
    punchToSheet({ STATUS: "SALE ORDER", CREATED_BY: employeeId })
  );

  await createPlaceholderSoConfirmation(orderId, saleOrderId, employeeId, fields);

  return { saleOrderId };
}

/** Saves the manually-uploaded Sale Order form. */
ordersRouter.post("/:id/sale-order-form", requireModule("sale-order"), async (req, res, next) => {
  try {
    const body = saleOrderFormSchema.parse(req.body);
    const result = await finalizeSaleOrder(req.params.id, req.user!.employeeId, {
      soNo: body.soNo,
      soDate: body.soDate,
      soAttachmentUrl: body.soAttachmentUrl,
      soRemarks: body.soRemarks,
    });
    if ("error" in result) return res.status(404).json({ error: result.error });
    res.json({ orderId: req.params.id, saleOrderId: result.saleOrderId });
  } catch (err) {
    next(err);
  }
});

/** Indian fiscal year label for a date, e.g. 2026-08-17 -> "26-27" (FY starts in April). */
function fiscalYearLabel(d: Date): string {
  const y = d.getFullYear();
  const startYear = d.getMonth() + 1 >= 4 ? y : y - 1;
  return `${String(startYear % 100).padStart(2, "0")}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

/** Next human-facing Sale Order No. in the ZOTO/SO/<FY>/<NNNN> series, continuing from the
 * highest number already present in SALE_ORDERS for the current fiscal year. */
async function nextSaleOrderNo(): Promise<string> {
  const fy = fiscalYearLabel(new Date());
  const prefix = `ZOTO/SO/${fy}/`;
  const rows = await readTable(env.sheets.transactions, "SALE_ORDERS");
  let max = 0;
  for (const r of rows) {
    const no = String(r["Sale Order No."] ?? "");
    if (!no.startsWith(prefix)) continue;
    const n = Number(no.slice(prefix.length));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

const DATE_FMT = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "2-digit" });

/**
 * One-click Create Sale Order: mints the Sale Order No., dates it today, generates the PDF
 * from the Sale Order Template T1 Google Doc (GST version — the item table also carries an
 * Output CGST/SGST Tax Payable row pair, unlike System 2's tax-free template), uploads it,
 * and completes the stage with that PDF as the Sale Order Attachment. Generated BEFORE
 * anything is written, so a generation failure leaves the order exactly where it was (still
 * showing the button) rather than advancing it with no attachment.
 */
ordersRouter.post("/:id/create-sale-order", requireModule("sale-order"), async (req, res, next) => {
    try {
      const orderId = req.params.id;
      const orderRow = (await readTable(env.sheets.transactions, ORDER_TAB)).find((r) => r.ORDER_ID === orderId);
      if (!orderRow) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Order not found" } });
      const order = punchFromSheet(orderRow);

      if (order.STATUS !== "PENDING SALE ORDER") {
        return res.status(409).json({
          error: {
            code: "WRONG_STAGE",
            message: `Sale Order can only be created while the order is at "PENDING SALE ORDER" (currently "${order.STATUS}").`,
          },
        });
      }

      const now = new Date();
      const saleOrderNo = await nextSaleOrderNo();
      const soDate = now.toISOString().slice(0, 10);

      // Fresh live lookup, not order.BRANCH_NAME — ORDER_PUNCH only ever stored the branch
      // location ("Delhi"), never the legal company name, so it isn't available any other way.
      const seller = await getSellerFields();

      const items = (await readTable(env.sheets.transactions, "ORDER_ITEMS"))
        .filter((r) => r.ORDER_ID === orderId)
        .map(itemFromSheet);

      const totalQty = items.reduce((sum, it) => sum + (Number(it.QTY) || 0), 0);
      const totalAmount = Number(order.TOTAL_AMOUNT) || 0;
      const orderBasicAmount = Number(order.BASIC_AMOUNT) || 0;
      const orderTaxAmount = Number(order.TAX_AMOUNT) || 0;
      // Derived from ORDER_PUNCH's own resummed Basic/Tax/Total — NOT a re-sum of item rows.
      // Some legacy items can have blank per-item CGST/SGST (pre-dating that split), which
      // would make an item-level subtraction wrongly swallow the whole tax amount into
      // "Round Off" on this invoice. The order-level total is always authoritative here.
      const roundOffAmount = totalAmount - (orderBasicAmount + orderTaxAmount);
      // The Output CGST/SGST/IGST Tax Payable rows are still summed from the items for
      // display — informational only, doesn't affect the Total/Round Off line above. An
      // order is always either CGST+SGST (intra-state) or IGST (inter-state), never a mix,
      // since splitGst() decides that once for the whole order — so whichever pair is zero
      // gets its row(s) deleted from the printed PDF rather than showing a redundant "0.00".
      const cgstTotal = items.reduce((sum, it) => sum + (Number(it.CGST) || 0), 0);
      const sgstTotal = items.reduce((sum, it) => sum + (Number(it.SGST) || 0), 0);
      const igstTotal = items.reduce((sum, it) => sum + (Number(it.IGST) || 0), 0);
      const removeTaxRowLabels =
        igstTotal > 0 ? ["Output CGST Tax Payable", "Output SGST Tax Payable"] : ["Output IGST Tax Payable"];

      const pdfResult = await generateSaleOrderPdf(
        orderId,
        {
          saleOrderNo,
          saleOrderDate: DATE_FMT.format(now),
          paymentType: order.PAYMENT_TYPE ?? "",
          customerName: order.CUSTOMER_NAME ?? "",
          purchaseOrderNo: order.PO_NO ?? "",
          saleOrderRemarks: `Auto-generated on ${DATE_FMT.format(now)}`,
          consigneeName: order.CONSIGNEE_NAME || order.CUSTOMER_NAME || "",
          preferredDeliveryMode: order.PREFERRED_DELIVERY_MODE ?? "",
          preferredTransporterName: order.PREFERRED_TPT_NAME ?? "",
          shippingState: blankIfNA(order.SHIPPING_STATE),
          roundOff: roundOffAmount.toFixed(2),
          totalQuantity: String(totalQty),
          totalAmount: totalAmount.toFixed(2),
          amountInWords: amountInWords(totalAmount),
          cgstTotal: cgstTotal.toFixed(2),
          sgstTotal: sgstTotal.toFixed(2),
          igstTotal: igstTotal.toFixed(2),
          branchName: seller.FIRM_NAME || order.BRANCH_NAME || "",
          sellerAddressLine1: order.SELLER_ADDRESS_1 ?? "",
          sellerAddressLine2: order.SELLER_ADDRESS_2 ?? "",
          sellerState: order.SELLER_STATE ?? "",
          sellerPincode: order.SELLER_PINCODE ?? "",
          sellerEmail: order.SELLER_EMAIL ?? "",
          sellerGstin: order.SELLER_GSTIN ?? "",
          billingAddressLine1: blankIfNA(order.BILLING_ADDRESS),
          billingAddressLine2: blankIfNA(order.BILLING_ADDRESS_2),
          billingState: blankIfNA(order.BILLING_STATE),
          buyerGstin: order.BUYER_GSTIN ?? "",
          consigneeGstin: order.CONSIGNEE_GSTIN ?? "",
          shippingAddressLine1: blankIfNA(order.SHIPPING_ADDRESS),
          shippingAddressLine2: blankIfNA(order.SHIPPING_ADDRESS_2),
        },
        items.map((it) => ({
          partNo: String(it.PART_NO ?? ""),
          partName: String(it.PART_NAME ?? ""),
          hsn: "",
          dueOn: DATE_FMT.format(now),
          quantity: String(it.QTY ?? ""),
          unit: String(it.UOM ?? ""),
          price: String(it.PRICE ?? ""),
          discountPct: String(it.DISCOUNT_PCT ?? ""),
          basicAmount: String(it.BASIC_AMOUNT ?? ""),
        })),
        "descriptionFirst",
        8,
        removeTaxRowLabels
      );

      if ("error" in pdfResult) {
        return res.status(502).json({
          error: {
            code: "SALE_ORDER_PDF_FAILED",
            message: `Could not generate the Sale Order PDF. The order has not been changed. ${pdfResult.error}`,
          },
        });
      }
      const pdfFileId = pdfResult.fileId;

      const result = await finalizeSaleOrder(orderId, req.user!.employeeId, {
        soNo: saleOrderNo,
        soDate,
        soAttachmentUrl: pdfFileId,
        soRemarks: `Auto-generated on ${DATE_FMT.format(now)}`,
      });
      if ("error" in result) return res.status(404).json({ error: result.error });

      res.json({
        orderId,
        saleOrderId: result.saleOrderId,
        saleOrderNo,
        saleOrderDate: soDate,
        attachmentFileId: pdfFileId,
      });
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
  preferredZotoVehicleId: z.string().optional(), zotoVehicleDetails: z.string().optional(), zotoVehicleType: z.string().optional(), zotoVehicleNo: z.string().optional(), zotoVehicleSize: z.string().optional(), zotoVehicleDriverName: z.string().optional(), zotoVehicleDriverContactNo: z.string().optional(),
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

/** Creates one blank "Dispatch Items Approval" placeholder row per item the moment an order
 * is Confirmed — same "row exists one stage earlier than the form that fills it in"
 * convention as createPlaceholderSaleOrder()/createPlaceholderSoConfirmation() (see
 * CLAUDE.md), so the item is visible in the sheet with Status "Dispatch Approval Pending"
 * from confirmation onward instead of only appearing once a decision is actually submitted.
 * No-ops per item if a row already exists (order can be re-confirmed, e.g. after a Changes
 * round-trip). The doer's actual decision (POST /:orderId/items/:itemId/dispatch-approval)
 * still appends its own fresh row on top — this placeholder is just the initial visible
 * state, not something later updated in place, since that route's own audit-log/follow-ups
 * design already expects one row per decision. */
async function createPlaceholderDispatchItemsApproval(
  order: SheetRow,
  items: SheetRow[],
  saleOrderId: string,
  confIdByItemId: Map<string, { confId: string; confItemId: string }>,
  userEmployeeId: string
) {
  if (items.length === 0) return;
  const existingIds = new Set(
    (await readTable(env.sheets.transactions, "Dispatch Items Approval"))
      .filter((r) => r.ORDER_ID === order.ORDER_ID)
      .map((r) => r.ITEM_ID)
  );
  const pending = items.filter((item) => !existingIds.has(item.ITEM_ID));
  if (pending.length === 0) return;

  const now = new Date().toISOString();
  const dispatchIds = await nextIds("DA", "Dispatch Items Approval", "Disp Conf Item ID", pending.length);
  await appendRows(
    env.sheets.transactions,
    "Dispatch Items Approval",
    pending.map((item, i) =>
      dispatchApprovalToSheet({
        CREATED_AT: now,
        CREATED_BY: userEmployeeId,
        ORDER_ID: order.ORDER_ID,
        ITEM_ID: item.ITEM_ID,
        SALE_ORDER_ID: saleOrderId,
        SALE_ORDER_ITEM_ID: item.SALE_ORDER_ITEM_ID ?? "",
        CONF_ID: confIdByItemId.get(item.ITEM_ID)?.confId ?? "",
        CONF_ITEM_ID: confIdByItemId.get(item.ITEM_ID)?.confItemId ?? "",
        DISPATCH_ID: dispatchIds[i],
        CUST_ID: order.CUST_ID ?? "",
        CUSTOMER_NAME: order.CUSTOMER_NAME ?? "",
        BUSINESS_SEGMENT: order.BUSINESS_SEGMENT ?? "",
        TYPE_OF_CUSTOMER: order.TYPE_OF_CUSTOMER ?? "",
        SALE_TYPE: order.SALE_TYPE ?? "",
        BUYER_GSTIN: order.BUYER_GSTIN ?? "",
        SEGMENT: item.SEGMENT ?? "",
        CATEGORY: item.CATEGORY ?? "",
        PART_NAME: item.PART_NAME ?? "",
        PART_NO: item.PART_NO ?? "",
        SPECIAL_INSTRUCTIONS: item.SPECIAL_INSTRUCTIONS ?? "",
        PACKING_REQUIREMENTS: item.PACKING_REQUIREMENTS ?? "",
        NOTES: item.NOTES ?? "",
        ORDER_QTY: item.QTY ?? "",
        UOM: item.UOM ?? "",
        DISPATCH_APPROVAL: "",
        STATUS: "Dispatch Approval Pending",
      })
    )
  );
}

/** Saves the SO Confirmation decision. Confirmed orders advance to Dispatch Approval;
 * cancelled orders finish in this queue; requested changes update both source rows and stay pending. */
ordersRouter.post("/:id/so-confirmation", requireModule("so-confirmation"), async (req, res, next) => {
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
          PREFERRED_ZOTO_VEHICLE_ID: body.changes.preferredZotoVehicleId, ZOTO_VEHICLE_DETAILS: body.changes.zotoVehicleDetails,
          ZOTO_VEHICLE_TYPE: body.changes.zotoVehicleType, ZOTO_VEHICLE_NO: body.changes.zotoVehicleNo, ZOTO_VEHICLE_SIZE: body.changes.zotoVehicleSize,
          ZOTO_VEHICLE_DRIVER_NAME: body.changes.zotoVehicleDriverName, ZOTO_VEHICLE_DRIVER_CONTACT: body.changes.zotoVehicleDriverContactNo,
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
        // itemToSheet() only knows ORDER_ITEMS' own columns — it never sets SALE_ORDER_ITEM_ID,
        // which only exists on SALE_ORDER_ITEMS. Without minting one here, every row this
        // "Changes" outcome recreates ends up with a permanently blank SALE_ORDER_ITEM_ID,
        // same class of gap as the fix already applied to saleOrderItemFromSheet()'s read
        // side — this is the write side of the same column.
        const soItemIds = await nextIds("SOI", "SALE_ORDER_ITEMS", "SALE_ORDER_ITEM_ID", newItemRows.length);
        await appendRows(
          env.sheets.transactions,
          "SALE_ORDER_ITEMS",
          newItemRows.map((row, i) => ({
            ...itemToSheet(row),
            SALE_ORDER_ID: saleOrder.SALE_ORDER_ID,
            SALE_ORDER_ITEM_ID: soItemIds[i],
          }))
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

      const snapshotItems = (await readTable(env.sheets.transactions, "SALE_ORDER_ITEMS")).filter((i) => i.ORDER_ID === req.params.id).map(saleOrderItemFromSheet);
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
    const confirmedAt = new Date().toISOString();
    await Promise.all([
      updateRow(env.sheets.transactions, "SALE_ORDERS", "ORDER_ID", req.params.id, saleOrderToSheet({ STATUS: "COMPLETED", APPROVAL_STATUS: confirmed ? "CONFIRMED" : "CANCELLED", APPROVAL_REMARKS: body.remarks, CREATED_BY: req.user!.employeeId })),
      // APPROVAL_TIME ("SO Confirmation Time" on the Dispatch Approval queue) is set here —
      // this is the moment the order actually enters that queue.
      updateRow(env.sheets.transactions, ORDER_TAB, "ORDER_ID", req.params.id, punchToSheet({ STATUS: confirmed ? "DISPATCH APPROVAL" : "CANCELLED", APPROVAL_STATUS: confirmed ? "CONFIRMED" : "CANCELLED", APPROVAL_REMARKS: body.remarks, APPROVAL_TIME: confirmedAt, CREATED_BY: req.user!.employeeId })),
    ]);

    const snapshotItems = (await readTable(env.sheets.transactions, "SALE_ORDER_ITEMS")).filter((i) => i.ORDER_ID === req.params.id).map(saleOrderItemFromSheet);
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

    if (confirmed) {
      // Sourced from SALE_ORDER_ITEMS (not ORDER_ITEMS) specifically so each item's own
      // SALE_ORDER_ITEM_ID (minted when the Sale Order form was saved) is available to carry
      // onto the Dispatch Items Approval placeholder row below — ORDER_ITEMS has no such
      // column at all.
      const orderItems = (await readTable(env.sheets.transactions, "SALE_ORDER_ITEMS")).filter((i) => i.ORDER_ID === req.params.id).map(saleOrderItemFromSheet);
      // logSoConfirmation (just above) minted a fresh Conf_ID/Conf Item ID per item on
      // SO_Confirmation_Items — re-read it so Dispatch Items Approval's placeholder rows can
      // carry the same reference IDs, matching the live sheet's own linked-tab convention.
      const confItemRows = (await readTable(env.sheets.transactions, "SO_Confirmation_Items")).filter((r) => r.ORDER_ID === req.params.id);
      const confIdByItemId = new Map(confItemRows.map((r) => [r.ITEM_ID, { confId: r.Conf_ID ?? "", confItemId: r["Conf Item ID"] ?? "" }]));
      await createPlaceholderDispatchItemsApproval(punchFromSheet(punch), orderItems, saleOrder.SALE_ORDER_ID, confIdByItemId, req.user!.employeeId);
    }

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

/** Saves the Dispatch Approval decision for ONE item only (per-item, not per-order — a
 * customer's other items on the same order are untouched and stay in the pending queue
 * until each is individually decided).
 *
 * An item's order quantity can now be decided across MULTIPLE rounds — e.g. 10 of 12
 * approved today, the remaining 2 decided later in a separate submission. Each round that
 * actually decides something (Dispatch Today/Short Quantity/Excess Quantity) appends its
 * OWN new "Dispatch Items Approval" row (own Disp Conf Item ID, own PDI placeholder) rather
 * than overwriting the previous round's — only the very first round, or a chain of
 * "Dispatch Extended" holds before any real decision, still updates the SO-Confirmation-time
 * placeholder row in place (unchanged single-decision behavior). The order's own STATUS only
 * advances to "DISPATCH APPROVAL COMPLETED" once every item's running balance reaches zero
 * across however many rounds it took. */
ordersRouter.post("/:orderId/items/:itemId/dispatch-approval", requireModule("dispatch-approval"), async (req, res, next) => {
  try {
    const body = dispatchApprovalSchema.parse(req.body);
    const [punchRows, items, existingDispatchRows] = await Promise.all([
      readTable(env.sheets.transactions, ORDER_TAB),
      readTable(env.sheets.transactions, "SALE_ORDER_ITEMS"),
      readTable(env.sheets.transactions, "Dispatch Items Approval"),
    ]);
    const punch = punchRows.find((row) => row.ORDER_ID === req.params.orderId);
    if (!punch) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Order not found" } });
    }
    const order = punchFromSheet(punch);
    const orderItems = items.filter((i) => i.ORDER_ID === req.params.orderId).map(saleOrderItemFromSheet);
    const item = orderItems.find((i) => i.ITEM_ID === req.params.itemId);
    if (!item) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Item not found on this order" } });
    }

    const orderQty = Number(item.QTY || 0);
    const rowsForOrder = existingDispatchRows.filter((r) => r.ORDER_ID === req.params.orderId);
    const priorSummary = summarizeDispatchDecisions(rowsForOrder).get(req.params.itemId);
    const priorBalance = dispatchBalance(orderQty, priorSummary);
    if (priorBalance <= 0) {
      return res.status(409).json({
        error: { code: "ALREADY_DECIDED", message: "This item's full order quantity has already been decided across earlier rounds." },
      });
    }
    // A round's own quantity can't exceed what's actually still outstanding — Excess
    // Quantity is exempt since it's explicitly "more than was ordered," not bounded by it.
    const roundQty =
      body.outcome === "Dispatch Today" ? body.approvedQty
      : body.outcome === "Short Quantity" ? body.shortQty
      : undefined;
    if (roundQty !== undefined && roundQty > priorBalance) {
      return res.status(400).json({
        error: {
          code: "EXCEEDS_BALANCE",
          message: `Only ${priorBalance} ${item.UOM || ""} is still outstanding on this item — can't decide ${roundQty}.`.trim(),
        },
      });
    }

    const now = new Date().toISOString();
    const qtyField =
      body.outcome === "Dispatch Today" ? { APPROVED_QTY: body.approvedQty }
      : body.outcome === "Short Quantity" ? { SHORT_QTY: body.shortQty }
      : body.outcome === "Excess Quantity" ? { EXCESS_QTY: body.excessQty }
      : {};

    const fields = dispatchApprovalToSheet({
      CREATED_AT: now,
      CREATED_BY: req.user!.employeeId,
      ORDER_ID: req.params.orderId,
      ITEM_ID: item.ITEM_ID,
      // Only actually written on the fallback append path (updateRow's merge-by-header
      // leaves an existing placeholder's own SALE_ORDER_ITEM_ID untouched, since it's not
      // part of what a resubmission's own patch changes).
      SALE_ORDER_ITEM_ID: item.SALE_ORDER_ITEM_ID ?? "",
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
      // This "Status" column is this tab's own display label, separate from
      // ORDER_PUNCH.STATUS (never touched here) — "Dispatch Today"/"Dispatch Extended" are
      // the raw outcome values the form submits, but the doer wants a human-readable status
      // word instead of the outcome repeated verbatim.
      STATUS:
        body.outcome === "Dispatch Today" ? "Dispatch Approved"
        : body.outcome === "Dispatch Extended" ? "Dispatch Date Extended"
        : body.outcome,
    });

    // The very first round for this item (still just the blank SO-Confirmation-time
    // placeholder, or a chain of "Dispatch Extended" holds before any real decision) updates
    // that one row in place — unchanged from the original single-decision behavior. Once a
    // REAL decision (Dispatch Today/Short/Excess) has already happened at least once for this
    // item, every further round — including another real decision against the remaining
    // balance, or a fresh hold on it — appends its OWN new row instead, so each round stays
    // independently auditable and (for Dispatch Today) gets its own PDI placeholder.
    const existingRowForItem = existingDispatchRows.find((r) => r.ORDER_ID === req.params.orderId && r.ITEM_ID === req.params.itemId);
    let dispConfItemId: string;
    if (existingRowForItem && !priorSummary?.hasRealDecision) {
      dispConfItemId = existingRowForItem["Disp Conf Item ID"];
      await updateRow(env.sheets.transactions, "Dispatch Items Approval", "Disp Conf Item ID", dispConfItemId, fields);
    } else {
      const [dispatchId] = await nextIds("DA", "Dispatch Items Approval", "Disp Conf Item ID", 1);
      dispConfItemId = dispatchId;
      await appendRow(env.sheets.transactions, "Dispatch Items Approval", { ...fields, [DISPATCH_APPROVAL_MAP.DISPATCH_ID]: dispatchId });
    }

    // As soon as this round is actually approved (not Extended/Short/Excess — those are holds
    // or exceptions, not a go-ahead), create ITS OWN PDI placeholder immediately — same "one
    // stage earlier" convention as the Dispatch Items Approval placeholder itself, so this
    // round shows up in the PDI queue right away instead of only once every sibling item (or
    // every other round of this same item) is also decided. Carries this round's own Disp
    // Conf Item ID, matching the live PDI tab's own linking column, and only this round's own
    // approved quantity — not the item's full order quantity, and not any other round's.
    if (body.outcome === "Dispatch Today") {
      await createPlaceholderPdi(order, item, req.user!.employeeId, dispConfItemId, body.approvedQty);
    }

    // Recompute every item's balance on the order with this round folded in (fields is
    // already shaped as a raw sheet row, safe to feed straight into the same summarizer).
    const updatedSummaryByItemId = summarizeDispatchDecisions([...rowsForOrder, fields]);
    const allItemsDecided = orderItems.every((i) => dispatchBalance(Number(i.QTY || 0), updatedSummaryByItemId.get(i.ITEM_ID)) <= 0);
    if (allItemsDecided) {
      await updateRow(
        env.sheets.transactions,
        ORDER_TAB,
        "ORDER_ID",
        req.params.orderId,
        punchToSheet({ STATUS: "DISPATCH APPROVAL COMPLETED", APPROVAL_REMARKS: body.remarks, CREATED_BY: req.user!.employeeId })
      );
    }

    const remainingBalance = dispatchBalance(orderQty, updatedSummaryByItemId.get(req.params.itemId));
    res.json({ orderId: req.params.orderId, itemId: req.params.itemId, orderCompleted: allItemsDecided, remainingBalance });
  } catch (err) {
    next(err);
  }
});

/** Advances an order to the next pipeline stage. Note: ORDER_PUNCH has no stage column, so
 * this reflects the change via STATUS only until the pipeline tabs are wired (phase 2). */
ordersRouter.post("/:id/stage", anyOrderModule, async (req, res, next) => {
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
