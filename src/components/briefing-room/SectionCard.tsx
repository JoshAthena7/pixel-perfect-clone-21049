import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";

export function SectionCard({
  title,
  children,
  editInOlympusHref,
  showAdminEdit,
  bare,
}: {
  title: string;
  children: ReactNode;
  editInOlympusHref?: string;
  showAdminEdit?: boolean;
  bare?: boolean;
}) {
  return (
    <section
      className="rounded-2xl"
      style={
        bare
          ? undefined
          : {
              background: "rgba(255,255,255,0.02)",
              border: "0.5px solid rgba(255,255,255,0.06)",
              padding: 20,
            }
      }
    >
      <header className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 style={{ color: "white", fontSize: 13, fontWeight: 500 }}>{title}</h2>
          <span
            className="inline-flex items-center rounded-full"
            style={{
              fontSize: 8,
              padding: "2px 7px",
              color: "rgba(255,255,255,0.35)",
              background: "rgba(255,255,255,0.05)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              fontWeight: 500,
            }}
          >
            Read only
          </span>
        </div>
        {showAdminEdit && editInOlympusHref && (
          <a
            href={editInOlympusHref}
            className="inline-flex items-center gap-1 hover:opacity-80"
            style={{ color: "#C49A2B", fontSize: 10 }}
          >
            Edit in Olympus
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </header>
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, fontStyle: "italic" }}>
      {children}
    </div>
  );
}

export function SectionSkeleton({ height = 120 }: { height?: number }) {
  return (
    <div
      className="rounded-2xl animate-pulse"
      style={{
        background: "rgba(255,255,255,0.02)",
        border: "0.5px solid rgba(255,255,255,0.06)",
        padding: 20,
        height,
      }}
    />
  );
}
