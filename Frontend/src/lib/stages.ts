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
 * PDI and Pre Transport are the two simple single-order stages between Dispatch Approval
 * and the trip system (see Frontend/src/lib/tripStages.ts, modules/transport/) — mirrors
 * Backend/src/routes/stageConfig.ts field-for-field. Transport onward is trip-level, not
 * order-level, and lives in its own module/route set.
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
    key: "pre-transport",
    label: "Pre Transport",
    prevStatus: "PDI COMPLETED",
    nextStatus: "PRE TRANSPORT COMPLETED",
    fields: [
      { key: "boxQuantity", label: "Box Quantity", type: "number", required: true },
      { key: "packingType", label: "Packing Type", type: "text" },
      { key: "nugOfThisCustomer", label: "NUG of this Customer", type: "text" },
      { key: "packagingNug", label: "Packaging Nug", type: "text" },
      { key: "packagingCode", label: "Packaging Code", type: "text" },
    ],
  },
];

export function getStage(key: string): StageDef | undefined {
  return STAGES.find((s) => s.key === key);
}
