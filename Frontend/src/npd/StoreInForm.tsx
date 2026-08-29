import { useState } from "react";
import { isAxiosError } from "axios";
import { useQuery } from "@tanstack/react-query";
import { FormModal } from "../components/form/FormModal";
import { TextField } from "../components/form/TextField";
import { SearchableSelect, type SelectOption } from "../components/form/SearchableSelect";
import { FileDropzone } from "../components/form/FileDropzone";
import { useIsMobile } from "../lib/responsive";
import { listTaxonomyRows, createStoreIn } from "./lib/npdApi";

interface Props {
  invoiceId: string;
  onClose: () => void;
  onSaved: () => void;
}

/** Store In (build-prompt §5.6 step 2) — goods receipt against one Tax Invoice, with a QC
 * decision and weight-check image before the receipt is recorded. No stock ledger update yet
 * (MASTER OF FG INVENTORY / WIP MASTER are Sprint 6) — this just records the receipt event. */
export function StoreInForm({ invoiceId, onClose, onSaved }: Props) {
  const isMobile = useIsMobile();
  const [rmId, setRmId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [qcStatus, setQcStatus] = useState<"Passed" | "Failed">("Passed");
  const [weightCheckImage, setWeightCheckImage] = useState("");
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const { data: rmRows = [] } = useQuery({
    queryKey: ["npd", "taxonomy", "rows", "rm-sku"],
    queryFn: () => listTaxonomyRows("rm-sku"),
  });

  const rmOptions: SelectOption[] = rmRows.map((r) => ({
    value: r["ID'S"],
    label: `${r["PART NO."] || r["ID'S"]} — ${r.Category} / ${r["Sub Category"]}`,
  }));

  function canSave() {
    return !!rmId && Number(quantity) > 0;
  }

  async function handleSave() {
    if (!canSave() || saving) return;
    setSaving(true);
    setError("");
    try {
      await createStoreIn({
        invoiceId,
        rmId,
        quantity: Number(quantity),
        qcStatus,
        weightCheckImage: weightCheckImage || undefined,
        remarks: remarks || undefined,
      });
      onSaved();
    } catch (err) {
      const detail = isAxiosError(err) ? err.response?.data?.error?.message : undefined;
      setError(detail ?? "Could not save — please try again.");
      setSaving(false);
    }
  }

  return (
    <FormModal title={`Store In — ${invoiceId}`} onClose={onClose} size="standard" sectionLabel="Goods Receipt">
      <div style={{ padding: "28px var(--space)", overflowY: "auto", flex: 1 }}>
        <SearchableSelect label="RM SKU" required value={rmId} onChange={(v) => setRmId(v)} options={rmOptions} placeholder="Search RM SKU…" />
        <TextField label="Quantity" required type="number" min={0} value={quantity} onChange={(e) => setQuantity(e.target.value)} />

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: "block", fontSize: 14, marginBottom: 8 }}>
            QC Status <span style={{ color: "var(--color-error)" }}>*</span>
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            {(["Passed", "Failed"] as const).map((s) => (
              <button
                key={s}
                className="btn"
                onClick={() => setQcStatus(s)}
                style={{ flex: 1, background: qcStatus === s ? "var(--color-primary)" : undefined, color: qcStatus === s ? "#fff" : undefined }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <FileDropzone label="Weight Check Image" value={weightCheckImage} onChange={setWeightCheckImage} context={invoiceId} />
        <TextField label="Remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
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
