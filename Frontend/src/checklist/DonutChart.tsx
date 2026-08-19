import { useRef, useState } from "react";

/** Small multi-segment donut chart, pure SVG (no charting lib) — used by the department
 * cards on the Dashboard - Pending Checklist grid to match the old AppSheet reference's
 * donut-per-department layout. An empty/zero-total donut renders as a flat gray ring (the
 * "no data yet" department cards, e.g. Management). Hovering a segment shows a small
 * styled tooltip (colored dot + label + value) that tracks the cursor and appears
 * immediately — not the native SVG `<title>` tooltip, which has a noticeable OS-level delay
 * and can't be styled; a real chart lib's hover card is the look being matched here. */

export interface DonutSegment {
  value: number;
  color: string;
  /** Shown in the hover tooltip next to this segment's value (e.g. the doer's name). */
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
  onClick,
}: {
  segments: DonutSegment[];
  size?: number;
  strokeWidth?: number;
  /** Overrides what's shown centered (e.g. the total across every segment) — falls back to
   * the single segment's own value when there's exactly one. */
  centerValue?: number;
  /** Makes the whole ring clickable (e.g. drilling into a data table) — cursor becomes a
   * pointer over the chart. */
  onClick?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ seg: DonutSegment; x: number; y: number } | null>(null);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  const center = size / 2;

  function trackMouse(seg: DonutSegment, e: React.MouseEvent) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setHover({ seg, x: e.clientX - rect.left, y: e.clientY - rect.top });
  }

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
    <div
      ref={containerRef}
      onClick={onClick}
      style={{ position: "relative", width: size, height: size, cursor: onClick ? "pointer" : undefined }}
    >
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
            style={{ cursor: seg.label ? "pointer" : undefined }}
            onMouseMove={seg.label ? (e) => trackMouse(seg, e) : undefined}
            onMouseLeave={seg.label ? () => setHover(null) : undefined}
          />
        ))}
        <text x={center} y={center} textAnchor="middle" dominantBaseline="central" fontSize={size * 0.16} fontWeight={700} fill="var(--color-text)">
          {centerNumber}
        </text>
      </svg>

      {hover && (
        <div
          style={{
            position: "absolute",
            left: hover.x,
            top: hover.y,
            transform: "translate(-50%, calc(-100% - 10px))",
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 10px",
            background: "var(--color-bg-card, #fff)",
            border: "1px solid var(--color-border)",
            borderRadius: 6,
            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            fontSize: 12,
            fontWeight: 600,
            color: "var(--color-text)",
            whiteSpace: "nowrap",
            pointerEvents: "none",
            zIndex: 10,
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: hover.seg.color, flexShrink: 0 }} />
          <span>{hover.seg.label}</span>
          <span style={{ color: "var(--color-text-muted)" }}>{hover.seg.value}</span>
        </div>
      )}
    </div>
  );
}
