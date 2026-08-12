import type { SheetRow } from "../services/sheets.js";

/**
 * Shared "how much of this item has actually been decided" logic for the multi-round
 * Dispatch Approval flow (see CLAUDE.md's "Split / partial dispatch" section). Lives in its
 * own module rather than orders.ts because stageRoutes.ts needs it too, and orders.ts
 * already imports FROM stageRoutes.ts (createPlaceholderPdi) — importing back the other way
 * would be circular.
 *
 * An item's order quantity can be decided across MULTIPLE rounds — e.g. 12 SET ordered, 10
 * approved today, the remaining 2 decided later. Each round contributes:
 * - "Dispatch Today" → its Approved Quantity.
 * - "Short Quantity" → its own figure (a short still *accounts* for that portion of the
 *   order — it isn't an open balance).
 * - "Excess Quantity" → closes the ENTIRE remaining balance outright, regardless of figure.
 * - "Dispatch Extended" → contributes nothing; it's a hold on the current balance.
 */
export interface DispatchDecisionSummary {
  decidedQty: number;
  closesBalance: boolean;
  hasRealDecision: boolean;
  latestOutcome: string;
  latestNextExtendedDate: string;
}

export function summarizeDispatchDecisions(rows: SheetRow[]): Map<string, DispatchDecisionSummary> {
  const byItem = new Map<string, SheetRow[]>();
  for (const r of rows) {
    if (!byItem.has(r.ITEM_ID)) byItem.set(r.ITEM_ID, []);
    byItem.get(r.ITEM_ID)!.push(r);
  }
  const result = new Map<string, DispatchDecisionSummary>();
  for (const [itemId, itemRows] of byItem) {
    const sorted = [...itemRows].sort((a, b) => (a.Timestamp || "").localeCompare(b.Timestamp || ""));
    const latest = sorted[sorted.length - 1];
    let decidedQty = 0;
    let closesBalance = false;
    let hasRealDecision = false;
    for (const r of itemRows) {
      const outcome = r["Dispatch Approval"] || "";
      if (outcome === "Dispatch Today") {
        decidedQty += Number(r["Approved Quantity"] || 0);
        hasRealDecision = true;
      } else if (outcome === "Short Quantity") {
        decidedQty += Number(r["Short Quantity"] || 0);
        hasRealDecision = true;
      } else if (outcome === "Excess Quantity") {
        closesBalance = true;
        hasRealDecision = true;
      }
    }
    result.set(itemId, {
      decidedQty,
      closesBalance,
      hasRealDecision,
      latestOutcome: latest?.["Dispatch Approval"] || "",
      latestNextExtendedDate: latest?.["Next Extended Date"] || "",
    });
  }
  return result;
}

/** Remaining un-decided quantity for an item — 0 once every SET on the order has been
 * accounted for across however many Dispatch Approval rounds (or an Excess Quantity round
 * has fired, which always closes it). Never negative. */
export function dispatchBalance(orderQty: number, summary: DispatchDecisionSummary | undefined): number {
  if (!summary) return orderQty;
  if (summary.closesBalance) return 0;
  return Math.max(0, orderQty - summary.decidedQty);
}
