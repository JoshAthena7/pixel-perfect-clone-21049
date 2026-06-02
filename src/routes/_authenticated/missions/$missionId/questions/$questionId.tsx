import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createSignal } from "@/lib/signals";
import { irisAskQuestion } from "@/lib/iris-ask.functions";
import { generateQuestionCoaching } from "@/lib/iris-question-coaching.functions";
import { openUpdateReality } from "@/components/v2/UpdateRealityModal";
import { toast } from "sonner";
import { ArrowLeft, Sparkles, Send, ChevronDown, ChevronRight, X, MessageSquare, AlertTriangle, Flag, RefreshCw } from "lucide-react";


export const Route = createFileRoute(
  "/_authenticated/missions/$missionId/questions/$questionId",
)({
  component: ResponseView,
});

type Q = {
  id: string;
  mission_id: string;
  question_number: string;
  title: string;
  question_text: string;
  pens_down_date: string | null;
  current_focus: string | null;
  next_step: string | null;
  waiting_on: string | null;
  guidance: string | null;
  requirements: string[] | null;
  mandatory_language: string[] | null;
  status: string | null;
  health: "red" | "yellow" | "green" | null;
  current_score: number | null;
  health_drivers: any;
  assigned_writer_id: string | null;
  assigned_sme_id: string | null;
};

type Gate = { id: string; gate_name: string; target_date: string | null };
type WinTheme = { id: string; title: string; question_ids: string[] | null };
type Profile = { id: string; display_name: string | null; email: string | null };
type Rel = { related_question_id: string; relationship_type: string; conflict_detected: boolean; conflict_description: string | null };
type RelatedQ = { id: string; question_number: string; title: string };
type Intel = {
  iris_brief: string | null;
  state_priorities: string | null;
  procurement_priorities: string | null;
  competitor_signals: string | null;
  compliance_flags: string[] | null;
};
type Collab = { id: string; entry_type: string; body: string; author_name: string; created_at: string; resolved: boolean };
type GateStatus = { gate_id: string; status: string; reviewer_notes: string | null };
type Score = { score: number; score_type: string; scored_at: string; review_notes: string | null };

const HEALTH_DOT: Record<string, string> = {
  red: "bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.7)]",
  yellow: "bg-yellow-500 shadow-[0_0_12px_rgba(234,179,8,0.6)]",
  green: "bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.6)]",
};

function firstName(p?: Profile | null): string {
  if (!p) return "Unassigned";
  const n = p.display_name || p.email?.split("@")[0] || "";
  return n.split(" ")[0] || "—";
}

function daysUntil(iso: string | null): number | null {
  return iso ? Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000) : null;
}

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—";
}

type NeedType = "direction" | "decision" | "help" | "air_cover";
type Choice = null | "learned" | "need" | "unchanged";

const NEED_COLORS: Record<NeedType, { bg: string; border: string; text: string; label: string }> = {
  direction: { bg: "rgba(59,130,246,0.15)", border: "#3b82f6", text: "#60a5fa", label: "NEED DIRECTION" },
  decision: { bg: "rgba(168,85,247,0.15)", border: "#a855f7", text: "#c084fc", label: "NEED DECISION" },
  help: { bg: "rgba(245,158,11,0.15)", border: "#f59e0b", text: "#fbbf24", label: "NEED HELP" },
  air_cover: { bg: "rgba(239,68,68,0.15)", border: "#ef4444", text: "#f87171", label: "NEED AIR COVER" },
};

