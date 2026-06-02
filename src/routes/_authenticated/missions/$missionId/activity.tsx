import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { relativeTime } from "@/lib/signals";

export const Route = createFileRoute("/_authenticated/missions/$missionId/activity")({
  component: ActivityPage,
});

type Filter = "All" | "Documents" | "Signals" | "Decisions" | "Comments" | "IRIS";
const FILTERS: Filter[] = ["All", "Documents", "Signals", "Decisions", "Comments", "IRIS"];

type FeedItem = {
  id: string;
  kind: Filter;
  actor: string;
  text: string;
  at: string;
};

function ActivityPage() {
  const { missionId } = Route.useParams();
  const [filter, setFilter] = useState<Filter>("All");

  const sinceIso = new Date(Date.now() - 7 * 86400000).toISOString();

  const { data: feed = [] } = useQuery<FeedItem[]>({
    queryKey: ["mission-activity", missionId, sinceIso],
    queryFn: async () => {
      const items: FeedItem[] = [];
      const [docs, sigs, decs] = await Promise.all([
        supabase.from("mission_library")
          .select("id,name,created_at,added_by").eq("mission_id", missionId)
          .gte("created_at", sinceIso).order("created_at", { ascending: false }).limit(50),
        supabase.from("signals")
          .select("id,signal_title,signal_type,source_module,created_at")
          .eq("mission_id", missionId).gte("created_at", sinceIso)
          .order("created_at", { ascending: false }).limit(100),
        supabase.from("mission_decisions")
          .select("id,title,owner,created_at").eq("mission_id", missionId)
          .gte("created_at", sinceIso).order("created_at", { ascending: false }).limit(50),
      ]);

      for (const d of docs.data ?? []) {
        items.push({
          id: `doc-${d.id}`, kind: "Documents",
          actor: "Someone", text: `uploaded ${d.name}`, at: d.created_at ?? new Date().toISOString(),
        });
      }
      for (const s of sigs.data ?? []) {
        const isIris = s.source_module === "iris" || s.source_module === "IRIS";
        items.push({
          id: `sig-${s.id}`, kind: isIris ? "IRIS" : "Signals",
          actor: isIris ? "IRIS" : "Someone",
          text: isIris ? `updated ${s.signal_title}` : `submitted signal: ${s.signal_title}`,
          at: s.created_at ?? new Date().toISOString(),
        });
      }
      for (const d of decs.data ?? []) {
        items.push({
          id: `dec-${d.id}`, kind: "Decisions",
          actor: d.owner ?? "Someone", text: `logged decision: ${d.title}`, at: d.created_at ?? new Date().toISOString(),
        });
      }
      items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
      return items;
    },
  });

  const filtered = filter === "All" ? feed : feed.filter((i) => i.kind === filter);

  return (
    <div className="mx-auto max-w-[1100px] px-8 py-10 space-y-6">
      <header>
        <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
          Mission Activity
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Activity</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Reverse-chronological feed of what has happened on this mission. Last 7 days.
        </p>
      </header>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
              filter === f
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border text-muted-foreground hover:bg-surface-hover hover:text-foreground"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <section className="rounded-[12px] border border-border bg-surface">
        {filtered.length === 0 ? (
          <p className="px-5 py-8 text-sm text-muted-foreground text-center">No activity in this window.</p>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((i) => (
              <li key={i.id} className="flex items-start gap-3 px-5 py-3">
                <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground w-20 shrink-0 mt-0.5">
                  {i.kind}
                </span>
                <div className="min-w-0 flex-1 text-sm">
                  <span className="font-medium text-foreground/90">{i.actor}</span>{" "}
                  <span className="text-foreground/80">{i.text}</span>
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0">{relativeTime(i.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
