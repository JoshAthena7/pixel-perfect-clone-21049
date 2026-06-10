// IRIS mark — official logo asset (eye + sacred geometry + star).
// Rendered as an <img> backed by the CDN-hosted brand asset.
import type { ImgHTMLAttributes } from "react";
import irisMarkAsset from "@/assets/iris-mark.png.asset.json";

export function IrisMark({
  className,
  glow = false,
  size,
  style,
  ...props
}: Omit<ImgHTMLAttributes<HTMLImageElement>, "size" | "src" | "alt"> & {
  glow?: boolean;
  size?: number;
}) {
  const sizeStyle = size ? { width: size, height: size } : {};
  return (
    <img
      src={irisMarkAsset.url}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={className}
      style={{
        objectFit: "contain",
        ...sizeStyle,
        ...(glow ? { filter: "drop-shadow(0 0 8px rgba(167,139,250,0.55))" } : {}),
        ...style,
      }}
      {...props}
    />
  );
}
