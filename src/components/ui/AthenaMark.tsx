import { cn } from "@/lib/utils";

type Size = "sm" | "md" | "lg";
type Variant = "mark" | "lockup";
type Tone = "color" | "white";

const HEIGHTS: Record<Size, number> = {
  sm: 32, // mark only
  md: 44, // full lockup
  lg: 64, // full lockup
};

interface Props {
  size?: Size;
  variant?: Variant;
  tone?: Tone;
  className?: string;
}

/**
 * Athena Strategy Group logo lockup.
 * - sm → 32px circular mark only (chrome, mobile topbars, favicons)
 * - md → 44px full lockup
 * - lg → 64px full lockup (heroes, login)
 * tone="color" for white backgrounds, tone="white" for dark backgrounds.
 */
export function AthenaMark({
  size = "md",
  variant,
  tone = "color",
  className,
}: Props) {
  const h = HEIGHTS[size];
  // sm defaults to mark-only per spec; md/lg default to lockup
  const v: Variant = variant ?? (size === "sm" ? "mark" : "lockup");
  const file =
    v === "mark"
      ? tone === "white"
        ? "/athena-mark-white.png"
        : "/athena-mark.png"
      : tone === "white"
        ? "/athena-logo-white.png"
        : "/athena-logo.png";

  return (
    <img
      src={file}
      alt="Athena Strategy Group"
      height={h}
      style={{ height: h, width: "auto" }}
      className={cn("block select-none", className)}
      draggable={false}
    />
  );
}

export default AthenaMark;
