import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { runScoreMe, getScoreMeSetup } from "@/lib/score-me-v2.functions";
import type { ScoreMeV2Result } from "@/lib/score-me-v2.functions";
import { X, Sparkles, ShieldCheck, Lock } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { createSignal } from "@/lib/signals";
import { PersonFirstHint } from "@/components/v2/PersonFirstHint";
import { Scorecard } from "@/components/v2/Scorecard";

type Analysis = ScoreMeV2Result;

type Question = {
  id: string;
  question_number: string;
  title: string;
  page_limit: number | null;
  evaluation_weight: number | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  missionId: string;
  /** When provided, pre-selected and locked (Cockpit entry). */
  lockedQuestionId?: string;
};

const PROGRESS_LINES = [
  "Reading your draft the way a colleague would...",
  "Checking against the RFP evaluation criteria...",
  "Looking for compliance language and mandatory items...",
  "Noting where your positioning could land harder...",
  "Comparing patterns to evaluator signals from similar procurements...",
  "Cross-referencing IRIS Memory and institutional knowledge...",
  "Surfacing the gaps worth closing before Red Team...",
];

export function ScoreMeOverlay({ open, onClose, missionId, lockedQuestionId }: Props) {
  const [stage, setStage] = useState<"input" | "theatre" | "result">("input");
  const [questionId, setQuestionId] = useState<string | null>(lockedQuestionId ?? null);
  const [responseText, setResponseText] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scoreFn = useServerFn(runScoreMe);
  const setupFn = useServerFn(getScoreMeSetup);
  const { data: setup } = useQuery({
    queryKey: ["score-me-setup", missionId],
    enabled: open,
    queryFn: () => setupFn({ data: { missionId } }),
  });

  // Reset when reopened
  useEffect(() => {
    if (open) {
      setStage("input");
      setResponseText("");
      setAnalysis(null);
      setError(null);
      setQuestionId(lockedQuestionId ?? null);
    }
  }, [open, lockedQuestionId]);

  // Mission FedRAMP-scope flag — hard block on Score Me when true.
  const { data: mission } = useQuery({
    queryKey: ["score-me-mission", missionId],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("missions")
        .select("id, name, is_fedramp_scope")
        .eq("id", missionId)
        .maybeSingle();
      return data as { id: string; name: string; is_fedramp_scope: boolean } | null;
    },
  });
  const fedrampBlocked = mission?.is_fedramp_scope === true;

  // Mission questions for selector
  const { data: questions = [] } = useQuery({
    queryKey: ["score-me-questions", missionId],
    enabled: open && !lockedQuestionId,
    queryFn: async () => {
      const { data } = await supabase
        .from("question_records")
        .select("id,question_number,title,page_limit,evaluation_weight")
        .eq("mission_id", missionId)
        .order("sort_order", { ascending: true });
      return (data ?? []) as Question[];
    },
  });

  const { data: lockedQ } = useQuery({
    queryKey: ["score-me-locked-q", lockedQuestionId],
    enabled: open && !!lockedQuestionId,
    queryFn: async () => {
      const { data } = await supabase
        .from("question_records")
        .select("id,question_number,title,page_limit,evaluation_weight")
        .eq("id", lockedQuestionId!)
        .maybeSingle();
      return (data ?? null) as Question | null;
    },
  });

  const selectedQ: Question | null = useMemo(() => {
    if (lockedQ) return lockedQ;
    return questions.find((q) => q.id === questionId) ?? null;
  }, [lockedQ, questions, questionId]);

  const wordCount = useMemo(() => responseText.trim().split(/\s+/).filter(Boolean).length, [responseText]);
  const pageEstimate = Math.max(1, Math.round((wordCount / 450) * 10) / 10);
  const canScore = wordCount >= 50 && !!selectedQ;

  const runScore = async () => {
    if (!canScore || !selectedQ) return;
    setStage("theatre");
    setError(null);
    setAnalysis(null);

    const minimumTheatreMs = 10500;
    const start = Date.now();
    try {
      const result = await scoreFn({ data: { questionId: selectedQ.id, responseText } });
      const elapsed = Date.now() - start;
      const wait = Math.max(0, minimumTheatreMs - elapsed);
      await new Promise((r) => setTimeout(r, wait));
      setAnalysis(result);
      setStage("result");
      try {
        await createSignal({
          mission_id: missionId,
          source_module: "score_me",
          signal_type: "response_scored",
          signal_title: `Q${selectedQ.question_number} — ${result.gapCount} gap${result.gapCount === 1 ? "" : "s"}, ${result.opportunityCount} opportunity${result.opportunityCount === 1 ? "" : "ies"}`,
          signal_summary: (result.irisNote ?? "").slice(0, 200),
          related_question_id: selectedQ.id,
          severity: result.gapCount > 0 ? "warning" : "info",
        });
      } catch {}
    } catch (e: any) {
      setError(e?.message ?? "Scoring failed. Please try again.");
      setStage("input");
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col" style={{ background: "#060b14" }}>
      <style>{`
        .smbg {
          background:
            linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px),
            #060b14;
          background-size: 48px 48px, 48px 48px, auto;
        }
        @keyframes smPulse { 0%,100% { opacity:1 } 50% { opacity:0.35 } }
        .sm-pulse-dot { animation: smPulse 1.6s ease-in-out infinite }
        @keyframes smTypeIn { from { opacity:0; transform: translateY(4px) } to { opacity:1; transform: translateY(0) } }
        .sm-line { animation: smTypeIn 320ms ease-out both }
        @keyframes smEyeOpen { 0% { transform: scale(0.85); opacity: 0 } 100% { transform: scale(1); opacity: 1 } }
        @keyframes smEyeSpin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        @keyframes smPupilBreath { 0%,100% { r: 9 } 50% { r: 11 } }
        .sm-eye-wrap { animation: smEyeOpen 600ms ease-out }
        .sm-eye-rays { animation: smEyeSpin 18s linear infinite; transform-origin: center; transform-box: fill-box }
        .sm-eye-pupil { animation: smPupilBreath 3.2s ease-in-out infinite }
      `}</style>

      <header className="smbg flex items-center justify-between border-b border-white/5 px-6 py-3">
        <div className="flex items-center gap-2">
          <span className="sm-pulse-dot inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--iris, #22d3ee)", boxShadow: "0 0 8px var(--iris, #22d3ee)" }} />
          <span className="text-[10px] font-bold uppercase tracking-[0.32em]" style={{ color: "var(--iris, #22d3ee)" }}>Score Me</span>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="smbg flex-1 min-h-0 overflow-y-auto">
        {stage === "input" && fedrampBlocked && (
          <FedRampBlock missionName={mission?.name ?? "this mission"} onClose={onClose} />
        )}
        {stage === "input" && !fedrampBlocked && (
          <InputStage
            selectedQ={selectedQ}
            questions={questions}
            lockedQuestionId={lockedQuestionId}
            questionId={questionId}
            setQuestionId={setQuestionId}
            responseText={responseText}
            setResponseText={setResponseText}
            wordCount={wordCount}
            pageEstimate={pageEstimate}
            canScore={canScore}
            error={error}
            onScore={runScore}
            onClose={onClose}
          />
        )}
        {stage === "theatre" && <TheatreStage />}
        {stage === "result" && analysis && (
          <Scorecard
            result={analysis}
            onAnother={() => { setResponseText(""); setAnalysis(null); setStage("input"); }}
            onClose={onClose}
          />
        )}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────── INPUT ─────────── */

