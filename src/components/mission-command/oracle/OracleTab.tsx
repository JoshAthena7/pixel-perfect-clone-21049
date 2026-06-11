import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Sparkles, Zap, Plus } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { buildIntelligenceGraph, generateMissionBrief } from "@/lib/oracle.functions";
import { refreshAllMissionFeeds } from "@/lib/iris-refresh-all.functions";
import { OracleGraph } from "./OracleGraph";
import { OracleFeed } from "./OracleFeed";
import { OracleStakeholders } from "./OracleStakeholders";
import { OracleCompetitors } from "./OracleCompetitors";
import { OracleProcurementEvolution } from "./OracleProcurementEvolution";
import { IntelligenceLibraryTab } from "@/components/mission-command/IntelligenceLibraryTab";

const SUB_TABS = [
  { id: "graph", label: "Graph", hint: "Intelligence network map" },
  { id: "feed", label: "Intelligence Feed", hint: "Live monitoring updates" },
  { id: "stakeholders", label: "Stakeholders", hint: "Evaluators and influencers" },
  { id: "competitors", label: "Competitors", hint: "Competitive landscape" },
  { id: "evolution", label: "Procurement Evolution", hint: "How this RFP changed" },
  { id: "research-library", label: "Research Library", hint: "Documents and resources" },
] as const;
type SubId = (typeof SUB_TABS)[number]["id"];

const GOLD = "#C9A55C";

