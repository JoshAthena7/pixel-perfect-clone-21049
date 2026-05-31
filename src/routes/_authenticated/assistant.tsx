import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { askAssistant } from "@/lib/ai/assistant.functions";
import { useEngagement } from "@/hooks/use-engagement";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Sparkles, User } from "lucide-react";
import { PageGate } from "@/components/war-room/PageGate";

export const Route = createFileRoute("/_authenticated/assistant")({
  head: () => ({ meta: [{ title: "IRIS — Athena" }] }),
  component: () => <PageGate page="alignmentHub"><AssistantPage /></PageGate>,
});

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "What are our top 3 risks right now?",
  "Summarize today's huddles for the leadership stand-up.",
  "Which heat map sections are red or yellow and who owns them?",
  "Based on client pulse, what should we address in the next meeting?",
];

function AssistantPage() {
  const { engagement, canEdit } = useEngagement();
  const canAsk = canEdit("alignmentHub");
  const ask = useServerFn(askAssistant);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, loading]);

  async function send(text: string) {
    if (!engagement || !text.trim() || loading || !canAsk) return;
    const next: Msg[] = [...messages, { role: "user", content: text.trim() }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = await ask({ data: { engagementId: engagement.id, messages: next } });
      setMessages([...next, { role: "assistant", content: res.reply }]);
    } catch (e: any) {
      toast.error(e?.message ?? "Assistant failed");
      setMessages(next);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-4xl flex-col gap-4 p-4 md:p-8">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold"><Sparkles className="h-5 w-5 text-primary" /> Athena Assistant</h1>
        <p className="text-sm text-muted-foreground">Grounded in your engagement's huddles, heat map, risks, decisions, and pulse.</p>
      </div>

      <Card className="flex flex-1 flex-col border-border bg-surface">
        <div ref={scrollRef} className="flex-1 overflow-auto p-6">
          {messages.length === 0 ? (
            canAsk ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">Try one of these:</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => send(s)} className="rounded-md border border-border bg-surface-hover/40 p-3 text-left text-sm hover:border-primary/50 hover:bg-surface-hover">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-center text-sm text-muted-foreground">
                <Sparkles className="mb-2 h-6 w-6 text-primary/60" />
                <p className="font-medium text-foreground">Read-only view</p>
                <p className="mt-1 max-w-sm">Your role can view Navigator conversations but cannot submit new questions. Ask a lead to run the prompt for you.</p>
              </div>
            )
          ) : (
            <div className="space-y-4">
              {messages.map((m, i) => (
                <div key={i} className={`flex gap-3 ${m.role === "user" ? "justify-end" : ""}`}>
                  {m.role === "assistant" && <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"><Sparkles className="h-3.5 w-3.5" /></div>}
                  <div className={`max-w-[80%] whitespace-pre-wrap rounded-lg px-4 py-2.5 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-surface-hover/60"}`}>
                    {m.content}
                  </div>
                  {m.role === "user" && <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-hover"><User className="h-3.5 w-3.5" /></div>}
                </div>
              ))}
              {loading && (
                <div className="flex gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"><Sparkles className="h-3.5 w-3.5 animate-pulse" /></div>
                  <div className="rounded-lg bg-surface-hover/60 px-4 py-2.5 text-sm text-muted-foreground">Thinking…</div>
                </div>
              )}
            </div>
          )}
        </div>

        {canAsk && (
          <form
            onSubmit={(e) => { e.preventDefault(); send(input); }}
            className="border-t border-border p-4"
          >
            <div className="flex gap-2">
              <Textarea
                rows={2}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
                placeholder="Ask about risks, huddles, decisions, client signals…"
                className="resize-none"
              />
              <Button type="submit" disabled={loading || !input.trim()}>Send</Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
