/**
 * Shared IMS stock-balance formulas — one place computing SUM(IN)-SUM(OUT) so every route
 * (Record Entry validation, stock list views, dashboards) agrees on the same number. Kept as
 * plain functions over already-read SheetRow[] rather than each route re-querying Sheets
 * itself — callers read the ledger tab once (readTable) and pass the rows in.
 *
 * Balance rule differs by product type, per docs/work/ims-sheet-header-spec.md:
 *  - FG:  rack-scoped — SUM(IN)-SUM(OUT) for that Old Part No, but only rows where
 *         From=rack (OUT/TRANSFER) or To=rack (IN/TRANSFER) match the rack being checked.
 *  - RM:  whole-part — SUM(IN)-SUM(OUT) for that Old Part Code across every rack.
 *  - WIP: no OUT balance rule at all. IN is capped instead: existing WIP qty already
 *         recorded for a Batch Code + new qty must not exceed that batch's Casted Quantity.
 *  - Other (consumables): no balance rule at all — every OUT is allowed.
 */

import type { SheetRow } from "./sheets.js";

const num = (v: string | undefined) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** FG only — SUM(IN)-SUM(OUT) for `oldPartNo` scoped to one rack (`From`=rack counts as
 * OUT-side movement, `To`=rack counts as IN-side movement; TRANSFER rows carry both a
 * companion IN and OUT row so they net out naturally without special-casing here). */
export function fgRackBalance(rows: SheetRow[], oldPartNo: string, rack: string): number {
  let balance = 0;
  for (const r of rows) {
    if (r["Old Part No"] !== oldPartNo) continue;
    if (r.Type === "IN" && r.To === rack) balance += num(r.Quantity);
    if (r.Type === "OUT" && r.From === rack) balance -= num(r.Quantity);
  }
  return balance;
}

/** RM (and any other whole-part-balance product) — SUM(IN)-SUM(OUT) for `oldPartCode`
 * across every rack, ignoring which rack a row moved through. */
export function wholePartBalance(rows: SheetRow[], oldPartCodeField: string, oldPartCode: string): number {
  let balance = 0;
  for (const r of rows) {
    if (r[oldPartCodeField] !== oldPartCode) continue;
    if (r.Type === "IN") balance += num(r.Quantity);
    if (r.Type === "OUT") balance -= num(r.Quantity);
  }
  return balance;
}

/** WIP — total quantity already recorded IN against one Batch Code (used to cap a new IN
 * entry at that batch's own Casted Quantity: existing + new must not exceed it). */
export function wipBatchInQty(rows: SheetRow[], batchCode: string): number {
  let total = 0;
  for (const r of rows) {
    if (r["Batch Code"] !== batchCode) continue;
    if (r.Type === "IN") total += num(r.Quantity);
  }
  return total;
}

/**
 * Consumables (Other channel) safety-stock/shortfall formulas, per
 * docs/record-entry-other-form-spec.md (mined into ims-sheet-header-spec.md). `avgPerDayUse`
 * and `daysBetweenIssues` are derived from OUT-row history by the caller (this function is
 * pure arithmetic over already-computed inputs, not a Sheets reader).
 */
export function consumablesSafetyStock(avgPerDayUse: number, daysBetweenIssues: number, bufferQtyDuringTransit: number): number {
  return avgPerDayUse * daysBetweenIssues + bufferQtyDuringTransit;
}

/** Can go negative — deliberately no MAX(0) clamp, per the docs spec (a negative shortfall
 * is itself meaningful signal: how far past the reorder point stock has fallen). */
export function consumablesShortfall(balance: number, minimumStock: number): number {
  return minimumStock - balance;
}
