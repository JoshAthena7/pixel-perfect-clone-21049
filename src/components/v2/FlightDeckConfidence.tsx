import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { setWriterConfidence } from "@/lib/pilot-copilot.functions";
import { toast } from "sonner";

type Level = "confident" | "uncertain" | "stuck";
const META: Record<Level, { glyph: string; color: string; label: string; desc: string }> = {
  confident: { glyph: "●", color: "#22c55e", label: "Confident", desc: "I know what I'm writing and I'm on track" },
  uncertain: { glyph: "◉", color: "#eab308", label: "Uncertain", desc: "I have a direction but I'm not sure it's right" },
  stuck:     { glyph: "○", color: "#ef4444", label: "Stuck",     desc: "I don't know how to approach this" },
};

export function ConfidenceButton({
  questionId, questionNumber, currentLevel, onStuckEscalate,
}: {
  questionId: string;
  questionNumber: string;
  currentLevel: Level | null;
  onStuckEscalate: () => void;
}) {
  const qc = useQueryClient();
  const fn = useServerFn(setWriterConfidence);
  const [open, setOpen] = useState(false);
  const [stuckPrompt, setStuckPrompt] = useState(false);

  const mut = useMutation({
    mutationFn: async (confidence: Level) => fn({ data: { questionId, confidence } }),
    onSuccess: (_d, confidence) => {
      qc.invalidateQueries({ queryKey: ["question", questionId] });
      qc.invalidateQueries({ queryKey: ["flight deck-my-questions"] });
      qc.invalidateQueries({ queryKey: ["pilot-status"] });
      setOpen(false);
      if (confidence === "stuck") setStuckPrompt(true);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const m = currentLevel ? META[currentLevel] : null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm hover:text-foreground hover:border-white/20"
        style={{ color: m?.color ?? "var(--muted-foreground)" }}
      >
        {m ? (
          <>
            <span style={{ color: m.color }}>{m.glyph}</span>
            {m.label}
          </>
        ) : (
          <span className="text-muted-foreground">My Confidence ▾</span>
        )}
      </button>
      {open && (
        <div className="absolute bottom-full right-0 mb-2 w-[320px] rounded-lg border border-white/10 bg-[#0a0e1a] p-3 shadow-2xl">
          <div className="mb-2 text-[11px] font-semibold text-muted-foreground">
            How do you feel about Q{questionNumber}?
          </div>
          <div className="space-y-1.5">
            {(Object.keys(META) as Level[]).map((k) => {
              const t = META[k];
              return (
                <button
                  key={k}
                  onClick={() => mut.mutate(k)}
                  className="block w-full rounded-md border border-white/5 bg-white/[0.02] p-2.5 text-left hover:bg-white/[0.06] transition"
                >
                  <div className="flex items-center gap-2">
                    <span style={{ color: t.color, fontSize: 14 }}>{t.glyph}</span>
                    <span className="text-[13px] font-semibold" style={{ color: t.color }}>{t.label}</span>
                  </div>
                  <div className="mt-0.5 pl-6 text-[11px] text-muted-foreground">{t.desc}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {stuckPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setStuckPrompt(false)}>
          <div className="w-full max-w-sm rounded-lg border border-white/10 bg-[#0a0e1a] p-5" onClick={(e) => e.stopPropagation()}>
            <div className="text-[14px] font-semibold">Would you like to tell your Co-Pilot you're stuck?</div>
            <div className="mt-1 text-[12px] text-muted-foreground">They can send you guidance to unblock you.</div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => { setStuckPrompt(false); onStuckEscalate(); }}
                className="flex-1 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
              >
                Yes, notify them →
              </button>
              <button
                onClick={() => setStuckPrompt(false)}
                className="flex-1 rounded-md border border-white/10 px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
              >
                Not yet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function ConfidenceDot({ level }: { level: Level | null }) {
  if (!level) return null;
  const m = META[level];
  return <span title={m.label} style={{ color: m.color, fontSize: 11 }}>{m.glyph}</span>;
}
