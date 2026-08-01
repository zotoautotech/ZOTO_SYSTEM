import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { appendRow, ensureSheetTab, readTable, updateRow, type SheetRow } from "../services/sheets.js";
import { nextId, nextIds } from "../services/ids.js";
import { punchFromSheet, punchToSheet } from "./orderPunchMap.js";
import { itemFromSheet } from "./itemMap.js";
import { orderSnapshotToSheet } from "./tripMap.js";
import { dispatchApprovalFromSheet } from "./soConfirmationMap.js";
import { STAGES, type StageConfig } from "./stageConfig.js";

const ORDER_TAB = "ORDER_PUNCH";

// This tab's own display labels — separate from ORDER_PUNCH.STATUS (never written here) and
// from the internal STAGES nextStatus/prevStatus system-status strings, which used to be
// written verbatim into this column (the same "raw status" complaint already fixed once for
// Dispatch Items Approval's own Status column — kept in sync with it deliberately).
const PDI_STATUS_PENDING = "PDI Pending";
const PDI_STATUS_COMPLETED = "PDI Completed";

const PDI_TAB_HEADERS = [
  "Timestamp", "Useremail", "ORDER_ID", "ITEM_ID", "Disp Conf Item ID", "PDI ID",
  "CUST ID", "Customer Name", "Business Segment", "Type of Customer", "Sale Type", "Buyer GSTIN No.",
  "Segment", "Category", "Part Name", "Part No.", "Quantity", "Unit",
  "Special Instructions", "Packing Requirements", "Additional Notes",
  "PDI No.", "PDI Date", "PDI Attachment", "Box Quantity", "PDI Remarks",
  "Status",
];

/**
 * Creates a blank PDI placeholder row for this item the moment its Dispatch Approval
 * decision is "Dispatch Today" — same "placeholder created one stage earlier" convention
 * already used for SALE_ORDERS/SO_Confirmation/Dispatch Items Approval (see CLAUDE.md), so
 * the item shows up in the PDI queue immediately (blank PDI fields, Status "PDI Pending")
 * instead of only once every sibling item on the order is also approved. No-ops if a row for
 * this item already exists (a doer can resubmit a dispatch approval decision more than once).
 * `item` accepts either an ORDER_ITEMS or SALE_ORDER_ITEMS-shaped row — only the fields
 * common to both (SEGMENT/CATEGORY/PART_NAME/PART_NO/QTY/UOM/…) are read. `dispConfItemId` is
 * the item's own "Disp Conf Item ID" from the Dispatch Items Approval row that triggered this
 * placeholder — carries the same star-schema linking convention as Conf_ID/Conf Item ID
 * elsewhere (live PDI tab has its own "Disp Conf Item ID" column right after ITEM_ID, dumped
 * directly off the live sheet rather than assumed, matching this project's usual discipline).
 */
export async function createPlaceholderPdi(order: SheetRow, item: SheetRow, employeeId: string, dispConfItemId: string) {
  await ensureSheetTab(env.sheets.transactions, "PDI", PDI_TAB_HEADERS);
  const existing = (await readTable(env.sheets.transactions, "PDI")).find(
    (r) => r.ORDER_ID === order.ORDER_ID && r.ITEM_ID === item.ITEM_ID
  );
  if (existing) return;

  const [pdiId] = await nextIds("PDI", "PDI", "PDI ID", 1);
  await appendRow(env.sheets.transactions, "PDI", {
    Timestamp: new Date().toISOString(),
    Useremail: employeeId,
    ORDER_ID: order.ORDER_ID,
    ITEM_ID: item.ITEM_ID,
    "Disp Conf Item ID": dispConfItemId,
    "PDI ID": pdiId,
    ...orderSnapshotToSheet(order),
    Segment: item.SEGMENT ?? "",
    Category: item.CATEGORY ?? "",
    "Part Name": item.PART_NAME ?? "",
    "Part No.": item.PART_NO ?? "",
    Quantity: item.QTY ?? "",
    Unit: item.UOM ?? "",
    "Special Instructions": item.SPECIAL_INSTRUCTIONS ?? "",
    "Packing Requirements": item.PACKING_REQUIREMENTS ?? "",
    "Additional Notes": item.NOTES ?? "",
    Status: PDI_STATUS_PENDING,
  });
}

