import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { generateMissionBrief } from "@/lib/iris-mission-brief.functions";
import { toast } from "sonner";
import {
  RefreshCw, Radio, ArrowRight, Plus, MessageSquare, Plane,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/missions/$missionId/command")({
  component: MissionBrief,
});

/* ─────────────────────────── helpers ─────────────────────────── */

function daysUntil(iso: string | null | undefined): number | null {
  return iso ? Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000) : null;
}
function fmtDate(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
}
function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function hoursSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 3_600_000;
}
function initials(name: string): string {
  return (name || "—").split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}
function firstName(name: string | null | undefined): string {
  return (name ?? "").trim().split(/\s+/)[0] || "—";
}

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  lead: "Engagement Lead",
  engagement_lead: "Engagement Lead",
  pm: "PM",
  reviewer: "Lead Reviewer",
  lead_reviewer: "Lead Reviewer",
  capture_lead: "Capture Lead",
};

/* ─────────────────────────── page ─────────────────────────── */

function MissionBrief() {
  const { missionId } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();

  /* sticky mini-bar */
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 220);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* current user */
  const { data: me } = useQuery({
    queryKey: ["mb-me"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from("profiles").select("id,display_name,email").eq("id", user.id).maybeSingle();
      return data as { id: string; display_name: string | null; email: string | null } | null;
    },
  });

  /* mission */
  const { data: mission } = useQuery({
    queryKey: ["mb-mission", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("missions")
        .select("id,name,client,state,state_agency,program_type,submission_date,rfp_number")
        .eq("id", missionId)
        .maybeSingle();
      return data as {
        id: string; name: string; client: string;
        state: string | null; state_agency: string | null; program_type: string | null;
        submission_date: string | null;
        rfp_number: string | null;
      } | null;
    },
  });

  /* questions for health summary + risk */
  const { data: questions = [] } = useQuery({
    queryKey: ["mb-questions", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("question_records")
        .select("id,question_number,title,health,status,pens_down_date,current_score,assigned_writer_id")
        .eq("mission_id", missionId);
      return (data ?? []) as Array<{
        id: string; question_number: string; title: string;
        health: "red" | "yellow" | "green" | null; status: string | null;
        pens_down_date: string | null; current_score: number | null;
        assigned_writer_id: string | null;
      }>;
    },
  });

  const counts = useMemo(() => {
    const c = { total: 0, red: 0, yellow: 0, green: 0 };
    for (const q of questions) {
      c.total++;
      if (q.health === "red") c.red++;
      else if (q.health === "green") c.green++;
      else c.yellow++;
    }
    return c;
  }, [questions]);

  /* win themes */
  const { data: winThemes = [] } = useQuery({
    queryKey: ["mb-win-themes", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("win_themes")
        .select("id,title,description,key_message,question_ids,status")
        .eq("mission_id", missionId)
        .neq("status", "archived")
        .order("created_at", { ascending: true });
      return (data ?? []) as Array<{
        id: string; title: string; description: string | null;
        key_message: string | null; question_ids: string[] | null; status: string | null;
      }>;
    },
  });

  /* mission leadership */
  const { data: members = [] } = useQuery({
    queryKey: ["mb-members", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_members")
        .select("user_id,role,display_name")
        .eq("mission_id", missionId);
      return (data ?? []) as Array<{ user_id: string; role: string; display_name: string | null }>;
    },
  });
  const leaderUserIds = members
    .filter((m) => ["admin", "lead", "engagement_lead", "pm", "reviewer", "lead_reviewer", "capture_lead"].includes(m.role))
    .map((m) => m.user_id);
  const { data: leaderProfiles = [] } = useQuery({
    queryKey: ["mb-leader-profiles", leaderUserIds.join(",")],
    enabled: leaderUserIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles")
        .select("id,display_name,email").in("id", leaderUserIds);
      return (data ?? []) as Array<{ id: string; display_name: string | null; email: string | null }>;
    },
  });
  const profById = Object.fromEntries(leaderProfiles.map((p) => [p.id, p]));
  const leadershipCards = useMemo(() => {
    // Take up to 4 leadership roles for the row
    const preferredOrder = ["engagement_lead", "lead", "admin", "pm", "lead_reviewer", "reviewer", "capture_lead"];
    const taken = new Set<string>();
    const cards: Array<{ role: string; name: string; user_id: string }> = [];
    for (const role of preferredOrder) {
      const m = members.find((mm) => mm.role === role && !taken.has(mm.user_id));
      if (!m) continue;
      taken.add(m.user_id);
      const p = profById[m.user_id];
      cards.push({
        role,
        name: m.display_name || p?.display_name || p?.email?.split("@")[0] || "—",
        user_id: m.user_id,
      });
      if (cards.length >= 4) break;
    }
    return cards;
  }, [members, profById]);

  /* IRIS Brief */
  const briefFn = useServerFn(generateMissionBrief);
  const [briefPending, setBriefPending] = useState(false);
  const { data: brief, refetch: refetchBrief } = useQuery({
    queryKey: ["mb-brief", missionId],
    queryFn: async () => {
      return briefFn({ data: { missionId } });
    },
  });
  const refreshBrief = async () => {
    setBriefPending(true);
    try {
      await briefFn({ data: { missionId, force: true } });
      await refetchBrief();
      toast.success("IRIS brief refreshed.");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to refresh brief");
    } finally { setBriefPending(false); }
  };

  /* Needs Your Attention — open collab needs + open reality needs */
  const { data: collabNeeds = [], isLoading: needsLoading } = useQuery({
    queryKey: ["mb-collab-needs", missionId],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("question_collaboration")
        .select("id,question_id,mission_id,author_id,author_name,entry_type,body,resolved,created_at")
        .eq("mission_id", missionId)
        .in("entry_type", ["decision_needed", "sme_request", "air_cover", "direction_request", "review_request"])
        .eq("resolved", false)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });
  const { data: realityNeeds = [] } = useQuery({
    queryKey: ["mb-reality-needs", missionId],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("reality_updates")
        .select("id,question_id,mission_id,user_id,user_name,signal_type,need_type,details,resolved,created_at")
        .eq("mission_id", missionId)
        .eq("signal_type", "need")
        .eq("resolved", false)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  type Need = {
    source: "collab" | "reality";
    id: string;
    question_id: string;
    author_name: string;
    type_label: string;
    body: string;
    created_at: string;
  };
  const TYPE_LABEL: Record<string, string> = {
    decision_needed: "Decision Needed",
    sme_request: "SME Input Needed",
    air_cover: "Air Cover Needed",
    direction_request: "Direction Needed",
    review_request: "Review Needed",
  };
  const needs: Need[] = useMemo(() => {
    const a: Need[] = (collabNeeds as any[]).map((c) => ({
      source: "collab",
      id: c.id,
      question_id: c.question_id,
      author_name: c.author_name,
      type_label: TYPE_LABEL[c.entry_type] ?? c.entry_type,
      body: c.body ?? "",
      created_at: c.created_at,
    }));
    const r: Need[] = (realityNeeds as any[]).map((x) => ({
      source: "reality",
      id: x.id,
      question_id: x.question_id,
      author_name: x.user_name ?? "—",
      type_label: x.need_type === "air_cover" ? "Air Cover" : x.need_type === "help" ? "SME Input Needed" : "Decision Needed",
      body: x.details ?? "",
      created_at: x.created_at,
    }));
    return [...a, ...r].sort((x, y) => +new Date(y.created_at) - +new Date(x.created_at));
  }, [collabNeeds, realityNeeds]);

  /* Responses at risk */
  const { data: criticalConflicts = [] } = useQuery({
    queryKey: ["mb-conflicts", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("alignment_conflicts")
        .select("question_a_id,question_b_id,description,severity")
        .eq("mission_id", missionId)
        .is("resolved_at", null)
        .eq("severity", "critical");
      return data ?? [];
    },
  });
  const conflictQids = useMemo(() => {
    const s = new Set<string>();
    for (const c of criticalConflicts as any[]) {
      if (c.question_a_id) s.add(c.question_a_id);
      if (c.question_b_id) s.add(c.question_b_id);
    }
    return s;
  }, [criticalConflicts]);

  type Risk = {
    id: string; question_number: string; title: string;
    health: string | null; reason: string; days: number | null;
  };
  const risks: Risk[] = useMemo(() => {
    const list: Risk[] = [];
    for (const q of questions) {
      const d = daysUntil(q.pens_down_date);
      const within14 = d !== null && d >= 0 && d < 14;
      let reason: string | null = null;
      if (q.health === "red") {
        reason = "Health: Red";
      } else if (q.current_score !== null && Number(q.current_score) < 3.0 && within14) {
        reason = `Below standard · score ${Number(q.current_score).toFixed(1)}`;
      } else if (conflictQids.has(q.id)) {
        reason = "Alignment conflict — unresolved";
      } else if (!q.assigned_writer_id && within14) {
        reason = "No writer assigned";
      }
      if (reason) list.push({
        id: q.id, question_number: q.question_number, title: q.title,
        health: q.health, reason, days: d,
      });
    }
    return list.sort((a, b) => (a.days ?? 9999) - (b.days ?? 9999));
  }, [questions, conflictQids]);

  /* Next gate */
  const { data: gates = [] } = useQuery({
    queryKey: ["mb-gates", missionId],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from("mission_review_gates")
        .select("id,gate_name,target_date")
        .eq("mission_id", missionId)
        .gte("target_date", today)
        .order("target_date", { ascending: true });
      return (data ?? []) as Array<{ id: string; gate_name: string; target_date: string | null }>;
    },
  });
  const nextGate = gates[0] ?? null;
  const nextGateDays = nextGate ? daysUntil(nextGate.target_date) : null;
  const gateReady = useMemo(() => {
    let belowStandard = 0;
    let notSubmitted = 0;
    let ready = 0;
    for (const q of questions) {
      const score = Number(q.current_score ?? 0);
      if (q.status === "approved" && q.health === "green" && score >= 4.5) ready++;
      else if (q.status !== "approved" && q.status !== "ready_for_review") notSubmitted++;
      if (score > 0 && score < 4.5) belowStandard++;
    }
    return { belowStandard, notSubmitted, ready };
  }, [questions]);

  /* What changed — last 24h signals */
  const since24 = useMemo(() => new Date(Date.now() - 24 * 3600 * 1000).toISOString(), []);
  const { data: signals = [] } = useQuery({
    queryKey: ["mb-signals", missionId],
    refetchInterval: 90_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("signals")
        .select("id,signal_title,signal_summary,severity,user_id,user_role,signal_type,related_question_id,created_at")
        .eq("mission_id", missionId)
        .gte("created_at", since24)
        .order("created_at", { ascending: false })
        .limit(50);
      return (data ?? []) as Array<{
        id: string; signal_title: string; signal_summary: string | null;
        severity: string; user_id: string | null; user_role: string | null;
        signal_type: string; related_question_id: string | null; created_at: string;
      }>;
    },
  });
  const signalUserIds = Array.from(new Set(signals.map((s) => s.user_id).filter(Boolean) as string[]));
  const { data: signalProfiles = [] } = useQuery({
    queryKey: ["mb-signal-profiles", signalUserIds.join(",")],
    enabled: signalUserIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id,display_name,email").in("id", signalUserIds);
      return (data ?? []) as Array<{ id: string; display_name: string | null; email: string | null }>;
    },
  });
  const signalProfById = Object.fromEntries(signalProfiles.map((p) => [p.id, p]));
  const [signalsExpanded, setSignalsExpanded] = useState(false);
  const visibleSignals = signalsExpanded ? signals : signals.slice(0, 8);

  /* Leadership notes (collab entries of entry_type = leadership_note) */
  const { data: notes = [] } = useQuery({
    queryKey: ["mb-leadership-notes", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("question_collaboration")
        .select("id,author_id,author_name,body,created_at")
        .eq("mission_id", missionId)
        .eq("entry_type", "leadership_note")
        .order("created_at", { ascending: false })
        .limit(20);
      return (data ?? []) as Array<{ id: string; author_id: string | null; author_name: string; body: string; created_at: string }>;
    },
  });

  /* Broadcast & Add Note modals */
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [addNoteOpen, setAddNoteOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  /* Suggested action — pick the most urgent thing */
  const suggested = useMemo(() => {
    // 1. Oldest unanswered Need
    const oldestNeed = needs[0];
    if (oldestNeed) {
      return {
        label: `Respond to ${firstName(oldestNeed.author_name)} on Q${
          questions.find((q) => q.id === oldestNeed.question_id)?.question_number ?? "—"
        }`,
        sub: `${oldestNeed.type_label} · ${timeAgo(oldestNeed.created_at)}`,
        onClick: () => {
          document.getElementById("needs-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
        },
      };
    }
    // 2. Worst risk
    const topRisk = risks[0];
    if (topRisk) {
      return {
        label: `Review Q${topRisk.question_number} — ${topRisk.health === "red" ? "Red" : "At Risk"}${topRisk.days !== null ? `, ${topRisk.days} days left` : ""}`,
        sub: topRisk.reason,
        onClick: () => navigate({
          to: "/missions/$missionId/questions/$questionId",
          params: { missionId, questionId: topRisk.id },
        }),
      };
    }
    // 3. Gate < 7 days
    if (nextGate && nextGateDays !== null && nextGateDays < 7) {
      return {
        label: `Prepare for ${nextGate.gate_name} — ${nextGateDays} days`,
        sub: `${gateReady.belowStandard} question${gateReady.belowStandard === 1 ? "" : "s"} below standard`,
        onClick: () => navigate({ to: "/missions/$missionId/overview", params: { missionId } }),
      };
    }
    // 4. Default — overview link
    return {
      label: "Review question health",
      sub: "All systems look stable.",
      onClick: () => navigate({ to: "/missions/$missionId/overview", params: { missionId } }),
    };
  }, [needs, risks, nextGate, nextGateDays, gateReady, questions, missionId, navigate]);

  /* Situation / micro-label */
  type Situation = "needs" | "risk" | "gate" | "ok";
  const situation: Situation =
    needs.length > 0 ? "needs"
    : risks.some((r) => r.health === "red" && r.days !== null && r.days < 7) ? "risk"
    : (nextGate && nextGateDays !== null && nextGateDays < 7) ? "gate"
    : "ok";

  const microLabel =
    situation === "needs"
      ? `${needs.length} team member${needs.length === 1 ? "" : "s"} need your response.`
      : situation === "risk"
        ? `${risks.filter((r) => r.health === "red").length} response${risks.filter((r) => r.health === "red").length === 1 ? "" : "s"} at critical risk.`
        : situation === "gate" && nextGate
          ? `${nextGate.gate_name} is in ${nextGateDays} days.`
          : "Mission is on track.";
  const microLabelColor =
    situation === "needs" ? "#fbbf24"
    : situation === "risk" ? "#f87171"
    : situation === "gate" ? "#fbbf24"
    : "#86efac";

  const subDays = daysUntil(mission?.submission_date);
  const healthDotHex = counts.red > 0 ? "#ef4444" : counts.yellow > 0 ? "#eab308" : "#22c55e";


  /* refresh helpers after broadcast/add note */
  const onSentNote = () => {
    qc.invalidateQueries({ queryKey: ["mb-leadership-notes", missionId] });
    qc.invalidateQueries({ queryKey: ["mb-signals", missionId] });
  };

  return (
    <div
      style={{
        background:
          "radial-gradient(ellipse at 100% 0%, rgba(124,58,237,0.05) 0%, transparent 60%), #060b14",
        minHeight: "100vh",
      }}
      className="text-foreground"
    >
      {/* Sticky mini-bar */}
      {scrolled && mission && (
        <div
          className="sticky top-0 z-30 flex h-9 items-center gap-3 border-b px-8 text-[12px]"
          style={{
            background: "rgba(6,11,20,0.95)",
            backdropFilter: "blur(12px)",
            borderColor: "rgba(255,255,255,0.06)",
          }}
        >
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: healthDotHex, boxShadow: `0 0 6px ${healthDotHex}` }}
          />
          <span className="font-medium truncate">{mission.name}</span>
          <span className="text-muted-foreground">·</span>
          <span className={needs.length > 0 ? "text-amber-300" : "text-muted-foreground"}>
            {needs.length} need{needs.length === 1 ? "" : "s"}
          </span>
          {nextGate && nextGateDays !== null && (
            <>
              <span className="text-muted-foreground">·</span>
              <span className={nextGateDays < 7 ? "text-red-400 font-semibold" : "text-muted-foreground"}>
                {nextGate.gate_name} in {nextGateDays}d
              </span>
            </>
          )}
        </div>
      )}

      <div className="mx-auto max-w-[1200px] px-8 py-10 space-y-8">
        {/* Header — page label */}
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.32em]" style={{ color: "#a78bfa" }}>
            Mission Brief
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            {mission?.name ?? "Mission"}
          </h1>
        </div>

        {/* SECTION 1: MISSION VITALS */}
        <section
          className="rounded-[12px] border p-6"
          style={{
            background: "rgba(255,255,255,0.02)",
            borderColor: "rgba(255,255,255,0.06)",
          }}
        >
          <div className="flex flex-wrap items-center gap-3">
            <span
              className="h-3 w-3 rounded-full"
              style={{ background: healthDotHex, boxShadow: `0 0 12px ${healthDotHex}` }}
            />
            <h2 className="text-xl font-bold leading-tight">{mission?.name ?? "—"}</h2>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
            {mission?.client && <span>{mission.client}</span>}
            {mission?.state && <><span>·</span><span>{mission.state}</span></>}
            {mission?.program_type && <><span>·</span><span>{mission.program_type}</span></>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
            <span className="text-muted-foreground">Submission:</span>
            <span className="font-medium">{fmtDate(mission?.submission_date)}</span>
            {subDays !== null && (
              <span className={subDays < 14 ? "text-amber-300" : "text-muted-foreground"}>
                · {subDays} day{subDays === 1 ? "" : "s"}
              </span>
            )}
          </div>

          {/* Health summary */}
          <div className="mt-5 flex flex-wrap items-center gap-5 text-sm">
            <HealthPip color="#22c55e" count={counts.green} label="Green" />
            <HealthPip color="#eab308" count={counts.yellow} label="Yellow" />
            <HealthPip color="#ef4444" count={counts.red} label="Red" />
            <span className="text-border">·</span>
            <span className="text-muted-foreground">
              <span className="font-semibold tabular-nums text-foreground">{counts.total}</span> Total Questions
            </span>
          </div>

          {/* Leadership row */}
          {leadershipCards.length > 0 && (
            <div className="mt-5 grid gap-2 sm:grid-cols-2 md:grid-cols-4">
              {leadershipCards.map((c) => (
                <div
                  key={c.user_id + c.role}
                  className="flex items-center gap-2.5 rounded-md border border-white/5 bg-white/[0.02] px-3 py-2"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-[10px] font-semibold uppercase text-muted-foreground">
                    {initials(c.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-medium text-foreground">{c.name}</span>
                    <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">
                      {ROLE_LABEL[c.role] ?? c.role}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* RFP reference */}
          {(mission?.rfp_number || mission?.state_agency) && (
            <div className="mt-4 text-[12px] text-muted-foreground">
              {[
                mission?.rfp_number && `RFP #${mission.rfp_number}`,
                mission?.state_agency,
              ].filter(Boolean).join(" · ")}
            </div>
          )}
        </section>

        {/* SECTION 2: IRIS MISSION BRIEF */}
        <section
          className="rounded-[12px] border p-6"
          style={{
            background:
              "radial-gradient(ellipse at 0% 50%, rgba(8,145,178,0.08), rgba(10,14,26,0) 70%)",
            borderColor: "rgba(8,145,178,0.25)",
          }}
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.32em]" style={{ color: "#22d3ee" }}>
              <span className="iris-dot" /> IRIS
            </span>
            <button
              onClick={refreshBrief}
              disabled={briefPending}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              {brief?.generated_at && <span>Updated {timeAgo(brief.generated_at)} · </span>}
              <RefreshCw className={`h-3 w-3 ${briefPending ? "animate-spin" : ""}`} /> Refresh
            </button>
          </div>
          {brief?.brief ? (
            <p className="text-[15px] leading-relaxed text-foreground whitespace-pre-wrap">{brief.brief}</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              <span className="iris-dot mr-2" /> IRIS is preparing your brief…
            </p>
          )}

          {/* IRIS suggested action */}
          <div className="mt-4">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "#22d3ee" }}>
              ● IRIS recommends
            </div>
            <button
              onClick={suggested.onClick}
              className="flex w-full items-center justify-between gap-3 rounded-[8px] border px-4 py-2.5 text-left text-[13px] font-semibold transition hover:bg-[rgba(8,145,178,0.18)]"
              style={{
                background: "rgba(8,145,178,0.10)",
                borderColor: "rgba(8,145,178,0.30)",
                color: "var(--iris, #22d3ee)",
              }}
            >
              <span className="truncate">{suggested.label}</span>
              <ArrowRight className="h-4 w-4 shrink-0 opacity-80" />
            </button>
            <div className="mt-1.5 text-[11px] text-muted-foreground">{suggested.sub}</div>
          </div>
        </section>

        {/* MICRO-LABEL */}
        <div
          className="text-center text-[12px]"
          style={{ color: microLabelColor, letterSpacing: "0.04em" }}
        >
          {microLabel}
        </div>

        {/* SECTION 3: NEEDS YOUR ATTENTION */}
        <section id="needs-section" className={situation === "needs" ? "scroll-mt-16" : ""}>
          <SectionHeader title="Needs Your Attention" badge={<CountBadge count={needs.length} tone={needs.length > 0 ? "amber" : "green"} />} />
          <div
            className={`rounded-[12px] border ${situation === "risk" ? "" : ""}`}
            style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.06)" }}
          >
            {needsLoading ? (
              <div className="px-5 py-6 text-center text-sm text-muted-foreground">Loading…</div>
            ) : needs.length === 0 ? (
              <div className="px-5 py-5 text-sm" style={{ color: "#86efac" }}>
                <span className="iris-dot mr-2" /> No open needs. Team is operating independently.
              </div>
            ) : (
              <ul className="divide-y divide-white/5">
                {needs.map((n) => {
                  const q = questions.find((x) => x.id === n.question_id);
                  return (
                    <NeedCard
                      key={`${n.source}-${n.id}`}
                      need={n}
                      questionNumber={q?.question_number ?? "—"}
                      missionId={missionId}
                      meId={me?.id ?? null}
                      meName={firstName(me?.display_name ?? me?.email ?? "Leader")}
                      onResolved={() => {
                        qc.invalidateQueries({ queryKey: ["mb-collab-needs", missionId] });
                        qc.invalidateQueries({ queryKey: ["mb-reality-needs", missionId] });
                      }}
                    />
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        {/* SECTION 4: RESPONSES AT RISK */}
        <section>
          <SectionHeader
            title="Responses at Risk"
            badge={<CountBadge count={risks.length} tone={risks.length > 0 ? "red" : "green"} />}
          />
          <div
            className={`rounded-[12px] border ${situation === "risk" ? "animate-pulse-once" : ""}`}
            style={{
              background: "rgba(255,255,255,0.02)",
              borderColor: situation === "risk" ? "rgba(239,68,68,0.35)" : "rgba(255,255,255,0.06)",
            }}
          >
            {risks.length === 0 ? (
              <div className="px-5 py-5 text-sm" style={{ color: "#86efac" }}>
                <span className="iris-dot mr-2" /> All responses on track.
              </div>
            ) : (
              <ul className="divide-y divide-white/5">
                {risks.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{
                        background: r.health === "red" ? "#ef4444" : r.health === "yellow" ? "#eab308" : "#22c55e",
                      }}
                    />
                    <span className="font-mono shrink-0 text-muted-foreground">Q{r.question_number}</span>
                    <span className="min-w-0 flex-1 truncate">{r.title}</span>
                    <span className="shrink-0 text-[11px] text-amber-300">{r.reason}</span>
                    {r.days !== null && (
                      <span className={`shrink-0 text-[11px] tabular-nums ${r.days < 7 ? "text-red-400" : "text-muted-foreground"}`}>
                        {r.days}d
                      </span>
                    )}
                    <Link
                      to="/missions/$missionId/questions/$questionId"
                      params={{ missionId, questionId: r.id }}
                      className="shrink-0 text-[11px] text-primary hover:underline"
                    >
                      Open in Cockpit →
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* SECTION 5: NEXT GATE */}
        <section>
          <SectionHeader title="Next Gate" />
          {nextGate ? (
            <div
              className="rounded-[12px] border p-5"
              style={{
                background: "rgba(255,255,255,0.02)",
                borderColor:
                  nextGateDays !== null && nextGateDays < 7
                    ? "rgba(239,68,68,0.4)"
                    : nextGateDays !== null && nextGateDays <= 14
                      ? "rgba(245,158,11,0.35)"
                      : "rgba(255,255,255,0.06)",
              }}
            >
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-lg font-semibold">{nextGate.gate_name}</h3>
                <span
                  className={`text-[13px] tabular-nums ${
                    nextGateDays !== null && nextGateDays < 7
                      ? "font-bold text-red-400 animate-pulse"
                      : nextGateDays !== null && nextGateDays <= 14
                        ? "text-amber-300"
                        : "text-muted-foreground"
                  }`}
                >
                  {fmtDate(nextGate.target_date)} · {nextGateDays !== null ? `${nextGateDays}d` : "—"}
                </span>
              </div>
              <ul className="mt-3 space-y-1 text-[13px] text-muted-foreground">
                <li><span className="font-semibold tabular-nums text-foreground">{gateReady.belowStandard}</span> questions below standard (4.5)</li>
                <li><span className="font-semibold tabular-nums text-foreground">{gateReady.notSubmitted}</span> questions not yet submitted</li>
                <li><span className="font-semibold tabular-nums text-foreground">{gateReady.ready}</span> questions ready</li>
              </ul>
              <Link
                to="/missions/$missionId/overview"
                params={{ missionId }}
                className="mt-4 inline-flex items-center gap-1.5 text-[12px] font-semibold text-primary hover:underline"
              >
                Review question health <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          ) : (
            <div className="rounded-[12px] border border-white/5 bg-white/[0.02] px-5 py-5 text-sm text-muted-foreground">
              No review gates scheduled. <Link to="/olympus" className="text-primary hover:underline">Add gate in Olympus →</Link>
            </div>
          )}
        </section>

        {/* COLLAPSED: signals, themes, notes — secondary context, not the leader's focus */}
        <div className="border-t border-white/5 pt-6">
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            className="flex w-full items-center justify-between text-left text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground transition-colors"
            aria-expanded={moreOpen}
          >
            <span className="inline-flex items-center gap-3">
              <span>More context</span>
              <span className="text-[10px] tracking-[0.14em] text-muted-foreground/70">
                Signals · Win Themes · Leadership Notes
              </span>
            </span>
            <span className="text-[12px]">{moreOpen ? "Hide ↑" : "Show ↓"}</span>
          </button>
        </div>

        {moreOpen && (
          <>
            {/* SECTION 6: WHAT CHANGED */}
            <section>
              <SectionHeader
                title="What Changed"
                hint="Last 24 hours"
                action={
                  <button
                    onClick={() => setBroadcastOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] font-medium hover:bg-white/[0.06]"
                  >
                    <Radio className="h-3 w-3" /> Broadcast to Team
                  </button>
                }
              />
              <div className="rounded-[12px] border border-white/5 bg-white/[0.02]">
                {signals.length === 0 ? (
                  <div className="px-5 py-5 text-sm text-muted-foreground">
                    No signals today.
                    <button
                      onClick={() => setBroadcastOpen(true)}
                      className="ml-2 text-primary hover:underline"
                    >
                      Send a check-in reminder →
                    </button>
                  </div>
                ) : (
                  <ul className="divide-y divide-white/5">
                    {visibleSignals.map((s) => (
                      <SignalRow
                        key={s.id}
                        s={s}
                        profile={s.user_id ? signalProfById[s.user_id] : undefined}
                        questionLookup={questions}
                      />
                    ))}
                    {signals.length > 8 && (
                      <li className="px-5 py-2 text-center">
                        <button
                          onClick={() => setSignalsExpanded((v) => !v)}
                          className="text-[12px] text-muted-foreground hover:text-foreground"
                        >
                          {signalsExpanded ? "Show less ↑" : `View all ${signals.length} →`}
                        </button>
                      </li>
                    )}
                  </ul>
                )}
              </div>
            </section>

            {/* SECTION 7: WIN THEMES */}
            <section>
              <SectionHeader
                title="Win Themes"
                action={
                  <Link
                    to="/missions/$missionId/overview"
                    params={{ missionId }}
                    className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] font-medium hover:bg-white/[0.06]"
                  >
                    Manage <ArrowRight className="h-3 w-3" />
                  </Link>
                }
              />
              {winThemes.length === 0 ? (
                <div className="rounded-[12px] border border-dashed border-white/10 bg-white/[0.02] px-5 py-6 text-sm text-muted-foreground">
                  <div className="text-foreground font-medium">No win themes defined yet.</div>
                  <div className="mt-1 text-xs">The 3–5 messages your proposal must land on. Define them so IRIS can score coverage across every question.</div>
                  <Link
                    to="/missions/$missionId/overview"
                    params={{ missionId }}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/[0.04] px-3 py-1.5 text-[12px] font-medium text-foreground hover:bg-white/[0.08]"
                  >
                    Define win themes <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {winThemes.map((t) => {
                    const total = questions.length || 1;
                    const linked = (t.question_ids ?? []).filter((id) => questions.some((q) => q.id === id));
                    const coverage = Math.min(100, (linked.length / total) * 100);
                    const tone = coverage > 80 ? "bg-emerald-400" : coverage >= 40 ? "bg-amber-400" : "bg-destructive";
                    return (
                      <div key={t.id} className="rounded-[12px] border border-white/5 bg-white/[0.02] p-4">
                        <div className="text-sm font-semibold">{t.title}</div>
                        {t.key_message && (
                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{t.key_message}</p>
                        )}
                        <div className="mt-3 flex items-center gap-2">
                          <div className="h-1.5 flex-1 rounded-full bg-white/5 overflow-hidden">
                            <div className={`h-full ${tone}`} style={{ width: `${coverage}%` }} />
                          </div>
                          <span className="text-[11px] text-muted-foreground">{linked.length}/{questions.length}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section>
              <SectionHeader
                title="Leadership Notes"
                action={
                  <button
                    onClick={() => setAddNoteOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] font-medium hover:bg-white/[0.06]"
                  >
                    <Plus className="h-3 w-3" /> Add Note
                  </button>
                }
              />
              <div className="rounded-[12px] border border-white/5 bg-white/[0.02]">
                {notes.length === 0 ? (
                  <div className="px-5 py-5 text-sm text-muted-foreground">No leadership notes yet.</div>
                ) : (
                  <ul className="divide-y divide-white/5">
                    {notes.slice(0, 3).map((n) => (
                      <li key={n.id} className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-[10px] font-semibold uppercase text-muted-foreground">
                            {initials(n.author_name)}
                          </span>
                          <span className="text-sm font-medium">{firstName(n.author_name)}</span>
                          <span className="text-border">·</span>
                          <span className="text-[11px] text-muted-foreground">{timeAgo(n.created_at)}</span>
                        </div>
                        <p className="mt-2 ml-9 whitespace-pre-wrap text-sm text-foreground">{n.body}</p>
                      </li>
                    ))}
                    {notes.length > 3 && (
                      <li className="px-5 py-2 text-center">
                        <Link
                          to="/missions/$missionId/overview"
                          params={{ missionId }}
                          className="text-[12px] text-muted-foreground hover:text-foreground"
                        >
                          View all {notes.length} →
                        </Link>
                      </li>
                    )}
                  </ul>
                )}
              </div>
            </section>
          </>
        )}

        {/* PRIMARY CTA — Cockpit. Mission Room is a secondary inline link. */}
        <div className="space-y-3">
          <Link
            to="/missions/$missionId/questions"
            params={{ missionId }}
            className="group flex items-center justify-between gap-4 rounded-[12px] border p-5 transition hover:bg-[rgba(59,127,255,0.08)]"
            style={{ background: "rgba(59,127,255,0.05)", borderColor: "rgba(59,127,255,0.3)" }}
          >
            <div>
              <div className="inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.2em]" style={{ color: "#3b7fff" }}>
                <Plane size={13} strokeWidth={2} /> Enter Cockpit
              </div>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Questions, writing, signals, and IRIS coaching — where the work happens.
              </p>
            </div>
            <ArrowRight className="h-5 w-5 shrink-0" style={{ color: "#3b7fff" }} />
          </Link>
          <div className="text-center">
            <Link
              to="/missions/$missionId/overview"
              params={{ missionId }}
              className="text-[12px] text-muted-foreground hover:text-foreground"
            >
              Or open Mission Room → documents, intel, full question map, team, timeline.
            </Link>
          </div>
        </div>
      </div>

      {broadcastOpen && (
        <BroadcastModal
          missionId={missionId}
          onClose={() => setBroadcastOpen(false)}
          onSent={onSentNote}
        />
      )}
      {addNoteOpen && me && (
        <AddNoteModal
          missionId={missionId}
          meId={me.id}
          meName={firstName(me.display_name ?? me.email ?? "Leader")}
          onClose={() => setAddNoteOpen(false)}
          onSent={() => { onSentNote(); setAddNoteOpen(false); }}
        />
      )}
    </div>
  );
}

/* ─────────────────────────── pieces ─────────────────────────── */

function SectionHeader({
  title, hint, badge, action,
}: { title: string; hint?: string; badge?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">{title}</h3>
        {badge}
        {hint && <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">· {hint}</span>}
      </div>
      {action}
    </div>
  );
}

function CountBadge({ count, tone }: { count: number; tone: "amber" | "green" | "red" }) {
  let cls = "bg-emerald-500/15 text-emerald-300";
  if (count > 0 && tone === "amber") cls = "bg-amber-500/15 text-amber-300";
  if (count > 0 && tone === "red") cls = "bg-red-500/15 text-red-300";
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums ${cls}`}>{count}</span>;
}

function HealthPip({ color, count, label }: { color: string; count: number; label: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      <span className="font-semibold tabular-nums">{count}</span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}

function NeedCard({
  need, questionNumber, missionId, meId, meName, onResolved,
}: {
  need: { source: "collab" | "reality"; id: string; question_id: string; author_name: string; type_label: string; body: string; created_at: string };
  questionNumber: string;
  missionId: string;
  meId: string | null;
  meName: string;
  onResolved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const hrs = Math.round(hoursSince(need.created_at));

  const send = async () => {
    if (!text.trim() || !meId) return;
    setBusy(true);
    try {
      const { error: e1 } = await supabase.from("question_collaboration").insert({
        question_id: need.question_id,
        mission_id: missionId,
        author_id: meId,
        author_name: meName,
        entry_type: "leadership_guidance",
        body: text.trim(),
      });
      if (e1) throw e1;
      if (need.source === "collab") {
        await supabase.from("question_collaboration")
          .update({ resolved: true, resolved_by: meId, resolved_at: new Date().toISOString() })
          .eq("id", need.id);
      } else {
        await supabase.from("reality_updates")
          .update({ resolved: true, resolved_by: meId, resolved_at: new Date().toISOString() })
          .eq("id", need.id);
      }
      setDone(`Response sent to ${firstName(need.author_name)}.`);
      setTimeout(onResolved, 1800);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to send");
    } finally {
      setBusy(false);
    }
  };
  const dismiss = async () => {
    if (!meId) return;
    setBusy(true);
    try {
      if (need.source === "collab") {
        await supabase.from("question_collaboration")
          .update({ resolved: true, resolved_by: meId, resolved_at: new Date().toISOString() })
          .eq("id", need.id);
      } else {
        await supabase.from("reality_updates")
          .update({ resolved: true, resolved_by: meId, resolved_at: new Date().toISOString() })
          .eq("id", need.id);
      }
      onResolved();
    } finally { setBusy(false); }
  };

  if (done) {
    return <li className="px-5 py-4 text-sm" style={{ color: "#86efac" }}>● {done}</li>;
  }

  return (
    <li className="px-5 py-4">
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-[10px] font-semibold uppercase text-muted-foreground">
          {initials(need.author_name)}
        </span>
        <span className="text-sm font-semibold">{firstName(need.author_name)}</span>
        <span className="text-border">·</span>
        <span className="font-mono text-[12px] text-muted-foreground">Q{questionNumber}</span>
        <span className="text-border">·</span>
        <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
          {need.type_label}
        </span>
        <span className="ml-auto text-[11px] text-muted-foreground">{hrs}h open</span>
      </div>
      {need.body && (
        <p className="mt-2 ml-11 text-[13px] text-muted-foreground line-clamp-2">"{need.body.slice(0, 200)}"</p>
      )}
      <div className="mt-3 ml-11">
        {!open ? (
          <button
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
          >
            <MessageSquare className="h-3 w-3" /> Respond →
          </button>
        ) : (
          <div className="space-y-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              autoFocus
              placeholder="Type your guidance or decision…"
              className="w-full rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm focus:border-primary/60 focus:outline-none"
            />
            <div className="flex gap-2">
              <button
                onClick={send}
                disabled={busy || !text.trim()}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "Sending…" : "Send"}
              </button>
              <button
                onClick={dismiss}
                disabled={busy}
                className="rounded-md border border-white/10 px-3 py-1.5 text-xs font-medium hover:bg-white/5"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
      </div>
    </li>
  );
}

function SignalRow({
  s, profile, questionLookup,
}: {
  s: { id: string; signal_title: string; signal_summary: string | null; user_id: string | null; related_question_id: string | null; created_at: string };
  profile?: { display_name: string | null; email: string | null };
  questionLookup: Array<{ id: string; question_number: string }>;
}) {
  const [open, setOpen] = useState(false);
  const q = s.related_question_id ? questionLookup.find((x) => x.id === s.related_question_id) : null;
  const name = profile?.display_name || profile?.email?.split("@")[0] || "System";
  return (
    <li className="cursor-pointer px-5 py-2.5 text-sm hover:bg-white/[0.03]" onClick={() => setOpen((v) => !v)}>
      <div className="flex items-center gap-2.5">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-[9px] font-semibold uppercase text-muted-foreground">
          {initials(name)}
        </span>
        <span className="font-medium shrink-0">{firstName(name)}</span>
        <span className="text-border">·</span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">{s.signal_title}</span>
        {q && <span className="shrink-0 font-mono text-[11px] text-muted-foreground">Q{q.question_number}</span>}
        <span className="shrink-0 text-[10px] text-muted-foreground">{timeAgo(s.created_at)}</span>
      </div>
      {open && s.signal_summary && (
        <p className="mt-2 ml-9 whitespace-pre-wrap text-xs text-muted-foreground">{s.signal_summary}</p>
      )}
    </li>
  );
}

/* ─────────────────────────── modals ─────────────────────────── */

function BroadcastModal({ missionId, onClose, onSent }: { missionId: string; onClose: () => void; onSent: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const { data: p } = await supabase.from("profiles").select("display_name,email").eq("id", u.user.id).maybeSingle();
      const fromName = p?.display_name ?? u.user.email?.split("@")[0] ?? "Leadership";
      const { error } = await supabase.from("broadcasts").insert({
        user_id: u.user.id,
        from_name: fromName,
        text: text.trim(),
        mission_id: missionId,
      });
      if (error) throw error;
      toast.success("Broadcast sent");
      onSent();
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-[12px] border border-white/10 bg-[#0a0e1a] p-5 shadow-2xl">
        <h3 className="mb-3 text-sm font-semibold">Broadcast to Team</h3>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          autoFocus
          placeholder="Message to the full mission team…"
          className="w-full rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm focus:border-primary/60 focus:outline-none"
        />
        <div className="mt-3 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-white/10 px-3 py-1.5 text-xs font-medium hover:bg-white/5">Cancel</button>
          <button
            onClick={send}
            disabled={busy || !text.trim()}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Sending…" : "Send Broadcast"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddNoteModal({
  missionId, meId, meName, onClose, onSent,
}: { missionId: string; meId: string; meName: string; onClose: () => void; onSent: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      // Find any question to attach the note to (notes need a question_id by schema).
      // Use the first question in the mission.
      const { data: q } = await supabase
        .from("question_records").select("id").eq("mission_id", missionId).limit(1).maybeSingle();
      const questionId = q?.id;
      if (!questionId) throw new Error("No questions in mission to attach note to");

      const { error } = await supabase.from("question_collaboration").insert({
        question_id: questionId,
        mission_id: missionId,
        author_id: meId,
        author_name: meName,
        entry_type: "leadership_note",
        body: text.trim(),
      });
      if (error) throw error;
      toast.success("Leadership note posted");
      onSent();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to post note");
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-[12px] border border-white/10 bg-[#0a0e1a] p-5 shadow-2xl">
        <h3 className="mb-3 text-sm font-semibold">Leadership Note</h3>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          autoFocus
          placeholder="A note for the whole team…"
          className="w-full rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm focus:border-primary/60 focus:outline-none"
        />
        <div className="mt-3 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-white/10 px-3 py-1.5 text-xs font-medium hover:bg-white/5">Cancel</button>
          <button
            onClick={send}
            disabled={busy || !text.trim()}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Posting…" : "Post Note"}
          </button>
        </div>
      </div>
    </div>
  );
}
