// IRIS mark — official logo asset (eye + sacred geometry + star).
// Rendered as an <img> backed by the CDN-hosted brand asset.
import type { ImgHTMLAttributes } from "react";
import irisMarkAsset from "@/assets/iris-mark.png.asset.json";

export function IrisMark({
  className,
  glow = false,
  blink = true,
  size,
  style,
  ...props
}: Omit<ImgHTMLAttributes<HTMLImageElement>, "size" | "src" | "alt"> & {
  glow?: boolean;
  blink?: boolean;
  size?: number;
}) {
  const sizeStyle = size ? { width: size, height: size } : {};
  return (
    <>
      <style>{`
        @keyframes iris-blink {
          0%, 92%, 100% { transform: scaleY(1); }
          94% { transform: scaleY(0.08); }
          96% { transform: scaleY(1); }
        }
        @keyframes iris-blink-double {
          0%, 45%, 53%, 100% { transform: scaleY(1); }
          48%, 56% { transform: scaleY(0.08); }
        }
      `}</style>
      <img
        src={irisMarkAsset.url}
        alt=""
        aria-hidden="true"
        draggable={false}
        className={className}
        style={{
          objectFit: "contain",
          transformOrigin: "center",
          ...sizeStyle,
          ...(blink ? { animation: "iris-blink 6s ease-in-out infinite" } : {}),
          ...(glow ? { filter: "drop-shadow(0 0 8px rgba(167,139,250,0.55))" } : {}),
          ...style,
        }}
        {...props}
      />
    </>
  );
}
