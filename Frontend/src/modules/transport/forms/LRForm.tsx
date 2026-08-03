import { useState } from "react";
import { isAxiosError } from "axios";
import { TextField } from "../../../components/form/TextField";
import { SearchableSelect } from "../../../components/form/SearchableSelect";
import { FileDropzone } from "../../../components/form/FileDropzone";
import { submitTripStage } from "../../../lib/tripsApi";
import { useIsMobile } from "../../../lib/responsive";
import { StageModalShell } from "./StageModalShell";

interface Props {
  transportId: string;
  onClose: () => void;
  onSaved: () => void;
}

const PAYMENT_STATUS_OPTIONS = [
  { value: "Prepaid by ZOTO", label: "Prepaid by ZOTO" },
  { value: "Postpaid by ZOTO", label: "Postpaid by ZOTO" },
  { value: "Pay at Customer", label: "Pay at Customer" },
];

/** Matches the reference "LR Form" (docs/04-UIUX-BRIEF.md §9.7) — its "Provide LR to the
 * Customer" field is a live camera-capture widget in the old app; not wired here (no
 * matching backend field, and a plain file upload isn't the same interaction). */
export function LRForm({ transportId, onClose, onSaved }: Props) {
  const isMobile = useIsMobile();
  const [lrNo, setLrNo] = useState("");
  const [lrDate, setLrDate] = useState("");
  const [lrAttachmentUrl, setLrAttachmentUrl] = useState("");
  const [lrCharges, setLrCharges] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [otherCharges, setOtherCharges] = useState("");
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function canSave() {
    return !!lrNo.trim() && !!lrDate;
  }

  async function handleSave() {
    if (!canSave() || saving) return;
    setSaving(true);
    setError("");
    try {
      await submitTripStage(transportId, "lr", {
        lrNo,
        lrDate,
        lrAttachmentUrl,
        lrCharges: lrCharges ? Number(lrCharges) : undefined,
        paymentStatus,
        otherCharges: otherCharges ? Number(otherCharges) : undefined,
        remarks,
      } as Record<string, string | number>);
      onSaved();
    } catch (err) {
      const detail = isAxiosError(err) ? err.response?.data?.error?.message : undefined;
      setError(detail ?? "Could not save.");
      setSaving(false);
    }
  }

  return (
    <StageModalShell title="LR Form" tabLabel="LR Details" onClose={onClose}>
      <div style={{ padding: "28px var(--space)", overflowY: "auto", flex: 1 }}>
        <TextField label="LR No." required value={lrNo} onChange={(e) => setLrNo(e.target.value)} />
        <TextField label="LR Date" required type="date" value={lrDate} onChange={(e) => setLrDate(e.target.value)} />
        <FileDropzone label="LR Attachment" value={lrAttachmentUrl} onChange={setLrAttachmentUrl} context={`lr_${transportId}`} />
        <TextField label="LR Charges" type="number" value={lrCharges} onChange={(e) => setLrCharges(e.target.value)} />
        <SearchableSelect label="Payment Status" value={paymentStatus} onChange={setPaymentStatus} options={PAYMENT_STATUS_OPTIONS} placeholder="Search" />
        <TextField label="Other Charges" type="number" value={otherCharges} onChange={(e) => setOtherCharges(e.target.value)} />
        <TextField label="LR Remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
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
