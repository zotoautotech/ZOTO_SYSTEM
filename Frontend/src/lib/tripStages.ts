/** One column on a stage's own Completed view. `header` is the label shown; `field` is the
 * LITERAL sheet header on that stage's own tab (these six tabs have no internal field-name
 * map — see GET /transport-trips/stage-rows). Verified against the live tabs' actual
 * headers rather than assumed, per this project's usual discipline. */
export interface StageColumn {
  header: string;
  field: string;
  /** Renders a "View" button (opens via the shared attachment viewer) instead of the raw
   * cell text — the field holds a Drive fileId, not something readable on its own. */
  isAttachment?: boolean;
}

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
  /** This stage's own sheet tab, read by its Completed view via GET /transport-trips/stage-rows. */
  tab: string;
  /** The columns THIS stage records itself — what makes each stage's Completed view its own
   * rather than the same generic trip table repeated six times. */
  completedColumns: StageColumn[];
  /** When set, the PENDING view (not just Completed) also goes item-level — one row per
   * Transport_Products item on a matching trip, rather than one row per trip — matching how
   * the "Transport" stage's own pending view already reads (see TransportList.tsx). `field`
   * is the literal Transport_Products header. Rows still open the trip they belong to
   * (Transport_ID), since the stage's own action form is trip-level, not per-item. */
  pendingItemColumns?: StageColumn[];
  /** Shown in the pending (non-Completed) trip-level table's Status column instead of the raw
   * TRANSPORT.Status value — a trip sitting at "REACHED" reads as "Tax Invoice Pending" on
   * this queue and "Stock Release Pending" on that one, even though both queues are reading
   * the exact same underlying Status. Doesn't touch the stored value, purely a display label
   * (same convention as OrderPunchList's Sale Order status override) — only used while
   * `!showCompleted`, since the Completed view already shows this stage's own recorded data
   * instead of the raw trip Status. */
  pendingStatusLabel?: string;
  /** Replaces the trip-level pending table's default column set (Vehicle Arrange for/Send
   * Through/Transporter Name/Vehicle type/Vehicle No./Driver Name) with this stage's own —
   * matching the old CRR reference's own per-stage pending list, e.g. Tax Invoice showing
   * Buyer GSTIN/Freight Paid by/Basic-Tax-Total Amount instead of generic vehicle columns.
   * `field` is the literal key GET /transport-trips already enriches every trip row with —
   * see tripRoutes.ts's `snapshotByTrip` join. Status/Timestamp/Transport ID always render
   * first regardless, same as the default column set. Only set where actually asked for
   * (currently just tax-invoice) — every other stage keeps the generic vehicle columns. */
  pendingColumns?: StageColumn[];
}

/**
 * The 7 stages after a trip is created (see Backend/src/routes/tripRoutes.ts and
 * docs/04-UIUX-BRIEF.md §9 for the reference UI these are modeled on). "transport" itself
 * (trip creation + attaching orders) has its own screen, not a stage in this chain.
 */
