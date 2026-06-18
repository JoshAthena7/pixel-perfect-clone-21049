import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  getWarRoomData, getWarRoomHealthTrend, flagQuestion,
  reassignQuestion, bulkResetBriefErrors,
} from "@/lib/war-room.functions";
import { generateIrisBrief } from "@/lib/iris-brief-generator.functions";
import { MissionRadar } from "./MissionRadar";
import { IrisAlertsPanel } from "./IrisAlertsPanel";
import { NudgeModal, type NudgeTarget } from "./NudgeModal";
import { WriterDrawer, type WriterDrawerTarget } from "./WriterDrawer";
import {
  AtcOrientationOverlay, ClosedMissionBanner,
  TeamPulseSkeleton, TeamPulseEmpty, TeamPulseNoAssignmentsBanner,
  RadarSkeleton, AlertsSkeleton,
} from "./AtcEmptyStates";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Radar, RefreshCw, MessageSquare, Eye, Flag, MessageCircle, Zap, RotateCcw,
  Users, ChevronDown, ChevronUp,
} from "lucide-react";

const GOLD = "#c9a84c";

function relTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const h = (Date.now() - new Date(iso).getTime()) / 3600_000;
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}m ago`;
  if (h < 24) return `${Math.round(h)}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function initials(name: string) {
  return name.split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
}

// ATC-only scanline texture (very subtle).
const SCANLINE_BG: React.CSSProperties = {
  backgroundImage:
    "repeating-linear-gradient(0deg, rgba(255,255,255,0.015) 0px, rgba(255,255,255,0.015) 1px, transparent 1px, transparent 3px)",
};

const ROLE_GROUPS: { key: string; label: string; matches: (r: string) => boolean }[] = [
  { key: "leads",    label: "LEADS",    matches: (r) => /lead|owner|director/i.test(r) },
  { key: "writers",  label: "WRITERS",  matches: (r) => /writer|author/i.test(r) },
  { key: "smes",     label: "SMES",     matches: (r) => /sme|subject|expert|specialist/i.test(r) },
  { key: "managers", label: "MANAGERS", matches: (r) => /manager|coord|pm|program/i.test(r) },
];

function groupWriters(writers: any[]) {
  const groups: Record<string, any[]> = { leads: [], writers: [], smes: [], managers: [], other: [] };
  for (const w of writers) {
    const role = String(w.role ?? "");
    const hit = ROLE_GROUPS.find((g) => g.matches(role));
    if (hit) groups[hit.key].push(w);
    else groups.other.push(w);
  }
  return groups;
}

