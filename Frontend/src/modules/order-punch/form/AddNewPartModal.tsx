import { useState } from "react";
import { Modal } from "../../../components/Modal";
import { TextField } from "../../../components/form/TextField";
import { createPart } from "../../../lib/mastersApi";

interface AddNewPartModalProps {
  onClose: () => void;
  onCreated: (result: {
    fgId: string;
    partName: string;
    partNo?: string;
    segment?: string;
    category?: string;
    unit?: string;
    price?: number;
  }) => void;
}

export function AddNewPartModal({ onClose, onCreated }: AddNewPartModalProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    partName: "",
    partNo: "",
    segment: "",
    category: "",
    unit: "NOS",
    price: "",
  });

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function handleSave() {
    if (!form.partName) {
      setError("Part name is required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const result = await createPart({
        ...form,
        price: form.price ? Number(form.price) : undefined,
      });
      onCreated(result);
    } catch {
      setError("Could not save — check that the FG Inventory sheet is shared with the service account (Editor)");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Add New Product" onClose={onClose}>
      <TextField label="Part Name" required value={form.partName} onChange={set("partName")} />
      <TextField label="Part No." value={form.partNo} onChange={set("partNo")} />
      <TextField label="Segment" value={form.segment} onChange={set("segment")} />
      <TextField label="Category" value={form.category} onChange={set("category")} />
      <TextField label="Unit" value={form.unit} onChange={set("unit")} />
      <TextField label="Price" type="number" value={form.price} onChange={set("price")} />
      {error && <p style={{ color: "var(--color-error)", fontSize: 13 }}>{error}</p>}
      <button className="btn btn-primary" style={{ width: "100%" }} disabled={saving} onClick={handleSave}>
        {saving ? "Saving…" : "Save & Select"}
      </button>
    </Modal>
  );
}
