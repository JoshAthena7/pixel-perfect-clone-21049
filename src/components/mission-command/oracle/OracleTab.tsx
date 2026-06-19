import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin, useMissionAccess } from "@/hooks/useAccess";
import { AskIrisButton } from "@/components/iris/AskIrisButton";
import { RequestChangeButton } from "@/components/RequestChangeButton";
import { IntelFeed } from "./IntelFeed";
import { IntelPeople } from "./IntelPeople";
import { IntelOrganizations } from "./IntelOrganizations";
import { IntelSources } from "./IntelSources";
import { OracleGraph } from "./OracleGraph";
import { HealthStrip } from "@/components/intelligence/HealthStrip";
import { EcosystemGraph } from "@/components/intelligence/EcosystemGraph";
import { SignalFeed } from "@/components/intelligence/SignalFeed";
import { NodeDetailDrawer } from "@/components/intelligence/NodeDetailDrawer";
import { seedMissionIntelligence } from "@/lib/iris-seed-mission-intelligence.functions";
import { WriterIntelView } from "@/components/oracle/WriterIntelView";
import { GraphHealthTab } from "./GraphHealthTab";
import { StoryMapTab } from "./StoryMapTab";
import { IntelLoadBanner } from "@/components/intelligence/IntelLoadBanner";

const GOLD = "#C49A2B";

type TabId = "feed" | "people" | "organizations" | "sources" | "graph" | "graph-health" | "story-map";

const BASE_TABS: { id: TabId; label: string }[] = [
  { id: "feed", label: "Feed" },
  { id: "people", label: "People" },
  { id: "organizations", label: "Organizations" },
  { id: "sources", label: "Sources" },
  { id: "graph", label: "Graph" },
];
const LEAD_TABS: { id: TabId; label: string }[] = [
  { id: "story-map", label: "Story Map" },
];
const ADMIN_TABS: { id: TabId; label: string }[] = [
  { id: "graph-health", label: "Graph Health" },
];