const valueSchema = z.union([z.string(), z.number()]);

function buildBodySchema(stage: StageConfig) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of stage.fields) {
    shape[field.key] = field.required ? valueSchema : valueSchema.optional();
  }
  return z.object(shape).superRefine((body, ctx) => {
    for (const field of stage.fields) {
      if (!field.required) continue;
      const value = (body as Record<string, string | number | undefined>)[field.key];
      if (value === undefined || String(value).trim() === "") {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field.key], message: `${field.key} is required` });
      }
    }
  });
}

/** Registers GET /orders/:stageKey (pending/completed queue) and POST /orders/:id/:stageKey
 * (save) for PDI — the one simple single-order stage between Dispatch Approval and the trip
 * system (see stageConfig.ts, tripRoutes.ts). Per-item: one row is appended per order item,
 * with the shared buyer/order snapshot fields auto-filled via orderSnapshotToSheet (same
 * helper the trip routes use), same append-only-log + STATUS-chain pattern already used for
 * SO Confirmation/Dispatch Approval. */
/** Item-level rows for the PDI queue's table (Timestamp, Part Name, Customer Name, Buyer
 * GSTIN No., Quantity, Unit, PDI Date, PDI Attachment, PDI Remarks — matching the old CRR
 * reference view), used for both the pending and Completed toggle states. Pending reads
 * ORDER_PUNCH+ORDER_ITEMS directly (no PDI tab row exists yet, so the PDI-specific columns
 * are blank); Completed reads the PDI tab's own rows, which already carry every column
 * needed (see the Quantity/Unit columns added above) with no extra joins required. */
/** Mirrors the discount revert-on-delete convention (orders.ts's revertOrphanedDiscounts):
 * if a doer deletes an order's row(s) directly from the live PDI tab, the order is left
 * sitting at STATUS "PRE TRANSPORT COMPLETED" (PDI's own nextStatus) with a gap — this
 * detects that and reverts STATUS back to "DISPATCH APPROVAL COMPLETED" (PDI's prevStatus)
 * so the order reappears in the PDI pending queue instead of just vanishing from every queue.
 * PDI is per-item (see registerPdiSubmitRoute below — doing PDI for one item never advances
 * the order on its own; STATUS only flips once EVERY item has its own PDI row), so — same as
 * revertOrphanedDispatchApproval in orders.ts — **any** item missing its row is enough to
 * revert the whole order, not just "zero rows left." Only reverts orders still sitting
 * exactly at that status (not orders that have since progressed further into Transport).
 * Runs from a GET, same as the discount revert: there's no other trigger available since the
 * only way the app learns about a hand-edit made directly in Sheets is by reading it. */
/** Two-directional reconciliation, since PDI's per-item STATUS flip (registerPdiSubmitRoute)
 * isn't guaranteed atomic with the appendRow that logs each item — a transient failure on
 * that final updateRow (real case hit once: both items had their own PDI row, but the order's
 * own STATUS never advanced past DISPATCH APPROVAL COMPLETED, silently keeping it out of the
 * Transport queue with no error visible to the doer) leaves the order stuck at prevStatus even
 * though every item is actually done. So alongside the revert-if-orphaned direction (an order
 * ahead of its actual PDI rows, e.g. a doer deleted a row straight from the sheet), this also
 * advances the opposite gap: an order sitting at prevStatus whose items are now ALL done. */
