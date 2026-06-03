import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createSignal } from "@/lib/signals";
import { irisAskQuestion } from "@/lib/iris-ask.functions";
import { generateQuestionCoaching } from "@/lib/iris-question-coaching.functions";
import { openUpdateReality } from "@/components/v2/UpdateRealityModal";
import { SOSButton } from "@/components/v2/SOSButton";
import { IrisCorrectable } from "@/components/v2/IrisCorrectable";
import { ScoreMeOverlay } from "@/components/v2/ScoreMeOverlay";
import { CompliancePanel as ComplianceRequirementsPanel } from "@/components/v2/CompliancePanel";
import { getLastQuestionVisit, markQuestionVisited } from "@/lib/writer-utils";
import { CoPilotInbox } from "@/components/v2/CoPilotInbox";
import { ConfidenceButton, ConfidenceDot } from "@/components/v2/CockpitConfidence";
import { toast } from "sonner";
import { Eye } from "lucide-react";
import {
  Sparkles, Send, RefreshCw, AlertTriangle, MessageSquare, ChevronDown, ChevronUp,
  CheckCircle2, ArrowLeftRight, FileEdit, Lightbulb, Pin, CornerDownLeft, X, LifeBuoy,
} from "lucide-react";

export const Route = createFileRoute(
  "/_authenticated/missions/$missionId/questions/$questionId",
)({
  component: CockpitPage,
});

/* ──────────────────────────── types ──────────────────────────── */

type Q = {
  id: string; mission_id: string; question_number: string; title: string;
  question_text: string; pens_down_date: string | null;
  guidance: string | null; requirements: string[] | null; mandatory_language: string[] | null;
  status: string | null; health: "red" | "yellow" | "green" | null;
  health_drivers: any; assigned_writer_id: string | null; assigned_sme_id: string | null;
  section_number: string | null; page_limit: number | null; evaluation_weight: number | null;
  writer_confidence: "confident" | "uncertain" | "stuck" | null;
};
type Profile = { id: string; display_name: string | null; email: string | null };
type Intel = {
  iris_brief: string | null; state_priorities: string | null;
  procurement_priorities: string | null; competitor_signals: string | null;
  compliance_flags: string[] | null; relevant_research: string[] | null;
  generated_at?: string;
};
type Collab = {
  id: string; entry_type: string; body: string; author_name: string;
  created_at: string; resolved: boolean;
};
type Mission = { id: string; name: string; submission_date: string | null };
type Gate = { id: string; gate_name: string; target_date: string | null };
type WinTheme = { id: string; title: string; question_ids: string[] | null };

/* ──────────────────────────── helpers ──────────────────────────── */

const HEALTH_HEX: Record<string, string> = {
  red: "#ef4444", yellow: "#eab308", green: "#22c55e",
};

function daysUntil(iso: string | null): number | null {
  return iso ? Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000) : null;
}
function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "—";
}
function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function firstName(p?: Profile | null): string {
  if (!p) return "—";
  const n = p.display_name || p.email?.split("@")[0] || "";
  return n.split(" ")[0] || "—";
}

/* ──────────────────────────── page ──────────────────────────── */

