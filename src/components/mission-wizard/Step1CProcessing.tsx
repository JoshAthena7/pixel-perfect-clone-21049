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
  const startedAt = useRef<number>(Date.now());
  const aiDone = useRef<boolean>(false);
  const aiError = useRef<string | null>(null);
  const ran = useRef(false);

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

    // Background processing
    (async () => {
      try {
        // 1. Fetch primary RFP documents
        const { data: docs, error } = await supabase
          .from("mission_documents")
          .select("id, title, file_url, document_type")
          .eq("mission_id", missionId)
          .eq("document_type", "primary_rfp");
        if (error) throw error;
        if (!docs || docs.length === 0) throw new Error("No primary RFP found.");

        // 2. Download each, extract text (browser-side)
        const allText: string[] = [];
        for (const d of docs) {
          if (!d.file_url) continue;
          const { data: blob, error: dErr } = await supabase.storage.from(BUCKET).download(d.file_url);
          if (dErr || !blob) continue;
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
        }
        const combined = allText.join("\n\n---\n\n").slice(0, 700_000);
        if (combined.trim().length < 50) throw new Error("Could not extract text from the uploaded documents.");

        // 3. Server fn → AI → DB writes
        await runProcess({ data: { mission_id: missionId, primary_rfp_text: combined } });
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
          setPhase("done");
        } else {
          setErrMsg("Processing timed out.");
          setPhase("error");
        }
      }
    }, 300);

    return () => {
      clearInterval(interval);
      clearInterval(watcher);
    };
  }, [missionId, runProcess]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4 py-10">
      <IrisPulse mode={phase === "running" ? "active" : phase === "done" ? "idle" : "off"} />

      {phase === "running" && (
        <div className="mt-10 space-y-2 max-w-xl">
          {lines.map((l, i) => (
            <p
              key={i}
              className="text-foreground text-base animate-[wizard-rise_0.4s_ease-out_both]"
            >
              {l}
            </p>
          ))}
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
    <div className="relative h-32 w-32 flex items-center justify-center">
      {mode !== "off" && (
        <>
          <span
            className={cn(
              "absolute inset-0 rounded-full border-2 border-[var(--athena-gold)]",
              mode === "active"
                ? "animate-[iris-pulse_1.5s_ease-out_infinite] opacity-70"
                : "animate-[iris-pulse_3s_ease-out_infinite] opacity-40",
            )}
          />
          <span
            className={cn(
              "absolute inset-2 rounded-full border-2 border-[var(--athena-gold)]/60",
              mode === "active"
                ? "animate-[iris-pulse_1.5s_ease-out_infinite] [animation-delay:0.5s] opacity-50"
                : "animate-[iris-pulse_3s_ease-out_infinite] opacity-25",
            )}
          />
        </>
      )}
      <span
        className={cn(
          "relative h-14 w-14 rounded-full bg-[var(--athena-gold)]",
          mode === "active" && "shadow-[0_0_40px_var(--athena-gold-glow)]",
          mode === "idle" && "opacity-70",
          mode === "off" && "opacity-30",
        )}
      />
    </div>
  );
}
