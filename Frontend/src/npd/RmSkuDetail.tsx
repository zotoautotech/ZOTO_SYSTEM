import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useIsMobile } from "../lib/responsive";
import { listTaxonomyRows } from "./lib/npdApi";

/** RM SKU detail — pixel-matched against the real legacy reference screen (the user supplied
 * an exact coordinate/color spec after two earlier passes still didn't look right; this is the
 * third, closest pass). Literal hex colors throughout, not this app's `--color-*` tokens (the
 * reference's own blue `#2f82d5`/`#438edb`, not this app's red primary) — same deliberate
 * pixel-match-over-theme exception `RmSkuForm.tsx` already takes and documents.
 *
 * **One deliberate deviation from the supplied spec**: the spec's coordinates place the Action
 * card and the Details card SIDE BY SIDE (three columns total: Action | Details | Dimensions/
 * Drawing stack). Every actual screenshot of this screen the user has shared — both the real
 * AppSheet reference and this app's own earlier attempts — shows the Action card stacked
 * ABOVE the Details card in one left column, with Dimensions/Drawing & Photos/RM Images in a
 * separate right column. Trusting the real screenshots over the auto-generated coordinate
 * spec (which reads like a screenshot-to-code tool's guess, not a hand-measured one) — kept
 * the two-column stacked structure, applied every other measurement/color/typography/table
 * detail from the spec faithfully. Flag this to the user if it's still not what they meant.
 *
 * Dimensions is now a REAL table (Unique ID / TIMESTAMP / AGAINST ID / CATEGORY headers),
 * matching the reference's own table shape, not a plain "not available yet" line — still
 * genuinely empty (no per-category dimension tables exist yet, see below), just shaped like
 * the reference's table instead of a placeholder sentence. Drawing & Photos gets the
 * reference's own photo-tile shape (ID + category text, large empty white area below) rather
 * than a generic empty-state card. Both stay honestly empty — no fabricated rows/images. */
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

  // Field list AND order dumped live off the real "Raw Material SKU" tab (this app's standing
  // discipline — never assume a column order). The tab briefly had "Old Part Code"/"Old Part
  // Name" columns (added between VENDOR NAME and IQC PDF) — the user deleted both live in the
  // sheet moments after this file first surfaced them, so they're removed here too. Current
  // real order: TIMESTAMP → USEREMAIL → ID'S → PART NO. → Category → Sub Category → Paint →
  // MAKE BY → VENDOR NAME → IQC PDF → IQC PDF UPDATE LAST (`TrF tO Master Rm` excluded — an
  // internal transfer-tracking field, not something a doer reads here).
  const fields: { label: string; value: string; linked?: boolean; file?: boolean }[] = [
    { label: "TIMESTAMP", value: row.TIMESTAMP ? new Date(row.TIMESTAMP).toLocaleString() : "—" },
    { label: "USEREMAIL", value: row.USEREMAIL || "—" },
    { label: "ID'S", value: row["ID'S"] },
    { label: "PART NO.", value: row["PART NO."] || "—" },
    { label: "Category", value: row.Category || "—", linked: true },
    { label: "Sub Category", value: row["Sub Category"] || "—" },
    { label: "Paint", value: row.Paint || "—", linked: true },
    { label: "MAKE BY", value: row["MAKE BY"] || "—" },
    { label: "VENDOR NAME", value: row["VENDOR NAME"] || "—" },
    { label: "IQC PDF", value: row["IQC PDF"] || "—", file: true },
    { label: "IQC PDF UPDATE LAST", value: row["IQC PDF UPDATE LAST"] || "—" },
  ];

  const actions = [
    { icon: <ImageIcon />, label: "Upload\nImages &\nDrawings" },
    { icon: <RefreshIcon />, label: "UPDATE IQC\nPDF" },
    { icon: <CheckIcon />, label: "Verified RM\nitem" },
  ];

  const C = {
    border: "#dedede",
    heading: "#243b53",
    label: "#4e6276",
    value: "#243b53",
    muted: "#8a969f",
    blue: "#2f82d5",
    blueButton: "#438edb",
    badgeBg: "#e9edf1",
    badgeText: "#596b7b",
    tableBorder: "#dfe3e6",
  };

  return (
    <div style={{ marginTop: 20, paddingBottom: 24 }}>
      {/* The reference has ONE clean header line — its own breadcrumb (ending in the bolded
          id) plus Edit/Previous/Next, nothing more. This app's global `Layout.tsx` already
          renders that breadcrumb above every page (route-driven, not this file's to touch) —
          the first two passes at this file ALSO rendered a redundant circular-back-button +
          big "id" heading row directly under it, duplicating what the breadcrumb already
          shows and creating the double-header look the user flagged. Removed entirely — this
          row is now just the reference's own Edit + Previous/Next controls, right-aligned,
          nothing on the left. Edit is visual-only for now — no RM SKU edit form exists yet,
          same "flag it, don't fake it" treatment as the three action-card icons below. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", marginBottom: 16, gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            type="button"
            title="Coming soon"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              height: 37,
              padding: "0 16px",
              borderRadius: 5,
              border: "none",
              background: C.blueButton,
              color: "#fff",
              fontSize: 14,
              fontWeight: 500,
              cursor: "default",
              opacity: 0.9,
            }}
          >
            <PencilIcon /> Edit
          </button>
          <div style={{ width: 1, height: 24, background: C.border }} />
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

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 18, alignItems: "start" }}>
        <div>
          {/* Action card — 3 icon buttons, blue circular per the reference's own color, not
              this app's red --color-primary (deliberate pixel-match exception). */}
          <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 4, padding: "20px 18px", marginBottom: 18 }}>
            <div style={{ display: "flex", gap: 24, justifyContent: "space-around" }}>
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
                    width: 105,
                    border: "none",
                    background: "transparent",
                    cursor: "default",
                  }}
                >
                  <span
                    style={{
                      width: 45,
                      height: 45,
                      borderRadius: "50%",
                      background: C.blue,
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {a.icon}
                  </span>
                  <span style={{ fontSize: 14, textAlign: "center", color: "#1f2933", lineHeight: "18px", whiteSpace: "pre-line" }}>
                    {a.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Details card — 195px label column, 52px rows, per the spec; values center-aligned
              per explicit follow-up request. */}
          <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 4, padding: "12px 18px" }}>
            {fields.map((f) => (
              <div
                key={f.label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  minHeight: 52,
                  borderBottom: `1px solid ${C.border}`,
                }}
              >
                <span style={{ width: 195, flexShrink: 0, fontSize: 15, color: C.label, fontWeight: 400 }}>{f.label}</span>
                <span
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    // Center-aligned per the user's explicit request, matching the live
                    // sheet's own bold/centered header row formatting shown alongside that
                    // instruction — was right-aligned before.
                    justifyContent: "center",
                    gap: 8,
                    fontSize: 18,
                    color: C.value,
                    fontWeight: 400,
                    textAlign: "center",
                    wordBreak: "break-word",
                  }}
                >
                  {f.value}
                  {f.linked && f.value !== "—" && <ChevronRightIcon color={C.muted} />}
                  {f.file && f.value !== "—" && <FileIcon color={C.muted} />}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <DimensionsCard
            title={row.Category ? `${row.Category} Dimensions` : "Dimensions"}
            colors={C}
          />
          <DrawingPhotosCard partNo={row["PART NO."]} category={row.Category} colors={C} />
          <RelatedCard title="RM Images & Drawings" colors={C} />
        </div>
      </div>
    </div>
  );
}

