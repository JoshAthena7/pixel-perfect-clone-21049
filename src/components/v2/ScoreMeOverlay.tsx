import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { runScoreMe, getScoreMeSetup } from "@/lib/score-me-v2.functions";
import type { ScoreMeV2Result } from "@/lib/score-me-v2.functions";
import {
  acknowledgeScoreMeDisclosure,
  getScoreMeDisclosureStatus,
} from "@/lib/score-me-interactions.functions";
import { X, Sparkles, ShieldCheck, Lock } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { createSignal } from "@/lib/signals";
import { PersonFirstHint } from "@/components/v2/PersonFirstHint";
import { Scorecard } from "@/components/v2/Scorecard";
import { PHIRejectionWarning } from "@/components/v2/PHIRejectionWarning";
import { parsePHIError, type PHIErrorPayload } from "@/lib/phi-detection";

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
  /** When provided, pre-selected and locked (Flight Deck entry). */
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
  const [phiError, setPhiError] = useState<PHIErrorPayload | null>(null);

  const scoreFn = useServerFn(runScoreMe);
  const setupFn = useServerFn(getScoreMeSetup);
  const getDisclosureFn = useServerFn(getScoreMeDisclosureStatus);
  const ackFn = useServerFn(acknowledgeScoreMeDisclosure);

  // H5: First-time disclosure gate. Reads the writer's profile flag.
  const { data: disclosure, refetch: refetchDisclosure } = useQuery({
    queryKey: ["score-me-disclosure"],
    enabled: open,
    queryFn: () => getDisclosureFn(),
  });
  const ackMut = useMutation({
    mutationFn: () => ackFn(),
    onSuccess: () => refetchDisclosure(),
  });

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
      const phi = parsePHIError(e?.message);
      if (phi) {
        setPhiError(phi);
        setStage("input");
      } else {
        setError(e?.message ?? "Scoring failed. Please try again.");
        setStage("input");
      }
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col" style={{ background: "#060b14" }}>
      {phiError ? (
        <PHIRejectionWarning payload={phiError} onAcknowledge={() => setPhiError(null)} />
      ) : null}
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
            missionId={missionId}
            setup={setup}
          />
        )}
        {stage === "theatre" && <TheatreStage />}
        {stage === "result" && analysis && (
          <Scorecard
            result={analysis}
            missionId={missionId}
            onAnother={() => { setResponseText(""); setAnalysis(null); setStage("input"); }}
            onClose={onClose}
          />
        )}
      </div>

      {/* H5: First-time disclosure gate. Blocks Score Me until acknowledged. */}
      {open && disclosure && !disclosure.acknowledged && (
        <DisclosureModal onAccept={() => ackMut.mutate()} onCancel={onClose} pending={ackMut.isPending} />
      )}
    </div>
  );
}

function DisclosureModal({
  onAccept,
  onCancel,
  pending,
}: {
  onAccept: () => void;
  onCancel: () => void;
  pending: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-lg rounded-[14px] border border-cyan-400/30 bg-[#0a1422] p-6 shadow-2xl">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" style={{ color: "var(--iris, #22d3ee)" }} />
          <h2 className="text-lg font-semibold tracking-tight">Before you use Score Me</h2>
        </div>
        <div className="mt-4 space-y-3 text-[13px] leading-relaxed text-foreground/85">
          <p>
            <strong className="text-foreground">Score Me reads your draft, then discards it.</strong>{" "}
            The full text is processed in memory only — it is never written to our database,
            never logged, and never used to train any AI model.
          </p>
          <p>
            We do store a small audit record of the score itself: the seven dimension verdicts,
            IRIS's coaching note, the question, and your user ID. We do <em>not</em> store the
            draft, the suggestions you copy, or any client data inside it.
          </p>
          <p>
            <strong className="text-foreground">IRIS identifies gaps and asks you questions.</strong>{" "}
            It does not write your response for you. Anything you paste in remains your work
            product and your responsibility.
          </p>
          <p className="text-[12px] text-muted-foreground">
            Full detail: <Link to="/command/security" className="underline decoration-dotted hover:text-foreground">how Score Me works →</Link>
          </p>
        </div>
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={onAccept}
            disabled={pending}
            className="rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: "var(--iris, #22d3ee)" }}
          >
            {pending ? "Saving…" : "I understand — continue"}
          </button>
        </div>
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
  missionId: string;
  setup?: {
    hasOutlineTemplate: boolean;
    hasStyleGuide: boolean;
    hasContract: boolean;
    hasScopeOfWork: boolean;
    hasWinThemes: boolean;
    hasStateProfile: boolean;
  };
}) {
  const setupRows = props.setup
    ? [
        { label: "Person-first language", active: true, always: true },
        { label: "Outline template", active: props.setup.hasOutlineTemplate },
        { label: "Style guide", active: props.setup.hasStyleGuide },
        { label: "Contract & SOW", active: props.setup.hasContract && props.setup.hasScopeOfWork },
        { label: "Win themes", active: props.setup.hasWinThemes },
        { label: "State priorities", active: true },
        { label: "Proof points", active: true },
      ]
    : [];
  const activeCount = setupRows.filter((r) => r.active).length;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Want a read on your draft?</h1>
      <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
        IRIS scores your draft across seven dimensions — person-first language, structure, voice, scope, win themes, state priorities, and proof points. It never rewrites your work.
      </p>
      <div className="mt-3 flex items-start gap-2 rounded-[10px] border border-cyan-400/20 bg-cyan-400/[0.04] px-3 py-2.5">
        <ShieldCheck className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: "var(--iris, #22d3ee)" }} />
        <div className="text-[11px] leading-relaxed text-muted-foreground">
          <span className="text-foreground/90 font-medium">Ephemeral processing.</span> Your draft is read in memory, scored, and discarded — never stored, never logged, never used to train any model.{" "}
          <Link to="/command/security" className="underline decoration-dotted underline-offset-2 hover:text-foreground">How this works →</Link>
        </div>
      </div>

      {props.setup && (
        <div className="mt-4 rounded-[10px] border border-border bg-surface/60 px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Active dimensions
            </span>
            <span className="text-[11px] text-foreground/80">
              {activeCount} / 7 · {7 - activeCount === 0 ? "all loaded" : `${7 - activeCount} pending upload`}
            </span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] md:grid-cols-3">
            {setupRows.map((r) => (
              <div key={r.label} className="flex items-center gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${r.active ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
                <span className={r.active ? "text-foreground/80" : "text-muted-foreground line-through decoration-dotted"}>
                  {r.label}
                </span>
              </div>
            ))}
          </div>
          {7 - activeCount > 0 && (
            <Link
              to="/missions/$missionId/vault"
              params={{ missionId: props.missionId }}
              className="mt-2 inline-block text-[11px] text-sky-300 hover:underline"
            >
              Upload missing documents in the Vault →
            </Link>
          )}
        </div>
      )}

      <div className="mt-8 space-y-3">
        <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">Section</div>
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

/* Legacy ResultStage/SourcesPanel/ComplianceResultsSection removed — replaced by <Scorecard /> for the 7-dimension Score Me v2 spec. */



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

