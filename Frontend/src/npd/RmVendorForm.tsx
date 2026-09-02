import { useState } from "react";
import { isAxiosError } from "axios";
import { TextField } from "../components/form/TextField";
import { useIsMobile } from "../lib/responsive";
import { createTaxonomyRow } from "./lib/npdApi";

interface Props {
  onClose: () => void;
  onSaved: (vendorFirmName: string) => void;
}

/** Nested "+ New" form opened from RmSkuForm.tsx's Vendor Name field, connected to the real,
 * already-live "ZOTO/MASTER-VENDOR" spreadsheet (`vendor-master` taxonomy table — see
 * taxonomy.ts's own comment on that entry for the real headers/sequential-ID scheme). Only a
 * handful of that sheet's 26 real columns are exposed here — the ones a doer creating a vendor
 * from this flow would plausibly know — matching the same "don't build a field per column"
 * restraint RmCategoryForm/RmSubCategoryForm/RmPaintForm already use. Vendor Id is minted
 * server-side as the next sequential VEND-000N (matching the sheet's own real existing rows),
 * so unlike those three sibling forms there's no live-preview value to show here — the ID is
 * simply "Generated on Save". */
export function RmVendorForm({ onClose, onSaved }: Props) {
  const isMobile = useIsMobile();
  const [vendorFirmName, setVendorFirmName] = useState("");
  const [contactPersonName, setContactPersonName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function canSave() {
    return !!vendorFirmName.trim() && !saving;
  }

  async function handleSave() {
    if (!canSave()) return;
    setSaving(true);
    setError("");
    try {
      await createTaxonomyRow("vendor-master", {
        "Vendor Firm Name": vendorFirmName.trim(),
        Status: "NEW",
        "Contact Person Name": contactPersonName.trim(),
        Email: email.trim(),
        Mobile: mobile.trim(),
      });
      onSaved(vendorFirmName.trim());
    } catch (err) {
      const detail = isAxiosError(err) ? err.response?.data?.error?.message : undefined;
      setError(detail ?? "Could not save — please try again.");
      setSaving(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", justifyContent: "flex-end" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }} />
      <div
        style={{
          position: "relative",
          width: isMobile ? "100%" : "min(30vw, 560px)",
          height: "100%",
          background: "#fff",
          boxShadow: "-4px 0 24px rgba(0,0,0,0.15)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            height: 64,
            flexShrink: 0,
            padding: "0 24px",
            borderBottom: "1px solid #E5E7EB",
          }}
        >
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 20,
              height: 20,
              border: "none",
              background: "transparent",
              color: "#6B7280",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              lineHeight: 1,
              flexShrink: 0,
            }}
          >
            ✕
          </button>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#1A1A1A", whiteSpace: "nowrap" }}>
            Vendor Master Form
          </h2>
        </div>

        <div style={{ padding: "32px 24px", overflowY: "auto", flex: 1 }}>
          <TextField label="Vendor Id" value="Generated on Save" disabled />
          <TextField
            label="Vendor Firm Name"
            required
            value={vendorFirmName}
            onChange={(e) => setVendorFirmName(e.target.value)}
            placeholder="Type the vendor's firm name…"
          />
          <TextField
            label="Contact Person Name"
            value={contactPersonName}
            onChange={(e) => setContactPersonName(e.target.value)}
            placeholder="Optional"
          />
          <TextField label="Email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Optional" />
          <TextField label="Mobile" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="Optional" />
          {error && <p style={{ color: "#DC2626", fontSize: 13, marginTop: 8 }}>{error}</p>}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            height: 64,
            flexShrink: 0,
            padding: "0 24px",
            borderTop: "1px solid #E5E7EB",
            background: "#fff",
          }}
        >
          <button
            onClick={onClose}
            disabled={saving}
            style={{
              padding: "8px 20px",
              borderRadius: 6,
              border: "1px solid #D1D5DB",
              background: "#fff",
              color: "#1A1A1A",
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave()}
            style={{
              padding: "8px 20px",
              borderRadius: 6,
              border: "none",
              background: "#C0392B",
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              cursor: canSave() ? "pointer" : "default",
              opacity: canSave() ? 1 : 0.6,
            }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
