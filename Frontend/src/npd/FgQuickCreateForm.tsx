import { useEffect, useState } from "react";
import { isAxiosError } from "axios";
import { useQuery } from "@tanstack/react-query";
import { TextField } from "../components/form/TextField";
import { useIsMobile } from "../lib/responsive";
import { useAuth } from "../lib/auth";
import {
  createTaxonomyRow,
  previewFgCategoryAgainstId,
  previewFgCategoryDdCode,
  previewFgBrandCode,
  previewFgStandardPart,
  previewPlainRandomId,
  type TaxonomyRow,
} from "./lib/npdApi";

type Kind = "segment" | "category" | "sub-category" | "brand" | "standard-part";

interface Props {
  kind: Kind;
  /** Required for kind "sub-category"/"standard-part" — the Category already picked in the
   * parent form, written straight through as the new row's own required Category field. */
  category?: string;
  /** Required for kind "sub-category"/"standard-part" — same idea, the parent's picked
   * Segment. */
  segment?: string;
  /** Required for kind "standard-part" — the parent's picked Sub Category. */
  subCategory?: string;
  /** Only used for kind "sub-category" — the parent's already-loaded fg-category-dd rows,
   * for the live DUPLICACY preview below (no extra network round trip). */
  subCategoryRows?: TaxonomyRow[];
  /** Only used for kind "brand" — the parent's already-loaded fg-paint rows, same DUPLICACY-
   * preview reasoning. */
  brandRows?: TaxonomyRow[];
  /** Only used for kind "standard-part" — the parent's already-loaded fg-sub-sub-parts rows,
   * same DUPLICACY-preview reasoning. */
  standardPartRows?: TaxonomyRow[];
  onClose: () => void;
  onSaved: (value: string) => void;
}

const CONFIG: Record<Kind, { title: string; tableKey: string; fieldKey: string; label: string; placeholder: string }> = {
  segment: { title: "FG ref Segment Form", tableKey: "fg-segment", fieldKey: "SEGMENT", label: "SEGMENT", placeholder: "Type a segment name…" },
  category: { title: "FG ref Category Form", tableKey: "fg-category", fieldKey: "CATEGORY", label: "CATEGORY", placeholder: "Type a category name…" },
  "sub-category": { title: "FG ref Category DD Form", tableKey: "fg-category-dd", fieldKey: "SUB CATEGORY", label: "SUB CATEGORY", placeholder: "Type a sub category name…" },
  brand: { title: "FG ref Brand Form", tableKey: "fg-paint", fieldKey: "Brand Description", label: "Brand Description", placeholder: "Type a brand description…" },
  "standard-part": { title: "FG Sub sub parts Form", tableKey: "fg-sub-sub-parts", fieldKey: "STANDARD", label: "STANDARD", placeholder: "Type a standard part name…" },
};

/** One shared "+ New" nested panel for Segment/Category/Sub Category/Brand/Standard Part,
 * opened from `FgSkuForm.tsx`'s matching `SearchableSelect`s — per the user's explicit
 * requests, matching the same inline-create pattern `RmSkuForm.tsx` already uses, collapsed
 * into one parameterized component instead of five near-identical files.
 *
 * **Live-preview fields per kind**, all matching real App Formulas the user pasted directly:
 * - `segment`: TIMESTAMP/USEREMAIL/Unique ID only — `FG ref Segment` genuinely has no computed
 *   columns on the live sheet at all.
 * - `category`: adds `Against id` (dead pointer, same as every other AGAINST ID in this app).
 * - `sub-category`: adds `Against id` + a real computed CODE + client-computed DUPLICACY
 *   (scoped to SEGMENT+Category+SUB CATEGORY).
 * - `brand`: adds a real computed CODE (`previewFgBrandCode()`) + client-computed DUPLICACY
 *   (scoped to Brand Description) — DUPLICACY is never written to the sheet (no such column
 *   exists on `FG ref Brand`, confirmed live; see `countFgBrandDuplicates()`'s own doc
 *   comment), preview-only.
 * - `standard-part`: adds `Against id` (dead pointer) + a real computed CODE (an Alphabet
 *   `SR NO.` lookup against the doer's own typed value — `SR NO.` holds real manufacturing-
 *   stage names, `CASTED`/`MACHINED`/`FINISHED`, confirmed live, so this resolves for real
 *   when STANDARD is typed as one of those; see `nextFgStandardPartCode()`'s own doc comment)
 *   + a real computed KEY
 *   (`fgStandardPartKey()`, plain SEGMENT+Category+SUB CATEGORY+STANDARD concatenation) +
 *   client-computed DUPLICACY (scoped to that KEY) — also never written to the sheet (no
 *   DUPLICACY column on `FG Sub sub parts` either). */