async function revertOrphanedPdi(pdiStage: StageConfig) {
  const [punchRows, pdiRows, itemRows] = await Promise.all([
    readTable(env.sheets.transactions, ORDER_TAB),
    readTable(env.sheets.transactions, pdiStage.tab),
    readTable(env.sheets.transactions, "ORDER_ITEMS"),
  ]);
  const orders = punchRows.map(punchFromSheet);
  const ordersAtPdiComplete = orders.filter((o) => o.STATUS === pdiStage.nextStatus);
  const ordersAtPdiPending = orders.filter((o) => o.STATUS === pdiStage.prevStatus);
  if (ordersAtPdiComplete.length === 0 && ordersAtPdiPending.length === 0) return;

  // Placeholder rows now exist as soon as an item's Dispatch Approval decision is made (see
  // createPlaceholderPdi above), well before the item's own PDI form is submitted — only a
  // row whose own Status is "PDI Completed" (not the blank "PDI Pending" placeholder) counts
  // as actually done here, same "row existence isn't enough" pattern already used for
  // SALE_ORDERS/SO_Confirmation's own placeholder-vs-filled-in checks.
  const pdiItemIdsByOrderId = new Map<string, Set<string>>();
  for (const r of pdiRows) {
    if (r.Status !== PDI_STATUS_COMPLETED) continue;
    if (!pdiItemIdsByOrderId.has(r.ORDER_ID)) pdiItemIdsByOrderId.set(r.ORDER_ID, new Set());
    pdiItemIdsByOrderId.get(r.ORDER_ID)!.add(r.ITEM_ID);
  }
  const itemIdsByOrderId = new Map<string, string[]>();
  for (const r of itemRows) {
    if (!itemIdsByOrderId.has(r.ORDER_ID)) itemIdsByOrderId.set(r.ORDER_ID, []);
    itemIdsByOrderId.get(r.ORDER_ID)!.push(r.ITEM_ID);
  }

  for (const order of ordersAtPdiComplete) {
    const orderItemIds = itemIdsByOrderId.get(order.ORDER_ID) ?? [];
    const pdiItemIds = pdiItemIdsByOrderId.get(order.ORDER_ID) ?? new Set();
    if (orderItemIds.every((id) => pdiItemIds.has(id))) continue;

    await updateRow(
      env.sheets.transactions,
      ORDER_TAB,
      "ORDER_ID",
      order.ORDER_ID,
      punchToSheet({ STATUS: pdiStage.prevStatus })
    );
  }

  for (const order of ordersAtPdiPending) {
    const orderItemIds = itemIdsByOrderId.get(order.ORDER_ID) ?? [];
    if (orderItemIds.length === 0) continue;
    const pdiItemIds = pdiItemIdsByOrderId.get(order.ORDER_ID) ?? new Set();
    if (!orderItemIds.every((id) => pdiItemIds.has(id))) continue;

    await updateRow(
      env.sheets.transactions,
      ORDER_TAB,
      "ORDER_ID",
      order.ORDER_ID,
      punchToSheet({ STATUS: pdiStage.nextStatus })
    );
  }
}

