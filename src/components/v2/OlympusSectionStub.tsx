import { Link } from "@tanstack/react-router";
import { Construction } from "lucide-react";

export function SectionStub({
  eyebrow, title, description, phase, missionId,
}: {
  eyebrow: string;
  title: string;
  description: string;
  phase: string;
  missionId?: string | null;
}) {
  return (
    <div className="mx-auto max-w-4xl px-8 py-8">
      <header className="mb-6">
        <div className="h2-label" style={{ letterSpacing: "0.32em" }}>{eyebrow}</div>
        <h1 className="h1-display mt-1">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-2xl">{description}</p>
      </header>

      <div className="rounded-[10px] border border-dashed border-border bg-surface/40 p-10 text-center">
        <Construction className="mx-auto mb-3 h-8 w-8 text-muted-foreground opacity-60" />
        <div className="text-sm font-medium text-foreground">{phase} — under construction</div>
        <p className="mt-2 text-xs text-muted-foreground max-w-md mx-auto">
          The Olympus shell and Missions section are live. This section ships next.
        </p>
        {missionId && (
          <div className="mt-4 text-[11px] text-muted-foreground">
            Active mission context: <code className="text-foreground">{missionId.slice(0, 8)}…</code>
          </div>
        )}
        <div className="mt-5 flex items-center justify-center gap-2">
          <Link to="/olympus" className="rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-surface-hover">← Back to Missions</Link>
          {missionId && (
            <Link to="/missions/$missionId/overview" params={{ missionId }}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-surface-hover">
              Open Mission →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
