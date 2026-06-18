import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  getWarRoomData, getWarRoomHealthTrend, sendNudge, flagQuestion,
  reassignQuestion, bulkResetBriefErrors,
} from "@/lib/war-room.functions";
import { generateIrisBrief } from "@/lib/iris-brief-generator.functions";
import { MissionRadar } from "./MissionRadar";
import { IrisAlertsPanel } from "./IrisAlertsPanel";
import { NudgeModal, type NudgeTarget } from "./NudgeModal";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Radar, RefreshCw, MessageSquare, Eye, Flag, MessageCircle, Zap, RotateCcw,
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


export function WarRoomPage({ missionId }: { missionId: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const fetchData = useServerFn(getWarRoomData);
  const fetchTrend = useServerFn(getWarRoomHealthTrend);
  const nudgeFn = useServerFn(sendNudge);
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

  const [filterWriterId, setFilterWriterId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [nudgeTarget, setNudgeTarget] = useState<NudgeTarget | null>(null);
  const [reassignFor, setReassignFor] = useState<string | null>(null);
  const [highlightedWriterId, setHighlightedWriterId] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent).detail?.writerId as string | undefined;
      if (!id) return;
      setHighlightedWriterId(id);
      // Scroll into view
      requestAnimationFrame(() => {
        const el = document.querySelector(`[data-writer-row="${id}"]`);
        if (el) (el as HTMLElement).scrollIntoView({ behavior: "smooth", block: "center" });
      });
      window.setTimeout(() => setHighlightedWriterId(null), 1100);
    };
    window.addEventListener("atc:highlight-writer", handler as EventListener);
    return () => window.removeEventListener("atc:highlight-writer", handler as EventListener);
  }, []);

  const d = dataQ.data;

  // Recent nudges (last 24h) per recipient — drives "Nudged Xago" indicator on writer rows.
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
    return <div className="p-6 text-white/55 text-sm">Loading Air Traffic Control…</div>;
  }

  // Top-bar health status derives strictly from question health counts:
  //   AT RISK  → any mission_questions.health_status = 'at_risk'
  //   WATCH    → no at_risk, but at least one 'watch'
  //   ON TRACK → no at_risk and no watch (all healthy or empty)
  // healthyPct is a separate widget metric and must NOT drive this status.
  const healthState =
    (d.stats.atRiskCount ?? 0) > 0 ? "at_risk" :
    (d.stats.watchCount ?? 0) > 0 ? "watch" : "on_track";

  const topBarColor =
    healthState === "at_risk" ? "rgba(239, 68, 68, 0.12)" :
    healthState === "watch"   ? "rgba(234, 179, 8, 0.10)" :
    "rgba(255,255,255,0.02)";

  const deadline = d.mission?.submission_deadline as string | null | undefined;
  const daysToDeadline = deadline
    ? Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400_000)
    : null;

  return (
    <div className="min-h-full text-white" style={{ background: "#0a0f1a" }}>
      {/* Page header */}
      <div className="px-4 sm:px-6 pt-5 pb-3 border-b border-white/5">
        <h1 className="text-xl font-semibold tracking-tight">Air Traffic Control</h1>
        <p className="text-[12px] text-white/45 mt-0.5">Mission oversight. Live. For leads only.</p>
      </div>
      {/* Top status bar */}
      <div
        className={`px-4 sm:px-6 py-3 border-b border-white/10 ${healthState === "at_risk" ? "animate-pulse" : ""}`}
        style={{ background: topBarColor, borderLeft: `4px solid ${GOLD}` }}
      >
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <div className="flex items-center gap-2">
            <Radar className="w-4 h-4" style={{ color: GOLD }} />
            <span className="font-semibold">{d.mission?.name ?? "Mission"}</span>
          </div>
          <span className="text-white/45 text-xs uppercase tracking-wider">{d.mission?.status}</span>
          {daysToDeadline != null && (
            <span className="text-xs">
              <span className="text-white/45">Submission:</span>{" "}
              <span className={daysToDeadline < 14 ? "text-amber-300" : "text-white"}>
                {daysToDeadline < 0 ? `${Math.abs(daysToDeadline)}d overdue` : `${daysToDeadline}d`}
              </span>
            </span>
          )}
          <span className="text-xs">
            <span className="text-white/45">Health:</span>{" "}
            <span className={
              healthState === "at_risk" ? "text-red-400" :
              healthState === "watch" ? "text-amber-300" : "text-green-400"
            }>
              {healthState === "at_risk" ? "AT RISK" : healthState === "watch" ? "WATCH" : "ON TRACK"}
            </span>
          </span>
          <span className="text-xs">
            <span className="text-white/45">Team:</span>{" "}
            <span className="text-white">{d.stats.writersActiveToday} active</span>
          </span>
          <span className="text-xs">
            <span className="text-white/45">Briefed:</span>{" "}
            <span className="text-white">{d.pipeline.ready}/{d.stats.totalQuestions}</span>
          </span>
          <span className="text-xs">
            <span className="text-white/45">Last IRIS:</span>{" "}
            <span className="text-white">{relTime(d.lastIrisRun)}</span>
          </span>
          {(sosActiveQ.data?.length ?? 0) > 0 && (
            <button
              onClick={() => {
                const first = sosActiveQ.data?.[0];
                if (first?.question_id) {
                  navigate({ to: "/missions/$missionId/flight-deck", params: { missionId }, hash: first.question_id });
                }
              }}
              className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded animate-pulse"
              style={{ background: "rgba(239,68,68,0.2)", color: "#fca5a5", border: "1px solid rgba(239,68,68,0.5)" }}
            >
              ⚠ {(sosActiveQ.data?.length ?? 0) > 1 ? `${sosActiveQ.data?.length} SOS Active` : "SOS Active"}
            </button>
          )}
          <Button
            size="sm" variant="ghost" className={`${(sosActiveQ.data?.length ?? 0) > 0 ? "" : "ml-auto"} h-7 gap-1.5`}
            onClick={() => { dataQ.refetch(); trendQ.refetch(); }}
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
        </div>
      </div>

      <div className="p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* LEFT */}
        <div className="space-y-4 lg:col-span-1">
          <Widget
            title="Team Pulse"
            sub="Updated in real time"
            badge={<span className="flex items-center gap-1.5 text-[10px] text-green-400"><span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />LIVE</span>}
            stamp={d.generatedAt}
          >
            {d.writers.length === 0 ? (
              <Empty>No writers assigned to this mission yet.</Empty>
            ) : (
              <ul className="divide-y divide-white/5">
                {d.writers.map((w: any) => {
                  const total = w.questionCount ?? 0;
                  const finalized = w.finalized ?? 0;
                  const activeQ = w.activeCount ?? 0;
                  const atRiskQ = w.atRisk ?? 0;
                  const hrs = w.hoursSinceActivity;
                  const idle = total > 0 && activeQ > 0 && (hrs == null || hrs > 8);
                  let liveLabel = "— Unassigned";
                  let liveColor = "#94a3b8";
                  if (total === 0) {
                    liveLabel = "— Unassigned"; liveColor = "#94a3b8";
                  } else if (atRiskQ > 0) {
                    liveLabel = "⚠ At Risk"; liveColor = "#ef4444";
                  } else if (idle) {
                    liveLabel = "● Idle"; liveColor = "#f59e0b";
                  } else if (finalized > 0) {
                    liveLabel = "✓ Active"; liveColor = "#22c55e";
                  } else {
                    liveLabel = "● Active"; liveColor = "#22c55e";
                  }
                  const lastSeen = !w.lastActivity
                    ? "Never"
                    : (hrs != null && hrs < 24 ? (hrs < 1 ? "Just now" : `${Math.round(hrs)}h ago`) : relTime(w.lastActivity));
                  return (
                    <li
                      key={w.userId}
                      data-writer-row={w.userId}
                      className={`py-3 first:pt-0 last:pb-0 pl-3 transition-colors ${highlightedWriterId === w.userId ? "bg-amber-400/20" : ""}`}
                      style={{ borderLeft: `4px solid ${liveColor}` }}
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-xs font-semibold shrink-0">
                          {initials(w.name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">{w.name}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-white/55 uppercase tracking-wide">{w.role}</span>
                          </div>
                          <div className="text-[10px] text-white/40 mt-0.5">{lastSeen}</div>
                          {total === 0 ? (
                            <div className="text-[11px] text-white/40 mt-1">
                              No questions assigned
                              {/* TODO: requires question_progress.assignee_id or mission_assignments.assigned_writer_id rows linking writers to mission_questions */}
                            </div>
                          ) : (
                            <div className="text-[11px] text-white/55 mt-1">
                              {total}q · <span className="text-green-400">{finalized}✓</span>{" "}
                              <span className="text-sky-300">{activeQ}●</span>{" "}
                              <span className="text-red-400">{atRiskQ}⚠</span>
                            </div>
                          )}
                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-[11px]" style={{ color: liveColor }}>{liveLabel}</span>
                            <div className="flex gap-1 ml-auto">
                              <button
                                onClick={() => { setNudgeTarget({ id: w.userId, name: w.name }); setNudgeMsg(`Hey ${w.name.split(" ")[0]} — checking in on your questions. Anything you need from me?`); }}
                                className="text-[10px] px-2 py-1 rounded bg-white/5 hover:bg-white/10 inline-flex items-center gap-1"
                              ><MessageSquare className="w-3 h-3" /> Nudge</button>
                              <button
                                onClick={() => setFilterWriterId(filterWriterId === w.userId ? null : w.userId)}
                                className={`text-[10px] px-2 py-1 rounded inline-flex items-center gap-1 ${filterWriterId === w.userId ? "bg-amber-500/20 text-amber-200" : "bg-white/5 hover:bg-white/10"}`}
                              ><Eye className="w-3 h-3" /> Questions</button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Widget>

          <Widget
            title="Questions Needing Attention"
            sub="Sorted by urgency"
            badge={filterWriterId || filterStatus ? (
              <button className="text-[10px] text-amber-300 hover:underline" onClick={() => { setFilterWriterId(null); setFilterStatus(null); }}>
                Clear filter
              </button>
            ) : null}
            stamp={d.generatedAt}
          >
            {filteredSos.length === 0 ? (
              <div className="py-6 text-center text-sm text-green-400 bg-green-500/5 rounded border border-green-500/10">
                ✅ No questions need attention right now.
              </div>
            ) : (
              <ul className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
                {filteredSos.map((s: any) => (
                  <li key={s.questionId} className="rounded border border-white/10 bg-white/[0.02] p-3">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          <span className="text-white/45 font-mono mr-1.5">{s.questionNumber}</span>{s.questionTitle}…
                        </div>
                        <div className="text-[11px] text-white/55 mt-0.5">{s.writerName}</div>
                        <ul className="mt-1.5 space-y-0.5">
                          {s.reasons.map((r: string) => (
                            <li key={r} className="text-[11px] text-amber-300">• {r}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      <button onClick={() => flagMut.mutate({ qid: s.questionId, reason: s.reasons[0] })}
                        className="text-[10px] px-2 py-1 rounded bg-white/5 hover:bg-white/10 inline-flex items-center gap-1">
                        <Flag className="w-3 h-3" /> Flag
                      </button>
                      <button onClick={() => navigate({ to: "/missions/$missionId/flight-deck", params: { missionId }, hash: s.questionId })}
                        className="text-[10px] px-2 py-1 rounded bg-white/5 hover:bg-white/10 inline-flex items-center gap-1">
                        <MessageCircle className="w-3 h-3" /> Thread
                      </button>
                      <button onClick={() => briefMut.mutate(s.questionId)}
                        disabled={briefMut.isPending}
                        className="text-[10px] px-2 py-1 rounded bg-amber-500/15 text-amber-200 hover:bg-amber-500/25 inline-flex items-center gap-1">
                        <Zap className="w-3 h-3" /> IRIS Brief it
                      </button>
                      <button onClick={() => setReassignFor(s.questionId)}
                        className="text-[10px] px-2 py-1 rounded bg-white/5 hover:bg-white/10">
                        Reassign
                      </button>
                    </div>
                    {reassignFor === s.questionId && (
                      <div className="mt-2 flex gap-2">
                        <Select onValueChange={(v) => reassignMut.mutate({ qid: s.questionId, writerId: v })}>
                          <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Pick a writer…" /></SelectTrigger>
                          <SelectContent>
                            {d.writers.filter((w: any) => w.userId !== s.writerId).map((w: any) => (
                              <SelectItem key={w.userId} value={w.userId}>{w.name} ({w.role})</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setReassignFor(null)}>Cancel</Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Widget>
        </div>

        {/* CENTER */}
        <div className="space-y-4 lg:col-span-1">
          <MissionRadar missionId={missionId} />
          <Widget title="Health Over Time" sub="Last 14 days" stamp={d.generatedAt}>
            {!trendQ.data || !trendQ.data.hasHistory ? (
              <div className="py-6 text-center text-xs text-white/50">
                Health tracking started today — single snapshot below.
              </div>
            ) : null}
            <div style={{ width: "100%", height: 160 }}>
              <ResponsiveContainer>
                <LineChart data={trendQ.data?.points ?? []}>
                  <XAxis dataKey="date" stroke="rgba(255,255,255,0.4)" fontSize={10} />
                  <YAxis stroke="rgba(255,255,255,0.4)" fontSize={10} />
                  <Tooltip contentStyle={{ background: "#0a0f1a", border: "1px solid rgba(255,255,255,0.1)", fontSize: 11 }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Line type="monotone" dataKey="healthy" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="watch" stroke="#eab308" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="at_risk" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <Stat label="Total Questions" value={d.stats.totalQuestions} />
              <Stat label="Healthy" value={`${d.stats.healthyPct}%`} />
              <Stat label="Briefs Ready" value={d.stats.briefsReady} />
              <Stat label="Writers Active Today" value={d.stats.writersActiveToday} />
            </div>
          </Widget>

          <Widget title="Brief Pipeline" sub="Generation status across all questions" stamp={d.generatedAt}>
            <PipelineBar pipeline={d.pipeline} total={d.stats.totalQuestions} onSegment={setFilterStatus} active={filterStatus} />
            <div className="text-xs text-white/55 mt-3">
              <span className="text-white">{d.pipeline.ready}</span> ready ·{" "}
              <span className="text-white">{d.pipeline.generating + d.pipeline.queued}</span> in progress ·{" "}
              <span className="text-white">{d.pipeline.pending}</span> pending
            </div>
            {d.pipeline.error > 0 && (
              <button
                onClick={() => bulkResetMut.mutate()}
                disabled={bulkResetMut.isPending}
                className="w-full mt-3 px-3 py-2 rounded bg-red-500/15 border border-red-500/30 text-red-300 text-xs inline-flex items-center justify-center gap-2 hover:bg-red-500/25"
              >
                <RotateCcw className="w-3.5 h-3.5" /> ⚠ {d.pipeline.error} brief error{d.pipeline.error > 1 ? "s" : ""} — click to reset & retry
              </button>
            )}
          </Widget>
        </div>

        {/* RIGHT */}
        <div className="space-y-4 lg:col-span-1">
          <IrisAlertsPanel missionId={missionId} />
          <Widget title="⚡ What IRIS Found" sub="Since your last visit" stamp={d.generatedAt}>
            {d.digest.length === 0 ? (
              <Empty muted>IRIS has been quiet. Everything looks stable.</Empty>
            ) : (
              <ul className="space-y-2">
                {d.digest.map((item: any, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-xs">
                    <span className="shrink-0">{digestIcon(item.kind)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-white/90 truncate">{item.title}</div>
                      {item.summary && <div className="text-white/45 text-[11px] line-clamp-2">{item.summary}</div>}
                      <div className="text-[10px] text-white/35 mt-0.5">
                        {item.source && <span className="mr-1.5">{item.source}</span>}· {relTime(item.ts)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Widget>

          <Widget
            title="📌 Sticky Notes"
            sub="Pinned to questions"
            stamp={stickyActivityQ.data?.[0]?.created_at ?? undefined}
          >
            {(stickyActivityQ.data ?? []).length === 0 ? (
              <Empty muted>No sticky notes pinned yet.</Empty>
            ) : (
              <ul className="space-y-2">
                {(stickyActivityQ.data ?? []).map((e: any) => {
                  const summary = (e.metadata?.summary as string) ?? "Pinned a sticky note";
                  return (
                    <li key={e.id} className="text-xs flex items-start gap-2">
                      <span className="shrink-0" style={{ color: "#C49A2B" }}>📌</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-white/90" style={{ color: "#E6C97A" }}>{summary}</div>
                        <div className="text-[10px] text-white/40 mt-0.5">{relTime(e.created_at)}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Widget>

          <Widget title="Live Intelligence" sub="Last 10 signals" stamp={d.generatedAt}>
            {d.intelFeed.length === 0 ? (
              <Empty>No intelligence events yet for this mission.</Empty>
            ) : (
              <ul className="space-y-2">
                {d.intelFeed.map((e: any) => (
                  <li key={e.id} className="text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/10 text-white/70 uppercase tracking-wide">{e.type}</span>
                      <span className="text-[10px] text-white/40">{relTime(e.ts)}</span>
                    </div>
                    <div className="text-white/85 mt-1 line-clamp-2">{e.title}</div>
                    {e.source && <div className="text-[10px] text-white/40 mt-0.5">{e.source}</div>}
                  </li>
                ))}
              </ul>
            )}
            <button
              onClick={() => navigate({ to: "/missions/$missionId/intelligence", params: { missionId } })}
              className="mt-3 text-xs text-amber-300 hover:underline"
            >
              View full intelligence →
            </button>
          </Widget>
        </div>
      </div>

      {/* Nudge dialog */}
      <Dialog open={!!nudgeTarget} onOpenChange={(o) => { if (!o) setNudgeTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send a nudge to {nudgeTarget?.name}</DialogTitle>
          </DialogHeader>
          <Textarea value={nudgeMsg} onChange={(e) => setNudgeMsg(e.target.value)} rows={4} className="text-sm" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNudgeTarget(null)}>Cancel</Button>
            <Button onClick={() => nudgeMut.mutate()} disabled={!nudgeMsg.trim() || nudgeMut.isPending}>
              {nudgeMut.isPending ? "Sending…" : "Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Widget({ title, sub, badge, stamp, children }: {
  title: string; sub?: string; badge?: React.ReactNode; stamp?: string; children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.015] p-4">
      <header className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-white">{title}</h2>
          {sub && <p className="text-[11px] text-white/45 mt-0.5">{sub}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {badge}
          {stamp && <span className="text-[10px] text-white/35">{relTime(stamp)}</span>}
        </div>
      </header>
      {children}
    </section>
  );
}

function Empty({ children, muted = false }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <div className={`text-center text-xs py-6 ${muted ? "text-white/35" : "text-white/55"}`}>{children}</div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded border border-white/10 bg-white/[0.02] p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-white/45">{label}</div>
      <div className="text-lg font-semibold mt-0.5">{value}</div>
    </div>
  );
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
      <div className="flex h-6 rounded overflow-hidden border border-white/10">
        {segs.map((s) => {
          if (s.count === 0) return null;
          const pct = (s.count / totalCount) * 100;
          const isActive = active === s.key;
          return (
            <button
              key={s.key}
              onClick={() => onSegment(active === s.key ? null : s.key)}
              style={{ width: `${pct}%`, background: s.color, opacity: isActive ? 1 : 0.85 }}
              className="text-[10px] text-black font-medium hover:opacity-100 transition"
              title={`${s.label}: ${s.count}`}
            >
              {pct > 8 ? `${s.count}` : ""}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
        {segs.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1 text-[10px] text-white/55">
            <span className="w-2 h-2 rounded-sm" style={{ background: s.color }} /> {s.label}: <span className="text-white">{s.count}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
