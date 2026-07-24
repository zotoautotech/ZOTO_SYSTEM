import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { appendRow, ensureSheetTab, readTable, updateRow, type SheetRow } from "../services/sheets.js";
import { nextId } from "../services/ids.js";
import { punchFromSheet, punchToSheet } from "./orderPunchMap.js";
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
 * (save) for every stage in STAGES. Each save appends one row to the stage's own tab
 * (created on first use, additive only) and advances ORDER_PUNCH.STATUS so the next stage's
 * queue picks the order up — the same append-only-log + STATUS-chain pattern already used
 * for SO Confirmation and Dispatch Approval. */
export function registerStageRoutes(router: Router) {
  for (const stage of STAGES) {
    const schema = buildBodySchema(stage);
    const headers = ["Timestamp", "Useremail", "ORDER_ID", stage.idColumn, ...stage.fields.map((f) => f.header), "STATUS"];

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
        const stageId = await nextId(stage.idPrefix, stage.tab, stage.idColumn);

        await ensureSheetTab(env.sheets.transactions, stage.tab, headers);

        const row: SheetRow = {
          Timestamp: now,
          Useremail: req.user!.employeeId,
          ORDER_ID: req.params.id,
          [stage.idColumn]: stageId,
          STATUS: stage.nextStatus,
        };
        for (const field of stage.fields) {
          const value = (body as Record<string, string | number | undefined>)[field.key];
          row[field.header] = value === undefined ? "" : String(value);
        }
        await appendRow(env.sheets.transactions, stage.tab, row);

        await updateRow(
          env.sheets.transactions,
          ORDER_TAB,
          "ORDER_ID",
          req.params.id,
          punchToSheet({ STATUS: stage.nextStatus, CREATED_BY: req.user!.employeeId })
        );

        res.json({ orderId: req.params.id, stageId, status: stage.nextStatus });
      } catch (err) {
        next(err);
      }
    });
  }
}
