import { cn } from "@/lib/utils";

type Size = "sm" | "md" | "lg" | "xl";
type Variant = "mark" | "lockup";
type Tone = "color" | "white";

const heights: Record<Size, number> = {
  sm: 32,
  md: 40,
  lg: 60,
  xl: 96,
};

interface Props {
  size?: Size;
  variant?: Variant;
  tone?: Tone;
  className?: string;
}

/**
 * Athena Strategy Group logo.
 * - tone="color" → navy + gold on light/white backgrounds
 * - tone="white" → white + gold on dark backgrounds
 * - variant="mark" → circular pinwheel mark only (best for favicons, tight chrome)
 * - variant="lockup" → mark + wordmark
 */
export function AthenaMark({
  size = "md",
  variant = "lockup",
  tone = "color",
  className,
}: Props) {
  const h = heights[size];
  const file =
    variant === "mark"
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
