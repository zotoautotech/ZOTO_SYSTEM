import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useIsMobile } from "../lib/responsive";
import { listTaxonomyRows } from "./lib/npdApi";

/** RM SKU detail — matches the real legacy reference screen's own two-column dashboard
 * layout: a left column with the icon-action row (Upload Images & Drawings / UPDATE IQC PDF /
 * Verified RM item) above the field card, and a right column of related-data cards (a
 * category-specific "{Category} Dimensions" table, "Drawing & Photos", "RM Images &
 * Drawings" — the reference genuinely shows all three as separate cards, confirmed against
 * the user's own screenshot, not two). The three icon actions are visual-only for now — no
 * upload/verification workflow behind them yet (per the user: functionality to follow later,
 * this pass is the layout). The right-side cards are genuinely empty here, not faked — this
 * app has no per-category dimension tables (the reference needs ~26 of them, one per RM
 * category, a much bigger version of the 6 FG-side item-spec tables already built in Sprint 6)
 * or an image-upload feature yet; shown as real empty states with an "Add" affordance stubbed
 * in, matching the reference's own card shape, rather than omitted or filled with fabricated
 * rows.
 *
 * Header/back-button/prev-next chrome deliberately follows this app's OWN existing detail-page
 * convention instead of literally copying the reference's chrome — same circular "‹" back
 * button + title-below-it shape as Sales CRR's OrderDetail.tsx, not a full-width "← Back to…"
 * button (that was this file's first pass, corrected on direct instruction to "take CRR
 * details hint" instead of inventing new chrome). Prev/Next (the reference's own `<`/`>`
 * record-navigation arrows) walk `rows` in the order the catalog list already returns them —
 * genuinely new here (no CRR detail page has this), but a reasonable, low-risk addition since
 * `rows` is already loaded for the field lookup below. */
