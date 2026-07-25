import { useState } from "react";
import { isAxiosError } from "axios";
import { TextField } from "../../../components/form/TextField";
import { ToggleGroup } from "../../../components/form/ToggleGroup";
import { FileDropzone } from "../../../components/form/FileDropzone";
import { submitTripStage } from "../../../lib/tripsApi";
import { useIsMobile } from "../../../lib/responsive";
import { StageModalShell } from "./StageModalShell";

interface Props {
  transportId: string;
  onClose: () => void;
  onSaved: () => void;
}

/** Matches the reference "Delivery Form" (docs/04-UIUX-BRIEF.md §9.8) — branches hard on
 * Delivered Yes/No: Yes needs a GRN attachment + optional charges; No needs a reason +
 * rescheduled date, with charges captured unconditionally. */
export function DeliveryForm({ transportId, onClose, onSaved }: Props) {
  const isMobile = useIsMobile();
  const [delivered, setDelivered] = useState<"Yes" | "No" | "">("");
  const [receivingAttachmentUrl, setReceivingAttachmentUrl] = useState("");
  const [anyCharges, setAnyCharges] = useState<"Yes" | "No" | "">("");
  const [amount, setAmount] = useState("");
  const [freightChargesToTransporter, setFreightChargesToTransporter] = useState("");
  const [chargeDescription, setChargeDescription] = useState("");
  const [reason, setReason] = useState("");
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function canSave() {
    if (!delivered) return false;
    if (delivered === "Yes") {
      if (!receivingAttachmentUrl || !anyCharges) return false;
      if (anyCharges === "Yes") return !!amount && !!freightChargesToTransporter && !!chargeDescription.trim();
      return true;
    }
    return !!reason.trim() && !!expectedDeliveryDate && !!amount && !!freightChargesToTransporter && !!chargeDescription.trim();
  }

  async function handleSave() {
    if (!canSave() || saving) return;
    setSaving(true);
    setError("");
    try {
      await submitTripStage(transportId, "delivery", {
        delivered,
        receivingAttachmentUrl: delivered === "Yes" ? receivingAttachmentUrl : "",
        anyCharges: delivered === "Yes" ? anyCharges : "",
        amount: amount ? Number(amount) : undefined,
        freightChargesToTransporter: freightChargesToTransporter ? Number(freightChargesToTransporter) : undefined,
        chargeDescription,
        reason: delivered === "No" ? reason : "",
        expectedDeliveryDate: delivered === "No" ? expectedDeliveryDate : "",
        remarks,
      } as Record<string, string | number>);
      onSaved();
    } catch (err) {
      const detail = isAxiosError(err) ? err.response?.data?.error?.message : undefined;
      setError(detail ?? "Could not save.");
      setSaving(false);
    }
  }

  const showCharges = delivered === "No" || anyCharges === "Yes";

  return (
    <StageModalShell title="Delivery Form" tabLabel="Delivery Details" onClose={onClose}>
      <div style={{ padding: "28px var(--space)", overflowY: "auto", flex: 1 }}>
        <ToggleGroup label="Delivered" required value={delivered} onChange={setDelivered} options={[{ value: "Yes", label: "Yes" }, { value: "No", label: "No" }]} />

        {delivered === "Yes" && (
          <>
            <FileDropzone label="Goods Receipt Note (GRN) Attachment *" value={receivingAttachmentUrl} onChange={setReceivingAttachmentUrl} context={`grn_${transportId}`} />
            <ToggleGroup label="Any Charges" required value={anyCharges} onChange={setAnyCharges} options={[{ value: "Yes", label: "Yes" }, { value: "No", label: "No" }]} />
          </>
        )}

        {delivered === "No" && (
          <>
            <TextField label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)} />
            <TextField label="Expected Delivery Date" required type="date" value={expectedDeliveryDate} onChange={(e) => setExpectedDeliveryDate(e.target.value)} />
          </>
        )}

        {showCharges && (
          <>
            <TextField label="Amount" required type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <TextField label="Freight Charges to Transporter" required type="number" value={freightChargesToTransporter} onChange={(e) => setFreightChargesToTransporter(e.target.value)} />
            <TextField label="Charge Description" required value={chargeDescription} onChange={(e) => setChargeDescription(e.target.value)} />
          </>
        )}

        {delivered && <TextField label="Delivery Remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} />}

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
