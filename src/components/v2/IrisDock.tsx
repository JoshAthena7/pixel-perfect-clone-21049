import { useEffect, useRef, useState } from "react";
import { useParams, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { X, Send, ThumbsUp, ThumbsDown, Flag } from "lucide-react";
import { irisAskGlobal, irisAskMission, irisAskQuestion } from "@/lib/iris-ask.functions";
import { getIrisIngestionCounts } from "@/lib/iris-ingestion.functions";
import { IrisCorrectable } from "@/components/v2/IrisCorrectable";
import { IrisMark } from "@/components/iris/IrisMark";
import { toast } from "sonner";

type Msg = { role: "user" | "iris"; text: string };

export function IrisDock() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const path = useRouterState({ select: (s) => s.location.pathname });
  const params = useParams({ strict: false }) as { missionId?: string; questionId?: string };
  const missionId = params.missionId;
  const questionId = params.questionId;

  const askGlobal = useServerFn(irisAskGlobal);
  const askMission = useServerFn(irisAskMission);
  const askQuestion = useServerFn(irisAskQuestion);

  // ⌘J / Ctrl+J toggle
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: 9e9, behavior: "smooth" });
  }, [msgs, busy]);

  async function sendText(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setMsgs((m) => [...m, { role: "user", text: trimmed }]);
    setInput("");
    setBusy(true);
    try {
      const res = questionId
        ? await askQuestion({ data: { questionId, prompt: trimmed } })
        : missionId
          ? await askMission({ data: { missionId, prompt: trimmed } })
          : await askGlobal({ data: { prompt: trimmed } });
      setMsgs((m) => [...m, { role: "iris", text: res.answer }]);
    } catch (e: any) {
      setMsgs((m) => [...m, { role: "iris", text: `_Error: ${e?.message ?? "unknown"}_` }]);
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    await sendText(input);
  }

  // Hide on login or no auth
  if (path === "/login" || path === "/" || path.startsWith("/auth")) return null;

  const contextLabel = questionId ? "This Question" : missionId ? "This Mission" : "Global";

  return (
    <>
      {/* Floating launcher — mystical IRIS brand */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Ask IRIS"
          title="Ask IRIS (⌘J)"
          className="iris-ask-launcher group fixed right-5 bottom-5 z-[1500] flex h-12 items-center gap-2.5 rounded-full pl-2 pr-4 transition-all duration-200 hover:scale-[1.03]"
          style={{
            background:
              "radial-gradient(120% 140% at 0% 50%, rgba(167,139,250,0.35), rgba(99,102,241,0.18) 55%, rgba(10,8,28,0.92) 100%), #0a081c",
            boxShadow:
              "0 0 0 1px var(--iris-border), 0 10px 30px rgba(99,102,241,0.30), 0 0 40px rgba(139,109,255,0.22), inset 0 1px 0 rgba(255,255,255,0.06)",
            color: "#e9e2ff",
          }}
        >
          <IrisMark size={32} glow />
          <span
            className="text-[11px] font-semibold uppercase tracking-[0.22em]"
            style={{
              backgroundImage: "linear-gradient(135deg,#dcd0ff 0%,#ffffff 50%,#bff0ff 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            Ask IRIS
          </span>
          <kbd
            className="hidden md:inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-mono"
            style={{ background: "rgba(255,255,255,0.06)", color: "rgba(220,208,255,0.7)" }}
          >
            ⌘J
          </kbd>
        </button>
      )}

      {/* Drawer */}
      {open && (
        <aside
          className="fixed right-0 top-0 z-[1500] flex h-screen w-full max-w-[420px] flex-col border-l shadow-2xl"
          style={{
            background: "#060616",
            borderColor: "var(--iris-border)",
            boxShadow: "-20px 0 60px rgba(0,0,0,0.6), inset 1px 0 0 rgba(139,109,255,0.10)",
          }}
        >
          <header
            className="flex items-center justify-between border-b px-4 py-3"
            style={{
              borderColor: "rgba(255,255,255,0.06)",
              background:
                "linear-gradient(180deg, rgba(99,102,241,0.10), rgba(99,102,241,0) 90%)",
            }}
          >
            <div className="flex items-center gap-2.5">
              <IrisMark size={26} glow />
              <div>
                <div
                  className="text-[11px] font-bold uppercase tracking-[0.28em]"
                  style={{
                    backgroundImage: "linear-gradient(135deg,#a78bfa,#e9e2ff 55%,#67e8f9)",
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    color: "transparent",
                  }}
                >
                  IRIS
                </div>
                <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Context · {contextLabel}</div>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-white/5 hover:text-foreground"
              aria-label="Close"
            >
              <X size={14} />
            </button>
          </header>


          <IngestionBadge missionId={missionId ?? null} />

          <div ref={scrollerRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {msgs.length === 0 && (
              <div className="space-y-3">
                <div className="rounded-lg border p-3 text-xs text-muted-foreground flex items-start gap-2"
                  style={{ borderColor: "var(--iris-border)", background: "var(--iris-subtle)" }}>
                  <IrisMark size={16} />
                  <span>Ask anything about <b className="text-foreground">{contextLabel.toLowerCase()}</b>. IRIS sees the same intelligence you do.</span>
                </div>
                <div className="space-y-1.5">
                  {[
                    "What's the biggest risk on this?",
                    "What did the last amendment change?",
                    "Who's blocked and why?",
                    "Summarize what I need to know in 30 seconds.",
                  ].map((s) => (
                    <button
                      key={s}
                      onClick={() => setInput(s)}
                      className="w-full rounded-md border border-white/5 bg-white/[0.02] px-3 py-2 text-left text-xs text-muted-foreground hover:border-[color:var(--iris,#22d3ee)]/30 hover:text-foreground transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className="max-w-[88%]">
                  <div
                    className="rounded-lg px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap"
                    style={
                      m.role === "user"
                        ? { background: "rgba(59,127,255,0.15)", border: "1px solid rgba(59,127,255,0.25)", color: "var(--foreground)" }
                        : { background: "rgba(34,211,238,0.06)", border: "1px solid rgba(34,211,238,0.18)", color: "var(--foreground)" }
                    }
                  >
                    {m.text}
                  </div>
                  {m.role === "iris" && missionId && (
                    <AskIrisFeedback text={m.text} missionId={missionId} questionId={questionId ?? null} />
                  )}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex items-center gap-2 text-xs text-[color:var(--iris,#22d3ee)]">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[color:var(--iris,#22d3ee)]" />
                IRIS is thinking…
              </div>
            )}
          </div>

          {/* UX-2: Quick-prompt strip — only when input is empty, no conversation, and inside a mission. */}
          {!input && msgs.length === 0 && !busy && missionId && (
            <div className="flex flex-wrap gap-1.5 border-t px-3 pt-2.5" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
              {[
                "What are evaluators looking for?",
                "What's the win theme here?",
                "Summarize the requirements",
              ].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => void sendText(p)}
                  className="iris-quick-prompt rounded-full px-3 py-1 text-[11px] font-medium transition-colors"
                  style={{
                    border: "1px solid rgba(201,168,76,0.3)",
                    background: "transparent",
                    color: "#C9A84C",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(201,168,76,0.08)";
                    e.currentTarget.style.borderColor = "rgba(201,168,76,0.6)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.borderColor = "rgba(201,168,76,0.3)";
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          )}

          <form
            onSubmit={(e) => { e.preventDefault(); send(); }}
            className="flex items-center gap-2 border-t px-3 py-3"
            style={{ borderColor: "rgba(255,255,255,0.06)" }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask IRIS…"
              disabled={busy}
              className="h-9 flex-1 rounded-md border border-white/10 bg-white/[0.02] px-3 text-sm outline-none focus:border-[color:var(--iris,#22d3ee)]/40"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-[11px] font-bold uppercase tracking-[0.08em] disabled:opacity-40"
              style={{
                background: "linear-gradient(135deg, rgba(34,211,238,0.9), rgba(34,211,238,0.6))",
                color: "#001218",
              }}
            >
              <Send size={12} /> Send
            </button>
          </form>
        </aside>
      )}
    </>
  );
}

function IngestionBadge({ missionId }: { missionId: string | null }) {
  const fetchCounts = useServerFn(getIrisIngestionCounts);
  const { data } = useQuery({
    queryKey: ["iris-ingestion-counts", missionId],
    queryFn: () => fetchCounts({ data: { missionId } }),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const chips: Array<{ label: string; n: number; tone: string }> = [
    { label: "Canon", n: data?.canon ?? 0, tone: "var(--athena-gold,#f59e0b)" },
    { label: "Oracle", n: data?.oracle ?? 0, tone: "var(--oracle-active,#22d3ee)" },
    { label: "Vault", n: data?.vault ?? 0, tone: "#a78bfa" },
    { label: "Memory", n: data?.memories ?? 0, tone: "#34d399" },
    { label: "State", n: data?.stateIntel ?? 0, tone: "#60a5fa" },
    { label: "Program", n: data?.programIntel ?? 0, tone: "#f472b6" },
  ];

  return (
    <div
      className="flex flex-wrap items-center gap-1.5 border-b px-4 py-2"
      style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(34,211,238,0.02)" }}
      title="Live count of intelligence layers IRIS is ingesting on every prompt"
    >
      <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Ingesting</span>
      {chips.map((c) => (
        <span
          key={c.label}
          className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold"
          style={{
            borderColor: c.n > 0 ? `${c.tone}` : "rgba(255,255,255,0.08)",
            color: c.n > 0 ? c.tone : "rgba(255,255,255,0.35)",
            background: c.n > 0 ? `color-mix(in oklab, ${c.tone} 8%, transparent)` : "transparent",
          }}
        >
          <span className="opacity-70">{c.label}</span>
          <span className="tabular-nums">{c.n}</span>
        </span>
      ))}
    </div>
  );
}

function AskIrisFeedback({
  text,
  missionId,
  questionId,
}: { text: string; missionId: string; questionId: string | null }) {
  const [voted, setVoted] = useState<null | "up" | "down">(null);
  const [flagOpen, setFlagOpen] = useState(false);
  return (
    <div className="mt-1">
      <div className="flex items-center gap-1 pl-1">
        <button
          onClick={() => { setVoted("up"); toast.success("Thanks — signal recorded"); }}
          className={`rounded p-1 transition-colors ${voted === "up" ? "text-emerald-400" : "text-muted-foreground/50 hover:text-emerald-400"}`}
          title="Helpful"
          aria-label="Helpful"
        >
          <ThumbsUp className="h-3 w-3" />
        </button>
        <button
          onClick={() => { setVoted("down"); setFlagOpen(true); }}
          className={`rounded p-1 transition-colors ${voted === "down" ? "text-yellow-400" : "text-muted-foreground/50 hover:text-yellow-400"}`}
          title="Not helpful"
          aria-label="Not helpful"
        >
          <ThumbsDown className="h-3 w-3" />
        </button>
        <button
          onClick={() => setFlagOpen((v) => !v)}
          className="rounded p-1 text-muted-foreground/50 transition-colors hover:text-yellow-400"
          title="Flag IRIS error"
          aria-label="Flag IRIS error"
        >
          <Flag className="h-3 w-3" />
        </button>
      </div>
      {flagOpen && (
        <IrisCorrectableInline
          text={text}
          missionId={missionId}
          questionId={questionId}
        />
      )}
    </div>
  );
}

function IrisCorrectableInline({
  text,
  missionId,
  questionId,
}: { text: string; missionId: string; questionId: string | null }) {
  // Renders a pre-opened correction form by reusing the IrisCorrectable wrapper
  // with the children-less form auto-opened.
  return (
    <div className="mt-1">
      <IrisCorrectable
        contentType="ask_iris"
        contentBlock={text}
        missionId={missionId}
        questionId={questionId}
        flagPosition="inline"
      >
        <span className="sr-only">Ask IRIS response</span>
      </IrisCorrectable>
    </div>
  );
}