export function OracleTab({ missionId }: { missionId: string }) {
  const navigate = useNavigate();
  const search = useSearch({ from: "/_authenticated/olympus/missions/$missionId/" }) as {
    sub?: string;
    tab?: string;
    add?: string;
  };
  const active: SubId = (SUB_TABS.find((t) => t.id === search.sub)?.id ?? "graph") as SubId;
  const setSub = (sub: SubId, extra: Record<string, unknown> = {}) =>
    navigate({
      to: "/olympus/missions/$missionId",
      params: { missionId },
      search: (prev: Record<string, unknown>) => ({ ...prev, tab: "oracle", sub, ...extra }),
    });

  const [briefOpen, setBriefOpen] = useState(false);
  const [briefText, setBriefText] = useState<string>("");
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefAt, setBriefAt] = useState<number>(0);
  const [building, setBuilding] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const build = useServerFn(buildIntelligenceGraph);
  const brief = useServerFn(generateMissionBrief);
  const refreshFeeds = useServerFn(refreshAllMissionFeeds);

  const { data: mission } = useQuery({
    queryKey: ["oracle-mission", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("missions")
        .select("id,name,intelligence_graph_completeness")
        .eq("id", missionId)
        .single();
      return data;
    },
  });

  const { data: lastFeed } = useQuery({
    queryKey: ["oracle-last-feed", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("intelligence_feed_items")
        .select("created_at")
        .eq("mission_id", missionId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  // Counts powering sub-tab alert indicators.
  const { data: subCounts } = useQuery({
    queryKey: ["oracle-sub-counts", missionId],
    queryFn: async () => {
      const [feedHot, competitorCount, libraryCount] = await Promise.all([
        supabase
          .from("intelligence_feed_items")
          .select("id", { count: "exact", head: true })
          .eq("mission_id", missionId)
          .eq("is_reviewed", false)
          .gte("iris_relevance_score", 70),
        supabase
          .from("competitor_profiles")
          .select("id", { count: "exact", head: true })
          .eq("mission_id", missionId),
        supabase
          .from("mission_documents")
          .select("id", { count: "exact", head: true })
          .eq("mission_id", missionId),
      ]);
      return {
        feedHot: feedHot.count ?? 0,
        competitors: competitorCount.count ?? 0,
        library: libraryCount.count ?? 0,
      };
    },
    staleTime: 30_000,
  });

  // Auto-build graph if no nodes exist
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { count } = await supabase
        .from("intelligence_graph_nodes")
        .select("id", { count: "exact", head: true })
        .eq("mission_id", missionId);
      if (cancelled || (count ?? 0) > 0) return;
      setBuilding(true);
      try {
        await build({ data: { missionId } });
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setBuilding(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [missionId, build]);

  const openBrief = async () => {
    setBriefOpen(true);
    if (briefText && Date.now() - briefAt < 30 * 60_000) return;
    setBriefLoading(true);
    try {
      const r = await brief({ data: { missionId } });
      setBriefText(r.brief);
      setBriefAt(Date.now());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBriefLoading(false);
    }
  };

  const runIntelCheck = async () => {
    if (refreshing) return;
    setRefreshing(true);
    const tid = toast.loading("IRIS is running an intelligence check…");
    try {
      const [graphRes, feedsRes] = await Promise.allSettled([
        build({ data: { missionId, force: true } }),
        refreshFeeds({ data: { missionId } }),
      ]);
      const parts: string[] = [];
      if (graphRes.status === "fulfilled") {
        parts.push(
          `Graph: ${graphRes.value.created} nodes, ${graphRes.value.edges} edges (${graphRes.value.completeness}%)`,
        );
      } else {
        parts.push(`Graph failed: ${(graphRes.reason as Error).message}`);
      }
      if (feedsRes.status === "fulfilled") {
        parts.push(
          `Feeds: ${feedsRes.value.created} new items across ${feedsRes.value.feeds} sources`,
        );
      } else {
        parts.push(`Feeds failed: ${(feedsRes.reason as Error).message}`);
      }
      toast.success(parts.join(" · "), { id: tid });
    } catch (e) {
      toast.error((e as Error).message, { id: tid });
    } finally {
      setRefreshing(false);
    }
  };

  const addIntelligence = () => setSub("research-library", { add: 1 });

  const completeness = mission?.intelligence_graph_completeness ?? 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1
            className="text-white"
            style={{ fontSize: 20, fontWeight: 500, letterSpacing: "-0.01em" }}
          >
            Mission Intelligence
          </h1>
          <p className="mt-1" style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}>
            Your complete intelligence picture. Updated continuously by IRIS.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap justify-end">
          <div className="text-right">
            <div className="text-xs text-muted-foreground">
              {lastFeed?.created_at
                ? `IRIS last updated ${formatDistanceToNow(new Date(lastFeed.created_at), { addSuffix: true })}`
                : "No updates yet"}
            </div>
            <Badge className="mt-1 bg-[#C9A55C]/15 text-[#C9A55C] border-[#C9A55C]/40">
              Intelligence Graph: {completeness}%
            </Badge>
          </div>
          <Button
            variant="outline"
            className="border-[#C9A55C] text-[#C9A55C] hover:bg-[#C9A55C]/10"
            onClick={openBrief}
          >
            <Sparkles className="h-4 w-4 mr-1" /> Brief Me
          </Button>
          <Button variant="outline" disabled={refreshing} onClick={runIntelCheck}>
            <Zap className={`h-4 w-4 mr-1 ${refreshing ? "animate-pulse" : ""}`} />
            {refreshing ? "Checking…" : "Run Intelligence Check"}
          </Button>
          <Button onClick={addIntelligence}>
            <Plus className="h-4 w-4 mr-1" /> Add Intelligence
          </Button>
        </div>
      </div>

      {building && (
        <div className="rounded-md border border-[#C9A55C]/40 bg-[#C9A55C]/5 px-3 py-2 text-xs text-[#C9A55C] flex items-center gap-2">
          <Loader2 className="h-3 w-3 animate-spin" />
          IRIS is analyzing your intelligence and building the graph. This may take a minute.
        </div>
      )}

      {/* Sub-tabs */}
      <div className="border-b">
        <div className="flex gap-6 overflow-x-auto">
          {SUB_TABS.map((t) => {
            const isActive = active === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setSub(t.id)}
                title={t.hint}
                className={`relative pb-2 text-sm whitespace-nowrap border-b-2 transition-colors inline-flex items-center gap-1.5 ${
                  isActive
                    ? "border-[#C9A55C] text-foreground font-medium"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
                <SubTabBadge id={t.id} counts={subCounts} />
              </button>
            );
          })}
        </div>
      </div>

      {active === "graph" && <OracleGraph missionId={missionId} completeness={completeness} />}
      {active === "feed" && <OracleFeed missionId={missionId} />}
      {active === "stakeholders" && <OracleStakeholders missionId={missionId} />}
      {active === "competitors" && <OracleCompetitors missionId={missionId} />}
      {active === "evolution" && <OracleProcurementEvolution missionId={missionId} />}
      {active === "research-library" && (
        <IntelligenceLibraryTab
          missionId={missionId}
          autoOpenAdd={search.add === "1" || search.add === "true"}
        />
      )}

      <Dialog open={briefOpen} onOpenChange={setBriefOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>IRIS Mission Brief</DialogTitle>
            <div className="text-xs text-muted-foreground">{new Date().toLocaleString()}</div>
          </DialogHeader>
          {briefLoading ? (
            <div className="py-8 text-center">
              <Sparkles className="h-6 w-6 mx-auto animate-pulse text-[#C9A55C]" />
              <div className="text-sm mt-2">IRIS is preparing your brief…</div>
            </div>
          ) : (
            <div className="space-y-3">
              <pre className="whitespace-pre-wrap text-sm font-sans">{briefText}</pre>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    setBriefAt(0);
                    await openBrief();
                  }}
                >
                  Regenerate
                </Button>
                <Button size="sm" onClick={() => setBriefOpen(false)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SubTabBadge({
  id,
  counts,
}: {
  id: SubId;
  counts?: { feedHot: number; competitors: number; library: number };
}) {
  if (!counts) return null;
  if (id === "feed" && counts.feedHot > 0) {
    return (
      <span
        className="rounded-full"
        style={{ width: 6, height: 6, background: "#fbbf24" }}
        aria-label={`${counts.feedHot} unreviewed high-relevance items`}
      />
    );
  }
  if (id === "competitors" && counts.competitors === 0) {
    return (
      <span
        className="rounded-full"
        style={{ width: 6, height: 6, background: "#94a3b8" }}
        aria-label="No competitors profiled yet"
      />
    );
  }
  if (id === "research-library" && counts.library > 0) {
    return (
      <span
        className="rounded-full px-1.5"
        style={{
          fontSize: 10,
          background: "rgba(201,165,92,0.15)",
          color: GOLD,
          minWidth: 16,
          textAlign: "center",
          fontWeight: 600,
        }}
      >
        {counts.library}
      </span>
    );
  }
  return null;
}
