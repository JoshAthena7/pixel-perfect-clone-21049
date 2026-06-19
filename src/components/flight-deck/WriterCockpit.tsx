import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  AlertTriangle, ChevronDown, ChevronRight, FileText, Flag,
  MessageSquare, Sparkles, Lock, Download, LifeBuoy, Activity, Radio, Gauge, Pin,
} from "lucide-react";
import { fireAssistEvent } from "@/lib/fireAssistEvent";
import {
  updateProgressStatus, nextStatuses, type ProgressStatus,
} from "@/lib/writer-cockpit.functions";
import { buildLineOfSight } from "@/lib/iris-line-of-sight.functions";
import { ScoreMeDialog } from "@/components/flight-deck/ScoreMeDialog";
import { MissionPulsePanel } from "@/components/flight-deck/MissionPulsePanel";
import { CheckInDialog } from "@/components/flight-deck/CheckInDialog";
import { StickyNotesPanel } from "@/components/flight-deck/StickyNotesPanel";
import { AtlasAssistBar } from "@/components/atlas/AtlasAssistBar";

import { TeamPulseCard } from "@/components/atlas/TeamPulseCard";
import { NarrativeBriefSection } from "@/components/flight-deck/NarrativeBriefSection";

const BG = "#060f1a";
const CARD = "#0a1828";
const PANEL = "#071322";
const GOLD = "#C9972B";
const RED = "#ef4444";
const AMBER = "#f59e0b";
const GREEN = "#22c55e";
const PURPLE = "#a78bfa";
const BLUE = "#93c5fd";

const STATUS_COLORS: Record<string, string> = {
  not_started: "#6b7280",
  briefed: BLUE,
  in_progress: GOLD,
  internal_review: PURPLE,
  red_team: RED,
  gold_team: AMBER,
  mock_scored: "#fb923c",
  revising: BLUE,
  finalized: GREEN,
};

function healthColor(h: string | null) {
  if (h === "at_risk") return RED;
  if (h === "watch") return AMBER;
  return GREEN;
}

function daysBetween(d: string | null | Date | null): number | null {
  if (!d) return null;
  const t = new Date(d).getTime() - Date.now();
  return Math.floor(t / 86400000);
}

function relTime(d: string | null): string {
  if (!d) return "—";
  const diff = Date.now() - new Date(d).getTime();
  const days = Math.floor(diff / 86400000);
  if (days > 1) return `${days}d ago`;
  const hours = Math.floor(diff / 3600000);
  if (hours > 1) return `${hours}h ago`;
  return "just now";
}

type Q = {
  id: string;
  question_number: string;
  question_text: string;
  health_status: string | null;
  due_date: string | null;
  section_name: string | null;
  section_weight: number | null;
  coherence_status: string | null;
  iris_brief: any;
  iris_brief_status: string | null;
  iris_decoded_intent: string | null;
  iris_brief_generated_at: string | null;
  evaluation_weight: number | null;
  page_limit: number | null;
  progress_id: string;
  progress_status: string;
  acceptance_status: string | null;
  writer_confidence: string | null;
  mock_score: number | null;
  max_score: number | null;
  internal_due_date: string | null;
  assigned_at: string | null;
  brief_opened_at: string | null;
  brief_exported_at: string | null;
  last_activity_at: string | null;
  sme_assigned: boolean | null;
  primary_win_theme: string | null;
};

