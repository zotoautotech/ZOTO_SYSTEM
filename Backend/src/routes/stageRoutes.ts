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
 * sitting at STATUS "PRE TRANSPORT COMPLETED" (PDI's own nextStatus) with no matching PDI
 * row — this detects that and reverts STATUS back to "DISPATCH APPROVAL COMPLETED" (PDI's
 * prevStatus) so the order reappears in the PDI pending queue instead of just vanishing from
 * every queue. Only reverts orders still sitting exactly at that status (not orders that
 * have since progressed further into Transport) — same "only while still at this stage"
 * scoping as the discount revert. Runs from a GET, same as the discount revert: there's no
 * other trigger available since the only way the app learns about a hand-edit made directly
 * in Sheets is by reading it. */
async function revertOrphanedPdi(pdiStage: StageConfig) {
  const [punchRows, pdiRows] = await Promise.all([
    readTable(env.sheets.transactions, ORDER_TAB),
    readTable(env.sheets.transactions, pdiStage.tab),
  ]);
  const ordersAtPdiComplete = punchRows.map(punchFromSheet).filter((o) => o.STATUS === pdiStage.nextStatus);
  if (ordersAtPdiComplete.length === 0) return;
  const orderIdsWithPdiRow = new Set(pdiRows.map((r) => r.ORDER_ID));
  for (const order of ordersAtPdiComplete) {
    if (orderIdsWithPdiRow.has(order.ORDER_ID)) continue;
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

      const [punchRows, itemRows, dispatchApprovalRows] = await Promise.all([
        readTable(env.sheets.transactions, ORDER_TAB),
        readTable(env.sheets.transactions, "ORDER_ITEMS"),
        readTable(env.sheets.transactions, "Dispatch Items Approval"),
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
      const rows = itemRows
        .filter((i) => orderById.has(i.ORDER_ID))
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

export function registerStageRoutes(router: Router) {
  registerPdiItemsRoute(router);
  for (const stage of STAGES) {
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
