import { useState } from "react";
import { isAxiosError } from "axios";
import { FormModal } from "../components/form/FormModal";
import { TextField } from "../components/form/TextField";
import { SearchableSelect, type SelectOption } from "../components/form/SearchableSelect";
import { useIsMobile } from "../lib/responsive";
import { createKyc, type RaiseRequestRecord } from "./lib/npdApi";

interface Props {
  raiseRequests: RaiseRequestRecord[];
  onClose: () => void;
  onSaved: () => void;
}

/** Customer KYC (build-prompt §5.5 step 2) — GSTIN/PAN/contact/documents. Optionally linked to
 * a Raise Request so its financial terms (Credit Days/Grace Period/TDS-TCS) carry over onto the
 * published Customer Master row at approval time (see customer.ts's /kyc/:id/decide). */
export function KycForm({ raiseRequests, onClose, onSaved }: Props) {
  const isMobile = useIsMobile();
  const [requestId, setRequestId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [gstin, setGstin] = useState("");
  const [pan, setPan] = useState("");
  const [nameOnPan, setNameOnPan] = useState("");
  const [registeredEmail, setRegisteredEmail] = useState("");
  const [registeredContactNo, setRegisteredContactNo] = useState("");
  const [firmType, setFirmType] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const requestOptions: SelectOption[] = raiseRequests
    .filter((r) => r.Status === "Pending")
    .map((r) => ({ value: r["Request ID"], label: `${r["Request ID"]} — ${r["Customer Name"]}` }));

  function canSave() {
    return customerName.trim() !== "";
  }

  async function handleSave() {
    if (!canSave() || saving) return;
    setSaving(true);
    setError("");
    try {
      await createKyc({
        requestId: requestId || undefined,
        customerName,
        gstin: gstin || undefined,
        pan: pan || undefined,
        nameOnPan: nameOnPan || undefined,
        registeredEmail: registeredEmail || undefined,
        registeredContactNo: registeredContactNo || undefined,
        firmType: firmType || undefined,
      });
      onSaved();
    } catch (err) {
      const detail = isAxiosError(err) ? err.response?.data?.error?.message : undefined;
      setError(detail ?? "Could not save — please try again.");
      setSaving(false);
    }
  }

  return (
    <FormModal title="New Customer KYC" onClose={onClose} size="standard" sectionLabel="KYC Details">
      <div style={{ padding: "28px var(--space)", overflowY: "auto", flex: 1 }}>
        <SearchableSelect
          label="Linked Raise Request (optional)"
          value={requestId}
          onChange={(value, option) => {
            setRequestId(value);
            const req = raiseRequests.find((r) => r["Request ID"] === value);
            if (req && !customerName) setCustomerName(req["Customer Name"]);
            void option;
          }}
          options={requestOptions}
          placeholder="Search raise request…"
        />
        <TextField label="Customer Name" required value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
        <TextField label="GSTIN" value={gstin} onChange={(e) => setGstin(e.target.value)} />
        <TextField label="PAN" value={pan} onChange={(e) => setPan(e.target.value)} />
        <TextField label="Name on PAN" value={nameOnPan} onChange={(e) => setNameOnPan(e.target.value)} />
        <TextField label="Registered Email" value={registeredEmail} onChange={(e) => setRegisteredEmail(e.target.value)} />
        <TextField label="Registered Contact No." value={registeredContactNo} onChange={(e) => setRegisteredContactNo(e.target.value)} />
        <TextField label="Firm Type" value={firmType} onChange={(e) => setFirmType(e.target.value)} />
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
