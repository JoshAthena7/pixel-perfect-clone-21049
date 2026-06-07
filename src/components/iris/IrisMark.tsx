import irisMarkAsset from "@/assets/iris-mark.png.asset.json";

/**
 * IRIS brand mark — mystical eye-and-star symbol.
 * Indigo · violet · cyan. Use anywhere IRIS is represented visually.
 *
 *   <IrisMark size={28} />
 *   <IrisMark size={48} glow />
 *   <IrisMark size={20} aria-label="Ask IRIS" />
 */
export function IrisMark({
  size = 24,
  glow = false,
  className = "",
  ...rest
}: {
  size?: number;
  glow?: boolean;
  className?: string;
} & Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src" | "width" | "height">) {
  return (
    <img
      src={irisMarkAsset.url}
      alt={rest["aria-label"] ?? "IRIS"}
      width={size}
      height={size}
      loading="lazy"
      draggable={false}
      className={`select-none shrink-0 ${className}`}
      style={{
        filter: glow
          ? "drop-shadow(0 0 12px rgba(139,109,255,0.55)) drop-shadow(0 0 24px rgba(103,232,249,0.25))"
          : "drop-shadow(0 0 6px rgba(139,109,255,0.35))",
      }}
      {...rest}
    />
  );
}
