import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { appendRow, ensureSheetTab, readTable, updateRow, type SheetRow } from "../services/sheets.js";
import { nextId, nextIds } from "../services/ids.js";
import { requireAuth, requireModule } from "../middleware/auth.js";
import { punchFromSheet, punchToSheet } from "./orderPunchMap.js";
import { itemFromSheet } from "./itemMap.js";
import { ORDER_SNAPSHOT_MAP, orderSnapshotToSheet, vehicleSnapshotToSheet } from "./tripMap.js";

// "Transport_SO" turned out to be a pre-built live tab that never actually got a header row
// set (readTable tolerates a missing TAB, but appendRow throws on a tab that exists with a
// blank row 1 — that's what was happening here) — this defensively (re)creates the header
// row to match, mirroring the object shape attachOrders below actually appends.
const TRANSPORT_SO_HEADERS = ["Timestamp", "Useremail", "ORDER_ID", "Transport_ID", "Transport_SO_ID", ...Object.values(ORDER_SNAPSHOT_MAP), "Status"];
import { getSellerFields } from "./orders.js";

export const tripsRouter = Router();
tripsRouter.use(requireAuth);
tripsRouter.use(requireModule("transport"));

const ORDER_TAB = "ORDER_PUNCH";

/**
 * Transport, Tax Invoice, Pre Dispatch, Vehicle Dispatch, Dispatch, LR and Delivery are
 * all TRIP-level in the live sheet (one truck/invoice/dispatch/LR/delivery can carry
 * several orders at once, via the Transport_SO/Tax_Invoice_SO junction tabs) — this
 * mirrors the old ADC CRR system exactly (see docs/Report.md). This router owns the
 * whole trip lifecycle; Frontend/src/modules/transport/ is the corresponding UI.
 *
 * Lifecycle: create trip -> attach one or more PRE TRANSPORT COMPLETED orders -> mark
 * reached -> release stock -> raise tax invoice -> pre-dispatch -> vehicle dispatch ->
 * dispatch -> collect LR -> mark delivered. Every step cascades ORDER_PUNCH.STATUS to
 * every order attached to the trip.
 */

async function getAttachedOrders(transportId: string) {
  const [transportSoRows, orderPunchRows] = await Promise.all([
    readTable(env.sheets.transactions, "Transport_SO"),
    readTable(env.sheets.transactions, ORDER_TAB),
  ]);
  const attached = transportSoRows.filter((r) => r.Transport_ID === transportId);
  const punchByOrderId = new Map(orderPunchRows.map((r) => [r.ORDER_ID, r]));
  return attached
    .map((so) => {
      const punch = punchByOrderId.get(so.ORDER_ID);
      return punch ? { orderId: so.ORDER_ID, transportSoId: so.Transport_SO_ID, order: punchFromSheet(punch) } : null;
    })
    .filter((x): x is { orderId: string; transportSoId: string; order: SheetRow } => x !== null);
}

async function cascadeStatus(orderIds: string[], status: string, employeeId: string) {
  for (const orderId of orderIds) {
    await updateRow(env.sheets.transactions, ORDER_TAB, "ORDER_ID", orderId, punchToSheet({ STATUS: status, CREATED_BY: employeeId }));
  }
}

async function getTransportRow(transportId: string) {
  const rows = await readTable(env.sheets.transactions, "TRANSPORT");
  return rows.find((r) => r.Transport_ID === transportId);
}

