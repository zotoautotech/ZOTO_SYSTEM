import { useEffect, useState } from "react";
import { isAxiosError } from "axios";
import { useQuery } from "@tanstack/react-query";
import { TextField } from "../components/form/TextField";
import { useIsMobile } from "../lib/responsive";
import { useAuth } from "../lib/auth";
import { createTaxonomyRow, previewRmCategoryDdCode, previewPlainRandomId, type TaxonomyRow } from "./lib/npdApi";

interface Props {
  /** The Category already picked in the parent RmSkuForm — sent along in the create payload
   * and actually SAVED as this row's real `Category` (the backend keeps the doer's submitted
   * value now, not a dead-formula overwrite — see taxonomy.ts's rm-category-dd POST handler's
   * own comment for why), but still not shown as a field here: the real reference form's own
   * "RM ref Category DD Form" has no Category input at all — its equivalent auto-fill only
   * works via an AppSheet-only runtime mechanism this stateless backend can't replicate, so
   * this form fills the same role a different way (an explicit prop from the parent) while
   * keeping the same "doer never sees a Category field here" UI shape. */
  category: string;
  subCategoryRows: TaxonomyRow[];
  onClose: () => void;
  onSaved: (subCategory: string) => void;
}

/** "RM ref Category DD Form" — the nested "+ New" form opened from RmSkuForm.tsx's Sub
 * Category SearchableSelect, matching the real reference field-for-field (confirmed off the
 * user's own field-config screenshot, in this exact order): TIMESTAMP, AGAINST ID, Unique
 * ID, CODE, USEREMAIL, SUB CATEGORY, DUPLICACY — same shape/live-value approach as
 * RmCategoryForm.tsx (see that file's own doc comment for the reasoning behind each), just
 * with SUB CATEGORY as the one real input instead of CATEGORY, and no Category field shown
 * (see the `category` prop's own doc comment above). */
export function RmSubCategoryForm({ category, subCategoryRows, onClose, onSaved }: Props) {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const [subCategory, setSubCategory] = useState("");
  const [quantity, setQuantity] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Format-matching preview only — see RmCategoryForm.tsx's own doc comment for why (the real
  // live Unique ID values turned out to be plain random hex, not sequential like RMCAT0001).
  const [previewUniqueId] = useState(previewPlainRandomId);

  const { data: preview, isError: previewFailed } = useQuery({
    queryKey: ["npd", "taxonomy", "rm-category-dd", "preview"],
    queryFn: previewRmCategoryDdCode,
    retry: 1,
  });

  const duplicacy = subCategory.trim()
    ? subCategoryRows.filter((r) => (r["SUB CATEGORY"] ?? "").trim() === subCategory.trim()).length
    : 0;

  function canSave() {
    return !!subCategory.trim() && !saving;
  }

  async function handleSave() {
    if (!canSave()) return;
    setSaving(true);
    setError("");
    try {
      await createTaxonomyRow("rm-category-dd", {
        Category: category,
        "SUB CATEGORY": subCategory.trim(),
        ...(quantity.trim() ? { QUANTITY: quantity.trim() } : {}),
      });
      onSaved(subCategory.trim());
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
            RM ref Category DD Form
          </h2>
        </div>

        <div style={{ padding: "32px 24px", overflowY: "auto", flex: 1 }}>
          <TextField label="TIMESTAMP" value={now.toLocaleString()} disabled />
          <TextField label="AGAINST ID" value={preview?.againstId || "—"} disabled />
          <TextField label="Unique ID" value={previewUniqueId} disabled />
          <TextField label="CODE" value={preview ? preview.code : previewFailed ? "—" : "Loading…"} disabled />
          <TextField label="USEREMAIL" value={user?.employeeId ?? ""} disabled />
          <TextField
            label="SUB CATEGORY"
            required
            value={subCategory}
            onChange={(e) => setSubCategory(e.target.value)}
            placeholder="Type a sub category name…"
          />
          <TextField
            label="QUANTITY"
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="0"
          />
          <TextField label="DUPLICACY" value={String(duplicacy)} disabled />
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
