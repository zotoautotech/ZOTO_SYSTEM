import { DashboardCard, type DashboardCardConfig } from "./DashboardCard";

/** Palette from the reference dashboard. Kept as literals rather than theme tokens because
 * these are chart colours that must stay identical in light and dark mode — a donut segment
 * re-coloured by the theme would change what the chart appears to say. */
const BLUE = "#2E6DA4";
const LIGHT_BLUE = "#A9C6E0";
const ORANGE = "#F0932B";
const GREEN = "#2E9E5B";

/**
 * Every card on the dashboard, in display order. Adding, removing or re-ordering a card is
 * a change to this array only — DashboardCard/DonutChart never need touching.
 *
 * NOTE: these counts are the static sample figures from the reference dashboard, not live
 * data. Each card's `segments` is exactly the shape a real query would produce, so wiring a
 * count in later means swapping the literal for a fetched number and nothing else.
 */
export const dashboardConfig: DashboardCardConfig[] = [
  {
    id: "pending-order-approval",
    title: "Pending Order Approval",
    segments: [
      { value: 1, color: BLUE },
      { value: 1, color: LIGHT_BLUE },
    ],
    badge: { label: "Completed…", color: GREEN },
  },
  { id: "pending-sale-order", title: "Pending Sale Order Graph", segments: [{ value: 2, color: BLUE }], centerLabel: "2" },
  { id: "pending-so-confirmation", title: "Pending SO Confirmation Graph", segments: [{ value: 7, color: BLUE }], centerLabel: "7" },
  { id: "pending-dispatch-approval", title: "Pending Dispatch Approval Graph", segments: [{ value: 5, color: BLUE }], centerLabel: "5" },
  { id: "pending-pdi", title: "Pending PDI Graph", segments: [{ value: 3, color: BLUE }], centerLabel: "3" },
  { id: "pending-transport", title: "Pending Transport Graph", segments: [{ value: 9, color: BLUE }], centerLabel: "9" },
  { id: "pending-transport-reached", title: "Pending Transport Reached Graph", segments: [] },
  { id: "pending-tax-invoice", title: "Pending Tax Invoice Generate", segments: [] },
  { id: "pending-dispatch", title: "Pending Dispatch Graph", segments: [{ value: 1, color: BLUE }], centerLabel: "1" },
  {
    id: "pending-collect-lr",
    title: "Pending Collect LR & Delivery",
    segments: [
      { value: 2, color: BLUE },
      { value: 1, color: LIGHT_BLUE },
    ],
  },
  {
    id: "sample-follow-up",
    title: "Sample Follow Up Pending Graph",
    segments: [
      { value: 59, color: BLUE },
      { value: 4, color: LIGHT_BLUE },
      { value: 6, color: ORANGE },
    ],
  },
  { id: "order-not-received", title: "Order Not Received Approval", segments: [{ value: 7, color: BLUE }], centerLabel: "7" },
  { id: "resubmit-sample", title: "Resubmit Sample Pending Graph", segments: [] },
  { id: "sample-payment", title: "Sample Payment Pending Graph", segments: [] },
  {
    id: "order-error-not-purchased",
    title: "Order Error Not Purchased",
    segments: [],
    quickAdd: { buttonLabel: "Add", inputLabel: "Cutomer Name" },
  },
];

function GridViewIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

/** KPI dashboard — a responsive grid of donut cards, 5 across on desktop down to 1 on a
 * phone. Uses CSS Grid's auto-fill rather than breakpoint classes so it reflows at any
 * width without this app needing a utility-CSS framework it doesn't have. */
export function Dashboard() {
  return (
    <div style={{ paddingBottom: 24 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 0",
          borderBottom: "1px solid var(--color-border)",
          marginBottom: 16,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, letterSpacing: 0.4 }}>DASHBOARD</h2>
        <button
          type="button"
          aria-label="Grid view"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 32,
            height: 32,
            border: "none",
            background: "transparent",
            color: "var(--dash-icon)",
            cursor: "pointer",
          }}
        >
          <GridViewIcon />
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gap: 16,
          gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))",
          alignItems: "stretch",
        }}
      >
        {dashboardConfig.map((config) => (
          <DashboardCard key={config.id} config={config} />
        ))}
      </div>
    </div>
  );
}
