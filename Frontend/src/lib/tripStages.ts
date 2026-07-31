export interface TripStageDef {
  /** Also the URL segment and module key (matches Frontend/src/lib/modules.ts). */
  key: string;
  label: string;
  /** TRANSPORT.Status value that puts a trip into this stage's queue. */
  prevStatus: string;
  nextStatus: string;
  /** POST /transport-trips/:id/<action> — "dispatch" combines pre-dispatch + vehicle-dispatch
   * + dispatch into one doer-facing action (see DispatchForm.tsx). */
  action: string;
  /** Set only for Stock Release / Tax Invoice — these two run in PARALLEL off the same
   * REACHED status (matches the old CRR reference: both queues pick up a trip at once, not
   * one gating the other), so a plain Status-equality filter can't tell "still pending this
   * specific branch" apart from "done this branch, other branch still pending" — both cases
   * leave Status sitting at REACHED. The trip's own tab (STOCK_RELEASE / TAX_INVOICE) is the
   * actual source of truth for whether THIS branch is done; see GET /transport-trips's
   * excludeIfInTab/includeIfInTab params, which TripQueueList/TripDetail use instead of
   * nextStatus for these two stages. Dispatch's own prevStatus (TAX INVOICE COMPLETED) is
   * unaffected — the trip's Status only actually advances there once BOTH branches are done
   * (see tripRoutes.ts's stock-release/tax-invoice handlers). */
  completionTab?: string;
}

/**
 * The 7 stages after a trip is created (see Backend/src/routes/tripRoutes.ts and
 * docs/04-UIUX-BRIEF.md §9 for the reference UI these are modeled on). "transport" itself
 * (trip creation + attaching orders) has its own screen, not a stage in this chain.
 */
export const TRIP_STAGES: TripStageDef[] = [
  { key: "transport-reached", label: "Transport Reached", prevStatus: "OPEN", nextStatus: "REACHED", action: "reached" },
  { key: "stock-release", label: "Stock Release", prevStatus: "REACHED", nextStatus: "TAX INVOICE COMPLETED", action: "stock-release", completionTab: "STOCK_RELEASE" },
  { key: "tax-invoice", label: "Tax Invoice", prevStatus: "REACHED", nextStatus: "TAX INVOICE COMPLETED", action: "tax-invoice", completionTab: "TAX_INVOICE" },
  { key: "dispatch", label: "Dispatch", prevStatus: "TAX INVOICE COMPLETED", nextStatus: "DISPATCHED", action: "dispatch" },
  { key: "collect-lr", label: "Collect LR", prevStatus: "DISPATCHED", nextStatus: "LR COLLECTED", action: "lr" },
  { key: "delivery", label: "Delivery", prevStatus: "LR COLLECTED", nextStatus: "DELIVERED", action: "delivery" },
];

export function getTripStage(key: string): TripStageDef | undefined {
  return TRIP_STAGES.find((s) => s.key === key);
}
