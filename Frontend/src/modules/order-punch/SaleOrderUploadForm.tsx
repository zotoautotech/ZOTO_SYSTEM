import { useState } from "react";
import { isAxiosError } from "axios";
import { uploadSaleOrderForm } from "../../lib/ordersApi";
import { TextField } from "../../components/form/TextField";
import { FileDropzone } from "../../components/form/FileDropzone";
import { FormModal } from "../../components/form/FormModal";

interface Props {
  orderId: string;
  onClose: () => void;
  onSaved: () => void;
}

export function SaleOrderUploadForm({ orderId, onClose, onSaved }: Props) {
  const [soNo, setSoNo] = useState("");
  const [soDate, setSoDate] = useState(new Date().toISOString().slice(0, 10));
  const [soAttachmentUrl, setSoAttachmentUrl] = useState("");
  const [soRemarks, setSoRemarks] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!soNo.trim()) return setError("Sale Order No. is required");
    if (!soDate) return setError("Sale Order Date is required");
    if (!soAttachmentUrl.trim()) return setError("Sale Order Attachment is required");

    setSaving(true);
    setError("");
    try {
      await uploadSaleOrderForm(orderId, { soNo, soDate, soAttachmentUrl, soRemarks });
      onSaved();
    } catch (err) {
      const detail = isAxiosError(err) ? err.response?.data?.error?.message : undefined;
      setError(detail ? `Could not save — ${detail}` : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormModal title="Sale Order Form" onClose={onClose} size="small" sectionLabel="Sale Order Details">
        <div style={{ padding: "20px var(--space)", overflowY: "auto", flex: 1 }}>
          {error && (
            <div className="error-banner" style={{ marginBottom: 16 }}>
              ⚠ {error}
            </div>
          )}
          <TextField label="Sale Order No." required value={soNo} onChange={(e) => setSoNo(e.target.value)} />
          <TextField label="Sale Order Date" required type="date" value={soDate} onChange={(e) => setSoDate(e.target.value)} />
          <FileDropzone
            label="Sale Order Attachment *"
            value={soAttachmentUrl}
            onChange={setSoAttachmentUrl}
            context={`SaleOrder_${orderId}`}
          />
          <TextField label="Sale Order Remarks" value={soRemarks} onChange={(e) => setSoRemarks(e.target.value)} />
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "14px var(--space)",
            borderTop: "1px solid var(--color-border)",
            background: "var(--color-bg-page)",
          }}
        >
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
    </FormModal>
  );
}
