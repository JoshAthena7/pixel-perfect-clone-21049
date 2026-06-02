// VaultIcon (temple) and OracleIcon (all-seeing eye) — animated SVG components.
// Pure CSS animations. Respect prefers-reduced-motion.
import "./atlas-icons.css";

type Props = {
  size?: number;
  active?: boolean;
  className?: string;
  /** When true, animations and idle pulses are suppressed (use in empty states / inline body). */
  static?: boolean;
};

export function VaultIcon({ size = 20, active = false, className = "", static: isStatic = false }: Props) {
  const cls = [
    "atlas-icon vault-icon",
    active ? "is-active" : "",
    isStatic ? "is-static" : "",
    className,
  ].filter(Boolean).join(" ");
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={cls}
      aria-hidden="true"
      // re-trigger reveal animation on each mount
      key={`vault-${active ? "a" : "i"}`}
    >
      {/* Pediment */}
      <polyline className="vault-pediment" points="3,8 12,3 21,8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Three columns with capitals */}
      <g className="vault-col vault-col-left">
        <line x1="6" y1="9" x2="6" y2="19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="4.5" y1="9" x2="7.5" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </g>
      <g className="vault-col vault-col-mid">
        <line x1="12" y1="9" x2="12" y2="19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="10.5" y1="9" x2="13.5" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </g>
      <g className="vault-col vault-col-right">
        <line x1="18" y1="9" x2="18" y2="19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="16.5" y1="9" x2="19.5" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </g>
      {/* Base */}
      <line className="vault-base" x1="2" y1="20.5" x2="22" y2="20.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function OracleIcon({ size = 20, active = false, className = "", static: isStatic = false }: Props) {
  const cls = [
    "atlas-icon oracle-icon",
    active ? "is-active" : "",
    isStatic ? "is-static" : "",
    className,
  ].filter(Boolean).join(" ");
  // 8 rays positioned around center (12,12). Cardinals slightly longer than diagonals.
  const rays: Array<{ x1: number; y1: number; x2: number; y2: number }> = [
    { x1: 12, y1: 4.5, x2: 12, y2: 1.5 },   // N
    { x1: 17, y1: 7, x2: 19, y2: 5 },        // NE
    { x1: 19.5, y1: 12, x2: 22.5, y2: 12 },  // E
    { x1: 17, y1: 17, x2: 19, y2: 19 },      // SE
    { x1: 12, y1: 19.5, x2: 12, y2: 22.5 },  // S
    { x1: 7, y1: 17, x2: 5, y2: 19 },        // SW
    { x1: 4.5, y1: 12, x2: 1.5, y2: 12 },    // W
    { x1: 7, y1: 7, x2: 5, y2: 5 },          // NW
  ];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={cls}
      aria-hidden="true"
      key={`oracle-${active ? "a" : "i"}`}
    >
      {/* Rotating rays group */}
      <g className="oracle-rays" style={{ transformOrigin: "12px 12px" }}>
        {rays.map((r, i) => (
          <line
            key={i}
            className="oracle-ray"
            style={{ animationDelay: `${400 + i * 25}ms` }}
            x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2}
            stroke="currentColor"
            strokeWidth="1"
            strokeLinecap="round"
            opacity="0.5"
          />
        ))}
      </g>
      {/* Eye almond shape */}
      <g className="oracle-eye" style={{ transformOrigin: "12px 12px" }}>
        <path
          d="M2.5 12 Q 12 5 21.5 12 Q 12 19 2.5 12 Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
          fill="none"
        />
      </g>
      {/* Iris ring */}
      <circle
        className="oracle-iris"
        cx="12" cy="12" r="3.5"
        stroke="currentColor" strokeWidth="1" opacity="0.7" fill="none"
        style={{ transformOrigin: "12px 12px" }}
      />
      {/* Pupil */}
      <circle
        className="oracle-pupil"
        cx="12" cy="12" r="1.6"
        fill="currentColor"
        style={{ transformOrigin: "12px 12px" }}
      />
    </svg>
  );
}
