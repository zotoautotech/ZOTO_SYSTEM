import { useState } from "react";
import { isAxiosError } from "axios";
import { uploadSaleOrderForm } from "../../lib/ordersApi";
import { TextField } from "../../components/form/TextField";
import { FileDropzone } from "../../components/form/FileDropzone";
import { useIsMobile } from "../../lib/responsive";

interface Props {
  orderId: string;
  onClose: () => void;
  onSaved: () => void;
}

export function SaleOrderUploadForm({ orderId, onClose, onSaved }: Props) {
  const isMobile = useIsMobile();
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
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(17, 17, 20, 0.5)",
        display: "flex",
        alignItems: isMobile ? "flex-start" : "center",
        justifyContent: "center",
        zIndex: 50,
        padding: isMobile ? 0 : 24,
      }}
      onClick={onClose}
    >
      <div
        className="card modal-in"
        style={{
          width: "min(560px, 100%)",
          height: isMobile ? "calc(100dvh - 34px)" : undefined,
          maxHeight: isMobile ? "calc(100dvh - 34px)" : "90vh",
          background: "var(--color-bg)",
          borderRadius: isMobile ? 0 : 18,
          boxShadow: "var(--shadow-lg)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: isMobile ? "28px var(--space) 12px" : "22px var(--space) 12px",
          }}
        >
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 600 }}>Sale Order Form</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              border: "none",
              background: "var(--color-bg-page)",
              fontSize: 16,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--color-text-muted)",
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: "8px var(--space) 0" }}>
          <div style={{ textAlign: "center", fontWeight: 600, fontSize: 14, color: "var(--color-primary)", paddingBottom: 10, borderBottom: "2px solid var(--color-primary)" }}>
            Sale Order Details
          </div>
        </div>

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
          />
          <TextField label="Sale Order Remarks" value={soRemarks} onChange={(e) => setSoRemarks(e.target.value)} />
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: isMobile ? "14px var(--space) 28px" : "14px var(--space)",
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
      </div>
    </div>
  );
}
