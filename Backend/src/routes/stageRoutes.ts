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
async function revertOrphanedPdi(pdiStage: StageConfig) {
  const [punchRows, pdiRows, itemRows] = await Promise.all([
    readTable(env.sheets.transactions, ORDER_TAB),
    readTable(env.sheets.transactions, pdiStage.tab),
    readTable(env.sheets.transactions, "ORDER_ITEMS"),
  ]);
  const ordersAtPdiComplete = punchRows.map(punchFromSheet).filter((o) => o.STATUS === pdiStage.nextStatus);
  if (ordersAtPdiComplete.length === 0) return;

  const pdiItemIdsByOrderId = new Map<string, Set<string>>();
  for (const r of pdiRows) {
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

      if (status === "COMPLETED") {
        const rows = (await readTable(env.sheets.transactions, pdiStage.tab)).map((r) => ({
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

      const [punchRows, itemRows, dispatchApprovalRows, pdiRows] = await Promise.all([
        readTable(env.sheets.transactions, ORDER_TAB),
        readTable(env.sheets.transactions, "ORDER_ITEMS"),
        readTable(env.sheets.transactions, "Dispatch Items Approval"),
        readTable(env.sheets.transactions, pdiStage.tab),
      ]);
      const orders = punchRows.map(punchFromSheet).filter((o) => o.STATUS === pdiStage.prevStatus);
      const orderById = new Map(orders.map((o) => [o.ORDER_ID, o]));
      // The item's own "became eligible for PDI" moment is when its Dispatch Approval
      // decision was made — same source the Dispatch Approval item-level detail page already
      // reads. Last-occurrence-wins for an item with more than one decision logged.
      const latestDispatchApprovalByItemId = new Map<string, string>();
      for (const row of dispatchApprovalRows.map(dispatchApprovalFromSheet)) {
        if (row.ITEM_ID) latestDispatchApprovalByItemId.set(row.ITEM_ID, row.CREATED_AT || "");
      }
      // PDI is per-item — an order can still sit at prevStatus with some of its items
      // already individually PDI'd (order only flips to nextStatus once every item has a
      // row), so those already-done items must not show as pending too.
      const pdiDoneItemIds = new Set(pdiRows.map((r) => r.ITEM_ID));
      const rows = itemRows
        .filter((i) => orderById.has(i.ORDER_ID) && !pdiDoneItemIds.has(i.ITEM_ID))
        .map(itemFromSheet)
        .map((item) => {
          const order = orderById.get(item.ORDER_ID)!;
          return {
            CREATED_AT: latestDispatchApprovalByItemId.get(item.ITEM_ID) || "",
            ORDER_ID: order.ORDER_ID,
            ITEM_ID: item.ITEM_ID,
            PART_NAME: item.PART_NAME || "",
            CUSTOMER_NAME: order.CUSTOMER_NAME || "",
            BUYER_GSTIN: order.BUYER_GSTIN || "",
            QTY: item.QTY || "",
            UOM: item.UOM || "",
            PDI_DATE: "",
            PDI_ATTACHMENT_URL: "",
            PDI_REMARKS: "",
          };
        });
      res.json(rows);
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
  const headers = [
    "Timestamp", "Useremail", "ORDER_ID", "ITEM_ID", pdiStage.idColumn,
    "CUST ID", "Customer Name", "Business Segment", "Type of Customer", "Sale Type", "Buyer GSTIN No.",
    "Segment", "Category", "Part Name", "Part No.", "Quantity", "Unit",
    "Special Instructions", "Packing Requirements", "Additional Notes",
    ...pdiStage.fields.map((f) => f.header),
    "Status",
  ];

  router.post("/:orderId/items/:itemId/pdi", async (req, res, next) => {
    try {
      const body = schema.parse(req.body);
      const now = new Date().toISOString();

      await ensureSheetTab(env.sheets.transactions, pdiStage.tab, headers);

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

      const [stageId] = await nextIds(pdiStage.idPrefix, pdiStage.tab, pdiStage.idColumn, 1);
      await appendRow(env.sheets.transactions, pdiStage.tab, {
        Timestamp: now,
        Useremail: req.user!.employeeId,
        ORDER_ID: req.params.orderId,
        ITEM_ID: item.ITEM_ID,
        [pdiStage.idColumn]: stageId,
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
        Status: pdiStage.nextStatus,
      });

      const doneItemIds = new Set([req.params.itemId, ...existingPdiRows.filter((r) => r.ORDER_ID === req.params.orderId).map((r) => r.ITEM_ID)]);
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
