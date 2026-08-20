import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { appendRow, appendRows, ensureSheetTab, readTable, updateRow, type SheetRow } from "../services/sheets.js";
import { nextId, nextIds } from "../services/ids.js";
import { requireAuth, requireModule, requireAnyModule, ORDER_FAMILY_MODULES } from "../middleware/auth.js";
import { punchFromSheet, punchToSheet } from "./orderPunchMap.js";
import { itemFromSheet, itemToSheet } from "./itemMap.js";
import { ORDER_SNAPSHOT_MAP, orderSnapshotToSheet, vehicleSnapshotToSheet } from "./tripMap.js";
import { ensureDispatchGatePass } from "../services/gatePass.js";

// "Transport_SO" turned out to be a pre-built live tab that never actually got a header row
// set (readTable tolerates a missing TAB, but appendRow throws on a tab that exists with a
// blank row 1 — that's what was happening here) — this defensively (re)creates the header
// row to match, mirroring the object shape attachOrders below actually appends.
const TRANSPORT_SO_HEADERS = ["Timestamp", "Useremail", "ORDER_ID", "Transport_ID", "Transport_SO_ID", ...Object.values(ORDER_SNAPSHOT_MAP), "Status"];
import { getSellerFields } from "./orders.js";

export const tripsRouter = Router();
tripsRouter.use(requireAuth);
// NO blanket requireModule here — every trip route used to require "transport", so a doer
// whose only module was Stock Release could not save their own stage's form (same bug that
// hit PDI-only doers on the orders router). Shared reads accept any order-family module;
// each stage's WRITE requires that stage's own key.
const anyOrderModule = requireAnyModule(ORDER_FAMILY_MODULES);

const ORDER_TAB = "ORDER_PUNCH";

/** ORDER_ITEMS' own Basic/Tax/CGST/SGST/IGST/Total Amount are computed against the item's
 * FULL order quantity — but a single Transport_Products/Tax_Invoice_Products row only ever
 * represents ONE dispatch round's load quantity, which can be less than the item's full
 * order quantity (e.g. 25 of 50 SET on a partial dispatch). Spreading the item's raw amount
 * fields unscaled onto that row leaves every amount column showing the FULL order total next
 * to a smaller Quantity — silently double (or more) the correct figure for that specific
 * trip/invoice line. Price/Discount %/GST Slab % are per-unit or percentage figures, so those
 * pass through unscaled; only the amount columns scale by loadQty/orderQty. Used by both
 * createPlaceholderTaxInvoice() (the Transport Reached-time placeholder) and the actual
 * POST /:transportId/tax-invoice submit handler, so neither can drift out of sync with the
 * other on this calculation. */
function scaledItemFields(item: SheetRow, loadQty: number): SheetRow {
  const orderQty = Number(item.QTY) || 0;
  const ratio = orderQty > 0 ? loadQty / orderQty : 1;
  const scale = (v: string | undefined) => {
    const n = Number(v);
    return v !== undefined && v !== "" && !Number.isNaN(n) ? (n * ratio).toFixed(2) : (v ?? "");
  };
  return {
    ...itemToSheet(item),
    "Discount (Rs)": scale(item.DISCOUNT_RS),
    "Basic Amount": scale(item.BASIC_AMOUNT),
    CGST: scale(item.CGST),
    SGST: scale(item.SGST),
    IGST: scale(item.IGST),
    "Tax Amount": scale(item.TAX_AMOUNT),
    "Total Amount": scale(item.TOTAL_AMOUNT),
  };
}

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

/** Mirrors the revertOrphanedX() convention already used at every earlier stage (see e.g.
 * revertOrphanedDispatchApproval in orders.ts, revertOrphanedPdi in stageRoutes.ts) — a doer
 * deleting an order's row(s) directly from Transport_SO leaves ORDER_PUNCH.STATUS stuck at
 * "TRANSPORT ASSIGNED" forever, vanishing from every queue (pending needs "PRE TRANSPORT
 * COMPLETED", Completed needs a live Transport_Products row). Detects that and reverts
 * STATUS back to "PRE TRANSPORT COMPLETED" so the order reappears in the Transport pending
 * queue instead. Single-direction only (unlike PDI's two-way revert) — attachOrders writes
 * Transport_SO/Transport_Products and cascades STATUS synchronously in one handler, so there's
 * no placeholder-then-fill-in race that could leave an order at prevStatus with the rows
 * already actually present. Runs from a GET, same as every other revert here, since the only
 * way the app learns about a hand-edit made directly in Sheets is by reading it. */
async function revertOrphanedTransportAssigned(rows: SheetRow[]): Promise<SheetRow[]> {
  if (!rows.some((r) => r.STATUS === "TRANSPORT ASSIGNED")) return rows;

  const soRows = await readTable(env.sheets.transactions, "Transport_SO", { refresh: true });
  const orderIdsWithSo = new Set(soRows.map((r) => r.ORDER_ID));

  const revertedById = new Map<string, SheetRow>();
  for (const order of rows) {
    if (order.STATUS !== "TRANSPORT ASSIGNED" || orderIdsWithSo.has(order.ORDER_ID)) continue;
    await updateRow(env.sheets.transactions, ORDER_TAB, "ORDER_ID", order.ORDER_ID, punchToSheet({ STATUS: "PRE TRANSPORT COMPLETED" }));
    revertedById.set(order.ORDER_ID, { ...order, STATUS: "PRE TRANSPORT COMPLETED" });
  }
  if (revertedById.size === 0) return rows;
  return rows.map((r) => revertedById.get(r.ORDER_ID) ?? r);
}

// Both STOCK_RELEASE and TAX_INVOICE now get a blank placeholder row the instant Transport
// Reached is submitted (see the /reached handler below) — same "row exists one stage earlier
// than the form that fills it in" convention already used for SALE_ORDERS/SO_Confirmation/PDI
// (see CLAUDE.md). That means row *existence* no longer signals "done" — only these specific
// fields, left blank on the placeholder and filled in by the doer's own form, do.
function isStockReleaseRowDone(r: SheetRow): boolean {
  return !!(r["Release Quantity"] ?? "").toString().trim();
}
function isTaxInvoiceRowDone(r: SheetRow): boolean {
  return !!(r["Tax Invoice No."] ?? "").toString().trim();
}

/** STOCK_RELEASE has no Transport_ID column of its own on the live sheet — only
 * Transport_Pd_ID, which references Transport_Products' own Transport_Pd_ID (that tab DOES
 * carry Transport_ID). So "does this trip have a Stock Release row yet" has to join through
 * Transport_Products rather than matching Transport_ID directly, unlike TAX_INVOICE (which
 * does have its own Transport_ID column). Caught by an actual end-to-end run against the live
 * sheet — a direct Transport_ID match here always returned false. */
async function getTransportIdsWithStockRelease(): Promise<Set<string>> {
  const [stockRows, productRows] = await Promise.all([
    readTable(env.sheets.transactions, "STOCK_RELEASE"),
    readTable(env.sheets.transactions, "Transport_Products"),
  ]);
  const transportIdByPdId = new Map(productRows.map((p) => [p.Transport_Pd_ID, p.Transport_ID]));
  const ids = new Set<string>();
  for (const r of stockRows) {
    if (!isStockReleaseRowDone(r)) continue;
    const tid = transportIdByPdId.get(r.Transport_Pd_ID);
    if (tid) ids.add(tid);
  }
  return ids;
}

