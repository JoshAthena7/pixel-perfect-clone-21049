import { useEffect, useMemo, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Brain, X, Send, Bookmark, BookmarkCheck, Trash2, Globe, Building, Briefcase } from "lucide-react";
import { askAssistant, saveInsight, listSavedInsights, deleteSavedInsight } from "@/lib/ai/assistant.functions";
import { useEngagement } from "@/hooks/use-engagement";
import { toast } from "sonner";
import { relativeTime } from "@/lib/time";

type Scope = "engagement" | "all" | "firm";
type Source = { source_table: string; source_id: string; similarity: number; preview: string };
type Exchange = { id: string; question: string; answer: string; sources: Source[]; at: string };

const ROUTE_CHIPS: Record<string, string[]> = {
  "/command": [
    "Summarize engagement health",
    "What needs attention today?",
    "What have we decided about strategy?",
    "Who is at risk of being overloaded?",
  ],
  "/heatmap": [
    "Which sections are highest risk?",
    "What does the RFP require for this section?",
    "How did similar bids handle this?",
    "What's the evaluator weight for this section?",
  ],
  "/research": [
    "What's the incumbent's biggest weakness?",
    "Which Collective™ members know this state?",
    "What did we win on in similar bids?",
    "Summarize the competitive landscape",
  ],
  "/writer/my-sections": [
    "What are the win themes for my section?",
    "What does the RFP say I must address?",
    "Find similar approved content",
    "What word count should I aim for?",
  ],
  "/admin": [
    "Which engagement needs attention most urgently?",
    "Are any writers overloaded across rooms?",
    "What intelligence alerts are unreviewed?",
    "Summarize portfolio health",
  ],
  "/issues": [
    "What patterns do you see in our SOS alerts?",
    "Which risks are highest priority?",
    "How have we resolved similar issues before?",
    "Who should own this?",
  ],
};

const DEFAULT_CHIPS = [
  "Summarize what's happening right now",
  "What should I focus on next?",
  "Find something I've worked on before",
  "Brainstorm with me",
];

function chipsForRoute(path: string): string[] {
  if (path.startsWith("/admin")) return ROUTE_CHIPS["/admin"];
  if (path.startsWith("/writer/my-sections")) return ROUTE_CHIPS["/writer/my-sections"];
  for (const key of Object.keys(ROUTE_CHIPS)) {
    if (key === "/admin" || key === "/writer/my-sections") continue;
    if (path === key || path.startsWith(key + "/")) return ROUTE_CHIPS[key];
  }
  return DEFAULT_CHIPS;
}