export function WriterCockpit({ missionId, missionName }: { missionId: string; missionName: string }) {
  const qc = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [firstName, setFirstName] = useState<string>("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [briefOpenFor, setBriefOpenFor] = useState<Q | null>(null);
  const [scoreMeFor, setScoreMeFor] = useState<Q | null>(null);
  const [pulseOpen, setPulseOpen] = useState(false);
  const [checkInFor, setCheckInFor] = useState<Q | null>(null);
  const [stickyNotesFor, setStickyNotesFor] = useState<Q | null>(null);
  
  const updateStatus = useServerFn(updateProgressStatus);
  const triggerLineOfSight = useServerFn(buildLineOfSight);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const u = data.user;
      if (!u) return;
      setUserId(u.id);
      const { data: p } = await supabase
        .from("profiles").select("display_name").eq("id", u.id).maybeSingle();
      setFirstName((p?.display_name ?? u.email ?? "").split(" ")[0].split("@")[0]);
    })();
  }, []);

  // Fire-and-forget: ensure Line of Sight has been built for this mission.
  // The server fn has its own 5-minute throttle, so this is safe to call on mount.
  useEffect(() => {
    if (!missionId || !userId) return;
    triggerLineOfSight({ data: { missionId } })
      .then(() => qc.invalidateQueries({ queryKey: ["writer-cockpit", missionId, userId] }))
      .catch((e) => console.log("[WriterCockpit] buildLineOfSight failed", e));
  }, [missionId, userId, triggerLineOfSight, qc]);

  const refreshKey = ["writer-cockpit", missionId, userId];
  const { data: cockpit, isLoading } = useQuery({
    queryKey: refreshKey,
    enabled: !!userId,
    queryFn: async () => {
      const myQp = await supabase
        .from("question_progress")
        .select("*")
        .eq("mission_id", missionId)
        .eq("assignee_id", userId!)
        .eq("role", "lead_writer");
      const qpRows = (myQp.data ?? []) as any[];
      const qids = qpRows.map(r => r.question_id);
      if (qids.length === 0) return { questions: [] as Q[], feedback: [], conflicts: [], connections: [], mission: null, pensDown: false, pulse: [], winThemes: [] };

      const [mq, ms, mission, milestones, feedback, conflicts, connections, pulse, oec, mwt] = await Promise.all([
        supabase.from("mission_questions").select("*").in("id", qids),
        supabase.from("mission_sections").select("id,name,section_number,evaluation_weight,coherence_status").eq("mission_id", missionId),
        supabase.from("missions").select("id,name,submission_deadline").eq("id", missionId).maybeSingle(),
        supabase.from("mission_milestones").select("milestone_type,milestone_date,status,is_pens_down").eq("mission_id", missionId),
        supabase.from("question_feedback").select("id,question_id,review_cycle,feedback_text,status").eq("mission_id", missionId).in("question_id", qids).eq("status", "open"),
        supabase.from("conflict_flags").select("*").eq("mission_id", missionId).eq("resolved", false),
        supabase.from("question_connections").select("*").eq("mission_id", missionId),
        supabase.from("mission_pulse_updates").select("domain,created_at").eq("mission_id", missionId).order("created_at", { ascending: false }),
        supabase.from("oracle_engagement_config").select("win_themes").eq("mission_id", missionId).maybeSingle(),
        supabase.from("mission_win_themes").select("id,title,why_it_matters,status,display_order").eq("mission_id", missionId).order("display_order", { ascending: true }),
      ]);

      const sectionMap = new Map<string, any>((ms.data ?? []).map((s: any) => [s.id, s]));
      const qpByQid = new Map<string, any>(qpRows.map(r => [r.question_id, r]));

      const questions: Q[] = (mq.data ?? [])
        .filter((q: any) => !q.is_withdrawn)
        .map((q: any) => {
          const sec = sectionMap.get(q.section_id);
          const qp = qpByQid.get(q.id);
          return {
            id: q.id,
            question_number: q.question_number,
            question_text: q.question_text,
            health_status: q.health_status,
            due_date: q.due_date,
            section_name: sec?.name ?? null,
            section_weight: sec?.evaluation_weight ?? null,
            coherence_status: sec?.coherence_status ?? null,
            iris_brief: q.iris_brief,
            iris_brief_status: q.iris_brief_status,
            iris_decoded_intent: q.iris_decoded_intent,
            iris_brief_generated_at: q.iris_brief_generated_at,
            evaluation_weight: q.evaluation_weight,
            page_limit: q.page_limit,
            progress_id: qp.id,
            progress_status: qp.status ?? "not_started",
            acceptance_status: qp.acceptance_status,
            writer_confidence: qp.writer_confidence,
            mock_score: qp.mock_score,
            max_score: qp.max_score,
            internal_due_date: qp.internal_due_date,
            assigned_at: qp.assigned_at,
            brief_opened_at: qp.brief_opened_at,
            brief_exported_at: qp.brief_exported_at,
            last_activity_at: qp.last_activity_at,
            sme_assigned: qp.sme_assigned,
            primary_win_theme: q.primary_win_theme ?? null,
          };
        });

      questions.sort((a, b) => {
        const order = (h: string | null) => (h === "at_risk" ? 1 : h === "watch" ? 2 : 3);
        const o = order(a.health_status) - order(b.health_status);
        if (o !== 0) return o;
        const da = a.due_date ? new Date(a.due_date).getTime() : Infinity;
        const db = b.due_date ? new Date(b.due_date).getTime() : Infinity;
        return da - db;
      });

      const pensDown = (milestones.data ?? []).some((m: any) =>
        (m.is_pens_down || m.milestone_type === "pens_down") &&
        m.milestone_date && new Date(m.milestone_date) < new Date(),
      );
      const internalReview = (milestones.data ?? [])
        .filter((m: any) => m.milestone_type === "internal_review" && m.status !== "completed")
        .sort((a: any, b: any) => new Date(a.milestone_date).getTime() - new Date(b.milestone_date).getTime())[0];

      // Pulse freshness: latest per domain
      const pulseMap = new Map<string, string>();
      for (const p of (pulse.data ?? []) as any[]) {
        if (!pulseMap.has(p.domain)) pulseMap.set(p.domain, p.created_at);
      }
      const pulseList = Array.from(pulseMap.entries()).map(([domain, at]) => ({ domain, last_updated: at }));

      // Filter coordination to writer's questions
      const myQids = new Set(qids);
      const myConflicts = (conflicts.data ?? []).filter((c: any) =>
        myQids.has(c.question_id_a) || myQids.has(c.question_id_b));
      const myConns = (connections.data ?? []).filter((c: any) =>
        myQids.has(c.question_id_a) || myQids.has(c.question_id_b));

      // Resolve "other writer" names via profiles
      const otherQids = new Set<string>();
      [...myConflicts, ...myConns].forEach((c: any) => {
        if (!myQids.has(c.question_id_a)) otherQids.add(c.question_id_a);
        if (!myQids.has(c.question_id_b)) otherQids.add(c.question_id_b);
      });
      let writerByQid = new Map<string, { name: string; health: string | null }>();
      let qNumByQid = new Map<string, { num: string; text: string; health: string | null }>();
      if (otherQids.size) {
        const [otherQ, otherQp] = await Promise.all([
          supabase.from("mission_questions").select("id,question_number,question_text,health_status").in("id", Array.from(otherQids)),
          supabase.from("question_progress").select("question_id,assignee_id").in("question_id", Array.from(otherQids)).eq("role", "lead_writer"),
        ]);
        for (const q of (otherQ.data ?? []) as any[]) {
          qNumByQid.set(q.id, { num: q.question_number, text: q.question_text, health: q.health_status });
        }
        const uids = Array.from(new Set((otherQp.data ?? []).map((r: any) => r.assignee_id).filter(Boolean)));
        const { data: profs } = uids.length
          ? await supabase.from("profiles").select("id,display_name").in("id", uids as string[])
          : { data: [] as any[] };
        const nameByUid = new Map<string, string>((profs ?? []).map((p: any) => [p.id, (p.display_name ?? "").split(" ")[0] || "Writer"]));
        for (const r of (otherQp.data ?? []) as any[]) {
          const meta = qNumByQid.get(r.question_id);
          writerByQid.set(r.question_id, { name: nameByUid.get(r.assignee_id) ?? "Writer", health: meta?.health ?? null });
        }
      }
      // include own questions in qNumByQid for label lookup
      for (const q of questions) qNumByQid.set(q.id, { num: q.question_number, text: q.question_text, health: q.health_status });

      return {
        questions,
        feedback: (feedback.data ?? []) as any[],
        conflicts: myConflicts,
        connections: myConns,
        mission: mission.data,
        pensDown,
        internalReview,
        pulse: pulseList,
        winThemes: (() => {
          const oracleThemes = ((oec.data as any)?.win_themes ?? []) as any[];
          if (oracleThemes.length > 0) return oracleThemes;
          return ((mwt.data ?? []) as any[])
            .filter((t: any) => t.status !== "archived")
            .map((t: any) => ({
              id: t.id,
              title: t.title,
              text: t.why_it_matters ? `${t.title} — ${t.why_it_matters}` : t.title,
            }));
        })(),
        qNumByQid,
        writerByQid,
        myQids: Array.from(myQids),
      };
    },
  });

  // Refresh on focus
  useEffect(() => {
    const h = () => qc.invalidateQueries({ queryKey: refreshKey });
    window.addEventListener("focus", h);
    return () => window.removeEventListener("focus", h);
  }, [qc, missionId, userId]);

  // Realtime subscriptions
  useEffect(() => {
    if (!userId) return;
    const c1 = supabase.channel(`fd-${missionId}-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "question_progress", filter: `assignee_id=eq.${userId}` },
        () => qc.invalidateQueries({ queryKey: refreshKey }))
      .subscribe();
    const c2 = supabase.channel(`fd-fb-${missionId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "question_feedback", filter: `mission_id=eq.${missionId}` },
        (payload: any) => {
          qc.invalidateQueries({ queryKey: refreshKey });
          const qNum = (cockpit?.qNumByQid as any)?.get?.(payload.new?.question_id)?.num;
          if (qNum) toast(`New feedback on ${qNum}`);
        })
      .subscribe();
    return () => { supabase.removeChannel(c1); supabase.removeChannel(c2); };
  }, [missionId, userId]);

  const questions = cockpit?.questions ?? [];
  const fbByQid = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const f of (cockpit?.feedback ?? [])) {
      const arr = m.get(f.question_id) ?? [];
      arr.push(f); m.set(f.question_id, arr);
    }
    return m;
  }, [cockpit?.feedback]);

  const stats = useMemo(() => {
    const s = { finalized: 0, inReview: 0, active: 0, atRisk: 0 };
    for (const q of questions) {
      if (q.progress_status === "finalized") s.finalized++;
      else if (["internal_review","red_team","gold_team","mock_scored"].includes(q.progress_status)) s.inReview++;
      else if (["in_progress","briefed","revising"].includes(q.progress_status)) s.active++;
      if (q.health_status === "at_risk") s.atRisk++;
    }
    return s;
  }, [questions]);

  const grouped = useMemo(() => ({
    atRisk: questions.filter(q => q.health_status === "at_risk"),
    watch: questions.filter(q => q.health_status === "watch"),
    healthy: questions.filter(q => q.health_status !== "at_risk" && q.health_status !== "watch"),
  }), [questions]);

  const daysRem = cockpit?.mission?.submission_deadline ? daysBetween(cockpit.mission.submission_deadline) : null;

  async function handleStatusChange(q: Q, newStatus: ProgressStatus) {
    try {
      await updateStatus({ data: { progressId: q.progress_id, newStatus, pensDown: !!cockpit?.pensDown } });
      toast.success(`Moved ${q.question_number} → ${newStatus.replace("_", " ")}`);
      qc.invalidateQueries({ queryKey: refreshKey });
    } catch (e: any) {
      toast.error(e.message || "Could not update status");
    }
  }

  async function handleOpenBrief(q: Q) {
    setBriefOpenFor(q);
    if (!q.brief_opened_at) {
      await supabase.from("question_progress")
        .update({ brief_opened_at: new Date().toISOString(), last_activity_at: new Date().toISOString() } as never)
        .eq("id", q.progress_id);
      await fireAssistEvent(missionId, q.id, userId, "brief_opened", {});
      qc.invalidateQueries({ queryKey: refreshKey });
    }
  }

  async function handleExportBrief(q: Q) {
    const md = renderBriefMarkdown(q);
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `brief-${q.question_number}.md`;
    a.click();
    URL.revokeObjectURL(url);
    await supabase.from("question_progress")
      .update({
        brief_exported_at: new Date().toISOString(),
        brief_export_count: ((q as any).brief_export_count ?? 0) + 1,
        last_activity_at: new Date().toISOString(),
      } as never).eq("id", q.progress_id);
    await fireAssistEvent(missionId, q.id, userId, "brief_exported", {});
    toast.success("Brief exported to your environment");
    qc.invalidateQueries({ queryKey: refreshKey });
  }

  async function handleAcceptAssignment(q: Q) {
    await supabase.from("question_progress")
      .update({ acceptance_status: "accepted", accepted_at: new Date().toISOString(), last_activity_at: new Date().toISOString() } as never)
      .eq("id", q.progress_id);
    await fireAssistEvent(missionId, q.id, userId, "status_updated", { acceptance_status: "accepted" });
    qc.invalidateQueries({ queryKey: refreshKey });
  }

  async function handleNeedHelp(q: Q) {
    await supabase.from("question_progress")
      .update({ acceptance_status: "need_help", last_activity_at: new Date().toISOString() } as never)
      .eq("id", q.progress_id);
    await fireAssistEvent(missionId, q.id, userId, "sos_raised", {});
    toast("SOS raised — your Engagement Lead has been notified");
    qc.invalidateQueries({ queryKey: refreshKey });
  }

  async function handleAckFeedback(fbId: string, questionId: string) {
    await supabase.from("question_feedback")
      .update({ status: "acknowledged", acknowledged_by: userId, acknowledged_at: new Date().toISOString() } as never)
      .eq("id", fbId);
    await fireAssistEvent(missionId, questionId, userId, "feedback_submitted", { feedback_id: fbId });
    qc.invalidateQueries({ queryKey: refreshKey });
  }

  async function handleFlagConflict(conflictDesc: string, missionIdLocal: string) {
    await supabase.from("atlas_notifications").insert({
      recipient_role: "engagement_lead",
      type: "conflict_flagged",
      message: `Conflict flagged: ${conflictDesc.slice(0, 200)}`,
      metadata: { mission_id: missionIdLocal } as never,
    });
    toast.success("Conflict flagged. Your Engagement Lead will be notified.");
  }

  if (isLoading) {
    return <div style={{ background: BG, minHeight: "100vh", color: "white", padding: 40 }}>Loading your cockpit…</div>;
  }

  return (
    <div style={{ background: BG, color: "white", minHeight: "100vh", display: "grid", gridTemplateColumns: "1fr 320px", alignItems: "start" }}>
      {/* LEFT ZONE */}
      <div style={{ padding: "24px 28px", maxWidth: "100%", overflowX: "hidden" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "0.04em" }}>
            ATLAS <span style={{ color: "rgba(255,255,255,0.4)", fontWeight: 400 }}>· {missionName}</span>
          </div>
          {daysRem !== null && (
            <div style={{
              padding: "4px 10px", borderRadius: 999, fontSize: 11, fontWeight: 600,
              background: daysRem < 7 ? "rgba(239,68,68,0.15)" : daysRem < 14 ? "rgba(245,158,11,0.15)" : "rgba(34,197,94,0.15)",
              color: daysRem < 7 ? RED : daysRem < 14 ? AMBER : GREEN,
              border: `1px solid currentColor`,
            }}>
              {daysRem}d to submission
            </div>
          )}
        </div>

        {/* Welcome bar */}
        <div style={{
          padding: "16px 18px", marginBottom: 20, borderRadius: 10,
          background: "linear-gradient(180deg, #0b1d34 0%, #081325 100%)",
          borderTop: `2px solid ${GOLD}`,
        }}>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>
            Your Cockpit{firstName ? `, ${firstName}` : ""}.
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 1.5, marginBottom: 12 }}>
            You own {questions.length} question{questions.length === 1 ? "" : "s"} on this mission. These are yours.
            Work your brief. Update your status. Flag what needs help.
            Assignments are set by your admin — talk to your Engagement Lead if something needs to change.
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Stat label="Finalized" value={stats.finalized} color={GREEN} />
            <Stat label="In Review" value={stats.inReview} color={PURPLE} />
            <Stat label="Active" value={stats.active} color={GOLD} />
            <Stat label="At Risk" value={stats.atRisk} color={RED} />
          </div>
        </div>

        {cockpit?.pensDown && (
          <div style={{
            padding: "12px 14px", marginBottom: 16, borderRadius: 8,
            background: "rgba(239,68,68,0.12)", border: `1px solid ${RED}`, color: "#fecaca",
            display: "flex", alignItems: "center", gap: 8, fontSize: 12,
          }}>
            <Lock size={14} /> PENS DOWN — submission window closed. Move to Revising or Finalized only.
          </div>
        )}

        <div
          style={{
            position: "relative",
            background: "rgba(255,255,255,0.025)",
            borderTop: "1px solid rgba(255,255,255,0.07)",
            borderBottom: "1px solid rgba(255,255,255,0.07)",
            padding: "12px 16px",
            borderRadius: 0,
            marginBottom: 4,
          }}
        >
          <span
            style={{
              position: "absolute",
              top: 6,
              right: 10,
              fontSize: 8,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "rgba(255,255,255,0.25)",
              pointerEvents: "none",
            }}
          >
            Mission Pulse
          </span>
          <TeamPulseCard missionId={missionId} />
        </div>
        <div
          style={{
            height: 1,
            background:
              "linear-gradient(to right, transparent, rgba(196,154,43,0.25), transparent)",
            margin: "4px 0 12px",
          }}
        />

        {questions.length === 0 ? (
          <div style={{ padding: 60, textAlign: "center", color: "rgba(255,255,255,0.5)" }}>
            <FileText size={36} style={{ opacity: 0.4, marginBottom: 12 }} />
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>No questions assigned yet.</div>
            <div style={{ fontSize: 12 }}>Your Engagement Lead will assign your questions during mission setup.<br/>Check back after BLAST OFF.</div>
          </div>
        ) : (
          <>
            <Group title="🔴 Needs Immediate Attention" color={RED} items={grouped.atRisk} render={renderCard} />
            <Group title="🟡 Keep an Eye On" color={AMBER} items={grouped.watch} render={renderCard} />
            <Group title="🟢 On Track" color={GREEN} items={grouped.healthy} render={renderCard} />
          </>
        )}
      </div>

      {/* RIGHT PANEL */}
      <aside style={{
        position: "sticky", top: 0, alignSelf: "start", height: "100vh", overflowY: "auto",
        background: PANEL, borderLeft: "1px solid rgba(255,255,255,0.06)", padding: "20px 16px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: GOLD, boxShadow: `0 0 8px ${GOLD}` }} />
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: GOLD }}>IRIS · LINE OF SIGHT</span>
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Stay Coordinated</div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", lineHeight: 1.5, marginBottom: 14 }}>
          These questions are owned by other writers but share win themes, proof points, or narrative threads with yours.
          IRIS identified them. You don't need to read their work — just make sure you're not pulling in opposite directions.
        </div>

        {cockpit?.internalReview && (() => {
          const d = daysBetween(cockpit.internalReview.milestone_date);
          if (d === null || d < -1) return null;
          return (
            <div style={{ padding: 10, marginBottom: 12, background: "rgba(245,158,11,0.1)", border: `1px solid ${AMBER}`, borderRadius: 6, fontSize: 11, color: "#fde68a" }}>
              ✏ <b>Internal Review Cutoff</b><br/>
              {new Date(cockpit.internalReview.milestone_date).toLocaleDateString()} — {d}d. After this date you cannot move questions to In Progress.
            </div>
          );
        })()}

        <CoordinationCards cockpit={cockpit} onFlag={handleFlagConflict} />

        <PulseStrip pulse={cockpit?.pulse ?? []} />
        <WinThemesStrip themes={cockpit?.winThemes ?? []} />
      </aside>

      {briefOpenFor && (
        <BriefViewer
          q={briefOpenFor}
          onClose={() => setBriefOpenFor(null)}
          onExport={() => handleExportBrief(briefOpenFor)}
        />
      )}

      <ScoreMeDialog
        open={!!scoreMeFor}
        onOpenChange={(v) => { if (!v) setScoreMeFor(null); }}
        missionId={missionId}
        questionId={scoreMeFor?.id ?? null}
        questionNumber={scoreMeFor?.question_number ?? null}
        questionText={scoreMeFor?.question_text ?? null}
      />

      <MissionPulsePanel
        open={pulseOpen}
        onOpenChange={setPulseOpen}
        missionId={missionId}
      />

      <StickyNotesPanel
        open={!!stickyNotesFor}
        onClose={() => setStickyNotesFor(null)}
        missionId={missionId}
        questionId={stickyNotesFor?.id ?? null}
        questionNumber={stickyNotesFor?.question_number ?? null}
        questionText={stickyNotesFor?.question_text ?? null}
      />

      <CheckInDialog
        open={!!checkInFor}
        onOpenChange={(v) => { if (!v) setCheckInFor(null); }}
        missionId={missionId}
        questionId={checkInFor?.id ?? null}
        questionNumber={checkInFor?.question_number ?? null}
        progressId={checkInFor?.progress_id ?? null}
        statusOptions={
          checkInFor
            ? nextStatuses(checkInFor.progress_status, !!cockpit?.pensDown)
            : []
        }
        onStatusChange={async (s) => {
          if (checkInFor) await handleStatusChange(checkInFor, s as ProgressStatus);
        }}
        onSubmitted={() => qc.invalidateQueries({ queryKey: refreshKey })}
      />

    </div>
  );

  function renderCard(q: Q) {
    const open = expanded === q.id;
    const dRem = daysBetween(q.due_date);
    const fbList = fbByQid.get(q.id) ?? [];
    const briefAge = q.iris_brief_generated_at ? daysBetween(q.iris_brief_generated_at) : null;
    

    return (
      <div key={q.id} id={`q-card-${q.id}`} style={{
        background: CARD, borderRadius: 10, marginBottom: 10, overflow: "hidden",
        borderLeft: `3px solid ${healthColor(q.health_status)}`,
        border: `1px solid rgba(255,255,255,0.05)`,
      }}>
        <button onClick={() => setExpanded(open ? null : q.id)} style={{
          all: "unset", cursor: "pointer", width: "100%", padding: "14px 16px", display: "block",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span style={{ fontFamily: "monospace", color: GOLD, fontSize: 12, fontWeight: 700 }}>{q.question_number}</span>
            {q.section_name && (
              <span style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.45)" }}>{q.section_name}</span>
            )}
            <HealthBadge h={q.health_status} />
            {q.iris_brief_status === "stale" && <Chip color={AMBER}>⚠ Stale</Chip>}
            {q.iris_brief_status === "pending" && <Chip color="#9ca3af">Pending</Chip>}
            {fbList.length > 0 && <Chip color={AMBER}>⚠ {fbList.length} feedback item{fbList.length === 1 ? "" : "s"}</Chip>}
            <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
              <Dot color={healthColor(q.health_status)} pulse={q.health_status === "at_risk"} />
            </span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "rgba(255,255,255,0.92)" }}>
            {q.question_text}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 11, color: "rgba(255,255,255,0.6)" }}>
            <Chip color={STATUS_COLORS[q.progress_status] || "#888"}>{q.progress_status.replace(/_/g, " ")}</Chip>
            {dRem !== null && (
              <span style={{ color: dRem < 7 ? RED : dRem < 14 ? AMBER : GREEN }}>{dRem}d remaining</span>
            )}
            {q.internal_due_date && <span>Internal: {new Date(q.internal_due_date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>}
            {q.evaluation_weight != null && <span>Eval: {q.evaluation_weight}%</span>}
            {q.mock_score != null && (
              <span style={{ color: q.mock_score >= 85 ? GREEN : q.mock_score >= 75 ? AMBER : RED }}>
                Mock: {q.mock_score}/{q.max_score ?? 100}
              </span>
            )}
          </div>
        </button>

        {open && (
          <div style={{ padding: "14px 16px 16px 16px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
            {/* Full-width alert strip — feedback + need-help only.
                Everything else lives inside one of the two pillars below. */}
            {fbList.length > 0 && (
              <div style={{ marginBottom: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                {fbList.map((f: any) => (
                  <div key={f.id} style={{ padding: 10, borderRadius: 6, background: "rgba(245,158,11,0.08)", border: `1px solid ${AMBER}`, display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: AMBER, marginBottom: 4 }}>
                        {(f.review_cycle || "FEEDBACK").toUpperCase()}
                      </div>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.85)" }}>{f.feedback_text}</div>
                    </div>
                    <button onClick={() => handleAckFeedback(f.id, q.id)} style={btn(AMBER)}>Acknowledge</button>
                  </div>
                ))}
              </div>
            )}

            {q.acceptance_status === "need_help" && q.sme_assigned === false && (
              <div style={{ marginBottom: 14, padding: "8px 12px", background: "rgba(239,68,68,0.1)", border: `1px solid ${RED}`, borderRadius: 6, fontSize: 12, color: "#fecaca" }}>
                🆘 Awaiting SME Assignment — your Engagement Lead has been notified.
              </div>
            )}

            {/* Two equal pillars: STATUS HUD (left) | BRIEF (right) */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
                alignItems: "stretch",
              }}
            >
              {/* LEFT PILLAR — STATUS HUD */}
              <div
                style={{
                  padding: 14,
                  borderRadius: 8,
                  background: "rgba(255,255,255,0.025)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", color: "rgba(255,255,255,0.45)", textTransform: "uppercase" }}>
                  Status HUD
                </div>

                {/* Hero status: health + days remaining */}
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                  <span style={{
                    fontSize: 22, fontWeight: 700,
                    color: healthColor(q.health_status),
                    textTransform: "uppercase", letterSpacing: "0.04em",
                  }}>
                    {q.health_status === "at_risk" ? "At Risk" : q.health_status === "watch" ? "Watch" : "On Track"}
                  </span>
                  {dRem !== null && (
                    <span style={{ fontSize: 13, color: dRem < 7 ? RED : dRem < 14 ? AMBER : GREEN, fontWeight: 600 }}>
                      {dRem}d to due
                    </span>
                  )}
                </div>

                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", lineHeight: 1.5 }}>
                  Status:{" "}
                  <span style={{ color: STATUS_COLORS[q.progress_status] || "white", fontWeight: 600 }}>
                    {q.progress_status.replace(/_/g, " ")}
                  </span>
                </div>

                {/* Compact signal grid */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <SignalRow label="Brief Status" value={q.iris_brief_status ? `${q.iris_brief_status}${briefAge != null ? ` · ${briefAge}d old` : ""}` : "—"} />
                  <SignalRow label="Brief Exported" value={q.brief_exported_at ? new Date(q.brief_exported_at).toLocaleDateString() : "Not yet exported"} />
                  <SignalRow label="Last Activity" value={relTime(q.last_activity_at)} />
                  <SignalRow label="Mock Score" value={q.mock_score != null ? `${q.mock_score} / ${q.max_score ?? 100}` : "Not yet scored"} />
                  <SignalRow label="Confidence" value={q.writer_confidence || "Not set"} />
                  <SignalRow label="Internal Due" value={q.internal_due_date ? new Date(q.internal_due_date).toLocaleDateString() : "Not set"} />
                  <SignalRow label="Coherence" value={q.coherence_status || "Unreviewed"} />
                  <SignalRow label="Weight / Pages" value={`${q.evaluation_weight ?? "—"}% · ${q.page_limit ?? "—"}p`} />
                </div>

                {/* 4-button assist bar — Check-In / Score Me / Sticky Notes / Mission Pulse */}
                <div
                  style={{
                    marginTop: "auto",
                    paddingTop: 10,
                    borderTop: "1px solid rgba(255,255,255,0.05)",
                    display: "grid",
                    gridTemplateColumns: "repeat(4, 1fr)",
                    gap: 8,
                  }}
                >
                  <AssistButton
                    Icon={Activity}
                    label="Check-In"
                    sub="Report your status"
                    tooltip="Thirty seconds. Tell the mission where you stand."
                    bg="rgba(255,255,255,0.05)"
                    border="rgba(255,255,255,0.12)"
                    color="rgba(255,255,255,0.65)"
                    onClick={() => setCheckInFor(q)}
                  />
                  <AssistButton
                    Icon={Gauge}
                    label="Score Me"
                    sub="Improve the answer"
                    tooltip="Paste your draft from Word, SharePoint, or Loopio. I will tell you what lands and what does not."
                    bg="rgba(196,154,43,0.12)"
                    border="rgba(196,154,43,0.35)"
                    color="#C49A2B"
                    onClick={() => setScoreMeFor(q)}
                  />
                  <AssistButton
                    Icon={Pin}
                    label="Sticky Notes"
                    sub="Pin it here"
                    tooltip="Decisions. Warnings. References. Stick them here so the team never loses them."
                    bg="rgba(255,255,255,0.05)"
                    border="rgba(255,255,255,0.12)"
                    color="rgba(255,255,255,0.65)"
                    onClick={() => setStickyNotesFor(q)}
                  />
                  <AssistButton
                    Icon={Radio}
                    label="Mission Pulse"
                    sub="Send a signal"
                    tooltip="The mission heartbeat. See what IRIS surfaced. Send what you learned."
                    bg="rgba(127,119,221,0.10)"
                    border="rgba(127,119,221,0.30)"
                    color="rgba(200,195,255,0.85)"
                    onClick={() => setPulseOpen(true)}
                  />
                </div>

                {q.acceptance_status === "pending" && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginTop: 8 }}>
                    <button onClick={() => handleAcceptAssignment(q)} style={btn(GREEN)}>Accept</button>
                    <button onClick={() => handleNeedHelp(q)} style={btn(RED)}><LifeBuoy size={12}/> Need Help</button>
                  </div>
                )}

              </div>

              {/* RIGHT PILLAR — BRIEF */}
              <div
                style={{
                  padding: 14,
                  borderRadius: 8,
                  background: "rgba(201,151,43,0.04)",
                  border: "1px solid rgba(201,151,43,0.18)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", color: GOLD, textTransform: "uppercase" }}>
                  Brief
                </div>

                {q.iris_decoded_intent ? (
                  <div style={{ padding: "10px 12px", borderLeft: `2px solid ${GOLD}`, background: "rgba(201,151,43,0.06)", borderRadius: 4 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: GOLD, letterSpacing: "0.1em", marginBottom: 4 }}>⚡ IRIS DECODED INTENT</div>
                    <div style={{ fontSize: 12, fontStyle: "italic", color: "rgba(255,255,255,0.8)", lineHeight: 1.5 }}>{q.iris_decoded_intent}</div>
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", fontStyle: "italic" }}>
                    IRIS has not decoded the intent yet.
                  </div>
                )}

                {/* Your Place in the Story — narrative brief */}
                {q.primary_win_theme && (
                  <NarrativeBriefSection
                    missionId={missionId}
                    questionId={q.id}
                    onJumpToQuestion={(qid) => {
                      setExpanded(qid);
                      requestAnimationFrame(() => {
                        document.getElementById(`q-card-${qid}`)?.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        });
                      });
                    }}
                  />
                )}

                {/* IRIS coaching — single source */}
                <AtlasAssistBar missionId={missionId} questionId={q.id} />

                {/* Brief actions */}
                <div style={{ marginTop: "auto", display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", paddingTop: 10, borderTop: "1px solid rgba(201,151,43,0.15)" }}>
                  {q.iris_brief && (
                    q.brief_opened_at
                      ? <button onClick={() => handleOpenBrief(q)} style={btn(GOLD)}><FileText size={12}/> View Brief</button>
                      : <button onClick={() => handleOpenBrief(q)} style={btn(GOLD, true)}><Sparkles size={12}/> Open Brief</button>
                  )}
                  {q.brief_exported_at && <button onClick={() => handleExportBrief(q)} style={btn("#6b7280")}><Download size={12}/> Re-export</button>}
                  {!q.brief_exported_at && q.iris_brief && <button onClick={() => handleExportBrief(q)} style={btn("#6b7280")}><Download size={12}/> Export Brief</button>}
                  {q.iris_brief_status === "stale" && <span style={{ fontSize: 11, color: AMBER }}>⚠ Brief is stale — admin must regenerate</span>}
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    );
  }
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ padding: "6px 10px", borderRadius: 6, background: "rgba(255,255,255,0.04)", border: `1px solid ${color}40`, display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 14, fontWeight: 700, color }}>{value}</span>
      <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.6)" }}>{label}</span>
    </div>
  );
}

