import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { differenceInCalendarDays } from "date-fns";
import { Command, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { QuickJump } from "@/components/nav/QuickJump";
import { cn } from "@/lib/utils";

export type TabId = "overview" | "work" | "oracle" | "team" | "settings";

export type MissionViewRole = "admin" | "engagement_lead" | "writer" | "sme" | "executive";

export const ALL_TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "work", label: "Work" },
  { id: "oracle", label: "IRIS" },
  { id: "team", label: "Team" },
  { id: "settings", label: "Settings" },
];

// Back-compat: every old tab id maps to a {tab, sub?} pair in the new structure.
export const TAB_REDIRECTS: Record<string, { tab: TabId; sub?: string; section?: string }> = {
  // Overview absorbs
  "win-strategy": { tab: "overview", section: "win-strategy" },
  "decision-log": { tab: "overview", section: "decision-log" },
  journey: { tab: "overview", section: "journey" },
  "question-health": { tab: "overview", section: "question-health" },
  compliance: { tab: "overview", section: "compliance" },
  "compliance-tracker": { tab: "overview", section: "compliance" },
  "submission-checklist": { tab: "overview", section: "compliance" },
  // Work absorbs
  "sections-questions": { tab: "work", sub: "questions" },
  "qa-log": { tab: "work", sub: "qa" },
  insights: { tab: "work", sub: "insights" },
  "athena-insights": { tab: "work", sub: "insights" },
  // Team absorbs
  "team-assignments": { tab: "team", sub: "roster" },
  "style-guide": { tab: "team", sub: "style-guide" },
  // Settings absorbs
  "mission-settings": { tab: "settings", sub: "details" },
  "audit-log": { tab: "settings", sub: "audit-log" },
  "rfp-documents": { tab: "settings", sub: "documents" },
  "rfd-documents": { tab: "settings", sub: "documents" },
  // Oracle absorbs
  "client-intelligence": { tab: "oracle", sub: "stakeholders" },
  "client-intel": { tab: "oracle", sub: "stakeholders" },
  "intelligence-library": { tab: "oracle", sub: "research-library" },
  "intel-library": { tab: "oracle", sub: "research-library" },
};

export function tabLabel(id: TabId): string {
  return ALL_TABS.find((t) => t.id === id)?.label ?? id;
}

export function isValidTab(s: string | undefined): s is TabId {
  return !!s && ALL_TABS.some((t) => t.id === s);
}

export function visibleTabsForRole(role: MissionViewRole | null): TabId[] {
  if (role === "admin" || role === "engagement_lead") return ["overview", "work", "oracle", "team", "settings"];
  if (role === "executive") return ["overview", "oracle", "team"];
  // writer, sme, unknown
  return ["overview", "work", "oracle"];
}

export function defaultTabForRole(role: MissionViewRole | null): TabId {
  if (role === "admin" || role === "engagement_lead") return "overview";
  if (role === "executive") return "overview";
  return "work";
}

// Resolve the current user's effective role on this mission.
// Global admins are admin; otherwise use mission_team_members.mission_role.
async function fetchViewerRole(missionId: string): Promise<MissionViewRole | null> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return null;

  const { data: globalAdmin } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (globalAdmin) return "admin";

  const { data: member } = await supabase
    .from("mission_team_members")
    .select("mission_role")
    .eq("mission_id", missionId)
    .eq("member_id", userId)
    .maybeSingle();
  const r = (member?.mission_role as string | null) ?? null;
  if (r === "engagement_lead") return "engagement_lead";
  if (r === "writer") return "writer";
  if (r === "sme") return "sme";
  if (r === "executive") return "executive";
  return null;
}

export function useViewerMissionRole(missionId: string) {
  return useQuery({
    queryKey: ["viewer-mission-role", missionId],
    queryFn: () => fetchViewerRole(missionId),
    staleTime: 5 * 60_000,
  });
}

async function fetchTabAlerts(missionId: string) {
  const [atRisk, intel, unreadQa] = await Promise.all([
    supabase
      .from("mission_questions")
      .select("id", { count: "exact", head: true })
      .eq("mission_id", missionId)
      .eq("health_status", "at_risk"),
    supabase
      .from("intelligence_feed_items")
      .select("id", { count: "exact", head: true })
      .eq("mission_id", missionId)
      .gte("iris_relevance_score", 70)
      .eq("is_reviewed", false),
    supabase
      .from("client_clarifications")
      .select("id", { count: "exact", head: true })
      .eq("mission_id", missionId),
  ]);
  return {
    overview: atRisk.count ?? 0,
    work: unreadQa.count ?? 0,
    oracle: intel.count ?? 0,
  } as Partial<Record<TabId, number>>;
}

function useTabAlerts(missionId: string) {
  return useQuery({
    queryKey: ["mission-tab-alerts", missionId],
    queryFn: () => fetchTabAlerts(missionId),
    staleTime: 60_000,
  });
}

type MissionCtx = {
  status: string;
  submission_deadline: string | null;
  intelligence_graph_completeness: number | null;
};

