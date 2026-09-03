import { useState } from "react";
import { isAxiosError } from "axios";
import { TextField } from "../components/form/TextField";
import { useIsMobile } from "../lib/responsive";
import { createTaxonomyRow } from "./lib/npdApi";

type Kind = "segment" | "category" | "sub-category";

interface Props {
  kind: Kind;
  /** Required for kind "sub-category" — the Category already picked in the parent form,
   * written straight through as the new Sub Category row's own required Category field. */
  category?: string;
  /** Required for kind "sub-category" — same idea, the parent's picked Segment. */
  segment?: string;
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
 * pattern `RmSkuForm.tsx` already uses (`RmCategoryForm.tsx`/`RmSubCategoryForm.tsx`/
 * `RmPaintForm.tsx`), just collapsed into one parameterized component instead of three
 * near-identical files — all three cases are genuinely this simple (one free-text field plus,
 * for Sub Category, the parent's already-picked Segment/Category carried straight through),
 * unlike RM's own nested forms which each had real CODE/DUPLICACY previews to show.
 * `CODE`/`DUPLICACY`/`AGAINST ID` are all server-computed on save (see `taxonomy.ts`'s
 * `fg-category-dd` entry) — nothing to preview client-side here, so this form is just the one
 * input plus Save/Cancel, no live-preview fields the way RM's nested forms have. */
export function FgQuickCreateForm({ kind, category, segment, onClose, onSaved }: Props) {
  const isMobile = useIsMobile();
  const cfg = CONFIG[kind];
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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
          <TextField
            label={cfg.label}
            required
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={cfg.placeholder}
          />
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
