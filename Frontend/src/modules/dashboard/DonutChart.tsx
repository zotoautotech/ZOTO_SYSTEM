/**
 * Donut chart drawn as plain SVG — no charting dependency.
 *
 * This app has no chart library, and adding one for a handful of static rings isn't worth
 * it: two brand-new Backend deps this week each broke the first Vercel build on a type-only
 * resolution quirk (see CLAUDE.md's Known gotchas), and the whole ring is ~30 lines of arc
 * math. Segments are drawn as stroked circle arcs via stroke-dasharray, which keeps the
 * ring crisp at any size without path math.
 */
export interface DonutSegment {
  value: number;
  color: string;
  /** Optional label drawn next to this segment (the small counts in the reference UI). */
  label?: string;
}

const SIZE = 132;
const STROKE = 26;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function DonutChart({
  segments,
  centerLabel,
  emptyColor = "var(--dash-empty)",
}: {
  segments: DonutSegment[];
  /** Bold number in the middle. Omitted entirely on empty cards, per the reference. */
  centerLabel?: string;
  emptyColor?: string;
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const isEmpty = segments.length === 0 || total <= 0;

  // Running offset so each segment starts where the previous ended. Rotated -90° so the
  // first segment begins at 12 o'clock rather than 3 o'clock.
  let consumed = 0;
  const arcs = isEmpty
    ? []
    : segments.map((s, i) => {
        const fraction = s.value / total;
        const dash = fraction * CIRCUMFERENCE;
        const arc = {
          key: i,
          color: s.color,
          dasharray: `${dash} ${CIRCUMFERENCE - dash}`,
          dashoffset: -consumed,
          // Mid-angle of this segment, used to place its little count label.
          midAngle: (consumed + dash / 2) / CIRCUMFERENCE * 360 - 90,
          value: s.value,
        };
        consumed += dash;
        return arc;
      });

  // Labels sit just inside the ring, at the middle of each segment.
  const labelRadius = RADIUS;

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, minHeight: 0 }}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={centerLabel ? `Total ${centerLabel}` : "No data"}>
        <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
          {isEmpty ? (
            <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke={emptyColor} strokeWidth={STROKE} />
          ) : (
            arcs.map((a) => (
              <circle
                key={a.key}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                fill="none"
                stroke={a.color}
                strokeWidth={STROKE}
                strokeDasharray={a.dasharray}
                strokeDashoffset={a.dashoffset}
              />
            ))
          )}
        </g>

        {/* Per-segment counts, only when there's more than one segment to tell apart. */}
        {arcs.length > 1 &&
          arcs.map((a) => {
            const rad = (a.midAngle * Math.PI) / 180;
            return (
              <text
                key={`label-${a.key}`}
                x={SIZE / 2 + labelRadius * Math.cos(rad)}
                y={SIZE / 2 + labelRadius * Math.sin(rad)}
                textAnchor="middle"
                dominantBaseline="central"
                style={{ fontSize: 11, fontWeight: 600, fill: "#fff" }}
              >
                {a.value}
              </text>
            );
          })}

        {/* Single-segment rings show their total in the ring itself, matching the reference. */}
        {arcs.length === 1 && centerLabel && (
          <text
            x={SIZE / 2}
            y={SIZE - STROKE / 2}
            textAnchor="middle"
            dominantBaseline="central"
            style={{ fontSize: 12, fontWeight: 700, fill: "#fff" }}
          >
            {centerLabel}
          </text>
        )}
      </svg>
    </div>
  );
}
