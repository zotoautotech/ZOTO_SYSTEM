import { useState } from "react";
import { Modal } from "../../../components/Modal";
import { TextField } from "../../../components/form/TextField";
import { createCustomer } from "../../../lib/mastersApi";

interface AddNewCustomerModalProps {
  onClose: () => void;
  onCreated: (result: {
    custId: string;
    customerName: string;
    billingAddressLine1: string;
    billingState: string;
    billingPincode: string;
    billingCountry: string;
  }) => void;
}

export function AddNewCustomerModal({ onClose, onCreated }: AddNewCustomerModalProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    customerName: "",
    gstin: "",
    contactPersonName: "",
    contactNo: "",
    email: "",
    billingAddressLine1: "",
    billingState: "",
    billingPincode: "",
  });

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function handleSave() {
    if (!form.customerName || !form.billingAddressLine1 || !form.billingState || !form.billingPincode) {
      setError("Customer name and billing address are required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const result = await createCustomer(form);
      onCreated(result);
    } catch {
      setError("Could not save — check that the Customer Master sheet is shared with the service account (Editor)");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Add New Customer" onClose={onClose}>
      <TextField label="Customer Name" required value={form.customerName} onChange={set("customerName")} />
      <TextField label="GSTIN" value={form.gstin} onChange={set("gstin")} />
      <TextField label="Billing Address" required value={form.billingAddressLine1} onChange={set("billingAddressLine1")} />
      <TextField label="State" required value={form.billingState} onChange={set("billingState")} />
      <TextField label="Pin Code" required value={form.billingPincode} onChange={set("billingPincode")} />
      <TextField label="Contact Person Name" value={form.contactPersonName} onChange={set("contactPersonName")} />
      <TextField label="Contact No." value={form.contactNo} onChange={set("contactNo")} />
      <TextField label="Email" value={form.email} onChange={set("email")} />
      {error && <p style={{ color: "var(--color-error)", fontSize: 13 }}>{error}</p>}
      <button className="btn btn-primary" style={{ width: "100%" }} disabled={saving} onClick={handleSave}>
        {saving ? "Saving…" : "Save & Select"}
      </button>
    </Modal>
  );
}
