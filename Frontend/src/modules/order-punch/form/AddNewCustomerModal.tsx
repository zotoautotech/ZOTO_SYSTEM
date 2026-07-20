import { useState } from "react";
import { isAxiosError } from "axios";
import { useQueryClient } from "@tanstack/react-query";
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
  const queryClient = useQueryClient();
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

  function setContactNo(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
    setForm((f) => ({ ...f, contactNo: digits }));
  }

  async function handleSave() {
    if (!form.customerName || !form.billingAddressLine1 || !form.billingState || !form.billingPincode) {
      setError("Customer name and billing address are required");
      return;
    }
    if (form.contactNo && form.contactNo.length !== 10) {
      setError("Contact No. must be exactly 10 digits");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const result = await createCustomer(form);
      await queryClient.invalidateQueries({ queryKey: ["masters", "customers"] });
      onCreated(result);
    } catch (err) {
      const detail = isAxiosError(err) ? err.response?.data?.error?.message : undefined;
      setError(detail ? `Could not save — ${detail}` : "Could not save the customer");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Add New Customer" onClose={onClose}>
      <form autoComplete="off" onSubmit={(e) => e.preventDefault()}>
        <TextField
          label="Customer Name"
          required
          name="zoto-new-cust-name"
          autoComplete="off"
          value={form.customerName}
          onChange={set("customerName")}
        />
        <TextField label="GSTIN" name="zoto-new-cust-gstin" autoComplete="off" value={form.gstin} onChange={set("gstin")} />
        <TextField
          label="Billing Address"
          required
          name="zoto-new-cust-address"
          autoComplete="off"
          value={form.billingAddressLine1}
          onChange={set("billingAddressLine1")}
        />
        <TextField
          label="State"
          required
          name="zoto-new-cust-state"
          autoComplete="off"
          value={form.billingState}
          onChange={set("billingState")}
        />
        <TextField
          label="Pin Code"
          required
          name="zoto-new-cust-pincode"
          autoComplete="off"
          value={form.billingPincode}
          onChange={set("billingPincode")}
        />
        <TextField
          label="Contact Person Name"
          name="zoto-new-cust-contact-person"
          autoComplete="off"
          value={form.contactPersonName}
          onChange={set("contactPersonName")}
        />
        <TextField
          label="Contact No."
          name="zoto-new-cust-contact-no"
          autoComplete="off"
          type="tel"
          inputMode="numeric"
          maxLength={10}
          value={form.contactNo}
          onChange={setContactNo}
        />
        <TextField
          label="Email"
          name="zoto-new-cust-email"
          autoComplete="off"
          value={form.email}
          onChange={set("email")}
        />
        {error && <p className="field-error">{error}</p>}
        <button type="button" className="btn btn-primary" style={{ width: "100%" }} disabled={saving} onClick={handleSave}>
          {saving ? "Saving…" : "Save & Select"}
        </button>
      </form>
    </Modal>
  );
}
