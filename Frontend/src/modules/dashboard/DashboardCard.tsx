import { DonutChart, type DonutSegment } from "./DonutChart";

/** One card's whole definition — the dashboard is driven entirely by an array of these, so
 * adding or editing a card never means touching the components. */
export interface DashboardCardConfig {
  id: string;
  title: string;
  segments: DonutSegment[];
  /** Bold number in the ring. Omit for empty cards (the reference shows no number there). */
  centerLabel?: string;
  /** Small coloured pill in the header, e.g. the green "Completed" badge. */
  badge?: { label: string; color: string };
  /** Cards with a quick action — renders the red "+ Add" button and its input. */
  quickAdd?: { buttonLabel: string; inputLabel: string };
}

function FilterIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 6h16M7 12h10M10 18h4" />
    </svg>
  );
}

function ExpandIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
    </svg>
  );
}

/** The little diagonal grip in the bottom-right corner. Purely decorative for now — the
 * reference shows it on every card, but nothing here is actually drag-resizable yet. */
function ResizeGrip() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      aria-hidden="true"
      style={{ position: "absolute", right: 5, bottom: 5, color: "var(--dash-grip)" }}
    >
      <path d="M9 1L1 9M9 5L5 9" stroke="currentColor" strokeWidth="1.2" fill="none" />
    </svg>
  );
}

const iconButtonStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 22,
  height: 22,
  border: "none",
  background: "transparent",
  color: "var(--dash-icon)",
  cursor: "pointer",
  padding: 0,
  flexShrink: 0,
};

export function DashboardCard({ config }: { config: DashboardCardConfig }) {
  const { title, segments, centerLabel, badge, quickAdd } = config;

  return (
    <div
      className="card"
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        minHeight: 220,
        padding: 0,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "10px 12px",
          minWidth: 0,
        }}
      >
        <span
          title={title}
          style={{
            fontSize: 14,
            fontWeight: 500,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            minWidth: 0,
            flex: 1,
          }}
        >
          {title}
        </span>

        {badge && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              background: badge.color,
              color: "#fff",
              fontSize: 11,
              fontWeight: 600,
              padding: "3px 8px",
              borderRadius: 999,
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M20 6 9 17l-5-5" />
            </svg>
            {badge.label}
          </span>
        )}

        {quickAdd && (
          <button
            type="button"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              background: "var(--color-primary)",
              color: "#fff",
              border: "none",
              fontSize: 11,
              fontWeight: 600,
              padding: "4px 9px",
              borderRadius: 6,
              cursor: "pointer",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            + {quickAdd.buttonLabel}
          </button>
        )}

        <button type="button" aria-label={`Filter ${title}`} style={iconButtonStyle}>
          <FilterIcon />
        </button>
        <button type="button" aria-label={`Expand ${title}`} style={iconButtonStyle}>
          <ExpandIcon />
        </button>
      </div>

      {quickAdd && (
        <div style={{ padding: "0 12px 4px" }}>
          <label style={{ display: "block", fontSize: 12, color: "var(--color-text-muted)" }}>{quickAdd.inputLabel}</label>
          <input
            type="text"
            aria-label={quickAdd.inputLabel}
            style={{
              width: "100%",
              marginTop: 4,
              padding: "6px 8px",
              fontSize: 13,
              border: "1px solid var(--color-border)",
              borderRadius: 6,
              background: "var(--color-bg)",
              color: "var(--color-text)",
            }}
          />
        </div>
      )}

      <DonutChart segments={segments} centerLabel={centerLabel} />
      <ResizeGrip />
    </div>
  );
}
