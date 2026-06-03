import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Send } from "lucide-react";
import { irisAskMission } from "@/lib/iris-ask.functions";
import irisLogo from "@/assets/iris-logo.png.asset.json";

export const Route = createFileRoute("/_authenticated/missions/$missionId/iris")({
  component: AskIrisPage,
});

function AskIrisPage() {
  const { missionId } = Route.useParams();
  const askFn = useServerFn(irisAskMission);
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState("");
  const [asking, setAsking] = useState(false);

  const onAsk = async () => {
    if (!prompt.trim()) return;
    setAsking(true);
    setAnswer("");
    try {
      const r = await askFn({ data: { missionId, prompt: prompt.trim() } });
      setAnswer(r.answer);
    } catch (e: any) {
      setAnswer(`_Error: ${e?.message ?? "unknown"}_`);
    } finally {
      setAsking(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <div className="mb-8">
        <div className="text-[10px] font-semibold uppercase tracking-[0.32em] text-muted-foreground">
          Mission Intelligence
        </div>
        <h1 className="mt-2 flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Sparkles className="h-5 w-5 text-[color:var(--iris,#22d3ee)]" /> Ask IRIS
        </h1>
      </div>

      <section className="rounded-[12px] border border-border bg-surface p-5 space-y-3">
        <div className="flex gap-2">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onAsk(); }}
            placeholder="Ask IRIS anything about this mission…"
            className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/60 focus:border-primary/60 focus:outline-none"
            autoFocus
          />
          <button
            onClick={onAsk}
            disabled={asking || !prompt.trim()}
            className="rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            <Send className="h-3.5 w-3.5" /> {asking ? "…" : "Send"}
          </button>
        </div>
        {(asking || answer) && (
          <div className="rounded-md border border-border bg-background/40 px-4 py-3 text-sm whitespace-pre-wrap text-[color:var(--iris,#22d3ee)]">
            {asking ? "IRIS is thinking…" : answer}
          </div>
        )}
      </section>
    </div>
  );
}
