import { useState } from "react";
import { isAxiosError } from "axios";
import { useQueryClient } from "@tanstack/react-query";
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
  const queryClient = useQueryClient();
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
      await queryClient.invalidateQueries({ queryKey: ["masters", "goods"] });
      onCreated(result);
    } catch (err) {
      const detail = isAxiosError(err) ? err.response?.data?.error?.message : undefined;
      setError(detail ? `Could not save — ${detail}` : "Could not save the product");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Add New Product" onClose={onClose}>
      <form autoComplete="off" onSubmit={(e) => e.preventDefault()}>
        <TextField
          label="Part Name"
          required
          name="zoto-new-part-name"
          autoComplete="off"
          value={form.partName}
          onChange={set("partName")}
        />
        <TextField label="Part No." name="zoto-new-part-no" autoComplete="off" value={form.partNo} onChange={set("partNo")} />
        <TextField label="Segment" name="zoto-new-part-segment" autoComplete="off" value={form.segment} onChange={set("segment")} />
        <TextField label="Category" name="zoto-new-part-category" autoComplete="off" value={form.category} onChange={set("category")} />
        <TextField label="Unit" name="zoto-new-part-unit" autoComplete="off" value={form.unit} onChange={set("unit")} />
        <TextField
          label="Price"
          type="number"
          name="zoto-new-part-price"
          autoComplete="off"
          value={form.price}
          onChange={set("price")}
        />
        {error && <p className="field-error">{error}</p>}
        <button type="button" className="btn btn-primary" style={{ width: "100%" }} disabled={saving} onClick={handleSave}>
          {saving ? "Saving…" : "Save & Select"}
        </button>
      </form>
    </Modal>
  );
}
