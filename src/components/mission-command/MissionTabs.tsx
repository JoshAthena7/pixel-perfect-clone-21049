import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export type TabId =
  | "overview"
  | "win-strategy"
  | "decision-log"
  | "journey"
  | "oracle"
  | "rfp-documents"
  | "qa-log"
  | "client-intel"
  | "intel-library"
  | "sections-questions"
  | "question-health"
  | "compliance"
  | "submission-checklist"
  | "team"
  | "style-guide"
  | "settings"
  | "audit-log";

export const TAB_GROUPS: { label: string; tabs: { id: TabId; label: string }[] }[] = [
  {
    label: "Mission",
    tabs: [
      { id: "overview", label: "Overview" },
      { id: "win-strategy", label: "Win Strategy" },
      { id: "decision-log", label: "Decision Log" },
      { id: "journey", label: "Journey" },
    ],
  },
  {
    label: "Intelligence",
    tabs: [
      { id: "oracle", label: "Oracle" },
      { id: "rfp-documents", label: "RFP & Documents" },
      { id: "qa-log", label: "Q&A Log" },
      { id: "client-intel", label: "Client Intelligence" },
      { id: "intel-library", label: "Intelligence Library" },
    ],
  },
  {
    label: "Execution",
    tabs: [
      { id: "sections-questions", label: "Sections & Questions" },
      { id: "question-health", label: "Question Health" },
      { id: "compliance", label: "Compliance Tracker" },
      { id: "submission-checklist", label: "Submission Checklist" },
    ],
  },
  {
    label: "Team",
    tabs: [
      { id: "team", label: "Team & Assignments" },
      { id: "style-guide", label: "Style Guide" },
    ],
  },
  {
    label: "Settings",
    tabs: [
      { id: "settings", label: "Mission Settings" },
      { id: "audit-log", label: "Audit Log" },
    ],
  },
];

const ALL_TABS = TAB_GROUPS.flatMap((g) => g.tabs);

export function tabLabel(id: TabId) {
  return ALL_TABS.find((t) => t.id === id)?.label ?? id;
}

export function isValidTab(s: string | undefined): s is TabId {
  return !!s && ALL_TABS.some((t) => t.id === s);
}

async function fetchTabAlerts(missionId: string) {
  const [atRisk, intel, compliance] = await Promise.all([
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
      .from("compliance_check_results")
      .select("id", { count: "exact", head: true })
      .eq("mission_id", missionId)
      .eq("status", "fail"),
  ]);
  return {
    "question-health": atRisk.count ?? 0,
    "oracle": intel.count ?? 0,
    "compliance": compliance.count ?? 0,
  } as Partial<Record<TabId, number>>;
}

function useTabAlerts(missionId: string) {
  return useQuery({
    queryKey: ["mission-tab-alerts", missionId],
    queryFn: () => fetchTabAlerts(missionId),
    staleTime: 60_000,
  });
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

  return (
    <div
      className="sticky top-12 z-30"
      style={{ background: "#0a1628", borderBottom: "1px solid rgba(255,255,255,0.05)" }}
    >
      <div
        className="mx-auto max-w-7xl flex items-center gap-1 overflow-x-auto no-scrollbar"
        style={{ height: 38, padding: "0 20px", scrollbarWidth: "none" }}
      >
        {TAB_GROUPS.map((group, gi) => (
          <div key={group.label} className="flex items-center gap-1 shrink-0">
            <span
              className="shrink-0 select-none uppercase"
              style={{
                fontSize: 10,
                color: "rgba(196,154,43,0.5)",
                letterSpacing: "0.08em",
                fontWeight: 500,
                margin: gi === 0 ? "0 6px 0 0" : "0 6px 0 14px",
              }}
            >
              {group.label}
            </span>
            {group.tabs.map((tab) => {
              const isActive = tab.id === active;
              const n = alerts[tab.id] ?? 0;
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
                          fontSize: 12,
                          padding: "4px 12px",
                          fontWeight: 500,
                        }
                      : {
                          background: "transparent",
                          color: "rgba(255,255,255,0.5)",
                          fontSize: 12,
                          padding: "4px 12px",
                          border: "1px solid transparent",
                        }
                  }
                >
                  {tab.label}
                  {n > 0 && (
                    <span
                      className="rounded-full"
                      style={{ width: 6, height: 6, background: "#f08080" }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
