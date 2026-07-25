import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { appendRow, ensureSheetTab, readTable, updateRow, type SheetRow } from "../services/sheets.js";
import { nextId, nextIds } from "../services/ids.js";
import { punchFromSheet, punchToSheet } from "./orderPunchMap.js";
import { itemFromSheet } from "./itemMap.js";
import { orderSnapshotToSheet } from "./tripMap.js";
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
 * (save) for PDI and Pre Transport — the two simple single-order stages between Dispatch
 * Approval and the trip system (see stageConfig.ts, tripRoutes.ts). Both are per-item: one
 * row is appended per order item, with the shared buyer/order snapshot fields auto-filled
 * via orderSnapshotToSheet (same helper the trip routes use), same append-only-log +
 * STATUS-chain pattern already used for SO Confirmation/Dispatch Approval. */
export function registerStageRoutes(router: Router) {
  for (const stage of STAGES) {
    const schema = buildBodySchema(stage);
    const headers = [
      "Timestamp", "Useremail", "ORDER_ID",
      ...(stage.perItem ? ["ITEM_ID"] : []),
      stage.idColumn,
      "CUST ID", "Customer Name", "Business Segment", "Type of Customer", "Sale Type", "Buyer GSTIN No.",
      "Segment", "Category", "Part Name", "Part No.", "Special Instructions", "Packing Requirements", "Additional Notes",
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