export function AskAthenaWidget() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { engagement, member, isLeadership } = useEngagement();
  const ask = useServerFn(askAssistant);
  const save = useServerFn(saveInsight);
  const listSaved = useServerFn(listSavedInsights);
  const removeSaved = useServerFn(deleteSavedInsight);

  const writerOnly = !!member && !isLeadership;
  const allowScopeToggle = !writerOnly;

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"ask" | "saved">("ask");
  const [scope, setScope] = useState<Scope>("engagement");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<Exchange[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Array<{
    id: string; question: string; answer: string; saved_at: string; sources: any[]; scope: string; engagement_id: string | null;
  }>>([]);
  const [savedLoading, setSavedLoading] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // force scope to engagement for writers
  useEffect(() => {
    if (writerOnly && scope !== "engagement") setScope("engagement");
  }, [writerOnly, scope]);

  // ⌘K / Ctrl+K toggle; Escape close
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === "Escape" && open) setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [history.length, loading]);

  async function loadSaved() {
    setSavedLoading(true);
    try {
      const rows = await listSaved();
      setSaved(rows);
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't load saved insights");
    } finally {
      setSavedLoading(false);
    }
  }

  useEffect(() => {
    if (open && tab === "saved") loadSaved();
  }, [open, tab]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || loading) return;
    setInput("");
    setLoading(true);
    const prevMsgs = history.flatMap((h) => [
      { role: "user" as const, content: h.question },
      { role: "assistant" as const, content: h.answer },
    ]);
    try {
      const res = await ask({
        data: {
          engagementId: scope === "engagement" ? engagement?.id ?? null : null,
          scope,
          messages: [...prevMsgs, { role: "user", content: q }],
        },
      });
      const ex: Exchange = {
        id: crypto.randomUUID(),
        question: q,
        answer: res.reply,
        sources: (res.sources ?? []) as Source[],
        at: new Date().toISOString(),
      };
      setHistory((prev) => [...prev.slice(-9), ex]);
    } catch (e: any) {
      toast.error(e?.message ?? "Athena couldn't answer that.");
    } finally {
      setLoading(false);
    }
  }

  async function onSave(ex: Exchange) {
    try {
      await save({
        data: {
          engagementId: scope === "engagement" ? engagement?.id ?? null : null,
          scope,
          question: ex.question,
          answer: ex.answer,
          sources: ex.sources,
        },
      });
      setSavedIds((prev) => new Set(prev).add(ex.id));
      toast.success("Saved");
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't save");
    }
  }

  async function onDelete(id: string) {
    try {
      await removeSaved({ data: { id } });
      setSaved((prev) => prev.filter((s) => s.id !== id));
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't delete");
    }
  }

  const chips = useMemo(() => chipsForRoute(pathname), [pathname]);
  const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);
  const shortcutLabel = isMac ? "⌘K" : "Ctrl+K";

  return (
    <>
      {/* Fixed bottom bar */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-0 left-0 right-0 z-30 flex items-center gap-3 border-t border-border bg-background/95 px-4 py-2.5 backdrop-blur transition hover:bg-background"
        style={{ paddingLeft: "calc(var(--sidebar-width, 0px) + 1rem)" }}
        aria-label="Open Ask Navigator"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
          <Brain className="h-4 w-4" />
        </span>
        <span className="flex-1 truncate text-left text-sm text-muted-foreground">
          Ask Navigator anything — research, brainstorm, reference…
        </span>
        <kbd className="hidden rounded border border-border bg-surface px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground sm:inline">
          {shortcutLabel}
        </kbd>
      </button>

      {/* Slide-up panel */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-40 transform transition-transform duration-300 ease-out ${open ? "translate-y-0" : "translate-y-full"}`}
        style={{
          height: "42vh",
          paddingLeft: "var(--sidebar-width, 0px)",
        }}
        aria-hidden={!open}
      >
        <div className="flex h-full flex-col border-t border-border bg-background shadow-2xl">
          {/* Top bar */}
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">Ask Navigator</span>
              <div className="ml-3 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setTab("ask")}
                  className={`rounded px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider ${tab === "ask" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Ask
                </button>
                <button
                  type="button"
                  onClick={() => setTab("saved")}
                  className={`rounded px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider ${tab === "saved" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Saved
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {tab === "ask" && allowScopeToggle && (
                <div className="flex items-center gap-1 rounded-md border border-border bg-surface p-0.5 text-[11px]">
                  <ScopeBtn active={scope === "engagement"} onClick={() => setScope("engagement")} disabled={!engagement} icon={<Briefcase className="h-3 w-3" />} label="This engagement" />
                  <ScopeBtn active={scope === "all"} onClick={() => setScope("all")} icon={<Globe className="h-3 w-3" />} label="All engagements" />
                  <ScopeBtn active={scope === "firm"} onClick={() => setScope("firm")} icon={<Building className="h-3 w-3" />} label="Firm knowledge" />
                </div>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded p-1 text-muted-foreground hover:bg-surface hover:text-foreground"
                aria-label="Close Ask Navigator (Esc)"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {tab === "ask" ? (
            <>
              {/* History */}
              <div ref={scrollRef} className="flex-1 overflow-auto px-4 py-3 space-y-4">
                {history.length === 0 && !loading && (
                  <div className="text-[12px] text-muted-foreground">
                    Pick a quick prompt below or type a question. Answers are grounded in {scope === "engagement" ? "this engagement" : scope === "all" ? "every engagement you can access" : "firm-wide knowledge"}.
                  </div>
                )}
                {history.map((ex) => (
                  <div key={ex.id} className="space-y-2">
                    <div className="flex justify-end">
                      <div className="max-w-[85%] rounded-lg bg-primary/15 px-3 py-2 text-sm">{ex.question}</div>
                    </div>
                    <div className="rounded-lg border border-border bg-surface/60 px-3 py-2.5 text-sm leading-relaxed whitespace-pre-wrap">
                      {ex.answer}
                      {ex.sources.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {ex.sources.slice(0, 8).map((s) => (
                            <span
                              key={`${s.source_table}-${s.source_id}`}
                              title={s.preview}
                              className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] text-muted-foreground"
                            >
                              {s.source_table.replace(/_/g, " ")} · {s.source_id.slice(0, 6)}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground">{relativeTime(ex.at)}</span>
                        <button
                          type="button"
                          onClick={() => onSave(ex)}
                          disabled={savedIds.has(ex.id)}
                          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
                        >
                          {savedIds.has(ex.id) ? <BookmarkCheck className="h-3 w-3 text-primary" /> : <Bookmark className="h-3 w-3" />}
                          {savedIds.has(ex.id) ? "Saved" : "Save this answer"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="rounded-lg border border-border bg-surface/60 px-3 py-2.5 text-[12px] text-muted-foreground">
                    Athena is thinking…
                  </div>
                )}
              </div>

              {/* Quick prompts */}
              <div className="flex flex-wrap gap-1.5 border-t border-border bg-surface/40 px-4 py-2">
                {chips.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => send(c)}
                    disabled={loading}
                    className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] text-muted-foreground hover:border-primary/50 hover:text-foreground disabled:opacity-50"
                  >
                    {c}
                  </button>
                ))}
              </div>

              {/* Input */}
              <form
                onSubmit={(e) => { e.preventDefault(); send(input); }}
                className="flex items-end gap-2 border-t border-border px-4 py-3"
              >
                <textarea
                  ref={inputRef}
                  rows={1}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
                  }}
                  placeholder="Type a question — Enter to send, Shift+Enter for new line"
                  className="flex-1 resize-none rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary/50 max-h-32"
                />
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" /> Send
                </button>
              </form>
            </>
          ) : (
            <div className="flex-1 overflow-auto px-4 py-3 space-y-3">
              {savedLoading && <div className="text-[12px] text-muted-foreground">Loading saved…</div>}
              {!savedLoading && saved.length === 0 && (
                <div className="text-[12px] text-muted-foreground">No saved answers yet. Tap "Save this answer" under any reply.</div>
              )}
              {saved.map((s) => (
                <div key={s.id} className="rounded-lg border border-border bg-surface/60 px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{s.question}</div>
                      <div className="mt-1.5 whitespace-pre-wrap text-[13px] text-muted-foreground line-clamp-6">{s.answer}</div>
                      <div className="mt-2 flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                        <span>{s.scope}</span>
                        <span>·</span>
                        <span>{relativeTime(s.saved_at)}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onDelete(s.id)}
                      className="rounded p-1 text-muted-foreground hover:bg-surface hover:text-destructive"
                      aria-label="Delete saved insight"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function ScopeBtn({
  active, onClick, icon, label, disabled,
}: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] disabled:opacity-40 ${active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}
      title={label}
    >
      {icon}
      <span className="hidden md:inline">{label}</span>
    </button>
  );
}
