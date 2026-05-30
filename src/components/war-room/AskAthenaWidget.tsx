import { useEffect, useMemo, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Brain, X, Send, Bookmark, BookmarkCheck, Trash2, Globe, Building, Briefcase, Radar, ExternalLink, Sparkles } from "lucide-react";
import { askAssistant, saveInsight, listSavedInsights, deleteSavedInsight } from "@/lib/ai/assistant.functions";
import { useEngagement } from "@/hooks/use-engagement";
import { toast } from "sonner";
import { relativeTime } from "@/lib/time";

type Scope = "engagement" | "all" | "firm";
type Source = { source_table: string; source_id: string; similarity: number; preview: string };
type ReplySource = "vault" | "live-search" | "deep-search" | "iris-identity";

const IRIS_SIGNATURE = "Athena thinks. Iris delivers.";
const IRIS_WELCOME = "I am Iris — Athena's intelligence. Ask me anything about your Missions, the market, policy shifts, or the Vault. Athena thinks. Iris delivers.";

function splitIrisSignature(text: string): { body: string; signature: string | null } {
  const idx = text.lastIndexOf(IRIS_SIGNATURE);
  if (idx === -1) return { body: text, signature: null };
  return { body: text.slice(0, idx).trimEnd(), signature: IRIS_SIGNATURE };
}
type Exchange = {
  id: string;
  question: string;
  answer: string;
  sources: Source[];
  citations: string[];
  source: ReplySource;
  at: string;
};

type Chip = { label: string; live?: boolean };

const ROUTE_CHIPS: Record<string, Chip[]> = {
  "/command": [
    { label: "Summarize engagement health" },
    { label: "What needs attention today?" },
    { label: "What have we decided about strategy?" },
    { label: "Who is at risk of being overloaded?" },
    { label: "Any new policy affecting this engagement?", live: true },
  ],
  "/heatmap": [
    { label: "Which sections are highest risk?" },
    { label: "What does the RFP require for this section?" },
    { label: "How did similar bids handle this?" },
    { label: "What's the evaluator weight for this section?" },
  ],
  "/research": [
    { label: "What's the incumbent's biggest weakness?" },
    { label: "Which Collective™ members know this state?" },
    { label: "What did we win on in similar bids?" },
    { label: "Summarize the competitive landscape" },
    { label: "What did CMS release this week?", live: true },
    { label: "Latest state Medicaid news", live: true },
    { label: "Recent competitor activity in this state", live: true },
  ],
  "/writer/my-sections": [
    { label: "What are the win themes for my section?" },
    { label: "What does the RFP say I must address?" },
    { label: "Find similar approved content" },
    { label: "What word count should I aim for?" },
    { label: "Latest guidance on this section topic", live: true },
  ],
  "/admin": [
    { label: "Which engagement needs attention most urgently?" },
    { label: "Are any writers overloaded across rooms?" },
    { label: "What intelligence alerts are unreviewed?" },
    { label: "Summarize portfolio health" },
  ],
  "/issues": [
    { label: "What patterns do you see in our SOS alerts?" },
    { label: "Which risks are highest priority?" },
    { label: "How have we resolved similar issues before?" },
    { label: "Who should own this?" },
  ],
};

const DEFAULT_CHIPS: Chip[] = [
  { label: "Summarize what's happening right now" },
  { label: "What should I focus on next?" },
  { label: "Find something I've worked on before" },
  { label: "Brainstorm with me" },
];