type Colors = {
  border: string;
  heading: string;
  label: string;
  value: string;
  muted: string;
  blue: string;
  blueButton: string;
  badgeBg: string;
  badgeText: string;
  tableBorder: string;
};

function CardHeading({ title, colors }: { title: string; colors: Colors }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
      <h3 style={{ margin: 0, fontSize: 21, fontWeight: 400, color: colors.heading }}>{title}</h3>
      <span
        style={{
          background: colors.badgeBg,
          borderRadius: 4,
          padding: "3px 7px",
          fontSize: 11,
          color: colors.badgeText,
          lineHeight: 1,
        }}
      >
        0
      </span>
    </div>
  );
}

function CardFooterLinks({ colors }: { colors: Colors }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 22, fontSize: 14, marginTop: 12 }}>
      <span style={{ color: colors.blue, cursor: "default" }}>Expand</span>
      <span style={{ color: colors.blue, cursor: "default" }}>Add</span>
    </div>
  );
}

// The reference's own real table shape (Unique ID / TIMESTAMP / AGAINST ID / CATEGORY headers)
// — genuinely 0 rows (no per-category dimension tables exist yet, see this file's module doc
// comment), shown as a real empty table rather than a placeholder sentence, matching the
// reference's actual visual shape.
function DimensionsCard({ title, colors }: { title: string; colors: Colors }) {
  const columns = ["Unique ID", "TIMESTAMP", "AGAINST ID", "CATEGORY"];
  return (
    <div style={{ background: "#fff", border: `1px solid ${colors.border}`, borderRadius: 4, padding: "18px 18px 14px" }}>
      <CardHeading title={title} colors={colors} />
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 480 }}>
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col}
                  style={{
                    textAlign: "left",
                    fontSize: 13,
                    fontWeight: 600,
                    color: colors.heading,
                    padding: "10px 10px",
                    borderBottom: `1px solid ${colors.tableBorder}`,
                    whiteSpace: "nowrap",
                  }}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={columns.length} style={{ padding: "16px 10px", fontSize: 13, color: colors.muted }}>
                No dimension rows yet.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <CardFooterLinks colors={colors} />
    </div>
  );
}

// The reference's own photo-tile shape — ID + category label at the top of a bordered tile,
// large empty white area below (no fabricated thumbnail/gradient — this app has no image
// upload feature yet, see this file's module doc comment).
function DrawingPhotosCard({ partNo, category, colors }: { partNo: string; category: string; colors: Colors }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${colors.border}`, borderRadius: 4, padding: "18px 18px 14px" }}>
      <CardHeading title="Drawing & Photos" colors={colors} />
      {/* Tile is a fixed width, not full-card — the reference leaves visible whitespace beside
          it (room for further tiles in a row, once more than one drawing exists), not a single
          tile stretched to the card's full width. */}
      <div
        style={{
          border: `1px solid ${colors.tableBorder}`,
          borderRadius: 4,
          padding: 14,
          width: 220,
          minHeight: 160,
          background: "#fff",
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 600, color: colors.heading }}>{partNo || "—"}</div>
        <div style={{ fontSize: 14, color: colors.muted, marginTop: 2 }}>{category || "—"}</div>
      </div>
      <CardFooterLinks colors={colors} />
    </div>
  );
}

function RelatedCard({ title, colors }: { title: string; colors: Colors }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${colors.border}`, borderRadius: 4, padding: "18px 18px 14px" }}>
      <CardHeading title={title} colors={colors} />
      {/* Genuinely empty — see this file's module doc comment for why (no image-upload
          feature exists yet). Not a fabricated placeholder row. */}
      <p style={{ fontSize: 13, margin: "0 0 4px", color: colors.muted }}>Not available yet.</p>
      <CardFooterLinks colors={colors} />
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

function ImageIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="10" />
      <path d="m8 12 2.5 2.5L16 9" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function ChevronRightIcon({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" style={{ flexShrink: 0 }}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

function FileIcon({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" style={{ flexShrink: 0 }}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}
