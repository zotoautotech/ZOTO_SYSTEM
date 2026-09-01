import { useEffect, useState } from "react";
import { isAxiosError } from "axios";
import { useQuery } from "@tanstack/react-query";
import { TextField } from "../components/form/TextField";
import { useIsMobile } from "../lib/responsive";
import { useAuth } from "../lib/auth";
import { createTaxonomyRow, previewRmCategoryCode, previewPlainRandomId, type TaxonomyRow } from "./lib/npdApi";

interface Props {
  categoryRows: TaxonomyRow[];
  onClose: () => void;
  onSaved: (category: string) => void;
}

/** "RM ref Category Form" — the nested "+ New" form opened from RmSkuForm.tsx's Category
 * SearchableSelect (its `onAddNew`), matching the real legacy AppSheet reference field-for-
 * field. TIMESTAMP/USEREMAIL/Unique ID/Against id/CODE/DUPLICACY are all real App Formula
 * columns on the live `RM ref Category` tab, server-computed on save
 * (`Backend/src/routes/npd/taxonomy.ts`'s `rm-category` POST handler; see
 * `services/npdPartCode.ts`'s `countCategoryDuplicates()`/`nextAgainstId()`/
 * `nextCategoryCode()` doc comments) — but every one now shows a real LIVE value instead of
 * a "Generated on Save" placeholder, matching the reference's own live-updating preview:
 * - TIMESTAMP: a ticking clock (updates every second while the form is open).
 * - USEREMAIL: this app has no email field on doers (Employee Id + Password login, see
 *   CLAUDE.md's Auth section) — shows the logged-in doer's Employee Id instead, the same
 *   substitution this app already makes everywhere an "email" concept would otherwise apply.
 * - CODE / Against id: real previews from `GET /npd/taxonomy/rm-category/preview` — a
 *   read-only call to the exact same `nextCategoryCode()`/`nextAgainstId()` helpers the real
 *   POST handler uses, so what's shown here is genuinely what would be saved (barring a race
 *   with another doer creating a category in between).
 * - DUPLICACY: computed live client-side from `categoryRows` (passed down from RmSkuForm,
 *   already loaded there) — a trimmed-equality count against whatever CATEGORY is currently
 *   typed, recomputing on every keystroke, mirroring the real formula exactly.
 * - Unique ID: a format-matching preview (`previewPlainRandomId()` in `lib/npdApi.ts`) — a
 *   plain 8-hex-char string, no prefix/dash, matching the live sheet's own real `Unique ID`
 *   values exactly in shape (confirmed directly against real saved rows — `800ecd70`,
 *   `f6db8404`, …). Two wrong assumptions were corrected getting here: first a cosmetic
 *   random-hex placeholder that didn't match the real backend's ID scheme at all, then a
 *   "real next sequential value" preview built on the assumption `Unique ID` followed a
 *   max+1 pattern like `RMCAT0001` — the user showed the actual live values, which are
 *   neither of those, so the BACKEND generator itself was switched to match
 *   (`nextPlainRandomId()` in `services/ids.ts`) and this preview simplified to just mirror
 *   its format rather than trying to predict an exact value a collision-checked random
 *   generator can't be predicted anyway. */
export function RmCategoryForm({ categoryRows, onClose, onSaved }: Props) {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const [category, setCategory] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Format-matching preview only — see this file's module doc comment for why this isn't
  // trying to predict the exact real value.
  const [previewUniqueId] = useState(previewPlainRandomId);

  const { data: preview, isError: previewFailed } = useQuery({
    queryKey: ["npd", "taxonomy", "rm-category", "preview"],
    queryFn: previewRmCategoryCode,
    retry: 1,
  });

  const duplicacy = category.trim()
    ? categoryRows.filter((r) => (r.CATEGORY ?? "").trim() === category.trim()).length
    : 0;

  function canSave() {
    return !!category.trim() && !saving;
  }

  async function handleSave() {
    if (!canSave()) return;
    setSaving(true);
    setError("");
    try {
      await createTaxonomyRow("rm-category", { CATEGORY: category.trim() });
      onSaved(category.trim());
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
            RM ref Category Form
          </h2>
        </div>

        <div style={{ padding: "32px 24px", overflowY: "auto", flex: 1 }}>
          <TextField label="TIMESTAMP" value={now.toLocaleString()} disabled />
          <TextField label="USEREMAIL" value={user?.employeeId ?? ""} disabled />
          <TextField label="Unique ID" value={previewUniqueId} disabled />
          <TextField label="Against id" value={preview?.againstId || "—"} disabled />
          <TextField label="CODE" value={preview ? preview.code : previewFailed ? "—" : "Loading…"} disabled />
          <TextField
            label="CATEGORY"
            required
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Type a category name…"
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
