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
 * PDI is the one simple single-order stage between Dispatch Approval and the trip system
 * (see Frontend/src/lib/tripStages.ts, modules/transport/) — mirrors
 * Backend/src/routes/stageConfig.ts field-for-field. Transport onward is trip-level, not
 * order-level, and lives in its own module/route set.
 *
 * Pre Transport was removed (user call — it was a manual doer-filled stage but should be
 * system-auto-decided instead; deferred to a future version, not rebuilt here) — PDI now
 * forwards straight to "PRE TRANSPORT COMPLETED" (unchanged status string, since Transport's
 * eligible-orders filter in tripRoutes.ts already keys off exactly that value — this way
 * nothing downstream needed to change) instead of the old "PDI COMPLETED" intermediate
 * status that Pre Transport used to pick up.
 */
export const STAGES: StageDef[] = [
  {
    key: "pdi",
    label: "PDI",
    prevStatus: "DISPATCH APPROVAL COMPLETED",
    nextStatus: "PRE TRANSPORT COMPLETED",
    fields: [
      { key: "pdiNo", label: "PDI No.", type: "text", required: true },
      { key: "pdiDate", label: "PDI Date", type: "date", required: true },
      { key: "pdiAttachmentUrl", label: "PDI Attachment", type: "file", required: true },
      { key: "boxQuantity", label: "Box Quantity", type: "number", required: true },
      // Was "remarks" here, which never matched Backend/src/routes/stageConfig.ts's
      // "pdiRemarks" key — since StageForm posts the payload keyed by field.key directly
      // (see stageRoutes.ts's buildBodySchema, which builds its zod shape off the SAME
      // stage.fields[].key), this meant every PDI submission's schema.parse() was silently
      // failing to see this required field at all. Renamed to match.
      { key: "pdiRemarks", label: "PDI Remarks", type: "text", required: true },
    ],
  },
];

export function getStage(key: string): StageDef | undefined {
  return STAGES.find((s) => s.key === key);
}
