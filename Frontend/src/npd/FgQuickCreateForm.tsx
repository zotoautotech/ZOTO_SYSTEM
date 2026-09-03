import { useEffect, useState } from "react";
import { isAxiosError } from "axios";
import { useQuery } from "@tanstack/react-query";
import { TextField } from "../components/form/TextField";
import { useIsMobile } from "../lib/responsive";
import { useAuth } from "../lib/auth";
import { createTaxonomyRow, previewFgCategoryDdCode, previewPlainRandomId, type TaxonomyRow } from "./lib/npdApi";

type Kind = "segment" | "category" | "sub-category";

interface Props {
  kind: Kind;
  /** Required for kind "sub-category" — the Category already picked in the parent form,
   * written straight through as the new Sub Category row's own required Category field. */
  category?: string;
  /** Required for kind "sub-category" — same idea, the parent's picked Segment. */
  segment?: string;
  /** Only used for kind "sub-category" — the parent's already-loaded fg-category-dd rows,
   * for the live DUPLICACY preview below (no extra network round trip). */
  subCategoryRows?: TaxonomyRow[];
  onClose: () => void;
  onSaved: (value: string) => void;
}

const CONFIG: Record<Kind, { title: string; tableKey: string; fieldKey: string; label: string; placeholder: string }> = {
  segment: { title: "FG ref Segment Form", tableKey: "fg-segment", fieldKey: "SEGMENT", label: "SEGMENT", placeholder: "Type a segment name…" },
  category: { title: "FG ref Category Form", tableKey: "fg-category", fieldKey: "CATEGORY", label: "CATEGORY", placeholder: "Type a category name…" },
  "sub-category": { title: "FG ref Category DD Form", tableKey: "fg-category-dd", fieldKey: "SUB CATEGORY", label: "SUB CATEGORY", placeholder: "Type a sub category name…" },
};

/** One shared "+ New" nested panel for Segment/Category/Sub Category, opened from
 * `FgSkuForm.tsx`'s three matching `SearchableSelect`s — per the user's explicit request
 * ("add + New for Segment, Category, Sub Category too"), matching the same inline-create
 * pattern `RmSkuForm.tsx` already uses, collapsed into one parameterized component instead of
 * three near-identical files.
 *
 * **Live-preview fields now match RM's own nested forms** (TIMESTAMP/USEREMAIL/Unique ID on
 * all three, plus CODE/DUPLICACY for Sub Category) — the first version of this file skipped
 * them entirely on the reasoning that everything was server-computed anyway, but the user
 * pointed out directly that it didn't "look same" as `RmCategoryForm.tsx`. `FG ref Segment`/
 * `FG ref Category` genuinely have no CODE/DUPLICACY columns on the live sheet at all
 * (confirmed live — just `SEGMENT` / `Against id`+`CATEGORY` respectively), so those two kinds
 * stop at TIMESTAMP/USEREMAIL/Unique ID; only `FG ref Category DD` (Sub Category) has a real
 * CODE (`previewFgCategoryDdCode()`) to show, plus a client-computed DUPLICACY count (scoped
 * to SEGMENT+Category+SUB CATEGORY, mirroring `countFgSubCategoryDuplicates()`'s own real
 * server formula) from the parent's already-loaded `fg-category-dd` rows. */
export function FgQuickCreateForm({ kind, category, segment, subCategoryRows = [], onClose, onSaved }: Props) {
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

  const { data: codePreview, isError: codePreviewFailed } = useQuery({
    queryKey: ["npd", "taxonomy", "fg-category-dd", "preview"],
    queryFn: previewFgCategoryDdCode,
    enabled: kind === "sub-category",
    retry: 1,
  });

  const duplicacy =
    kind === "sub-category" && segment && category && value.trim()
      ? subCategoryRows.filter(
          (r) =>
            (r.SEGMENT ?? "").trim() === segment.trim() &&
            (r.Category ?? "").trim() === category.trim() &&
            (r["SUB CATEGORY"] ?? "").trim() === value.trim()
        ).length
      : 0;

  function canSave() {
    if (!value.trim() || saving) return false;
    if (kind === "sub-category" && (!segment || !category)) return false;
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
          {kind === "sub-category" && (
            <TextField
              label="CODE"
              value={codePreview ? codePreview.code : codePreviewFailed ? "—" : "Loading…"}
              disabled
            />
          )}
          <TextField
            label={cfg.label}
            required
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={cfg.placeholder}
          />
          {kind === "sub-category" && <TextField label="DUPLICACY" value={String(duplicacy)} disabled />}
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
