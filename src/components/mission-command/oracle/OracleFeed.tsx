import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { shareFeedItemWithTeam } from "@/lib/oracle.functions";
import { runIntelligenceCheck } from "@/lib/intelligence-monitoring.functions";
import type { Database } from "@/integrations/supabase/types";

type FeedItem = Database["public"]["Tables"]["intelligence_feed_items"]["Row"];

const CATEGORY_COLOR: Record<string, string> = {
  federal_policy: "#4A6FA5",
  state_policy: "#1A7A8C",
  legislative: "#8E44AD",
  competitive: "#C0392B",
  research: "#1A7A4A",
  news: "#5D6D7E",
};

const CATEGORY_LABEL: Record<string, string> = {
  federal_policy: "Federal Policy",
  state_policy: "State Policy",
  legislative: "Legislative",
  competitive: "Competitive",
  research: "Research",
  news: "News",
};

export function OracleFeed({ missionId }: { missionId: string }) {
  const qc = useQueryClient();
  const [category, setCategory] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [relevance, setRelevance] = useState<string>("all");
  const [range, setRange] = useState<string>("7d");
  const [search, setSearch] = useState("");

  const [newIds, setNewIds] = useState<Record<string, number>>({});
  const [running, setRunning] = useState(false);

  const share = useServerFn(shareFeedItemWithTeam);
  const runCheck = useServerFn(runIntelligenceCheck);

  const { data: items = [] } = useQuery({
    queryKey: ["oracle-feed", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("intelligence_feed_items")
        .select("*")
        .eq("mission_id", missionId)
        .order("created_at", { ascending: false });
      return (data ?? []) as FeedItem[];
    },
  });

  const { data: lastCheckedAt } = useQuery({
    queryKey: ["oracle-feed-last-checked", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("intelligence_feed_configs")
        .select("last_checked_at")
        .eq("mission_id", missionId)
        .order("last_checked_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      return (data as { last_checked_at: string | null } | null)?.last_checked_at ?? null;
    },
    refetchInterval: 30000,
  });

  // Realtime: surface newly-inserted feed items without a page refresh.
  useEffect(() => {
    const channel = supabase
      .channel(`oracle-feed-${missionId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "intelligence_feed_items", filter: `mission_id=eq.${missionId}` },
        (payload) => {
          const row = payload.new as FeedItem;
          qc.setQueryData<FeedItem[]>(["oracle-feed", missionId], (prev = []) =>
            prev.some((p) => p.id === row.id) ? prev : [row, ...prev],
          );
          setNewIds((m) => ({ ...m, [row.id]: Date.now() }));
          setTimeout(() => setNewIds((m) => { const { [row.id]: _drop, ...rest } = m; return rest; }), 10000);
          toast(`IRIS surfaced new intelligence: ${row.headline.slice(0, 60)}${row.headline.length > 60 ? "…" : ""}`);
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [missionId, qc]);

  const onRunCheck = async () => {
    setRunning(true);
    try {
      const r = await runCheck({ data: { missionId } });
      toast.success(`Intelligence check complete. ${r.items_created} new items found across ${r.feeds_checked} feeds.`);
      qc.invalidateQueries({ queryKey: ["oracle-feed", missionId] });
      qc.invalidateQueries({ queryKey: ["oracle-feed-last-checked", missionId] });
      qc.invalidateQueries({ queryKey: ["oracle-graph", missionId] });
    } catch (err) {
      console.error(err);
      toast.error("Intelligence check failed. Please try again.");
    } finally {
      setRunning(false);
    }
  };

  const filtered = useMemo(() => {
    const now = Date.now();
    const cutoff = range === "7d" ? now - 7 * 86400000 : range === "30d" ? now - 30 * 86400000 : 0;
    return items.filter((i) => {
      if (category !== "all" && i.category !== category) return false;
      if (statusFilter === "unreviewed" && (i.is_reviewed || i.is_dismissed)) return false;
      if (statusFilter === "reviewed" && !i.is_reviewed) return false;
      if (statusFilter === "dismissed" && !i.is_dismissed) return false;
      if (statusFilter === "active" && i.is_dismissed) return false;
      if (relevance === "high" && i.iris_relevance_score < 70) return false;
      if (relevance === "med" && (i.iris_relevance_score < 40 || i.iris_relevance_score >= 70)) return false;
      if (relevance === "low" && i.iris_relevance_score >= 40) return false;
      if (cutoff && new Date(i.created_at).getTime() < cutoff) return false;
      if (search && !`${i.headline} ${i.iris_assessment ?? ""}`.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [items, category, statusFilter, relevance, range, search]);

  const summary = useMemo(() => {
    const recent = items.filter((i) => Date.now() - new Date(i.created_at).getTime() < 7 * 86400000 && !i.is_dismissed);
    const attention = recent.filter((i) => i.iris_relevance_score >= 70).length;
    const sections = recent.filter((i) => (i.affected_section_ids ?? []).length > 0).length;
    return { total: recent.length, attention, sections };
  }, [items]);

  const setField = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<FeedItem> }) => {
      await supabase.from("intelligence_feed_items").update(patch).eq("id", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["oracle-feed", missionId] }),
  });

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-4 text-sm flex items-start justify-between gap-3">
        <div>
          In the last 7 days IRIS surfaced <strong>{summary.total}</strong> intelligence items.{" "}
          <strong>{summary.attention}</strong> require attention. <strong>{summary.sections}</strong> affect sections currently being written.
          <div className="text-xs text-muted-foreground mt-1">
            {lastCheckedAt
              ? <>Feeds last checked: {formatDistanceToNow(new Date(lastCheckedAt), { addSuffix: true })}</>
              : <>Feeds have not been checked yet.</>}
          </div>
        </div>
        <Button size="sm" onClick={onRunCheck} disabled={running} className="shrink-0">
          {running
            ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Checking feeds…</>
            : <><Sparkles className="h-3 w-3 mr-1" /> Run Intelligence Check</>}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="text-xs border rounded px-2 py-1 bg-background">
          <option value="all">All categories</option>
          {Object.entries(CATEGORY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="text-xs border rounded px-2 py-1 bg-background">
          <option value="active">Active</option>
          <option value="all">All</option>
          <option value="unreviewed">Unreviewed</option>
          <option value="reviewed">Reviewed</option>
          <option value="dismissed">Dismissed</option>
        </select>
        <select value={relevance} onChange={(e) => setRelevance(e.target.value)} className="text-xs border rounded px-2 py-1 bg-background">
          <option value="all">All relevance</option>
          <option value="high">High (70+)</option>
          <option value="med">Medium (40-69)</option>
          <option value="low">Low (under 40)</option>
        </select>
        <select value={range} onChange={(e) => setRange(e.target.value)} className="text-xs border rounded px-2 py-1 bg-background">
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="all">All time</option>
        </select>
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="h-8 max-w-xs" />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded border bg-card p-6 text-center text-sm text-muted-foreground">
          {items.length === 0
            ? "No intelligence items yet. IRIS will begin surfacing intelligence after BLAST OFF when monitoring feeds are activated."
            : "All caught up. IRIS will surface new items as your feeds update."}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((i) => {
            const relColor = i.iris_relevance_score >= 70 ? "#C9A55C" : i.iris_relevance_score >= 40 ? "#D4800A" : "#94A3B8";
            return (
              <div key={i.id} className={`rounded-lg border bg-card p-4 border-l-4 ${i.is_reviewed ? "opacity-70" : ""}`}
                style={{ borderLeftColor: CATEGORY_COLOR[i.category] ?? "#888" }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <Badge variant="outline" className="text-[10px]">{CATEGORY_LABEL[i.category] ?? i.category}</Badge>
                    <h4 className="font-semibold mt-1">{i.headline}</h4>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {i.source_name ?? "Unknown source"} · {i.published_at ? new Date(i.published_at).toLocaleDateString() : ""}
                    </div>
                    {i.iris_assessment && <p className="text-sm italic mt-2" style={{ color: "#9C7A2C" }}>{i.iris_assessment}</p>}
                    {i.recommended_action && <p className="text-xs text-muted-foreground mt-1">{i.recommended_action}</p>}
                  </div>
                  <Badge style={{ background: relColor, color: "#fff" }} className="shrink-0 text-[10px]">
                    Relevance: {i.iris_relevance_score}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-2 mt-3 justify-end">
                  {i.source_url && <Button size="sm" variant="outline" asChild><a href={i.source_url} target="_blank" rel="noreferrer">View Source</a></Button>}
                  <Button size="sm" variant="outline" disabled={i.is_shared_with_team}
                    onClick={async () => { try { const r = await share({ data: { feedItemId: i.id } }); toast.success(`Shared with ${r.recipients} team members`); qc.invalidateQueries({ queryKey: ["oracle-feed", missionId] }); } catch (e) { toast.error((e as Error).message); } }}>
                    {i.is_shared_with_team ? "Shared" : "Share with Team"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setField.mutate({ id: i.id, patch: { is_dismissed: true } })}>Dismiss</Button>
                  <Button size="sm" variant="ghost" onClick={() => setField.mutate({ id: i.id, patch: { is_reviewed: true } })}>Mark Reviewed</Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