function registerPdiItemsRoute(router: Router) {
  const pdiStage = STAGES.find((s) => s.key === "pdi");
  if (!pdiStage) return;

  router.get("/pdi/items", async (req, res, next) => {
    try {
      const { status } = req.query as { status?: string };

      if (status !== "COMPLETED") {
        await revertOrphanedPdi(pdiStage);
      }

      const pdiRows = await readTable(env.sheets.transactions, pdiStage.tab);

      if (status === "COMPLETED") {
        const rows = pdiRows
          .filter((r) => r.Status === PDI_STATUS_COMPLETED)
          .map((r) => ({
            CREATED_AT: r["Timestamp"] || "",
            ORDER_ID: r["ORDER_ID"] || "",
            ITEM_ID: r["ITEM_ID"] || "",
            PART_NAME: r["Part Name"] || "",
            CUSTOMER_NAME: r["Customer Name"] || "",
            BUYER_GSTIN: r["Buyer GSTIN No."] || "",
            QTY: r["Quantity"] || "",
            UOM: r["Unit"] || "",
            PDI_DATE: r["PDI Date"] || "",
            PDI_ATTACHMENT_URL: r["PDI Attachment"] || "",
            PDI_REMARKS: r["PDI Remarks"] || "",
          }));
        res.json(rows);
        return;
      }

      // Placeholder rows (createPlaceholderPdi, called from orders.ts as soon as an item's
      // Dispatch Approval decision is "Dispatch Today") are the normal source of pending items
      // going forward — the item shows up here immediately, without waiting for every sibling
      // item on the order to also be approved.
      const placeholderRows = pdiRows.filter((r) => r.Status === PDI_STATUS_PENDING);
      const placeholderMapped = placeholderRows.map((r) => ({
        CREATED_AT: r["Timestamp"] || "",
        ORDER_ID: r["ORDER_ID"] || "",
        ITEM_ID: r["ITEM_ID"] || "",
        PART_NAME: r["Part Name"] || "",
        CUSTOMER_NAME: r["Customer Name"] || "",
        BUYER_GSTIN: r["Buyer GSTIN No."] || "",
        QTY: r["Quantity"] || "",
        UOM: r["Unit"] || "",
        PDI_DATE: "",
        PDI_ATTACHMENT_URL: "",
        PDI_REMARKS: "",
      }));

      // Legacy safety net: an item approved before this placeholder convention existed (or if
      // placeholder creation itself ever silently failed) has no PDI row at all yet — still
      // surface it as pending via the old ORDER_ITEMS + Dispatch Items Approval join this
      // route used before placeholders existed, same "don't lose data to a mid-flight
      // convention change" pattern used elsewhere in this app.
      const pdiRowExistsForItemId = new Set(pdiRows.map((r) => r.ITEM_ID));
      const [itemRows, dispatchApprovalRows, punchRows] = await Promise.all([
        readTable(env.sheets.transactions, "ORDER_ITEMS"),
        readTable(env.sheets.transactions, "Dispatch Items Approval"),
        readTable(env.sheets.transactions, ORDER_TAB),
      ]);
      const orderById = new Map(punchRows.map(punchFromSheet).map((o) => [o.ORDER_ID, o]));
      const latestDispatchApprovalByItemId = new Map<string, { createdAt: string; outcome: string }>();
      for (const row of dispatchApprovalRows.map(dispatchApprovalFromSheet)) {
        if (row.ITEM_ID) latestDispatchApprovalByItemId.set(row.ITEM_ID, { createdAt: row.CREATED_AT || "", outcome: row.DISPATCH_APPROVAL || "" });
      }
      const legacyRows = itemRows
        .filter((i) => !pdiRowExistsForItemId.has(i.ITEM_ID))
        .map(itemFromSheet)
        .filter((item) => latestDispatchApprovalByItemId.get(item.ITEM_ID)?.outcome === "Dispatch Today")
        .flatMap((item) => {
          const order = orderById.get(item.ORDER_ID);
          if (!order) return [];
          return [{
            CREATED_AT: latestDispatchApprovalByItemId.get(item.ITEM_ID)?.createdAt || "",
            ORDER_ID: item.ORDER_ID,
            ITEM_ID: item.ITEM_ID,
            PART_NAME: item.PART_NAME || "",
            CUSTOMER_NAME: order.CUSTOMER_NAME || "",
            BUYER_GSTIN: order.BUYER_GSTIN || "",
            QTY: item.QTY || "",
            UOM: item.UOM || "",
            PDI_DATE: "",
            PDI_ATTACHMENT_URL: "",
            PDI_REMARKS: "",
          }];
        });

      res.json([...placeholderMapped, ...legacyRows]);
    } catch (err) {
      next(err);
    }
  });
}

/** PDI's actual form submission, per item (not per order — see the STAGES comment in
 * stageConfig.ts and the same shift already made for /orders/:orderId/items/:itemId/
 * dispatch-approval in orders.ts). Appends a single PDI row for this item, then checks
 * whether every item on the order now has its own row; only once ALL of them do does the
 * order's own STATUS advance to "PRE TRANSPORT COMPLETED" (feeding Transport eligibility) —
 * doing PDI for one item never cascades the whole order forward. */
