import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { processRFPDocuments } from "@/lib/iris-process-rfp.functions";
import { extractRFPText } from "@/lib/extract-rfp-text.client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

type StepKey = "download" | "extract" | "analyze" | "save" | "done";

const STEP_LABELS: Record<StepKey, string> = {
  download: "Downloading documents",
  extract: "Extracting text",
  analyze: "IRIS analyzing",
  save: "Saving structure",
  done: "Complete",
};

// Weight each phase's contribution to overall %.
const STEP_WEIGHTS: Record<Exclude<StepKey, "done">, number> = {
  download: 10,
  extract: 30,
  analyze: 55,
  save: 5,
};

const FEED = [
  "Reading primary RFP...",
  "Identifying volume and section structure...",
  "Extracting evaluation criteria...",
  "Mapping questions to sections...",
  "Analyzing scoring weights...",
  "Identifying submission requirements...",
  "Cross-referencing amendments...",
  "Building cascade output...",
  "Flagging confidence levels...",
  "Mission structure ready.",
];

const LINE_DELAY_MS = 1200;
const BUCKET = "atlas-rfp-documents";

type Phase = "running" | "done" | "error";

export function Step1CProcessing({
  missionId,
  onContinue,
}: {
  missionId: string;
  onContinue: () => void;
}) {
  const runProcess = useServerFn(processRFPDocuments);
  const [lines, setLines] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>("running");
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [step, setStep] = useState<StepKey>("download");
  const [extractIdx, setExtractIdx] = useState(0);
  const [extractTotal, setExtractTotal] = useState(0);
  const [analyzePct, setAnalyzePct] = useState(0); // smooth fake fill inside analyze phase
  const startedAt = useRef<number>(Date.now());
  const aiDone = useRef<boolean>(false);
  const aiError = useRef<string | null>(null);
  const ran = useRef(false);

  // Compute overall %.
  const overallPct = (() => {
    if (step === "done") return 100;
    let pct = 0;
    if (step === "download") {
      pct = 0;
    } else if (step === "extract") {
      pct = STEP_WEIGHTS.download;
      if (extractTotal > 0) pct += (extractIdx / extractTotal) * STEP_WEIGHTS.extract;
    } else if (step === "analyze") {
      pct = STEP_WEIGHTS.download + STEP_WEIGHTS.extract;
      pct += (analyzePct / 100) * STEP_WEIGHTS.analyze;
    } else if (step === "save") {
      pct = STEP_WEIGHTS.download + STEP_WEIGHTS.extract + STEP_WEIGHTS.analyze;
    }
    return Math.min(99, Math.round(pct));
  })();

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    // Activity feed animation
    let i = 0;
    const interval = setInterval(() => {
      setLines((cur) => [...cur, FEED[i]]);
      i++;
      if (i >= FEED.length) clearInterval(interval);
    }, LINE_DELAY_MS);

    // Smooth analyze-phase fake fill (eases toward 95% while AI runs)
    const analyzeTick = setInterval(() => {
      setAnalyzePct((p) => (p < 95 ? p + (95 - p) * 0.04 : p));
    }, 400);

    // Background processing
    (async () => {
      try {
        setStep("download");
        // 1. Fetch primary RFP documents
        const { data: docs, error } = await supabase
          .from("mission_documents")
          .select("id, title, file_url, document_type")
          .eq("mission_id", missionId)
          .eq("document_type", "primary_rfp");
        if (error) throw error;
        if (!docs || docs.length === 0) throw new Error("No primary RFP found.");

        // 2. Download each, extract text (browser-side)
        setStep("extract");
        setExtractTotal(docs.length);
        const allText: string[] = [];
        for (let idx = 0; idx < docs.length; idx++) {
          const d = docs[idx];
          if (!d.file_url) { setExtractIdx(idx + 1); continue; }
          const { data: blob, error: dErr } = await supabase.storage.from(BUCKET).download(d.file_url);
          if (dErr || !blob) { setExtractIdx(idx + 1); continue; }
          const fname = d.file_url.split("/").pop() || d.title || "doc.pdf";
          const file = new File([blob], fname, { type: blob.type });
          try {
            const text = await extractRFPText(file);
            if (text.trim().length > 0) {
              allText.push(`# ${d.title || fname}\n\n${text}`);
            }
          } catch (e) {
            console.warn("extract failed", fname, e);
          }
          setExtractIdx(idx + 1);
        }
        const combined = allText.join("\n\n---\n\n").slice(0, 700_000);
        if (combined.trim().length < 50) throw new Error("Could not extract text from the uploaded documents.");

        // 3. Server fn → AI → DB writes
        setStep("analyze");
        await runProcess({ data: { mission_id: missionId, primary_rfp_text: combined } });
        setStep("save");
        setAnalyzePct(100);
        aiDone.current = true;
      } catch (e: any) {
        console.error("IRIS processing failed", e);
        aiError.current = e?.message ?? "Processing failed.";
      }
    })();

    // Watcher: after both animation and processing complete, flip phase
    const watcher = setInterval(() => {
      const elapsed = Date.now() - startedAt.current;
      const animDone = elapsed >= FEED.length * LINE_DELAY_MS + 500;
      const procDone = aiDone.current || aiError.current !== null;
      if (animDone && procDone) {
        clearInterval(watcher);
        if (aiError.current) {
          setErrMsg(aiError.current);
          setPhase("error");
        } else {
          setStep("done");
          setPhase("done");
        }
      }
      // Safety: at 60s force resolution
      if (elapsed > 60_000) {
        clearInterval(watcher);
        if (aiError.current) {
          setErrMsg(aiError.current);
          setPhase("error");
        } else if (aiDone.current) {
          setStep("done");
          setPhase("done");
        } else {
          setErrMsg("Processing timed out.");
          setPhase("error");
        }
      }
    }, 300);

    return () => {
      clearInterval(interval);
      clearInterval(analyzeTick);
      clearInterval(watcher);
    };
  }, [missionId, runProcess]);

  const stepLabel =
    step === "extract" && extractTotal > 0
      ? `${STEP_LABELS.extract} (${Math.min(extractIdx, extractTotal)} of ${extractTotal})`
      : STEP_LABELS[step];

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4 py-10">
      <IrisPulse mode={phase === "running" ? "active" : phase === "done" ? "idle" : "off"} />

      {phase === "running" && (
        <div className="mt-8 w-full max-w-xl space-y-4">
          <div className="space-y-2">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-foreground/80 font-medium">{stepLabel}</span>
              <span className="text-[var(--athena-gold)] font-mono tabular-nums">{overallPct}%</span>
            </div>
            <Progress
              value={overallPct}
              className="h-2 bg-[var(--athena-gold)]/15 [&>div]:bg-[var(--athena-gold)]"
            />
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Step {step === "download" ? 1 : step === "extract" ? 2 : step === "analyze" ? 3 : 4} of 4
            </p>
          </div>

          <div className="space-y-2 pt-4">
            {lines.map((l, i) => (
              <p
                key={i}
                className="text-foreground/90 text-sm animate-[wizard-rise_0.4s_ease-out_both]"
              >
                {l}
              </p>
            ))}
          </div>
        </div>
      )}

      {phase === "done" && (
        <div className="mt-10 max-w-xl space-y-6">
          <p className="text-lg text-foreground leading-relaxed">
            I have read everything. Here is what I found. Walk through it with me — section by section — and tell me what I got right.
          </p>
          <Button
            onClick={onContinue}
            className="bg-[var(--athena-gold)] text-[var(--athena-navy-dark)] hover:bg-[var(--athena-gold-light)] min-w-[240px]"
          >
            Review with IRIS →
          </Button>
        </div>
      )}


      {phase === "error" && (
        <div className="mt-10 max-w-xl space-y-6">
          <p className="text-lg text-foreground leading-relaxed">
            I had trouble reading your documents. You can continue and fill in the section details manually,
            or go back and try uploading again.
          </p>
          {errMsg && <p className="text-xs text-muted-foreground">{errMsg}</p>}
          <div className="flex flex-wrap gap-3 justify-center">
            <Button
              onClick={onContinue}
              className="bg-[var(--athena-gold)] text-[var(--athena-navy-dark)] hover:bg-[var(--athena-gold-light)]"
            >
              Continue Manually →
            </Button>
            <Button
              variant="outline"
              onClick={() => window.history.back()}
              className="border-[var(--athena-gold)]/40 text-foreground"
            >
              ← Go Back
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function IrisPulse({ mode }: { mode: "active" | "idle" | "off" }) {
  return (
    <div className="relative h-36 w-36 flex items-center justify-center">
      {mode !== "off" && (
        <>
          <span
            className={cn(
              "absolute inset-0 rounded-full border border-[#8b6dff]",
              mode === "active"
                ? "animate-[iris-pulse_1.8s_ease-out_infinite] opacity-60"
                : "animate-[iris-pulse_3s_ease-out_infinite] opacity-30",
            )}
          />
          <span
            className={cn(
              "absolute inset-3 rounded-full border border-[#67e8f9]/60",
              mode === "active"
                ? "animate-[iris-pulse_1.8s_ease-out_infinite] [animation-delay:0.6s] opacity-50"
                : "animate-[iris-pulse_3s_ease-out_infinite] opacity-20",
            )}
          />
        </>
      )}
      <IrisMark
        size={88}
        glow={mode === "active"}
        className={cn(
          "relative transition-opacity",
          mode === "active" && "animate-[iris-breathe_2.4s_ease-in-out_infinite]",
          mode === "idle" && "opacity-90",
          mode === "off" && "opacity-40 grayscale",
        )}
      />
    </div>
  );
}