function InputStage(props: {
  selectedQ: Question | null;
  questions: Question[];
  lockedQuestionId: string | undefined;
  questionId: string | null;
  setQuestionId: (id: string) => void;
  responseText: string;
  setResponseText: (s: string) => void;
  wordCount: number;
  pageEstimate: number;
  canScore: boolean;
  error: string | null;
  onScore: () => void;
  onClose: () => void;
}) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Want a read on your draft?</h1>
      <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
        IRIS reads your draft the way a smart colleague would — looking for gaps,
        compliance flags, and anything an evaluator might mark down. It never rewrites
        your work. The expertise is yours.
      </p>
      <div className="mt-3 flex items-start gap-2 rounded-[10px] border border-cyan-400/20 bg-cyan-400/[0.04] px-3 py-2.5">
        <ShieldCheck className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: "var(--iris, #22d3ee)" }} />
        <div className="text-[11px] leading-relaxed text-muted-foreground">
          <span className="text-foreground/90 font-medium">Ephemeral processing.</span> Your draft is read in memory, scored, and discarded — never stored, never logged, never used to train any model.{" "}
          <Link to="/command/security" className="underline decoration-dotted underline-offset-2 hover:text-foreground">How this works →</Link>
        </div>
      </div>

      <div className="mt-8 space-y-3">
        <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">Question</div>
        {props.lockedQuestionId ? (
          props.selectedQ ? (
            <div className="rounded-[10px] border border-white/10 bg-white/[0.02] px-4 py-3">
              <div className="text-sm font-semibold">Q{props.selectedQ.question_number} · {props.selectedQ.title}</div>
              <div className="mt-1 text-[11px]" style={{ color: "var(--iris, #22d3ee)" }}>Evaluation criteria loaded ✓</div>
            </div>
          ) : <div className="text-xs text-muted-foreground">Loading question…</div>
        ) : (
          <>
            <select
              value={props.questionId ?? ""}
              onChange={(e) => props.setQuestionId(e.target.value)}
              className="w-full rounded-[10px] border border-white/10 bg-black/40 px-4 py-3 text-sm"
            >
              <option value="">Select which question this response is for…</option>
              {props.questions.map((q) => (
                <option key={q.id} value={q.id}>Q{q.question_number} — {q.title}</option>
              ))}
            </select>
            {props.selectedQ && (
              <div className="text-[11px] text-muted-foreground">
                Weight: {props.selectedQ.evaluation_weight ?? "—"}% · Page limit: {props.selectedQ.page_limit ?? "—"} ·{" "}
                <span style={{ color: "var(--iris, #22d3ee)" }}>Evaluation criteria loaded ✓</span>
              </div>
            )}
          </>
        )}
      </div>

      <div className="mt-6">
        <textarea
          value={props.responseText}
          onChange={(e) => props.setResponseText(e.target.value)}
          placeholder={"Paste your response draft here...\n\nThis can be a full draft, a partial draft, or even bullet points. IRIS will score what you give it."}
          className="w-full resize-y rounded-[12px] px-6 py-5 text-[14px] leading-[1.8]"
          style={{
            minHeight: 320,
            background: "rgba(0,0,0,0.4)",
            border: "1px solid rgba(8,145,178,0.2)",
            color: "var(--foreground)",
          }}
        />
        <PersonFirstHint value={props.responseText} onChange={props.setResponseText} />
        <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{props.wordCount.toLocaleString()} words · approximately {props.pageEstimate} {props.pageEstimate === 1 ? "page" : "pages"}</span>
          {props.wordCount > 0 && props.wordCount < 50 && <span>Need at least 50 words</span>}
        </div>
      </div>

      {props.error && (
        <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs text-destructive">{props.error}</div>
      )}

      <button
        onClick={props.onScore}
        disabled={!props.canScore}
        className="mt-8 w-full rounded-[10px] text-white font-bold tracking-wider transition disabled:cursor-not-allowed disabled:opacity-40"
        style={{
          height: 52,
          background: "var(--iris, #22d3ee)",
          fontSize: 14,
          letterSpacing: "0.05em",
          boxShadow: "0 8px 30px -8px rgba(34,211,238,0.5)",
        }}
      >
        <span className="inline-flex items-center gap-2"><Sparkles className="h-4 w-4" /> Read My Draft →</span>
      </button>
      {!props.canScore && (
        <div className="mt-2 text-center text-[11px] text-amber-400/90">
          {!props.selectedQ && props.wordCount < 50 && "Select a question above and write at least 50 words to score."}
          {!props.selectedQ && props.wordCount >= 50 && "Select a question above to enable scoring."}
          {props.selectedQ && props.wordCount < 50 && `Write at least 50 words to score (currently ${props.wordCount}).`}
        </div>
      )}
      <div className="mt-3 text-center">
        <button onClick={props.onClose} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────── THEATRE ───────── */

