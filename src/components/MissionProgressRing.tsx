import { useEffect, useState } from "react";

/**
 * MissionProgressRing — donut-style circular progress arc.
 *
 * - Track: muted rgba(255,255,255,0.1)
 * - Fill color by percent:
 *     0–33%   → #C9A84C (gold)
 *     34–66%  → #2E5FA3 (blue)
 *     67–99%  → #22c55e (green)
 *     100%    → #22c55e + subtle solid fill
 * - Animates in on mount via stroke-dashoffset (600ms ease-out).
 * - Hover tooltip: "[completed] of [total] questions approved".
 * - Returns null if total is 0/undefined.
 */
export type MissionProgressRingSize = "sm" | "md" | "lg";

export interface MissionProgressRingProps {
  completed: number;
  total: number | null | undefined;
  size?: MissionProgressRingSize;
  showLabel?: boolean;
}

const SIZE_MAP: Record<MissionProgressRingSize, { diameter: number; stroke: number }> = {
  sm: { diameter: 28, stroke: 3 },
  md: { diameter: 36, stroke: 4 },
  lg: { diameter: 48, stroke: 5 },
};

function arcColor(pct: number): string {
  if (pct >= 100) return "#22c55e";
  if (pct >= 67) return "#22c55e";
  if (pct >= 34) return "#2E5FA3";
  return "#C9A84C";
}

export function MissionProgressRing({
  completed,
  total,
  size = "md",
  showLabel = false,
}: MissionProgressRingProps) {
  if (!total || total <= 0) return null;

  const { diameter, stroke } = SIZE_MAP[size];
  const radius = (diameter - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  const safeCompleted = Math.max(0, Math.min(completed, total));
  const pct = Math.round((safeCompleted / total) * 100);
  const color = arcColor(pct);

  // Animate from full offset (empty) to target offset on mount.
  const [animatedOffset, setAnimatedOffset] = useState(circumference);
  const target = circumference * (1 - safeCompleted / total);

  useEffect(() => {
    // Defer to next frame so the CSS transition runs.
    const raf = requestAnimationFrame(() => setAnimatedOffset(target));
    return () => cancelAnimationFrame(raf);
  }, [target]);

  const tooltip = `${safeCompleted} of ${total} questions approved`;
  const isComplete = pct >= 100;

  return (
    <span
      className="inline-flex items-center gap-2 align-middle"
      title={tooltip}
      aria-label={tooltip}
      role="img"
    >
      <svg
        width={diameter}
        height={diameter}
        viewBox={`0 0 ${diameter} ${diameter}`}
        style={{ display: "block", overflow: "visible" }}
      >
        {/* Track */}
        <circle
          cx={diameter / 2}
          cy={diameter / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth={stroke}
        />
        {/* Subtle solid fill when 100% */}
        {isComplete && (
          <circle
            cx={diameter / 2}
            cy={diameter / 2}
            r={radius - stroke / 2}
            fill={color}
            fillOpacity={0.12}
          />
        )}
        {/* Progress arc */}
        <circle
          cx={diameter / 2}
          cy={diameter / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={animatedOffset}
          transform={`rotate(-90 ${diameter / 2} ${diameter / 2})`}
          style={{ transition: "stroke-dashoffset 600ms ease-out" }}
        />
      </svg>
      {showLabel && (
        <span className="text-[12px] font-medium text-foreground/85 tabular-nums whitespace-nowrap">
          {safeCompleted} of {total} approved
        </span>
      )}
    </span>
  );
}

export default MissionProgressRing;