/** Orders ready to be attached to a trip. */
tripsRouter.get("/eligible-orders", async (_req, res, next) => {
  try {
    const rows = (await readTable(env.sheets.transactions, ORDER_TAB)).map(punchFromSheet).filter((r) => r.STATUS === "PRE TRANSPORT COMPLETED");
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/** Item-level view of orders waiting for (or already picked up by) vehicle arrangement —
 * Timestamp, CUST ID, Customer Name, Part No., Part Name, Quantity, Unit, plus a literal
 * Status label ("Transport Pending" / "Vehicle Arrange Completed"), matching the old CRR
 * "Pending Transport" reference view's visibility intent. That reference also showed Balance
 * Quantity/NUG/Packing Type columns, but those came from the now-removed Pre Transport
 * stage's own manual entry — no longer collected anywhere, so they're intentionally left out
 * here rather than shown as fabricated data.
 *
 * status=COMPLETED reads `Transport_Products` directly instead of filtering live
 * ORDER_PUNCH.STATUS — an order that's since progressed even further (Transport Reached,
 * etc.) still keeps its own Transport_Products row, so it won't silently vanish from this
 * Completed view the way a live-status equality filter would (the exact bug class already
 * hit once on Dispatch Approval's own Completed filter, see orders.ts). */
tripsRouter.get("/eligible-items", async (req, res, next) => {
  try {
    const { status } = req.query as { status?: string };

    if (status === "COMPLETED") {
      const rows = (await readTable(env.sheets.transactions, "Transport_Products")).map((r) => ({
        CREATED_AT: r["Timestamp"] || "",
        ORDER_ID: r["ORDER_ID"] || "",
        ITEM_ID: r["ITEM_ID"] || "",
        CUST_ID: r["CUST ID"] || "",
        CUSTOMER_NAME: r["Customer Name"] || "",
        PART_NO: r["Part No."] || "",
        PART_NAME: r["Part Name"] || "",
        QTY: r["Quantity"] || "",
        UOM: r["Unit"] || "",
        STATUS_LABEL: "Vehicle Arrange Completed",
      }));
      res.json(rows);
      return;
    }

    const [punchRows, itemRows] = await Promise.all([
      readTable(env.sheets.transactions, ORDER_TAB),
      readTable(env.sheets.transactions, "ORDER_ITEMS"),
    ]);
    const orders = punchRows.map(punchFromSheet).filter((o) => o.STATUS === "PRE TRANSPORT COMPLETED");
    const orderById = new Map(orders.map((o) => [o.ORDER_ID, o]));
    const rows = itemRows
      .filter((i) => orderById.has(i.ORDER_ID))
      .map(itemFromSheet)
      .map((item) => {
        const order = orderById.get(item.ORDER_ID)!;
        return {
          CREATED_AT: order.CREATED_AT || "",
          ORDER_ID: order.ORDER_ID,
          ITEM_ID: item.ITEM_ID,
          CUST_ID: order.CUST_ID || "",
          CUSTOMER_NAME: order.CUSTOMER_NAME || "",
          PART_NO: item.PART_NO || "",
          PART_NAME: item.PART_NAME || "",
          QTY: item.QTY || "",
          UOM: item.UOM || "",
          STATUS_LABEL: "Transport Pending",
        };
      });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

tripsRouter.get("/", async (req, res, next) => {
  try {
    const { status } = req.query as { status?: string };
    const rows = await readTable(env.sheets.transactions, "TRANSPORT");
    // status=ALL powers the "Completed Transport" trip-level list (TransportList.tsx) —
    // matches the old CRR reference's own "Completed Transport" view, which is just every
    // arranged trip regardless of which downstream stage it's since reached, not filtered
    // to one specific status.
    const filtered = status === "ALL" ? rows : status ? rows.filter((r) => r.Status === status) : rows.filter((r) => r.Status === "OPEN");
    res.json(filtered);
  } catch (err) {
    next(err);
  }
});

tripsRouter.get("/:transportId", async (req, res, next) => {
  try {
    const transport = await getTransportRow(req.params.transportId);
    if (!transport) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Trip not found" } });
    const [attached, productRows] = await Promise.all([
      getAttachedOrders(req.params.transportId),
      readTable(env.sheets.transactions, "Transport_Products"),
    ]);
    // "S.O Dispatches" (attached orders) and "S.O Items Dispatches" (their line items) —
    // matches the old CRR reference's trip detail layout exactly.
    const dispatches = attached.map((a) => ({
      orderId: a.orderId,
      transportSoId: a.transportSoId,
      customerName: a.order.CUSTOMER_NAME || "",
      timestamp: a.order.CREATED_AT || "",
    }));
    const items = productRows
      .filter((r) => r.Transport_ID === req.params.transportId)
      .map((r) => ({
        partNo: r["Part No."] || "",
        partName: r["Part Name"] || "",
        totalQtyOfOrder: r["Quantity"] || "",
        loadQty: r["Load Qty"] || "",
        unit: r["Unit"] || "",
        loadBoxes: r["Load Boxes"] || "",
      }));
    res.json({ transport, orders: attached.map((o) => o.order), dispatches, items });
  } catch (err) {
    next(err);
  }
});

const createTripSchema = z.object({
  vehicleArrangeFor: z.string().min(1),
  sendThrough: z.string().optional().default(""),
  transporterId: z.string().optional().default(""),
  transporterName: z.string().optional().default(""),
  vehicleType: z.string().optional().default(""),
  vehicleNo: z.string().optional().default(""),
  vehicleSize: z.string().optional().default(""),
  driverName: z.string().optional().default(""),
  driverContactNo: z.string().optional().default(""),
  freightApplicableOnInvoice: z.string().optional().default(""),
  freightCharge: z.number().min(0).optional(),
  freightGstApplicable: z.string().optional().default(""),
  description: z.string().optional().default(""),
});

tripsRouter.post("/", async (req, res, next) => {
  try {
    const body = createTripSchema.parse(req.body);
    const transportId = await nextId("TPTR", "TRANSPORT", "Transport_ID");
    await appendRow(env.sheets.transactions, "TRANSPORT", {
      Timestamp: new Date().toISOString(),
      Useremail: req.user!.employeeId,
      Transport_ID: transportId,
      "Vehicle Arrange for": body.vehicleArrangeFor,
      "Send Through": body.sendThrough,
      "Transporter ID": body.transporterId,
      "Transporter Name": body.transporterName,
      "Vehicle type": body.vehicleType,
      "Vehicle No.": body.vehicleNo,
      "Vehicle Size (Ft)": body.vehicleSize,
      "Driver Name": body.driverName,
      "Driver Contact No.": body.driverContactNo,
      "Freight Applicable On Invoice?": body.freightApplicableOnInvoice,
      "Freight Charge": body.freightCharge !== undefined ? String(body.freightCharge) : "",
      "Freight GST Applicable": body.freightGstApplicable,
      Description: body.description,
      Status: "OPEN",
    });
    res.status(201).json({ transportId });
  } catch (err) {
    next(err);
  }
});

const attachOrdersSchema = z.object({
  orders: z
    .array(
      z.object({
        orderId: z.string().min(1),
        // Optional per-item quantity+box picks (the "Load Limit Details"/TransportItemsForm
        // flow) — when given, only these items are loaded onto this trip, at the doer's
        // chosen quantity rather than the item's full order quantity. Omitted (or an order
        // with no items array at all) keeps the old whole-order-at-full-quantity behavior.
        items: z.array(z.object({ itemId: z.string().min(1), qty: z.number().positive(), loadBoxes: z.number().optional() })).optional(),
        // The Transport Form's own Logistic Details tab — editable per order, not just
        // copied from the order's own preferred fields (matching the old CRR reference).
        preferredDeliveryMode: z.string().optional(),
        freightPaidBy: z.string().optional(),
        freightPaidAt: z.string().optional(),
      })
    )
    .min(1),
});

tripsRouter.post("/:transportId/orders", async (req, res, next) => {
  try {
    const { orders: orderEntries } = attachOrdersSchema.parse(req.body);
    const orderIds = orderEntries.map((o) => o.orderId);
    const transport = await getTransportRow(req.params.transportId);
    if (!transport) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Trip not found" } });

    await ensureSheetTab(env.sheets.transactions, "Transport_SO", TRANSPORT_SO_HEADERS);

    const [orderPunchRows, allItems] = await Promise.all([
      readTable(env.sheets.transactions, ORDER_TAB),
      readTable(env.sheets.transactions, "ORDER_ITEMS"),
    ]);
    const now = new Date().toISOString();
    const soIds = await nextIds("TPTSO", "Transport_SO", "Transport_SO_ID", orderEntries.length);

    for (const [i, entry] of orderEntries.entries()) {
      const punch = orderPunchRows.find((r) => r.ORDER_ID === entry.orderId);
      if (!punch) continue;
      const order = punchFromSheet(punch);
      const transportSoId = soIds[i];

      const logisticsOverrides = {
        "Preferred Delivery Mode": entry.preferredDeliveryMode ?? order.PREFERRED_DELIVERY_MODE ?? "",
        "Freight Paid by": entry.freightPaidBy ?? order.FREIGHT_PAID_BY ?? "",
        "Freight Paid at": entry.freightPaidAt ?? "",
      };

      await appendRow(env.sheets.transactions, "Transport_SO", {
        Timestamp: now,
        Useremail: req.user!.employeeId,
        ORDER_ID: entry.orderId,
        Transport_ID: req.params.transportId,
        Transport_SO_ID: transportSoId,
        ...orderSnapshotToSheet(order),
        // ORDER_SNAPSHOT_MAP writes "Customer Name" (the spelling every other trip-family
        // tab uses) — Transport_SO alone still has the live sheet's old "Cutomer Name" typo,
        // so it's written explicitly here too rather than trying to make the shared map
        // handle two different spellings for the same tab family.
        "Cutomer Name": order.CUSTOMER_NAME ?? "",
        ...logisticsOverrides,
        Status: "ASSIGNED",
      });

      const orderItems = allItems.filter((it) => it.ORDER_ID === entry.orderId).map(itemFromSheet);
      const pickByItemId = new Map(entry.items?.map((p) => [p.itemId, p]));
      const items = entry.items ? orderItems.filter((it) => pickByItemId.has(it.ITEM_ID)) : orderItems;
      const pdIds = await nextIds("TPTPD", "Transport_Products", "Transport_Pd_ID", Math.max(items.length, 1));
      for (const [j, item] of items.entries()) {
        const pick = pickByItemId.get(item.ITEM_ID);
        const orderQty = Number(item.QTY || 0);
        const loadQty = pick?.qty ?? orderQty;
        await appendRow(env.sheets.transactions, "Transport_Products", {
          Timestamp: now,
          Useremail: req.user!.employeeId,
          ORDER_ID: entry.orderId,
          ITEM_ID: item.ITEM_ID,
          Transport_ID: req.params.transportId,
          Transport_SO_ID: transportSoId,
          Transport_Pd_ID: pdIds[j],
          ...orderSnapshotToSheet(order),
          ...logisticsOverrides,
          Segment: item.SEGMENT ?? "",
          Category: item.CATEGORY ?? "",
          "Part Name": item.PART_NAME ?? "",
          "Part No.": item.PART_NO ?? "",
          "Special Instructions": item.SPECIAL_INSTRUCTIONS ?? "",
          "Packing Requirements": item.PACKING_REQUIREMENTS ?? "",
          "Additional Notes": item.NOTES ?? "",
          // No cross-trip balance tracking exists yet (an item could in principle be split
          // across multiple vehicles over time) — Balance Qty to Dispatch is shown as the
          // item's own full order quantity for now, same "no IMS yet" gap flagged elsewhere
          // in this app, not a fabricated running balance.
          Quantity: String(orderQty),
          Unit: item.UOM ?? "NOS",
          "Balance Qty to Dispatch": String(orderQty),
          "Load Qty": String(loadQty),
          "New Balance Qty to Dispatch": String(Math.max(orderQty - loadQty, 0)),
          "Load Boxes": pick?.loadBoxes !== undefined ? String(pick.loadBoxes) : "",
          Status: "ASSIGNED",
        });
      }
    }

    await cascadeStatus(orderIds, "TRANSPORT ASSIGNED", req.user!.employeeId);
    res.json({ transportId: req.params.transportId, attached: orderIds.length });
  } catch (err) {
    next(err);
  }
});

// Not every stage form in the reference UI has a mandatory catch-all remarks field (e.g.
// Transport Reached only requires Reason when Reached=No) — kept optional here so the
// backend doesn't force a field the real UX doesn't always show.
const remarksSchema = z.object({ remarks: z.string().optional().default("") });

tripsRouter.post("/:transportId/reached", async (req, res, next) => {
  try {
    const schema = z.object({
      reached: z.string().min(1),
      sameVehicle: z.string().optional().default(""),
      expectedDateTime: z.string().optional().default(""),
      reason: z.string().optional().default(""),
    }).merge(remarksSchema);
    const body = schema.parse(req.body);
    const transport = await getTransportRow(req.params.transportId);
    if (!transport) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Trip not found" } });
    const attached = await getAttachedOrders(req.params.transportId);
    const now = new Date().toISOString();
    const reachIds = await nextIds("TPTRCH", "Transport_Reached", "Transport_Reach_ID", Math.max(attached.length, 1));

    for (const [i, a] of attached.entries()) {
      await appendRow(env.sheets.transactions, "Transport_Reached", {
        Timestamp: now,
        Useremail: req.user!.employeeId,
        ORDER_ID: a.orderId,
        Transport_ID: req.params.transportId,
        Transport_Reach_ID: reachIds[i],
        "Vehicle type": transport["Vehicle type"] ?? "",
        "Vehicle No.": transport["Vehicle No."] ?? "",
        "Vehicle Size (Ft)": transport["Vehicle Size (Ft)"] ?? "",
        "Driver Name": transport["Driver Name"] ?? "",
        "Driver Contact No.": transport["Driver Contact No."] ?? "",
        "Transport Reached": body.reached,
        "Same Vehicle": body.sameVehicle,
        "Expected DateTime": body.expectedDateTime,
        Reason: body.reason,
        Status: "REACHED",
      });
    }

    await updateRow(env.sheets.transactions, "TRANSPORT", "Transport_ID", req.params.transportId, { Status: "REACHED" });
    await cascadeStatus(attached.map((a) => a.orderId), "TRANSPORT REACHED", req.user!.employeeId);
    res.json({ transportId: req.params.transportId, status: "TRANSPORT REACHED" });
  } catch (err) {
    next(err);
  }
});

tripsRouter.post("/:transportId/stock-release", async (req, res, next) => {
  try {
    const schema = z.object({ releaseType: z.string().min(1), releaseFrom: z.string().optional().default("") }).merge(remarksSchema);
    const body = schema.parse(req.body);
    const transport = await getTransportRow(req.params.transportId);
    if (!transport) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Trip not found" } });

    const productRows = (await readTable(env.sheets.transactions, "Transport_Products")).filter((r) => r.Transport_ID === req.params.transportId);
    const now = new Date().toISOString();
    const stockIds = await nextIds("STKPD", "STOCK_RELEASE", "Stock_Pd_ID", Math.max(productRows.length, 1));

    for (const [i, p] of productRows.entries()) {
      await appendRow(env.sheets.transactions, "STOCK_RELEASE", {
        Timestamp: now,
        Useremail: req.user!.employeeId,
        ORDER_ID: p.ORDER_ID,
        ITEM_ID: p.ITEM_ID,
        Transport_Pd_ID: p.Transport_Pd_ID,
        Stock_Pd_ID: stockIds[i],
        Segment: p.Segment ?? "",
        Category: p.Category ?? "",
        "Part Name": p["Part Name"] ?? "",
        "Part No.": p["Part No."] ?? "",
        "Vehicle type": transport["Vehicle type"] ?? "",
        "Vehicle No.": transport["Vehicle No."] ?? "",
        "Vehicle Size (Ft)": transport["Vehicle Size (Ft)"] ?? "",
        "Driver Name": transport["Driver Name"] ?? "",
        "Driver Contact No.": transport["Driver Contact No."] ?? "",
        Quantity: p.Quantity ?? "",
        Unit: p.Unit ?? "NOS",
        Type: body.releaseType,
        From: body.releaseFrom,
        "Release Quantity": p.Quantity ?? "",
        Description: body.remarks,
        Status: "RELEASED",
      });
    }

    const orderIds = [...new Set(productRows.map((p) => p.ORDER_ID))];
    await updateRow(env.sheets.transactions, "TRANSPORT", "Transport_ID", req.params.transportId, { Status: "STOCK RELEASED" });
    await cascadeStatus(orderIds, "STOCK RELEASED", req.user!.employeeId);
    res.json({ transportId: req.params.transportId, status: "STOCK RELEASED" });
  } catch (err) {
    next(err);
  }
});

tripsRouter.post("/:transportId/tax-invoice", async (req, res, next) => {
  try {
    const schema = z.object({
      taxInvoiceNo: z.string().min(1),
      taxInvoiceDate: z.string().min(1),
      taxInvoiceAttachmentUrl: z.string().optional().default(""),
      eWayBillApplicable: z.string().optional().default(""),
      eWayBillNo: z.string().optional().default(""),
      eWayBillDate: z.string().optional().default(""),
      eWayBillAttachmentUrl: z.string().optional().default(""),
    }).merge(remarksSchema);
    const body = schema.parse(req.body);
    const transport = await getTransportRow(req.params.transportId);
    if (!transport) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Trip not found" } });
    const attached = await getAttachedOrders(req.params.transportId);
    if (attached.length === 0) return res.status(400).json({ error: { code: "BAD_REQUEST", message: "No orders on this trip" } });

    const now = new Date().toISOString();
    const invoiceId = await nextId("INVC", "TAX_INVOICE", "Invoice_ID");
    const seller = await getSellerFields();

    await appendRow(env.sheets.transactions, "TAX_INVOICE", {
      Timestamp: now,
      Useremail: req.user!.employeeId,
      Transport_ID: req.params.transportId,
      Invoice_ID: invoiceId,
      "Branch ID": seller.BRANCH_ID ?? "",
      "Branch Name": seller.BRANCH_NAME ?? "",
      "Seller GSTIN No.": seller.SELLER_GSTIN ?? "",
      "Seller Email ID": seller.SELLER_EMAIL ?? "",
      "Seller Contact No.": seller.SELLER_CONTACT ?? "",
      "Seller Address Line 1": seller.SELLER_ADDRESS_1 ?? "",
      "Seller Address Line 2": seller.SELLER_ADDRESS_2 ?? "",
      "Seller State": seller.SELLER_STATE ?? "",
      "Seller Pin code": seller.SELLER_PINCODE ?? "",
      "Seller Country": seller.SELLER_COUNTRY ?? "",
      ...orderSnapshotToSheet(attached[0].order),
      ...vehicleSnapshotToSheet(transport),
      "Tax Invoice No.": body.taxInvoiceNo,
      "Tax Invoice Date": body.taxInvoiceDate,
      "Tax Invoice Attachment": body.taxInvoiceAttachmentUrl,
      "Tax Invoice Remarks": body.remarks,
      "E-Way Bill Applicable": body.eWayBillApplicable,
      "E-Way Bill No.": body.eWayBillNo,
      "E-Way Bill Date": body.eWayBillDate,
      "E-Way Bill Attachment": body.eWayBillAttachmentUrl,
      Status: "COMPLETED",
    });

    const soIds = await nextIds("INVCSO", "Tax_Invoice_SO", "Invoice_SO_ID", attached.length);
    for (const [i, a] of attached.entries()) {
      const invoiceSoId = soIds[i];
      const saleOrders = await readTable(env.sheets.transactions, "SALE_ORDERS");
      const saleOrder = saleOrders.find((s) => s.ORDER_ID === a.orderId);
      await appendRow(env.sheets.transactions, "Tax_Invoice_SO", {
        Timestamp: now,
        Useremail: req.user!.employeeId,
        ORDER_ID: a.orderId,
        Transport_ID: req.params.transportId,
        Transport_SO_ID: a.transportSoId,
        Invoice_ID: invoiceId,
        Invoice_SO_ID: invoiceSoId,
        "Sale Order No.": saleOrder?.["Sale Order No."] ?? "",
        "Sale Order Date": saleOrder?.["Sale Order Date"] ?? "",
        "Sale Order Attachment": saleOrder?.["Sale Order Attachment"] ?? "",
        "Order Type": a.order.ORDER_TYPE ?? "",
        "Payment Type": a.order.PAYMENT_TYPE ?? "",
        ...orderSnapshotToSheet(a.order),
        Status: "COMPLETED",
      });

      const productRows = (await readTable(env.sheets.transactions, "Transport_Products")).filter(
        (p) => p.Transport_ID === req.params.transportId && p.ORDER_ID === a.orderId
      );
      const pdIds = await nextIds("INVCPD", "Tax_Invoice_Products", "Invoice_Pd_ID", Math.max(productRows.length, 1));
      for (const [j, p] of productRows.entries()) {
        await appendRow(env.sheets.transactions, "Tax_Invoice_Products", {
          Timestamp: now,
          Useremail: req.user!.employeeId,
          ORDER_ID: a.orderId,
          ITEM_ID: p.ITEM_ID,
          Transport_ID: req.params.transportId,
          Transport_SO_ID: a.transportSoId,
          Transport_Pd_ID: p.Transport_Pd_ID,
          Invoice_ID: invoiceId,
          Invoice_SO_ID: invoiceSoId,
          Invoice_Pd_ID: pdIds[j],
          Segment: p.Segment ?? "",
          Category: p.Category ?? "",
          "Part Name": p["Part Name"] ?? "",
          "Part No.": p["Part No."] ?? "",
          Quantity: p.Quantity ?? "",
          Unit: p.Unit ?? "NOS",
          Status: "COMPLETED",
        });
      }
    }

    await updateRow(env.sheets.transactions, "TRANSPORT", "Transport_ID", req.params.transportId, { Status: "TAX INVOICE COMPLETED" });
    await cascadeStatus(attached.map((a) => a.orderId), "TAX INVOICE COMPLETED", req.user!.employeeId);
    res.json({ transportId: req.params.transportId, invoiceId, status: "TAX INVOICE COMPLETED" });
  } catch (err) {
    next(err);
  }
});

tripsRouter.post("/:transportId/pre-dispatch", async (req, res, next) => {
  try {
    const body = remarksSchema.parse(req.body);
    const transport = await getTransportRow(req.params.transportId);
    if (!transport) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Trip not found" } });
    const attached = await getAttachedOrders(req.params.transportId);
    const invoices = (await readTable(env.sheets.transactions, "TAX_INVOICE")).filter((r) => r.Transport_ID === req.params.transportId);
    const invoiceId = invoices.at(-1)?.Invoice_ID ?? "";

    const preDispatchId = await nextId("PRED", "Pre Dispatch", "Pre Dispatch ID");
    await appendRow(env.sheets.transactions, "Pre Dispatch", {
      Timestamp: new Date().toISOString(),
      Useremail: req.user!.employeeId,
      Transport_ID: req.params.transportId,
      "Pre Dispatch ID": preDispatchId,
      "Invoice_ID forDataPickUseOnly": invoiceId,
      ...(attached[0] ? orderSnapshotToSheet(attached[0].order) : {}),
      ...vehicleSnapshotToSheet(transport),
      Description: body.remarks,
      Status: "COMPLETED",
    });

    await updateRow(env.sheets.transactions, "TRANSPORT", "Transport_ID", req.params.transportId, { Status: "PRE DISPATCH COMPLETED" });
    await cascadeStatus(attached.map((a) => a.orderId), "PRE DISPATCH COMPLETED", req.user!.employeeId);
    res.json({ transportId: req.params.transportId, preDispatchId, status: "PRE DISPATCH COMPLETED" });
  } catch (err) {
    next(err);
  }
});

tripsRouter.post("/:transportId/vehicle-dispatch", async (req, res, next) => {
  try {
    const schema = z.object({
      dispatched: z.string().min(1),
      freightCharges: z.number().optional(),
      otherCharges: z.number().optional(),
      paymentStatus: z.string().optional().default(""),
    }).merge(remarksSchema);
    const body = schema.parse(req.body);
    const transport = await getTransportRow(req.params.transportId);
    if (!transport) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Trip not found" } });
    const attached = await getAttachedOrders(req.params.transportId);

    const vehicleDispatchId = await nextId("VDSP", "Vehicle Dispatch", "Vehicle_Dispatch_ID");
    await appendRow(env.sheets.transactions, "Vehicle Dispatch", {
      Timestamp: new Date().toISOString(),
      Useremail: req.user!.employeeId,
      Transport_ID: req.params.transportId,
      Vehicle_Dispatch_ID: vehicleDispatchId,
      "Vehicle Arrange for": transport["Vehicle Arrange for"] ?? "",
      "Send Through": transport["Send Through"] ?? "",
      "Transporter ID": transport["Transporter ID"] ?? "",
      "Transporter Name": transport["Transporter Name"] ?? "",
      "Vehicle type": transport["Vehicle type"] ?? "",
      "Vehicle No.": transport["Vehicle No."] ?? "",
      "Vehicle Size (Ft)": transport["Vehicle Size (Ft)"] ?? "",
      "Driver Name": transport["Driver Name"] ?? "",
      "Driver Contact No.": transport["Driver Contact No."] ?? "",
      Dispatched: body.dispatched,
      "Freight Charges": body.freightCharges !== undefined ? String(body.freightCharges) : "",
      "Other Charges by ADC": body.otherCharges !== undefined ? String(body.otherCharges) : "",
      "Payment Status": body.paymentStatus,
      "Dispatch Description": body.remarks,
      Status: "COMPLETED",
    });

    await updateRow(env.sheets.transactions, "TRANSPORT", "Transport_ID", req.params.transportId, { Status: "VEHICLE DISPATCH COMPLETED" });
    await cascadeStatus(attached.map((a) => a.orderId), "VEHICLE DISPATCH COMPLETED", req.user!.employeeId);
    res.json({ transportId: req.params.transportId, vehicleDispatchId, status: "VEHICLE DISPATCH COMPLETED" });
  } catch (err) {
    next(err);
  }
});

tripsRouter.post("/:transportId/dispatch", async (req, res, next) => {
  try {
    const schema = z.object({
      gatePassAttachmentUrl: z.string().optional().default(""),
      freightCharges: z.number().optional(),
      otherCharges: z.number().optional(),
      paymentStatus: z.string().optional().default(""),
    }).merge(remarksSchema);
    const body = schema.parse(req.body);
    const transport = await getTransportRow(req.params.transportId);
    if (!transport) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Trip not found" } });
    const attached = await getAttachedOrders(req.params.transportId);
    const preDispatches = (await readTable(env.sheets.transactions, "Pre Dispatch")).filter((r) => r.Transport_ID === req.params.transportId);
    const vehicleDispatches = (await readTable(env.sheets.transactions, "Vehicle Dispatch")).filter((r) => r.Transport_ID === req.params.transportId);

    const dispatchId = await nextId("DISP", "Dispatch", "Dispatch ID");
    await appendRow(env.sheets.transactions, "Dispatch", {
      Timestamp: new Date().toISOString(),
      Useremail: req.user!.employeeId,
      Transport_ID: req.params.transportId,
      "Pre Dispatch ID": preDispatches.at(-1)?.["Pre Dispatch ID"] ?? "",
      Vehicle_Dispatch_ID: vehicleDispatches.at(-1)?.Vehicle_Dispatch_ID ?? "",
      "Dispatch ID": dispatchId,
      ...(attached[0] ? orderSnapshotToSheet(attached[0].order) : {}),
      ...vehicleSnapshotToSheet(transport),
      Dispatched: "Yes",
      "Dispatch Gate Pass": body.gatePassAttachmentUrl,
      "Freight Charges": body.freightCharges !== undefined ? String(body.freightCharges) : "",
      "Other Charges": body.otherCharges !== undefined ? String(body.otherCharges) : "",
      "Payment Status": body.paymentStatus,
      "Dispatch Description": body.remarks,
      Status: "DISPATCHED",
    });

    await updateRow(env.sheets.transactions, "TRANSPORT", "Transport_ID", req.params.transportId, { Status: "DISPATCHED" });
    await cascadeStatus(attached.map((a) => a.orderId), "DISPATCHED", req.user!.employeeId);
    res.json({ transportId: req.params.transportId, dispatchId, status: "DISPATCHED" });
  } catch (err) {
    next(err);
  }
});

tripsRouter.post("/:transportId/lr", async (req, res, next) => {
  try {
    const schema = z.object({
      lrNo: z.string().min(1),
      lrDate: z.string().min(1),
      lrAttachmentUrl: z.string().optional().default(""),
      lrCharges: z.number().optional(),
      paymentStatus: z.string().optional().default(""),
      otherCharges: z.number().optional(),
    }).merge(remarksSchema);
    const body = schema.parse(req.body);
    const transport = await getTransportRow(req.params.transportId);
    if (!transport) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Trip not found" } });
    const attached = await getAttachedOrders(req.params.transportId);
    const dispatches = (await readTable(env.sheets.transactions, "Dispatch")).filter((r) => r.Transport_ID === req.params.transportId);
    const dispatch = dispatches.at(-1);
    if (!dispatch) return res.status(400).json({ error: { code: "BAD_REQUEST", message: "Trip has not been dispatched yet" } });

    const lrId = await nextId("LR", "LR", "LR ID");
    await appendRow(env.sheets.transactions, "LR", {
      Timestamp: new Date().toISOString(),
      Useremail: req.user!.employeeId,
      "Pre Dispatch ID": dispatch["Pre Dispatch ID"] ?? "",
      "Dispatch ID": dispatch["Dispatch ID"] ?? "",
      "LR ID": lrId,
      ...(attached[0] ? orderSnapshotToSheet(attached[0].order) : {}),
      ...vehicleSnapshotToSheet(transport),
      "LR No.": body.lrNo,
      "LR Date": body.lrDate,
      "LR Attachment": body.lrAttachmentUrl,
      "LR Charges": body.lrCharges !== undefined ? String(body.lrCharges) : "",
      "Payment Status": body.paymentStatus,
      "Other Charges": body.otherCharges !== undefined ? String(body.otherCharges) : "",
      "LR Remarks": body.remarks,
      Status: "COLLECTED",
    });

    await updateRow(env.sheets.transactions, "TRANSPORT", "Transport_ID", req.params.transportId, { Status: "LR COLLECTED" });
    await cascadeStatus(attached.map((a) => a.orderId), "LR COLLECTED", req.user!.employeeId);
    res.json({ transportId: req.params.transportId, lrId, status: "LR COLLECTED" });
  } catch (err) {
    next(err);
  }
});

tripsRouter.post("/:transportId/delivery", async (req, res, next) => {
  try {
    const schema = z.object({
      delivered: z.string().min(1),
      receivingAttachmentUrl: z.string().optional().default(""),
      anyCharges: z.string().optional().default(""),
      amount: z.number().optional(),
      freightChargesToTransporter: z.number().optional(),
      chargeDescription: z.string().optional().default(""),
      reason: z.string().optional().default(""),
      expectedDeliveryDate: z.string().optional().default(""),
    }).merge(remarksSchema);
    const body = schema.parse(req.body);
    const transport = await getTransportRow(req.params.transportId);
    if (!transport) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Trip not found" } });
    const attached = await getAttachedOrders(req.params.transportId);
    const dispatches = (await readTable(env.sheets.transactions, "Dispatch")).filter((r) => r.Transport_ID === req.params.transportId);
    const dispatch = dispatches.at(-1);
    if (!dispatch) return res.status(400).json({ error: { code: "BAD_REQUEST", message: "Trip has not been dispatched yet" } });

    const deliveryId = await nextId("DLRY", "DELIVERY", "Delivery ID");
    await appendRow(env.sheets.transactions, "DELIVERY", {
      Timestamp: new Date().toISOString(),
      Useremail: req.user!.employeeId,
      "Pre Dispatch ID": dispatch["Pre Dispatch ID"] ?? "",
      "Dispatch ID": dispatch["Dispatch ID"] ?? "",
      "Delivery ID": deliveryId,
      ...(attached[0] ? orderSnapshotToSheet(attached[0].order) : {}),
      ...vehicleSnapshotToSheet(transport),
      Delivered: body.delivered,
      Reason: body.reason,
      "Expected Delivery Date": body.expectedDeliveryDate,
      "Receiving Attachment": body.receivingAttachmentUrl,
      "Any Charges": body.anyCharges,
      Amount: body.amount !== undefined ? String(body.amount) : "",
      "Freight Charges to Transporter": body.freightChargesToTransporter !== undefined ? String(body.freightChargesToTransporter) : "",
      "Charge Description": body.chargeDescription,
      "Delivery Remarks": body.remarks,
      Status: "DELIVERED",
    });

    await updateRow(env.sheets.transactions, "TRANSPORT", "Transport_ID", req.params.transportId, { Status: "DELIVERED" });
    await cascadeStatus(attached.map((a) => a.orderId), "DELIVERED", req.user!.employeeId);
    res.json({ transportId: req.params.transportId, deliveryId, status: "DELIVERED" });
  } catch (err) {
    next(err);
  }
});