function Group<T>({ title, color, items, render }: { title: string; color: string; items: T[]; render: (i: T) => React.ReactNode }) {
  if (!items.length) return null;
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color }}>
        {title}
        <div style={{ flex: 1, height: 1, background: `${color}30` }} />
        <span style={{ color: "rgba(255,255,255,0.4)" }}>{items.length}</span>
      </div>
      {items.map(render)}
    </div>
  );
}

function HealthBadge({ h }: { h: string | null }) {
  const c = healthColor(h);
  const label = h === "at_risk" ? "At Risk" : h === "watch" ? "Watch" : "Healthy";
  return <Chip color={c}>{label}</Chip>;
}

function Chip({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{
      padding: "2px 8px", borderRadius: 999, fontSize: 10, fontWeight: 600,
      background: `${color}20`, color, border: `1px solid ${color}40`,
      textTransform: "capitalize",
    }}>{children}</span>
  );
}

function Dot({ color, pulse }: { color: string; pulse?: boolean }) {
  return (
    <>
      <span style={{
        width: 8, height: 8, borderRadius: "50%", background: color,
        boxShadow: `0 0 8px ${color}`,
        animation: pulse ? "fdpulse 1.6s ease-in-out infinite" : "none",
      }} />
      <style>{`@keyframes fdpulse { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }`}</style>
    </>
  );
}

function SignalRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)" }}>{label}</span>
      <span style={{ fontSize: 11.5, color: "rgba(255,255,255,0.85)" }}>{value}</span>
    </div>
  );
}

function btn(color: string, primary = false): React.CSSProperties {
  return {
    display: "inline-flex", alignItems: "center", gap: 5,
    padding: "5px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600,
    background: primary ? color : `${color}20`, color: primary ? "#0a0a0a" : color,
    border: `1px solid ${color}${primary ? "" : "60"}`, cursor: "pointer",
  };
}

function CoordinationCards({ cockpit, onFlag }: { cockpit: any; onFlag: (desc: string, missionId: string) => void }) {
  if (!cockpit) return null;
  const cards: any[] = [];
  const qNumByQid: Map<string, any> = cockpit.qNumByQid ?? new Map();
  const writerByQid: Map<string, any> = cockpit.writerByQid ?? new Map();
  const myQids: Set<string> = new Set(cockpit.myQids ?? []);

  for (const c of cockpit.conflicts ?? []) {
    const mine = myQids.has(c.question_id_a) ? c.question_id_a : c.question_id_b;
    const other = mine === c.question_id_a ? c.question_id_b : c.question_id_a;
    cards.push({ kind: "conflict", color: RED, mine, other, body: c.conflict_description, missionId: c.mission_id });
  }
  for (const c of cockpit.connections ?? []) {
    const mine = myQids.has(c.question_id_a) ? c.question_id_a : c.question_id_b;
    const other = mine === c.question_id_a ? c.question_id_b : c.question_id_a;
    const isWinTheme = (c.connection_type || "").toLowerCase().includes("theme") || (c.connection_type || "").toLowerCase().includes("alignment");
    cards.push({
      kind: isWinTheme ? "alignment" : "shared",
      color: isWinTheme ? PURPLE : GOLD,
      mine, other, body: c.iris_rationale, type: c.connection_type, missionId: c.mission_id,
    });
  }
  // Conflicts first, then alignment, then shared
  cards.sort((a, b) => (a.kind === "conflict" ? 0 : a.kind === "alignment" ? 1 : 2) - (b.kind === "conflict" ? 0 : b.kind === "alignment" ? 1 : 2));
  const shown = cards.slice(0, 5);

  if (!shown.length) {
    return (
      <div style={{ padding: 14, textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 11 }}>
        No coordination signals yet.<br/>IRIS will surface connections as the mission intelligence builds.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
      {shown.map((c, i) => {
        const mineMeta = qNumByQid.get(c.mine);
        const otherMeta = qNumByQid.get(c.other);
        const otherWriter = writerByQid.get(c.other);
        return (
          <div key={i} style={{
            padding: 10, borderRadius: 6, background: `${c.color}08`,
            border: `1px solid ${c.color}40`, borderLeft: `3px solid ${c.color}`,
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: c.color, marginBottom: 6 }}>
              {c.kind === "conflict" ? "🔴 POTENTIAL CONFLICT" : c.kind === "alignment" ? "🔵 WIN THEME ALIGNMENT" : "✦ SHARED PROOF POINT"}
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.85)", lineHeight: 1.45 }}>
              <b>Your {mineMeta?.num}</b> — {(mineMeta?.text ?? "").slice(0, 50)}…
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", margin: "3px 0" }}>↕ {c.kind === "conflict" ? "conflicts with" : "shares with"}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.85)", lineHeight: 1.45 }}>
              <b>{otherMeta?.num ?? "—"}</b> — {(otherMeta?.text ?? "").slice(0, 50)}…
              {otherWriter?.name && <> · {otherWriter.name}</>}
              {otherMeta?.health === "at_risk" && <span style={{ marginLeft: 6 }}><Chip color={RED}>At Risk</Chip></span>}
            </div>
            {c.body && (
              <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.55)", marginTop: 6, fontStyle: "italic" }}>{c.body}</div>
            )}
            <div style={{ marginTop: 8 }}>
              {c.kind === "conflict"
                ? <button onClick={() => onFlag(c.body ?? "Conflict", c.missionId)} style={btn(RED)}><Flag size={11}/> Flag to Mission Pulse</button>
                : c.kind === "alignment"
                  ? <button onClick={() => toast("Coordination thread coming soon")} style={btn(PURPLE)}><MessageSquare size={11}/> Open thread{otherWriter?.name ? ` with ${otherWriter.name}` : ""}</button>
                  : <button onClick={() => toast("Proof point view coming soon")} style={btn(GOLD)}>✦ View shared proof point</button>}
            </div>
          </div>
        );
      })}
      {cards.length > 5 && (
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textAlign: "center" }}>
          IRIS found {cards.length - 5} more connection{cards.length - 5 === 1 ? "" : "s"}.
        </div>
      )}
    </div>
  );
}

