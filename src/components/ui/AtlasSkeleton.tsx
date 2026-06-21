import { cn } from "@/lib/utils";

/**
 * Reusable shimmer skeleton primitive. Uses background-position animation
 * (CPU paint, but cheap for small surfaces). Respects prefers-reduced-motion
 * via the global rule in styles.css.
 */
export function AtlasSkeleton({
  width,
  height,
  borderRadius = 4,
  className,
  style,
}: {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      aria-hidden
      className={cn("atlas-skeleton", className)}
      style={{
        width,
        height,
        borderRadius,
        ...style,
      }}
    />
  );
}