function chipsForRoute(path: string): Chip[] {
  if (path.startsWith("/admin")) return ROUTE_CHIPS["/admin"];
  if (path.startsWith("/writer/my-sections")) return ROUTE_CHIPS["/writer/my-sections"];
  for (const key of Object.keys(ROUTE_CHIPS)) {
    if (key === "/admin" || key === "/writer/my-sections") continue;
    if (path === key || path.startsWith(key + "/")) return ROUTE_CHIPS[key];
  }
  return DEFAULT_CHIPS;
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 32);
  }
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
  const [liveSearch, setLiveSearch] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [deepLoadingId, setDeepLoadingId] = useState<string | null>(null);
  const [history, setHistory] = useState<Exchange[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Array<{
    id: string; question: string; answer: string; saved_at: string; sources: any[]; scope: string; engagement_id: string | null;
  }>>([]);
  const [savedLoading, setSavedLoading] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (writerOnly && scope !== "engagement") setScope("engagement");
  }, [writerOnly, scope]);

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
    if (open) setTimeout(() => inputRef.current?.focus(), 60);
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

  async function send(text: string, opts?: { forceLive?: boolean }) {
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
          forceLive: opts?.forceLive ?? liveSearch,
        },
      });
      const ex: Exchange = {
        id: crypto.randomUUID(),
        question: q,
        answer: res.reply,
        sources: (res.sources ?? []) as Source[],
        citations: (res.citations ?? []) as string[],
        source: ((res as any).source ?? "vault") as ReplySource,
        at: new Date().toISOString(),
      };
      setHistory((prev) => [...prev.slice(-9), ex]);
    } catch (e: any) {
      toast.error(e?.message ?? "Navigator couldn't answer that.");
    } finally {
      setLoading(false);
    }
  }

  async function runDeep(ex: Exchange) {
    if (deepLoadingId) return;
    setDeepLoadingId(ex.id);
    try {
      // Build prior context (up to and excluding this exchange)
      const idx = history.findIndex((h) => h.id === ex.id);
      const priors = (idx > 0 ? history.slice(0, idx) : []).flatMap((h) => [
        { role: "user" as const, content: h.question },
        { role: "assistant" as const, content: h.answer },
      ]);
      const deepQuery = ex.question.toLowerCase().includes("deep research")
        ? ex.question
        : `Deep research: ${ex.question}`;
      const res = await ask({
        data: {
          engagementId: scope === "engagement" ? engagement?.id ?? null : null,
          scope,
          messages: [...priors, { role: "user", content: deepQuery }],
        },
      });
      setHistory((prev) =>
        prev.map((h) =>
          h.id === ex.id
            ? {
                ...h,
                answer: res.reply,
                sources: (res.sources ?? []) as Source[],
                citations: (res.citations ?? []) as string[],
                source: ((res as any).source ?? "deep-search") as ReplySource,
              }
            : h,
        ),
      );
    } catch (e: any) {
      toast.error(e?.message ?? "Deep research failed.");
    } finally {
      setDeepLoadingId(null);
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

      <div
        className={`fixed bottom-0 left-0 right-0 z-40 transform transition-transform duration-300 ease-out ${open ? "translate-y-0" : "translate-y-full"}`}
        style={{ height: "42vh", paddingLeft: "var(--sidebar-width, 0px)" }}
        aria-hidden={!open}
      >
        <div className="flex h-full flex-col border-t border-border bg-background shadow-2xl">
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
              {tab === "ask" && (
                <button
                  type="button"
                  onClick={() => setLiveSearch((v) => !v)}
                  title="Route every query to live web search (Perplexity)"
                  className={`ml-2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider transition ${
                    liveSearch
                      ? "border-blue-500/60 bg-blue-500/15 text-blue-300"
                      : "border-border bg-surface text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Radar className={`h-3 w-3 ${liveSearch ? "animate-pulse" : ""}`} />
                  Live Search {liveSearch ? "On" : "Off"}
                </button>
              )}
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
              <div ref={scrollRef} className="flex-1 overflow-auto px-4 py-3 space-y-4">
                {history.length === 0 && !loading && input.trim().length === 0 && (
                  <div
                    className="whitespace-pre-wrap italic"
                    style={{ color: "#D4AE4A", fontSize: "10px", lineHeight: 1.7 }}
                  >
                    {IRIS_WELCOME}
                  </div>
                )}
                {history.map((ex) => {
                  const wordCount = ex.question.trim().split(/\s+/).length;
                  const isIris = ex.source === "iris-identity";
                  const showDeepBtn = !isIris && wordCount > 8 && ex.source !== "deep-search";
                  const isDeepLoading = deepLoadingId === ex.id;
                  const irisParts = isIris ? splitIrisSignature(ex.answer) : null;
                  return (
                    <div key={ex.id} className="space-y-2">
                      <div className="flex justify-end">
                        <div className="max-w-[85%] rounded-lg bg-primary/15 px-3 py-2 text-sm">{ex.question}</div>
                      </div>
                      <div className="rounded-lg border border-border bg-surface/60 px-3 py-2.5 text-sm leading-relaxed">
                        {ex.source === "live-search" && (
                          <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-blue-500/40 bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-blue-300">
                            <span className="relative flex h-1.5 w-1.5">
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
                              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-blue-400" />
                            </span>
                            Live
                          </div>
                        )}
                        {ex.source === "deep-search" && (
                          <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-purple-500/40 bg-purple-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-purple-300">
                            <Sparkles className="h-3 w-3" />
                            Deep Research
                          </div>
                        )}
                        {isIris && irisParts ? (
                          <>
                            <div className="whitespace-pre-wrap">{irisParts.body}</div>
                            {irisParts.signature && (
                              <div
                                className="mt-3 italic"
                                style={{ color: "#D4AE4A", fontSize: "10px" }}
                              >
                                {irisParts.signature}
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="whitespace-pre-wrap">{isDeepLoading ? "Running deep research…" : ex.answer}</div>
                        )}

                        {!isIris && ex.citations.length > 0 && !isDeepLoading && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {ex.citations.slice(0, 12).map((c, i) => (
                              <a
                                key={`${i}-${c}`}
                                href={c}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[10px] text-muted-foreground hover:border-primary/50 hover:text-foreground"
                                title={c}
                              >
                                {domainOf(c)}
                                <ExternalLink className="h-2.5 w-2.5" />
                              </a>
                            ))}
                          </div>
                        )}

                        {!isIris && ex.sources.length > 0 && !isDeepLoading && (
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

                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="text-[10px] text-muted-foreground">{relativeTime(ex.at)}</span>
                          <div className="flex items-center gap-2">
                            {showDeepBtn && (
                              <button
                                type="button"
                                onClick={() => runDeep(ex)}
                                disabled={isDeepLoading}
                                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-purple-300 hover:text-purple-200 disabled:opacity-50"
                              >
                                <Sparkles className="h-3 w-3" />
                                {isDeepLoading ? "Running deep research..." : "Deep Research"}
                              </button>
                            )}
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
                    </div>
                  );
                })}
                {loading && (
                  <div className="rounded-lg border border-border bg-surface/60 px-3 py-2.5 text-[12px] text-muted-foreground">
                    Navigator is thinking…
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5 border-t border-border bg-surface/40 px-4 py-2">
                {chips.map((c) => (
                  <button
                    key={c.label}
                    type="button"
                    onClick={() => send(c.label, { forceLive: c.live })}
                    disabled={loading}
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] hover:text-foreground disabled:opacity-50 ${
                      c.live
                        ? "border-blue-500/40 bg-blue-500/5 text-blue-300 hover:border-blue-500/70"
                        : "border-border bg-background text-muted-foreground hover:border-primary/50"
                    }`}
                  >
                    {c.live && <Radar className="h-3 w-3" />}
                    {c.label}
                  </button>
                ))}
              </div>

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
                  placeholder={liveSearch ? "Live web search — Enter to send" : "Type a question — Enter to send, Shift+Enter for new line"}
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
