import { useEffect, useState } from "react";
import { useEngagement } from "@/hooks/use-engagement";

/**
 * Diagonal repeating watermark rendered as DOM elements (not a CSS background)
 * so it can't be removed by toggling a background-image property in DevTools.
 * Renders user display name + current timestamp, ~7% opacity, fixed overlay
 * with pointer-events:none.
 */
export function Watermark({ label }: { label?: string }) {
  const { member } = useEngagement();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const text = `${label ?? member?.display_name ?? "Confidential"} · ${now.toLocaleString()}`;
  // Tile a grid of rotated labels
  const rows = 8;
  const cols = 4;

  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9,
        pointerEvents: "none",
        overflow: "hidden",
        userSelect: "none",
      }}
    >
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          style={{
            position: "absolute",
            top: `${(r / rows) * 100}%`,
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "space-around",
            transform: "rotate(-30deg)",
            transformOrigin: "left center",
          }}
        >
          {Array.from({ length: cols }).map((_, c) => (
            <span
              key={c}
              style={{
                fontSize: "12px",
                letterSpacing: "0.15em",
                color: "white",
                opacity: 0.07,
                whiteSpace: "nowrap",
                fontWeight: 600,
                textTransform: "uppercase",
              }}
            >
              {text}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