function ResponseView() {
  const { missionId, questionId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: q, isLoading } = useQuery({
    queryKey: ["question", questionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("question_records")
        .select("id,mission_id,question_number,title,question_text,pens_down_date,current_focus,next_step,waiting_on,guidance,requirements,mandatory_language,status,health,current_score,health_drivers,assigned_writer_id,assigned_sme_id")
        .eq("id", questionId)
        .maybeSingle();
      if (error) throw error;
      return data as Q | null;
    },
  });

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

  const { data: gates = [] } = useQuery({
    queryKey: ["mission-gates", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_review_gates")
        .select("id,gate_name,target_date")
        .eq("mission_id", missionId)
        .order("gate_order");
      return (data ?? []) as Gate[];
    },
  });

  const { data: winThemes = [] } = useQuery({
    queryKey: ["mission-winthemes", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("win_themes")
        .select("id,title,question_ids")
        .eq("mission_id", missionId);
      return (data ?? []) as WinTheme[];
    },
  });
  const connectedThemes = winThemes.filter((w) => (w.question_ids ?? []).includes(questionId));

  const { data: relations = [] } = useQuery({
    queryKey: ["question-relations", questionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("question_relationships")
        .select("related_question_id,relationship_type,conflict_detected,conflict_description")
        .eq("question_id", questionId);
      return (data ?? []) as Rel[];
    },
  });
  const relatedIds = relations.map((r) => r.related_question_id);
  const { data: relatedQs = [] } = useQuery({
    queryKey: ["related-q-records", relatedIds.join(",")],
    enabled: relatedIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("question_records")
        .select("id,question_number,title")
        .in("id", relatedIds);
      return (data ?? []) as RelatedQ[];
    },
  });
  const relById = Object.fromEntries(relatedQs.map((r) => [r.id, r]));

  const { data: intel, isLoading: intelLoading, refetch: refetchIntel } = useQuery({
    queryKey: ["question-intel", questionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("question_intelligence")
        .select("iris_brief,state_priorities,procurement_priorities,competitor_signals,compliance_flags,generated_at")
        .eq("question_id", questionId)
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as (Intel & { generated_at?: string }) | null;
    },
  });

  const coachingFn = useServerFn(generateQuestionCoaching);
  const [coachingPending, setCoachingPending] = useState(false);
  const regenerateCoaching = async (force: boolean) => {
    setCoachingPending(true);
    try {
      await coachingFn({ data: { questionId, force } });
      await refetchIntel();
    } catch (e: any) {
      toast.error(e?.message ?? "IRIS coaching failed");
    } finally {
      setCoachingPending(false);
    }
  };
  // Auto-generate on first view if no intel exists yet.
  useEffect(() => {
    if (intelLoading) return;
    if (intel) return;
    if (coachingPending) return;
    regenerateCoaching(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intelLoading, intel?.generated_at]);



  const { data: collabs = [] } = useQuery({
    queryKey: ["question-collabs", questionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("question_collaboration")
        .select("id,entry_type,body,author_name,created_at,resolved")
        .eq("question_id", questionId)
        .order("created_at", { ascending: false });
      return (data ?? []) as Collab[];
    },
  });
  const openCollabs = collabs.filter(
    (c) => !c.resolved && (c.entry_type === "sme_request" || c.entry_type === "decision_needed"),
  );

  const { data: gateStatuses = [] } = useQuery({
    queryKey: ["question-gate-status", questionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("question_gate_status")
        .select("gate_id,status,reviewer_notes")
        .eq("question_id", questionId);
      return (data ?? []) as GateStatus[];
    },
  });

  const { data: scoreHistory = [] } = useQuery({
    queryKey: ["question-scores", questionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("question_scores")
        .select("score,score_type,scored_at,review_notes")
        .eq("question_id", questionId)
        .order("scored_at", { ascending: true });
      return (data ?? []) as Score[];
    },
  });

  // Derived
  const writer = q?.assigned_writer_id ? profById[q.assigned_writer_id] : null;
  const sme = q?.assigned_sme_id ? profById[q.assigned_sme_id] : null;
  const dueDays = daysUntil(q?.pens_down_date ?? null);
  const urgentDate = dueDays !== null && dueDays <= 7 && q?.health !== "green";

  const drivers = useMemo<string[]>(() => {
    const list: string[] = [];
    if (q?.health_drivers && typeof q.health_drivers === "object") {
      for (const v of Object.values(q.health_drivers)) {
        if (typeof v === "string" && v.trim()) list.push(v);
      }
    }
    if (q?.waiting_on) list.push(q.waiting_on);
    const conflictRel = relations.find((r) => r.conflict_detected);
    if (conflictRel) {
      const rq = relById[conflictRel.related_question_id];
      list.push(`Alignment conflict with Q${rq?.question_number ?? "?"}`);
    }
    return list.slice(0, 2);
  }, [q, relations, relById]);

  // UI state
  const [scoreOpen, setScoreOpen] = useState(false);
  const [collabExpanded, setCollabExpanded] = useState(false);
  const [realityOpen, setRealityOpen] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [flagOpen, setFlagOpen] = useState(false);

  // Update Reality state
  const [choice, setChoice] = useState<Choice>(null);
  const [needType, setNeedType] = useState<NeedType | null>(null);
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submitUpdate = useMutation({
    mutationFn: async () => {
      if (!choice || !q) return;
      setSubmitting(true);
      const { data: auth } = await supabase.auth.getUser();
      const user = auth.user;
      if (!user) throw new Error("Not signed in");
      const { data: profile } = await supabase.from("profiles").select("display_name,email").eq("id", user.id).maybeSingle();
      const name = profile?.display_name || profile?.email?.split("@")[0] || "Unknown";
      const { error } = await supabase.from("reality_updates").insert({
        question_id: questionId, mission_id: missionId, user_id: user.id, user_name: name,
        signal_type: choice, need_type: choice === "need" ? needType : null,
        details: details.trim() || null,
      });
      if (error) throw error;
      const severity =
        choice === "need" && (needType === "air_cover" || needType === "decision") ? "critical"
        : choice === "need" ? "warning" : "info";
      const titleMap: Record<string, string> = {
        learned: "Writer learned something",
        need: needType ? NEED_COLORS[needType].label : "Writer needs something",
        unchanged: "Status check — no change",
      };
      await createSignal({
        mission_id: missionId, source_module: "response_view",
        signal_type: choice === "need" ? "decision_needed" : "comment_added",
        signal_title: `${titleMap[choice]} · ${q.question_number}`,
        signal_summary: details.trim() || q.title,
        severity, related_question_id: questionId,
      }, qc);
    },
    onSuccess: () => {
      toast.success("Signal sent.");
      setChoice(null); setNeedType(null); setDetails(""); setSubmitting(false); setRealityOpen(false);
      qc.invalidateQueries({ queryKey: ["mission-reality-latest", missionId] });
    },
    onError: (e: Error) => { toast.error(e.message); setSubmitting(false); },
  });

  // Ask IRIS
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

  // Flag / escalate
  const [flagType, setFlagType] = useState<"decision_needed" | "sme_request" | "air_cover" | null>(null);
  const [flagBody, setFlagBody] = useState("");
  const flagSubmit = useMutation({
    mutationFn: async () => {
      if (!flagType) return;
      const { data: auth } = await supabase.auth.getUser();
      const user = auth.user;
      if (!user) throw new Error("Not signed in");
      const { data: profile } = await supabase.from("profiles").select("display_name,email").eq("id", user.id).maybeSingle();
      const name = profile?.display_name || profile?.email?.split("@")[0] || "Unknown";
      const entryType = flagType === "air_cover" ? "decision_needed" : flagType;
      const { error } = await supabase.from("question_collaboration").insert({
        question_id: questionId, mission_id: missionId, author_id: user.id, author_name: name,
        entry_type: entryType, body: flagBody.trim() || "(no context provided)",
      });
      if (error) throw error;
      await createSignal({
        mission_id: missionId, source_module: "response_view",
        signal_type: "decision_needed",
        signal_title: `${flagType === "decision_needed" ? "Decision needed" : flagType === "sme_request" ? "Need help" : "Need air cover"} · ${q?.question_number}`,
        signal_summary: flagBody.trim() || q?.title || "",
        severity: flagType === "air_cover" ? "critical" : "warning",
        related_question_id: questionId,
      }, qc);
    },
    onSuccess: () => {
      toast.success("Flagged to Overview.");
      setFlagOpen(false); setFlagType(null); setFlagBody("");
      qc.invalidateQueries({ queryKey: ["question-collabs", questionId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Escape to return
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inField = !!(e.target as HTMLElement)?.closest("textarea,input,select,[contenteditable='true']");
      if (e.key === "Escape" && !inField && !realityOpen && !askOpen && !flagOpen) {
        navigate({ to: "/missions/$missionId/questions", params: { missionId } });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, missionId, realityOpen, askOpen, flagOpen]);

  if (isLoading) return <div className="px-8 py-12 text-sm text-muted-foreground">Loading…</div>;
  if (!q) {
    return (
      <div className="px-8 py-12 text-sm">
        Response not found.{" "}
        <Link to="/missions/$missionId/questions" params={{ missionId }} className="text-primary hover:underline">Back</Link>
      </div>
    );
  }

  const hasIntel = !!(intel && (intel.state_priorities || intel.procurement_priorities || intel.competitor_signals || intel.iris_brief));
  const trendArrow = scoreHistory.length >= 2
    ? scoreHistory[scoreHistory.length - 1].score > scoreHistory[scoreHistory.length - 2].score
      ? "▲" : scoreHistory[scoreHistory.length - 1].score < scoreHistory[scoreHistory.length - 2].score ? "▼" : "→"
    : null;

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* HEADER */}
      <header className="border-b border-border bg-surface/60 backdrop-blur px-6 py-4">
        <Link
          to="/missions/$missionId/questions"
          params={{ missionId }}
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> Responses
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className={`h-3 w-3 shrink-0 rounded-full ${HEALTH_DOT[q.health ?? "yellow"] ?? "bg-muted"}`} />
            <span className="font-mono text-xs text-muted-foreground shrink-0">Q{q.question_number}</span>
            <span className="text-muted-foreground">·</span>
            <h1 className="truncate text-lg font-semibold tracking-tight">{q.title}</h1>
          </div>
          <div className="flex items-center gap-5 text-[11px]">
            <span className="text-muted-foreground">Writer: <span className="text-foreground">{firstName(writer)}</span></span>
            <span className="text-muted-foreground">SME: <span className="text-foreground">{firstName(sme)}</span></span>
            <span className="text-muted-foreground">
              Pens Down: <span className={urgentDate ? "text-red-400 font-semibold" : "text-foreground"}>{fmtDate(q.pens_down_date)}</span>
            </span>
            <button
              onClick={() => setScoreOpen((o) => !o)}
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
            >
              Score: <span className="text-foreground font-semibold">{q.current_score != null ? q.current_score.toFixed(1) : "—"}</span>
              {scoreOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>
          </div>
        </div>

        {(q.health === "red" || q.health === "yellow") && drivers.length > 0 && (
          <div className={`mt-3 inline-flex items-start gap-2 rounded-md border px-3 py-1.5 text-xs ${
            q.health === "red"
              ? "border-red-500/30 bg-red-500/10 text-red-300"
              : "border-yellow-500/30 bg-yellow-500/10 text-yellow-200"
          }`}>
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>{drivers.join(" · ")}</span>
          </div>
        )}

        {scoreOpen && (
          <div className="mt-4 rounded-md border border-border bg-background/60 p-4 text-xs">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-semibold text-foreground">Score & Gates</span>
              <button onClick={() => setScoreOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-3 w-3" />
              </button>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Trend</div>
                {scoreHistory.length === 0 ? (
                  <div className="text-muted-foreground">No score history yet.</div>
                ) : (
                  <div className="font-mono text-foreground">
                    {scoreHistory.map((s) => s.score.toFixed(1)).join(" → ")} {trendArrow}
                  </div>
                )}
                {scoreHistory.length > 0 && scoreHistory[scoreHistory.length - 1].review_notes && (
                  <div className="mt-2 text-muted-foreground italic">
                    "{scoreHistory[scoreHistory.length - 1].review_notes}"
                  </div>
                )}
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Review Gates</div>
                {gates.length === 0 ? (
                  <div className="text-muted-foreground">No gates configured.</div>
                ) : (
                  <ul className="space-y-1">
                    {gates.map((g) => {
                      const st = gateStatuses.find((s) => s.gate_id === g.id);
                      return (
                        <li key={g.id} className="flex justify-between gap-3">
                          <span className="text-foreground">{g.gate_name}</span>
                          <span className="text-muted-foreground capitalize">{st?.status ?? "pending"}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}
      </header>

      {/* TWO COLUMNS */}
      <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-8 px-6 py-8 lg:grid-cols-[55fr_45fr]">
        {/* LEFT */}
        <div className="space-y-6">
          <Block label="Question">
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground">{q.question_text}</p>
          </Block>

          <Block label="Requirements">
            {q.requirements && q.requirements.length > 0 ? (
              <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
                {q.requirements.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            ) : (
              <div className="text-sm text-muted-foreground italic">No requirements listed.</div>
            )}
            {q.mandatory_language && q.mandatory_language.length > 0 && (
              <div className="mt-3 border-l-2 border-yellow-500/60 bg-yellow-500/5 px-3 py-2 text-xs text-yellow-200">
                <span className="font-semibold uppercase tracking-wider text-[10px] block mb-1">Required language</span>
                {q.mandatory_language.join(" — ")}
              </div>
            )}
          </Block>

          <Block label="Win Themes">
            {connectedThemes.length === 0 ? (
              <div className="text-sm text-muted-foreground italic">No win themes linked</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {connectedThemes.map((w) => (
                  <span key={w.id} className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs text-primary">
                    {w.title}
                  </span>
                ))}
              </div>
            )}
          </Block>

          <Block label="Related Questions">
            {relations.length === 0 ? (
              <div className="text-sm text-muted-foreground italic">None detected</div>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {relations.map((r) => {
                  const rq = relById[r.related_question_id];
                  if (!rq) return null;
                  return (
                    <li key={r.related_question_id}>
                      <Link
                        to="/missions/$missionId/questions/$questionId"
                        params={{ missionId, questionId: r.related_question_id }}
                        className={r.conflict_detected ? "text-yellow-300 hover:underline" : "text-foreground hover:underline"}
                      >
                        {r.conflict_detected && "⚠ "}Q{rq.question_number} · {r.conflict_detected && r.conflict_description ? r.conflict_description : rq.title}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Block>

          <div>
            <button
              onClick={() => setCollabExpanded((o) => !o)}
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              {collabs.length} note{collabs.length === 1 ? "" : "s"} ·{" "}
              <span className={openCollabs.length > 0 ? "text-yellow-300" : ""}>
                {openCollabs.length} open item{openCollabs.length === 1 ? "" : "s"}
              </span>
              {collabExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>
            {collabExpanded && (
              <div className="mt-3 rounded-md border border-border bg-surface/60 p-4">
                {collabs.length === 0 ? (
                  <div className="text-xs text-muted-foreground">No collaboration entries yet.</div>
                ) : (
                  <ul className="space-y-3">
                    {collabs.map((c) => (
                      <li key={c.id} className="border-b border-border/50 pb-3 last:border-0 last:pb-0">
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                          <span><span className="text-foreground font-medium">{c.author_name}</span> · {c.entry_type.replace(/_/g, " ")}</span>
                          <span>{new Date(c.created_at).toLocaleDateString()}</span>
                        </div>
                        <div className="text-sm text-foreground whitespace-pre-wrap">{c.body}</div>
                        {!c.resolved && (c.entry_type === "sme_request" || c.entry_type === "decision_needed") && (
                          <div className="mt-1 text-[10px] uppercase tracking-wider text-yellow-300">Open</div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — IRIS */}
        <div className="iris-panel rounded-r-[10px] pl-6 pr-5 py-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <span className="iris-label"><span className="iris-dot" />IRIS</span>
            <button
              onClick={() => regenerateCoaching(true)}
              disabled={coachingPending}
              className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground disabled:opacity-50"
              title="Regenerate coaching"
            >
              <RefreshCw className={`h-3 w-3 ${coachingPending ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>


          {intelLoading ? (
            <div className="space-y-3">
              <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
              <div className="h-3 w-full animate-pulse rounded bg-muted" />
              <div className="h-3 w-5/6 animate-pulse rounded bg-muted" />
              <div className="iris-loading-text mt-3">
                <span className="iris-dot" />IRIS is preparing your brief...
              </div>
            </div>
          ) : !hasIntel ? (
            <div className="text-sm leading-relaxed text-muted-foreground">
              Intelligence generates once the RFP is uploaded and analyzed.
              Upload the RFP in Mission Settings to activate IRIS for this mission.
            </div>
          ) : (
            <div className="space-y-5">
              {intel?.state_priorities && (
                <IrisInsight label="State Priority" content={intel.state_priorities} />
              )}
              {intel?.procurement_priorities && (
                <IrisInsight label="Procurement Signal" content={intel.procurement_priorities} />
              )}
              {intel?.competitor_signals && (
                <IrisInsight label="Differentiation" content={intel.competitor_signals} />
              )}
              {intel?.compliance_flags && intel.compliance_flags.length > 0 && (
                <div>
                  <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-amber-400">Compliance Note</div>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-amber-200">
                    {intel.compliance_flags.map((f, i) => <li key={i}>{f}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="mt-6 space-y-1.5">
            <Link to="/missions/$missionId/briefing" params={{ missionId }}
              className="block text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline">
              View full intelligence brief →
            </Link>
            <Link to="/missions/$missionId/library" params={{ missionId }}
              className="block text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline">
              Source documents →
            </Link>
          </div>
        </div>
      </div>

      {/* ACTION BAR */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center justify-center gap-3 px-6 py-3">
          <button
            onClick={() => openUpdateReality(questionId)}
            className="rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Update Reality
          </button>
          <button
            onClick={() => setAskOpen(true)}
            className="rounded-md border border-primary/60 bg-transparent px-5 py-2 text-sm font-semibold text-primary hover:bg-primary/10 inline-flex items-center gap-2"
          >
            <Sparkles className="h-3.5 w-3.5" /> Ask IRIS
          </button>
          <button
            onClick={() => setFlagOpen(true)}
            className="rounded-md border border-border bg-transparent px-5 py-2 text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-2"
          >
            <Flag className="h-3.5 w-3.5" /> Flag / Escalate
          </button>
        </div>
      </div>

      {/* Update Reality is rendered globally by AppShell's UpdateRealityMount */}

      {/* ASK IRIS MODAL */}
      {askOpen && (
        <Modal onClose={() => setAskOpen(false)} title="Ask IRIS">
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                value={prompt} onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") onAsk(); }}
                placeholder="Ask IRIS anything about this response…"
                className="iris-input flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
                autoFocus
              />
              <button onClick={onAsk} disabled={asking || !prompt.trim()}
                className="rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1.5">
                <Send className="h-3.5 w-3.5" /> {asking ? "…" : "Send"}
              </button>
            </div>
            {(asking || answer) && (
              <div className="iris-panel rounded-r-md px-4 py-3 text-sm">
                <div className="mb-2"><span className="iris-label"><span className="iris-dot" />IRIS</span></div>
                {asking ? (
                  <div className="iris-loading-text text-left"><span className="iris-dot" />IRIS is preparing your brief...</div>
                ) : (
                  <div className="whitespace-pre-wrap text-foreground">{answer}</div>
                )}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* FLAG / ESCALATE MODAL */}
      {flagOpen && (
        <Modal onClose={() => { setFlagOpen(false); setFlagType(null); setFlagBody(""); }} title="Flag / Escalate">
          {!flagType ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {([
                ["decision_needed", "Decision Needed", "#a855f7"],
                ["sme_request", "Need Help", "#f59e0b"],
                ["air_cover", "Need Air Cover", "#ef4444"],
              ] as const).map(([k, label, color]) => (
                <button
                  key={k}
                  onClick={() => setFlagType(k)}
                  className="rounded-[10px] border px-4 py-6 text-sm font-semibold transition hover:brightness-125"
                  style={{ borderColor: color, color, background: `${color}1a` }}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                {flagType === "decision_needed" ? "Decision Needed" : flagType === "sme_request" ? "Need Help" : "Need Air Cover"}
              </div>
              <textarea
                value={flagBody} onChange={(e) => setFlagBody(e.target.value.slice(0, 280))}
                placeholder="Add context (280 chars max)…" rows={4} maxLength={280}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary/60 focus:outline-none"
                autoFocus
              />
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">{flagBody.length}/280</span>
                <div className="flex gap-2">
                  <button onClick={() => setFlagType(null)} className="rounded-md border border-border px-4 py-2 text-xs text-muted-foreground hover:text-foreground">Back</button>
                  <button
                    onClick={() => flagSubmit.mutate()}
                    disabled={flagSubmit.isPending}
                    className="rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    {flagSubmit.isPending ? "Sending…" : "Submit"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}

function IrisInsight({ label, content }: { label: string; content: string }) {
  return (
    <div>
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-[color:var(--iris)]">{label}</div>
      <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">{content}</p>
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-[12px] border border-border bg-surface p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function RealityButton({ label, onClick, bg, border, color }: { label: string; onClick: () => void; bg: string; border: string; color: string }) {
  return (
    <button
      onClick={onClick}
      className="rounded-[10px] border px-4 py-5 text-xs font-semibold uppercase tracking-wider transition hover:brightness-125"
      style={{ background: bg, borderColor: border, color }}
    >
      {label}
    </button>
  );
}
