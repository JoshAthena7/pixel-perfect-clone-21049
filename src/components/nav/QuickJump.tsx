import { useEffect, useRef } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { differenceInCalendarDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { getLastTab } from "@/lib/last-tab";
import {
  ALL_TABS,
  visibleTabsForRole,
  useViewerMissionRole,
  type TabId,
} from "@/components/mission-command/MissionTabs";

type QJMission = { id: string; name: string; status: string; submission_deadline: string | null };

async function fetchQJMissions(): Promise<QJMission[]> {
  const { data, error } = await supabase
    .from("missions")
    .select("id,name,status,submission_deadline")
    .in("status", ["active", "setup"])
    .order("submission_deadline", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data ?? [];
}

// Sub-items grouped under each main tab in Quick Jump
const TAB_SUB_ITEMS: Partial<Record<TabId, { id: string; label: string; sub?: string; section?: string }[]>> = {
  overview: [
    { id: "win-strategy", label: "Win Strategy", section: "win-strategy" },
    { id: "journey", label: "Journey", section: "journey" },
    { id: "question-health", label: "Question Health", section: "question-health" },
  ],
  work: [
    { id: "qa", label: "Q&A", sub: "qa" },
    { id: "insights", label: "Insights", sub: "insights" },
  ],
  oracle: [
    { id: "feed", label: "Intelligence Feed", sub: "feed" },
    { id: "stakeholders", label: "Stakeholders", sub: "stakeholders" },
    { id: "competitors", label: "Competitors", sub: "competitors" },
  ],
};

export function QuickJump({
  open,
  onClose,
  anchorRef,
  currentMissionId,
  activeTab,
  alerts,
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  currentMissionId?: string;
  activeTab?: TabId;
  alerts?: Partial<Record<TabId, number>>;
}) {
  const navigate = useNavigate();
  const popRef = useRef<HTMLDivElement>(null);
  const { data: role } = useViewerMissionRole(currentMissionId ?? "");
  const visible = visibleTabsForRole(role ?? null);

  const { data: missions } = useQuery({
    queryKey: ["quick-jump-missions"],
    queryFn: fetchQJMissions,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t)) return;
      if (anchorRef.current?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  const pickMission = (m: QJMission) => {
    onClose();
    const lastTab = getLastTab(m.id) ?? "overview";
    navigate({
      to: "/olympus/missions/$missionId",
      params: { missionId: m.id },
      search: { tab: lastTab } as any,
    });
  };

  const pickTab = (tabId: TabId, extra?: { sub?: string; section?: string }) => {
    if (!currentMissionId) return;
    onClose();
    navigate({
      to: "/olympus/missions/$missionId",
      params: { missionId: currentMissionId },
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        tab: tabId,
        ...(extra?.sub ? { sub: extra.sub } : { sub: undefined }),
      }),
    });
    if (extra?.section) {
      setTimeout(() => {
        document.getElementById(extra.section!)?.scrollIntoView({ behavior: "smooth" });
      }, 300);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[70] md:hidden bg-black/60" onClick={onClose} />
      <div
        ref={popRef}
        className={cn(
          "z-[71] rounded-[10px] border border-[var(--athena-gold)]/40 bg-[#0D1B3E] shadow-2xl overflow-hidden",
          "md:absolute md:right-0 md:top-full md:mt-2 md:w-[280px] md:max-h-[480px]",
          "fixed inset-x-0 bottom-0 max-h-[80vh] md:bottom-auto md:inset-x-auto",
          "flex flex-col",
        )}
      >
        <div className="flex md:hidden items-center justify-between px-4 py-2 border-b border-white/10">
          <span className="text-[12px] text-[var(--athena-gold)] font-medium">Quick Jump</span>
          <button onClick={onClose} aria-label="Close" className="text-white/60 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto">
          <div className="px-4 pt-3 pb-1 text-[11px] text-[var(--athena-gold)] font-medium">
            Active Missions
          </div>
          <div>
            {!missions && <div className="px-4 py-3 text-[12px] text-white/50">Loading…</div>}
            {missions?.length === 0 && <div className="px-4 py-3 text-[12px] text-white/50">None active.</div>}
            {missions?.map((m) => {
              const isCurrent = m.id === currentMissionId;
              const days = m.submission_deadline
                ? differenceInCalendarDays(new Date(m.submission_deadline), new Date())
                : null;
              const dayColor =
                days === null ? "text-white/40"
                : days < 14 ? "text-red-400"
                : days < 30 ? "text-amber-400"
                : "text-white/60";
              const dot = m.status === "active" ? "bg-green-400" : "bg-slate-400";
              return (
                <button
                  key={m.id}
                  onClick={() => pickMission(m)}
                  className={cn(
                    "w-full text-left px-4 py-2 flex items-center gap-2 hover:bg-white/5 border-l-2",
                    isCurrent ? "border-[var(--athena-gold)] bg-white/5" : "border-transparent",
                  )}
                >
                  <span className={cn("h-2 w-2 rounded-full shrink-0", dot)} />
                  <span className="flex-1 min-w-0 text-[14px] text-white truncate">{m.name}</span>
                  {days !== null && (
                    <span className={cn("text-[12px] shrink-0", dayColor)}>
                      {days < 0 ? `${Math.abs(days)}d past` : `${days}d`}
                    </span>
                  )}
                </button>
              );
            })}
            <Link
              to="/olympus/missions/new"
              onClick={onClose}
              className="flex items-center gap-2 px-4 py-2 text-[12px] text-[var(--athena-gold)]/80 hover:bg-white/5"
            >
              <Plus className="h-3.5 w-3.5" /> Create New Mission
            </Link>
          </div>

          <div className="px-4 pt-3 pb-1 text-[11px] text-[var(--athena-gold)] font-medium border-t border-white/10">
            Olympus
          </div>
          <Link to="/olympus/missions" onClick={onClose}
                className="block px-4 py-2 text-[14px] text-white hover:bg-white/5">All Missions</Link>
          <Link to="/admin/team" onClick={onClose}
                className="block px-4 py-2 text-[14px] text-white hover:bg-white/5">Athena Team</Link>
          <Link to="/reports" onClick={onClose}
                className="block px-4 py-2 text-[14px] text-white hover:bg-white/5">Reports</Link>

          {currentMissionId && (
            <>
              <div className="px-4 pt-3 pb-1 text-[11px] text-[var(--athena-gold)] font-medium border-t border-white/10">
                This Mission
              </div>
              <div>
                {ALL_TABS.filter((t) => visible.includes(t.id)).map((t) => {
                  const isActive = t.id === activeTab;
                  const alertN = alerts?.[t.id] ?? 0;
                  const subs = TAB_SUB_ITEMS[t.id] ?? [];
                  return (
                    <div key={t.id}>
                      <button
                        onClick={() => pickTab(t.id)}
                        className={cn(
                          "w-full text-left px-4 py-1.5 flex items-center gap-2 hover:bg-white/5 border-l-2 text-[14px]",
                          isActive ? "border-[var(--athena-gold)] bg-white/5 text-[var(--athena-gold)]" : "border-transparent text-white/80",
                        )}
                      >
                        <span className="flex-1 min-w-0 truncate">{t.label}</span>
                        {alertN > 0 && <span className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />}
                      </button>
                      {subs.length > 0 && (
                        <div className="pl-3">
                          {subs.map((s) => (
                            <button
                              key={s.id}
                              onClick={() => pickTab(t.id, { sub: s.sub, section: s.section })}
                              className="w-full text-left px-4 py-1 flex items-center gap-2 hover:bg-white/5 text-[12px] text-white/60 hover:text-white"
                            >
                              <span className="text-white/30">↳</span>
                              <span className="flex-1 min-w-0 truncate">{s.label}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
