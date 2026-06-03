import { useEffect, useRef, useState } from "react";
import { useParams, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, X, Send, Eye } from "lucide-react";
import { irisAskGlobal, irisAskMission, irisAskQuestion } from "@/lib/iris-ask.functions";

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

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setMsgs((m) => [...m, { role: "user", text }]);
    setInput("");
    setBusy(true);
    try {
      const res = questionId
        ? await askQuestion({ data: { questionId, prompt: text } })
        : missionId
          ? await askMission({ data: { missionId, prompt: text } })
          : await askGlobal({ data: { prompt: text } });
      setMsgs((m) => [...m, { role: "iris", text: res.answer }]);
    } catch (e: any) {
      setMsgs((m) => [...m, { role: "iris", text: `_Error: ${e?.message ?? "unknown"}_` }]);
    } finally {
      setBusy(false);
    }
  }

  // Hide on login or no auth
  if (path === "/login" || path === "/" || path.startsWith("/auth")) return null;

  const contextLabel = questionId ? "This Question" : missionId ? "This Mission" : "Global";

  return (
    <>
      {/* Floating launcher */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Ask IRIS"
          title="Ask IRIS (⌘J)"
          className="group fixed right-5 bottom-5 z-[1500] flex h-12 items-center gap-2 rounded-full px-4 transition-all duration-200 hover:scale-105"
          style={{
            background: "linear-gradient(135deg, rgba(34,211,238,0.95), rgba(34,211,238,0.7))",
            boxShadow: "0 0 0 1px rgba(34,211,238,0.4), 0 10px 30px rgba(34,211,238,0.35), 0 0 30px rgba(34,211,238,0.25)",
            color: "#001218",
          }}
        >
          <Eye size={16} strokeWidth={2.25} />
          <span className="text-[11px] font-bold uppercase tracking-[0.12em]">Ask IRIS</span>
          <kbd className="hidden md:inline-flex items-center rounded bg-black/20 px-1.5 py-0.5 text-[9px] font-mono">⌘J</kbd>
        </button>
      )}

      {/* Drawer */}
      {open && (
        <aside
          className="fixed right-0 top-0 z-[1500] flex h-screen w-full max-w-[420px] flex-col border-l shadow-2xl"
          style={{
            background: "#060b14",
            borderColor: "rgba(34,211,238,0.18)",
            boxShadow: "-20px 0 60px rgba(0,0,0,0.5), inset 1px 0 0 rgba(34,211,238,0.08)",
          }}
        >
          <header
            className="flex items-center justify-between border-b px-4 py-3"
            style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(34,211,238,0.04)" }}
          >
            <div className="flex items-center gap-2">
              <span className="relative inline-flex">
                <Eye size={16} className="text-[color:var(--iris,#22d3ee)]" />
                <span className="absolute -right-1 -top-1 h-1.5 w-1.5 animate-ping rounded-full bg-[color:var(--iris,#22d3ee)]" />
              </span>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--iris,#22d3ee)]">IRIS</div>
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

          <div ref={scrollerRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {msgs.length === 0 && (
              <div className="space-y-3">
                <div className="rounded-lg border border-[color:var(--iris,#22d3ee)]/15 bg-[color:var(--iris,#22d3ee)]/[0.04] p-3 text-xs text-muted-foreground">
                  <Sparkles size={12} className="mb-1 inline text-[color:var(--iris,#22d3ee)]" /> Ask anything about <b className="text-foreground">{contextLabel.toLowerCase()}</b>. IRIS sees the same intelligence you do.
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
                <div
                  className="max-w-[88%] rounded-lg px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap"
                  style={
                    m.role === "user"
                      ? { background: "rgba(59,127,255,0.15)", border: "1px solid rgba(59,127,255,0.25)", color: "var(--foreground)" }
                      : { background: "rgba(34,211,238,0.06)", border: "1px solid rgba(34,211,238,0.18)", color: "var(--foreground)" }
                  }
                >
                  {m.text}
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