function PulseStrip({ pulse }: { pulse: { domain: string; last_updated: string }[] }) {
  const staleCount = pulse.filter(p => (daysBetween(p.last_updated) ?? 0) < -14 || (Date.now() - new Date(p.last_updated).getTime()) / 86400000 > 14).length;
  if (!pulse.length) return null;
  return (
    <div style={{ marginTop: 8, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "rgba(255,255,255,0.55)", marginBottom: 8 }}>INTELLIGENCE PULSE</div>
      {staleCount >= 3 && (
        <div style={{ fontSize: 10, color: AMBER, marginBottom: 6 }}>
          ⚠ Pulse stale across multiple domains. Briefs may need regeneration.
        </div>
      )}
      {pulse.map(p => {
        const days = Math.floor((Date.now() - new Date(p.last_updated).getTime()) / 86400000);
        const c = days < 7 ? GREEN : days < 14 ? AMBER : RED;
        return (
          <div key={p.domain} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10.5, padding: "3px 0", color: c }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: c }} />
            <span style={{ flex: 1, textTransform: "capitalize" }}>{p.domain.replace(/_/g, " ")}</span>
            <span>{days}d{days > 14 ? " — STALE" : ""}</span>
          </div>
        );
      })}
    </div>
  );
}

function WinThemesStrip({ themes }: { themes: any[] }) {
  if (!themes?.length) return null;
  return (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "rgba(255,255,255,0.55)", marginBottom: 8 }}>YOUR WIN THEMES</div>
      {themes.slice(0, 6).map((t: any, i: number) => {
        const label =
          typeof t === "string"
            ? t
            : t.title ?? t.name ?? t.theme ?? t.label ?? t.text ?? "Theme";
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10.5, padding: "3px 0", color: "rgba(255,255,255,0.8)" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: GOLD }} />
            <span>{label}</span>
          </div>
        );
      })}
    </div>
  );
}

