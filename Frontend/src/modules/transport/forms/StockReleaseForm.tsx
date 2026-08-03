import { useState } from "react";
import { isAxiosError } from "axios";
import { TextField } from "../../../components/form/TextField";
import { FileDropzone } from "../../../components/form/FileDropzone";
import { submitTripStage } from "../../../lib/tripsApi";
import { useIsMobile } from "../../../lib/responsive";
import { StageModalShell } from "./StageModalShell";

interface Props {
  transportId: string;
  onClose: () => void;
  onSaved: () => void;
}

/** Simplified to just the two fields the doer actually needs to provide — "Type" is now
 * always "OUT" (set server-side, see tripRoutes.ts's stock-release handler) since that was
 * the only value ever used in practice, and "Description" was replaced with an attachment
 * per user request. */
export function StockReleaseForm({ transportId, onClose, onSaved }: Props) {
  const isMobile = useIsMobile();
  const [releaseFrom, setReleaseFrom] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function canSave() {
    return !!releaseFrom.trim();
  }

  async function handleSave() {
    if (!canSave() || saving) return;
    setSaving(true);
    setError("");
    try {
      await submitTripStage(transportId, "stock-release", { releaseFrom, attachmentUrl });
      onSaved();
    } catch (err) {
      const detail = isAxiosError(err) ? err.response?.data?.error?.message : undefined;
      setError(detail ?? "Could not save.");
      setSaving(false);
    }
  }

  return (
    <StageModalShell title="Stock Release Form" tabLabel="Stock Release Details" onClose={onClose}>
      <div style={{ padding: "28px var(--space)", overflowY: "auto", flex: 1 }}>
        <TextField label="From" required value={releaseFrom} onChange={(e) => setReleaseFrom(e.target.value)} placeholder="e.g. Main Warehouse" />
        <FileDropzone label="Attach Document" value={attachmentUrl} onChange={setAttachmentUrl} context={`stock-release_${transportId}`} />
        {error && <p style={{ color: "#d32f2f", fontSize: 13, marginTop: 8 }}>{error}</p>}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: isMobile ? "14px var(--space) 28px" : "14px var(--space)", borderTop: "1px solid var(--color-border)", background: "var(--color-bg-page)" }}>
        <button className="btn" onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={handleSave} disabled={!canSave() || saving}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </StageModalShell>
  );
}
