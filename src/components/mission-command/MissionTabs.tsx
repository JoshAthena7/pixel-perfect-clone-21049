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
      .eq("risk_level", "high")
      .eq("is_addressed", false),
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

function Badge({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <span className="ml-1.5 inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-orange-500 text-[10px] font-bold text-white">
      {n > 99 ? "99+" : n}
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

  return (
    <div className="border-b border-border bg-background/50 sticky top-[44px] z-30">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        {/* Desktop: grouped */}
        <div className="hidden md:flex gap-8 py-2 overflow-x-auto">
          {TAB_GROUPS.map((group) => (
            <div key={group.label} className="shrink-0">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                {group.label}
              </div>
              <div className="flex gap-1">
                {group.tabs.map((tab) => {
                  const isActive = tab.id === active;
                  const n = alerts[tab.id] ?? 0;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => onChange(tab.id)}
                      className={cn(
                        "px-3 py-1.5 text-sm whitespace-nowrap border-b-2 transition-colors flex items-center",
                        isActive
                          ? "border-primary text-foreground font-medium"
                          : "border-transparent text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {tab.label}
                      <Badge n={n} />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        {/* Mobile: flat strip */}
        <div className="md:hidden flex gap-1 py-2 overflow-x-auto">
          {ALL_TABS.map((tab) => {
            const isActive = tab.id === active;
            const n = alerts[tab.id] ?? 0;
            return (
              <button
                key={tab.id}
                onClick={() => onChange(tab.id)}
                className={cn(
                  "px-3 py-1.5 text-sm whitespace-nowrap border-b-2 transition-colors shrink-0 flex items-center",
                  isActive
                    ? "border-primary text-foreground font-medium"
                    : "border-transparent text-muted-foreground",
                )}
              >
                {tab.label}
                <Badge n={n} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
