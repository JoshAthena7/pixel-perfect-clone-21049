import type { ReactNode } from "react";

export function ErrorBanner({ children }: { children: ReactNode }) {
  return (
    <div
      className="rounded px-3 py-2"
      style={{
        background: "rgba(224,74,74,0.08)",
        border: "1px solid rgba(224,74,74,0.25)",
        color: "rgba(240,128,128,0.9)",
        fontSize: 11,
      }}
    >
      {children}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div
      className="rounded-lg text-center italic py-10 px-4"
      style={{
        background: "rgba(255,255,255,0.02)",
        border: "1px dashed rgba(255,255,255,0.08)",
        color: "rgba(255,255,255,0.45)",
        fontSize: 12,
      }}
    >
      {children}
    </div>
  );
}

export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-lg animate-pulse"
          style={{
            height: 80,
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.05)",
          }}
        />
      ))}
    </div>
  );
}

export function OlympusLink({ children }: { children: ReactNode }) {
  return (
    <div className="text-right">
      <span style={{ fontSize: 10, color: "#C49A2B", fontStyle: "italic" }}>{children}</span>
    </div>
  );
}