export function OracleTab({ missionId }: { missionId: string }) {
  const { isAdmin, isLoading: adminLoading } = useIsAdmin();
  const { data: access, isLoading: accessLoading } = useMissionAccess(missionId);
  const missionRole = access?.role ?? null;
  const LEAD_ROLES = ["engagement_lead", "manager", "project_manager", "lead", "admin"];
  const canLead = isAdmin || (missionRole != null && LEAD_ROLES.includes(missionRole));
  const showWriter = !isAdmin && !canLead;
  const roleResolving = adminLoading || accessLoading;
  const [active, setActive] = useState<TabId>("feed");
  const [visited, setVisited] = useState<Set<TabId>>(new Set(["feed"]));
  const [selectedEcosystemNode, setSelectedEcosystemNode] = useState<any | null>(null);

  const TABS = [
    ...BASE_TABS,
    ...(canLead ? LEAD_TABS : []),
    ...(isAdmin ? ADMIN_TABS : []),
  ];




  useEffect(() => {
    const apply = () => {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get("tab") as TabId | null;
      if (tabParam && TABS.some((t) => t.id === tabParam)) {
        setActive(tabParam);
        setVisited((prev) => (prev.has(tabParam) ? prev : new Set(prev).add(tabParam)));
      }
    };
    apply();
    window.addEventListener("popstate", apply);
    return () => window.removeEventListener("popstate", apply);
  }, []);

  useEffect(() => {
    setVisited((prev) => (prev.has(active) ? prev : new Set(prev).add(active)));
  }, [active]);

  const { data: mission } = useQuery({
    queryKey: ["oracle-mission-header", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("missions")
        .select("id,name,client_name,agency_name,agency_code,program_type")
        .eq("id", missionId)
        .single();
      return data;
    },
  });

  const { data: counts } = useQuery({
    queryKey: ["intel-counts", missionId],
    queryFn: async () => {
      const sb = supabase as any;
      // Resolve mission state_code for state-tier scoping
      const { data: m } = await sb.from("missions").select("state_code").eq("id", missionId).maybeSingle();
      const stateCode = m?.state_code ?? null;

      const orParts = [`tier.eq.platform`, `and(tier.eq.mission,mission_id.eq.${missionId})`];
      if (stateCode) orParts.push(`and(tier.eq.state,state_code.eq.${stateCode})`);
      const orStr = orParts.join(",");

      const PEOPLE_CATS = ["field_intelligence", "competitive_landscape", "regulatory_state", "regulatory_federal"];
      const ORG_CATS = ["regulatory_state", "regulatory_federal", "quality_performance"];

      const [people, orgs, rels, oracleAll, oracleApproved, sourceReg, peopleSrcRows, orgSrcRows] = await Promise.all([
        sb.from("intel_people").select("id", { count: "exact", head: true }).eq("mission_id", missionId),
        sb.from("intel_organizations").select("id", { count: "exact", head: true }).eq("mission_id", missionId),
        sb.from("intel_relationships").select("id", { count: "exact", head: true }).eq("mission_id", missionId),
        sb.from("oracle_signals").select("id", { count: "exact", head: true }).neq("status", "dismissed").or(orStr),
        sb.from("oracle_signals").select("id", { count: "exact", head: true }).in("status", ["approved", "pushed"]).or(orStr),
        sb.from("oracle_source_registry").select("id", { count: "exact", head: true }).or(orStr),
        sb.from("oracle_signals").select("source_name").neq("status", "dismissed").in("category", PEOPLE_CATS).or(orStr).limit(1000),
        sb.from("oracle_signals").select("source_name").neq("status", "dismissed").in("category", ORG_CATS).or(orStr).limit(1000),
      ]);

      const distinctSources = (rows: any[] | null | undefined): Set<string> => {
        const s = new Set<string>();
        for (const r of rows ?? []) {
          const n = (r?.source_name ?? "").trim().toLowerCase();
          if (n) s.add(n);
        }
        return s;
      };
      const peopleSources = distinctSources(peopleSrcRows.data);
      const orgSources = distinctSources(orgSrcRows.data);
      // Merge with legacy counts so sidebar matches the tab (oracle + manual).
      const legacyPeopleCount = people.count ?? 0;
      const legacyOrgsCount = orgs.count ?? 0;
      const oracleTotal = oracleAll.count ?? 0;
      return {
        events: oracleTotal,
        people: peopleSources.size + legacyPeopleCount,
        orgs: orgSources.size + legacyOrgsCount,
        sources: sourceReg.count ?? 0,
        rels: rels.count ?? 0,
        legacyPeople: legacyPeopleCount,
        legacyOrgs: legacyOrgsCount,
        oracleApproved: oracleApproved.count ?? 0,
      };
    },
    staleTime: 30_000,
  });

  // ORACLE-based completeness: approved+pushed signals out of 50 target
  const completeness = (() => {
    if (!counts) return 0;
    return Math.min(100, Math.round((counts.oracleApproved / 50) * 100));
  })();

  // Auto-recover: if events were seeded before the people/orgs cascade existed,
  // fire a one-shot force re-seed in the background to populate them.
  const qc = useQueryClient();
  const seedFn = useServerFn(seedMissionIntelligence);
  const autoSeededRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!counts) return;
    if (autoSeededRef.current.has(missionId)) return;
    if (counts.events > 0 && counts.legacyPeople === 0 && counts.legacyOrgs === 0) {
      autoSeededRef.current.add(missionId);
      seedFn({ data: { missionId, force: true } })
        .then((res) => {
          if (res?.ok) {
            qc.invalidateQueries({ queryKey: ["intel-counts", missionId] });
            qc.invalidateQueries({ queryKey: ["intel-people", missionId] });
            qc.invalidateQueries({ queryKey: ["intel-orgs", missionId] });
          }
        })
        .catch((e) => console.log("[oracle-tab] auto re-seed failed", e));
    }
  }, [counts, missionId, seedFn, qc]);

  const clientLabel = mission?.client_name ?? mission?.agency_name ?? mission?.name ?? "this mission";
  const subtitle = mission?.program_type
    ? `IRIS intelligence layer for ${clientLabel} — ${mission.program_type}`
    : `IRIS intelligence layer for ${clientLabel}`;

  if (roleResolving) {
    return (
      <div className="py-12 text-center" style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
        Loading…
      </div>
    );
  }

  if (showWriter) {
    return (
      <div className="space-y-4">
        <WriterIntelView missionId={missionId} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <IntelLoadBanner missionId={missionId} />
      <div className="rounded-lg px-4 py-3" style={{ background: "rgba(5,13,24,0.6)", border: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-white" style={{ fontSize: 18, fontWeight: 500 }}>IRIS</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{subtitle}</div>
          </div>
          <div className="flex items-center gap-4" style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>
            <Stat label="Completeness" tooltip={completenessTooltip(completeness, counts?.oracleApproved ?? 0)}>
              <div className="flex items-center gap-2">
                <span style={{ color: GOLD, fontWeight: 600 }}>{completeness}%</span>
                <div className="relative" style={{ width: 80, height: 3, background: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
                  <div style={{ width: `${completeness}%`, height: "100%", background: GOLD, borderRadius: 2 }} />
                </div>
              </div>
            </Stat>
            <Divider />
            <Stat label="Feed"><span style={{ color: "rgba(255,255,255,0.85)" }}>{counts?.events ?? 0}</span></Stat>
            <Stat label="People"><span style={{ color: "rgba(255,255,255,0.85)" }}>{counts?.people ?? 0}</span></Stat>
            <Stat label="Orgs"><span style={{ color: "rgba(255,255,255,0.85)" }}>{counts?.orgs ?? 0}</span></Stat>
            <Stat label="Sources"><span style={{ color: "rgba(255,255,255,0.85)" }}>{counts?.sources ?? 0}</span></Stat>
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="italic" style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>
            IRIS is configured in Olympus.
          </div>
          <div className="flex items-center gap-2">
            <RequestChangeButton
              surface={`oracle:${active}`}
              missionId={missionId}
              section={TABS.find((t) => t.id === active)?.label ?? active}
            />
            <AskIrisButton prefill={`Explain this page (IRIS) for mission ${mission?.name ?? missionId}.`} />
          </div>
        </div>
      </div>

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
                <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 999, background: isActive ? "rgba(196,154,43,0.2)" : "rgba(255,255,255,0.06)", color: isActive ? GOLD : "rgba(255,255,255,0.5)", minWidth: 18, textAlign: "center" }}>
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div>
        {visited.has("feed") && (
          <div style={{ display: active === "feed" ? "block" : "none" }}>
            <IntelFeed missionId={missionId} />
          </div>
        )}
        {visited.has("people") && (
          <div style={{ display: active === "people" ? "block" : "none" }}>
            <IntelPeople missionId={missionId} />
          </div>
        )}
        {visited.has("organizations") && (
          <div style={{ display: active === "organizations" ? "block" : "none" }}>
            <IntelOrganizations missionId={missionId} />
          </div>
        )}
        {visited.has("sources") && (
          <div style={{ display: active === "sources" ? "block" : "none" }}>
            <IntelSources missionId={missionId} />
          </div>
        )}
        {visited.has("graph") && (
          <div style={{ display: active === "graph" ? "block" : "none" }}>
            <OracleGraph missionId={missionId} isAdmin={isAdmin} completeness={completeness} />

            <div style={{ height: 1, background: "rgba(255,255,255,0.1)", margin: "32px 0" }} />

            <div style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", color: GOLD, fontWeight: 600 }}>
                Mission Ecosystem Coverage
              </h3>
            </div>

            <div style={{ marginBottom: 24 }}>
              <HealthStrip missionId={missionId} />
            </div>

            <div style={{ marginBottom: 24 }}>
              <EcosystemGraph missionId={missionId} onNodeClick={(node) => setSelectedEcosystemNode(node)} />
            </div>

            <div>
              <SignalFeed missionId={missionId} />
            </div>

            <NodeDetailDrawer node={selectedEcosystemNode} onClose={() => setSelectedEcosystemNode(null)} />
          </div>
        )}
        {canLead && visited.has("story-map") && (
          <div style={{ display: active === "story-map" ? "block" : "none" }}>
            <StoryMapTab missionId={missionId} />
          </div>
        )}
        {isAdmin && visited.has("graph-health") && (
          <div style={{ display: active === "graph-health" ? "block" : "none" }}>
            <GraphHealthTab missionId={missionId} />
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, children, tooltip }: { label: string; children: React.ReactNode; tooltip?: string }) {
  return (
    <div className="flex flex-col" title={tooltip}>
      <span style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.35)" }} className="flex items-center gap-1">
        {label}
        {tooltip && (
          <span
            aria-label={tooltip}
            title={tooltip}
            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 10, height: 10, borderRadius: 999, border: "0.5px solid rgba(255,255,255,0.35)", color: "rgba(255,255,255,0.45)", fontSize: 8, lineHeight: 1, cursor: "help" }}
          >
            i
          </span>
        )}
      </span>
      <span style={{ fontSize: 12 }}>{children}</span>
    </div>
  );
}

function completenessTooltip(pct: number, approved: number): string {
  if (pct === 0) return "ORACLE is empty. Run the Setup Wizard to load intelligence.";
  if (pct >= 100) return `ORACLE coverage is strong. ${approved} intelligence items available.`;
  return `${pct}% — ${approved} of 50 target intelligence items loaded. Process your RFP in the Setup Wizard to increase coverage.`;
}

function Divider() {
  return <div style={{ width: 1, height: 24, background: "rgba(255,255,255,0.08)" }} />;
}

function tabBadge(id: TabId, counts?: { events: number; people: number; orgs: number; sources: number; rels: number }): number | null {
  if (!counts) return null;
  if (id === "feed") return counts.events;
  if (id === "people") return counts.people;
  if (id === "organizations") return counts.orgs;
  if (id === "sources") return counts.sources;
  if (id === "graph") return counts.rels;
  return null;
}
