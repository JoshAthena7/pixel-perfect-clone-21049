import { Zap } from "lucide-react";
import type { ReactNode } from "react";

export function IrisBadge({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] ${className}`}
      style={{ color: "var(--v1-iris)", background: "color-mix(in oklab, var(--v1-iris) 12%, transparent)" }}
    >
      <Zap className="h-3 w-3" fill="currentColor" />
      {children ?? "IRIS"}
    </span>
  );
}

export function IrisDot() {
  return <Zap className="h-3 w-3 inline" style={{ color: "var(--v1-iris)" }} fill="currentColor" />;
}
