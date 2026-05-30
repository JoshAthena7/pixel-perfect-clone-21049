import { cn } from "@/lib/utils";

type Size = "sm" | "md" | "lg";

const MARK_PX: Record<Size, number> = { sm: 28, md: 36, lg: 48 };
const TITLE_PX: Record<Size, string> = { sm: "12px", md: "14px", lg: "18px" };
const SUB_PX: Record<Size, string> = { sm: "9px", md: "10px", lg: "12px" };

interface Props {
  size?: Size;
  /** Hide the text block; show mark only (e.g. collapsed sidebars / mobile). */
  markOnly?: boolean;
  className?: string;
}

/**
 * Dark-surface brand lockup: circular mark rendered pure white via CSS filter,
 * with "ATHENA" in white + "COMMAND™" in gold as styled HTML text.
 * Designed for dark backgrounds (topbar, sidebars, command surfaces) — never
 * use the white-background full lockup on dark UI.
 */
export function BrandLockup({ size = "md", markOnly = false, className }: Props) {
  const m = MARK_PX[size];
  return (
    <div className={cn("flex items-center gap-2.5 select-none", className)}>
      <img
        src="/athena-mark.png"
        alt="Athena"
        width={m}
        height={m}
        draggable={false}
        style={{
          height: m,
          width: m,
          filter: "brightness(0) invert(1)",
        }}
        className="block shrink-0"
      />
      {!markOnly && (
        <div className="flex flex-col leading-none">
          <span
            style={{
              fontSize: TITLE_PX[size],
              letterSpacing: "0.16em",
              fontWeight: 700,
            }}
            className="uppercase text-white"
          >
            Athena
          </span>
          <span
            style={{
              fontSize: SUB_PX[size],
              letterSpacing: "0.22em",
              fontWeight: 600,
              color: "#C49A2A",
              marginTop: 3,
            }}
            className="uppercase"
          >
            Command™
          </span>
        </div>
      )}
    </div>
  );
}

export default BrandLockup;
