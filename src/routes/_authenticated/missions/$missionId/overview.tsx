import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { relativeTime, createSignal } from "@/lib/signals";
import {
  ArrowRight, Megaphone, RefreshCw, X, Eye, AlertTriangle, Plus,
  Mail, Clock, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { AmendmentDashboardBanner } from "@/components/AmendmentDashboardBanner";
import { MissionRoomHero, EnterStudioCTA } from "@/components/v2/MissionRoomHero";
import { PilotStatusSection } from "@/components/v2/PilotStatusSection";

export const Route = createFileRoute("/_authenticated/missions/$missionId/overview")({
  component: MissionOverviewPage,
});

// ── TYPES ────────────────────────────────────────────────
type Question = {
  id: string;
  question_number: string;
  title: string;
  section_number: string | null;
  question_text: string;
  requirements: string[] | null;
  health: string | null;
  current_score: number | null;
  status: string | null;
  pens_down_date: string | null;
  assigned_writer_id: string | null;
  assigned_sme_id: string | null;
  health_drivers: Record<string, string> | null;
};
type Member = {
  user_id: string;
  role: string;
  display_name: string | null;
  joined_at: string | null;
  email?: string | null;
  name?: string | null;
};
type Collab = {
  id: string; question_id: string | null; mission_id: string;
  entry_type: string; body: string | null; author_id: string | null;
  author_name: string; created_at: string; resolved: boolean;
};
type Gate = { id: string; gate_name: string; target_date: string | null; gate_order: number; };
type Note = { id: string; from_name: string; text: string; created_at: string };
type Signal = {
  id: string; signal_type: string; signal_title: string;
  signal_summary: string | null; created_at: string;
  related_question_id: string | null; user_id: string | null;
};
type Decision = {
  id: string; title: string; rationale: string | null; owner: string | null;
  status: string; decided_at: string | null; created_at: string;
  question_id: string | null;
};
type Risk = {
  id: string; title: string; description: string | null; owner: string | null;
  severity: string; status: string; created_at: string;
  question_id: string | null;
};
type WinTheme = {
  id: string; title: string; description: string | null; key_message: string | null;
  question_ids: string[] | null; status: string;
};

const NEED_TYPES = ["decision_needed", "sme_request", "air_cover"] as const;
const NEED_LABEL: Record<string, string> = {
  decision_needed: "Requested decision",
  sme_request: "Requested help",
  air_cover: "Requested air cover",
  note: "Shared intelligence",
  leadership_guidance: "Guidance given",
};

// ── HELPERS ──────────────────────────────────────────────
function initialsOf(name: string | null | undefined): string {
  if (!name) return "?";
  return name.trim().split(/\s+/).map((s) => s[0]).join("").slice(0, 2).toUpperCase();
}
function firstName(name: string | null | undefined): string {
  if (!name) return "Someone";
  return name.trim().split(/\s+/)[0];
}
function daysTo(date: string | null): number | null {
  if (!date) return null;
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
}
function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
function dayCountdown(d: string | null): { text: string; tone: "muted" | "default" | "yellow" | "red"; strike?: boolean } {
  const n = daysTo(d);
  if (n === null) return { text: "—", tone: "muted" };
  if (n < 0) return { text: `${Math.abs(n)}d ago`, tone: "muted", strike: true };
  if (n < 15) return { text: `${n} days`, tone: "red" };
  if (n <= 30) return { text: `${n} days`, tone: "yellow" };
  return { text: `${n} days`, tone: "default" };
}

function MissionOverviewPage() {
  const { missionId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  // ── DATA ────────────────────────────────────────────────
  const { data: me } = useQuery({
    queryKey: ["overview-me", missionId],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const [{ data: prof }, { data: mem }] = await Promise.all([
        supabase.from("profiles").select("id,display_name,email").eq("id", user.id).maybeSingle(),
        supabase.from("mission_members").select("role").eq("mission_id", missionId).eq("user_id", user.id).maybeSingle(),
      ]);
      return {
        id: user.id,
        name: prof?.display_name ?? prof?.email?.split("@")[0] ?? "User",
        role: mem?.role ?? null,
      };
    },
  });
  const isLeader = me?.role === "admin" || me?.role === "lead";
  const isPM = isLeader; // PM treated as leader role here

  const { data: mission } = useQuery({
    queryKey: ["overview-mission-full", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("missions")
        .select("id,name,client,state,health,status,description,submission_date,rfp_number,state_agency,procurement_name,qa_deadline,priority_topics,competitors")
        .eq("id", missionId).maybeSingle();
      return data;
    },
  });

  const { data: questions = [] } = useQuery<Question[]>({
    queryKey: ["overview-questions", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("question_records")
        .select("id,question_number,title,section_number,question_text,requirements,health,current_score,status,pens_down_date,assigned_writer_id,assigned_sme_id,health_drivers")
        .eq("mission_id", missionId);
      return (data ?? []) as Question[];
    },
  });

  const { data: members = [] } = useQuery<Member[]>({
    queryKey: ["overview-members-full", missionId],
    queryFn: async () => {
      const { data: mm } = await supabase
        .from("mission_members")
        .select("user_id,role,display_name,joined_at")
        .eq("mission_id", missionId);
      const ids = (mm ?? []).map((m) => m.user_id);
      if (ids.length === 0) return [];
      const { data: profs } = await supabase
        .from("profiles")
        .select("id,display_name,email")
        .in("id", ids);
      const pmap = new Map(profs?.map((p) => [p.id, p]) ?? []);
      return (mm ?? []).map((m) => {
        const p = pmap.get(m.user_id);
        return {
          ...m,
          name: m.display_name ?? p?.display_name ?? p?.email?.split("@")[0] ?? "Member",
          email: p?.email ?? null,
        } as Member;
      });
    },
  });

  const { data: needs = [] } = useQuery<Collab[]>({
    queryKey: ["overview-needs", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("question_collaboration")
        .select("id,question_id,mission_id,entry_type,body,author_id,author_name,created_at,resolved")
        .eq("mission_id", missionId)
        .eq("resolved", false)
        .in("entry_type", NEED_TYPES as unknown as string[])
        .order("created_at", { ascending: true });
      return (data ?? []) as Collab[];
    },
  });

  const { data: gates = [] } = useQuery<Gate[]>({
    queryKey: ["overview-gates", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_review_gates")
        .select("id,gate_name,target_date,gate_order")
        .eq("mission_id", missionId)
        .order("target_date", { ascending: true });
      return (data ?? []) as Gate[];
    },
  });

  const { data: decisions = [] } = useQuery<Decision[]>({
    queryKey: ["overview-decisions", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_decisions")
        .select("id,title,rationale,owner,status,decided_at,created_at,question_id")
        .eq("mission_id", missionId)
        .order("created_at", { ascending: false });
      return (data ?? []) as Decision[];
    },
  });

  const { data: risks = [] } = useQuery<Risk[]>({
    queryKey: ["overview-risks", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_risks")
        .select("id,title,description,owner,severity,status,created_at,question_id")
        .eq("mission_id", missionId)
        .order("created_at", { ascending: false });
      return (data ?? []) as Risk[];
    },
  });

  const { data: winThemes = [] } = useQuery<WinTheme[]>({
    queryKey: ["overview-win-themes", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("win_themes")
        .select("id,title,description,key_message,question_ids,status")
        .eq("mission_id", missionId)
        .neq("status", "archived");
      return (data ?? []) as WinTheme[];
    },
  });

  const since24h = useMemo(() => new Date(Date.now() - 86400000).toISOString(), []);

  const { data: recentSignals = [] } = useQuery<Signal[]>({
    queryKey: ["overview-signals-24h", missionId, since24h],
    queryFn: async () => {
      const { data } = await supabase
        .from("signals")
        .select("id,signal_type,signal_title,signal_summary,created_at,related_question_id,user_id")
        .eq("mission_id", missionId)
        .gte("created_at", since24h)
        .order("created_at", { ascending: false });
      return (data ?? []) as Signal[];
    },
  });

  const { data: recentCollab = [] } = useQuery<Collab[]>({
    queryKey: ["overview-collab-24h", missionId, since24h],
    queryFn: async () => {
      const { data } = await supabase
        .from("question_collaboration")
        .select("id,question_id,mission_id,entry_type,body,author_id,author_name,created_at,resolved")
        .eq("mission_id", missionId)
        .gte("created_at", since24h)
        .neq("entry_type", "leadership_guidance")
        .order("created_at", { ascending: false });
      return (data ?? []) as Collab[];
    },
  });

  const { data: notes = [] } = useQuery<Note[]>({
    queryKey: ["overview-notes", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("broadcasts")
        .select("id,from_name,text,created_at")
        .eq("mission_id", missionId)
        .order("created_at", { ascending: false })
        .limit(20);
      return (data ?? []) as Note[];
    },
  });

  const { data: writerMembers = [] } = useQuery<Array<{ user_id: string }>>({
    queryKey: ["overview-writer-members", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_members")
        .select("user_id,role")
        .eq("mission_id", missionId)
        .eq("role", "writer");
      return (data ?? []) as Array<{ user_id: string }>;
    },
  });

  const noteIds = notes.map((n) => n.id);
  const { data: noteReads = [] } = useQuery<Array<{ note_id: string; user_id: string }>>({
    queryKey: ["overview-note-reads", missionId, noteIds.join(",")],
    enabled: noteIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("note_reads")
        .select("note_id,user_id")
        .in("note_id", noteIds);
      return (data ?? []) as Array<{ note_id: string; user_id: string }>;
    },
  });

  // ── DERIVATIONS ─────────────────────────────────────────
  const qById = useMemo(() => new Map(questions.map((q) => [q.id, q])), [questions]);
  const memberById = useMemo(() => new Map(members.map((m) => [m.user_id, m])), [members]);

  const counts = useMemo(() => {
    let g = 0, y = 0, r = 0;
    for (const q of questions) {
      const h = (q.health ?? "").toLowerCase();
      if (h === "green") g++;
      else if (h === "yellow") y++;
      else if (h === "red") r++;
    }
    return { green: g, yellow: y, red: r, total: questions.length };
  }, [questions]);

  const atStandardCount = useMemo(
    () => questions.filter((q) => q.current_score !== null && Number(q.current_score) >= 4.5).length,
    [questions]
  );

  const overallHealth: "Red" | "Yellow" | "Green" =
    counts.red > 0 ? "Red" : counts.yellow > 0 ? "Yellow" : "Green";

  // Roles → people
  const findByRole = (role: string) => members.find((m) => m.role === role) ?? null;
  const leadershipRow = useMemo(() => {
    const lead = members.find((m) => m.role === "lead") ?? null;
    const admin = findByRole("admin");
    const writers = members.filter((m) => m.role === "writer");
    const smes = members.filter((m) => m.role === "sme");
    return [
      { label: "Engagement Lead", person: lead },
      { label: "Project Manager", person: admin },
      { label: "Lead Reviewer", person: writers[0] ?? null },
      { label: "Capture Lead", person: smes[0] ?? null },
    ];
  }, [members]);

  const nextGate = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return gates.filter((g) => g.target_date && g.target_date >= today)[0] ?? null;
  }, [gates]);

  // IRIS brief (carried over from previous version)
  const irisBrief = useMemo(() => {
    if (!mission) return "";
    const sentences: string[] = [];
    if (counts.red > 0 || counts.yellow > 0) {
      sentences.push(`${counts.yellow} Yellow and ${counts.red} Red question${counts.yellow + counts.red === 1 ? "" : "s"} need attention.`);
    } else if (counts.total > 0) {
      sentences.push(`All ${counts.total} questions are Green.`);
    }
    if (nextGate?.target_date) {
      const d = daysTo(nextGate.target_date);
      const flagged = questions.filter((q) => q.current_score !== null && Number(q.current_score) < 4.5).length;
      if (d !== null && d >= 0) sentences.push(`${nextGate.gate_name} is in ${d} day${d === 1 ? "" : "s"} with ${flagged} question${flagged === 1 ? "" : "s"} below standard.`);
    }
    const oldest = needs[0];
    if (oldest) {
      const q = oldest.question_id ? qById.get(oldest.question_id) : null;
      sentences.push(`${firstName(oldest.author_name)} ${NEED_LABEL[oldest.entry_type] ?? "needs help"}${q ? ` on Q${q.question_number}` : ""}.`);
    }
    if (sentences.length === 0) sentences.push("Mission is operating normally. No immediate leadership attention required.");
    return sentences.slice(0, 4).join(" ");
  }, [mission, counts, nextGate, needs, questions, qById]);

  const [briefStamp, setBriefStamp] = useState<Date>(() => new Date());

  // Plain-language blurb for the mission (IRIS-style summary)
  const blurb = useMemo(() => {
    if (mission?.description) return mission.description;
    const parts: string[] = [];
    if (mission?.procurement_name) parts.push(mission.procurement_name);
    else if (mission?.name) parts.push(mission.name);
    if (mission?.state_agency) parts.push(`issued by ${mission.state_agency}`);
    else if (mission?.client) parts.push(`for ${mission.client}`);
    if (mission?.state) parts.push(`in ${mission.state}`);
    return parts.length
      ? `${parts.join(" ")}. ${counts.total} question${counts.total === 1 ? "" : "s"} across the proposal.`
      : "Procurement details pending. Add a summary in Olympus to give your team context.";
  }, [mission, counts.total]);

  const submissionDays = daysTo(mission?.submission_date ?? null);

  // ── MY ASSIGNED ───────────────────────────────────────
  const myAssigned = useMemo(
    () => me ? questions.filter((q) => q.assigned_writer_id === me.id) : [],
    [questions, me]
  );
  const myAttention = useMemo(
    () => myAssigned.filter((q) => { const h = (q.health ?? "").toLowerCase(); return h === "red" || h === "yellow"; }),
    [myAssigned]
  );

  // ── MUTATIONS (needs / responses) ─────────────────────
  const respondMutation = useMutation({
    mutationFn: async ({ need, text }: { need: Collab; text: string }) => {
      if (!me) throw new Error("Not signed in");
      if (!need.question_id) throw new Error("Missing question");
      const { error: e1 } = await supabase.from("question_collaboration").insert({
        question_id: need.question_id,
        mission_id: need.mission_id,
        author_id: me.id,
        author_name: me.name,
        entry_type: "leadership_guidance",
        body: text.trim(),
      });
      if (e1) throw e1;
      const { error: e2 } = await supabase
        .from("question_collaboration")
        .update({ resolved: true, resolved_by: me.id, resolved_at: new Date().toISOString() })
        .eq("id", need.id);
      if (e2) throw e2;
      if (need.question_id) {
        await createSignal({
          mission_id: need.mission_id,
          source_module: "overview",
          signal_type: "leadership_guidance_added",
          signal_title: `Guidance for ${firstName(need.author_name)}`,
          severity: "info",
          related_question_id: need.question_id,
        }, qc);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["overview-needs", missionId] });
      qc.invalidateQueries({ queryKey: ["overview-collab-24h", missionId, since24h] });
    },
  });

  const dismissMutation = useMutation({
    mutationFn: async (need: Collab) => {
      if (!me) throw new Error("Not signed in");
      const { error } = await supabase
        .from("question_collaboration")
        .update({ resolved: true, resolved_by: me.id, resolved_at: new Date().toISOString() })
        .eq("id", need.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["overview-needs", missionId] }),
  });

  // ── STICKY BAR LOGIC ──────────────────────────────────
  const vitalsRef = useRef<HTMLElement | null>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const el = vitalsRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setStuck(!entry.isIntersecting),
      { rootMargin: "-1px 0px 0px 0px", threshold: 0 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [mission?.id]);

  // ── QUESTION DRAWER ───────────────────────────────────
  const [drawerQid, setDrawerQid] = useState<string | null>(null);
  const drawerQ = drawerQid ? qById.get(drawerQid) ?? null : null;

  // ── MESSAGE COMPOSE ───────────────────────────────────
  const [composeTarget, setComposeTarget] = useState<{ person: Member; label: string } | null>(null);
  const openCompose = (person: Member, label: string) => setComposeTarget({ person, label });

  // ── RENDER ────────────────────────────────────────────
  return (
    <div className="mission-room-bg min-h-screen">
      <style>{`
        .mission-room-bg {
          background: #060b14;
          background-image:
            linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px);
          background-size: 48px 48px;
        }
        .mr-section-label {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.25em;
          text-transform: uppercase;
          color: hsl(var(--muted-foreground));
          padding-left: 12px;
          border-left: 2px solid currentColor;
          margin-bottom: 24px;
        }
        .mr-divider { border-top: 1px solid rgba(255,255,255,0.06); }
      `}</style>

      {/* STICKY BAR */}
      {stuck && (
        <div className="sticky top-0 z-40 backdrop-blur-md border-b border-white/[0.06]"
             style={{ background: "rgba(6,11,20,0.95)" }}>
          <div className="mx-auto max-w-[1100px] px-10 h-10 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 min-w-0 truncate">
              <HealthDot tone={overallHealth} size="sm" />
              <span className="font-medium truncate">{mission?.name ?? "Mission"}</span>
              {submissionDays !== null && (
                <span className="text-muted-foreground">· {submissionDays < 0 ? `${Math.abs(submissionDays)}d overdue` : `${submissionDays} days`}</span>
              )}
              {nextGate?.target_date && (() => {
                const d = daysTo(nextGate.target_date);
                return <span className="text-muted-foreground">· {nextGate.gate_name} {d !== null && d >= 0 ? `${fmtDate(nextGate.target_date)}` : ""}</span>;
              })()}
              <span className="text-muted-foreground">· {counts.total} Q</span>
            </div>
            <button
              onClick={() => navigate({ to: "/missions/$missionId/studio", params: { missionId } })}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
            >
              Enter Cockpit <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-[1100px] px-10 pt-12 pb-16 space-y-12 page-enter">
        <AmendmentDashboardBanner missionId={missionId} />

        {/* ── 1. MISSION VITALS ───────────────────────── */}
        <section ref={vitalsRef as any} className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className={statusBadgeClass(mission?.status ?? "Active")}>
              ● {(mission?.status ?? "Active").toUpperCase().includes("ACTIVE") ? "ACTIVE MISSION" : (mission?.status ?? "Active").toUpperCase()}
            </span>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="text-emerald-400">●{counts.green} Green</span>
              <span className="text-amber-400">●{counts.yellow} Yellow</span>
              <span className="text-destructive">●{counts.red} Red</span>
              <span className="text-muted-foreground">· {counts.total} questions</span>
            </div>
          </div>

          <h1 className="text-[32px] font-bold leading-[1.1] tracking-[-0.02em] text-white mt-3 mb-1">
            {mission?.name ?? "Loading…"}
          </h1>
          {mission?.rfp_number && (
            <div className="font-mono text-[13px] tracking-[0.08em] text-muted-foreground">
              RFP #{mission.rfp_number}
            </div>
          )}
          {(mission?.state_agency || mission?.client) && (
            <div className="text-sm text-foreground/70 mt-2">
              {mission?.state_agency ?? mission?.client}
              {mission?.state && <span className="text-muted-foreground"> · {mission.state}</span>}
            </div>
          )}

          {/* Blurb */}
          <blockquote
            className="mt-4 rounded-r-lg italic text-foreground/80 leading-[1.7]"
            style={{
              borderLeft: "3px solid rgba(255,255,255,0.15)",
              padding: "12px 20px",
              fontSize: 15,
              background: "rgba(255,255,255,0.02)",
            }}
          >
            {blurb}
          </blockquote>
          <p className="text-[11px] text-muted-foreground -mt-2">
            ● IRIS summary ·{" "}
            <Link to="/olympus/missions/$missionId" params={{ missionId }} className="hover:underline">
              Edit in Olympus →
            </Link>
          </p>

          {/* Dates grid — two rows of 3 */}
          <div className="grid grid-cols-3 gap-3 mt-6">
            <DateCell label="Submission" date={mission?.submission_date ?? null} sub="" />
            <DateCell label="Contract Value" customValue={mission?.priority_topics?.[0] ?? "—"} sub="annually" />
            <DateCell label="Contract Term" customValue="—" sub="" />
            <DateCell label="Pens Down" customValue="—" sub="" />
            <DateCell label="Q&A Deadline" date={mission?.qa_deadline ?? null} sub="" />
            <DateCell label="Contract Start" customValue="—" sub="" />
          </div>

          {/* Leadership row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
            {leadershipRow.map((slot) => (
              <LeaderCard key={slot.label} label={slot.label} person={slot.person} onMessage={openCompose} />
            ))}
          </div>
        </section>

        <div className="mr-divider" />

        {/* ── 2. IRIS INTELLIGENCE ────────────────────── */}
        <section>
          <h2 className="mr-section-label" style={{ color: "var(--iris, #22d3ee)" }}>IRIS Intelligence</h2>
          <div
            className="rounded-[12px] px-7 py-6"
            style={{
              border: "1px solid rgba(8,145,178,0.3)",
              background: "radial-gradient(ellipse at 0% 50%, rgba(8,145,178,0.08), hsl(var(--card)) 70%)",
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em]" style={{ color: "var(--iris, #22d3ee)" }}>
                <span className="relative inline-flex h-1.5 w-1.5">
                  <span className="absolute inset-0 animate-ping rounded-full bg-[color:var(--iris,#22d3ee)]/60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[color:var(--iris,#22d3ee)]" />
                </span>
                IRIS
              </div>
              <button
                onClick={() => { setBriefStamp(new Date()); qc.invalidateQueries({ queryKey: ["overview-questions", missionId] }); qc.invalidateQueries({ queryKey: ["overview-needs", missionId] }); }}
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
              >
                <RefreshCw className="h-3 w-3" /> Refresh
              </button>
            </div>
            <p className="mt-3 text-[15px] leading-relaxed text-foreground/90">{irisBrief || "Generating briefing…"}</p>
            <p className="mt-3 text-[10px] text-muted-foreground">Updated {relativeTime(briefStamp.toISOString())}</p>
          </div>
        </section>

        {/* Leader-only Team Needs alert */}
        {isLeader && needs.length > 0 && (
          <section
            className="rounded-[10px] px-5 py-4 flex items-center justify-between gap-4"
            style={{
              background: "rgba(245, 158, 11, 0.08)",
              border: "1px solid rgba(245, 158, 11, 0.3)",
            }}
          >
            <div className="flex items-center gap-3 text-sm">
              <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
              <span className="text-amber-100">
                <strong>{needs.length}</strong> team need{needs.length === 1 ? "" : "s"} require your attention
              </span>
            </div>
            <a href="#decisions-risks" className="text-xs text-amber-300 hover:underline inline-flex items-center gap-1">
              Review needs <ArrowRight className="h-3 w-3" />
            </a>
          </section>
        )}

        <div className="mr-divider" />

        {/* ── 3. MISSION KNOWLEDGE (Vault + Oracle) ───── */}
        <section>
          <h2 className="mr-section-label" style={{ color: "rgba(255,255,255,0.5)" }}>Mission Knowledge</h2>
          <MissionRoomHero missionId={missionId} />
        </section>

        <div className="mr-divider" />

        {/* ── 3b. PILOT STATUS (lead-only) ───── */}
        <PilotStatusSection missionId={missionId} isLead={isLeader} />

        <div className="mr-divider" />

        {/* ── 4. QUESTION MAP ─────────────────────────── */}
        <section>
          <h2 className="mr-section-label" style={{ color: "hsl(var(--primary))" }}>Question Map</h2>
          <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>{counts.total} Total</span>
            <span className="text-emerald-400">●{counts.green} Green</span>
            <span className="text-amber-400">●{counts.yellow} Yellow</span>
            <span className="text-destructive">●{counts.red} Red</span>
            <span>·</span>
            <span>Athena Standard: <span className="text-emerald-400 font-semibold">{atStandardCount}</span> at 4.5+</span>
          </div>
          <QuestionMapTable
            questions={questions}
            members={members}
            meId={me?.id ?? null}
            onOpenMine={(qid) => navigate({ to: "/missions/$missionId/questions/$questionId", params: { missionId, questionId: qid } })}
            onPeek={(qid) => setDrawerQid(qid)}
          />
        </section>

        <div className="mr-divider" />

        {/* ── 5. TEAM ─────────────────────────────────── */}
        <section>
          <h2 className="mr-section-label" style={{ color: "rgba(255,255,255,0.5)" }}>Team</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <TeamColumn
              title="Mission Team"
              members={members.filter((m) => m.role !== "sme")}
              questions={questions}
              roleField="writer"
            />
            <TeamColumn
              title="SME Directory"
              members={members.filter((m) => m.role === "sme")}
              questions={questions}
              roleField="sme"
            />
          </div>
        </section>

        <div className="mr-divider" />

        {/* ── 6. TIMELINE ─────────────────────────────── */}
        <section>
          <h2 className="mr-section-label" style={{ color: "rgb(245, 158, 11)" }}>Timeline</h2>
          <Timeline
            mission={mission ?? null}
            gates={gates}
          />
        </section>

        <div className="mr-divider" />

        {/* ── 7. DECISIONS + RISKS ────────────────────── */}
        <section id="decisions-risks">
          <h2 className="mr-section-label" style={{ color: "rgba(255,255,255,0.5)" }}>Decisions + Risks</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <DecisionsCol
              decisions={decisions}
              needs={needs}
              qById={qById}
              isLeader={isLeader}
              onRespond={(need, text) => respondMutation.mutateAsync({ need, text })}
              onDismiss={(n) => dismissMutation.mutateAsync(n)}
            />
            <RisksCol risks={risks} canLog={isLeader || isPM} missionId={missionId} qc={qc} />
          </div>
        </section>

        <div className="mr-divider" />

        {/* ── 8. WIN THEMES ───────────────────────────── */}
        <section>
          <h2 className="mr-section-label" style={{ color: "rgba(255,255,255,0.5)" }}>Win Themes</h2>
          <WinThemesGrid themes={winThemes} questions={questions} />
        </section>

        <div className="mr-divider" />

        {/* ── 9. LEADERSHIP NOTES ─────────────────────── */}
        <section>
          <h2 className="mr-section-label" style={{ color: "rgba(255,255,255,0.5)" }}>Leadership Notes</h2>
          <LeadershipNotesBlock
            notes={notes}
            canWrite={isLeader}
            isLeader={isLeader}
            missionId={missionId}
            meName={me?.name ?? "Leader"}
            meId={me?.id ?? null}
            myRole={me?.role ?? null}
            writerIds={writerMembers.map((m) => m.user_id)}
            noteReads={noteReads}
            onSaved={() => qc.invalidateQueries({ queryKey: ["overview-notes", missionId] })}
            onReadsChanged={() => qc.invalidateQueries({ queryKey: ["overview-note-reads", missionId] })}
          />
        </section>

        <div className="mr-divider" />

        {/* ── 10. WHAT CHANGED ────────────────────────── */}
        <section>
          <h2 className="mr-section-label" style={{ color: "rgba(255,255,255,0.5)" }}>What Changed</h2>
          <p className="-mt-5 mb-4 text-[11px] text-muted-foreground">Last 24 hours</p>
          <WhatChangedBlock
            signals={recentSignals}
            collab={recentCollab}
            qById={qById}
            canBroadcast={isLeader}
            missionId={missionId}
            meName={me?.name ?? "Leader"}
            meId={me?.id ?? null}
            onSent={() => qc.invalidateQueries({ queryKey: ["overview-notes", missionId] })}
          />
        </section>

        <div className="mr-divider" />

        {/* ── 11. ENTER STUDIO ────────────────────────── */}
        <section>
          <EnterStudioCTA
            missionId={missionId}
            assignedCount={myAssigned.length}
            attentionCount={myAttention.length}
          />
        </section>
      </div>

      {/* Read-only question drawer */}
      {drawerQ && (
        <QuestionDrawer
          q={drawerQ}
          missionId={missionId}
          isMine={drawerQ.assigned_writer_id === me?.id}
          writer={drawerQ.assigned_writer_id ? memberById.get(drawerQ.assigned_writer_id) ?? null : null}
          sme={drawerQ.assigned_sme_id ? memberById.get(drawerQ.assigned_sme_id) ?? null : null}
          onClose={() => setDrawerQid(null)}
        />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// ── SUB-COMPONENTS ───────────────────────────────────────
// ══════════════════════════════════════════════════════════

function statusBadgeClass(status: string): string {
  const s = status.toLowerCase();
  const base = "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] border";
  if (s.includes("pens")) return `${base} bg-amber-500/15 text-amber-400 border-amber-500/30`;
  if (s.includes("submit")) return `${base} bg-blue-500/15 text-blue-400 border-blue-500/30`;
  if (s.includes("closed")) return `${base} bg-muted text-muted-foreground border-border`;
  if (s.includes("draft")) return `${base} bg-muted text-muted-foreground border-border`;
  return `${base} bg-emerald-500/15 text-emerald-400 border-emerald-500/30`;
}

function HealthDot({ tone, size = "md" }: { tone: "Red" | "Yellow" | "Green"; size?: "sm" | "md" }) {
  const color = tone === "Red" ? "bg-destructive" : tone === "Yellow" ? "bg-amber-400" : "bg-emerald-400";
  const dim = size === "sm" ? "h-2 w-2" : "h-2.5 w-2.5";
  return <span className={`inline-block rounded-full ${color} ${dim}`} />;
}

function Avatar({ name, size = "md" }: { name: string | null | undefined; size?: "sm" | "md" }) {
  const dim = size === "sm" ? "h-6 w-6 text-[10px]" : "h-7 w-7 text-[11px]";
  return (
    <span className={`inline-flex ${dim} items-center justify-center rounded-full bg-muted text-muted-foreground font-medium`}>
      {initialsOf(name)}
    </span>
  );
}

function DateCell({
  label, date, customValue, sub,
}: { label: string; date?: string | null; customValue?: string; sub: string }) {
  const cd = date ? dayCountdown(date) : null;
  const toneClass =
    !cd ? "text-foreground/80" :
    cd.tone === "red" ? "text-destructive font-semibold" :
    cd.tone === "yellow" ? "text-amber-400" :
    cd.tone === "muted" ? "text-muted-foreground line-through" :
    "text-foreground/80";

  return (
    <div className="rounded-[10px] border border-border bg-card px-5 py-4">
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-[15px] font-semibold text-foreground">
        {date ? fmtDate(date) : (customValue ?? "—")}
      </div>
      {date ? (
        <div className={`mt-1 text-xs ${toneClass}`}>{cd?.text}</div>
      ) : (
        sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
      )}
    </div>
  );
}

function LeaderCard({ label, person }: { label: string; person: Member | null }) {
  if (!person) {
    return (
      <div className="rounded-[10px] border border-dashed border-border px-4 py-3 text-center">
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
        <div className="mt-2 text-xs text-muted-foreground">Not assigned</div>
        <Link to="/olympus" className="text-[11px] text-primary hover:underline">Assign in Olympus →</Link>
      </div>
    );
  }
  return (
    <div className="rounded-[10px] border border-border bg-card px-4 py-3 flex items-center gap-3">
      <Avatar name={person.name} />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
        <div className="text-[13px] font-semibold truncate">{person.name}</div>
        {person.email && <div className="text-[11px] text-muted-foreground truncate">{person.email}</div>}
      </div>
    </div>
  );
}

// ── Question Map ───────────────────────────────────────
function QuestionMapTable({
  questions, members, meId, onOpenMine, onPeek,
}: {
  questions: Question[];
  members: Member[];
  meId: string | null;
  onOpenMine: (qid: string) => void;
  onPeek: (qid: string) => void;
}) {
  const memberById = useMemo(() => new Map(members.map((m) => [m.user_id, m])), [members]);

  const sorted = useMemo(() => {
    const tier = (h: string | null) => {
      const x = (h ?? "").toLowerCase();
      return x === "red" ? 0 : x === "yellow" ? 1 : 2;
    };
    return [...questions].sort((a, b) => {
      const t = tier(a.health) - tier(b.health);
      if (t !== 0) return t;
      const da = a.pens_down_date ? new Date(a.pens_down_date).getTime() : Infinity;
      const db = b.pens_down_date ? new Date(b.pens_down_date).getTime() : Infinity;
      return da - db;
    });
  }, [questions]);

  if (sorted.length === 0) {
    return (
      <div className="rounded-[10px] border border-dashed border-border p-6 text-sm text-muted-foreground text-center">
        No questions in this mission yet.
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border rounded-[10px] border border-border bg-card overflow-hidden">
      {sorted.map((q) => {
        const tone = ((q.health ?? "yellow").charAt(0).toUpperCase() + (q.health ?? "yellow").slice(1)) as "Red" | "Yellow" | "Green";
        const writer = q.assigned_writer_id ? memberById.get(q.assigned_writer_id) : null;
        const sme = q.assigned_sme_id ? memberById.get(q.assigned_sme_id) : null;
        const isMine = q.assigned_writer_id === meId;
        const cd = q.pens_down_date ? dayCountdown(q.pens_down_date) : null;
        return (
          <li
            key={q.id}
            className={`flex items-center gap-3 px-4 py-3 text-sm hover:bg-white/[0.02] cursor-pointer ${isMine ? "border-l-2 border-l-primary" : ""}`}
            onClick={() => isMine ? onOpenMine(q.id) : onPeek(q.id)}
          >
            <HealthDot tone={tone} size="sm" />
            <span className="font-mono text-xs text-muted-foreground w-12 shrink-0">Q{q.question_number}</span>
            <span className="flex-1 min-w-0 truncate">{q.title}</span>
            {q.section_number && (
              <span className="text-[11px] text-muted-foreground w-20 truncate hidden md:inline">{q.section_number}</span>
            )}
            <span className="text-[11px] text-foreground/70 w-20 truncate hidden md:inline">
              {writer ? firstName(writer.name) : <span className="text-muted-foreground italic">unassigned</span>}
              {isMine && <span className="ml-1 inline-flex items-center rounded bg-primary/20 text-primary px-1 text-[9px] font-bold">YOU</span>}
            </span>
            <span className="text-[11px] text-foreground/60 w-16 truncate hidden lg:inline">
              {sme ? firstName(sme.name) : "—"}
            </span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full border ${statusPillClass(q.status)}`}>
              {(q.status ?? "not_started").replace(/_/g, " ")}
            </span>
            <span className={`text-[11px] tabular-nums w-20 text-right ${cd?.tone === "red" ? "text-destructive font-semibold" : cd?.tone === "yellow" ? "text-amber-400" : "text-muted-foreground"}`}>
              {cd?.text ?? "—"}
            </span>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          </li>
        );
      })}
    </ul>
  );
}

function statusPillClass(s: string | null): string {
  const v = (s ?? "").toLowerCase();
  if (v === "complete" || v === "done") return "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";
  if (v === "in_progress" || v === "active") return "bg-blue-500/10 text-blue-400 border-blue-500/30";
  if (v === "blocked") return "bg-destructive/10 text-destructive border-destructive/30";
  return "bg-muted text-muted-foreground border-border";
}

// ── Drawer ─────────────────────────────────────────────
function QuestionDrawer({
  q, missionId, isMine, writer, sme, onClose,
}: {
  q: Question; missionId: string; isMine: boolean;
  writer: Member | null; sme: Member | null; onClose: () => void;
}) {
  const navigate = useNavigate();
  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <aside
        className="relative w-full max-w-md bg-card border-l border-border shadow-2xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-card border-b border-border px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-mono text-xs text-muted-foreground">Q{q.question_number}</span>
            <span className="text-sm font-semibold truncate">{q.title}</span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="px-5 py-4 space-y-4 text-sm">
          {q.section_number && <div className="text-xs text-muted-foreground">Section {q.section_number}</div>}
          <p className="whitespace-pre-wrap text-foreground/85">{q.question_text}</p>
          {q.requirements && q.requirements.length > 0 && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground mb-1.5">Requirements</div>
              <ul className="list-disc list-inside space-y-1 text-foreground/80">
                {q.requirements.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Writer</div>
              <div className="text-sm mt-1">{writer ? writer.name : <span className="text-muted-foreground italic">unassigned</span>}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">SME</div>
              <div className="text-sm mt-1">{sme ? sme.name : <span className="text-muted-foreground italic">—</span>}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Score</div>
              <div className="text-sm mt-1 tabular-nums">{q.current_score !== null ? Number(q.current_score).toFixed(1) : "—"}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Health</div>
              <div className="text-sm mt-1">{q.health ?? "—"}</div>
            </div>
          </div>
          {q.health_drivers && Object.keys(q.health_drivers).length > 0 && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground mb-1.5">Health drivers</div>
              <ul className="text-xs text-foreground/75 space-y-1">
                {Object.entries(q.health_drivers).map(([k, v]) => (
                  <li key={k}>· {v}</li>
                ))}
              </ul>
            </div>
          )}
          {isMine && (
            <button
              onClick={() => navigate({ to: "/missions/$missionId/questions/$questionId", params: { missionId, questionId: q.id } })}
              className="w-full mt-2 inline-flex items-center justify-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
            >
              Open in Cockpit <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}

// ── Team columns ───────────────────────────────────────
function TeamColumn({
  title, members, questions, roleField,
}: { title: string; members: Member[]; questions: Question[]; roleField: "writer" | "sme" }) {
  const countsByMember = useMemo(() => {
    const m = new Map<string, number>();
    for (const q of questions) {
      const id = roleField === "writer" ? q.assigned_writer_id : q.assigned_sme_id;
      if (id) m.set(id, (m.get(id) ?? 0) + 1);
    }
    return m;
  }, [questions, roleField]);

  return (
    <div className="rounded-[10px] border border-border bg-card overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{title}</div>
      {members.length === 0 ? (
        <div className="p-4 text-sm text-muted-foreground">No members.</div>
      ) : (
        <ul className="divide-y divide-border">
          {members.map((m) => (
            <li key={m.user_id} className="px-4 py-2.5 flex items-center gap-3 text-sm">
              <Avatar name={m.name} />
              <div className="flex-1 min-w-0 truncate">
                <span className="font-medium">{m.name}</span>
                <span className="text-muted-foreground"> · {m.role}</span>
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">
                {countsByMember.get(m.user_id) ?? 0} Q
              </span>
              {m.email && (
                <a href={`mailto:${m.email}`} className="text-muted-foreground hover:text-foreground"><Mail className="h-3.5 w-3.5" /></a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Timeline ───────────────────────────────────────────
function Timeline({ mission, gates }: { mission: any; gates: Gate[] }) {
  const events = useMemo(() => {
    const arr: Array<{ key: string; date: string; name: string; type: "gate" | "qa" | "pens" | "submit" | "start" }> = [];
    for (const g of gates) {
      if (g.target_date) arr.push({ key: g.id, date: g.target_date, name: g.gate_name, type: "gate" });
    }
    if (mission?.qa_deadline) arr.push({ key: "qa", date: mission.qa_deadline, name: "Q&A Deadline", type: "qa" });
    if (mission?.submission_date) arr.push({ key: "submit", date: mission.submission_date, name: "Submission", type: "submit" });
    arr.sort((a, b) => a.date.localeCompare(b.date));
    return arr;
  }, [mission, gates]);

  const today = new Date().toISOString().slice(0, 10);
  const youAreHereIdx = events.findIndex((e) => e.date >= today);

  if (events.length === 0) {
    return (
      <div className="rounded-[10px] border border-dashed border-border p-6 text-sm text-muted-foreground text-center">
        No timeline events scheduled.
      </div>
    );
  }

  return (
    <div className="relative pl-6">
      <div className="absolute left-2 top-0 bottom-0 w-px bg-border" />
      <ul className="space-y-4">
        {events.map((e, i) => {
          const d = daysTo(e.date);
          const complete = d !== null && d < 0;
          const color =
            e.type === "submit" ? "text-blue-400 border-blue-400" :
            e.type === "gate" ? "text-amber-400 border-amber-400" :
            e.type === "pens" ? "text-destructive border-destructive" :
            e.type === "start" ? "text-emerald-400 border-emerald-400" :
            "text-muted-foreground border-border";
          const size = e.type === "submit" ? "h-3.5 w-3.5" : "h-2.5 w-2.5";
          return (
            <li key={e.key} className="relative">
              {youAreHereIdx === i && (
                <div className="absolute -left-6 -top-3 text-[9px] font-bold uppercase tracking-[0.2em] text-primary">
                  ▼ You are here
                </div>
              )}
              <div className={`absolute -left-[18px] top-1 rounded-full border-2 bg-card ${color} ${size}`} />
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className={`text-sm ${e.type === "submit" ? "font-bold text-lg" : "font-medium"}`}>{e.name}</div>
                  <div className="text-xs text-muted-foreground">{fmtDate(e.date)}</div>
                </div>
                <div className={`text-xs tabular-nums ${complete ? "text-muted-foreground line-through" : d !== null && d <= 14 ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
                  {d === null ? "" : complete ? `${Math.abs(d)}d ago` : `${d}d away`}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── Decisions column ──────────────────────────────────
function DecisionsCol({
  decisions, needs, qById, isLeader, onRespond, onDismiss,
}: {
  decisions: Decision[];
  needs: Collab[];
  qById: Map<string, Question>;
  isLeader: boolean;
  onRespond: (need: Collab, text: string) => Promise<unknown>;
  onDismiss: (need: Collab) => Promise<unknown>;
}) {
  const [showResolved, setShowResolved] = useState(false);
  const decisionNeeds = needs.filter((n) => n.entry_type === "decision_needed");
  const resolved = decisions.filter((d) => d.status === "Final" || d.status === "Revisited");

  return (
    <div className="rounded-[10px] border border-border bg-card overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        Open Decisions
      </div>
      {decisionNeeds.length === 0 && decisions.filter((d) => d.status === "Pending").length === 0 ? (
        <div className="p-4 text-sm text-emerald-400/80">No open decisions.</div>
      ) : (
        <ul className="divide-y divide-border">
          {decisionNeeds.map((n) => (
            <DecisionNeedRow
              key={n.id}
              need={n}
              question={n.question_id ? qById.get(n.question_id) ?? null : null}
              isLeader={isLeader}
              onRespond={(text) => onRespond(n, text)}
              onDismiss={() => onDismiss(n)}
            />
          ))}
          {decisions.filter((d) => d.status === "Pending").map((d) => (
            <li key={d.id} className="px-4 py-3 text-sm">
              <div className="font-medium">{d.title}</div>
              {d.rationale && <div className="text-xs text-muted-foreground mt-1">{d.rationale}</div>}
              <div className="text-[11px] text-muted-foreground mt-1">
                {d.owner ?? "—"} · {relativeTime(d.created_at)}
              </div>
            </li>
          ))}
        </ul>
      )}
      {resolved.length > 0 && (
        <div className="border-t border-border">
          <button
            onClick={() => setShowResolved((s) => !s)}
            className="w-full px-4 py-2 text-xs text-muted-foreground hover:text-foreground text-left"
          >
            {showResolved ? "Hide" : "View"} resolved ({resolved.length}) →
          </button>
          {showResolved && (
            <ul className="divide-y divide-border">
              {resolved.map((d) => (
                <li key={d.id} className="px-4 py-2 text-xs text-muted-foreground">
                  <span className="text-foreground/70">{d.title}</span> · {d.status} {d.decided_at && `· ${fmtDate(d.decided_at)}`}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function DecisionNeedRow({
  need, question, isLeader, onRespond, onDismiss,
}: {
  need: Collab;
  question: Question | null;
  isLeader: boolean;
  onRespond: (text: string) => Promise<unknown>;
  onDismiss: () => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  async function send() {
    if (!text.trim()) return;
    setSending(true);
    try {
      await onRespond(text);
      setText("");
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <li className="px-4 py-3 text-sm">
      <div className="flex items-start gap-3">
        <Avatar name={need.author_name} size="sm" />
        <div className="flex-1 min-w-0">
          <div className="text-sm">
            <span className="font-medium">{firstName(need.author_name)}</span>
            <span className="text-muted-foreground"> needs a decision</span>
            {question && <span className="text-muted-foreground"> · Q{question.question_number}</span>}
          </div>
          {need.body && <p className="mt-1 text-xs text-foreground/75">{need.body}</p>}
          <div className="text-[11px] text-muted-foreground mt-1">{relativeTime(need.created_at)}</div>
        </div>
        {isLeader && (
          <button onClick={() => setOpen((o) => !o)} className="text-xs text-primary hover:underline shrink-0">
            Make Decision →
          </button>
        )}
      </div>
      {open && isLeader && (
        <div className="mt-3 ml-9 space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="Your decision and rationale…"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button onClick={send} disabled={sending || !text.trim()} className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50">
              Send Decision
            </button>
            <button onClick={onDismiss} className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground">
              Dismiss
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

// ── Risks column ──────────────────────────────────────
function RisksCol({
  risks, canLog, missionId, qc,
}: { risks: Risk[]; canLog: boolean; missionId: string; qc: ReturnType<typeof useQueryClient> }) {
  const open = risks.filter((r) => r.status === "Open" || r.status === "Monitoring");
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState("");
  const [severity, setSeverity] = useState("Medium");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("mission_risks").insert({
        mission_id: missionId, title: title.trim(), severity, status: "Open",
      });
      if (error) throw error;
      setTitle(""); setShowAdd(false);
      qc.invalidateQueries({ queryKey: ["overview-risks", missionId] });
      toast.success("Risk logged");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-[10px] border border-border bg-card overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Active Risks</span>
        {canLog && (
          <button onClick={() => setShowAdd((s) => !s)} className="text-xs text-primary hover:underline inline-flex items-center gap-1">
            <Plus className="h-3 w-3" /> Log Risk
          </button>
        )}
      </div>
      {showAdd && canLog && (
        <div className="p-3 border-b border-border space-y-2 bg-muted/20">
          <input
            value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="Risk description"
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          />
          <div className="flex items-center gap-2">
            <select value={severity} onChange={(e) => setSeverity(e.target.value)}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-xs">
              <option>Low</option><option>Medium</option><option>High</option>
            </select>
            <button onClick={save} disabled={saving || !title.trim()}
              className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50">Save</button>
            <button onClick={() => setShowAdd(false)} className="text-xs text-muted-foreground">Cancel</button>
          </div>
        </div>
      )}
      {open.length === 0 ? (
        <div className="p-4 text-sm text-emerald-400/80">No active risks.</div>
      ) : (
        <ul className="divide-y divide-border">
          {open.map((r) => (
            <li key={r.id} className="px-4 py-3 text-sm flex items-start gap-3">
              <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${
                r.severity === "High" ? "bg-destructive" : r.severity === "Medium" ? "bg-amber-400" : "bg-muted-foreground"
              }`} />
              <div className="flex-1 min-w-0">
                <div className="font-medium">{r.title}</div>
                {r.description && <div className="text-xs text-muted-foreground mt-0.5">{r.description}</div>}
                <div className="text-[11px] text-muted-foreground mt-1">
                  {r.owner ?? "Unassigned"} · {fmtDate(r.created_at)} · {r.status}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Win themes ────────────────────────────────────────
function WinThemesGrid({ themes, questions }: { themes: WinTheme[]; questions: Question[] }) {
  if (themes.length === 0) {
    return (
      <div className="rounded-[10px] border border-dashed border-border p-6 text-sm text-muted-foreground text-center">
        No win themes defined yet.
      </div>
    );
  }
  const qById = new Map(questions.map((q) => [q.id, q]));
  const total = questions.length || 1;
  return (
    <div className="space-y-4">
      {themes.map((t) => {
        const linked = (t.question_ids ?? []).filter((id) => qById.has(id));
        const coverage = (linked.length / total) * 100;
        const tone = coverage > 80 ? "emerald" : coverage >= 40 ? "amber" : "red";
        const toneCls = tone === "emerald" ? "bg-emerald-400" : tone === "amber" ? "bg-amber-400" : "bg-destructive";
        return (
          <div key={t.id} className="rounded-[12px] border border-border bg-card p-5">
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <h3 className="text-lg font-bold">{t.title}</h3>
              <span className="text-xs text-muted-foreground">{linked.length} of {questions.length} questions</span>
            </div>
            {t.description && <p className="mt-2 text-sm text-foreground/80">{t.description}</p>}
            <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden">
              <div className={`h-full ${toneCls}`} style={{ width: `${Math.min(100, coverage)}%` }} />
            </div>
            {linked.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {linked.slice(0, 12).map((id) => {
                  const q = qById.get(id);
                  return (
                    <span key={id} className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-mono">
                      Q{q?.question_number ?? "?"}
                    </span>
                  );
                })}
                {linked.length > 12 && (
                  <span className="text-[10px] text-muted-foreground">+{linked.length - 12} more</span>
                )}
              </div>
            )}
            {linked.length < 3 && (
              <p className="mt-3 text-xs" style={{ color: "var(--iris, #22d3ee)" }}>
                ● IRIS — {t.title} is underrepresented in the proposal.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── What Changed (preserved from prior version) ───────
function WhatChangedBlock({
  signals, collab, qById, canBroadcast, missionId, meName, meId, onSent,
}: {
  signals: Signal[]; collab: Collab[]; qById: Map<string, Question>;
  canBroadcast: boolean; missionId: string; meName: string; meId: string | null;
  onSent: () => void;
}) {
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  type Item = {
    key: string; created_at: string; authorName: string; questionLabel: string;
    activityLabel: string; body: string | null;
  };
  const items: Item[] = useMemo(() => {
    const out: Item[] = [];
    for (const c of collab) {
      if (c.entry_type === "leadership_guidance") continue;
      const q = c.question_id ? qById.get(c.question_id) : null;
      out.push({
        key: `c-${c.id}`, created_at: c.created_at, authorName: c.author_name,
        questionLabel: q ? `Q${q.question_number}` : "Mission",
        activityLabel: NEED_LABEL[c.entry_type] ?? c.entry_type.replace(/_/g, " "),
        body: c.body,
      });
    }
    for (const s of signals) {
      const q = s.related_question_id ? qById.get(s.related_question_id) : null;
      const label = s.signal_type === "nothing_changed" ? "Checked in"
        : s.signal_type === "decision_needed" ? "Requested decision"
        : s.signal_type === "sme_request" ? "Requested help"
        : s.signal_type === "air_cover" ? "Requested air cover"
        : s.signal_title;
      out.push({
        key: `s-${s.id}`, created_at: s.created_at, authorName: "IRIS",
        questionLabel: q ? `Q${q.question_number}` : "Mission",
        activityLabel: label, body: s.signal_summary,
      });
    }
    out.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return out;
  }, [signals, collab, qById]);

  return (
    <div>
      {canBroadcast && (
        <div className="flex justify-end mb-2 -mt-2">
          <button
            onClick={() => setShowBroadcast(true)}
            className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <Megaphone className="h-3 w-3" /> Broadcast to Team
          </button>
        </div>
      )}
      {items.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-border p-4 text-sm text-muted-foreground">
          No signals today.{" "}
          {canBroadcast && (
            <button onClick={() => setShowBroadcast(true)} className="text-primary hover:underline">
              Remind the team to check in →
            </button>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-[10px] border border-border bg-card">
          {items.map((it) => {
            const isIris = it.authorName === "IRIS";
            return (
              <li key={it.key} className={`px-4 py-3 ${isIris ? "border-l-2 border-l-[color:var(--iris,#22d3ee)] bg-[color:var(--iris,#22d3ee)]/[0.04]" : ""}`}>
                <button onClick={() => setExpanded((cur) => (cur === it.key ? null : it.key))} className="flex w-full items-center gap-3 text-left">
                  {isIris ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--iris,#22d3ee)]">● IRIS</span>
                  ) : (
                    <>
                      <Avatar name={it.authorName} size="sm" />
                      <span className="text-sm font-medium">{firstName(it.authorName)}</span>
                    </>
                  )}
                  <span className="text-xs text-muted-foreground">· {it.questionLabel}</span>
                  <span className="text-xs text-muted-foreground">· {it.activityLabel}</span>
                  <span className="ml-auto text-[11px] text-muted-foreground">{relativeTime(it.created_at)}</span>
                </button>
                {expanded === it.key && it.body && (
                  <p className={`mt-2 text-sm text-foreground/80 whitespace-pre-wrap ${isIris ? "ml-4" : "ml-11"}`}>{it.body}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {showBroadcast && (
        <BroadcastModal
          onClose={() => setShowBroadcast(false)}
          missionId={missionId}
          meName={meName}
          meId={meId}
          onSent={() => { setShowBroadcast(false); onSent(); }}
        />
      )}
    </div>
  );
}

function BroadcastModal({
  onClose, missionId, meName, meId, onSent,
}: { onClose: () => void; missionId: string; meName: string; meId: string | null; onSent: () => void }) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  async function send() {
    if (!text.trim() || !meId) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("broadcasts").insert({
        mission_id: missionId,
        user_id: meId,
        from_name: meName,
        text: text.trim().slice(0, 2000),
      });
      if (error) throw error;
      toast.success("Broadcast sent");
      onSent();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Broadcast to Team</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <textarea
          value={text} onChange={(e) => setText(e.target.value)} rows={5}
          placeholder="Message to the full mission team..."
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <div className="mt-3 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">Cancel</button>
          <button onClick={send} disabled={saving || !text.trim()} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">
            Send Broadcast
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Leadership Notes (preserved) ──────────────────────
function LeadershipNotesBlock({
  notes, canWrite, isLeader, missionId, meName, meId, myRole, writerIds, noteReads, onSaved, onReadsChanged,
}: {
  notes: Note[]; canWrite: boolean; isLeader: boolean; missionId: string;
  meName: string; meId: string | null; myRole: string | null;
  writerIds: string[];
  noteReads: Array<{ note_id: string; user_id: string }>;
  onSaved: () => void;
  onReadsChanged: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const visible = showAll ? notes : notes.slice(0, 3);

  const writerSet = useMemo(() => new Set(writerIds), [writerIds]);
  const seenByNote = useMemo(() => {
    const m: Record<string, Set<string>> = {};
    for (const r of noteReads) {
      if (!writerSet.has(r.user_id)) continue;
      (m[r.note_id] ??= new Set()).add(r.user_id);
    }
    return m;
  }, [noteReads, writerSet]);

  useEffect(() => {
    if (!meId || myRole !== "writer" || notes.length === 0) return;
    const myReadIds = new Set(noteReads.filter((r) => r.user_id === meId).map((r) => r.note_id));
    const newlyVisible = visible.filter((n) => !myReadIds.has(n.id));
    if (newlyVisible.length === 0) return;
    (async () => {
      await supabase.from("note_reads").upsert(
        newlyVisible.map((n) => ({ note_id: n.id, user_id: meId, mission_id: missionId })),
        { onConflict: "note_id,user_id" }
      );
      onReadsChanged();
    })();
  }, [visible, meId, myRole, notes.length]);

  async function save() {
    if (!text.trim() || !meId) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("broadcasts").insert({
        mission_id: missionId, user_id: meId, from_name: meName, text: text.trim().slice(0, 2000),
      });
      if (error) throw error;
      setText(""); setAddOpen(false);
      toast.success("Note posted");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {canWrite && (
        <div className="flex justify-end mb-2 -mt-2">
          <button onClick={() => setAddOpen((o) => !o)} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
            <Plus className="h-3 w-3" /> Add Note
          </button>
        </div>
      )}
      {addOpen && canWrite && (
        <div className="mb-3 rounded-md border border-border bg-muted/20 p-3 space-y-2">
          <textarea
            value={text} onChange={(e) => setText(e.target.value)} rows={3}
            placeholder="Guidance for the team…"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button onClick={save} disabled={saving || !text.trim()} className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50">Post</button>
            <button onClick={() => setAddOpen(false)} className="text-xs text-muted-foreground">Cancel</button>
          </div>
        </div>
      )}
      {notes.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-border p-4 text-sm text-muted-foreground">
          No leadership notes yet.
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-[10px] border border-border bg-card">
          {visible.map((n) => (
            <li key={n.id} className="px-4 py-3 text-sm">
              <div className="flex items-center gap-3">
                <Avatar name={n.from_name} size="sm" />
                <span className="font-medium">{n.from_name}</span>
                <span className="text-xs text-muted-foreground">· {relativeTime(n.created_at)}</span>
                {isLeader && writerIds.length > 0 && (
                  <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Eye className="h-3 w-3" /> {(seenByNote[n.id]?.size ?? 0)} of {writerIds.length}
                  </span>
                )}
              </div>
              <p className="mt-1.5 ml-9 text-foreground/85 whitespace-pre-wrap">{n.text}</p>
            </li>
          ))}
        </ul>
      )}
      {notes.length > 3 && (
        <button onClick={() => setShowAll((s) => !s)} className="mt-2 text-xs text-muted-foreground hover:text-foreground">
          {showAll ? "Show less" : `Show all ${notes.length}`}
        </button>
      )}
    </div>
  );
}