function registerPdiSubmitRoute(router: Router) {
  const pdiStage = STAGES.find((s) => s.key === "pdi");
  if (!pdiStage) return;
  const schema = buildBodySchema(pdiStage);

  router.post("/:orderId/items/:itemId/pdi", async (req, res, next) => {
    try {
      const body = schema.parse(req.body);
      const now = new Date().toISOString();

      await ensureSheetTab(env.sheets.transactions, pdiStage.tab, PDI_TAB_HEADERS);

      const fieldValues: SheetRow = {};
      for (const field of pdiStage.fields) {
        const value = (body as Record<string, string | number | undefined>)[field.key];
        fieldValues[field.header] = value === undefined ? "" : String(value);
      }

      const [punchRows, items, existingPdiRows] = await Promise.all([
        readTable(env.sheets.transactions, ORDER_TAB),
        readTable(env.sheets.transactions, "ORDER_ITEMS"),
        readTable(env.sheets.transactions, pdiStage.tab),
      ]);
      const punch = punchRows.find((row) => row.ORDER_ID === req.params.orderId);
      if (!punch) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Order not found" } });
      const order = punchFromSheet(punch);
      const orderItems = items.filter((i) => i.ORDER_ID === req.params.orderId).map(itemFromSheet);
      const item = orderItems.find((i) => i.ITEM_ID === req.params.itemId);
      if (!item) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Item not found on this order" } });

      const fields: SheetRow = {
        Timestamp: now,
        Useremail: req.user!.employeeId,
        ...orderSnapshotToSheet(order),
        Segment: item.SEGMENT ?? "",
        Category: item.CATEGORY ?? "",
        "Part Name": item.PART_NAME ?? "",
        "Part No.": item.PART_NO ?? "",
        Quantity: item.QTY ?? "",
        Unit: item.UOM ?? "",
        "Special Instructions": item.SPECIAL_INSTRUCTIONS ?? "",
        "Packing Requirements": item.PACKING_REQUIREMENTS ?? "",
        "Additional Notes": item.NOTES ?? "",
        ...fieldValues,
        Status: PDI_STATUS_COMPLETED,
      };

      // Fills in the placeholder row createPlaceholderPdi() already created for this item at
      // Dispatch Approval time — updates it in place by its own PDI ID, same update-in-place
      // convention as Dispatch Items Approval's own submit handler in orders.ts, rather than
      // appending a second row. Falls back to appending fresh if somehow no placeholder exists
      // yet (e.g. an item approved before this convention existed).
      const existingRow = existingPdiRows.find((r) => r.ORDER_ID === req.params.orderId && r.ITEM_ID === req.params.itemId);
      if (existingRow) {
        await updateRow(env.sheets.transactions, pdiStage.tab, pdiStage.idColumn, existingRow[pdiStage.idColumn], fields);
      } else {
        const [stageId] = await nextIds(pdiStage.idPrefix, pdiStage.tab, pdiStage.idColumn, 1);
        await appendRow(env.sheets.transactions, pdiStage.tab, {
          ORDER_ID: req.params.orderId,
          ITEM_ID: item.ITEM_ID,
          [pdiStage.idColumn]: stageId,
          ...fields,
        });
      }

      const doneItemIds = new Set([
        req.params.itemId,
        ...existingPdiRows.filter((r) => r.ORDER_ID === req.params.orderId && r.Status === PDI_STATUS_COMPLETED).map((r) => r.ITEM_ID),
      ]);
      const allItemsDone = orderItems.every((i) => doneItemIds.has(i.ITEM_ID));
      if (allItemsDone) {
        await updateRow(
          env.sheets.transactions,
          ORDER_TAB,
          "ORDER_ID",
          req.params.orderId,
          punchToSheet({ STATUS: pdiStage.nextStatus, CREATED_BY: req.user!.employeeId })
        );
      }

      res.json({ orderId: req.params.orderId, itemId: req.params.itemId, orderCompleted: allItemsDone });
    } catch (err) {
      next(err);
    }
  });
}