async function getTransportIdsWithTaxInvoice(): Promise<Set<string>> {
  const rows = await readTable(env.sheets.transactions, "TAX_INVOICE");
  return new Set(rows.filter(isTaxInvoiceRowDone).map((r) => r.Transport_ID));
}

async function getTransportRow(transportId: string) {
  const rows = await readTable(env.sheets.transactions, "TRANSPORT");
  return rows.find((r) => r.Transport_ID === transportId);
}

/**
 * Every approved+PDI'd ROUND that hasn't been put on a trip yet.
 *
 * This is the unit Transport actually works with. Dispatch Approval can decide an item's
 * order quantity across several rounds (30 ordered, 20 approved today, 10 still open), and
 * each approved round gets its own PDI row keyed by its "Disp Conf Item ID". A round that
 * has cleared PDI is ready to travel **on its own** — it must not wait for its siblings, or
 * for the rest of its own item's quantity, to be decided. Gating on the order-level
 * ORDER_PUNCH.STATUS ("PRE TRANSPORT COMPLETED", only set once EVERY item is fully decided
 * and PDI'd) is what used to hold a finished 20 SET hostage to an undecided 10.
 */
async function unattachedPdiRounds(): Promise<SheetRow[]> {
  const [pdiRows, productRows] = await Promise.all([
    readTable(env.sheets.transactions, "PDI"),
    readTable(env.sheets.transactions, "Transport_Products"),
  ]);
  const attachedRoundIds = new Set(productRows.map((r) => r["Disp Conf Item ID"]).filter(Boolean));
  // Rows attached BEFORE this column existed carry no round id. Treating those as
  // "unattached" would resurrect already-shipped items into the pending queue, so fall back
  // to the old ORDER_ID+ITEM_ID identity for them only.
  const legacyAttachedItemKeys = new Set(
    productRows.filter((r) => !r["Disp Conf Item ID"]).map((r) => `${r.ORDER_ID}::${r.ITEM_ID}`)
  );
  return pdiRows.filter(
    (r) =>
      r.Status === "PDI Completed" &&
      !attachedRoundIds.has(r["Disp Conf Item ID"]) &&
      !legacyAttachedItemKeys.has(`${r.ORDER_ID}::${r.ITEM_ID}`)
  );
}

