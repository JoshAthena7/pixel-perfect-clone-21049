import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/useAccess";
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

const GOLD = "#C49A2B";

type TabId = "feed" | "people" | "organizations" | "sources" | "graph";

const TABS: { id: TabId; label: string }[] = [
  { id: "feed", label: "Feed" },
  { id: "people", label: "People" },
  { id: "organizations", label: "Organizations" },
  { id: "sources", label: "Sources" },
  { id: "graph", label: "Graph" },
];

export function OracleTab({ missionId }: { missionId: string }) {
  const { isAdmin } = useIsAdmin();
  const [active, setActive] = useState<TabId>("feed");
  const [visited, setVisited] = useState<Set<TabId>>(new Set(["feed"]));

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
      const [events, people, orgs, sources, rels] = await Promise.all([
        (supabase as any).from("intel_events").select("id", { count: "exact", head: true }).eq("mission_id", missionId),
        (supabase as any).from("intel_people").select("id", { count: "exact", head: true }).eq("mission_id", missionId),
        (supabase as any).from("intel_organizations").select("id", { count: "exact", head: true }).eq("mission_id", missionId),
        (supabase as any).from("intel_sources").select("id", { count: "exact", head: true }).eq("mission_id", missionId),
        (supabase as any).from("intel_relationships").select("id", { count: "exact", head: true }).eq("mission_id", missionId),
      ]);
      return {
        events: events.count ?? 0,
        people: people.count ?? 0,
        orgs: orgs.count ?? 0,
        sources: sources.count ?? 0,
        rels: rels.count ?? 0,
      };
    },
    staleTime: 30_000,
  });

  // 5-dimension completeness
  const completeness = (() => {
    if (!counts) return 0;
    let pct = 0;
    if (counts.events > 0) pct += 20;
    if (counts.people > 0) pct += 20;
    if (counts.orgs > 0) pct += 20;
    if (counts.sources > 0) pct += 20;
    if (counts.rels > 0) pct += 20;
    return pct;
  })();

  // Auto-recover: if events were seeded before the people/orgs cascade existed,
  // fire a one-shot force re-seed in the background to populate them.
  const qc = useQueryClient();
  const seedFn = useServerFn(seedMissionIntelligence);
  const autoSeededRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!counts) return;
    if (autoSeededRef.current.has(missionId)) return;
    if (counts.events > 0 && counts.people === 0 && counts.orgs === 0) {
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

  return (
    <div className="space-y-4">
      <div className="rounded-lg px-4 py-3" style={{ background: "rgba(5,13,24,0.6)", border: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-white" style={{ fontSize: 18, fontWeight: 500 }}>IRIS</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{subtitle}</div>
          </div>
          <div className="flex items-center gap-4" style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>
            <Stat label="Completeness">
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
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <span style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.35)" }}>{label}</span>
      <span style={{ fontSize: 12 }}>{children}</span>
    </div>
  );
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
