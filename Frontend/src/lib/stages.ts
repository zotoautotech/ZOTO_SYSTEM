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
      { key: "pdiNo", label: "PDI No.", type: "text" },
      { key: "pdiDate", label: "PDI Date", type: "date", required: true },
      { key: "pdiAttachmentUrl", label: "PDI Attachment", type: "file" },
      { key: "boxQuantity", label: "Box Quantity", type: "number" },
      // Was "remarks" here, which never matched Backend/src/routes/stageConfig.ts's
      // "pdiRemarks" key — since StageForm posts the payload keyed by field.key directly
      // (see stageRoutes.ts's buildBodySchema, which builds its zod shape off the SAME
      // stage.fields[].key), this meant every PDI submission's schema.parse() was silently
      // failing to see this required field at all. Renamed to match.
      { key: "pdiRemarks", label: "PDI Remarks", type: "text", required: true },
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