/** Orders with at least one approved+PDI'd round still waiting for a vehicle. */
tripsRouter.get("/eligible-orders", anyOrderModule, async (_req, res, next) => {
  try {
    const [punchRowsRaw, rounds] = await Promise.all([
      readTable(env.sheets.transactions, ORDER_TAB).then((rows) => rows.map(punchFromSheet)),
      unattachedPdiRounds(),
    ]);
    const punchRows = await revertOrphanedTransportAssigned(punchRowsRaw);
    const orderIdsWithRounds = new Set(rounds.map((r) => r.ORDER_ID));
    res.json(punchRows.filter((r) => orderIdsWithRounds.has(r.ORDER_ID)));
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
tripsRouter.get("/eligible-items", anyOrderModule, async (req, res, next) => {
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

    // Reads the PDI tab's own COMPLETED rows rather than ORDER_ITEMS. Dispatch Approval can
    // approve part of an item's order quantity (10 of 12) across several rounds, and each
    // approved round gets its own PDI row carrying only that round's quantity — so PDI is
    // the only source that knows what's actually cleared to travel. Going via ORDER_ITEMS
    // instead showed the item's FULL order quantity (12, not the approved 10) and, worse,
    // listed items that were never approved or PDI'd at all just because a sibling item
    // pushed the order's STATUS forward.
    const [punchRowsRaw, rounds] = await Promise.all([
      readTable(env.sheets.transactions, ORDER_TAB).then((rows) => rows.map(punchFromSheet)),
      unattachedPdiRounds(),
    ]);
    const punchRows = await revertOrphanedTransportAssigned(punchRowsRaw);
    const orderById = new Map(punchRows.map((o) => [o.ORDER_ID, o]));
    const rows = rounds
      .filter((r) => orderById.has(r.ORDER_ID))
      .map((r) => {
        const order = orderById.get(r.ORDER_ID)!;
        return {
          CREATED_AT: order.CREATED_AT || "",
          ORDER_ID: order.ORDER_ID,
          ITEM_ID: r.ITEM_ID || "",
          // The per-round identity — the same item can appear more than once here, one row
          // per approved Dispatch Approval round, each with its own quantity.
          DISP_CONF_ITEM_ID: r["Disp Conf Item ID"] || "",
          CUST_ID: order.CUST_ID || "",
          CUSTOMER_NAME: order.CUSTOMER_NAME || "",
          PART_NO: r["Part No."] || "",
          PART_NAME: r["Part Name"] || "",
          QTY: r.Quantity || "",
          UOM: r.Unit || "",
          STATUS_LABEL: "Transport Pending",
        };
      });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

tripsRouter.get("/", anyOrderModule, async (req, res, next) => {
  try {
    const { status, excludeIfInTab, includeIfInTab, itemLevel } = req.query as {
      status?: string;
      excludeIfInTab?: string;
      includeIfInTab?: string;
      itemLevel?: string;
    };
    const rows = await readTable(env.sheets.transactions, "TRANSPORT");
    // status=ALL powers the "Completed Transport" trip-level list (TransportList.tsx) —
    // matches the old CRR reference's own "Completed Transport" view, which is just every
    // arranged trip regardless of which downstream stage it's since reached, not filtered
    // to one specific status.
    let filtered = status === "ALL" ? rows : status ? rows.filter((r) => r.Status === status) : rows.filter((r) => r.Status === "OPEN");

    // Stock Release and Tax Invoice run in parallel off the same REACHED status (see the
    // stock-release/tax-invoice POST handlers above) — excludeIfInTab drops a trip from a
    // stage's pending queue once that stage's own tab already has a row for it (even though
    // the trip's overall Status hasn't advanced yet, since the other branch may still be
    // pending); includeIfInTab powers that same stage's own Completed toggle by checking the
    // tab directly instead of relying on Status, which may have already moved past REACHED.
    async function doneIdsForTab(tab: string): Promise<Set<string>> {
      if (tab === "STOCK_RELEASE") return getTransportIdsWithStockRelease();
      if (tab === "TAX_INVOICE") return getTransportIdsWithTaxInvoice();
      return new Set((await readTable(env.sheets.transactions, tab)).map((r) => r.Transport_ID));
    }
    if (excludeIfInTab) {
      const doneIds = await doneIdsForTab(excludeIfInTab);
      filtered = filtered.filter((r) => !doneIds.has(r.Transport_ID));
    }
    if (includeIfInTab) {
      const doneIds = await doneIdsForTab(includeIfInTab);
      filtered = filtered.filter((r) => doneIds.has(r.Transport_ID));
    }

    // itemLevel=true swaps the trip-level rows for the SAME matched trips' own
    // Transport_Products rows instead — one row per item rather than per trip, for stages
    // whose pending queue reads better item-first (Transport Reached, matching how the
    // Transport stage's own pending view already works via a different endpoint). Reuses the
    // exact trip selection above, so it can never drift from what the trip-level view shows.
    if (itemLevel === "true") {
      const tripIds = new Set(filtered.map((r) => r.Transport_ID));
      const products = (await readTable(env.sheets.transactions, "Transport_Products")).filter((r) =>
        tripIds.has(r.Transport_ID)
      );
      return res.json(products);
    }

    // Joins in the order-level fields the old CRR reference's own pending queues show
    // (Customer Name, Buyer GSTIN, Freight Paid by/at, Transport Mode, Transporter GSTIN,
    // Invoice Discount/Basic/Tax/Total Amount) per trip — TRANSPORT itself only carries the
    // vehicle-level snapshot (Vehicle type/No./Freight Charge etc., already on `filtered`),
    // never anything order-specific, since a trip can carry several orders at once. Reads the
    // FIRST attached order for that trip (via Transport_SO, then ORDER_PUNCH for the amount
    // fields Transport_SO doesn't carry) — good enough for the common one-customer-per-trip
    // case these reference views assume; a genuinely multi-order trip just shows the first.
    // "Cutomer Name" (typo) is Transport_SO's own live header — see CLAUDE.md.
    const tripIds = new Set(filtered.map((r) => r.Transport_ID));
    const [soRows, punchRows] = await Promise.all([
      readTable(env.sheets.transactions, "Transport_SO"),
      readTable(env.sheets.transactions, ORDER_TAB),
    ]);
    const punchByOrderId = new Map(punchRows.map((r) => [r.ORDER_ID, punchFromSheet(r)]));
    // Every order id attached to a trip, not just the first — a trip can carry several
    // orders, and a doer searching by ORDER_ID should find the trip regardless of which of
    // its attached orders that id belongs to.
    const orderIdsByTrip = new Map<string, string[]>();
    for (const row of soRows) {
      if (!tripIds.has(row.Transport_ID) || !row.ORDER_ID) continue;
      if (!orderIdsByTrip.has(row.Transport_ID)) orderIdsByTrip.set(row.Transport_ID, []);
      orderIdsByTrip.get(row.Transport_ID)!.push(row.ORDER_ID);
    }
    const snapshotByTrip = new Map<string, SheetRow>();
    for (const row of soRows) {
      if (!tripIds.has(row.Transport_ID) || snapshotByTrip.has(row.Transport_ID)) continue;
      const order = punchByOrderId.get(row.ORDER_ID);
      snapshotByTrip.set(row.Transport_ID, {
        "Order IDs": (orderIdsByTrip.get(row.Transport_ID) ?? []).join(" "),
        "Customer Name": row["Cutomer Name"] || row["Customer Name"] || "",
        "Buyer GSTIN No.": row["Buyer GSTIN No."] || "",
        "Freight Paid by": row["Freight Paid by"] || "",
        "Freight Paid at": row["Freight Paid at"] || "",
        "Transport Mode": row["Preferred Transportation Mode"] || "",
        "Transporter GSTIN": row["Transporter GSTIN"] || "",
        "Invoice Discount (Rs)": order?.INVOICE_DISCOUNT_RS || "",
        "Basic Amount": order?.BASIC_AMOUNT || "",
        "Tax Amount": order?.TAX_AMOUNT || "",
        "Total Amount": order?.TOTAL_AMOUNT || "",
      });
    }
    const enriched = filtered.map((r) => ({ ...r, ...(snapshotByTrip.get(r.Transport_ID) ?? { "Customer Name": "" }) }));

    res.json(enriched);
  } catch (err) {
    next(err);
  }
});

/** Every trip-stage tab that a stage queue is allowed to read its own COMPLETED rows from.
 * An allowlist rather than taking an arbitrary tab name off the query string — this endpoint
 * would otherwise let a caller dump any tab in the spreadsheet. */
const STAGE_ROW_TABS = new Set([
  "Transport_Reached",
  "STOCK_RELEASE",
  "TAX_INVOICE",
  "Dispatch",
  "LR",
  "DELIVERY",
]);

/**
 * A stage's OWN completed rows, straight off its own sheet tab — so each stage's Completed
 * view can show the fields that stage actually records (Stock Release's Release Quantity,
 * Tax Invoice's Invoice No./E-Way Bill, LR's LR No./Charges, Delivery's Receiving
 * Attachment…) instead of the same generic trip columns everywhere.
 *
 * Deliberately returns raw sheet rows: these six tabs have wildly different column sets
 * (18 to 95 columns) with no shared internal field-name map, and the frontend picks the
 * handful it displays per stage. Registered BEFORE "/:transportId" so "stage-rows" isn't
 * swallowed as a transport id — the same route-ordering hazard called out in CLAUDE.md.
 */
tripsRouter.get("/stage-rows", anyOrderModule, async (req, res, next) => {
  try {
    const { tab } = req.query as { tab?: string };
    if (!tab || !STAGE_ROW_TABS.has(tab)) {
      return res.status(400).json({ error: { code: "BAD_REQUEST", message: "Unknown or missing stage tab" } });
    }
    res.json(await readTable(env.sheets.transactions, tab));
  } catch (err) {
    next(err);
  }
});

tripsRouter.get("/:transportId", anyOrderModule, async (req, res, next) => {
  try {
    const transport = await getTransportRow(req.params.transportId);
    if (!transport) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Trip not found" } });
    // Self-healing retry: the only way the app learns a gate pass generation attempt
    // failed (e.g. right after attachOrders) is by seeing the column still blank when the
    // trip is read again — same revert-on-read reasoning used throughout this app.
    // ensureDispatchGatePass no-ops instantly if a value already exists.
    const [attached, productRows, soRows, stockReleaseIds, taxInvoiceIds, gatePassFileId] = await Promise.all([
      getAttachedOrders(req.params.transportId),
      readTable(env.sheets.transactions, "Transport_Products"),
      readTable(env.sheets.transactions, "Transport_SO"),
      getTransportIdsWithStockRelease(),
      getTransportIdsWithTaxInvoice(),
      ensureDispatchGatePass(req.params.transportId),
    ]);
    // The FIRST attached order's own Transport_SO row — carries the buyer/billing/shipping/
    // consignee/logistics snapshot exactly as it was at attach time (Freight Paid by/at,
    // Transporter GSTIN/PAN/Person Name/Contact/Address, Marka Code — several fields
    // ORDER_PUNCH itself doesn't have, since these are per-trip choices, not order defaults).
    // A trip carrying several orders just shows the first, same assumption the pending-list
    // join makes (see GET /transport-trips's own snapshotByTrip).
    const orderSnapshot = soRows.find((r) => r.Transport_ID === req.params.transportId) ?? null;
    // Stock Release / Tax Invoice run in parallel (see TRIP_STAGES' completionTab comment in
    // tripStages.ts) — TripDetail needs to know per-branch completion directly since
    // transport.Status alone can't distinguish "still pending this branch" from "done this
    // branch, other one still pending" while both sit at REACHED.
    const stockReleaseDone = stockReleaseIds.has(req.params.transportId);
    const taxInvoiceDone = taxInvoiceIds.has(req.params.transportId);
    // "S.O Dispatches" (attached orders) and "S.O Items Dispatches" (their line items) —
    // matches the old CRR reference's trip detail layout exactly.
    const dispatches = attached.map((a) => ({
      orderId: a.orderId,
      transportSoId: a.transportSoId,
      customerName: a.order.CUSTOMER_NAME || "",
      timestamp: a.order.CREATED_AT || "",
    }));
    const tripProductRows = productRows.filter((r) => r.Transport_ID === req.params.transportId);
    const items = tripProductRows.map((r) => ({
      partNo: r["Part No."] || "",
      partName: r["Part Name"] || "",
      totalQtyOfOrder: r["Quantity"] || "",
      loadQty: r["Load Qty"] || "",
      unit: r["Unit"] || "",
      loadBoxes: r["Load Boxes"] || "",
    }));
    // Tax Invoice's own item breakdown — Price/Basic/Tax/Total Amount, scaled the same way
    // (and by the same helper) as what actually gets written to Tax_Invoice_Products at
    // submission time, so the pending preview here never shows a different number than the
    // invoice will. See scaledItemFields' own comment for why raw ORDER_ITEMS amounts can't
    // be used unscaled on a partial-dispatch row.
    const itemByIdForInvoice = new Map(
      (await readTable(env.sheets.transactions, "ORDER_ITEMS")).map((r) => [r.ITEM_ID, itemFromSheet(r)])
    );
    const taxInvoiceItems = tripProductRows.map((r) => {
      const item = itemByIdForInvoice.get(r.ITEM_ID);
      const loadQty = Number(r.Quantity) || 0;
      const scaled = item ? scaledItemFields(item, loadQty) : null;
      return {
        partName: r["Part Name"] || "",
        qty: r.Quantity || "",
        unit: r["Unit"] || "",
        price: item?.PRICE || "",
        basicAmount: scaled?.["Basic Amount"] || "",
        taxAmount: scaled?.["Tax Amount"] || "",
        totalAmount: scaled?.["Total Amount"] || "",
        remarks: r["Additional Notes"] || "",
      };
    });
    res.json({ transport, orders: attached.map((o) => o.order), orderSnapshot, dispatches, items, taxInvoiceItems, stockReleaseDone, taxInvoiceDone, gatePassFileId });
  } catch (err) {
    next(err);
  }
});

const createTripSchema = z.object({
  vehicleArrangeFor: z.string().min(1),
  sendThrough: z.string().optional().default(""),
  transporterId: z.string().optional().default(""),
  transporterName: z.string().optional().default(""),
  // Drives the Vehicle Dispatch -> LR/Delivery branch below (registered transporters get an
  // LR step; everyone else skips straight to Delivery) — sourced from the Transporter Data
  // master's own "Transporter Type" column, picked alongside transporterId/transporterName.
  transporterType: z.string().optional().default(""),
  // Set only when sendThrough === "ZOTO Vehicle" — the picked row's own "zoto vehical id"
  // from the ZOTO Vehicle master, kept alongside the auto-filled vehicleType/vehicleNo/
  // vehicleSize/driverName/driverContactNo fields (same relationship as transporterId).
  zotoVehicleId: z.string().optional().default(""),
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

tripsRouter.post("/", requireModule("transport"), async (req, res, next) => {
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
      "Transporter Type": body.transporterType,
      "ZOTO Vehicle ID": body.zotoVehicleId,
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
        items: z.array(z.object({ itemId: z.string().min(1), qty: z.number().positive(), loadBoxes: z.number().optional(),
          dispConfItemId: z.string().optional() })).optional(),
        // The Transport Form's own Logistic Details tab — editable per order, not just
        // copied from the order's own preferred fields (matching the old CRR reference).
        preferredDeliveryMode: z.string().optional(),
        freightPaidBy: z.string().optional(),
        freightPaidAt: z.string().optional(),
      })
    )
    .min(1),
});

tripsRouter.post("/:transportId/orders", requireModule("transport"), async (req, res, next) => {
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
        // Missing here (every other trip-stage handler already spreads this) meant Vehicle
        // Details/Freight fields landed blank on every Transport_SO row — caught by dumping
        // the live sheet's actual data directly, not by assumption.
        ...vehicleSnapshotToSheet(transport),
        // vehicleSnapshotToSheet doesn't carry these — Transport_SO has its own literal
        // "Vehicle Arrange for"/"Send Through"/"Freight GST Applicable"/"Description"
        // columns (Transport_Products doesn't, so these aren't needed on that append below).
        "Vehicle Arrange for": transport["Vehicle Arrange for"] ?? "",
        "Send Through": transport["Send Through"] ?? "",
        "Freight GST Applicable": transport["Freight GST Applicable"] ?? "",
        Description: transport["Description"] ?? "",
        ...logisticsOverrides,
        Status: "ASSIGNED",
      });

      const orderItems = allItems.filter((it) => it.ORDER_ID === entry.orderId).map(itemFromSheet);
      // One entry per PICK, not per order item — an item split across two Dispatch Approval
      // rounds can legitimately appear twice here, each with its own quantity and round id.
      const picks = entry.items ?? orderItems.map((it) => ({ itemId: it.ITEM_ID, qty: Number(it.QTY || 0), loadBoxes: undefined as number | undefined, dispConfItemId: undefined as string | undefined }));
      const itemById = new Map(orderItems.map((it) => [it.ITEM_ID, it]));
      const pdIds = await nextIds("TPTPD", "Transport_Products", "Transport_Pd_ID", Math.max(picks.length, 1));
      for (const [j, pick] of picks.entries()) {
        const item = itemById.get(pick.itemId);
        if (!item) continue;
        // This round's own approved quantity is what travels — NOT the item's full order
        // quantity, which may still have undecided balance sitting upstream.
        const orderQty = pick.qty;
        const loadQty = pick.qty;
        await appendRow(env.sheets.transactions, "Transport_Products", {
          Timestamp: now,
          Useremail: req.user!.employeeId,
          ORDER_ID: entry.orderId,
          ITEM_ID: item.ITEM_ID,
          Transport_ID: req.params.transportId,
          Transport_SO_ID: transportSoId,
          Transport_Pd_ID: pdIds[j],
          "Disp Conf Item ID": pick.dispConfItemId ?? "",
          ...orderSnapshotToSheet(order),
          // Same gap as Transport_SO above — Vehicle Details landed blank without this.
          ...vehicleSnapshotToSheet(transport),
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
    // "Instant, on Save" gate pass generation — never blocks/fails this response either way
    // (ensureDispatchGatePass never throws); GET /:transportId retries if this didn't work.
    const gatePassFileId = await ensureDispatchGatePass(req.params.transportId);
    res.json({ transportId: req.params.transportId, attached: orderIds.length, gatePassFileId });
  } catch (err) {
    next(err);
  }
});

// Not every stage form in the reference UI has a mandatory catch-all remarks field (e.g.
// Transport Reached only requires Reason when Reached=No) — kept optional here so the
// backend doesn't force a field the real UX doesn't always show.
const remarksSchema = z.object({ remarks: z.string().optional().default("") });

/** Creates a blank STOCK_RELEASE placeholder row per attached item the instant Transport
 * Reached is submitted — same "row exists one stage earlier than the form that fills it in"
 * convention as SALE_ORDERS/SO_Confirmation/PDI (see CLAUDE.md). Every column that's already
 * known (part/segment/category, vehicle/driver, quantity/unit) is filled in immediately;
 * "Type" defaults to "OUT" (the doer's actual choice on the old CRR form was always this in
 * practice); From/Release Quantity/Description/Signature stay blank since the physical stock
 * release hasn't actually happened yet — those are what the Stock Release Form now fills in,
 * updating this same row in place rather than appending a second one. No-ops per item if a
 * row already exists (defensive — /reached is a one-time action per trip in normal use).
 */
async function createPlaceholderStockRelease(transportId: string, transport: SheetRow, employeeId: string) {
  const [productRows, existingRows] = await Promise.all([
    readTable(env.sheets.transactions, "Transport_Products"),
    readTable(env.sheets.transactions, "STOCK_RELEASE"),
  ]);
  const items = productRows.filter((p) => p.Transport_ID === transportId);
  const existingPdIds = new Set(existingRows.map((r) => r.Transport_Pd_ID));
  const pending = items.filter((p) => !existingPdIds.has(p.Transport_Pd_ID));
  if (pending.length === 0) return;

  const now = new Date().toISOString();
  const stockIds = await nextIds("STKPD", "STOCK_RELEASE", "Stock_Pd_ID", pending.length);
  await appendRows(
    env.sheets.transactions,
    "STOCK_RELEASE",
    pending.map((p, i) => ({
      Timestamp: now,
      Useremail: employeeId,
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
      Type: "OUT",
      From: "",
      "Release Quantity": "",
      Description: "",
      Status: "Stock Release Pending",
    }))
  );
}

/** Same placeholder-one-stage-earlier convention for TAX_INVOICE/Tax_Invoice_SO/
 * Tax_Invoice_Products — every denormalized field (seller, buyer/billing snapshot, sale
 * order no./date/attachment, vehicle, item lines) is filled in immediately; only the fields
 * the doer actually has to type on the Tax Invoice form (invoice no./date/attachment/
 * remarks, e-way bill fields) stay blank until that form updates this same row in place. */
async function createPlaceholderTaxInvoice(transportId: string, transport: SheetRow, employeeId: string) {
  const existing = (await readTable(env.sheets.transactions, "TAX_INVOICE")).find((r) => r.Transport_ID === transportId);
  if (existing) return;

  const attached = await getAttachedOrders(transportId);
  if (attached.length === 0) return;

  const now = new Date().toISOString();
  const invoiceId = await nextId("INVC", "TAX_INVOICE", "Invoice_ID");
  const seller = await getSellerFields();

  await appendRow(env.sheets.transactions, "TAX_INVOICE", {
    Timestamp: now,
    Useremail: employeeId,
    Transport_ID: transportId,
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
    "Tax Invoice No.": "",
    "Tax Invoice Date": "",
    "Tax Invoice Attachment": "",
    "Tax Invoice Remarks": "",
    "E-Way Bill Applicable": "",
    "E-Way Bill No.": "",
    "E-Way Bill Date": "",
    "E-Way Bill Attachment": "",
    Status: "Tax Invoice Pending",
  });

  const saleOrders = await readTable(env.sheets.transactions, "SALE_ORDERS");
  const soIds = await nextIds("INVCSO", "Tax_Invoice_SO", "Invoice_SO_ID", attached.length);
  const allProductRows = await readTable(env.sheets.transactions, "Transport_Products");
  // Transport_Products only carries Part/Segment/Category/Quantity/Unit — the item's own
  // Price/Discount/Basic Amount/Total Amount only live on ORDER_ITEMS, keyed by ITEM_ID.
  const itemById = new Map((await readTable(env.sheets.transactions, "ORDER_ITEMS")).map((r) => [r.ITEM_ID, itemFromSheet(r)]));

  for (const [i, a] of attached.entries()) {
    const invoiceSoId = soIds[i];
    const saleOrder = saleOrders.find((s) => s.ORDER_ID === a.orderId);
    await appendRow(env.sheets.transactions, "Tax_Invoice_SO", {
      Timestamp: now,
      Useremail: employeeId,
      ORDER_ID: a.orderId,
      Transport_ID: transportId,
      Transport_SO_ID: a.transportSoId,
      Invoice_ID: invoiceId,
      Invoice_SO_ID: invoiceSoId,
      "Sale Order No.": saleOrder?.["Sale Order No."] ?? "",
      "Sale Order Date": saleOrder?.["Sale Order Date"] ?? "",
      "Sale Order Attachment": saleOrder?.["Sale Order Attachment"] ?? "",
      "Order Type": a.order.ORDER_TYPE ?? "",
      "Payment Type": a.order.PAYMENT_TYPE ?? "",
      ...orderSnapshotToSheet(a.order),
      Status: "Tax Invoice Pending",
    });

    const productRows = allProductRows.filter((p) => p.Transport_ID === transportId && p.ORDER_ID === a.orderId);
    const pdIds = await nextIds("INVCPD", "Tax_Invoice_Products", "Invoice_Pd_ID", Math.max(productRows.length, 1));
    await appendRows(
      env.sheets.transactions,
      "Tax_Invoice_Products",
      productRows.map((p, j) => ({
        Timestamp: now,
        Useremail: employeeId,
        ORDER_ID: a.orderId,
        ITEM_ID: p.ITEM_ID,
        Transport_ID: transportId,
        Transport_SO_ID: a.transportSoId,
        Transport_Pd_ID: p.Transport_Pd_ID,
        Invoice_ID: invoiceId,
        Invoice_SO_ID: invoiceSoId,
        Invoice_Pd_ID: pdIds[j],
        ...(itemById.has(p.ITEM_ID) ? scaledItemFields(itemById.get(p.ITEM_ID)!, Number(p.Quantity) || 0) : {}),
        Segment: p.Segment ?? "",
        Category: p.Category ?? "",
        "Part Name": p["Part Name"] ?? "",
        "Part No.": p["Part No."] ?? "",
        Quantity: p.Quantity ?? "",
        Unit: p.Unit ?? "NOS",
        Status: "Tax Invoice Pending",
      }))
    );
  }
}

tripsRouter.post("/:transportId/reached", requireModule("transport-reached"), async (req, res, next) => {
  try {
    const schema = z.object({
      reached: z.string().min(1),
      sameVehicle: z.string().optional().default(""),
      expectedDateTime: z.string().optional().default(""),
      reason: z.string().optional().default(""),
      // Only present when Same Vehicle = No — the doer swapped vehicles for this trip.
      vehicleType: z.string().optional().default(""),
      vehicleNo: z.string().optional().default(""),
      vehicleSize: z.string().optional().default(""),
      driverName: z.string().optional().default(""),
      driverContactNo: z.string().optional().default(""),
    }).merge(remarksSchema);
    const body = schema.parse(req.body);
    const transport = await getTransportRow(req.params.transportId);
    if (!transport) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Trip not found" } });
    const attached = await getAttachedOrders(req.params.transportId);
    const now = new Date().toISOString();
    const reachIds = await nextIds("TPTRCH", "Transport_Reached", "Transport_Reach_ID", Math.max(attached.length, 1));

    // Same Vehicle = No means the doer picked a new vehicle on this form — use that instead
    // of the trip's original vehicle, both for this log row and for the trip going forward.
    const vehicleChanged = body.sameVehicle === "No";
    const vehicleType = vehicleChanged && body.vehicleType ? body.vehicleType : transport["Vehicle type"] ?? "";
    const vehicleNo = vehicleChanged && body.vehicleNo ? body.vehicleNo : transport["Vehicle No."] ?? "";
    const vehicleSize = vehicleChanged && body.vehicleSize ? body.vehicleSize : transport["Vehicle Size (Ft)"] ?? "";
    const driverName = vehicleChanged && body.driverName ? body.driverName : transport["Driver Name"] ?? "";
    const driverContactNo = vehicleChanged && body.driverContactNo ? body.driverContactNo : transport["Driver Contact No."] ?? "";

    // Update TRANSPORT's own vehicle fields *before* touching the Gate Pass, so a
    // regeneration (below) fills in the new vehicle/driver, not the stale one.
    await updateRow(env.sheets.transactions, "TRANSPORT", "Transport_ID", req.params.transportId, {
      Status: "REACHED",
      "Vehicle type": vehicleType,
      "Vehicle No.": vehicleNo,
      "Vehicle Size (Ft)": vehicleSize,
      "Driver Name": driverName,
      "Driver Contact No.": driverContactNo,
    });

    // The vehicle/driver that reaches isn't necessarily the one the trip was created with
    // (Same Vehicle = No) — the Gate Pass PDF was generated at attach-orders time with
    // whatever vehicle existed then, so it needs regenerating here with the new details.
    // Same vehicle: just fetch the existing one (no-op regenerate) so every Transport_Reached
    // row still carries the same gate pass link, consistent with Transport_SO's own copy.
    const gatePassFileId = await ensureDispatchGatePass(req.params.transportId, { force: vehicleChanged });

    for (const [i, a] of attached.entries()) {
      await appendRow(env.sheets.transactions, "Transport_Reached", {
        Timestamp: now,
        Useremail: req.user!.employeeId,
        ORDER_ID: a.orderId,
        Transport_ID: req.params.transportId,
        Transport_Reach_ID: reachIds[i],
        "Vehicle type": vehicleType,
        "Vehicle No.": vehicleNo,
        "Vehicle Size (Ft)": vehicleSize,
        "Driver Name": driverName,
        "Driver Contact No.": driverContactNo,
        "Transport Reached": body.reached,
        "Same Vehicle": body.sameVehicle,
        "Expected DateTime": body.expectedDateTime,
        Reason: body.reason,
        "Dispatch Gate Pass": gatePassFileId ?? "",
        Status: "REACHED",
      });
    }

    await cascadeStatus(attached.map((a) => a.orderId), "TRANSPORT REACHED", req.user!.employeeId);

    // Stock Release and Tax Invoice both pick up a trip the instant it's Reached (matches the
    // old CRR reference — both queues show it at once, neither gates the other) — auto-create
    // both placeholders now instead of waiting for a separate manual step, with every already-
    // known column filled in. The two forms further down this file just fill in the handful of
    // fields that genuinely aren't known yet, updating these same rows in place.
    const freshTransport = (await getTransportRow(req.params.transportId))!;
    await Promise.all([
      createPlaceholderStockRelease(req.params.transportId, freshTransport, req.user!.employeeId),
      createPlaceholderTaxInvoice(req.params.transportId, freshTransport, req.user!.employeeId),
    ]);

    res.json({ transportId: req.params.transportId, status: "TRANSPORT REACHED", gatePassFileId });
  } catch (err) {
    next(err);
  }
});

tripsRouter.post("/:transportId/stock-release", requireModule("stock-release"), async (req, res, next) => {
  try {
    const schema = z.object({
      releaseType: z.string().optional().default("OUT"),
      releaseFrom: z.string().optional().default(""),
      attachmentUrl: z.string().optional().default(""),
    }).merge(remarksSchema);
    const body = schema.parse(req.body);
    const transport = await getTransportRow(req.params.transportId);
    if (!transport) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Trip not found" } });

    const productRows = (await readTable(env.sheets.transactions, "Transport_Products")).filter((r) => r.Transport_ID === req.params.transportId);
    const existingRows = await readTable(env.sheets.transactions, "STOCK_RELEASE");
    const existingByPdId = new Map(existingRows.map((r) => [r.Transport_Pd_ID, r]));
    const now = new Date().toISOString();

    // Fills in the placeholder row createPlaceholderStockRelease() already created for every
    // item at Transport Reached time — updates it in place by its own Stock_Pd_ID, same
    // convention as PDI/Dispatch Items Approval's own submit handlers, rather than appending a
    // second row. Falls back to appending fresh for any item that somehow has no placeholder
    // yet (e.g. approved before this convention existed).
    const toCreate: typeof productRows = [];
    for (const p of productRows) {
      const existing = existingByPdId.get(p.Transport_Pd_ID);
      if (!existing) {
        toCreate.push(p);
        continue;
      }
      await updateRow(env.sheets.transactions, "STOCK_RELEASE", "Stock_Pd_ID", existing.Stock_Pd_ID, {
        "Vehicle type": transport["Vehicle type"] ?? "",
        "Vehicle No.": transport["Vehicle No."] ?? "",
        "Vehicle Size (Ft)": transport["Vehicle Size (Ft)"] ?? "",
        "Driver Name": transport["Driver Name"] ?? "",
        "Driver Contact No.": transport["Driver Contact No."] ?? "",
        Type: body.releaseType,
        From: body.releaseFrom,
        "Release Quantity": p.Quantity ?? "",
        Description: body.remarks,
        Attachment: body.attachmentUrl,
        Status: "RELEASED",
      });
    }
    if (toCreate.length > 0) {
      const stockIds = await nextIds("STKPD", "STOCK_RELEASE", "Stock_Pd_ID", toCreate.length);
      await appendRows(
        env.sheets.transactions,
        "STOCK_RELEASE",
        toCreate.map((p, i) => ({
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
          Attachment: body.attachmentUrl,
          Status: "RELEASED",
        }))
      );
    }

    const orderIds = [...new Set(productRows.map((p) => p.ORDER_ID))];
    // Stock Release and Tax Invoice run in parallel off the same REACHED status (the old
    // CRR reference shows both queues picking up a trip at once, not one gating the other) —
    // the trip's own Status only advances to TAX INVOICE COMPLETED (Dispatch's own
    // prevStatus) once BOTH branches are actually done (not just placeholder-created — see
    // isTaxInvoiceRowDone). Until then Status stays REACHED so this trip keeps showing in
    // whichever of the two queues hasn't done its part yet (see GET / and its
    // excludeIfInTab/includeIfInTab params, used by both stages' pending/Completed toggles).
    const taxInvoiceDone = (await getTransportIdsWithTaxInvoice()).has(req.params.transportId);
    if (taxInvoiceDone) {
      await updateRow(env.sheets.transactions, "TRANSPORT", "Transport_ID", req.params.transportId, { Status: "TAX INVOICE COMPLETED" });
    }
    await cascadeStatus(orderIds, "STOCK RELEASED", req.user!.employeeId);
    res.json({ transportId: req.params.transportId, status: taxInvoiceDone ? "TAX INVOICE COMPLETED" : "STOCK RELEASED" });
  } catch (err) {
    next(err);
  }
});

tripsRouter.post("/:transportId/tax-invoice", requireModule("tax-invoice"), async (req, res, next) => {
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
    const seller = await getSellerFields();

    // Fills in the placeholder TAX_INVOICE/Tax_Invoice_SO/Tax_Invoice_Products rows
    // createPlaceholderTaxInvoice() already created at Transport Reached time — updates them
    // in place by their own IDs rather than appending a second set. Falls back to creating
    // fresh if somehow no placeholder exists yet (e.g. a trip Reached before this convention
    // existed).
    const existingInvoice = (await readTable(env.sheets.transactions, "TAX_INVOICE")).find(
      (r) => r.Transport_ID === req.params.transportId
    );
    const invoiceId = existingInvoice?.Invoice_ID ?? (await nextId("INVC", "TAX_INVOICE", "Invoice_ID"));

    const invoiceFields = {
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
    };
    if (existingInvoice) {
      await updateRow(env.sheets.transactions, "TAX_INVOICE", "Invoice_ID", invoiceId, invoiceFields);
    } else {
      await appendRow(env.sheets.transactions, "TAX_INVOICE", {
        Timestamp: now,
        Useremail: req.user!.employeeId,
        Transport_ID: req.params.transportId,
        Invoice_ID: invoiceId,
        ...invoiceFields,
      });
    }

    const existingSoRows = await readTable(env.sheets.transactions, "Tax_Invoice_SO");
    const existingProductRows = await readTable(env.sheets.transactions, "Tax_Invoice_Products");
    const saleOrders = await readTable(env.sheets.transactions, "SALE_ORDERS");
    const allProductRows = await readTable(env.sheets.transactions, "Transport_Products");
    // Transport_Products only carries Part/Segment/Category/Quantity/Unit — the item's own
    // Price/Discount/Basic Amount/Total Amount only live on ORDER_ITEMS, keyed by ITEM_ID.
    const itemById = new Map((await readTable(env.sheets.transactions, "ORDER_ITEMS")).map((r) => [r.ITEM_ID, itemFromSheet(r)]));

    for (const a of attached) {
      const existingSo = existingSoRows.find((r) => r.Transport_ID === req.params.transportId && r.ORDER_ID === a.orderId);
      const invoiceSoId = existingSo?.Invoice_SO_ID ?? (await nextId("INVCSO", "Tax_Invoice_SO", "Invoice_SO_ID"));
      const saleOrder = saleOrders.find((s) => s.ORDER_ID === a.orderId);
      const soFields = {
        Invoice_ID: invoiceId,
        "Sale Order No.": saleOrder?.["Sale Order No."] ?? "",
        "Sale Order Date": saleOrder?.["Sale Order Date"] ?? "",
        "Sale Order Attachment": saleOrder?.["Sale Order Attachment"] ?? "",
        "Order Type": a.order.ORDER_TYPE ?? "",
        "Payment Type": a.order.PAYMENT_TYPE ?? "",
        ...orderSnapshotToSheet(a.order),
        Status: "COMPLETED",
      };
      if (existingSo) {
        await updateRow(env.sheets.transactions, "Tax_Invoice_SO", "Invoice_SO_ID", invoiceSoId, soFields);
      } else {
        await appendRow(env.sheets.transactions, "Tax_Invoice_SO", {
          Timestamp: now,
          Useremail: req.user!.employeeId,
          ORDER_ID: a.orderId,
          Transport_ID: req.params.transportId,
          Transport_SO_ID: a.transportSoId,
          Invoice_SO_ID: invoiceSoId,
          ...soFields,
        });
      }

      const productRows = allProductRows.filter((p) => p.Transport_ID === req.params.transportId && p.ORDER_ID === a.orderId);
      const toCreate: typeof productRows = [];
      for (const p of productRows) {
        const existingPd = existingProductRows.find((r) => r.Transport_Pd_ID === p.Transport_Pd_ID);
        if (!existingPd) {
          toCreate.push(p);
          continue;
        }
        await updateRow(env.sheets.transactions, "Tax_Invoice_Products", "Invoice_Pd_ID", existingPd.Invoice_Pd_ID, {
          ...(itemById.has(p.ITEM_ID) ? scaledItemFields(itemById.get(p.ITEM_ID)!, Number(p.Quantity) || 0) : {}),
          Invoice_ID: invoiceId,
          Invoice_SO_ID: invoiceSoId,
          Quantity: p.Quantity ?? "",
          Unit: p.Unit ?? "NOS",
          Status: "COMPLETED",
        });
      }
      if (toCreate.length > 0) {
        const pdIds = await nextIds("INVCPD", "Tax_Invoice_Products", "Invoice_Pd_ID", toCreate.length);
        await appendRows(
          env.sheets.transactions,
          "Tax_Invoice_Products",
          toCreate.map((p, j) => ({
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
            ...(itemById.has(p.ITEM_ID) ? scaledItemFields(itemById.get(p.ITEM_ID)!, Number(p.Quantity) || 0) : {}),
            Segment: p.Segment ?? "",
            Category: p.Category ?? "",
            "Part Name": p["Part Name"] ?? "",
            "Part No.": p["Part No."] ?? "",
            Quantity: p.Quantity ?? "",
            Unit: p.Unit ?? "NOS",
            Status: "COMPLETED",
          }))
        );
      }
    }

    // Mirrors stock-release's own check in the other direction — Status only advances once
    // BOTH branches are done.
    const stockReleaseDone = (await getTransportIdsWithStockRelease()).has(req.params.transportId);
    if (stockReleaseDone) {
      await updateRow(env.sheets.transactions, "TRANSPORT", "Transport_ID", req.params.transportId, { Status: "TAX INVOICE COMPLETED" });
    }
    await cascadeStatus(attached.map((a) => a.orderId), "TAX INVOICE COMPLETED", req.user!.employeeId);
    res.json({ transportId: req.params.transportId, invoiceId, status: stockReleaseDone ? "TAX INVOICE COMPLETED" : "REACHED" });
  } catch (err) {
    next(err);
  }
});

tripsRouter.post("/:transportId/pre-dispatch", requireModule("dispatch"), async (req, res, next) => {
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

tripsRouter.post("/:transportId/vehicle-dispatch", requireModule("dispatch"), async (req, res, next) => {
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

/** Blank LR placeholder — same "row exists one stage earlier" convention as Stock Release/
 * Tax Invoice. Only created for Registered transporters (see the dispatch handler below);
 * unregistered ones skip LR entirely. Every already-known column (buyer/billing snapshot,
 * vehicle, Pre Dispatch ID/Dispatch ID) is filled in immediately; the doer's own fields (LR
 * No./Date/Attachment/Charges/Payment Status/Other Charges/Remarks, Provide LR to the
 * Customer) stay blank until the LR Form updates this same row in place. */
async function createPlaceholderLR(
  transportId: string,
  transport: SheetRow,
  attached: { orderId: string; transportSoId: string; order: SheetRow }[],
  dispatch: SheetRow,
  employeeId: string
) {
  const existing = (await readTable(env.sheets.transactions, "LR")).find((r) => r["Dispatch ID"] === dispatch["Dispatch ID"]);
  if (existing) return;

  const lrId = await nextId("LR", "LR", "LR ID");
  await appendRow(env.sheets.transactions, "LR", {
    Timestamp: new Date().toISOString(),
    Useremail: employeeId,
    "Pre Dispatch ID": dispatch["Pre Dispatch ID"] ?? "",
    "Dispatch ID": dispatch["Dispatch ID"] ?? "",
    "LR ID": lrId,
    ...(attached[0] ? orderSnapshotToSheet(attached[0].order) : {}),
    ...vehicleSnapshotToSheet(transport),
    "LR No.": "",
    "LR Date": "",
    "LR Attachment": "",
    "LR Charges": "",
    "Payment Status": "",
    "Other Charges": "",
    "LR Remarks": "",
    "Provide LR to the Customer": "",
    Status: "Pending LR",
  });
}

/** Same placeholder convention for Delivery — created either by the dispatch handler
 * directly (unregistered transporter, LR skipped) or by the LR handler once LR is actually
 * completed (registered transporter). Doer-facing fields (Delivered/Reason/Expected Delivery
 * Date/Receiving Attachment/Any Charges/Amount/Freight Charges to Transporter/Charge
 * Description/Delivery Remarks) stay blank until the Delivery Form fills them in. */
async function createPlaceholderDelivery(
  transportId: string,
  transport: SheetRow,
  attached: { orderId: string; transportSoId: string; order: SheetRow }[],
  dispatch: SheetRow,
  employeeId: string
) {
  const existing = (await readTable(env.sheets.transactions, "DELIVERY")).find((r) => r["Dispatch ID"] === dispatch["Dispatch ID"]);
  if (existing) return;

  const deliveryId = await nextId("DLRY", "DELIVERY", "Delivery ID");
  await appendRow(env.sheets.transactions, "DELIVERY", {
    Timestamp: new Date().toISOString(),
    Useremail: employeeId,
    "Pre Dispatch ID": dispatch["Pre Dispatch ID"] ?? "",
    "Dispatch ID": dispatch["Dispatch ID"] ?? "",
    "Delivery ID": deliveryId,
    ...(attached[0] ? orderSnapshotToSheet(attached[0].order) : {}),
    ...vehicleSnapshotToSheet(transport),
    Delivered: "",
    Reason: "",
    "Expected Delivery Date": "",
    "Receiving Attachment": "",
    "Any Charges": "",
    Amount: "",
    "Freight Charges to Transporter": "",
    "Charge Description": "",
    "Delivery Remarks": "",
    Status: "Pending Delivery",
  });
}

tripsRouter.post("/:transportId/dispatch", requireModule("dispatch"), async (req, res, next) => {
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
    const preDispatchId = preDispatches.at(-1)?.["Pre Dispatch ID"] ?? "";
    const dispatchRow = {
      Timestamp: new Date().toISOString(),
      Useremail: req.user!.employeeId,
      Transport_ID: req.params.transportId,
      "Pre Dispatch ID": preDispatchId,
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
    };
    await appendRow(env.sheets.transactions, "Dispatch", dispatchRow);

    // Registered transporters need a formal LR (Lorry Receipt) before Delivery; anyone else
    // (local/unregistered vehicles) skips that step entirely and goes straight to Delivery —
    // matches how LR genuinely only applies to GST-registered transport agencies.
    const isRegisteredTransporter = (transport["Transporter Type"] || "").trim() === "Registered";
    if (isRegisteredTransporter) {
      await updateRow(env.sheets.transactions, "TRANSPORT", "Transport_ID", req.params.transportId, { Status: "DISPATCHED" });
      await createPlaceholderLR(req.params.transportId, transport, attached, { ...dispatchRow, "Dispatch ID": dispatchId, "Pre Dispatch ID": preDispatchId }, req.user!.employeeId);
    } else {
      await updateRow(env.sheets.transactions, "TRANSPORT", "Transport_ID", req.params.transportId, { Status: "LR COLLECTED" });
      await createPlaceholderDelivery(req.params.transportId, transport, attached, { ...dispatchRow, "Dispatch ID": dispatchId, "Pre Dispatch ID": preDispatchId }, req.user!.employeeId);
    }
    await cascadeStatus(attached.map((a) => a.orderId), isRegisteredTransporter ? "DISPATCHED" : "LR COLLECTED", req.user!.employeeId);
    res.json({ transportId: req.params.transportId, dispatchId, status: isRegisteredTransporter ? "DISPATCHED" : "LR COLLECTED" });
  } catch (err) {
    next(err);
  }
});

tripsRouter.post("/:transportId/lr", requireModule("collect-lr"), async (req, res, next) => {
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

    // Fills in the placeholder createPlaceholderLR() already created when Vehicle Dispatch
    // was saved (registered transporter) — updates it in place by its own LR ID rather than
    // appending a second row. Falls back to creating fresh if somehow no placeholder exists
    // yet (e.g. dispatched before this convention existed).
    const existingLr = (await readTable(env.sheets.transactions, "LR")).find((r) => r["Dispatch ID"] === dispatch["Dispatch ID"]);
    const lrId = existingLr?.["LR ID"] ?? (await nextId("LR", "LR", "LR ID"));
    const lrFields = {
      "LR No.": body.lrNo,
      "LR Date": body.lrDate,
      "LR Attachment": body.lrAttachmentUrl,
      "LR Charges": body.lrCharges !== undefined ? String(body.lrCharges) : "",
      "Payment Status": body.paymentStatus,
      "Other Charges": body.otherCharges !== undefined ? String(body.otherCharges) : "",
      "LR Remarks": body.remarks,
      Status: "LR Completed",
    };
    if (existingLr) {
      await updateRow(env.sheets.transactions, "LR", "LR ID", lrId, lrFields);
    } else {
      await appendRow(env.sheets.transactions, "LR", {
        Timestamp: new Date().toISOString(),
        Useremail: req.user!.employeeId,
        "Pre Dispatch ID": dispatch["Pre Dispatch ID"] ?? "",
        "Dispatch ID": dispatch["Dispatch ID"] ?? "",
        "LR ID": lrId,
        ...(attached[0] ? orderSnapshotToSheet(attached[0].order) : {}),
        ...vehicleSnapshotToSheet(transport),
        ...lrFields,
      });
    }

    await updateRow(env.sheets.transactions, "TRANSPORT", "Transport_ID", req.params.transportId, { Status: "LR COLLECTED" });
    await cascadeStatus(attached.map((a) => a.orderId), "LR COLLECTED", req.user!.employeeId);
    // LR is genuinely done now (not just placeholder-created) — Delivery becomes actionable,
    // so auto-create its own placeholder the same way the dispatch handler does for
    // unregistered transporters.
    await createPlaceholderDelivery(req.params.transportId, transport, attached, dispatch, req.user!.employeeId);
    res.json({ transportId: req.params.transportId, lrId, status: "LR COLLECTED" });
  } catch (err) {
    next(err);
  }
});

tripsRouter.post("/:transportId/delivery", requireModule("delivery"), async (req, res, next) => {
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

    // Fills in the placeholder createPlaceholderDelivery() already created (either at
    // dispatch time for an unregistered transporter, or once LR was actually completed for a
    // registered one) — updates it in place rather than appending a second row.
    const existingDelivery = (await readTable(env.sheets.transactions, "DELIVERY")).find((r) => r["Dispatch ID"] === dispatch["Dispatch ID"]);
    const deliveryId = existingDelivery?.["Delivery ID"] ?? (await nextId("DLRY", "DELIVERY", "Delivery ID"));
    // Only a real "Yes" actually completes delivery — "No" (still in transit / attempted and
    // failed) leaves the trip's own Status alone so the Delivery Form stays available to
    // retry, instead of prematurely marking the whole trip DELIVERED.
    const delivered = body.delivered === "Yes";
    const deliveryFields = {
      Delivered: body.delivered,
      Reason: body.reason,
      "Expected Delivery Date": body.expectedDeliveryDate,
      "Receiving Attachment": body.receivingAttachmentUrl,
      "Any Charges": body.anyCharges,
      Amount: body.amount !== undefined ? String(body.amount) : "",
      "Freight Charges to Transporter": body.freightChargesToTransporter !== undefined ? String(body.freightChargesToTransporter) : "",
      "Charge Description": body.chargeDescription,
      "Delivery Remarks": body.remarks,
      Status: delivered ? "Delivery Completed" : "Pending Delivery",
    };
    if (existingDelivery) {
      await updateRow(env.sheets.transactions, "DELIVERY", "Delivery ID", deliveryId, deliveryFields);
    } else {
      await appendRow(env.sheets.transactions, "DELIVERY", {
        Timestamp: new Date().toISOString(),
        Useremail: req.user!.employeeId,
        "Pre Dispatch ID": dispatch["Pre Dispatch ID"] ?? "",
        "Dispatch ID": dispatch["Dispatch ID"] ?? "",
        "Delivery ID": deliveryId,
        ...(attached[0] ? orderSnapshotToSheet(attached[0].order) : {}),
        ...vehicleSnapshotToSheet(transport),
        ...deliveryFields,
      });
    }

    if (delivered) {
      await updateRow(env.sheets.transactions, "TRANSPORT", "Transport_ID", req.params.transportId, { Status: "DELIVERED" });
      await cascadeStatus(attached.map((a) => a.orderId), "DELIVERED", req.user!.employeeId);
    }
    res.json({ transportId: req.params.transportId, deliveryId, status: delivered ? "DELIVERED" : "LR COLLECTED" });
  } catch (err) {
    next(err);
  }
});
