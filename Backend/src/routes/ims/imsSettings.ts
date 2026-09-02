/**
 * IMS Settings — requisition-email recipient config. Storage only for now: ZOTO SYSTEM has
 * no existing Gmail/email-send path to reuse (checked — no other module sends mail), and per
 * CLAUDE.md's own convention a new Gmail API scope/impersonation client should be isolated
 * on its own client rather than bolted onto an existing one speculatively. Actual sending is
 * a deliberate follow-up, not built here — this stores the recipient list so that follow-up
 * has somewhere to read from.
 */
import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import { readTable, updateRow, appendRow, ensureSheetTab } from "../../services/sheets.js";
import { requireAuth, requireModule } from "../../middleware/auth.js";

export const imsSettingsRouter = Router();
imsSettingsRouter.use(requireAuth);

const SETTINGS_TAB = "IMS Settings";
const SETTINGS_HEADERS = ["Key", "Value"];
const REQUISITION_EMAIL_KEY = "requisition_email_recipients";

imsSettingsRouter.get("/requisition-email", async (req, res, next) => {
  try {
    await ensureSheetTab(env.sheets.imsProduction, SETTINGS_TAB, SETTINGS_HEADERS);
    const rows = await readTable(env.sheets.imsProduction, SETTINGS_TAB, { refresh: req.query.refresh === "true" });
    const row = rows.find((r) => r.Key === REQUISITION_EMAIL_KEY);
    res.json({ recipients: row?.Value ? row.Value.split(",").map((s) => s.trim()) : [] });
  } catch (err) {
    next(err);
  }
});

const schema = z.object({ recipients: z.array(z.string().email()) });
imsSettingsRouter.put("/requisition-email", requireModule("ims-settings"), async (req, res, next) => {
  try {
    const { recipients } = schema.parse(req.body);
    await ensureSheetTab(env.sheets.imsProduction, SETTINGS_TAB, SETTINGS_HEADERS);
    const rows = await readTable(env.sheets.imsProduction, SETTINGS_TAB);
    const value = recipients.join(",");
    if (rows.some((r) => r.Key === REQUISITION_EMAIL_KEY)) {
      await updateRow(env.sheets.imsProduction, SETTINGS_TAB, "Key", REQUISITION_EMAIL_KEY, { Value: value });
    } else {
      await appendRow(env.sheets.imsProduction, SETTINGS_TAB, { Key: REQUISITION_EMAIL_KEY, Value: value });
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
