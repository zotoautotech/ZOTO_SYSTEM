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

/** Matches the reference "Upload Tax Invoice Form" (docs/04-UIUX-BRIEF.md §9.5). */
export function TaxInvoiceForm({ transportId, onClose, onSaved }: Props) {
  const isMobile = useIsMobile();
  const [taxInvoiceNo, setTaxInvoiceNo] = useState("");
  const [taxInvoiceDate, setTaxInvoiceDate] = useState("");
  const [taxInvoiceAttachmentUrl, setTaxInvoiceAttachmentUrl] = useState("");
  const [remarks, setRemarks] = useState("");
  const [eWayBillApplicable, setEWayBillApplicable] = useState<"Yes" | "No" | "">("");
  const [eWayBillNo, setEWayBillNo] = useState("");
  const [eWayBillDate, setEWayBillDate] = useState("");
  const [eWayBillAttachmentUrl, setEWayBillAttachmentUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function canSave() {
    return !!taxInvoiceNo.trim() && !!taxInvoiceDate;
  }

  async function handleSave() {
    if (!canSave() || saving) return;
    setSaving(true);
    setError("");
    try {
      await submitTripStage(transportId, "tax-invoice", {
        taxInvoiceNo,
        taxInvoiceDate,
        taxInvoiceAttachmentUrl,
        remarks,
        eWayBillApplicable,
        eWayBillNo: eWayBillApplicable === "Yes" ? eWayBillNo : "",
        eWayBillDate: eWayBillApplicable === "Yes" ? eWayBillDate : "",
        eWayBillAttachmentUrl: eWayBillApplicable === "Yes" ? eWayBillAttachmentUrl : "",
      });
      onSaved();
    } catch (err) {
      const detail = isAxiosError(err) ? err.response?.data?.error?.message : undefined;
      setError(detail ?? "Could not save.");
      setSaving(false);
    }
  }

  return (
    <StageModalShell title="Upload Tax Invoice Form" tabLabel="Tax Invoice Details" onClose={onClose}>
      <div style={{ padding: "28px var(--space)", overflowY: "auto", flex: 1 }}>
        <TextField label="Tax Invoice No." required value={taxInvoiceNo} onChange={(e) => setTaxInvoiceNo(e.target.value)} />
        <TextField label="Tax Invoice Date" required type="date" value={taxInvoiceDate} onChange={(e) => setTaxInvoiceDate(e.target.value)} />
        <FileDropzone label="Tax Invoice Attachment" value={taxInvoiceAttachmentUrl} onChange={setTaxInvoiceAttachmentUrl} context={`tax-invoice_${transportId}`} />
        <TextField label="Tax Invoice Remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        <ToggleGroup label="E-Way Bill Applicable" required value={eWayBillApplicable} onChange={setEWayBillApplicable} options={[{ value: "Yes", label: "Yes" }, { value: "No", label: "No" }]} />
        {eWayBillApplicable === "Yes" && (
          <>
            <TextField label="E-Way Bill No." value={eWayBillNo} onChange={(e) => setEWayBillNo(e.target.value)} />
            <TextField label="E-Way Bill Date" type="date" value={eWayBillDate} onChange={(e) => setEWayBillDate(e.target.value)} />
            <FileDropzone label="E-Way Bill Attachment" value={eWayBillAttachmentUrl} onChange={setEWayBillAttachmentUrl} context={`eway-bill_${transportId}`} />
          </>
        )}
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
