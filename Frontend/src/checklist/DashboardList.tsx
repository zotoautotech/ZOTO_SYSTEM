import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { listDashboard } from "./lib/checklistApi";
import { DonutChart, donutColors, type DonutSegment } from "./DonutChart";

/** Admin-only "Dashboard - Pending Checklist" — one donut-chart card per department,
 * matching the old AppSheet reference (`CHECKLIST-ADC-V1`) card-for-card. Only
 * **Pending Checklist Account** is wired to real data (`GET /admin/dashboard`, this app's
 * only built department so far — see docs/CHECKLIST.md). The other 11 cards are a static
 * placeholder layout recreating the reference's exact numbers/segments — there is no
 * Design/HR/Purchasing/etc. sheet or routing built yet to source them from. Wire each one
 * to real data (same shape as the Account card) as its own department gets built; don't
 * treat the placeholder numbers as real. */

interface StaticDoer {
  name: string;
  count: number;
}

interface StaticDept {
  title: string;
  doers: StaticDoer[];
  paginationLabel?: string;
}

const PALETTE = [donutColors.primary, donutColors.secondary, donutColors.accent, donutColors.accentLight];

// Static placeholder departments — see file-level note above.
const STATIC_DEPTS: StaticDept[] = [
  { title: "Pending Checklist Design", doers: [{ name: "0", count: 499 }] },
  { title: "Pending Checklist HR", doers: [{ name: "0", count: 131 }] },
  { title: "Pending Checklist JM", doers: [{ name: "Anshu (Executive Assistant)", count: 9 }] },
  { title: "Pending Checklist Purchasing", doers: [{ name: "Nikki (Purchase Executive)", count: 3 }] },
  { title: "Pending Checklist Management", doers: [] },
  {
    title: "Pending Checklist Sale",
    doers: [{ name: "Ruby (CRM)", count: 19 }, { name: "Tanuj Sharma", count: 7 }],
    paginationLabel: "1/3",
  },
  { title: "Pending Checklist Store", doers: [{ name: "Naunihal (Store Incharge)", count: 1 }] },
  {
    title: "Pending Checklist System",
    doers: [
      { name: "Amandeep (DME)", count: 4 },
      { name: "Ashish", count: 4 },
      { name: "—", count: 6 },
      { name: "—", count: 31 },
    ],
    paginationLabel: "1/4",
  },
  {
    title: "Pending Checklist Quality",
    doers: [
      { name: "0", count: 2235 },
      { name: "Danish (Quality Head)", count: 287 },
      { name: "—", count: 89 },
    ],
    paginationLabel: "1/5",
  },
  {
    title: "Completed Checklist Quality",
    doers: [
      { name: "Danish (Quality Head)", count: 1337 },
      { name: "—", count: 2554 },
      { name: "—", count: 364 },
      { name: "—", count: 1931 },
    ],
    paginationLabel: "1/4",
  },
  { title: "Pending Checklist Admin", doers: [{ name: "Gaurav Nagar (Office Maintenance)", count: 76 }] },
];

export function DashboardList() {
  const navigate = useNavigate();
  const { data: doers = [], isLoading } = useQuery({
    queryKey: ["checklist", "admin", "dashboard"],
    queryFn: listDashboard,
  });

  const accountTotal = doers.reduce((s, d) => s + d.count, 0);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <button className="btn" onClick={() => navigate("/checklist")}>
          Back to My Tasks
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: 14,
        }}
      >
        <DeptCard
          title="Pending Checklist Account"
          doers={doers.map((d) => ({ name: d.fullName, count: d.count }))}
          onDoerClick={(i) => navigate(`/checklist/dashboard/${encodeURIComponent(doers[i].doerId)}`)}
          isLoading={isLoading}
          emptyMessage={!isLoading && doers.length === 0 ? "No pending tasks" : undefined}
          centerOverrideValue={doers.length > 1 ? accountTotal : undefined}
        />
        {STATIC_DEPTS.map((dept) => (
          <DeptCard key={dept.title} title={dept.title} doers={dept.doers} paginationLabel={dept.paginationLabel} />
        ))}
      </div>
    </div>
  );
}

function DeptCard({
  title,
  doers,
  paginationLabel,
  onDoerClick,
  isLoading,
  emptyMessage,
  centerOverrideValue,
}: {
  title: string;
  doers: StaticDoer[];
  paginationLabel?: string;
  onDoerClick?: (index: number) => void;
  isLoading?: boolean;
  emptyMessage?: string;
  centerOverrideValue?: number;
}) {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(doers.length, 1);
  const current = doers[page];

  const segments: DonutSegment[] =
    doers.length > 1
      ? doers.map((d, i) => ({ value: d.count, color: PALETTE[i % PALETTE.length] }))
      : [{ value: current?.count ?? 0, color: PALETTE[0] }];

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
        <div style={{ display: "flex", gap: 4, flexShrink: 0, color: "var(--color-text-muted)" }}>
          <FilterGlyph />
          <ExpandGlyph />
        </div>
      </div>

      <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Full Name</div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 12,
          minHeight: 16,
        }}
      >
        <span
          onClick={onDoerClick && doers.length ? () => onDoerClick(page) : undefined}
          style={{ cursor: onDoerClick && doers.length ? "pointer" : undefined, color: "var(--color-text)" }}
        >
          {isLoading ? "…" : current?.name ?? emptyMessage ?? "0"}
        </span>
        {(paginationLabel || pageCount > 1) && doers.length > 1 && (
          <span style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--color-text-muted)" }}>
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              style={{ border: "none", background: "none", cursor: "pointer", padding: 0, color: "inherit" }}
            >
              ‹
            </button>
            {paginationLabel ?? `${page + 1}/${pageCount}`}
            <button
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              style={{ border: "none", background: "none", cursor: "pointer", padding: 0, color: "inherit" }}
            >
              ›
            </button>
          </span>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "center", padding: "4px 0" }}>
        <DonutChart
          segments={
            centerOverrideValue !== undefined ? [{ value: centerOverrideValue, color: PALETTE[0] }] : segments
          }
        />
      </div>

      <div style={{ position: "absolute", right: 6, bottom: 4, color: "var(--color-border)", fontSize: 10 }}>
        <ResizeGlyph />
      </div>
    </div>
  );
}

function FilterGlyph() {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M4 4h16l-6 8v6l-4 2v-8L4 4z" />
    </svg>
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
