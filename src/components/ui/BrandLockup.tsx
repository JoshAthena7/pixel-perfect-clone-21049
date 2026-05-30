import { cn } from "@/lib/utils";

type Size = "sm" | "md" | "lg";

const MARK_PX: Record<Size, number> = { sm: 28, md: 36, lg: 48 };
const TITLE_PX: Record<Size, string> = { sm: "18px", md: "24px", lg: "32px" };
const SUB_PX: Record<Size, string> = { sm: "11px", md: "14px", lg: "18px" };

interface Props {
  size?: Size;
  /** Hide the text block; show mark only (e.g. collapsed sidebars / mobile). */
  markOnly?: boolean;
  className?: string;
}

const GOLD = "#C49A2A";

/**
 * Brand lockup matching the Athena Strategy Group logo:
 *   - Bebas Neue "ATHENA" (flat-top triangular A) in white, with a gold
 *     triangle nested inside the first A.
 *   - Quicksand "Strategy Group" in gold (rounded geometric).
 * Mark renders white on dark surfaces via CSS filter.
 */
export function BrandLockup({ size = "md", markOnly = false, className }: Props) {
  const m = MARK_PX[size];
  const titlePx = TITLE_PX[size];
  // Gold inner triangle scaled to the A's counter
  const triSize = `calc(${titlePx} * 0.32)`;

  return (
    <div className={cn("flex items-center gap-3 select-none", className)}>
      <img
        src="/athena-mark.png"
        alt="Athena"
        width={m}
        height={m}
        draggable={false}
        style={{ height: m, width: m, filter: "brightness(0) invert(1)" }}
        className="block shrink-0"
      />
      {!markOnly && (
        <div className="flex flex-col leading-none">
          <span
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: titlePx,
              letterSpacing: "0.08em",
              fontWeight: 400,
              color: "#FFFFFF",
              position: "relative",
              display: "inline-block",
              lineHeight: 1,
            }}
          >
            ATHENA
            {/* Gold triangle nested inside the first A's counter */}
            <span
              aria-hidden
              style={{
                position: "absolute",
                left: `calc(${titlePx} * 0.12)`,
                bottom: 0,
                width: 0,
                height: 0,
                borderLeft: `calc(${triSize} / 2) solid transparent`,
                borderRight: `calc(${triSize} / 2) solid transparent`,
                borderBottom: `${triSize} solid ${GOLD}`,
              }}
            />
          </span>
          <span
            style={{
              fontFamily: "'Quicksand', sans-serif",
              fontSize: SUB_PX[size],
              fontWeight: 600,
              color: GOLD,
              marginTop: 4,
              letterSpacing: "0.01em",
            }}
          >
            Strategy Group
          </span>
        </div>
      )}
    </div>
  );
}

export default BrandLockup;
