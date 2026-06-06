import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { getRecentChanges } from "@/lib/iris-graph.functions";
import { ArrowRight, Activity } from "lucide-react";
import { relativeTime } from "@/lib/signals";

const KIND_LABEL: Record<string, string> = {
  signal: "Signal",
  risk: "Risk",
  win_theme: "Win Theme",
  state_priority: "State Priority",
  client_intel: "Client Intel",
};

const KIND_DOT: Record<string, string> = {
  signal: "bg-sky-400",
  risk: "bg-destructive",
  win_theme: "bg-emerald-400",
  state_priority: "bg-amber-400",
  client_intel: "bg-violet-400",
};

/**
 * Compact "what changed in the last 7 days" feed for the Home / Atrium
 * landing. Reads soft-expired and newly-created graph nodes via
 * `getRecentChanges`. Renders nothing if there's no activity — it's a
 * radar, not a placeholder.
 */
export function RecentChangesCard({ missionId }: { missionId: string }) {
  const fn = useServerFn(getRecentChanges);
  const { data } = useQuery({
    queryKey: ["iris-recent-changes", missionId],
    queryFn: () => fn({ data: { missionId, days: 7 } }),
    refetchInterval: 120_000,
    retry: false,
    throwOnError: false,
  });

  const changes = data?.changes ?? [];
  if (changes.length === 0) return null;

  return (
    <section>
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h2 className="h2-label">What changed</h2>
          <p className="mt-1.5 text-2xl font-semibold tracking-tight">
            <span className="inline-flex items-center gap-2">
              <Activity className="h-5 w-5 text-muted-foreground" />
              {changes.length} {changes.length === 1 ? "update" : "updates"} in the last 7 days
            </span>
          </p>
        </div>
        <Link
          to="/atrium"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          Open Atrium <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <ul className="divide-y divide-border rounded-[12px] border border-border bg-surface">
        {changes.slice(0, 8).map((c) => (
          <li key={`${c.id}-${c.change}`} className="flex items-center gap-3 px-5 py-3">
            <span className={`h-1.5 w-1.5 rounded-full ${KIND_DOT[c.kind] ?? "bg-muted-foreground"}`} />
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground w-[88px]">
              {KIND_LABEL[c.kind] ?? c.kind}
            </span>
            <span className="flex-1 min-w-0 truncate text-sm text-foreground">{c.label}</span>
            <span
              className={`shrink-0 text-[10px] font-semibold uppercase tracking-[0.18em] ${
                c.change === "added" ? "text-emerald-400" : "text-muted-foreground"
              }`}
            >
              {c.change === "added" ? "New" : "Retired"}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {relativeTime(c.at)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