export function FgQuickCreateForm({
  kind,
  category,
  segment,
  subCategory,
  subCategoryRows = [],
  brandRows = [],
  standardPartRows = [],
  onClose,
  onSaved,
}: Props) {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const cfg = CONFIG[kind];
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Format-matching preview only, not a predicted real value — see RmCategoryForm.tsx's own
  // doc comment for why (the real live Unique ID values are plain random hex, not sequential).
  const [previewUniqueId] = useState(previewPlainRandomId);

  const { data: categoryPreview, isError: categoryPreviewFailed } = useQuery({
    queryKey: ["npd", "taxonomy", "fg-category", "preview"],
    queryFn: previewFgCategoryAgainstId,
    enabled: kind === "category",
    retry: 1,
  });
  const { data: subCategoryPreview, isError: subCategoryPreviewFailed } = useQuery({
    queryKey: ["npd", "taxonomy", "fg-category-dd", "preview"],
    queryFn: previewFgCategoryDdCode,
    enabled: kind === "sub-category",
    retry: 1,
  });
  const { data: brandPreview, isError: brandPreviewFailed } = useQuery({
    queryKey: ["npd", "taxonomy", "fg-paint", "preview"],
    queryFn: previewFgBrandCode,
    enabled: kind === "brand",
    retry: 1,
  });
  // Refetches as `value` (the doer's typed STANDARD text) changes — this is the one preview
  // in this app whose CODE genuinely depends on the not-yet-saved row's own typed field, not
  // just already-existing sheet data.
  const { data: standardPartPreview, isError: standardPartPreviewFailed } = useQuery({
    queryKey: ["npd", "taxonomy", "fg-sub-sub-parts", "preview", value],
    queryFn: () => previewFgStandardPart(value),
    enabled: kind === "standard-part",
    retry: 1,
  });

  const subCategoryDuplicacy =
    kind === "sub-category" && segment && category && value.trim()
      ? subCategoryRows.filter(
          (r) =>
            (r.SEGMENT ?? "").trim() === segment.trim() &&
            (r.Category ?? "").trim() === category.trim() &&
            (r["SUB CATEGORY"] ?? "").trim() === value.trim()
        ).length
      : 0;

  const brandDuplicacy =
    kind === "brand" && value.trim()
      ? brandRows.filter((r) => (r["Brand Description"] ?? "").trim() === value.trim()).length
      : 0;

  // Shows progressively as soon as Segment/Category/Sub Category are known — same "grows as
  // fields are picked" behavior RM SKU's own PART NO. preview has — not gated on STANDARD
  // having been typed yet (that was the bug: KEY/CODE looked frozen at "—" even after typing,
  // because this used to require `value.trim()` before showing anything at all).
  const standardPartKeyPreview =
    kind === "standard-part" && segment && category && subCategory
      ? `${segment.trim()}${category.trim()}${subCategory.trim()}${value.trim()}`
      : "";
  const standardPartDuplicacy =
    standardPartKeyPreview && value.trim()
      ? standardPartRows.filter((r) => (r.KEY ?? "").trim() === standardPartKeyPreview).length
      : 0;

  function canSave() {
    if (!value.trim() || saving) return false;
    if (kind === "sub-category" && (!segment || !category)) return false;
    if (kind === "standard-part" && (!segment || !category || !subCategory)) return false;
    return true;
  }

  async function handleSave() {
    if (!canSave()) return;
    setSaving(true);
    setError("");
    try {
      const body: Record<string, string> = { [cfg.fieldKey]: value.trim() };
      if (kind === "sub-category") {
        body.SEGMENT = segment!;
        body.Category = category!;
      }
      if (kind === "standard-part") {
        body.SEGMENT = segment!;
        body.Category = category!;
        body["SUB CATEGORY"] = subCategory!;
      }
      await createTaxonomyRow(cfg.tableKey, body);
      onSaved(value.trim());
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
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#1A1A1A", whiteSpace: "nowrap" }}>{cfg.title}</h2>
        </div>

        <div style={{ padding: "32px 24px", overflowY: "auto", flex: 1 }}>
          <TextField label="TIMESTAMP" value={now.toLocaleString()} disabled />
          <TextField label="USEREMAIL" value={user?.employeeId ?? ""} disabled />
          <TextField label="Unique ID" value={previewUniqueId} disabled />
          {kind === "category" && (
            <TextField
              label="Against id"
              value={categoryPreview ? categoryPreview.againstId || "—" : categoryPreviewFailed ? "—" : "Loading…"}
              disabled
            />
          )}
          {kind === "sub-category" && (
            <>
              <TextField
                label="Against id"
                value={subCategoryPreview ? subCategoryPreview.againstId || "—" : subCategoryPreviewFailed ? "—" : "Loading…"}
                disabled
              />
              <TextField
                label="CODE"
                value={subCategoryPreview ? subCategoryPreview.code : subCategoryPreviewFailed ? "—" : "Loading…"}
                disabled
              />
            </>
          )}
          {kind === "brand" && (
            <TextField
              label="CODE"
              value={brandPreview ? brandPreview.code : brandPreviewFailed ? "—" : "Loading…"}
              disabled
            />
          )}
          {kind === "standard-part" && (
            <>
              <TextField
                label="Against id"
                value={standardPartPreview ? standardPartPreview.againstId || "—" : standardPartPreviewFailed ? "—" : "Loading…"}
                disabled
              />
            </>
          )}
          <TextField
            label={cfg.label}
            required
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={cfg.placeholder}
          />
          {kind === "standard-part" && (
            <TextField
              label="CODE"
              value={standardPartPreview ? standardPartPreview.code || "—" : standardPartPreviewFailed ? "—" : "Loading…"}
              disabled
            />
          )}
          {kind === "standard-part" && <TextField label="KEY" value={standardPartKeyPreview || "—"} disabled />}
          {kind === "sub-category" && <TextField label="DUPLICACY" value={String(subCategoryDuplicacy)} disabled />}
          {kind === "brand" && <TextField label="DUPLICACY" value={String(brandDuplicacy)} disabled />}
          {kind === "standard-part" && <TextField label="DUPLICACY" value={String(standardPartDuplicacy)} disabled />}
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