function CockpitPage() {
  const { missionId, questionId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  /* current user + role */
  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data: profile } = await supabase
        .from("profiles").select("id,display_name,email").eq("id", user.id).maybeSingle();
      return profile as Profile | null;
    },
  });
  const { data: role } = useQuery({
    queryKey: ["cockpit-role", missionId, me?.id],
    enabled: !!me?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_members").select("role")
        .eq("mission_id", missionId).eq("user_id", me!.id).maybeSingle();
      return (data?.role as string | undefined) ?? null;
    },
  });
  const isSME = role === "sme";

  /* the question */
  const { data: q, isLoading } = useQuery({
    queryKey: ["question", questionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("question_records")
        .select("id,mission_id,question_number,title,question_text,pens_down_date,guidance,requirements,mandatory_language,status,health,health_drivers,assigned_writer_id,assigned_sme_id,section_number,page_limit,evaluation_weight,writer_confidence")
        .eq("id", questionId).maybeSingle();
      if (error) throw error;
      return data as Q | null;
    },
  });

  /* mission + gates for health strip */
  const { data: mission } = useQuery({
    queryKey: ["mission-meta", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("missions").select("id,name,submission_date").eq("id", missionId).maybeSingle();
      return data as Mission | null;
    },
  });
  const { data: gates = [] } = useQuery({
    queryKey: ["mission-gates", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_review_gates")
        .select("id,gate_name,target_date")
        .eq("mission_id", missionId)
        .order("target_date", { ascending: true });
      return (data ?? []) as Gate[];
    },
  });
  const nextGate = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return gates.find((g) => g.target_date && g.target_date >= today) ?? null;
  }, [gates]);

  /* writer's other assigned questions in this mission */
  const { data: myQuestions = [] } = useQuery({
    queryKey: ["cockpit-my-questions", missionId, me?.id, isSME],
    enabled: !!me?.id,
    queryFn: async () => {
      const col = isSME ? "assigned_sme_id" : "assigned_writer_id";
      const { data } = await supabase
        .from("question_records")
        .select("id,question_number,title,pens_down_date,health,writer_confidence")
        .eq("mission_id", missionId).eq(col, me!.id)
        .order("question_number");
      return (data ?? []) as Array<{ id: string; question_number: string; title: string; pens_down_date: string | null; health: string | null; writer_confidence: "confident" | "uncertain" | "stuck" | null }>;
    },
  });

  /* intel — drives morning brief + 2x2 grid */
  const { data: intel, isLoading: intelLoading, refetch: refetchIntel } = useQuery({
    queryKey: ["question-intel", questionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("question_intelligence")
        .select("iris_brief,state_priorities,procurement_priorities,competitor_signals,compliance_flags,relevant_research,generated_at")
        .eq("question_id", questionId)
        .order("generated_at", { ascending: false }).limit(1).maybeSingle();
      return data as Intel | null;
    },
  });
  const coachingFn = useServerFn(generateQuestionCoaching);
  const [coachingPending, setCoachingPending] = useState(false);
  const regenerateCoaching = async (force: boolean) => {
    setCoachingPending(true);
    try {
      await coachingFn({ data: { questionId, force } });
      await refetchIntel();
      if (force) toast.success("IRIS brief refreshed.");
    } catch (e: any) {
      toast.error(e?.message ?? "IRIS refresh failed");
    } finally { setCoachingPending(false); }
  };
  useEffect(() => {
    if (intelLoading || intel || coachingPending) return;
    regenerateCoaching(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intelLoading, intel?.generated_at]);

  /* profiles for writer/SME labels */
  const profileIds = [q?.assigned_writer_id, q?.assigned_sme_id].filter(Boolean) as string[];
  const { data: profiles = [] } = useQuery({
    queryKey: ["question-profiles", profileIds.join(",")],
    enabled: profileIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id,display_name,email").in("id", profileIds);
      return (data ?? []) as Profile[];
    },
  });
  const profById = Object.fromEntries(profiles.map((p) => [p.id, p]));

  /* win themes (chips) */
  const { data: winThemes = [] } = useQuery({
    queryKey: ["mission-winthemes", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("win_themes").select("id,title,question_ids").eq("mission_id", missionId);
      return (data ?? []) as WinTheme[];
    },
  });
  const connectedThemes = winThemes.filter((w) => (w.question_ids ?? []).includes(questionId));

  /* health drivers compact list */
  const drivers = useMemo<string[]>(() => {
    const list: string[] = [];
    if (q?.health_drivers && typeof q.health_drivers === "object") {
      for (const v of Object.values(q.health_drivers)) {
        if (typeof v === "string" && v.trim()) list.push(v);
      }
    }
    return list.slice(0, 4);
  }, [q]);

  /* What Changed feed */
  const { data: collabs = [] } = useQuery({
    queryKey: ["question-collabs", questionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("question_collaboration")
        .select("id,entry_type,body,author_name,created_at,resolved")
        .eq("question_id", questionId)
        .order("created_at", { ascending: false }).limit(30);
      return (data ?? []) as Collab[];
    },
  });
  const { data: amendmentChanges = [] } = useQuery({
    queryKey: ["amendment-changes", questionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("amendment_changes")
        .select("id,description,writer_action_required,acknowledged,created_at,severity")
        .contains("affected_question_ids", [questionId])
        .order("created_at", { ascending: false });
      return (data ?? []) as Array<{ id: string; description: string; writer_action_required: string | null; acknowledged: boolean; created_at: string; severity: string }>;
    },
  });

  /* last visit + mark as visited on mount */
  const lastVisitRef = useRef<number>(0);
  useEffect(() => {
    lastVisitRef.current = getLastQuestionVisit(questionId);
    // mark after we record what was unread
    const t = setTimeout(() => markQuestionVisited(questionId), 500);
    return () => clearTimeout(t);
  }, [questionId]);

  type FeedItem = {
    kind: "sme" | "intel" | "leader" | "conflict" | "amendment" | "leader_reply" | "decision";
    id: string;
    title: string;
    author: string;
    created_at: string;
    body: string;
    ackButton?: { label: string; onClick: () => void } | null;
  };
  const feed: FeedItem[] = useMemo(() => {
    const items: FeedItem[] = [];
    for (const c of collabs) {
      const base = { id: c.id, author: c.author_name, created_at: c.created_at, body: c.body };
      if (c.entry_type === "sme_response" || c.entry_type === "sme_input") {
        items.push({ kind: "sme", title: `${c.author_name} responded`, ...base });
      } else if (c.entry_type === "leadership_note" || c.entry_type === "broadcast") {
        items.push({ kind: "leader", title: `${c.author_name} posted a leadership note`, ...base });
      } else if (c.entry_type === "decision_response") {
        items.push({ kind: "leader_reply", title: `${c.author_name} responded to your decision request`, ...base });
      } else if (c.entry_type === "decision_logged" || c.entry_type === "decision") {
        items.push({ kind: "decision", title: `Decision logged`, ...base });
      } else if (c.entry_type === "alignment_conflict") {
        items.push({ kind: "conflict", title: `IRIS detected an alignment conflict`, ...base });
      }
    }
    for (const a of amendmentChanges) {
      items.push({
        kind: "amendment",
        id: a.id,
        title: `Amendment affects your question`,
        author: "Admin",
        created_at: a.created_at,
        body: `${a.description}${a.writer_action_required ? `\n\nWhat you need to do: ${a.writer_action_required}` : ""}`,
        ackButton: a.acknowledged ? null : {
          label: "Acknowledge",
          onClick: async () => {
            const { data: auth } = await supabase.auth.getUser();
            await supabase.from("amendment_changes")
              .update({ acknowledged: true, acknowledged_at: new Date().toISOString(), acknowledged_by: auth.user?.id ?? null })
              .eq("id", a.id);
            qc.invalidateQueries({ queryKey: ["amendment-changes", questionId] });
          },
        },
      });
    }
    return items.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  }, [collabs, amendmentChanges, qc, questionId]);

  const lastVisitTimeStr = lastVisitRef.current
    ? timeAgo(new Date(lastVisitRef.current).toISOString())
    : "your first visit";

  /* writer + sme */
  const writer = q?.assigned_writer_id ? profById[q.assigned_writer_id] : null;
  const sme = q?.assigned_sme_id ? profById[q.assigned_sme_id] : null;

  /* derived */
  const pdDays = daysUntil(q?.pens_down_date ?? null);
  const gateDays = daysUntil(nextGate?.target_date ?? null);
  const subDays = daysUntil(mission?.submission_date ?? null);
  const healthHex = HEALTH_HEX[q?.health ?? "yellow"];

  /* UI state */
  const [askOpen, setAskOpen] = useState(false);
  const [getHelpOpen, setGetHelpOpen] = useState(false);
  const [scoreMeOpen, setScoreMeOpen] = useState(false);

  /* Ask IRIS */
  const askFn = useServerFn(irisAskQuestion);
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState("");
  const [asking, setAsking] = useState(false);
  const onAsk = async () => {
    if (!prompt.trim()) return;
    setAsking(true); setAnswer("");
    try {
      const r = await askFn({ data: { questionId, prompt: prompt.trim() } });
      setAnswer(r.answer);
    } catch (e: any) {
      setAnswer(`_Error: ${e?.message ?? "unknown"}_`);
    } finally { setAsking(false); }
  };

  if (isLoading) return <div className="px-8 py-12 text-sm text-muted-foreground">Loading…</div>;
  if (!q) {
    return (
      <div className="px-8 py-12 text-sm">
        Response not found.{" "}
        <Link to="/missions/$missionId/questions" params={{ missionId }} className="text-primary hover:underline">Back</Link>
      </div>
    );
  }

  const isLead = role === "admin" || role === "lead";
  const isAssignedWriter = !!me?.id && q.assigned_writer_id === me.id;
  const isAssignedSme = !!me?.id && q.assigned_sme_id === me.id;
  const isReadOnlyView = isLead && !isAssignedWriter && !isAssignedSme;

  return (
    <div style={{ background: "#0a0e1a", minHeight: "100vh" }} className="text-foreground">
      {isReadOnlyView && (
        <div
          className="sticky top-0 z-40 flex h-10 items-center justify-between gap-3 border-b px-10 text-[12px]"
          style={{ background: "rgba(245,158,11,0.15)", borderColor: "rgba(245,158,11,0.4)", color: "#fde68a" }}
        >
          <div className="flex items-center gap-2">
            <Eye className="h-3.5 w-3.5" />
            <span className="font-semibold">VIEWING {firstName(writer).toUpperCase()}'S COCKPIT</span>
            <span className="opacity-80">· Read-only · {firstName(writer)} cannot see you here</span>
          </div>
          <Link
            to="/missions/$missionId/overview"
            params={{ missionId }}
            className="text-[11px] underline-offset-2 hover:underline"
          >
            ← Back to Mission Room
          </Link>
        </div>
      )}
      {/* HEALTH STRIP — persistent */}
      <Link
        to="/missions/$missionId/overview"
        params={{ missionId }}
        className="sticky top-0 z-30 flex h-10 items-center gap-3 border-b border-white/5 bg-[#060b14]/95 px-10 text-[12px] backdrop-blur hover:bg-[#0a1426]/95 transition-colors"
        title="Open Mission Room"
      >
        <span className="relative inline-flex h-2 w-2">
          <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: healthHex, boxShadow: `0 0 8px ${healthHex}` }} />
        </span>
        <span className="text-foreground font-medium truncate">{mission?.name ?? "Mission"}</span>
        <Dot />
        <span className="font-mono text-muted-foreground">Q{q.question_number}</span>
        <span className="text-foreground truncate">{q.title}</span>
        <Dot />
        <PensDownLabel days={pdDays} />
        {nextGate && gateDays !== null && (
          <>
            <Dot />
            <span style={gateDays <= 3 ? { color: "#ef4444" } : gateDays <= 7 ? { color: "#eab308" } : undefined}>
              {nextGate.gate_name} in {gateDays}d
            </span>
          </>
        )}
        {subDays !== null && (
          <>
            <Dot />
            <span className="text-muted-foreground">Submission in {subDays}d</span>
          </>
        )}
      </Link>

      <div className="mx-auto max-w-[960px] px-10 pt-8 pb-40">
        {/* QUESTION SELECTOR — only if multiple */}
        {myQuestions.length > 1 && (
          <div className="mb-6">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              My Questions
            </div>
            <div className="flex flex-wrap gap-2">
              {myQuestions.map((mq) => {
                const active = mq.id === questionId;
                const d = daysUntil(mq.pens_down_date);
                const c = HEALTH_HEX[mq.health ?? "yellow"];
                return (
                  <Link
                    key={mq.id}
                    to="/missions/$missionId/questions/$questionId"
                    params={{ missionId, questionId: mq.id }}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition ${
                      active ? "border-white/20 bg-white/10 text-foreground" : "border-white/10 bg-transparent text-muted-foreground hover:text-foreground hover:border-white/20"
                    }`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: c, boxShadow: `0 0 4px ${c}` }} />
                    <span className="font-mono">Q{mq.question_number}</span>
                    {d !== null && <span className="text-muted-foreground">{d}d</span>}
                    <ConfidenceDot level={mq.writer_confidence ?? null} />
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* BLOCK 1 — IRIS MORNING BRIEF */}
        <section
          className="mb-8 rounded-[12px] border p-6"
          style={{
            background: "radial-gradient(ellipse at 0% 50%, rgba(8,145,178,0.08), rgba(10,14,26,0) 70%)",
            borderColor: "rgba(8,145,178,0.25)",
          }}
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.32em]" style={{ color: "#22d3ee" }}>
              <span className="iris-dot" /> IRIS — Your Morning Brief
            </span>
            <button
              onClick={() => regenerateCoaching(true)}
              disabled={coachingPending}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              {intel?.generated_at && (<span>Updated {timeAgo(intel.generated_at)} · </span>)}
              <RefreshCw className={`h-3 w-3 ${coachingPending ? "animate-spin" : ""}`} /> Refresh
            </button>
          </div>
          {intelLoading || coachingPending ? (
            <div className="iris-loading-text"><span className="iris-dot" /> IRIS is preparing your brief…</div>
          ) : intel?.iris_brief ? (
            <IrisCorrectable
              contentType="morning_brief"
              contentBlock={intel.iris_brief}
              missionId={missionId}
              questionId={questionId}
            >
              <p className="text-[15px] leading-relaxed text-foreground whitespace-pre-wrap pr-8">
                {intel.iris_brief}
              </p>
            </IrisCorrectable>
          ) : (
            <p className="text-sm text-muted-foreground">
              <span className="iris-dot mr-2" /> IRIS is preparing your brief. Intelligence generates once the RFP is parsed.
            </p>
          )}
        </section>

        {/* BLOCK 2 — MY QUESTION + WHAT CHANGED */}
        <section className="mb-8 grid gap-6 md:grid-cols-[40fr_60fr]">
          {/* LEFT — MY QUESTION */}
          <div className="space-y-5 rounded-[12px] border border-white/5 bg-white/[0.02] p-6">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">My Question</div>
              <h1 className="mt-2 text-[20px] font-bold leading-tight">
                Q{q.question_number} — {q.title}
              </h1>
              <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                {q.section_number && <span>Section {q.section_number}</span>}
                {q.section_number && q.page_limit && <Dot />}
                {q.page_limit && <span>{q.page_limit} pages</span>}
                {(q.section_number || q.page_limit) && q.evaluation_weight && <Dot />}
                {q.evaluation_weight && <span>{q.evaluation_weight}% weight</span>}
              </div>
            </div>

            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Pens Down</div>
              <div
                className="mt-1 text-[32px] font-bold leading-none"
                style={{
                  color: pdDays !== null && pdDays < 7 ? "#ef4444" : pdDays !== null && pdDays <= 14 ? "#eab308" : "var(--foreground)",
                }}
              >
                {pdDays !== null ? (pdDays < 0 ? `${Math.abs(pdDays)}d overdue` : `${pdDays} DAYS`) : "—"}
              </div>
              <div className="mt-1 text-[12px] text-muted-foreground">{fmtDate(q.pens_down_date)}</div>
            </div>

            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Scoring Target</div>
              <div className="mt-1 text-[10px] text-muted-foreground/70">What does a 5 look like?</div>
              {q.guidance ? (
                <IrisCorrectable
                  contentType="question_brief"
                  contentBlock={q.guidance}
                  missionId={missionId}
                  questionId={questionId}
                >
                  <div className="mt-2 text-sm leading-relaxed whitespace-pre-wrap pr-8">{q.guidance}</div>
                </IrisCorrectable>
              ) : q.requirements && q.requirements.length > 0 ? (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                  {q.requirements.slice(0, 5).map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              ) : (
                <div className="mt-2 text-sm text-muted-foreground italic">No scoring target captured yet.</div>
              )}
              {q.mandatory_language && q.mandatory_language.length > 0 && (
                <div className="mt-3 border-l-2 px-3 py-2 text-xs" style={{ borderColor: "#eab308", background: "rgba(234,179,8,0.05)", color: "#fde68a" }}>
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider">Required language</span>
                  {q.mandatory_language.join(" — ")}
                </div>
              )}
            </div>

            {!isSME && (q.health === "red" || q.health === "yellow") && drivers.length > 0 && (
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Health Drivers</div>
                <ul className="mt-2 space-y-1.5">
                  {drivers.map((d, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs" style={{ color: q.health === "red" ? "#fca5a5" : "#fde68a" }}>
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /><span>{d}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {connectedThemes.length > 0 && (
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Win Themes</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {connectedThemes.map((w) => (
                    <span key={w.id} className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                      {w.title}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="border-t border-white/5 pt-3 text-[11px] text-muted-foreground">
              Writer: <span className="text-foreground">{firstName(writer)}</span>
              {sme && <> · SME: <span className="text-foreground">{firstName(sme)}</span></>}
            </div>
          </div>

          {/* RIGHT — WHAT CHANGED */}
          <div className="rounded-[12px] border border-white/5 bg-white/[0.02] p-6">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">What Changed</div>
            <div className="mb-4 text-[11px] text-muted-foreground/70">Since your last visit · {lastVisitTimeStr}</div>

            <CoPilotInbox missionId={missionId} questionId={questionId} currentUserId={me?.id ?? null} />

            {feed.length === 0 ? (
              <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm" style={{ color: "#86efac" }}>
                <span className="iris-dot mr-2" /> Nothing new since your last visit. You're current. Go write.
              </div>
            ) : (
              <ul className="space-y-1">
                {feed.map((item) => (
                  <FeedRow
                    key={`${item.kind}-${item.id}`}
                    item={item}
                    unread={+new Date(item.created_at) > lastVisitRef.current}
                  />
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* BLOCK 3 — IRIS INTELLIGENCE */}
        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <span className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.32em]" style={{ color: "#22d3ee" }}>
              <span className="iris-dot" /> IRIS Intelligence for This Question
            </span>
            <span className="text-[11px] text-muted-foreground">
              {(intel?.relevant_research?.length ?? 0)} sources
              {intel?.generated_at && <> · Updated {timeAgo(intel.generated_at)}</>}
            </span>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <IntelPanel
              label="State Priority"
              content={intel?.state_priorities}
              sourceCount={intel?.relevant_research?.length ?? 0}
              missionId={missionId} questionId={questionId}
            />
            <IntelPanel
              label="Procurement Signal"
              content={intel?.procurement_priorities}
              sourceCount={intel?.relevant_research?.length ?? 0}
              missionId={missionId} questionId={questionId}
            />
            <IntelPanel
              label="Differentiation"
              content={intel?.competitor_signals}
              sourceCount={intel?.relevant_research?.length ?? 0}
              missionId={missionId} questionId={questionId}
            />
            <CompliancePanel
              flags={intel?.compliance_flags ?? null}
              missionId={missionId} questionId={questionId}
            />
          </div>
        </section>

        {/* BLOCK 3.5 — COMPLIANCE REQUIREMENTS (Model Contract + State + Federal) */}
        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <span className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.32em]" style={{ color: "#22d3ee" }}>
              <span className="iris-dot" /> Compliance Check
            </span>
            <span className="text-[11px] text-muted-foreground">Model Contract · State Regs · Federal</span>
          </div>
          <ComplianceRequirementsPanel questionId={questionId} />
        </section>
      </div>

      {/* FIXED ACTION BAR */}
      <div
        className="fixed inset-x-0 bottom-[58px] md:bottom-0 z-40 border-t"
        style={{ background: "rgba(6,11,20,0.95)", backdropFilter: "blur(12px)", borderColor: "rgba(255,255,255,0.06)" }}
      >
        <div className="mx-auto grid grid-cols-2 gap-2 p-3 md:flex md:h-16 md:max-w-[1100px] md:items-center md:justify-between md:gap-3 md:p-0 md:px-10">
          {/* LEFT */}
          <div className="flex items-center gap-2">
            {isReadOnlyView ? (
              <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                Read-only — actions disabled
              </span>
            ) : isSME ? (
              <button
                onClick={() => openUpdateReality(questionId)}
                className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                Submit SME Input
              </button>
            ) : (
              <button
                onClick={() => openUpdateReality(questionId)}
                className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                Update Reality
              </button>
            )}
            {!isReadOnlyView && (
              <button
                onClick={() => setAskOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-transparent px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/10"
              >
                <Sparkles className="h-3.5 w-3.5" /> Ask IRIS
              </button>
            )}
            {!isSME && !isReadOnlyView && (
              <button
                onClick={() => setScoreMeOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold text-white transition"
                style={{ background: "var(--iris, #22d3ee)", boxShadow: "0 4px 14px -4px rgba(34,211,238,0.5)" }}
              >
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-white/90" /> Score Me
              </button>
            )}
          </div>

          {/* CENTER status */}
          <div className="hidden items-center gap-2 text-[12px] text-muted-foreground md:flex">
            <span className="h-2 w-2 rounded-full" style={{ background: healthHex, boxShadow: `0 0 6px ${healthHex}` }} />
            <span className="font-mono">Q{q.question_number}</span>
            <Dot />
            <PensDownLabel days={pdDays} compact />
          </div>

          {/* RIGHT */}
          <div className="flex items-center gap-2">
            {!isSME && !isReadOnlyView && (
              <ConfidenceButton
                questionId={questionId}
                questionNumber={q.question_number}
                currentLevel={q.writer_confidence ?? null}
                onStuckEscalate={() => setGetHelpOpen(true)}
              />
            )}
            {!isSME && !isReadOnlyView && (
              <GetHelpDropdown
                open={getHelpOpen} setOpen={setGetHelpOpen}
                missionId={missionId} questionId={questionId} questionNumber={q.question_number}
                meId={me?.id ?? null} meName={firstName(me)}
                onSent={() => qc.invalidateQueries({ queryKey: ["question-collabs", questionId] })}
              />
            )}
            {!isSME && !isReadOnlyView && <SOSButton missionId={missionId} questionId={questionId} />}
          </div>
        </div>
      </div>

      {/* ASK IRIS DRAWER */}
      {askOpen && (
        <AskDrawer onClose={() => setAskOpen(false)}>
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                value={prompt} onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") onAsk(); }}
                placeholder="Ask IRIS anything about this question…"
                autoFocus
                className="iris-input flex-1 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm placeholder:text-muted-foreground/60"
              />
              <button
                onClick={onAsk} disabled={asking || !prompt.trim()}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" /> {asking ? "…" : "Send"}
              </button>
            </div>
            {(asking || answer) && (
              <div className="iris-panel rounded-r-md px-4 py-3 text-sm">
                <div className="mb-2"><span className="iris-label"><span className="iris-dot" />IRIS</span></div>
                {asking ? (
                  <div className="iris-loading-text"><span className="iris-dot" /> IRIS is thinking…</div>
                ) : (
                  <IrisCorrectable
                    contentType="ask_iris"
                    contentBlock={answer}
                    missionId={missionId}
                    questionId={questionId}
                  >
                    <div className="whitespace-pre-wrap text-foreground pr-8">{answer}</div>
                  </IrisCorrectable>
                )}
              </div>
            )}
          </div>
        </AskDrawer>
      )}

      <ScoreMeOverlay
        open={scoreMeOpen}
        onClose={() => setScoreMeOpen(false)}
        missionId={missionId}
        lockedQuestionId={questionId}
      />
    </div>
  );
}

/* ──────────────────────────── sub-components ──────────────────────────── */

function Dot() {
  return <span className="text-muted-foreground/40">·</span>;
}

function PensDownLabel({ days, compact }: { days: number | null; compact?: boolean }) {
  if (days === null) return <span className="text-muted-foreground">—</span>;
  const color = days < 7 ? "#ef4444" : days <= 14 ? "#eab308" : undefined;
  const bold = days < 7;
  return (
    <span style={color ? { color, fontWeight: bold ? 600 : undefined } : { color: "var(--muted-foreground)" }}>
      {days < 0 ? `${Math.abs(days)}d overdue` : compact ? `${days}d to Pens Down` : `${days} days to Pens Down`}
    </span>
  );
}

function FeedRow({
  item,
  unread,
}: {
  item: {
    kind: "sme" | "intel" | "leader" | "conflict" | "amendment" | "leader_reply" | "decision";
    id: string; title: string; author: string; created_at: string; body: string;
    ackButton?: { label: string; onClick: () => void } | null;
  };
  unread: boolean;
}) {
  const [open, setOpen] = useState(false);
  const meta: Record<string, { icon: any; color: string }> = {
    sme: { icon: MessageSquare, color: "#22c55e" },
    intel: { icon: Sparkles, color: "#22d3ee" },
    leader: { icon: Pin, color: "#f59e0b" },
    conflict: { icon: AlertTriangle, color: "#ef4444" },
    amendment: { icon: FileEdit, color: "#f59e0b" },
    leader_reply: { icon: CornerDownLeft, color: "#3b82f6" },
    decision: { icon: CheckCircle2, color: "#a855f7" },
  };
  const m = meta[item.kind];
  const Icon = m.icon;
  return (
    <li>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-[13px] transition hover:bg-white/[0.04] ${unread ? "text-foreground" : "text-muted-foreground"}`}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: m.color }} />
        <span className="flex-1 truncate">{item.title}</span>
        <span className="text-[11px] text-muted-foreground/70 shrink-0">
          {item.author} · {timeAgo(item.created_at)}
        </span>
        {open ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
      </button>
      {open && (
        <div className="ml-7 mr-2 mt-1 mb-2 rounded-md border border-white/5 bg-black/20 px-3 py-2.5 text-[13px] leading-relaxed text-foreground whitespace-pre-wrap">
          {item.body}
          {item.ackButton && (
            <div className="mt-2">
              <button
                onClick={() => item.ackButton!.onClick()}
                className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-300 hover:bg-amber-500/20"
              >
                {item.ackButton.label} →
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

/** Hard cap an insight to N sentences for the writer-facing Cockpit. */
function clampSentences(text: string, max: number): { clipped: string; truncated: boolean } {
  if (!text) return { clipped: "", truncated: false };
  const parts = text.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) ?? [text];
  if (parts.length <= max) return { clipped: text.trim(), truncated: false };
  return { clipped: parts.slice(0, max).join("").trim(), truncated: true };
}

function IntelPanel({
  label, content, sourceCount, missionId, questionId,
}: { label: string; content: string | null | undefined; sourceCount: number; missionId: string; questionId: string }) {
  const [expanded, setExpanded] = useState(false);
  const raw = (content ?? "").trim();
  // Cockpit discipline: hard cap at 4 sentences per insight at render time.
  const { clipped, truncated } = clampSentences(raw, 4);
  const display = expanded ? raw : clipped;
  const confidence: "High" | "Lower" = sourceCount >= 2 ? "High" : "Lower";
  const confColor = confidence === "High" ? "#22c55e" : "#eab308";

  return (
    <div className="iris-panel rounded-r-[10px] p-4 relative">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em]" style={{ color: "#22d3ee" }}>
        {label}
      </div>
      {raw ? (
        <IrisCorrectable
          contentType="question_brief"
          contentBlock={raw}
          missionId={missionId}
          questionId={questionId}
        >
          <p className="text-[13px] leading-relaxed text-foreground whitespace-pre-wrap pr-8">{display}</p>
        </IrisCorrectable>
      ) : (
        <p className="text-[13px] text-muted-foreground italic">No intelligence yet.</p>
      )}
      {raw && (
        <div className="mt-3 flex items-center justify-between text-[11px]">
          <span style={{ color: confColor }}>
            {confidence === "High"
              ? `● High confidence · ${sourceCount} source${sourceCount === 1 ? "" : "s"}`
              : "⚠ IRIS inference — verify before citing"}
          </span>
          {truncated && (
            <button onClick={() => setExpanded((e) => !e)} className="text-muted-foreground hover:text-foreground">
              {expanded ? "Show less ↑" : "View full intelligence ↓"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function CompliancePanel({
  flags, missionId, questionId,
}: { flags: string[] | null; missionId: string; questionId: string }) {
  // Cockpit discipline: writers see ONE compliance note max — the most critical.
  // Additional notes live in the Source Library / Compliance Check section below.
  const all = flags ?? [];
  const has = all.length > 0;
  const primary = has ? all[0] : null;
  const extraCount = Math.max(0, all.length - 1);

  return (
    <div
      className="rounded-[10px] p-4 relative"
      style={{
        background: "rgba(245,158,11,0.04)",
        borderLeft: `3px solid ${has ? "#eab308" : "rgba(255,255,255,0.08)"}`,
      }}
    >
      <div className="mb-2 inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em]" style={{ color: has ? "#fbbf24" : "var(--muted-foreground)" }}>
        {has && <AlertTriangle className="h-3 w-3" />}
        {has ? "⚠ Required" : "Past Performance"}
      </div>
      {primary ? (
        <IrisCorrectable
          contentType="question_brief"
          contentBlock={primary}
          missionId={missionId}
          questionId={questionId}
        >
          <p className="text-[13px] leading-relaxed pr-8" style={{ color: "#fde68a" }}>
            {primary}
          </p>
        </IrisCorrectable>
      ) : (
        <p className="text-[13px] text-muted-foreground italic">
          No past-performance match yet. Athena's wins on similar questions will surface here once IRIS Memory has examples.
        </p>
      )}
      {extraCount > 0 && (
        <div className="mt-3 text-[11px] text-muted-foreground">
          +{extraCount} more compliance note{extraCount === 1 ? "" : "s"} available in the Compliance Check section below.
        </div>
      )}
    </div>
  );
}

function GetHelpDropdown({
  open, setOpen, missionId, questionId, questionNumber, meId, meName, onSent,
}: {
  open: boolean; setOpen: (b: boolean) => void;
  missionId: string; questionId: string; questionNumber: string;
  meId: string | null; meName: string;
  onSent: () => void;
}) {
  const qc = useQueryClient();
  const [activeType, setActiveType] = useState<null | "direction" | "decision" | "sme" | "review">(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const TYPES = {
    direction: { label: "Direction Needed", desc: "I need strategic guidance", routeTo: "Engagement Lead", color: "#3b82f6" },
    decision: { label: "Decision Needed", desc: "I need a decision made", routeTo: "Engagement Lead", color: "#a855f7" },
    sme: { label: "SME Input Needed", desc: "I need domain expertise", routeTo: "SME + PM", color: "#f59e0b" },
    review: { label: "Review Needed", desc: "I need someone to review my draft", routeTo: "Lead / Reviewer", color: "#22c55e" },
  } as const;

  const submit = async () => {
    if (!activeType || !meId) return;
    setSending(true);
    try {
      const entryType =
        activeType === "decision" ? "decision_needed" :
        activeType === "sme" ? "sme_request" :
        activeType === "review" ? "review_request" : "direction_request";
      const { error } = await supabase.from("question_collaboration").insert({
        question_id: questionId, mission_id: missionId,
        author_id: meId, author_name: meName,
        entry_type: entryType, body: body.trim() || "(no detail provided)",
      });
      if (error) throw error;
      await createSignal({
        mission_id: missionId, source_module: "cockpit",
        signal_type: activeType === "decision" ? "decision_needed" : "comment_added",
        signal_title: `${TYPES[activeType].label} · Q${questionNumber}`,
        signal_summary: body.trim() || TYPES[activeType].desc,
        severity: activeType === "decision" ? "critical" : "warning",
        related_question_id: questionId,
      }, qc);
      toast.success(`Sent to ${TYPES[activeType].routeTo}.`);
      setOpen(false); setActiveType(null); setBody("");
      onSent();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to send");
    } finally { setSending(false); }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:border-white/20"
      >
        <Lightbulb className="h-3.5 w-3.5" /> Get Help <ChevronUp className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute bottom-full right-0 mb-2 w-[340px] rounded-lg border border-white/10 bg-[#0a0e1a] p-3 shadow-2xl">
          {!activeType ? (
            <div className="space-y-1.5">
              {(Object.keys(TYPES) as Array<keyof typeof TYPES>).map((k) => {
                const t = TYPES[k];
                return (
                  <button
                    key={k}
                    onClick={() => setActiveType(k)}
                    className="block w-full rounded-md border border-white/5 bg-white/[0.02] p-3 text-left hover:bg-white/[0.06] transition"
                  >
                    <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: t.color }}>
                      {t.label}
                    </div>
                    <div className="mt-0.5 text-[12px] text-muted-foreground">"{t.desc}"</div>
                    <div className="mt-1 text-[10px] text-muted-foreground/60">→ Routes to {t.routeTo}</div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: TYPES[activeType].color }}>
                  {TYPES[activeType].label}
                </div>
                <button onClick={() => setActiveType(null)} className="text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>
              </div>
              <textarea
                value={body} onChange={(e) => setBody(e.target.value.slice(0, 500))}
                placeholder="Add context (optional)…"
                rows={4}
                className="w-full rounded-md border border-white/10 bg-white/[0.03] px-2 py-1.5 text-xs"
                autoFocus
              />
              <button
                onClick={submit} disabled={sending}
                className="w-full rounded-md bg-primary py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {sending ? "Sending…" : `Send to ${TYPES[activeType].routeTo}`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AskDrawer({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60" onClick={onClose} />
      <div className="fixed right-0 top-0 z-50 h-full w-full max-w-md overflow-y-auto border-l border-white/10 bg-[#0a0e1a] p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.32em]" style={{ color: "#22d3ee" }}>
            <span className="iris-dot" /> Ask IRIS
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        {children}
      </div>
    </>
  );
}
