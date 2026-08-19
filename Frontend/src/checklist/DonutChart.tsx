/** Small multi-segment donut chart, pure SVG (no charting lib) — used by the department
 * cards on the Dashboard - Pending Checklist grid to match the old AppSheet reference's
 * donut-per-department layout. A single-segment donut shows its value centered; a
 * multi-segment donut shows each segment's value as a label sitting on/near its own arc
 * (matching the reference image) and leaves the center blank. An empty/zero-total donut
 * renders as a flat gray ring (the "no data yet" department cards, e.g. Management). */

export interface DonutSegment {
  value: number;
  color: string;
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
}: {
  segments: DonutSegment[];
  size?: number;
  strokeWidth?: number;
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
      const midAngle = ((cumulative + seg.value / 2) / total) * 360 - 90;
      cumulative += seg.value;
      const rad = (midAngle * Math.PI) / 180;
      const labelR = radius;
      const lx = center + labelR * Math.cos(rad);
      const ly = center + labelR * Math.sin(rad);
      return { key: i, seg, dash, offset, lx, ly };
    });

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
        />
      ))}
      {segments.length === 1 ? (
        <text x={center} y={center} textAnchor="middle" dominantBaseline="central" fontSize={size * 0.16} fontWeight={700} fill="var(--color-text)">
          {segments[0].value}
        </text>
      ) : (
        arcs.map(({ key, seg, lx, ly }) => (
          <text key={key} x={lx} y={ly} textAnchor="middle" dominantBaseline="central" fontSize={size * 0.1} fontWeight={700} fill="#fff">
            {seg.value}
          </text>
        ))
      )}
    </svg>
  );
}
