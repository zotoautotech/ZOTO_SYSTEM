/** IMS Inventory — live stock-balance views per product type (computed from the ledger tabs,
 * not the Data Storage snapshot tabs — those are period-archive only, see the header spec's
 * item 9) plus quarterly snapshot read access. */
import { Router } from "express";
import { env } from "../../config/env.js";
import { readTable } from "../../services/sheets.js";
import { requireAuth } from "../../middleware/auth.js";

export const imsInventoryRouter = Router();
imsInventoryRouter.use(requireAuth);

const LEDGER_TABS = {
  fg: { tab: "Stock Record FG", partField: "Old Part No" },
  rm: { tab: "Stock Record RM", partField: "Old Part Code" },
  wip: { tab: "Stock Record WIP", partField: "Old Part Code" },
  other: { tab: "Stock Record Other", partField: "Old Part Code" },
} as const;
type ProductType = keyof typeof LEDGER_TABS;

/** Whole-part balance per part (FG's rack-scoped balance is exposed separately via
 * imsRacks.ts's /:rackNo/fg-balance, since "balance" only means something FG-wide when
 * summed across every rack, which is what this endpoint does for all four types alike). */
imsInventoryRouter.get("/:type/balances", async (req, res, next) => {
  try {
    const type = req.params.type as ProductType;
    if (!(type in LEDGER_TABS)) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Unknown product type" } });
    const { tab, partField } = LEDGER_TABS[type];
    const rows = await readTable(env.sheets.imsStock, tab, { refresh: req.query.refresh === "true" });
    const balances = new Map<string, number>();
    for (const r of rows) {
      const part = r[partField];
      if (!part) continue;
      const qty = Number(r.Quantity ?? 0);
      const delta = r.Type === "IN" ? qty : r.Type === "OUT" ? -qty : 0; // TRANSFER's own companion IN/OUT rows already net out
      balances.set(part, (balances.get(part) ?? 0) + delta);
    }
    res.json([...balances.entries()].map(([part, balance]) => ({ part, balance })));
  } catch (err) {
    next(err);
  }
});

const DATA_STORAGE_TABS: Record<ProductType, string> = {
  fg: "Data Storage FG",
  rm: "Data Storage RM",
  wip: "Data Storage WIP",
  other: "Data Storage OTH.",
};

/** Point-in-time quarterly/period snapshots — read-only archive, not live balances. */
imsInventoryRouter.get("/:type/snapshots", async (req, res, next) => {
  try {
    const type = req.params.type as ProductType;
    if (!(type in DATA_STORAGE_TABS)) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Unknown product type" } });
    const rows = await readTable(env.sheets.imsDataStorage, DATA_STORAGE_TABS[type], { refresh: req.query.refresh === "true" });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});
