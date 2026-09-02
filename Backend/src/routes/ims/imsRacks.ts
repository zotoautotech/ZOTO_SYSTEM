/** IMS Racks — CRUD over IMS_SHEET_STOCK_ID's "Racks" tab, plus a per-rack FG balance view. */
import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import { appendRow, readTable } from "../../services/sheets.js";
import { nextRandomId } from "../../services/ids.js";
import { requireAuth, requireModule } from "../../middleware/auth.js";
import { fgRackBalance } from "../../services/imsBalance.js";

export const imsRacksRouter = Router();
imsRacksRouter.use(requireAuth);

const RACKS_TAB = "Racks";
const refresh = (q: unknown) => q === "true" || q === "1";

imsRacksRouter.get("/", async (req, res, next) => {
  try {
    const rows = await readTable(env.sheets.imsStock, RACKS_TAB, { refresh: refresh(req.query.refresh) });
    res.json(rows.filter((r) => r["Rack ID"]));
  } catch (err) {
    next(err);
  }
});

const rackSchema = z.object({
  "Rack No.": z.string().min(1),
  Floor: z.string().optional().default(""),
  Unit: z.string().optional().default(""),
  Type: z.enum(["Rack", "Ground", "Ground Lane"]).default("Rack"),
});

imsRacksRouter.post("/", requireModule("ims-racks"), async (req, res, next) => {
  try {
    const body = rackSchema.parse(req.body);
    const rackId = await nextRandomId(env.sheets.imsStock, "RACK", RACKS_TAB, "Rack ID");
    await appendRow(env.sheets.imsStock, RACKS_TAB, { "Rack ID": rackId, Status: "Completed", ...body });
    res.status(201).json({ rackId });
  } catch (err) {
    next(err);
  }
});

/** FG balance for one rack, across every FG part that has moved through it. */
imsRacksRouter.get("/:rackNo/fg-balance", async (req, res, next) => {
  try {
    const rows = await readTable(env.sheets.imsStock, "Stock Record FG");
    const partNos = [...new Set(rows.map((r) => r["Old Part No"]).filter(Boolean))];
    const balances = partNos
      .map((oldPartNo) => ({ oldPartNo, balance: fgRackBalance(rows, oldPartNo, req.params.rackNo) }))
      .filter((b) => b.balance !== 0);
    res.json(balances);
  } catch (err) {
    next(err);
  }
});
