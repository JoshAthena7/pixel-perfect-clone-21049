import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/useAccess";
import { AskIrisButton } from "@/components/iris/AskIrisButton";
import { OracleFeed } from "./OracleFeed";
import { OracleGraph } from "./OracleGraph";
import { OracleStakeholders } from "./OracleStakeholders";
import { OracleCompetitors } from "./OracleCompetitors";
import { OracleResearchLibrary } from "./OracleResearchLibrary";

const GOLD = "#C49A2B";

type TabId = "feed" | "graph" | "stakeholders" | "competitors" | "research";

const TABS: { id: TabId; label: string }[] = [
  { id: "feed", label: "Intelligence Feed" },
  { id: "graph", label: "Intelligence Graph" },
  { id: "stakeholders", label: "Stakeholders" },
  { id: "competitors", label: "Competitors" },
  { id: "research", label: "Research Library" },
];

export function OracleTab({ missionId }: { missionId: string }) {
  const { isAdmin } = useIsAdmin();
  const [active, setActive] = useState<TabId>("feed");
  const [visited, setVisited] = useState<Set<TabId>>(new Set(["feed"]));
  const [highlightId, setHighlightId] = useState<string | null>(null);

  // Read ?tab=&highlight= params on mount and whenever the URL changes
  useEffect(() => {
    const apply = () => {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get("tab") as TabId | null;
      const hl = params.get("highlight");
      if (tabParam && TABS.some((t) => t.id === tabParam)) {
        setActive(tabParam);
        setVisited((prev) => (prev.has(tabParam) ? prev : new Set(prev).add(tabParam)));
      }
      setHighlightId(hl);
    };
    apply();
    window.addEventListener("popstate", apply);
    return () => window.removeEventListener("popstate", apply);
  }, []);

  useEffect(() => {
    setVisited((prev) => {
      if (prev.has(active)) return prev;
      const next = new Set(prev);
      next.add(active);
      return next;
    });
  }, [active]);

  const { data: mission } = useQuery({
    queryKey: ["oracle-mission-header", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("missions")
        .select("id,name,intelligence_graph_completeness")
        .eq("id", missionId)
        .single();
      return data;
    },
  });

  const { data: counts } = useQuery({
    queryKey: ["oracle-counts", missionId],
    queryFn: async () => {
      const [feedAll, feedUnreviewed, nodes, edges, stakeholders, competitors, docs] = await Promise.all([
        supabase.from("intelligence_feed_items").select("id", { count: "exact", head: true }).eq("mission_id", missionId),
        supabase.from("intelligence_feed_items").select("id", { count: "exact", head: true }).eq("mission_id", missionId).eq("is_reviewed", false).eq("is_dismissed", false),
        supabase.from("intelligence_graph_nodes").select("id", { count: "exact", head: true }).eq("mission_id", missionId),
        supabase.from("intelligence_graph_edges").select("id", { count: "exact", head: true }).eq("mission_id", missionId),
        supabase.from("stakeholder_profiles").select("id", { count: "exact", head: true }).eq("mission_id", missionId),
        supabase.from("competitor_profiles").select("id", { count: "exact", head: true }).eq("mission_id", missionId),
        supabase.from("mission_documents").select("id", { count: "exact", head: true }).eq("mission_id", missionId),
      ]);
      return {
        feed: feedAll.count ?? 0,
        feedUnreviewed: feedUnreviewed.count ?? 0,
        nodes: nodes.count ?? 0,
        edges: edges.count ?? 0,
        stakeholders: stakeholders.count ?? 0,
        competitors: competitors.count ?? 0,
        docs: docs.count ?? 0,
      };
    },
    staleTime: 30_000,
  });

  const completeness = mission?.intelligence_graph_completeness ?? 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div
        className="rounded-lg px-4 py-3"
        style={{
          background: "rgba(5,13,24,0.6)",
          border: `1px solid rgba(255,255,255,0.06)`,
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-white" style={{ fontSize: 18, fontWeight: 500 }}>
              Oracle
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
              IRIS&apos;s intelligence layer for {mission?.name ?? "this mission"}
            </div>
          </div>
          <div className="flex items-center gap-4" style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>
            <Stat label="Completeness">
              <div className="flex items-center gap-2">
                <span style={{ color: GOLD, fontWeight: 600 }}>{completeness}%</span>
                <div className="relative" style={{ width: 60, height: 3, background: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
                  <div style={{ width: `${completeness}%`, height: "100%", background: GOLD, borderRadius: 2 }} />
                </div>
              </div>
            </Stat>
            <Divider />
            <Stat label="Feed">
              <span style={{ color: "rgba(255,255,255,0.85)" }}>{counts?.feed ?? 0}</span>
              <span style={{ color: "rgba(255,255,255,0.4)" }}> items · {counts?.feedUnreviewed ?? 0} unreviewed</span>
            </Stat>
            <Divider />
            <Stat label="Graph">
              <span style={{ color: "rgba(255,255,255,0.85)" }}>{counts?.nodes ?? 0}</span>
              <span style={{ color: "rgba(255,255,255,0.4)" }}> nodes · {counts?.edges ?? 0} edges</span>
            </Stat>
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="italic" style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>
            Oracle is configured in Olympus. Read only.
          </div>
          <AskIrisButton prefill={`Explain this page (Oracle) for mission ${mission?.name ?? missionId}.`} />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => {
          const isActive = active === t.id;
          const badge = tabBadge(t.id, counts);
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActive(t.id)}
              className="inline-flex items-center gap-2 rounded-full transition-colors"
              style={{
                padding: "5px 12px",
                fontSize: 12,
                fontWeight: isActive ? 500 : 400,
                color: isActive ? GOLD : "rgba(255,255,255,0.35)",
                background: isActive ? "rgba(196,154,43,0.12)" : "transparent",
                border: `0.5px solid ${isActive ? "rgba(196,154,43,0.3)" : "rgba(255,255,255,0.08)"}`,
              }}
            >
              {t.label}
              {badge != null && badge > 0 && (
                <span
                  style={{
                    fontSize: 10,
                    padding: "1px 6px",
                    borderRadius: 999,
                    background: isActive ? "rgba(196,154,43,0.2)" : "rgba(255,255,255,0.06)",
                    color: isActive ? GOLD : "rgba(255,255,255,0.5)",
                    minWidth: 18,
                    textAlign: "center",
                  }}
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Lazy-mount: only render after first visit; keep mounted to cache state */}
      <div>
        {visited.has("feed") && (
          <div style={{ display: active === "feed" ? "block" : "none" }}>
            <OracleFeed missionId={missionId} isAdmin={isAdmin} />
          </div>
        )}
        {visited.has("graph") && (
          <div style={{ display: active === "graph" ? "block" : "none" }}>
            <OracleGraph missionId={missionId} isAdmin={isAdmin} completeness={completeness} />
          </div>
        )}
        {visited.has("stakeholders") && (
          <div style={{ display: active === "stakeholders" ? "block" : "none" }}>
            <OracleStakeholders missionId={missionId} isAdmin={isAdmin} />
          </div>
        )}
        {visited.has("competitors") && (
          <div style={{ display: active === "competitors" ? "block" : "none" }}>
            <OracleCompetitors missionId={missionId} isAdmin={isAdmin} />
          </div>
        )}
        {visited.has("research") && (
          <div style={{ display: active === "research" ? "block" : "none" }}>
            <OracleResearchLibrary missionId={missionId} isAdmin={isAdmin} />
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <span style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.35)" }}>
        {label}
      </span>
      <span style={{ fontSize: 12 }}>{children}</span>
    </div>
  );
}

function Divider() {
  return <div style={{ width: 1, height: 24, background: "rgba(255,255,255,0.08)" }} />;
}

function tabBadge(id: TabId, counts?: { feedUnreviewed: number; nodes: number; stakeholders: number; competitors: number; docs: number }): number | null {
  if (!counts) return null;
  if (id === "feed") return counts.feedUnreviewed;
  if (id === "graph") return counts.nodes;
  if (id === "stakeholders") return counts.stakeholders;
  if (id === "competitors") return counts.competitors;
  if (id === "research") return counts.docs;
  return null;
}