export const TRIP_STAGES: TripStageDef[] = [
  {
    key: "transport-reached",
    label: "Transport Reached",
    prevStatus: "OPEN",
    nextStatus: "REACHED",
    action: "reached",
    tab: "Transport_Reached",
    completedColumns: [
      { header: "Customer Name", field: "Customer Name" },
      { header: "Transport ID", field: "Transport_ID" },
      { header: "Transport Reached", field: "Transport Reached" },
      { header: "Same Vehicle", field: "Same Vehicle" },
      { header: "Expected DateTime", field: "Expected DateTime" },
      { header: "Vehicle No.", field: "Vehicle No." },
      { header: "Driver Name", field: "Driver Name" },
      { header: "Reason", field: "Reason" },
    ],
    pendingItemColumns: [
      { header: "CUST ID", field: "CUST ID" },
      { header: "Customer Name", field: "Customer Name" },
      { header: "Part No.", field: "Part No." },
      { header: "Part Name", field: "Part Name" },
      { header: "Quantity", field: "Quantity" },
      { header: "Unit", field: "Unit" },
    ],
  },
  {
    key: "stock-release",
    label: "Stock Release",
    prevStatus: "REACHED",
    nextStatus: "TAX INVOICE COMPLETED",
    pendingStatusLabel: "Stock Release Pending",
    action: "stock-release",
    completionTab: "STOCK_RELEASE",
    tab: "STOCK_RELEASE",
    // The only item-level stage tab of the six — one row per released item, so its
    // Completed view is a parts list rather than a trip list.
    completedColumns: [
      { header: "Part Name", field: "Part Name" },
      { header: "Part No.", field: "Part No." },
      { header: "Quantity", field: "Quantity" },
      { header: "Unit", field: "Unit" },
      { header: "Release Quantity", field: "Release Quantity" },
      { header: "Type", field: "Type" },
      { header: "From", field: "From" },
      { header: "Vehicle No.", field: "Vehicle No." },
      { header: "Attachment", field: "Attachment", isAttachment: true },
    ],
  },
  {
    key: "tax-invoice",
    label: "Tax Invoice",
    prevStatus: "REACHED",
    nextStatus: "TAX INVOICE COMPLETED",
    pendingStatusLabel: "Tax Invoice Pending",
    action: "tax-invoice",
    completionTab: "TAX_INVOICE",
    tab: "TAX_INVOICE",
    completedColumns: [
      { header: "Customer Name", field: "Customer Name" },
      { header: "Tax Invoice No.", field: "Tax Invoice No." },
      { header: "Tax Invoice Date", field: "Tax Invoice Date" },
      { header: "Total Amount", field: "Total Amount" },
      { header: "E-Way Bill Applicable", field: "E-Way Bill Applicable" },
      { header: "E-Way Bill No.", field: "E-Way Bill No." },
      { header: "Vehicle No.", field: "Vehicle No." },
    ],
    pendingColumns: [
      { header: "Buyer GSTIN No.", field: "Buyer GSTIN No." },
      { header: "Freight Paid by", field: "Freight Paid by" },
      { header: "Freight Paid at", field: "Freight Paid at" },
      { header: "Transport Mode", field: "Transport Mode" },
      { header: "Transporter Name", field: "Transporter Name" },
      { header: "Transporter GSTIN", field: "Transporter GSTIN" },
      { header: "Vehicle type", field: "Vehicle type" },
      { header: "Vehicle No.", field: "Vehicle No." },
      { header: "Vehicle Size (Ft)", field: "Vehicle Size (Ft)" },
      { header: "Freight Applicable", field: "Freight Applicable On Invoice?" },
      { header: "Freight Charge", field: "Freight Charge" },
      { header: "Freight GST Applicable", field: "Freight GST Applicable" },
      { header: "Invoice Discount (Rs)", field: "Invoice Discount (Rs)" },
      { header: "Basic Amount", field: "Basic Amount" },
      { header: "Tax Amount", field: "Tax Amount" },
      { header: "Total Amount", field: "Total Amount" },
    ],
  },
  {
    key: "dispatch",
    label: "Dispatch",
    prevStatus: "TAX INVOICE COMPLETED",
    nextStatus: "DISPATCHED",
    pendingStatusLabel: "Dispatch Pending",
    action: "dispatch",
    tab: "Dispatch",
    completedColumns: [
      { header: "Customer Name", field: "Customer Name" },
      { header: "Dispatched", field: "Dispatched" },
      { header: "Freight Charges", field: "Freight Charges" },
      { header: "Other Charges", field: "Other Charges" },
      { header: "Payment Status", field: "Payment Status" },
      { header: "Vehicle No.", field: "Vehicle No." },
      { header: "Next Dispatch DateTime", field: "Next Dispatch DateTime" },
    ],
  },
  {
    key: "collect-lr",
    label: "Collect LR",
    prevStatus: "DISPATCHED",
    nextStatus: "LR COLLECTED",
    pendingStatusLabel: "Collect LR Pending",
    action: "lr",
    tab: "LR",
    completedColumns: [
      { header: "Customer Name", field: "Customer Name" },
      { header: "LR No.", field: "LR No." },
      { header: "LR Date", field: "LR Date" },
      { header: "LR Charges", field: "LR Charges" },
      { header: "Payment Status", field: "Payment Status" },
      { header: "Transporter Name", field: "Transporter Name" },
      { header: "LR Remarks", field: "LR Remarks" },
    ],
  },
  {
    key: "delivery",
    label: "Delivery",
    prevStatus: "LR COLLECTED",
    nextStatus: "DELIVERED",
    pendingStatusLabel: "Delivery Pending",
    action: "delivery",
    tab: "DELIVERY",
    completedColumns: [
      { header: "Customer Name", field: "Customer Name" },
      { header: "Delivered", field: "Delivered" },
      { header: "Expected Delivery Date", field: "Expected Delivery Date" },
      { header: "Amount", field: "Amount" },
      { header: "Freight Charges to Transporter", field: "Freight Charges to Transporter" },
      { header: "Delivery Remarks", field: "Delivery Remarks" },
      { header: "Reason", field: "Reason" },
    ],
  },
];

export function getTripStage(key: string): TripStageDef | undefined {
  return TRIP_STAGES.find((s) => s.key === key);
}
