import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Compass } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { relativeTime } from "@/lib/signals";

export const Route = createFileRoute("/_authenticated/pathfinder")({
  component: Pathfinder,
});

function Pathfinder() {
  const { data: intel = [] } = useQuery({
    queryKey: ["pathfinder-market-intel"],
    queryFn: async () => {
      const { data } = await supabase
        .from("market_intelligence")
        .select("id,title,summary,category,source_url,published_at,created_at")
        .order("created_at", { ascending: false })
        .limit(40);
      return data ?? [];
    },
  });

  return (
    <div className="mx-auto max-w-[1100px] px-8 py-10">
      <div className="mb-6 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.32em] text-muted-foreground">
        <Compass className="h-3.5 w-3.5 text-primary" /> Pathfinder
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">Win/loss signals & competitive intelligence</h1>
      <p className="mt-2 text-sm text-muted-foreground">Firm-wide signals worth watching — competitor moves, market shifts, and pattern matches across past pursuits.</p>

      <section className="mt-8 rounded-[12px] border border-border bg-surface">
        <ul className="divide-y divide-border">
          {intel.length === 0 && (
            <li className="px-5 py-10 text-center text-sm text-muted-foreground">No signals yet. Pathfinder will surface competitive intelligence as it arrives.</li>
          )}
          {intel.map((it: any) => (
            <li key={it.id} className="px-5 py-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">{it.category ?? "Signal"}</span>
                <span className="text-[10px] text-muted-foreground">{relativeTime(it.created_at)}</span>
              </div>
              <div className="mt-1 text-sm font-semibold text-foreground">{it.title}</div>
              {it.summary && <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{it.summary}</p>}
              {it.source_url && (
                <a href={it.source_url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[11px] text-primary hover:underline">Source →</a>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