export function WarRoomPage({ missionId }: { missionId: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const fetchData = useServerFn(getWarRoomData);
  const fetchTrend = useServerFn(getWarRoomHealthTrend);

  const flagFn = useServerFn(flagQuestion);
  const reassignFn = useServerFn(reassignQuestion);
  const bulkResetFn = useServerFn(bulkResetBriefErrors);
  const briefFn = useServerFn(generateIrisBrief);

  const dataQ = useQuery({
    queryKey: ["war-room", missionId],
    queryFn: () => fetchData({ data: { missionId } }),
    refetchInterval: 60_000,
  });
  const trendQ = useQuery({
    queryKey: ["war-room-trend", missionId],
    queryFn: () => fetchTrend({ data: { missionId } }),
  });

  const stickyActivityQ = useQuery({
    queryKey: ["war-room-sticky-activity", missionId],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mission_assist_events")
        .select("id, created_at, metadata, question_id, user_id")
        .eq("mission_id", missionId)
        .eq("event_type", "sticky_note_posted")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });

  const sosActiveQ = useQuery({
    queryKey: ["war-room-sos-active", missionId],
    refetchInterval: 30_000,
    queryFn: async () => {
      const sinceIso = new Date(Date.now() - 4 * 3600_000).toISOString();
      const { data, error } = await supabase
        .from("mission_assist_events")
        .select("id, question_id, created_at")
        .eq("mission_id", missionId)
        .eq("event_type", "sos_raised")
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // notes posted today count for status strip
  const notesTodayQ = useQuery({
    queryKey: ["war-room-notes-today", missionId],
    refetchInterval: 120_000,
    queryFn: async () => {
      const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
      const { count, error } = await supabase
        .from("mission_assist_events")
        .select("id", { head: true, count: "exact" })
        .eq("mission_id", missionId)
        .eq("event_type", "sticky_note_posted")
        .gte("created_at", dayStart.toISOString());
      if (error) throw error;
      return count ?? 0;
    },
  });

  const [filterWriterId, setFilterWriterId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [nudgeTarget, setNudgeTarget] = useState<NudgeTarget | null>(null);
  const [reassignFor, setReassignFor] = useState<string | null>(null);
  const [highlightedWriterId, setHighlightedWriterId] = useState<string | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);
  const [intelTab, setIntelTab] = useState<"iris" | "live" | "sticky">("iris");
  const [mobileTab, setMobileTab] = useState<"team" | "radar" | "alerts">("radar");
  const [alertCount, setAlertCount] = useState(0);
  const [drawerTarget, setDrawerTarget] = useState<WriterDrawerTarget | null>(null);

  const openWriterDrawer = (w: any) => setDrawerTarget({
    userId: w.userId,
    name: w.name,
    role: w.role,
    hoursSinceActivity: w.hoursSinceActivity ?? null,
    lastActivity: w.lastActivity ?? null,
  });

  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent).detail?.writerId as string | undefined;
      if (!id) return;
      setHighlightedWriterId(id);
      requestAnimationFrame(() => {
        const el = document.querySelector(`[data-writer-row="${id}"]`);
        if (el) (el as HTMLElement).scrollIntoView({ behavior: "smooth", block: "center" });
      });
      window.setTimeout(() => setHighlightedWriterId(null), 1100);
    };
    window.addEventListener("atc:highlight-writer", handler as EventListener);
    return () => window.removeEventListener("atc:highlight-writer", handler as EventListener);
  }, []);

  const meQ = useQuery({
    queryKey: ["me-profile"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data: p } = await supabase.from("profiles").select("display_name,email").eq("id", u.user.id).maybeSingle();
      return p ?? { display_name: u.user.email ?? "Lead", email: u.user.email };
    },
  });

  const d = dataQ.data;

  const recentNudgesQ = useQuery({
    queryKey: ["nudge-recent", missionId],
    refetchInterval: 60_000,
    queryFn: async () => {
      const sinceIso = new Date(Date.now() - 24 * 3600_000).toISOString();
      const { data, error } = await supabase
        .from("mission_nudges")
        .select("recipient_id,sent_at,channel,status")
        .eq("mission_id", missionId)
        .eq("status", "sent")
        .gte("sent_at", sinceIso)
        .order("sent_at", { ascending: false });
      if (error) throw error;
      const byUser: Record<string, { sent_at: string; channel: string }> = {};
      for (const row of (data ?? []) as any[]) {
        if (!byUser[row.recipient_id]) {
          byUser[row.recipient_id] = { sent_at: row.sent_at, channel: row.channel };
        }
      }
      return byUser;
    },
  });

  const flagMut = useMutation({
    mutationFn: ({ qid, reason }: { qid: string; reason: string }) =>
      flagFn({ data: { missionId, questionId: qid, reason } }),
    onSuccess: () => { toast.success("Flagged"); qc.invalidateQueries({ queryKey: ["war-room", missionId] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const briefMut = useMutation({
    mutationFn: (qid: string) => briefFn({ data: { missionId, questionId: qid } }),
    onSuccess: () => { toast.success("Brief queued"); qc.invalidateQueries({ queryKey: ["war-room", missionId] }); },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });
  const reassignMut = useMutation({
    mutationFn: ({ qid, writerId }: { qid: string; writerId: string }) =>
      reassignFn({ data: { missionId, questionId: qid, writerId } }),
    onSuccess: () => { toast.success("Reassigned"); setReassignFor(null); qc.invalidateQueries({ queryKey: ["war-room", missionId] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const bulkResetMut = useMutation({
    mutationFn: () => bulkResetFn({ data: { missionId } }),
    onSuccess: (r: any) => { toast.success(`Reset ${r.reset} brief(s)`); qc.invalidateQueries({ queryKey: ["war-room", missionId] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const filteredSos = useMemo(() => {
    if (!d) return [];
    let rows = d.sos;
    if (filterWriterId) rows = rows.filter((s: any) => s.writerId === filterWriterId);
    if (filterStatus) rows = rows.filter((s: any) =>
      filterStatus === "ready" ? s.briefStatus === "ready" :
      filterStatus === "error" ? s.briefStatus === "error" :
      filterStatus === "generating" ? s.briefStatus === "generating" :
      filterStatus === "queued" ? s.briefStatus === "queued" :
      filterStatus === "pending" ? s.briefStatus === "pending" : true,
    );
    return rows;
  }, [d, filterWriterId, filterStatus]);

  if (dataQ.isLoading || !d) {
    return (
      <div className="flex flex-col h-screen text-white" style={{ background: "#070f1c", ...SCANLINE_BG }}>
        <div className="shrink-0 h-12 border-b border-white/[0.08] bg-[#050d18]" />
        <div className="flex-1 min-h-0 flex">
          <div className="h-full overflow-hidden border-r border-white/[0.06]" style={{ width: "26%" }}>
            <div className="h-9 border-b border-white/[0.06] bg-[#050d18]" />
            <TeamPulseSkeleton count={5} />
          </div>
          <div className="h-full overflow-hidden border-r border-white/[0.06]" style={{ width: "44%" }}>
            <div className="h-9 border-b border-white/[0.06] bg-[#050d18]" />
            <div className="p-2"><RadarSkeletonInline /></div>
          </div>
          <div className="h-full overflow-hidden" style={{ width: "30%" }}>
            <div className="h-9 border-b border-white/[0.06] bg-[#050d18]" />
            <div className="p-2"><AlertsSkeletonInline /></div>
          </div>
        </div>
      </div>
    );
  }

  const healthState =
    (d.stats.atRiskCount ?? 0) > 0 ? "at_risk" :
    (d.stats.watchCount ?? 0) > 0 ? "watch" : "on_track";

  const deadline = d.mission?.submission_deadline as string | null | undefined;
  const daysToDeadline = deadline
    ? Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400_000)
    : null;

  const groups = groupWriters(d.writers);
  const sosCount = sosActiveQ.data?.length ?? 0;
  const missionName = (d.mission?.name ?? "Mission").slice(0, 40);

  // ---------------- Status pill helpers ----------------
  const StatPill = ({ icon, value, label, danger = false }: { icon: string; value: number | string; label: string; danger?: boolean }) => (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px]"
      style={{
        background: danger ? "rgba(224,74,74,0.15)" : "rgba(255,255,255,0.05)",
        color: danger ? "#fca5a5" : "rgba(255,255,255,0.85)",
      }}
    >
      <span className="opacity-80">{icon}</span>
      <span className="font-semibold">{value}</span>
      <span className="opacity-60">{label}</span>
    </span>
  );

  // ---------------- COLUMN: TEAM ----------------
  const teamColumn = (
    <ColumnShell header={`TEAM · ${d.writers.length} MEMBERS`}>
      {d.writers.length === 0 ? (
        <div className="text-xs text-white/45 px-4 py-8 text-center">No writers assigned to this mission yet.</div>
      ) : (
        <>
          {ROLE_GROUPS.map((g) => {
            const rows = groups[g.key];
            if (!rows || rows.length === 0) return null;
            return (
              <div key={g.key}>
                <div className="sticky top-0 z-[1] px-3 py-1 text-[9px] font-semibold uppercase tracking-wider text-white/40 bg-[#070f1c]/95 backdrop-blur border-b border-white/[0.04]">
                  {g.label} · {rows.length}
                </div>
                {rows.map((w: any) => <WriterRow key={w.userId} w={w}
                  highlighted={highlightedWriterId === w.userId}
                  nudgedAt={recentNudgesQ.data?.[w.userId]?.sent_at}
                  filterActive={filterWriterId === w.userId}
                  onNudge={() => setNudgeTarget({
                    userId: w.userId, name: w.name, role: w.role,
                    questionCount: w.questionCount ?? 0,
                    liveLabel: deriveLive(w).label, liveColor: deriveLive(w).color,
                  })}
                  onFilter={() => openWriterDrawer(w)}
                />)}
              </div>
            );
          })}
          {groups.other.length > 0 && (
            <div>
              <div className="sticky top-0 z-[1] px-3 py-1 text-[9px] font-semibold uppercase tracking-wider text-white/40 bg-[#070f1c]/95 backdrop-blur border-b border-white/[0.04]">
                OTHER · {groups.other.length}
              </div>
              {groups.other.map((w: any) => <WriterRow key={w.userId} w={w}
                highlighted={highlightedWriterId === w.userId}
                nudgedAt={recentNudgesQ.data?.[w.userId]?.sent_at}
                filterActive={filterWriterId === w.userId}
                onNudge={() => setNudgeTarget({
                  userId: w.userId, name: w.name, role: w.role,
                  questionCount: w.questionCount ?? 0,
                  liveLabel: deriveLive(w).label, liveColor: deriveLive(w).color,
                })}
                onFilter={() => openWriterDrawer(w)}
              />)}
            </div>
          )}
        </>
      )}
    </ColumnShell>
  );

  // ---------------- COLUMN: RADAR ----------------
  const radarColumn = (
    <ColumnShell
      header="MISSION RADAR"
      headerAccent={
        <span className="flex items-center gap-1.5 text-[10px] text-white/60">
          <span
            className="w-1.5 h-1.5 rounded-full bg-green-400"
            style={{ animation: "atc-pulse 2s ease-in-out infinite" }}
          />
          LIVE
        </span>
      }
    >
      <div className="flex flex-col h-full">
        <div className="flex-1 min-h-0 flex flex-col">
          <MissionRadar missionId={missionId} bare />
        </div>
        <div className="border-t border-white/[0.06]">
          <button
            onClick={() => setStatsOpen((v) => !v)}
            className="w-full px-3 py-2 text-[10px] uppercase tracking-wider text-white/50 hover:text-white/80 hover:bg-white/[0.03] inline-flex items-center justify-center gap-1.5"
          >
            {statsOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {statsOpen ? "Hide mission stats" : "Show mission stats"}
          </button>
          {statsOpen && (
            <div className="px-3 pb-3 space-y-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-white/45 mb-2">Health Over Time</div>
                {!trendQ.data || !trendQ.data.hasHistory ? (
                  <div className="py-3 text-center text-xs text-white/50">
                    Health tracking started today.
                  </div>
                ) : null}
                <div style={{ width: "100%", height: 140 }}>
                  <ResponsiveContainer>
                    <LineChart data={trendQ.data?.points ?? []}>
                      <XAxis dataKey="date" stroke="rgba(255,255,255,0.4)" fontSize={10} />
                      <YAxis stroke="rgba(255,255,255,0.4)" fontSize={10} />
                      <Tooltip contentStyle={{ background: "#0a0f1a", border: "1px solid rgba(255,255,255,0.1)", fontSize: 11 }} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      <Line type="monotone" dataKey="healthy" stroke="#22c55e" strokeWidth={2} dot={{ r: 2 }} />
                      <Line type="monotone" dataKey="watch" stroke="#eab308" strokeWidth={2} dot={{ r: 2 }} />
                      <Line type="monotone" dataKey="at_risk" stroke="#ef4444" strokeWidth={2} dot={{ r: 2 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-white/45 mb-2">Brief Pipeline</div>
                <PipelineBar pipeline={d.pipeline} total={d.stats.totalQuestions} onSegment={setFilterStatus} active={filterStatus} />
                {d.pipeline.error > 0 && (
                  <button
                    onClick={() => bulkResetMut.mutate()}
                    disabled={bulkResetMut.isPending}
                    className="w-full mt-2 px-3 py-1.5 rounded bg-red-500/15 border border-red-500/30 text-red-300 text-[11px] inline-flex items-center justify-center gap-2 hover:bg-red-500/25"
                  >
                    <RotateCcw className="w-3 h-3" /> Reset {d.pipeline.error} brief error{d.pipeline.error > 1 ? "s" : ""}
                  </button>
                )}
              </div>
              {filteredSos.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-white/45 mb-2">Questions Needing Attention</div>
                  <ul className="space-y-1.5 max-h-[280px] overflow-y-auto pr-1">
                    {filteredSos.map((s: any) => (
                      <li key={s.questionId} className="rounded border border-white/10 bg-white/[0.02] p-2.5">
                        <div className="text-[12px] font-medium truncate">
                          <span className="text-white/45 font-mono mr-1.5">{s.questionNumber}</span>{s.questionTitle}…
                        </div>
                        <div className="text-[11px] text-white/55">{s.writerName}</div>
                        <ul className="mt-1 space-y-0.5">
                          {s.reasons.map((r: string) => (
                            <li key={r} className="text-[10px] text-amber-300">• {r}</li>
                          ))}
                        </ul>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          <button onClick={() => flagMut.mutate({ qid: s.questionId, reason: s.reasons[0] })}
                            className="text-[10px] px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 inline-flex items-center gap-1">
                            <Flag className="w-3 h-3" /> Flag
                          </button>
                          <button onClick={() => navigate({ to: "/missions/$missionId/flight-deck", params: { missionId }, hash: s.questionId })}
                            className="text-[10px] px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 inline-flex items-center gap-1">
                            <MessageCircle className="w-3 h-3" /> Thread
                          </button>
                          <button onClick={() => briefMut.mutate(s.questionId)}
                            disabled={briefMut.isPending}
                            className="text-[10px] px-2 py-0.5 rounded bg-amber-500/15 text-amber-200 hover:bg-amber-500/25 inline-flex items-center gap-1">
                            <Zap className="w-3 h-3" /> Brief
                          </button>
                          <button onClick={() => setReassignFor(s.questionId)}
                            className="text-[10px] px-2 py-0.5 rounded bg-white/5 hover:bg-white/10">
                            Reassign
                          </button>
                        </div>
                        {reassignFor === s.questionId && (
                          <div className="mt-1.5 flex gap-1.5">
                            <Select onValueChange={(v) => reassignMut.mutate({ qid: s.questionId, writerId: v })}>
                              <SelectTrigger className="h-7 text-[11px]"><SelectValue placeholder="Pick writer…" /></SelectTrigger>
                              <SelectContent>
                                {d.writers.filter((w: any) => w.userId !== s.writerId).map((w: any) => (
                                  <SelectItem key={w.userId} value={w.userId}>{w.name} ({w.role})</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setReassignFor(null)}>Cancel</Button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </ColumnShell>
  );

  // ---------------- COLUMN: ALERTS ----------------
  const alertsColumn = (
    <ColumnShell header={`IRIS ALERTS · ${alertCount} ACTIVE`}>
      <div className="flex flex-col h-full">
        <div style={{ flex: "0 0 55%", minHeight: 0 }} className="flex flex-col border-b border-white/[0.06]">
          <IrisAlertsPanel missionId={missionId} bare onCountChange={setAlertCount} />
        </div>
        <div style={{ flex: "0 0 45%", minHeight: 0 }} className="flex flex-col">
          <div className="px-3 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-white/40 bg-[#050d18] border-b border-white/[0.06]">
            Intel Feed
          </div>
          <div className="flex border-b border-white/[0.04] bg-[#050d18]">
            {([
              ["iris", "What IRIS Found"],
              ["live", "Live Intelligence"],
              ["sticky", "Sticky Notes"],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setIntelTab(key)}
                className={`flex-1 text-[10px] px-2 py-1.5 ${intelTab === key
                  ? "text-amber-200 border-b-2 border-amber-400/60 bg-white/[0.03]"
                  : "text-white/55 hover:text-white/80 hover:bg-white/[0.02]"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {intelTab === "iris" && (
              d.digest.length === 0 ? (
                <Empty>IRIS has been quiet. Everything looks stable.</Empty>
              ) : (
                <ul className="space-y-2">
                  {d.digest.map((item: any, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-xs">
                      <span className="shrink-0">{digestIcon(item.kind)}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-white/90 truncate">{item.title}</div>
                        {item.summary && <div className="text-white/45 text-[11px] line-clamp-2">{item.summary}</div>}
                        <div className="text-[10px] text-white/35 mt-0.5" style={{ fontFamily: "'Courier New', monospace" }}>
                          {item.source && <span className="mr-1.5">{item.source}</span>}· {relTime(item.ts)}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )
            )}
            {intelTab === "live" && (
              d.intelFeed.length === 0 ? (
                <Empty>No intelligence events yet for this mission.</Empty>
              ) : (
                <ul className="space-y-2">
                  {d.intelFeed.map((e: any) => (
                    <li key={e.id} className="text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/10 text-white/70 uppercase tracking-wide">{e.type}</span>
                        <span className="text-[10px] text-white/40" style={{ fontFamily: "'Courier New', monospace" }}>{relTime(e.ts)}</span>
                      </div>
                      <div className="text-white/85 mt-1 line-clamp-2">{e.title}</div>
                      {e.source && <div className="text-[10px] text-white/40 mt-0.5">{e.source}</div>}
                    </li>
                  ))}
                </ul>
              )
            )}
            {intelTab === "sticky" && (
              (stickyActivityQ.data ?? []).length === 0 ? (
                <Empty>No sticky notes pinned yet.</Empty>
              ) : (
                <ul className="space-y-2">
                  {(stickyActivityQ.data ?? []).map((e: any) => {
                    const summary = (e.metadata?.summary as string) ?? "Pinned a sticky note";
                    return (
                      <li key={e.id} className="text-xs flex items-start gap-2">
                        <span className="shrink-0" style={{ color: "#C49A2B" }}>📌</span>
                        <div className="flex-1 min-w-0">
                          <div style={{ color: "#E6C97A" }}>{summary}</div>
                          <div className="text-[10px] text-white/40 mt-0.5" style={{ fontFamily: "'Courier New', monospace" }}>{relTime(e.created_at)}</div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )
            )}
          </div>
        </div>
      </div>
    </ColumnShell>
  );

  return (
    <div className="flex flex-col h-screen text-white" style={{ background: "#070f1c", ...SCANLINE_BG }}>
      <style>{`
        @keyframes atc-pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
        @keyframes atc-sos { 0%,100%{opacity:1; box-shadow:0 0 0 0 rgba(239,68,68,.7)} 50%{opacity:.7; box-shadow:0 0 12px 2px rgba(239,68,68,.6)} }
      `}</style>

      {/* Mission status strip — pinned */}
      <div
        className="shrink-0 flex items-center gap-4 px-4 border-b text-[12px]"
        style={{
          height: 48,
          background: "#050d18",
          borderColor: "rgba(255,255,255,0.08)",
        }}
      >
        {/* LEFT */}
        <div className="flex items-center gap-3 shrink-0 min-w-0">
          <Radar className="w-4 h-4" style={{ color: GOLD }} />
          <span className="font-semibold truncate" style={{ color: GOLD, fontSize: 13 }}>{missionName}</span>
          <span
            className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded"
            style={{ background: "rgba(34,197,94,0.15)", color: "#86efac" }}
          >
            {String(d.mission?.status ?? "active")}
          </span>
          {daysToDeadline != null && (
            <span className={`text-[11px] whitespace-nowrap ${daysToDeadline < 14 ? "text-amber-300" : "text-white/90"}`}>
              {daysToDeadline < 0 ? `${Math.abs(daysToDeadline)}d overdue` : `${daysToDeadline}d to submission`}
            </span>
          )}
          <span
            className="text-[11px] font-semibold whitespace-nowrap"
            style={{ color: healthState === "at_risk" ? "#f87171" : healthState === "watch" ? "#fbbf24" : "#4ade80" }}
          >
            {healthState === "at_risk" ? "AT RISK" : healthState === "watch" ? "WATCH" : "ON TRACK"}
          </span>
        </div>

        {/* CENTER pills */}
        <div className="flex-1 flex items-center justify-center gap-2 flex-wrap min-w-0">
          <StatPill icon="👥" value={d.writers.length} label="Writers" />
          <StatPill icon="✓" value={d.pipeline.ready} label="Finalized" />
          <StatPill icon="●" value={d.stats.writersActiveToday} label="Active" />
          <StatPill icon="⚠" value={d.stats.atRiskCount ?? 0} label="At Risk" danger={(d.stats.atRiskCount ?? 0) > 0} />
          <StatPill icon="📌" value={notesTodayQ.data ?? 0} label="Notes today" />
        </div>

        {/* RIGHT */}
        <div className="flex items-center gap-3 shrink-0">
          {sosCount > 0 && (
            <button
              onClick={() => {
                const first = sosActiveQ.data?.[0];
                if (first?.question_id) {
                  navigate({ to: "/missions/$missionId/flight-deck", params: { missionId }, hash: first.question_id });
                }
              }}
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded"
              style={{
                background: "rgba(239,68,68,0.2)",
                color: "#fca5a5",
                border: "1px solid rgba(239,68,68,0.5)",
                animation: "atc-sos 0.8s ease-in-out infinite",
              }}
            >
              ⚠ {sosCount > 1 ? `${sosCount} SOS` : "SOS"}
            </button>
          )}
          <span className="text-[10px] text-white/45 whitespace-nowrap" style={{ fontFamily: "'Courier New', monospace" }}>
            IRIS: {relTime(d.lastIrisRun)}
          </span>
          <Button
            size="sm" variant="ghost" className="h-7 gap-1.5"
            onClick={() => { dataQ.refetch(); trendQ.refetch(); }}
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
        </div>
      </div>

      {/* Mobile tab bar */}
      <div className="atc-mobile shrink-0 flex border-b border-white/[0.06] bg-[#050d18]">
        {([
          ["team", `Team · ${d.writers.length}`],
          ["radar", "Radar"],
          ["alerts", `Alerts · ${alertCount}`],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setMobileTab(key)}
            className={`flex-1 text-[11px] py-2 ${mobileTab === key
              ? "text-amber-200 border-b-2 border-amber-400/60"
              : "text-white/55"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Three columns */}
      <div className="flex-1 min-h-0 flex atc-cols">
        <div
          className={`atc-col-team h-full overflow-hidden border-r border-white/[0.06] ${mobileTab === "team" ? "" : "atc-hidden-mobile"}`}
          style={{ width: "26%" }}
        >
          {teamColumn}
        </div>
        <div
          className={`atc-col-radar h-full overflow-hidden border-r border-white/[0.06] ${mobileTab === "radar" ? "" : "atc-hidden-mobile"}`}
          style={{ width: "44%" }}
        >
          {radarColumn}
        </div>
        <div
          className={`atc-col-alerts h-full overflow-hidden ${mobileTab === "alerts" ? "" : "atc-hidden-mobile"}`}
          style={{ width: "30%" }}
        >
          {alertsColumn}
        </div>
      </div>

      <style>{`
        @media (max-width: 899px) {
          .atc-cols > div { width: 100% !important; border-right: none !important; }
          .atc-hidden-mobile { display: none !important; }
        }
        @media (min-width: 900px) {
          .atc-mobile { display: none !important; }
        }
      `}</style>

      <NudgeModal
        open={!!nudgeTarget}
        onOpenChange={(o) => { if (!o) setNudgeTarget(null); }}
        target={nudgeTarget}
        missionId={missionId}
        missionName={d.mission?.name ?? "this mission"}
        senderFirstName={((meQ.data as any)?.display_name ?? (meQ.data as any)?.email ?? "Lead").split(/[\s@]/)[0] || "Lead"}
      />

      <WriterDrawer
        open={!!drawerTarget}
        onClose={() => setDrawerTarget(null)}
        target={drawerTarget}
        missionId={missionId}
        missionName={d.mission?.name ?? "this mission"}
        daysToDeadline={daysToDeadline}
        senderFirstName={((meQ.data as any)?.display_name ?? (meQ.data as any)?.email ?? "Lead").split(/[\s@]/)[0] || "Lead"}
        onNudge={(writerId) => {
          const w = d.writers.find((x: any) => x.userId === writerId);
          if (!w) return;
          setNudgeTarget({
            userId: w.userId, name: w.name, role: w.role,
            questionCount: w.questionCount ?? 0,
            liveLabel: "—", liveColor: "#94a3b8",
          });
        }}
        onOpenFlightDeck={(writerId, questionId) => {
          // TODO: Flight Deck doesn't yet support a writer filter — open the deck
          // and (when given) scroll to the specific question.
          const url = questionId
            ? `/missions/${missionId}/flight-deck#${questionId}`
            : `/missions/${missionId}/flight-deck`;
          window.open(url, "_blank", "noopener");
        }}
      />
    </div>
  );
}

// =================== Column shell ===================
function ColumnShell({ header, headerAccent, children }: {
  header: string; headerAccent?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col h-full">
      <div
        className="shrink-0 flex items-center justify-between gap-2 px-3 border-b border-white/[0.06]"
        style={{ height: 36, background: "#050d18" }}
      >
        <span className="text-[11px] font-semibold uppercase tracking-wider text-white/85">{header}</span>
        {headerAccent}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
    </div>
  );
}

// =================== Writer row ===================
function deriveLive(w: any) {
  const total = w.questionCount ?? 0;
  const finalized = w.finalized ?? 0;
  const activeQ = w.activeCount ?? 0;
  const atRiskQ = w.atRisk ?? 0;
  const hrs = w.hoursSinceActivity;
  const idle = total > 0 && activeQ > 0 && (hrs == null || hrs > 8);
  if (total === 0) return { label: "— Unassigned", color: "#94a3b8" };
  if (atRiskQ > 0) return { label: "⚠ At Risk", color: "#ef4444" };
  if (idle) return { label: "● Idle", color: "#f59e0b" };
  if (finalized > 0) return { label: "✓ Active", color: "#22c55e" };
  return { label: "● Active", color: "#22c55e" };
}

function WriterRow({
  w, highlighted, nudgedAt, filterActive, onNudge, onFilter,
}: {
  w: any; highlighted: boolean; nudgedAt?: string; filterActive: boolean;
  onNudge: () => void; onFilter: () => void;
}) {
  const live = deriveLive(w);
  const total = w.questionCount ?? 0;
  const finalized = w.finalized ?? 0;
  const activeQ = w.activeCount ?? 0;
  const atRiskQ = w.atRisk ?? 0;
  const hrs = w.hoursSinceActivity;
  const lastSeen = !w.lastActivity
    ? "Never"
    : (hrs != null && hrs < 24 ? (hrs < 1 ? "Just now" : `${Math.round(hrs)}h ago`) : relTime(w.lastActivity));

  return (
    <div
      data-writer-row={w.userId}
      className={`flex items-center gap-3 px-3 py-2 border-b border-white/[0.04] transition-colors ${highlighted ? "bg-amber-400/20" : "hover:bg-white/[0.03]"}`}
      style={{ minHeight: 64, borderLeft: `4px solid ${live.color}` }}
    >
      <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-[11px] font-semibold shrink-0">
        {initials(w.name)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[12px] font-medium text-white truncate">{w.name}</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-white/55 uppercase tracking-wide shrink-0">{w.role}</span>
        </div>
        <div className="text-[10px] text-white/45 mt-0.5 truncate" style={{ fontFamily: "'Courier New', monospace" }}>
          {total === 0
            ? `Unassigned · ${lastSeen}`
            : <>
                {total}q · <span className="text-green-400">{finalized}✓</span>{" "}
                <span className="text-sky-300">{activeQ}●</span>{" "}
                <span className="text-red-400">{atRiskQ}⚠</span>
                {" · "}{lastSeen}
              </>}
          {nudgedAt && <span className="ml-2 italic text-white/35">Nudged {relTime(nudgedAt)}</span>}
        </div>
      </div>
      <div className="flex flex-col gap-1 shrink-0">
        <button
          onClick={onNudge}
          className="text-[9px] px-1.5 py-0.5 rounded border border-white/15 text-white/65 hover:bg-white/5 inline-flex items-center gap-1"
        >
          <MessageSquare className="w-2.5 h-2.5" /> Nudge
        </button>
        <button
          onClick={onFilter}
          className={`text-[9px] px-1.5 py-0.5 rounded border inline-flex items-center gap-1 ${filterActive
            ? "bg-amber-500/20 border-amber-400/40 text-amber-200"
            : "border-white/15 text-white/65 hover:bg-white/5"}`}
        >
          <Eye className="w-2.5 h-2.5" /> Questions
        </button>
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-center text-xs py-6 text-white/40">{children}</div>;
}

function digestIcon(kind: string) {
  switch (kind) {
    case "risk": return "🔴";
    case "intel": return "🟡";
    case "node": return "🟢";
    case "daily": return "⚡";
    case "feedback_low": return "👎";
    default: return "📄";
  }
}

function PipelineBar({ pipeline, total, onSegment, active }: {
  pipeline: any; total: number; onSegment: (key: string | null) => void; active: string | null;
}) {
  const segs = [
    { key: "ready", label: "Ready", count: pipeline.ready, color: "#22c55e" },
    { key: "queued", label: "Queued", count: pipeline.queued, color: "#3b82f6" },
    { key: "generating", label: "Generating", count: pipeline.generating, color: "#a855f7" },
    { key: "pending", label: "Pending", count: pipeline.pending, color: "#94a3b8" },
    { key: "error", label: "Error", count: pipeline.error, color: "#ef4444" },
  ];
  const totalCount = Math.max(total, segs.reduce((a, s) => a + s.count, 0), 1);
  return (
    <div>
      <div className="flex h-5 rounded overflow-hidden border border-white/10">
        {segs.map((s) => {
          if (s.count === 0) return null;
          const pct = (s.count / totalCount) * 100;
          const isActive = active === s.key;
          return (
            <button
              key={s.key}
              onClick={() => onSegment(active === s.key ? null : s.key)}
              style={{ width: `${pct}%`, background: s.color, opacity: isActive ? 1 : 0.85 }}
              className="text-[9px] text-black font-medium hover:opacity-100 transition"
              title={`${s.label}: ${s.count}`}
            >
              {pct > 8 ? `${s.count}` : ""}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-2 gap-y-1 mt-1.5">
        {segs.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1 text-[9px] text-white/55">
            <span className="w-1.5 h-1.5 rounded-sm" style={{ background: s.color }} /> {s.label}: <span className="text-white">{s.count}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
