import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Sparkles, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { buildIntelligenceGraph, generateMissionBrief } from "@/lib/oracle.functions";
import { refreshAllMissionFeeds } from "@/lib/iris-refresh-all.functions";
import { OracleGraph } from "./OracleGraph";
import { OracleFeed } from "./OracleFeed";
import { OracleStakeholders } from "./OracleStakeholders";
import { OracleCompetitors } from "./OracleCompetitors";
import { OracleProcurementEvolution } from "./OracleProcurementEvolution";

const SUB_TABS = [
  { id: "graph", label: "Graph" },
  { id: "feed", label: "Intelligence Feed" },
  { id: "stakeholders", label: "Stakeholders" },
  { id: "competitors", label: "Competitors" },
  { id: "evolution", label: "Procurement Evolution" },
] as const;
type SubId = (typeof SUB_TABS)[number]["id"];

export function OracleTab({ missionId }: { missionId: string }) {
  const navigate = useNavigate();
  const search = useSearch({ from: "/_authenticated/olympus/missions/$missionId/" }) as { sub?: string; tab?: string };
  const active: SubId = (SUB_TABS.find((t) => t.id === search.sub)?.id ?? "graph") as SubId;
  const setSub = (sub: SubId) =>
    navigate({
      to: "/olympus/missions/$missionId",
      params: { missionId },
      search: (prev: Record<string, unknown>) => ({ ...prev, tab: "oracle", sub }),
    });

  const [briefOpen, setBriefOpen] = useState(false);
  const [briefText, setBriefText] = useState<string>("");
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefAt, setBriefAt] = useState<number>(0);
  const [building, setBuilding] = useState(false);

  const build = useServerFn(buildIntelligenceGraph);
  const brief = useServerFn(generateMissionBrief);

  const { data: mission } = useQuery({
    queryKey: ["oracle-mission", missionId],
    queryFn: async () => {
      const { data } = await supabase.from("missions").select("id,name,intelligence_graph_completeness").eq("id", missionId).single();
      return data;
    },
  });

  const { data: lastFeed } = useQuery({
    queryKey: ["oracle-last-feed", missionId],
    queryFn: async () => {
      const { data } = await supabase.from("intelligence_feed_items").select("created_at").eq("mission_id", missionId).order("created_at", { ascending: false }).limit(1).maybeSingle();
      return data;
    },
  });

  // Auto-build graph if no nodes exist
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { count } = await supabase.from("intelligence_graph_nodes").select("id", { count: "exact", head: true }).eq("mission_id", missionId);
      if (cancelled || (count ?? 0) > 0) return;
      setBuilding(true);
      try { await build({ data: { missionId } }); } catch (e) { console.error(e); }
      finally { if (!cancelled) setBuilding(false); }
    })();
    return () => { cancelled = true; };
  }, [missionId, build]);

  const openBrief = async () => {
    setBriefOpen(true);
    if (briefText && Date.now() - briefAt < 30 * 60_000) return;
    setBriefLoading(true);
    try {
      const r = await brief({ data: { missionId } });
      setBriefText(r.brief);
      setBriefAt(Date.now());
    } catch (e) { toast.error((e as Error).message); }
    finally { setBriefLoading(false); }
  };

  const completeness = mission?.intelligence_graph_completeness ?? 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary">Mission Intelligence</h1>
          <div className="text-xs text-[#C9A55C] font-medium">Powered by IRIS</div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-xs text-muted-foreground">
              {lastFeed?.created_at ? `IRIS last updated ${formatDistanceToNow(new Date(lastFeed.created_at), { addSuffix: true })}` : "No updates yet"}
            </div>
            <Badge className="mt-1 bg-[#C9A55C]/15 text-[#C9A55C] border-[#C9A55C]/40">
              Intelligence Graph: {completeness}%
            </Badge>
          </div>
          <Button variant="outline" className="border-[#C9A55C] text-[#C9A55C] hover:bg-[#C9A55C]/10" onClick={openBrief}>
            <Sparkles className="h-4 w-4 mr-1" /> Brief Me
          </Button>
          <Button onClick={() => navigate({ to: "/olympus/missions/$missionId", params: { missionId }, search: (p: Record<string, unknown>) => ({ ...p, tab: "intel-library" }) })}>
            Add Intelligence +
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
          {SUB_TABS.map((t) => (
            <button key={t.id} onClick={() => setSub(t.id)}
              className={`pb-2 text-sm whitespace-nowrap border-b-2 transition-colors ${active === t.id ? "border-[#C9A55C] text-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {active === "graph" && <OracleGraph missionId={missionId} completeness={completeness} />}
      {active === "feed" && <OracleFeed missionId={missionId} />}
      {active === "stakeholders" && <OracleStakeholders missionId={missionId} />}
      {active === "competitors" && <OracleCompetitors missionId={missionId} />}
      {active === "evolution" && <OracleProcurementEvolution missionId={missionId} />}

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
                <Button variant="outline" size="sm" onClick={async () => { setBriefAt(0); await openBrief(); }}>Regenerate</Button>
                <Button size="sm" onClick={() => setBriefOpen(false)}>Close</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
