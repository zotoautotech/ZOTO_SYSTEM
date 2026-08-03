import { useState } from "react";
import { isAxiosError } from "axios";
import { TextField } from "../../../components/form/TextField";
import { ToggleGroup } from "../../../components/form/ToggleGroup";
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

/** The reference splits this into Vehicle Dispatch Form -> Dispatch Details tab -> a
 * nested per-entry Dispatch Form (docs/04-UIUX-BRIEF.md §9.6). Combined into one form here
 * — on save it calls pre-dispatch, then vehicle-dispatch, then dispatch in sequence
 * (matching the 3 backend endpoints), so the doer fills one screen instead of three. */
export function DispatchForm({ transportId, onClose, onSaved }: Props) {
  const isMobile = useIsMobile();
  const [dispatched, setDispatched] = useState<"Yes" | "No" | "">("");
  const [freightCharges, setFreightCharges] = useState("");
  const [otherCharges, setOtherCharges] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [description, setDescription] = useState("");
  const [gatePassAttachmentUrl, setGatePassAttachmentUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function canSave() {
    return !!dispatched && !!description.trim();
  }

  async function handleSave() {
    if (!canSave() || saving) return;
    setSaving(true);
    setError("");
    try {
      await submitTripStage(transportId, "pre-dispatch", { remarks: description });
      await submitTripStage(transportId, "vehicle-dispatch", {
        dispatched,
        freightCharges: freightCharges ? Number(freightCharges) : undefined,
        otherCharges: otherCharges ? Number(otherCharges) : undefined,
        paymentStatus,
        remarks: description,
      } as Record<string, string | number>);
      await submitTripStage(transportId, "dispatch", {
        gatePassAttachmentUrl,
        freightCharges: freightCharges ? Number(freightCharges) : undefined,
        otherCharges: otherCharges ? Number(otherCharges) : undefined,
        paymentStatus,
        remarks: description,
      } as Record<string, string | number>);
      onSaved();
    } catch (err) {
      const detail = isAxiosError(err) ? err.response?.data?.error?.message : undefined;
      setError(detail ?? "Could not save.");
      setSaving(false);
    }
  }

  return (
    <StageModalShell title="Vehicle Dispatch Form" tabLabel="Dispatch Details" onClose={onClose}>
      <div style={{ padding: "28px var(--space)", overflowY: "auto", flex: 1 }}>
        <ToggleGroup label="Dispatched" required value={dispatched} onChange={setDispatched} options={[{ value: "Yes", label: "Yes" }, { value: "No", label: "No" }]} />
        {dispatched === "Yes" && (
          <>
            <TextField label="Freight Charges" type="number" value={freightCharges} onChange={(e) => setFreightCharges(e.target.value)} />
            <TextField label="Other Charges by ZOTO" type="number" value={otherCharges} onChange={(e) => setOtherCharges(e.target.value)} />
            <SearchableSelect label="Payment Status" value={paymentStatus} onChange={setPaymentStatus} options={PAYMENT_STATUS_OPTIONS} placeholder="Search" />
            <FileDropzone label="Dispatch Gate Pass" value={gatePassAttachmentUrl} onChange={setGatePassAttachmentUrl} context={`gate-pass_${transportId}`} />
          </>
        )}
        <TextField label="Dispatch Description" required value={description} onChange={(e) => setDescription(e.target.value)} />
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
