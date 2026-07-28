export interface StageField {
  key: string;
  header: string;
  required?: boolean;
}

export interface StageConfig {
  /** Also the URL segment: GET /orders/:key, POST /orders/:id/:key */
  key: string;
  label: string;
  tab: string;
  idColumn: string;
  idPrefix: string;
  /** ORDER_PUNCH.STATUS value that puts an order into this stage's pending queue. */
  prevStatus: string;
  /** ORDER_PUNCH.STATUS value set once this stage is saved (feeds the next stage's queue). */
  nextStatus: string;
  /** True for tabs that carry ITEM_ID directly (PDI, Pre Transport) — one row per order
   * item instead of one row for the whole order. */
  perItem?: boolean;
  fields: StageField[];
}

/**
 * PDI and Pre Transport are the two simple single-order stages between Dispatch Approval
 * and the trip system (see tripRoutes.ts). Both are per-item on the live sheet (ORDER_ID +
 * ITEM_ID columns), so one row is appended per order item — same pattern as
 * /:id/dispatch-approval in orders.ts. Once an order reaches PRE TRANSPORT COMPLETED it
 * becomes eligible to be attached to a Transport trip (GET /transport-trips/eligible-orders),
 * which owns everything from Transport through Delivery.
 */
export const STAGES: StageConfig[] = [
  {
    key: "pdi",
    label: "PDI",
    tab: "PDI",
    idColumn: "PDI ID",
    idPrefix: "PDI",
    prevStatus: "DISPATCH APPROVAL COMPLETED",
    nextStatus: "PDI COMPLETED",
    perItem: true,
    fields: [
      // "PDI No." is a real column on the live sheet, separate from the internal "PDI ID"
      // (idColumn below, auto-generated per ids.ts convention) — matches the old CRR
      // reference form's own manually-typed PDI No. field.
      { key: "pdiNo", header: "PDI No." },
      { key: "pdiDate", header: "PDI Date", required: true },
      { key: "pdiAttachmentUrl", header: "PDI Attachment" },
      { key: "boxQuantity", header: "Box Quantity" },
      { key: "pdiRemarks", header: "PDI Remarks", required: true },
    ],
  },
  {
    key: "pre-transport",
    label: "Pre Transport",
    tab: "Pre Transport",
    idColumn: "Pre Transport ID",
    idPrefix: "PRETPT",
    prevStatus: "PDI COMPLETED",
    nextStatus: "PRE TRANSPORT COMPLETED",
    perItem: true,
    fields: [
      { key: "boxQuantity", header: "Box Quantity", required: true },
      { key: "packingType", header: "Packing Type" },
      { key: "nugOfThisCustomer", header: "NUG of this Customer" },
      { key: "packagingNug", header: "Packaging Nug" },
      { key: "packagingCode", header: "Packaging Code" },
    ],
  },
];

export function getStage(key: string): StageConfig | undefined {
  return STAGES.find((s) => s.key === key);
}
