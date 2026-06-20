import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, AlertTriangle, Plus } from "lucide-react";
import { differenceInCalendarDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { getLastTab } from "@/lib/last-tab";

type SwitcherMission = {
  id: string;
  name: string;
  status: string;
  submission_deadline: string | null;
  at_risk_count: number;
};

async function fetchSwitcherMissions(): Promise<SwitcherMission[]> {
  const { data, error } = await supabase
    .from("missions")
    .select("id, name, status, submission_deadline")
    .in("status", ["active", "setup"])
    .order("submission_deadline", { ascending: true, nullsFirst: false });
  if (error) throw error;
  const rows = data ?? [];
  // Fetch at-risk counts per mission in parallel
  const counts = await Promise.all(
    rows.map(async (m) => {
      const { count } = await supabase
        .from("mission_questions")
        .select("id", { count: "exact", head: true })
        .eq("mission_id", m.id)
        .eq("health_status", "at_risk");
      return count ?? 0;
    }),
  );
  return rows.map((m, i) => ({ ...m, at_risk_count: counts[i] }));
}

export function MissionSwitcher() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const matchedParams = useParams({ strict: false }) as { missionId?: string };
  const insideMission = /^\/olympus\/missions\/[^/]+/.test(pathname) &&
    !pathname.endsWith("/new") && !pathname.endsWith("/wizard");
  const currentMissionId = insideMission ? matchedParams.missionId : undefined;

  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const popRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const { data: missions } = useQuery({
    queryKey: ["mission-switcher"],
    queryFn: fetchSwitcherMissions,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    enabled: open || insideMission, // need current name when inside a mission
  });

  const current = missions?.find((m) => m.id === currentMissionId);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const handlePick = (m: SwitcherMission) => {
    setOpen(false);
    const lastTab = getLastTab(m.id) ?? "overview";
    navigate({
      to: "/olympus/missions/$missionId",
      params: { missionId: m.id },
      search: { tab: lastTab } as any,
    });
  };

  if (!insideMission) {
    return (
      <span className="text-[14px] text-white/60 font-medium tracking-wide">
        Athena Strategy Group
      </span>
    );
  }

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-white font-medium text-[14px] hover:text-[var(--athena-gold)] transition-colors"
      >
        <span className="truncate max-w-[280px]">
          {current?.name ?? "Loading…"}
        </span>
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div
          ref={popRef}
          className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-80 rounded-lg border border-[var(--athena-gold)]/60 bg-[#0D1B3E] shadow-xl z-[60] overflow-hidden"
        >
          <div className="px-4 py-2 text-[11px] text-[var(--athena-gold)] font-medium border-b border-white/10">
            Active Missions
          </div>
          <div className="max-h-80 overflow-y-auto">
            {!missions && (
              <div className="px-4 py-6 text-[12px] text-white/50">Loading…</div>
            )}
            {missions && missions.length === 0 && (
              <div className="px-4 py-6 text-[12px] text-white/50">No active missions.</div>
            )}
            {missions?.map((m) => {
              const isCurrent = m.id === currentMissionId;
              const days = m.submission_deadline
                ? differenceInCalendarDays(new Date(m.submission_deadline), new Date())
                : null;
              const dayColor =
                days === null
                  ? "text-white/40"
                  : days < 14
                  ? "text-red-400"
                  : days < 30
                  ? "text-amber-400"
                  : "text-white/60";
              const dot = m.status === "active" ? "bg-green-400" : "bg-slate-400";
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => handlePick(m)}
                  className={cn(
                    "w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-white/5 transition-colors border-l-2",
                    isCurrent ? "border-[var(--athena-gold)] bg-white/5" : "border-transparent",
                  )}
                >
                  <span className={cn("h-2 w-2 rounded-full shrink-0", dot)} />
                  <span className="flex-1 min-w-0 text-[14px] text-white truncate">{m.name}</span>
                  {m.at_risk_count > 0 && (
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                  )}
                  {days !== null && (
                    <span className={cn("text-[12px] shrink-0", dayColor)}>
                      {days < 0 ? `${Math.abs(days)}d past` : `${days}d`}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="border-t border-white/10">
            <Link
              to="/olympus/missions"
              onClick={() => setOpen(false)}
              className="block px-4 py-2 text-[12px] text-white/70 hover:text-white hover:bg-white/5"
            >
              View All Missions
            </Link>
            <Link
              to="/olympus/missions/new"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-4 py-2 text-[12px] text-[var(--athena-gold)] hover:bg-white/5"
            >
              <Plus className="h-3.5 w-3.5" /> Create New Mission
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