export function RmSkuDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["npd", "taxonomy", "rows", "rm-sku"],
    queryFn: () => listTaxonomyRows("rm-sku"),
  });

  const row = rows.find((r) => r["ID'S"] === id);
  const rowIndex = rows.findIndex((r) => r["ID'S"] === id);
  const prevRow = rowIndex > 0 ? rows[rowIndex - 1] : undefined;
  const nextRow = rowIndex >= 0 && rowIndex < rows.length - 1 ? rows[rowIndex + 1] : undefined;

  if (isLoading) return <p className="text-muted" style={{ marginTop: 16 }}>Loading…</p>;
  if (!row) return <p className="text-muted" style={{ marginTop: 16 }}>RM SKU not found.</p>;

  const fields: { label: string; value: string; linked?: boolean }[] = [
    { label: "ID'S", value: row["ID'S"] },
    { label: "TIMESTAMP", value: row.TIMESTAMP ? new Date(row.TIMESTAMP).toLocaleString() : "—" },
    { label: "USEREMAIL", value: row.USEREMAIL || "—" },
    { label: "Old Part Code", value: row["Old Part Code"] || "—" },
    { label: "PART NO.", value: row["PART NO."] || "—" },
    { label: "Category", value: row.Category || "—", linked: true },
    { label: "Sub Category", value: row["Sub Category"] || "—" },
    { label: "Paint", value: row.Paint || "—", linked: true },
    { label: "MAKE BY", value: row["MAKE BY"] || "—" },
    { label: "VENDOR NAME", value: row["VENDOR NAME"] || "—" },
    { label: "IQC PDF UPDATE LAST", value: row["IQC PDF UPDATE LAST"] || "—" },
    { label: "IQC PDF", value: row["IQC PDF"] || "—" },
  ];

  const actions = [
    { icon: <ImageIcon />, label: "Upload Images & Drawings" },
    { icon: <RefreshIcon />, label: "UPDATE IQC PDF" },
    { icon: <CheckIcon />, label: "Verified RM item" },
  ];

  return (
    <div style={{ marginTop: 20, paddingBottom: 24 }}>
      {/* Same circular back-button + title shape as OrderDetail.tsx (Sales CRR), not a
          full-width "← Back to…" button — see this file's own module doc comment. Prev/Next
          are new here, not a CRR pattern, but a small addition in the same visual language
          (circular bordered icon buttons). */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <NavCircleButton onClick={() => navigate("/npd/rm-sku")} label="Back">
            ‹
          </NavCircleButton>
          <h2 style={{ margin: 0, fontWeight: 500, wordBreak: "break-word" }}>{row["ID'S"]}</h2>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <NavCircleButton
            onClick={() => prevRow && navigate(`/npd/rm-sku/${prevRow["ID'S"]}`)}
            label="Previous RM SKU"
            disabled={!prevRow}
          >
            ‹
          </NavCircleButton>
          <NavCircleButton
            onClick={() => nextRow && navigate(`/npd/rm-sku/${nextRow["ID'S"]}`)}
            label="Next RM SKU"
            disabled={!nextRow}
          >
            ›
          </NavCircleButton>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 24, alignItems: "start" }}>
        <div>
          <div className="card" style={{ padding: 20, marginBottom: 24 }}>
            <div style={{ display: "flex", gap: 32 }}>
              {actions.map((a) => (
                <button
                  key={a.label}
                  type="button"
                  title="Coming soon"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 8,
                    width: 90,
                    border: "none",
                    background: "transparent",
                    cursor: "default",
                    opacity: 0.85,
                  }}
                >
                  <span
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: "50%",
                      background: "var(--color-primary)",
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {a.icon}
                  </span>
                  <span style={{ fontSize: 12, textAlign: "center", color: "var(--color-text)" }}>{a.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="card" style={{ padding: 20 }}>
            {fields.map((f) => (
              <div
                key={f.label}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "8px 0",
                  borderBottom: "1px solid var(--color-border)",
                  fontSize: 14,
                }}
              >
                <span className="text-muted">{f.label}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 500, textAlign: "right" }}>
                  {f.value}
                  {f.linked && f.value !== "—" && <span className="text-muted">›</span>}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <RelatedCard title={row.Category ? `${row.Category} Dimensions` : "Dimensions"} />
          <RelatedCard title="Drawing & Photos" />
          <RelatedCard title="RM Images & Drawings" />
        </div>
      </div>
    </div>
  );
}

// Same 30x30 circular bordered button OrderDetail.tsx (Sales CRR) uses for its own back
// button — reused here for Back/Previous/Next rather than inventing new chrome.
function NavCircleButton({
  onClick,
  label,
  disabled,
  children,
}: {
  onClick: () => void;
  label: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      style={{
        width: 30,
        height: 30,
        borderRadius: "50%",
        border: "1px solid var(--color-border)",
        background: "var(--color-bg)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 15,
        flexShrink: 0,
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? "default" : "pointer",
        color: "var(--color-text)",
      }}
    >
      {children}
    </button>
  );
}

function RelatedCard({ title }: { title: string }) {
  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{title}</h3>
        <span
          style={{
            background: "var(--color-bg-page)",
            border: "1px solid var(--color-border)",
            borderRadius: 4,
            padding: "1px 7px",
            fontSize: 12,
            color: "var(--color-text-muted)",
          }}
        >
          0
        </span>
      </div>
      {/* Genuinely empty — see this file's module doc comment for why (no per-category
          dimension tables or image-upload feature exist yet). Not a fabricated placeholder
          row, matching this app's "flag it, don't fake it" convention. */}
      <p className="text-muted" style={{ fontSize: 13, margin: "0 0 14px" }}>
        Not available yet.
      </p>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 16, fontSize: 13 }}>
        <span className="text-muted">Expand</span>
        <span className="text-muted">Add</span>
      </div>
    </div>
  );
}

function ImageIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="10" />
      <path d="m8 12 2.5 2.5L16 9" />
    </svg>
  );
}
