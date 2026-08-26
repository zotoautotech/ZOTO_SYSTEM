import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { listDashboard } from "./lib/checklistApi";
import { DonutChart, donutColors, type DonutSegment } from "./DonutChart";

const PALETTE = [donutColors.primary, donutColors.secondary, donutColors.accent, donutColors.accentLight];

/** Admin-only "Dashboard - Pending Checklist" — one donut-chart card per department,
 * matching the old AppSheet reference (`CHECKLIST-ADC-V1`)'s card grid. Only
 * **Pending Checklist Account** is wired to real data (`GET /admin/dashboard`, this app's
 * only built department so far — see docs/CHECKLIST.md). Every other department card is
 * shown **blank** (a flat gray ring, no fabricated number) since there's no Design/HR/
 * Purchasing/etc. sheet or routing built yet to source a real count from — wire each one to
 * real data (same shape as the Account card) as its own department gets built. */

// Every department the old reference shows, in its original order. Wire a real query in
// once that department's own sheet/routing exists — until then it stays blank.
const OTHER_DEPARTMENTS = [
  "Pending Checklist Design",
  "Pending Checklist HR",
  "Pending Checklist JM",
  "Pending Checklist Purchasing",
  "Pending Checklist Management",
  "Pending Checklist Sale",
  "Pending Checklist Store",
  "Pending Checklist System",
  "Pending Checklist Quality",
  "Completed Checklist Quality",
  "Pending Checklist Admin",
];

export function DashboardList() {
  const navigate = useNavigate();
  const { data: doers = [], isLoading } = useQuery({
    queryKey: ["checklist", "admin", "dashboard"],
    queryFn: listDashboard,
  });

  const accountTotal = doers.reduce((s, d) => s + d.count, 0);
  // One segment per doer, colored/cycled from the palette, each carrying its own name as a
  // hover tooltip (native <title>) — moving the cursor over that doer's slice of the ring
  // shows their name immediately, no click needed. Center still shows just the total
  // pending count, not a per-doer breakdown.
  const accountSegments: DonutSegment[] = doers.map((d, i) => ({
    value: d.count,
    color: PALETTE[i % PALETTE.length],
    label: d.fullName,
    id: d.doerId,
  }));

  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: 14,
        }}
      >
        <DeptCard
          title="Pending Checklist Account"
          segments={isLoading ? undefined : accountSegments}
          centerValue={isLoading ? undefined : accountTotal}
          onExpand={() => navigate("/checklist/dashboard/account")}
          onDonutClick={doers.length > 0 ? () => navigate("/checklist/dashboard/account/data") : undefined}
          onSegmentClick={(seg) => seg.id && navigate(`/checklist/dashboard/${encodeURIComponent(seg.id)}`)}
        />
        {OTHER_DEPARTMENTS.map((title) => (
          <DeptCard key={title} title={title} segments={undefined} />
        ))}
      </div>
    </div>
  );
}

function DeptCard({
  title,
  segments,
  centerValue,
  onExpand,
  onDonutClick,
  onSegmentClick,
}: {
  title: string;
  /** `undefined` = no real data source yet, renders a blank gray ring. */
  segments?: DonutSegment[];
  centerValue?: number;
  /** Opens the full-page single-chart drill-down. Omit for cards with no real data source
   * yet — nothing to expand into. */
  onExpand?: () => void;
  /** Clicking the ring itself (but not landing on a specific doer's own slice — see
   * onSegmentClick) jumps straight to the real data table, skipping the intermediate
   * full-chart page — a shortcut alongside (not a replacement for) Expand. */
  onDonutClick?: () => void;
  /** Clicking a specific doer's slice drills straight into just that doer's own pending
   * tasks (DoerPendingList.tsx) instead of everyone's — this used to be indistinguishable
   * from onDonutClick (the whole ring fired the same generic handler regardless of which
   * segment was clicked), which was the actual bug a doer reported: clicking their own
   * slice in the tooltip still showed every doer's tasks. */
  onSegmentClick?: (seg: DonutSegment) => void;
}) {
  return (
    <div
      className="card"
      style={{
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        position: "relative",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
        <span style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.3 }}>{title}</span>
        <button
          type="button"
          onClick={onExpand}
          disabled={!onExpand}
          aria-label={`Expand ${title}`}
          style={{
            flexShrink: 0,
            border: "none",
            background: "none",
            padding: 0,
            color: "var(--color-text-muted)",
            cursor: onExpand ? "pointer" : "default",
            opacity: onExpand ? 1 : 0.4,
          }}
        >
          <ExpandGlyph />
        </button>
      </div>

      <div style={{ display: "flex", justifyContent: "center", padding: "4px 0" }}>
        <DonutChart segments={segments ?? []} centerValue={centerValue} onClick={onDonutClick} onSegmentClick={onSegmentClick} />
      </div>

      <div style={{ position: "absolute", right: 6, bottom: 4, color: "var(--color-border)", fontSize: 10 }}>
        <ResizeGlyph />
      </div>
    </div>
  );
}

function ExpandGlyph() {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

function ResizeGlyph() {
  return (
    <svg width={10} height={10} viewBox="0 0 10 10" fill="currentColor">
      <circle cx="2" cy="8" r="1" />
      <circle cx="5" cy="8" r="1" />
      <circle cx="8" cy="8" r="1" />
      <circle cx="5" cy="5" r="1" />
      <circle cx="8" cy="5" r="1" />
      <circle cx="8" cy="2" r="1" />
    </svg>
  );
}