function AssistButton({
  Icon, label, sub, tooltip, bg, border, color, onClick,
}: {
  Icon: any;
  label: string;
  sub: string;
  tooltip: string;
  bg: string;
  border: string;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={tooltip}
      style={{
        height: 56,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        background: bg,
        border: `0.5px solid ${border}`,
        color,
        borderRadius: 6,
        cursor: "pointer",
        padding: "4px 8px",
        lineHeight: 1.1,
      }}
    >
      <Icon size={16} />
      <span style={{ fontSize: 10, fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 8, color: "rgba(255,255,255,0.45)" }}>{sub}</span>
    </button>
  );
}

function BriefViewer({ q, onClose, onExport }: { q: Q; onClose: () => void; onExport: () => void }) {
  const b = q.iris_brief ?? {};
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 50, display: "flex", justifyContent: "flex-end" }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "min(720px, 95vw)", height: "100vh", overflowY: "auto",
        background: "#0a1828", borderLeft: `1px solid ${GOLD}`, padding: 24, color: "white",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div>
            <div style={{ fontFamily: "monospace", color: GOLD, fontSize: 12 }}>{q.question_number}</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>IRIS Question Brief</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onExport} style={btn(GOLD)}><Download size={12}/> Export</button>
            <button onClick={onClose} style={btn("#888")}>Close</button>
          </div>
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", marginBottom: 16, fontStyle: "italic" }}>{q.question_text}</div>
        {q.iris_decoded_intent && (
          <Section title="Decoded Intent" body={q.iris_decoded_intent} />
        )}
        {b.what_they_really_asking && <Section title="What They're Really Asking" body={b.what_they_really_asking} />}
        {b.why_it_matters && <Section title="Why It Matters" body={b.why_it_matters} />}
        {b.evaluator_perspective && <Section title="Evaluator Perspective" body={b.evaluator_perspective} />}
        {b.key_messages_to_reinforce && <Section title="Key Messages" body={Array.isArray(b.key_messages_to_reinforce) ? b.key_messages_to_reinforce.map((x:any)=>`• ${x}`).join("\n") : String(b.key_messages_to_reinforce)} />}
        {b.things_to_avoid && <Section title="Things to Avoid" body={Array.isArray(b.things_to_avoid) ? b.things_to_avoid.map((x:any)=>`• ${x}`).join("\n") : String(b.things_to_avoid)} />}
        {b.proof_points && <Section title="Proof Points" body={Array.isArray(b.proof_points) ? b.proof_points.map((x:any)=>`• ${x}`).join("\n") : String(b.proof_points)} />}
        {!b || Object.keys(b).length === 0 && !q.iris_decoded_intent && (
          <div style={{ padding: 20, textAlign: "center", color: "rgba(255,255,255,0.5)" }}>Brief content not yet available.</div>
        )}
      </div>
    </div>
  );
}

function Section({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: GOLD, marginBottom: 4 }}>{title.toUpperCase()}</div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{body}</div>
    </div>
  );
}

function renderBriefMarkdown(q: Q): string {
  const b = q.iris_brief ?? {};
  const lines = [
    `# ${q.question_number} — Question Brief`,
    ``,
    `> ${q.question_text}`,
    ``,
  ];
  if (q.iris_decoded_intent) {
    lines.push(`## Decoded Intent`, q.iris_decoded_intent, ``);
  }
  for (const [k, v] of Object.entries(b)) {
    if (!v) continue;
    lines.push(`## ${k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}`);
    if (Array.isArray(v)) lines.push(...v.map(x => `- ${x}`));
    else lines.push(String(v));
    lines.push("");
  }
  return lines.join("\n");
}