function TheatreStage() {
  const [visibleLines, setVisibleLines] = useState(0);
  useEffect(() => {
    setVisibleLines(0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => setVisibleLines(1), 0));
    for (let i = 1; i < PROGRESS_LINES.length; i++) {
      timers.push(setTimeout(() => setVisibleLines(i + 1), 1500 * i));
    }
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-6 py-16">
      <OracleEye size={120} />
      <div className="mt-10 w-full max-w-xl space-y-3">
        {PROGRESS_LINES.slice(0, visibleLines).map((line, i) => (
          <div
            key={i}
            className="sm-line flex items-center gap-3 font-mono text-[13px]"
            style={{ color: "var(--iris, #22d3ee)", letterSpacing: "0.06em" }}
          >
            <span className="sm-pulse-dot inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--iris, #22d3ee)" }} />
            {line}
          </div>
        ))}
      </div>
    </div>
  );
}

function OracleEye({ size = 80 }: { size?: number }) {
  return (
    <div className="sm-eye-wrap" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size}>
        <defs>
          <radialGradient id="smIris" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#0891b2" stopOpacity="0.1" />
          </radialGradient>
        </defs>
        <g className="sm-eye-rays">
          {Array.from({ length: 12 }).map((_, i) => {
            const a = (i * Math.PI * 2) / 12;
            const x1 = 50 + Math.cos(a) * 32;
            const y1 = 50 + Math.sin(a) * 32;
            const x2 = 50 + Math.cos(a) * 46;
            const y2 = 50 + Math.sin(a) * 46;
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#22d3ee" strokeWidth="1" strokeOpacity="0.6" />;
          })}
        </g>
        <circle cx="50" cy="50" r="26" fill="url(#smIris)" stroke="#22d3ee" strokeWidth="1.2" strokeOpacity="0.8" />
        <circle className="sm-eye-pupil" cx="50" cy="50" r="9" fill="#060b14" />
        <circle cx="46" cy="46" r="2" fill="#22d3ee" opacity="0.9" />
      </svg>
    </div>
  );
}

