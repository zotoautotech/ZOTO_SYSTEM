export type StageFieldType = "text" | "number" | "date" | "datetime-local" | "yesno" | "file";

export interface StageField {
  key: string;
  label: string;
  type: StageFieldType;
  required?: boolean;
}

export interface StageDef {
  key: string;
  label: string;
  /** ORDER_PUNCH.STATUS value that puts an order into this stage's pending queue. */
  prevStatus: string;
  nextStatus: string;
  fields: StageField[];
}

/**
 * Mirrors Backend/src/routes/stageConfig.ts field-for-field — drives both the generic
 * queue list (StageQueueList) and the generic save form (StageForm) for every stage after
 * Dispatch Approval. See docs/Report.md for where these stages came from (the old ADC CRR
 * pipeline) and CLAUDE.md for the STATUS chain.
 */
export const STAGES: StageDef[] = [
  {
    key: "pdi",
    label: "PDI",
    prevStatus: "DISPATCH APPROVAL COMPLETED",
    nextStatus: "PDI COMPLETED",
    fields: [
      { key: "pdiDate", label: "PDI Date", type: "date", required: true },
      { key: "sampleSize", label: "Sample Size", type: "number" },
      { key: "boxQuantity", label: "Box Quantity", type: "number" },
      { key: "productWeight", label: "Product Weight (g/pcs)", type: "number" },
      { key: "sendToCustomer", label: "Send PDI to Customer", type: "yesno" },
      { key: "pdiAttachmentUrl", label: "PDI Attachment", type: "file" },
      { key: "remarks", label: "PDI Remarks", type: "text", required: true },
    ],
  },
  {
    key: "transport",
    label: "Transport",
    prevStatus: "PDI COMPLETED",
    nextStatus: "TRANSPORT ASSIGNED",
    fields: [
      { key: "vehicleArrangeFor", label: "Vehicle Arrange for", type: "text", required: true },
      { key: "vehicleType", label: "Vehicle Type", type: "text" },
      { key: "vehicleNo", label: "Vehicle No.", type: "text" },
      { key: "vehicleSize", label: "Vehicle Size (Ft)", type: "text" },
      { key: "driverName", label: "Driver Name", type: "text" },
      { key: "driverContactNo", label: "Driver Contact No.", type: "text" },
      { key: "freightApplicableOnInvoice", label: "Freight Applicable On Invoice?", type: "yesno" },
      { key: "freightCharge", label: "Freight Charge", type: "number" },
      { key: "remarks", label: "Remarks", type: "text", required: true },
    ],
  },
  {
    key: "transport-reached",
    label: "Transport Reached",
    prevStatus: "TRANSPORT ASSIGNED",
    nextStatus: "TRANSPORT REACHED",
    fields: [
      { key: "reached", label: "Transport Reached", type: "yesno", required: true },
      { key: "sameVehicle", label: "Same Vehicle", type: "yesno" },
      { key: "expectedDateTime", label: "Expected Date/Time", type: "datetime-local" },
      { key: "reason", label: "Reason", type: "text" },
      { key: "remarks", label: "Remarks", type: "text", required: true },
    ],
  },
  {
    key: "stock-release",
    label: "Stock Release",
    prevStatus: "TRANSPORT REACHED",
    nextStatus: "STOCK RELEASED",
    fields: [
      { key: "releaseType", label: "Release Type", type: "text", required: true },
      { key: "releaseQuantity", label: "Release Quantity", type: "number" },
      { key: "releaseFrom", label: "Release From", type: "text" },
      { key: "remarks", label: "Remarks", type: "text", required: true },
    ],
  },
  {
    key: "tax-invoice",
    label: "Tax Invoice",
    prevStatus: "STOCK RELEASED",
    nextStatus: "TAX INVOICE COMPLETED",
    fields: [
      { key: "taxInvoiceNo", label: "Tax Invoice No.", type: "text", required: true },
      { key: "taxInvoiceDate", label: "Tax Invoice Date", type: "date", required: true },
      { key: "taxInvoiceAttachmentUrl", label: "Tax Invoice Attachment", type: "file" },
      { key: "eWayBillApplicable", label: "E-Way Bill Applicable", type: "yesno" },
      { key: "eWayBillNo", label: "E-Way Bill No.", type: "text" },
      { key: "eWayBillDate", label: "E-Way Bill Date", type: "date" },
      { key: "eWayBillAttachmentUrl", label: "E-Way Bill Attachment", type: "file" },
      { key: "remarks", label: "Remarks", type: "text", required: true },
    ],
  },
  {
    key: "dispatch",
    label: "Dispatch",
    prevStatus: "TAX INVOICE COMPLETED",
    nextStatus: "DISPATCHED",
    fields: [
      { key: "dispatched", label: "Dispatched", type: "yesno", required: true },
      { key: "gatePassAttachmentUrl", label: "Dispatch Gate Pass", type: "file" },
      { key: "freightCharges", label: "Freight Charges", type: "number" },
      { key: "otherCharges", label: "Other Charges", type: "number" },
      { key: "paymentStatus", label: "Payment Status", type: "text" },
      { key: "remarks", label: "Dispatch Description", type: "text", required: true },
    ],
  },
  {
    key: "collect-lr",
    label: "Collect LR",
    prevStatus: "DISPATCHED",
    nextStatus: "LR COLLECTED",
    fields: [
      { key: "lrNo", label: "LR No.", type: "text", required: true },
      { key: "lrDate", label: "LR Date", type: "date", required: true },
      { key: "lrAttachmentUrl", label: "LR Attachment", type: "file" },
      { key: "lrCharges", label: "LR Charges", type: "number" },
      { key: "paymentStatus", label: "Payment Status", type: "text" },
      { key: "otherCharges", label: "Other Charges", type: "number" },
      { key: "remarks", label: "LR Remarks", type: "text", required: true },
    ],
  },
  {
    key: "delivery",
    label: "Delivery",
    prevStatus: "LR COLLECTED",
    nextStatus: "DELIVERED",
    fields: [
      { key: "delivered", label: "Delivered", type: "yesno", required: true },
      { key: "receivingAttachmentUrl", label: "Receiving Attachment", type: "file" },
      { key: "anyCharges", label: "Any Charges", type: "yesno" },
      { key: "amount", label: "Amount", type: "number" },
      { key: "chargeDescription", label: "Charge Description", type: "text" },
      { key: "remarks", label: "Delivery Remarks", type: "text", required: true },
    ],
  },
];

export function getStage(key: string): StageDef | undefined {
  return STAGES.find((s) => s.key === key);
}