export function registerStageRoutes(router: Router) {
  registerPdiItemsRoute(router);
  registerPdiSubmitRoute(router);
  for (const stage of STAGES) {
    if (stage.key === "pdi") continue; // fully handled by the dedicated per-item routes above
    const schema = buildBodySchema(stage);
    const headers = [
      "Timestamp", "Useremail", "ORDER_ID",
      ...(stage.perItem ? ["ITEM_ID"] : []),
      stage.idColumn,
      "CUST ID", "Customer Name", "Business Segment", "Type of Customer", "Sale Type", "Buyer GSTIN No.",
      "Segment", "Category", "Part Name", "Part No.", "Quantity", "Unit",
      "Special Instructions", "Packing Requirements", "Additional Notes",
      ...stage.fields.map((f) => f.header),
      "Status",
    ];

    router.get(`/${stage.key}`, async (req, res, next) => {
      try {
        const { status } = req.query as { status?: string };
        const rows = (await readTable(env.sheets.transactions, ORDER_TAB))
          .map(punchFromSheet)
          .filter((row) => (status === "COMPLETED" ? row.STATUS === stage.nextStatus : row.STATUS === stage.prevStatus));
        res.json(rows);
      } catch (err) {
        next(err);
      }
    });

    router.post(`/:id/${stage.key}`, async (req, res, next) => {
      try {
        const body = schema.parse(req.body);
        const now = new Date().toISOString();

        await ensureSheetTab(env.sheets.transactions, stage.tab, headers);

        const fieldValues: SheetRow = {};
        for (const field of stage.fields) {
          const value = (body as Record<string, string | number | undefined>)[field.key];
          fieldValues[field.header] = value === undefined ? "" : String(value);
        }

        if (stage.perItem) {
          const [punchRows, items] = await Promise.all([
            readTable(env.sheets.transactions, ORDER_TAB),
            readTable(env.sheets.transactions, "ORDER_ITEMS"),
          ]);
          const punch = punchRows.find((row) => row.ORDER_ID === req.params.id);
          if (!punch) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Order not found" } });
          const order = punchFromSheet(punch);
          const orderItems = items.filter((i) => i.ORDER_ID === req.params.id).map(itemFromSheet);
          const stageIds = await nextIds(stage.idPrefix, stage.tab, stage.idColumn, Math.max(orderItems.length, 1));

          for (const [i, item] of orderItems.entries()) {
            await appendRow(env.sheets.transactions, stage.tab, {
              Timestamp: now,
              Useremail: req.user!.employeeId,
              ORDER_ID: req.params.id,
              ITEM_ID: item.ITEM_ID,
              [stage.idColumn]: stageIds[i],
              ...orderSnapshotToSheet(order),
              Segment: item.SEGMENT ?? "",
              Category: item.CATEGORY ?? "",
              "Part Name": item.PART_NAME ?? "",
              "Part No.": item.PART_NO ?? "",
              Quantity: item.QTY ?? "",
              Unit: item.UOM ?? "",
              "Special Instructions": item.SPECIAL_INSTRUCTIONS ?? "",
              "Packing Requirements": item.PACKING_REQUIREMENTS ?? "",
              "Additional Notes": item.NOTES ?? "",
              ...fieldValues,
              Status: stage.nextStatus,
            });
          }
        } else {
          const stageId = await nextId(stage.idPrefix, stage.tab, stage.idColumn);
          await appendRow(env.sheets.transactions, stage.tab, {
            Timestamp: now,
            Useremail: req.user!.employeeId,
            ORDER_ID: req.params.id,
            [stage.idColumn]: stageId,
            ...fieldValues,
            Status: stage.nextStatus,
          });
        }

        await updateRow(
          env.sheets.transactions,
          ORDER_TAB,
          "ORDER_ID",
          req.params.id,
          punchToSheet({ STATUS: stage.nextStatus, CREATED_BY: req.user!.employeeId })
        );

        res.json({ orderId: req.params.id, status: stage.nextStatus });
      } catch (err) {
        next(err);
      }
    });
  }
}
