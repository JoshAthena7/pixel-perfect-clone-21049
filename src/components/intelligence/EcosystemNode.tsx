interface EcosystemNodeProps {
  x: number;
  y: number;
  label: string;
  status: string;
  signalCount: number;
  confidence: number;
  isCenter: boolean;
  onClick: () => void;
}

const STATUS_FILL: Record<string, string> = {
  green: "#4caf7d",
  yellow: "#f0c040",
  red: "#e05252",
  gray: "rgba(255,255,255,0.18)",
};

export function EcosystemNode({
  x,
  y,
  label,
  status,
  signalCount,
  confidence,
  isCenter,
  onClick,
}: EcosystemNodeProps) {
  const r = isCenter ? 32 : 22;
  const fill = isCenter ? "#d4a843" : (STATUS_FILL[status] ?? STATUS_FILL.gray);
  const truncated = label.length > 14 ? label.slice(0, 13) + "…" : label;

  return (
    <g onClick={onClick} style={{ cursor: "pointer" }}>
      {(status === "green" || status === "yellow") && !isCenter && (
        <circle cx={x} cy={y} r={r + 6} fill="none" stroke={fill} strokeWidth={1} opacity={0.2}>
          <animate
            attributeName="opacity"
            values="0.2;0.05;0.2"
            dur={status === "green" ? "3s" : "6s"}
            repeatCount="indefinite"
          />
        </circle>
      )}

      <circle cx={x} cy={y} r={r} fill={fill} fillOpacity={isCenter ? 1 : 0.85}>
        {status === "green" && !isCenter && (
          <animate attributeName="opacity" values="0.85;0.55;0.85" dur="3s" repeatCount="indefinite" />
        )}
        {status === "yellow" && !isCenter && (
          <animate attributeName="opacity" values="0.85;0.6;0.85" dur="6s" repeatCount="indefinite" />
        )}
      </circle>

      {signalCount > 0 && (
        <g transform={`translate(${x + r - 2}, ${y - r + 2})`}>
          <circle r={10} fill="#d4a843" />
          <text textAnchor="middle" dominantBaseline="central" fontSize={9} fontWeight="700" fill="#0a1628">
            {signalCount > 99 ? "99+" : signalCount}
          </text>
        </g>
      )}

      <text
        x={x}
        y={y + r + 14}
        textAnchor="middle"
        fontSize={isCenter ? 12 : 11}
        fontWeight={isCenter ? 700 : 500}
        fill="white"
        style={{ pointerEvents: "none" }}
      >
        {truncated}
      </text>

      {isCenter && (
        <text
          x={x}
          y={y + 5}
          textAnchor="middle"
          fontSize={11}
          fill="rgba(10,22,40,0.85)"
          fontWeight="700"
          style={{ pointerEvents: "none" }}
        >
          {confidence}%
        </text>
      )}
    </g>
  );
}
