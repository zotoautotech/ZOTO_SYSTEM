/** Small multi-segment donut chart, pure SVG (no charting lib) — used by the department
 * cards on the Dashboard - Pending Checklist grid to match the old AppSheet reference's
 * donut-per-department layout. A single-segment donut shows its value centered; a
 * multi-segment donut shows each segment's value as a label sitting on/near its own arc
 * (matching the reference image) and leaves the center blank. An empty/zero-total donut
 * renders as a flat gray ring (the "no data yet" department cards, e.g. Management). */

export interface DonutSegment {
  value: number;
  color: string;
  /** Shown as a native hover tooltip on this segment (e.g. the doer's name) — appears the
   * moment the cursor moves over that arc, no click needed. */
  label?: string;
}

const COLORS = {
  primary: "#3b82c4", // medium corporate blue — dominant segment
  secondary: "#a9c8e6", // light blue
  accent: "#f0a13f", // orange
  accentLight: "#f6c98a", // light orange
} as const;

export { COLORS as donutColors };

export function DonutChart({
  segments,
  size = 128,
  strokeWidth = 20,
  centerValue,
}: {
  segments: DonutSegment[];
  size?: number;
  strokeWidth?: number;
  /** Overrides what's shown centered (e.g. the total across every segment) — falls back to
   * the single segment's own value when there's exactly one. */
  centerValue?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  const center = size / 2;

  if (total <= 0) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth={strokeWidth}
        />
      </svg>
    );
  }

  let cumulative = 0;
  const arcs = segments
    .filter((s) => s.value > 0)
    .map((seg, i) => {
      const fraction = seg.value / total;
      const dash = fraction * circumference;
      const offset = -(cumulative / total) * circumference;
      cumulative += seg.value;
      return { key: i, seg, dash, offset };
    });

  const centerNumber = centerValue ?? (segments.length === 1 ? segments[0].value : total);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={center} cy={center} r={radius} fill="none" stroke="var(--color-border)" strokeWidth={strokeWidth} opacity={0.25} />
      {arcs.map(({ key, seg, dash, offset }) => (
        <circle
          key={key}
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={seg.color}
          strokeWidth={strokeWidth}
          strokeDasharray={`${dash} ${circumference - dash}`}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${center} ${center})`}
        >
          {/* Native SVG tooltip — the doer's name (or whatever label the caller sets)
              appears the instant the cursor moves over this arc, no click needed. */}
          {seg.label && <title>{seg.label}</title>}
        </circle>
      ))}
      <text x={center} y={center} textAnchor="middle" dominantBaseline="central" fontSize={size * 0.16} fontWeight={700} fill="var(--color-text)">
        {centerNumber}
      </text>
    </svg>
  );
}