async function fetchMissionCtxLite(missionId: string): Promise<MissionCtx> {
  const { data } = await supabase
    .from("missions")
    .select("status,submission_deadline,intelligence_graph_completeness")
    .eq("id", missionId)
    .maybeSingle();
  return {
    status: data?.status ?? "setup",
    submission_deadline: data?.submission_deadline ?? null,
    intelligence_graph_completeness: data?.intelligence_graph_completeness ?? null,
  };
}

function StatusPill({ status }: { status: string }) {
  const s = status.toLowerCase();
  const styles =
    s === "active"
      ? { bg: "rgba(74,200,74,0.12)", color: "#7dcf7d", border: "rgba(74,200,74,0.3)" }
      : s === "setup"
        ? { bg: "rgba(148,163,184,0.15)", color: "#cbd5e1", border: "rgba(148,163,184,0.3)" }
        : { bg: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.7)", border: "rgba(255,255,255,0.12)" };
  return (
    <span
      className="rounded-full font-medium   border"
      style={{ background: styles.bg, color: styles.color, borderColor: styles.border, fontSize: 10, padding: "2px 8px" }}
    >
      {s}
    </span>
  );
}

export function MissionTabs({
  active,
  onChange,
  missionId,
}: {
  active: TabId;
  onChange: (id: TabId) => void;
  missionId: string;
}) {
  const { data: alerts = {} } = useTabAlerts(missionId);
  const { data: role } = useViewerMissionRole(missionId);
  const visible = visibleTabsForRole(role ?? null);
  const { data: ctx } = useQuery({
    queryKey: ["mission-tabs-ctx", missionId],
    queryFn: () => fetchMissionCtxLite(missionId),
    staleTime: 60_000,
  });

  const days = ctx?.submission_deadline
    ? differenceInCalendarDays(new Date(ctx.submission_deadline), new Date())
    : null;
  const dayColor =
    days === null
      ? "rgba(255,255,255,0.6)"
      : days < 14
        ? "#f08080"
        : "#f5b86b";

  const jumpBtnRef = useRef<HTMLButtonElement>(null);
  const [jumpOpen, setJumpOpen] = useState(false);

  return (
    <div
      className="sticky top-12 z-30"
      style={{ background: "rgba(0,0,0,0.2)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}
    >
      <div
        className="mx-auto max-w-7xl flex items-center gap-1 overflow-x-auto no-scrollbar"
        style={{ height: 38, padding: "0 20px", scrollbarWidth: "none" }}
      >
        {ALL_TABS.filter((t) => visible.includes(t.id)).map((tab) => {
          const isActive = tab.id === active;
          const n = alerts[tab.id] ?? 0;
          const dotColor =
            tab.id === "overview" ? "#f08080" : tab.id === "oracle" || tab.id === "work" ? "#f5b86b" : "#f08080";
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={cn(
                "shrink-0 rounded-full whitespace-nowrap inline-flex items-center gap-1.5 transition-colors",
                !isActive && "hover:bg-white/[0.06]",
              )}
              style={
                isActive
                  ? {
                      background: "rgba(196,154,43,0.15)",
                      border: "1px solid rgba(196,154,43,0.4)",
                      color: "#C49A2B",
                      fontSize: 13,
                      padding: "5px 14px",
                      fontWeight: 500,
                    }
                  : {
                      background: "transparent",
                      color: "rgba(255,255,255,0.5)",
                      fontSize: 13,
                      padding: "5px 14px",
                      border: "1px solid transparent",
                    }
              }
            >
              {tab.label}
              {n > 0 && (
                <span
                  className="rounded-full"
                  style={{ width: 6, height: 6, background: dotColor }}
                />
              )}
            </button>
          );
        })}

        {/* Right side — status chips + Jump */}
        <div className="ml-auto flex items-center gap-2 shrink-0">
          {ctx && <StatusPill status={ctx.status} />}
          {days !== null && (
            <span
              className="inline-flex items-center gap-1"
              style={{ color: dayColor, fontSize: 10 }}
              title="Days to submission"
            >
              <Calendar className="h-3 w-3" />
              {days < 0 ? `${Math.abs(days)}d past` : `${days}d`}
            </span>
          )}
          {ctx?.intelligence_graph_completeness != null && (
            <span
              className="inline-flex items-center rounded-full border"
              style={{
                background: "rgba(196,154,43,0.1)",
                borderColor: "rgba(196,154,43,0.3)",
                color: "#C49A2B",
                fontSize: 10,
                padding: "2px 8px",
              }}
            >
              Intel {Math.round(ctx.intelligence_graph_completeness)}%
            </span>
          )}
          <div className="relative">
            <button
              ref={jumpBtnRef}
              onClick={() => setJumpOpen((v) => !v)}
              className="inline-flex items-center gap-1 rounded-md"
              style={{
                background: "transparent",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "rgba(255,255,255,0.5)",
                fontSize: 10,
                padding: "3px 8px",
              }}
              title="Quick jump"
            >
              <Command className="h-3 w-3" /> Jump
            </button>
            <QuickJump
              open={jumpOpen}
              onClose={() => setJumpOpen(false)}
              anchorRef={jumpBtnRef}
              currentMissionId={missionId}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