/* ──────────────────────────────────────────── RESULT ────────── */

function ResultStage({
  analysis, question, onAnother, onClose, missionId, responseText,
}: {
  analysis: Analysis;
  question: Question;
  onAnother: () => void;
  onClose: () => void;
  missionId: string;
  responseText: string;
}) {
  const [count, setCount] = useState(0);
  const rafRef = useRef<number | null>(null);
  const personFirstFlags = useMemo(() => scanForPersonFirstFlags(responseText), [responseText]);
  const personFirstImpact = personFirstFlags.length === 0
    ? 0
    : personFirstFlags.length <= 2 ? 0.1 : personFirstFlags.length <= 4 ? 0.2 : 0.3;


  useEffect(() => {
    const target = analysis.score;
    const start = performance.now();
    const dur = 1500;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setCount(target * eased);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [analysis.score]);

  const scoreColor =
    analysis.score < 3.0 ? "rgb(239,68,68)" :
    analysis.score < 4.0 ? "rgb(245,158,11)" :
    analysis.score < 4.5 ? "rgb(232,232,236)" :
    "rgb(34,197,94)";
  const projectedColor = analysis.projected_score >= 4.5 ? "rgb(34,197,94)" : "rgb(232,232,236)";

  const meetsStandard = analysis.score >= 4.5;

  const saveAnalysis = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error("Not signed in"); return; }
    const { data: prof } = await supabase.from("profiles").select("display_name,email").eq("id", user.id).maybeSingle();
    const author = prof?.display_name ?? prof?.email?.split("@")[0] ?? "Writer";
    const body = `IRIS read this draft — here's what it found (internal reference: ${analysis.score.toFixed(1)} / projected ${analysis.projected_score.toFixed(1)})\n\n${analysis.score_context}`;
    const { error } = await supabase.from("question_collaboration").insert({
      question_id: question.id,
      mission_id: missionId,
      author_id: user.id,
      author_name: author,
      entry_type: "score_analysis",
      body,
    });
    if (error) toast.error("Couldn't save analysis", { description: error.message });
    else toast.success(`Analysis saved to Q${question.question_number}`);
  };

  const sendToCoPilot = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error("Not signed in"); return; }
    const { data: prof } = await supabase.from("profiles").select("display_name,email").eq("id", user.id).maybeSingle();
    const author = prof?.display_name ?? prof?.email?.split("@")[0] ?? "Writer";
    const body = `I had IRIS read my Q${question.question_number} draft. Here's what it surfaced: ${analysis.score_context} Could use your eyes on the top thing to close.`;
    const { error } = await supabase.from("pilot_copilot_messages").insert({
      mission_id: missionId,
      from_user_id: user.id,
      from_name: author,
      message_type: "direct",
      body,
      is_broadcast: true,
      question_id: question.id,
    });
    if (error) toast.error("Couldn't send to Co-Pilot", { description: error.message });
    else toast.success("Sent to Engagement Lead");
  };

  return (
    <div className="pb-32">
      {/* HEADLINE — colleague framing leads, score is supporting */}
      <div className="px-6 pt-16 pb-10 flex flex-col items-center text-center">
        <h2 className="max-w-2xl text-[28px] font-semibold leading-tight tracking-tight text-foreground">
          {meetsStandard
            ? "This draft is landing. Here's what IRIS noticed."
            : "IRIS sees a few gaps worth closing before Red Team."}
        </h2>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-foreground/80">{analysis.score_context}</p>

        <div
          className="mt-8 inline-flex items-baseline gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-1.5"
          title="IRIS keeps an internal reference number — your work is judged by people, not by this number"
        >
          <span
            style={{
              fontSize: 22, fontWeight: 700, lineHeight: 1,
              color: scoreColor, fontVariantNumeric: "tabular-nums",
            }}
          >
            {count.toFixed(1)}
          </span>
          <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            / 5.0 · IRIS internal reference
          </span>
        </div>
      </div>


      <div className="mx-auto max-w-3xl px-6 space-y-10">
        {/* SECTION A */}
        <section>
          <h3 className="text-[11px] font-bold uppercase tracking-[0.24em] text-muted-foreground mb-4">
            What IRIS noticed
          </h3>
          <ol className="space-y-5">
            {analysis.reasons.map((r: any, i: number) => (
              <li key={i} className="rounded-[10px] border border-white/5 bg-white/[0.02] p-5">
                <div className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{
                  color: r.type === "strength" ? "rgb(34,197,94)" : r.type === "compliance" ? "rgb(239,68,68)" : "var(--iris, #22d3ee)",
                }}>
                  {i + 1}. {r.label}
                </div>
                <p className="mt-2 text-sm leading-[1.7] text-foreground/85">{r.explanation}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* PERSON-FIRST LANGUAGE */}
        <section>
          {personFirstFlags.length === 0 ? (
            <div className="flex items-center gap-2 rounded-[10px] border border-emerald-500/25 bg-emerald-500/[0.05] px-4 py-3 text-sm">
              <span className="text-emerald-400">●</span>
              <span className="text-emerald-200">Person-first language: ✓ Clear</span>
            </div>
          ) : (
            <div className="rounded-[10px] border border-amber-500/25 bg-amber-500/[0.04] p-5">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-amber-300">
                  ● Person-first language
                </div>
                <div className="text-[11px] text-amber-200/80">
                  Score impact: −{personFirstImpact.toFixed(1)}
                </div>
              </div>
              <div className="mt-1 text-[12px] text-amber-100/80">
                {personFirstFlags.length} term{personFirstFlags.length === 1 ? "" : "s"} need attention. Evaluators score cultural competency on this — fix before submission.
              </div>
              <div className="mt-4 space-y-3">
                {personFirstFlags.map((f, i) => (
                  <div key={i} className="rounded-[8px] border border-white/5 bg-black/30 px-4 py-3 text-sm">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="line-through opacity-60">"{f.match}"</span>
                      <span className="text-amber-300">→</span>
                      <span className="font-medium text-amber-100">"{f.replacement}"</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* COMPLIANCE CHECK */}
        <ComplianceResultsSection analysis={analysis} />



        {/* SECTION B */}
        <section>
          <h3 className="text-[11px] font-bold uppercase tracking-[0.24em] text-muted-foreground mb-4">
            What evaluators will look for — questions to consider
          </h3>
          <div className="space-y-5">
            {analysis.changes.map((c: any, i: number) => (
              <div key={i} className="rounded-[10px] border border-white/10 bg-white/[0.02] p-5">
                <div className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: "var(--iris, #22d3ee)" }}>
                  Change {i + 1} — {c.label}
                </div>
                <div className="mt-3 grid gap-3 text-sm">
                  <div><span className="text-muted-foreground">What:</span> {c.what}</div>
                  <div><span className="text-muted-foreground">Where:</span> {c.where}</div>
                  <div>
                    <div className="text-muted-foreground mb-1">Suggested language:</div>
                    <blockquote className="rounded-[8px] px-4 py-3 text-sm italic leading-relaxed"
                      style={{ background: "rgba(8,145,178,0.06)", borderLeft: "3px solid var(--iris, #22d3ee)" }}>
                      "{c.suggested_language}"
                    </blockquote>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground/70">Why:</span> {c.why}
                    {typeof c.estimated_points === "number" && (
                      <span className="ml-2" style={{ color: "rgb(34,197,94)" }}>Estimated +{c.estimated_points.toFixed(1)} pts</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* SECTION C */}
        <section className="text-center rounded-[12px] border border-white/10 bg-white/[0.02] px-6 py-8">
          <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-muted-foreground">
            If you address these, IRIS thinks this draft is more likely to land at
          </div>
          <div className="mt-3 text-[72px] font-extrabold leading-none" style={{ color: projectedColor }}>
            {analysis.projected_score.toFixed(1)}
            <span className="ml-1 text-2xl text-muted-foreground font-medium">/ 5.0</span>
          </div>
          {analysis.projected_score >= 4.5 && (
            <div className="mt-2 text-xs" style={{ color: "rgb(34,197,94)" }}>● Comfortably in the landing zone</div>
          )}
          <p className="mt-4 text-xs text-muted-foreground max-w-md mx-auto">
            A direction, not a guarantee. Final landing depends on how you address these and how the panel weighs criteria on the day. The expertise is yours — IRIS just makes sure nothing gets missed.
          </p>
        </section>

        {/* SECTION D */}
        <SourcesPanel analysis={analysis} />
      </div>

      {/* ACTION BAR */}
      <div className="fixed bottom-0 left-0 right-0 z-10 border-t border-white/10 px-6 py-4 backdrop-blur"
        style={{ background: "rgba(6,11,20,0.92)" }}>
        <div className="mx-auto max-w-3xl flex items-center justify-end gap-2 flex-wrap">
          <button onClick={onAnother} className="inline-flex items-center gap-1.5 rounded-md border border-white/15 px-3 py-2 text-xs hover:bg-white/[0.04]">
            <RefreshCw className="h-3.5 w-3.5" /> Score Another Response
          </button>
          <button onClick={saveAnalysis} className="inline-flex items-center gap-1.5 rounded-md border border-white/15 px-3 py-2 text-xs hover:bg-white/[0.04]">
            <Save className="h-3.5 w-3.5" /> Save This Analysis
          </button>
          <button onClick={sendToCoPilot} className="inline-flex items-center gap-1.5 rounded-md border border-cyan-500/30 px-3 py-2 text-xs text-cyan-300 hover:bg-cyan-500/10">
            <Send className="h-3.5 w-3.5" /> Send to Co-Pilot
          </button>
          <button onClick={onClose} className="rounded-md bg-white/10 px-4 py-2 text-xs hover:bg-white/15">Close</button>
        </div>
      </div>
    </div>
  );
}

function SourcesPanel({ analysis }: { analysis: Analysis }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-[10px] border border-white/5">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between px-5 py-3 text-left">
        <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-muted-foreground inline-flex items-center gap-2">
          <span className="sm-pulse-dot inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--iris, #22d3ee)" }} />
          What IRIS read to form this take
        </span>
        {open ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>
      {open && (
        <div className="border-t border-white/5 px-5 py-4 space-y-3 text-xs text-foreground/80">
          {analysis.sources_used.length > 0 ? (
            <ul className="list-disc pl-5 space-y-1">
              {analysis.sources_used.map((s: string, i: number) => <li key={i}>{s}</li>)}
            </ul>
          ) : (
            <div className="text-muted-foreground">No specific sources cited.</div>
          )}
          <div className="pt-2 border-t border-white/5">
            <div className="text-muted-foreground">
              Confidence: <span className="font-semibold uppercase tracking-wider" style={{
                color: analysis.confidence === "high" ? "rgb(34,197,94)" : analysis.confidence === "medium" ? "rgb(245,158,11)" : "rgb(239,68,68)",
              }}>{analysis.confidence}</span>
            </div>
            {analysis.confidence_note && (
              <div className="mt-1 text-muted-foreground">{analysis.confidence_note}</div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

type ComplianceItem = {
  requirement_id: string;
  source: "mission" | "federal";
  label: string;
  requirement: string;
  severity: string;
  status: string;
  evidence: string;
  iris_note: string;
};

function ComplianceResultsSection({ analysis }: { analysis: Analysis }) {
  const compliance = ((analysis as any).compliance ?? []) as ComplianceItem[];
  const [showAll, setShowAll] = useState(false);
  if (compliance.length === 0) return null;

  const groupBySource = (src: "mission" | "federal" | "model_contract" | "state_regulation") =>
    compliance.filter((c) => {
      if (src === "mission") return c.source === "mission";
      if (src === "federal") return c.source === "federal";
      return false;
    });

  const allMission = groupBySource("mission");
  const allFederal = groupBySource("federal");
  const splitByDoc = (items: ComplianceItem[], kindHint: string) =>
    items.filter((i) => i.label.toLowerCase().includes(kindHint));
  const modelContract = splitByDoc(allMission, "model_contract");
  const stateReg = splitByDoc(allMission, "state_regulation");
  const otherMission = allMission.filter((i) => !modelContract.includes(i) && !stateReg.includes(i));

  const compliantCount = (items: ComplianceItem[]) => items.filter((i) => i.status === "compliant").length;
  const offenders = compliance.filter((c) => c.status === "non_compliant" || c.status === "conflicting" || c.status === "partial");
  const critical = offenders.filter((o) => o.severity === "critical");
  const significant = offenders.filter((o) => o.severity === "significant");
  const compliantItems = compliance.filter((c) => c.status === "compliant");

  const Bar = ({ label, items }: { label: string; items: ComplianceItem[] }) => {
    if (items.length === 0) return null;
    const met = compliantCount(items);
    const pct = (met / items.length) * 100;
    return (
      <div className="grid grid-cols-[140px_1fr_80px] items-center gap-3 text-[11px]">
        <div className="font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="h-2 overflow-hidden rounded-full bg-black/50">
          <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
        </div>
        <div className="text-right text-muted-foreground">{met} of {items.length}</div>
      </div>
    );
  };

  return (
    <section>
      <h3 className="text-[11px] font-bold uppercase tracking-[0.24em] text-muted-foreground mb-4">
        ● Compliance Check
      </h3>
      <div className="rounded-[10px] border border-white/10 bg-white/[0.02] p-5 space-y-2">
        <Bar label="Model Contract" items={modelContract.concat(otherMission.filter((i) => i.label.toLowerCase().includes("model")))} />
        <Bar label="State Regs" items={stateReg.concat(otherMission.filter((i) => i.label.toLowerCase().includes("state")))} />
        <Bar label="Federal Regs" items={allFederal} />
      </div>

      {critical.length > 0 && (
        <div className="mt-4 space-y-3">
          {critical.map((c) => (
            <div key={c.requirement_id} className="rounded-[10px] border border-rose-500/40 bg-rose-500/[0.05] p-4 text-sm">
              <div className="text-[10px] font-bold uppercase tracking-wider text-rose-300">
                ⚠ {c.status === "conflicting" ? "CONFLICTING" : "CRITICAL — NOT ADDRESSED"} · {c.label}
              </div>
              <div className="mt-2 text-foreground/90"><span className="text-muted-foreground">Requirement:</span> {c.requirement}</div>
              {c.evidence && <div className="mt-2 text-foreground/80"><span className="text-muted-foreground">In your response:</span> {c.evidence}</div>}
              {c.iris_note && <div className="mt-2 text-rose-200/90"><span className="text-muted-foreground">IRIS:</span> {c.iris_note}</div>}
            </div>
          ))}
        </div>
      )}

      {significant.length > 0 && (
        <div className="mt-3 space-y-2">
          {significant.map((c) => (
            <div key={c.requirement_id} className="rounded-[8px] border border-amber-500/30 bg-amber-500/[0.04] px-4 py-3 text-xs">
              <div className="font-semibold text-amber-300">◉ {c.label}</div>
              <div className="mt-1 text-foreground/80">{c.iris_note || c.requirement}</div>
            </div>
          ))}
        </div>
      )}

      {compliantItems.length > 0 && (
        <div className="mt-3">
          <button onClick={() => setShowAll((s) => !s)} className="text-[11px] text-emerald-400 hover:underline">
            ✓ {compliantItems.length} requirement{compliantItems.length === 1 ? "" : "s"} met · View all {showAll ? "▴" : "▾"}
          </button>
          {showAll && (
            <ul className="mt-2 space-y-1 text-[11px] text-foreground/70">
              {compliantItems.map((c) => (
                <li key={c.requirement_id}>✓ {c.label}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

/* ──────────────────────────────────────────── FEDRAMP BLOCK ─────────── */

function FedRampBlock({ missionName, onClose }: { missionName: string; onClose: () => void }) {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <div className="flex flex-col items-center text-center">
        <div
          className="flex h-16 w-16 items-center justify-center rounded-full mb-5"
          style={{ background: "rgba(244,63,94,0.10)", border: "1px solid rgba(244,63,94,0.35)" }}
        >
          <Lock className="h-7 w-7" style={{ color: "rgb(244,63,94)" }} />
        </div>
        <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-rose-400/90">
          Score Me unavailable
        </div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          {missionName} is a FedRAMP-scope engagement.
        </h1>
        <p className="mt-4 text-sm text-muted-foreground max-w-md leading-relaxed">
          Score Me requires draft content to leave the client environment for processing.
          Atlas does not yet hold FedRAMP authorization, so we don't offer this on
          FedRAMP-scope missions — even with our ephemeral processing commitment.
        </p>
        <p className="mt-3 text-[11px] text-muted-foreground/80 max-w-md leading-relaxed">
          FedRAMP Moderate authorization is on the Atlas roadmap (Phase 4). Until then,
          use in-person Red Team review and the compliance checklist on this mission.
        </p>
        <div className="mt-7 flex items-center gap-3">
          <Link
            to="/command/security"
            className="rounded-md border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-medium hover:bg-white/[0.08]"
          >
            Read the security spec
          </Link>
          <button
            onClick={onClose}
            className="rounded-md px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

