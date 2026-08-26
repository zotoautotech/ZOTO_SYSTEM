import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { listDashboard } from "./lib/checklistApi";
import { DonutChart, donutColors, type DonutSegment } from "./DonutChart";

const PALETTE = [donutColors.primary, donutColors.secondary, donutColors.accent, donutColors.accentLight];

/** Full-page single-chart view — the "Expand" drill-down from the "Pending Checklist
 * Account" dashboard card (`DashboardList.tsx`). Same real per-doer donut/tooltip as the
 * card, just large. Clicking a specific doer's own slice drills into just that doer's
 * pending tasks (`DoerPendingList.tsx`) — clicking anywhere else on the ring (or a click
 * that doesn't land on any one slice, e.g. the center hole) still drills into
 * `AccountPendingDataList.tsx`, a real table of every pending task instance across every
 * doer (`GET /tasks/mine`, already built — not a new data source). This same
 * two-level expand-then-click-through-to-data pattern is what a future real department card
 * should follow once that department has its own backend route; there's nothing
 * Account-specific about the shape other than which query feeds it. */
export function AccountDashboardExpand() {
  const navigate = useNavigate();
  const { data: doers = [], isLoading } = useQuery({
    queryKey: ["checklist", "admin", "dashboard"],
    queryFn: listDashboard,
  });

  const segments: DonutSegment[] = doers.map((d, i) => ({
    value: d.count,
    color: PALETTE[i % PALETTE.length],
    label: d.fullName,
    id: d.doerId,
  }));
  const total = doers.reduce((s, d) => s + d.count, 0);

  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "24px 0" }}>
      {isLoading ? (
        <p className="text-muted">Loading…</p>
      ) : (
        <DonutChart
          segments={segments}
          centerValue={total}
          size={380}
          strokeWidth={70}
          onClick={doers.length > 0 ? () => navigate("/checklist/dashboard/account/data") : undefined}
          onSegmentClick={(seg) => seg.id && navigate(`/checklist/dashboard/${encodeURIComponent(seg.id)}`)}
        />
      )}
    </div>
  );
}
