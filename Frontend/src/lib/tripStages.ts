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
}

/**
 * The 7 stages after a trip is created (see Backend/src/routes/tripRoutes.ts and
 * docs/04-UIUX-BRIEF.md §9 for the reference UI these are modeled on). "transport" itself
 * (trip creation + attaching orders) has its own screen, not a stage in this chain.
 */
export const TRIP_STAGES: TripStageDef[] = [
  { key: "transport-reached", label: "Transport Reached", prevStatus: "OPEN", nextStatus: "REACHED", action: "reached" },
  { key: "stock-release", label: "Stock Release", prevStatus: "REACHED", nextStatus: "STOCK RELEASED", action: "stock-release" },
  { key: "tax-invoice", label: "Tax Invoice", prevStatus: "STOCK RELEASED", nextStatus: "TAX INVOICE COMPLETED", action: "tax-invoice" },
  { key: "dispatch", label: "Dispatch", prevStatus: "TAX INVOICE COMPLETED", nextStatus: "DISPATCHED", action: "dispatch" },
  { key: "collect-lr", label: "Collect LR", prevStatus: "DISPATCHED", nextStatus: "LR COLLECTED", action: "lr" },
  { key: "delivery", label: "Delivery", prevStatus: "LR COLLECTED", nextStatus: "DELIVERED", action: "delivery" },
];

export function getTripStage(key: string): TripStageDef | undefined {
  return TRIP_STAGES.find((s) => s.key === key);
}
