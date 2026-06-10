// IRIS mark — mystical eye + star + sacred geometry, distilled for UI sizes.
// Uses currentColor so it inherits the parent color; pass `className` for sizing.
import type { SVGProps } from "react";

export function IrisMark({
  className,
  glow = false,
  size,
  ...props
}: Omit<SVGProps<SVGSVGElement>, "size"> & { glow?: boolean; size?: number }) {
  const sizeProps = size ? { width: size, height: size } : {};
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      style={glow ? { filter: "drop-shadow(0 0 6px currentColor)" } : undefined}
      {...sizeProps}
      {...props}
    >
      {/* outer ring (wisdom / wholeness) */}
      <circle cx="16" cy="16" r="13" opacity="0.45" />
      {/* sacred-geometry vertical + horizontal axes */}
      <line x1="16" y1="3" x2="16" y2="29" opacity="0.25" />
      <line x1="3" y1="16" x2="29" y2="16" opacity="0.25" />
      {/* eye / iris almond shape */}
      <path d="M4 16 Q16 6 28 16 Q16 26 4 16 Z" />
      {/* inner iris circle */}
      <circle cx="16" cy="16" r="4.5" />
      {/* four-point guidance star at the pupil */}
      <path
        d="M16 11.5 L17 15 L20.5 16 L17 17 L16 20.5 L15 17 L11.5 16 L15 15 Z"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}
