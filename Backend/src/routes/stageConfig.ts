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
  fields: StageField[];
}

/**
 * The 8 pipeline stages after Dispatch Approval, reverse-engineered from the old ADC CRR
 * sheet (see docs/Report.md) and adapted to ZOTO's simpler single-ORDER_ID model — each
 * stage appends one row to its own dedicated tab (internal UPPER_SNAKE headers, created
 * on first use via ensureSheetTab, additive only) and advances ORDER_PUNCH.STATUS so the
 * next stage's queue picks the order up. Every stage's queue/detail/form is driven by this
 * one config through the generic stage routes/components — see stageRoutes.ts and
 * Frontend/src/lib/stages.ts.
 */
export const STAGES: StageConfig[] = [
  {
    key: "pdi",
    label: "PDI",
    tab: "PDI",
    idColumn: "PDI_ID",
    idPrefix: "PDI",
    prevStatus: "DISPATCH APPROVAL COMPLETED",
    nextStatus: "PDI COMPLETED",
    fields: [
      { key: "pdiDate", header: "PDI_DATE", required: true },
      { key: "sampleSize", header: "SAMPLE_SIZE" },
      { key: "boxQuantity", header: "BOX_QUANTITY" },
      { key: "productWeight", header: "PRODUCT_WEIGHT" },
      { key: "sendToCustomer", header: "SEND_TO_CUSTOMER" },
      { key: "pdiAttachmentUrl", header: "PDI_ATTACHMENT_URL" },
      { key: "remarks", header: "REMARKS", required: true },
    ],
  },
  {
    key: "transport",
    label: "Transport",
    tab: "TRANSPORT",
    idColumn: "TRANSPORT_ID",
    idPrefix: "TPTR",
    prevStatus: "PDI COMPLETED",
    nextStatus: "TRANSPORT ASSIGNED",
    fields: [
      { key: "vehicleArrangeFor", header: "VEHICLE_ARRANGE_FOR", required: true },
      { key: "vehicleType", header: "VEHICLE_TYPE" },
      { key: "vehicleNo", header: "VEHICLE_NO" },
      { key: "vehicleSize", header: "VEHICLE_SIZE" },
      { key: "driverName", header: "DRIVER_NAME" },
      { key: "driverContactNo", header: "DRIVER_CONTACT_NO" },
      { key: "freightApplicableOnInvoice", header: "FREIGHT_APPLICABLE_ON_INVOICE" },
      { key: "freightCharge", header: "FREIGHT_CHARGE" },
      { key: "remarks", header: "REMARKS", required: true },
    ],
  },
  {
    key: "transport-reached",
    label: "Transport Reached",
    tab: "TRANSPORT_REACHED",
    idColumn: "TRANSPORT_REACHED_ID",
    idPrefix: "TRCH",
    prevStatus: "TRANSPORT ASSIGNED",
    nextStatus: "TRANSPORT REACHED",
    fields: [
      { key: "reached", header: "REACHED", required: true },
      { key: "sameVehicle", header: "SAME_VEHICLE" },
      { key: "expectedDateTime", header: "EXPECTED_DATETIME" },
      { key: "reason", header: "REASON" },
      { key: "remarks", header: "REMARKS", required: true },
    ],
  },
  {
    key: "stock-release",
    label: "Stock Release",
    tab: "STOCK_RELEASE",
    idColumn: "STOCK_RELEASE_ID",
    idPrefix: "STKR",
    prevStatus: "TRANSPORT REACHED",
    nextStatus: "STOCK RELEASED",
    fields: [
      { key: "releaseType", header: "RELEASE_TYPE", required: true },
      { key: "releaseQuantity", header: "RELEASE_QUANTITY" },
      { key: "releaseFrom", header: "RELEASE_FROM" },
      { key: "remarks", header: "REMARKS", required: true },
    ],
  },
  {
    key: "tax-invoice",
    label: "Tax Invoice",
    tab: "TAX_INVOICE",
    idColumn: "TAX_INVOICE_ID",
    idPrefix: "INVC",
    prevStatus: "STOCK RELEASED",
    nextStatus: "TAX INVOICE COMPLETED",
    fields: [
      { key: "taxInvoiceNo", header: "TAX_INVOICE_NO", required: true },
      { key: "taxInvoiceDate", header: "TAX_INVOICE_DATE", required: true },
      { key: "taxInvoiceAttachmentUrl", header: "TAX_INVOICE_ATTACHMENT_URL" },
      { key: "eWayBillApplicable", header: "E_WAY_BILL_APPLICABLE" },
      { key: "eWayBillNo", header: "E_WAY_BILL_NO" },
      { key: "eWayBillDate", header: "E_WAY_BILL_DATE" },
      { key: "eWayBillAttachmentUrl", header: "E_WAY_BILL_ATTACHMENT_URL" },
      { key: "remarks", header: "REMARKS", required: true },
    ],
  },
  {
    key: "dispatch",
    label: "Dispatch",
    tab: "DISPATCH",
    idColumn: "DISPATCH_ID",
    idPrefix: "DISP",
    prevStatus: "TAX INVOICE COMPLETED",
    nextStatus: "DISPATCHED",
    fields: [
      { key: "dispatched", header: "DISPATCHED", required: true },
      { key: "gatePassAttachmentUrl", header: "GATE_PASS_ATTACHMENT_URL" },
      { key: "freightCharges", header: "FREIGHT_CHARGES" },
      { key: "otherCharges", header: "OTHER_CHARGES" },
      { key: "paymentStatus", header: "PAYMENT_STATUS" },
      { key: "remarks", header: "REMARKS", required: true },
    ],
  },
  {
    key: "collect-lr",
    label: "Collect LR",
    tab: "LR",
    idColumn: "LR_ID",
    idPrefix: "LR",
    prevStatus: "DISPATCHED",
    nextStatus: "LR COLLECTED",
    fields: [
      { key: "lrNo", header: "LR_NO", required: true },
      { key: "lrDate", header: "LR_DATE", required: true },
      { key: "lrAttachmentUrl", header: "LR_ATTACHMENT_URL" },
      { key: "lrCharges", header: "LR_CHARGES" },
      { key: "paymentStatus", header: "PAYMENT_STATUS" },
      { key: "otherCharges", header: "OTHER_CHARGES" },
      { key: "remarks", header: "REMARKS", required: true },
    ],
  },
  {
    key: "delivery",
    label: "Delivery",
    tab: "DELIVERY",
    idColumn: "DELIVERY_ID",
    idPrefix: "DLRY",
    prevStatus: "LR COLLECTED",
    nextStatus: "DELIVERED",
    fields: [
      { key: "delivered", header: "DELIVERED", required: true },
      { key: "receivingAttachmentUrl", header: "RECEIVING_ATTACHMENT_URL" },
      { key: "anyCharges", header: "ANY_CHARGES" },
      { key: "amount", header: "AMOUNT" },
      { key: "chargeDescription", header: "CHARGE_DESCRIPTION" },
      { key: "remarks", header: "REMARKS", required: true },
    ],
  },
];

export function getStage(key: string): StageConfig | undefined {
  return STAGES.find((s) => s.key === key);
}
