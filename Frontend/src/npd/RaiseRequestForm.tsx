import { useState } from "react";
import { isAxiosError } from "axios";
import { FormModal } from "../components/form/FormModal";
import { TextField } from "../components/form/TextField";
import { useIsMobile } from "../lib/responsive";
import { createRaiseRequest } from "./lib/npdApi";

interface Props {
  onClose: () => void;
  onSaved: () => void;
}

/** New Raise Request (build-prompt §5.5 step 1) — new-customer basics + commercial terms. */
export function RaiseRequestForm({ onClose, onSaved }: Props) {
  const isMobile = useIsMobile();
  const [customerName, setCustomerName] = useState("");
  const [contactNo, setContactNo] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [creditDays, setCreditDays] = useState("");
  const [gracePeriod, setGracePeriod] = useState("");
  const [tdsTcs, setTdsTcs] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function canSave() {
    return customerName.trim() !== "";
  }

  async function handleSave() {
    if (!canSave() || saving) return;
    setSaving(true);
    setError("");
    try {
      await createRaiseRequest({
        customerName,
        contactNo: contactNo || undefined,
        email: email || undefined,
        address: address || undefined,
        creditDays: creditDays ? Number(creditDays) : undefined,
        gracePeriod: gracePeriod ? Number(gracePeriod) : undefined,
        tdsTcsApplicable: tdsTcs || undefined,
      });
      onSaved();
    } catch (err) {
      const detail = isAxiosError(err) ? err.response?.data?.error?.message : undefined;
      setError(detail ?? "Could not save — please try again.");
      setSaving(false);
    }
  }

  return (
    <FormModal title="New Raise Request" onClose={onClose} size="standard" sectionLabel="Customer Details">
      <div style={{ padding: "28px var(--space)", overflowY: "auto", flex: 1 }}>
        <TextField label="Customer Name" required value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
        <TextField label="Contact No." value={contactNo} onChange={(e) => setContactNo(e.target.value)} />
        <TextField label="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <TextField label="Address" value={address} onChange={(e) => setAddress(e.target.value)} />
        <TextField label="Credit Days" type="number" min={0} value={creditDays} onChange={(e) => setCreditDays(e.target.value)} />
        <TextField label="Grace Period (Days)" type="number" min={0} value={gracePeriod} onChange={(e) => setGracePeriod(e.target.value)} />
        <TextField label="TDS/TCS Applicable" value={tdsTcs} onChange={(e) => setTdsTcs(e.target.value)} />
        {error && <p style={{ color: "var(--color-error)", fontSize: 13, marginTop: 8 }}>{error}</p>}
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
        <button className="btn" onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={handleSave} disabled={!canSave() || saving}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </FormModal>
  );
}
