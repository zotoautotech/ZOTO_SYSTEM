import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { appendRow, readTable, updateRow, type SheetRow } from "../services/sheets.js";
import { nextId, nextIds } from "../services/ids.js";
import { requireAuth, requireModule } from "../middleware/auth.js";
import { punchFromSheet, punchToSheet } from "./orderPunchMap.js";
import { itemFromSheet } from "./itemMap.js";
import { orderSnapshotToSheet, vehicleSnapshotToSheet } from "./tripMap.js";
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

/** Item-level view of the same eligible orders (one row per item: Timestamp, CUST ID,
 * Customer Name, Part No., Part Name, Quantity, Unit) — read-only visibility into what's
 * about to be picked up in "Arrange Vehicle" before a trip is actually created, matching the
 * old CRR "Pending Transport" reference view. That reference also showed Balance Quantity/
 * NUG/Packing Type columns, but those came from the now-removed Pre Transport stage's own
 * manual entry — no longer collected anywhere, so they're intentionally left out here rather
 * than shown as fabricated data. */
tripsRouter.get("/eligible-items", async (_req, res, next) => {
  try {
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
    const filtered = status ? rows.filter((r) => r.Status === status) : rows.filter((r) => r.Status === "OPEN");
    res.json(filtered);
  } catch (err) {
    next(err);
  }
});

tripsRouter.get("/:transportId", async (req, res, next) => {
  try {
    const transport = await getTransportRow(req.params.transportId);
    if (!transport) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Trip not found" } });
    const orders = await getAttachedOrders(req.params.transportId);
    res.json({ transport, orders: orders.map((o) => o.order) });
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
  freightCharge: z.number().optional(),
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
      Description: body.description,
      Status: "OPEN",
    });
    res.status(201).json({ transportId });
  } catch (err) {
    next(err);
  }
});

const attachOrdersSchema = z.object({ orderIds: z.array(z.string().min(1)).min(1) });

tripsRouter.post("/:transportId/orders", async (req, res, next) => {
  try {
    const { orderIds } = attachOrdersSchema.parse(req.body);
    const transport = await getTransportRow(req.params.transportId);
    if (!transport) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Trip not found" } });

    const [orderPunchRows, allItems] = await Promise.all([
      readTable(env.sheets.transactions, ORDER_TAB),
      readTable(env.sheets.transactions, "ORDER_ITEMS"),
    ]);
    const now = new Date().toISOString();
    const soIds = await nextIds("TPTSO", "Transport_SO", "Transport_SO_ID", orderIds.length);

    for (const [i, orderId] of orderIds.entries()) {
      const punch = orderPunchRows.find((r) => r.ORDER_ID === orderId);
      if (!punch) continue;
      const order = punchFromSheet(punch);
      const transportSoId = soIds[i];

      await appendRow(env.sheets.transactions, "Transport_SO", {
        Timestamp: now,
        Useremail: req.user!.employeeId,
        ORDER_ID: orderId,
        Transport_ID: req.params.transportId,
        Transport_SO_ID: transportSoId,
        ...orderSnapshotToSheet(order),
        Status: "ASSIGNED",
      });

      const items = allItems.filter((it) => it.ORDER_ID === orderId).map(itemFromSheet);
      const pdIds = await nextIds("TPTPD", "Transport_Products", "Transport_Pd_ID", Math.max(items.length, 1));
      for (const [j, item] of items.entries()) {
        await appendRow(env.sheets.transactions, "Transport_Products", {
          Timestamp: now,
          Useremail: req.user!.employeeId,
          ORDER_ID: orderId,
          ITEM_ID: item.ITEM_ID,
          Transport_ID: req.params.transportId,
          Transport_SO_ID: transportSoId,
          Transport_Pd_ID: pdIds[j],
          ...orderSnapshotToSheet(order),
          Segment: item.SEGMENT ?? "",
          Category: item.CATEGORY ?? "",
          "Part Name": item.PART_NAME ?? "",
          "Part No.": item.PART_NO ?? "",
          "Special Instructions": item.SPECIAL_INSTRUCTIONS ?? "",
          "Packing Requirements": item.PACKING_REQUIREMENTS ?? "",
          "Additional Notes": item.NOTES ?? "",
          Quantity: item.QTY ?? "",
          Unit: item.UOM ?? "NOS",
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
