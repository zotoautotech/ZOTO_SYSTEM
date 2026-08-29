import { useState } from "react";
import { isAxiosError } from "axios";
import { useQuery } from "@tanstack/react-query";
import { FormModal } from "../components/form/FormModal";
import { TextField } from "../components/form/TextField";
import { SearchableSelect, type SelectOption } from "../components/form/SearchableSelect";
import { useIsMobile } from "../lib/responsive";
import { listTaxonomyRows, createTaxInvoice } from "./lib/npdApi";

interface Props {
  onClose: () => void;
  onSaved: () => void;
}

/** Upload Tax Invoice (build-prompt §5.6 step 1) — vendor invoice + GST breakdown. Total
 * Amount Inc Tax is computed server-side (never trust client math, see purchase.ts), shown
 * here as a live preview only. */
export function TaxInvoiceForm({ onClose, onSaved }: Props) {
  const isMobile = useIsMobile();
  const [vendorId, setVendorId] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [basicAmount, setBasicAmount] = useState("");
  const [cgst, setCgst] = useState("");
  const [sgst, setSgst] = useState("");
  const [igst, setIgst] = useState("");
  const [tds, setTds] = useState("");
  const [discount, setDiscount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const { data: vendors = [] } = useQuery({
    queryKey: ["npd", "taxonomy", "rows", "vendor-master"],
    queryFn: () => listTaxonomyRows("vendor-master"),
  });

  const vendorOptions: SelectOption[] = vendors.map((v) => ({ value: v["Vendor ID"], label: v["Vendor Name"] }));

  const preview =
    (Number(basicAmount) || 0) +
    (Number(cgst) || 0) +
    (Number(sgst) || 0) +
    (Number(igst) || 0) -
    (Number(tds) || 0) -
    (Number(discount) || 0);

  function canSave() {
    return !!vendorId && invoiceNo.trim() !== "" && Number(basicAmount) > 0;
  }

  async function handleSave() {
    if (!canSave() || saving) return;
    setSaving(true);
    setError("");
    try {
      await createTaxInvoice({
        vendorId,
        invoiceNo,
        invoiceDate: invoiceDate || undefined,
        basicAmount: Number(basicAmount),
        cgst: cgst ? Number(cgst) : undefined,
        sgst: sgst ? Number(sgst) : undefined,
        igst: igst ? Number(igst) : undefined,
        tds: tds ? Number(tds) : undefined,
        discount: discount ? Number(discount) : undefined,
      });
      onSaved();
    } catch (err) {
      const detail = isAxiosError(err) ? err.response?.data?.error?.message : undefined;
      setError(detail ?? "Could not save — please try again.");
      setSaving(false);
    }
  }

  return (
    <FormModal title="Upload Tax Invoice" onClose={onClose} size="standard" sectionLabel="Invoice Details">
      <div style={{ padding: "28px var(--space)", overflowY: "auto", flex: 1 }}>
        <SearchableSelect label="Vendor" required value={vendorId} onChange={(v) => setVendorId(v)} options={vendorOptions} placeholder="Search vendor…" />
        <TextField label="Invoice No." required value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
        <TextField label="Invoice Date" type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
        <TextField label="Basic Amount" required type="number" min={0} value={basicAmount} onChange={(e) => setBasicAmount(e.target.value)} />
        <TextField label="CGST" type="number" min={0} value={cgst} onChange={(e) => setCgst(e.target.value)} />
        <TextField label="SGST" type="number" min={0} value={sgst} onChange={(e) => setSgst(e.target.value)} />
        <TextField label="IGST" type="number" min={0} value={igst} onChange={(e) => setIgst(e.target.value)} />
        <TextField label="TDS" type="number" min={0} value={tds} onChange={(e) => setTds(e.target.value)} />
        <TextField label="Discount" type="number" min={0} value={discount} onChange={(e) => setDiscount(e.target.value)} />
        <p className="text-muted" style={{ fontSize: 13 }}>
          Total Amount Inc. Tax (preview, computed server-side on save): <strong>{preview.toFixed(2)}</strong>
        </p>
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
