import { useState } from "react";
import { isAxiosError } from "axios";
import { TextField } from "../../../components/form/TextField";
import { FileDropzone } from "../../../components/form/FileDropzone";
import { FormModal } from "../../../components/form/FormModal";
import { submitTripStage } from "../../../lib/tripsApi";

interface Props {
  items: Record<string, string>[];
  onClose: () => void;
  onSaved: () => void;
}

interface TripResult {
  transportId: string;
  status: "pending" | "success" | "error";
  message?: string;
}

/**
 * Applies ONE Stock Release decision (From + Attachment) to every selected trip at once — a
 * second, additional entry point alongside the existing single-trip StockReleaseForm, which
 * this never touches or calls into. Reuses the exact same POST
 * /transport-trips/:transportId/stock-release endpoint (via submitTripStage), once per trip,
 * run sequentially so two calls can't race each other.
 *
 * Unlike BulkReachedForm.tsx (item-level pending, needs item->trip dedup), Stock Release's
 * pending view is already trip-level (no pendingItemColumns on this stage — see
 * tripStages.ts), so `items` here are already one row per trip; no dedup needed.
 */
export function BulkStockReleaseForm({ items, onClose, onSaved }: Props) {
  // Snapshot at mount — same reasoning as BulkReachedForm.tsx: `items` is bound to the
  // parent's live pending query, which shrinks as onSaved() invalidates it mid-flow.
  const [trips] = useState(items);
  const [releaseFrom, setReleaseFrom] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<TripResult[] | null>(null);

  function canSave() {
    return !!releaseFrom.trim();
  }

  async function handleSave() {
    if (!canSave() || submitting) return;
    setSubmitting(true);
    const running: TripResult[] = trips.map((t) => ({ transportId: t.Transport_ID, status: "pending" }));
    setResults([...running]);

    for (let i = 0; i < trips.length; i++) {
      try {
        await submitTripStage(trips[i].Transport_ID, "stock-release", { releaseFrom, attachmentUrl });
        running[i] = { transportId: trips[i].Transport_ID, status: "success" };
      } catch (err) {
        const detail = isAxiosError(err) ? err.response?.data?.error?.message : undefined;
        running[i] = { transportId: trips[i].Transport_ID, status: "error", message: detail ?? "Could not save." };
      }
      setResults([...running]);
    }

    setSubmitting(false);
    onSaved();
    if (running.every((r) => r.status === "success")) onClose();
  }

  const successCount = results?.filter((r) => r.status === "success").length ?? 0;
  const errorCount = results?.filter((r) => r.status === "error").length ?? 0;
  const done = results !== null && !submitting;

  return (
    <FormModal title="Bulk Stock Release Form" onClose={onClose} size="standard" sectionLabel="Stock Release Details">
      <div style={{ padding: "28px var(--space)", overflowY: "auto", flex: 1 }}>
        <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: "0 0 16px" }}>
          Applying one From + Attachment to {trips.length} selected trip{trips.length === 1 ? "" : "s"}.
        </p>

        <div
          style={{
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius)",
            marginBottom: 20,
            maxHeight: 180,
            overflowY: "auto",
          }}
        >
          {trips.map((trip, i) => {
            const result = results?.[i];
            return (
              <div
                key={trip.Transport_ID}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  padding: "8px 12px",
                  borderBottom: i < trips.length - 1 ? "1px solid var(--color-border)" : undefined,
                  fontSize: 13,
                }}
              >
                <div style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  <span style={{ fontWeight: 600 }}>{trip.Transport_ID}</span> · {trip["Customer Name"] || "—"}
                </div>
                {result && (
                  <span
                    style={{
                      flexShrink: 0,
                      color:
                        result.status === "success"
                          ? "var(--color-success, #2e7d32)"
                          : result.status === "error"
                            ? "#d32f2f"
                            : "var(--color-text-muted)",
                      fontSize: 12,
                    }}
                    title={result.message}
                  >
                    {result.status === "success" ? "Saved" : result.status === "error" ? "Failed" : "…"}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <TextField label="From" required value={releaseFrom} onChange={(e) => setReleaseFrom(e.target.value)} placeholder="e.g. Main Warehouse" />
        <FileDropzone label="Attach Document" value={attachmentUrl} onChange={setAttachmentUrl} context="bulk-stock-release" />

        {done && (
          <p style={{ fontSize: 13, marginTop: 12 }}>
            {successCount} succeeded{errorCount > 0 ? `, ${errorCount} failed — hover a trip above for the reason.` : "."}
          </p>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px var(--space)", borderTop: "1px solid var(--color-border)", background: "var(--color-bg-page)" }}>
        <button className="btn" onClick={onClose} disabled={submitting}>
          {done ? "Close" : "Cancel"}
        </button>
        {!done && (
          <button className="btn btn-primary" onClick={handleSave} disabled={!canSave() || submitting}>
            {submitting ? `Saving… (${results?.filter((r) => r.status !== "pending").length ?? 0}/${trips.length})` : "Save"}
          </button>
        )}
      </div>
    </FormModal>
  );
}
