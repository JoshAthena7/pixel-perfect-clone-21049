/**
 * Writer's Block dialog — "Stuck?" lifeline for the expanded question.
 *
 * Records every session in atlas_writer_block_sessions. was_helpful toggles
 * on "That helped" vs "Try a different approach".
 */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Zap, Copy, RefreshCcw, CheckCircle2, BrickWall } from "lucide-react";
import { unstickMe, markBlockSession } from "@/lib/atlas-writers-block.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const GOLD = "#C49A2B";

type Block = "dont_know_where_to_start" | "have_ideas_cant_organize" | "sounds_generic" | "know_what_not_how";

const BLOCKS: { id: Block; title: string; sub: string }[] = [
  { id: "dont_know_where_to_start", title: "I don't know where to start", sub: "IRIS gives you a first sentence and structure" },
  { id: "have_ideas_cant_organize", title: "I have ideas but can't organize them", sub: "IRIS builds an outline from what you've got" },
  { id: "sounds_generic",           title: "I'm writing but it sounds generic", sub: "IRIS shows you how to make it specific to this mission" },
  { id: "know_what_not_how",        title: "I know what to say but not how to say it", sub: "IRIS writes your opening paragraph" },
];

export function WritersBlockDialog({
  open, onOpenChange, missionId, questionId, questionNumber, questionText, dueDate, status,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  missionId: string | null;
  questionId: string | null;
  questionNumber: string | null;
  questionText: string | null;
  dueDate: string | null;
  status: string | null;
}) {
  const unstick = useServerFn(unstickMe);
  const mark = useServerFn(markBlockSession);
  const [block, setBlock] = useState<Block | null>(null);
  const [freeText, setFreeText] = useState("");
  const [showCtx, setShowCtx] = useState(false);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setBlock(null); setFreeText(""); setShowCtx(false);
    setResponse(null); setSessionId(null); setError(null); setLoading(false);
  }

  function close() { reset(); onOpenChange(false); }

  async function run(forceNew = false) {
    if (!missionId || !questionId || !block) return;
    setLoading(true); setError(null);
    try {
      const out = await unstick({ data: {
        missionId, questionId, blockType: block,
        freeText: freeText.trim() || undefined,
        sessionId: forceNew ? undefined : (sessionId ?? undefined),
      } });
      setResponse(out.text);
      if (out.sessionId) setSessionId(out.sessionId);
    } catch (e) {
      setError((e as Error).message || "IRIS is thinking — try again in a moment.");
    } finally {
      setLoading(false);
    }
  }

  async function tryAgain() {
    if (sessionId) await mark({ data: { sessionId, wasHelpful: false } }).catch(() => {});
    await run(true);
  }

  async function helped() {
    if (sessionId) await mark({ data: { sessionId, wasHelpful: true } }).catch(() => {});
    if (missionId && questionId) {
      const { data: me } = await supabase.auth.getUser();
      if (me.user) {
        await supabase.from("mission_assist_events").insert({
          mission_id: missionId, question_id: questionId, user_id: me.user.id,
          event_type: "assist_acknowledged", metadata: { source: "writers_block" } as any,
        });
      }
    }
    toast.success("Glad that helped.");
    close();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) close(); else onOpenChange(v); }}>
      <DialogContent className="max-w-[640px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[14px]">
            <BrickWall className="h-4 w-4" style={{ color: GOLD }} /> Stuck? IRIS can unstick you.
          </DialogTitle>
          <div className="text-[11.5px] text-muted-foreground">Tell IRIS what's blocking you.</div>
        </DialogHeader>

        <div className="rounded-md px-3 py-2 text-[11.5px]" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="font-mono text-[11px]" style={{ color: GOLD }}>{questionNumber ?? "?"}</div>
          <div className="text-white/85 line-clamp-2">{questionText}</div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {status ?? "—"}{dueDate ? ` · due ${new Date(dueDate).toLocaleDateString()}` : ""}
          </div>
        </div>

        {!response && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {BLOCKS.map((b) => {
                const sel = block === b.id;
                return (
                  <button
                    key={b.id}
                    onClick={() => setBlock(b.id)}
                    className="text-left rounded-md p-3"
                    style={{
                      background: sel ? "rgba(196,154,43,0.1)" : "rgba(255,255,255,0.03)",
                      border: `1px solid ${sel ? GOLD : "rgba(255,255,255,0.08)"}`,
                    }}
                  >
                    <div className="text-[12px] font-medium" style={{ color: sel ? GOLD : "white" }}>{b.title}</div>
                    <div className="mt-1 text-[10.5px] text-muted-foreground">{b.sub}</div>
                  </button>
                );
              })}
            </div>

            <div>
              <button
                onClick={() => setShowCtx((s) => !s)}
                className="text-[12px] text-muted-foreground hover:text-white"
              >
                {showCtx ? "▾" : "▸"} Add context
              </button>
              {showCtx && (
                <textarea
                  value={freeText}
                  onChange={(e) => setFreeText(e.target.value.slice(0, 150))}
                  placeholder="Add up to 150 characters of context for IRIS…"
                  className="mt-1.5 w-full text-[12px] px-2 py-1.5 rounded-md bg-background/60 text-white border focus:outline-none placeholder:text-muted-foreground"
                  style={{ borderColor: "rgba(255,255,255,0.1)", minHeight: 60 }}
                />
              )}
            </div>

            <button
              onClick={() => run(false)}
              disabled={!block || loading}
              className="inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-[12.5px] font-medium disabled:opacity-50"
              style={{ background: GOLD, color: "#1a1306" }}
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
              {loading ? "IRIS is finding your way in…" : "Unstick me"}
            </button>

            {error && <div className="text-[11.5px]" style={{ color: "#f08080" }}>{error}</div>}
          </>
        )}

        {response && (
          <>
            <div className="rounded-md px-3 py-2.5" style={{ background: "rgba(255,255,255,0.02)", borderLeft: `3px solid ${GOLD}` }}>
              <div className="text-[11px] font-medium flex items-center gap-1" style={{ color: GOLD }}>
                <Zap className="h-3 w-3" /> IRIS · Unstick
              </div>
              <div className="mt-2 text-[12.5px] whitespace-pre-wrap" style={{ color: "rgba(255,255,255,0.88)", lineHeight: 1.7 }}>
                {response}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => { navigator.clipboard.writeText(response).catch(() => {}); toast.success("Copied"); }}
                className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-[11.5px] font-medium"
                style={{ background: "rgba(196,154,43,0.12)", border: `1px solid ${GOLD}`, color: GOLD }}
              >
                <Copy className="h-3 w-3" /> Copy this
              </button>
              <button
                onClick={tryAgain}
                disabled={loading}
                className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-[11.5px] text-muted-foreground hover:text-white disabled:opacity-60"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                <RefreshCcw className="h-3 w-3" /> Try a different approach
              </button>
              <button
                onClick={helped}
                className="ml-auto inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-[11.5px] font-medium"
                style={{ background: "rgba(61,190,125,0.15)", border: "1px solid rgba(61,190,125,0.5)", color: "#3DBE7D" }}
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> That helped — close
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
