/**
 * IRIS Quick Intel Panel — the actual triage UI.
 *
 * Reused by both the floating launcher (IrisConsoleLauncher) on mission
 * pages and the standalone /admin/iris-console page.
 *
 * Strictly mission-scoped. Renders status strip, query input, quick-fire
 * pills, loading state, response cards with bullet/source/watch parsing,
 * and an in-memory history of the last 5 turns.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { askIrisQuickIntel, getQuickIntelStatus } from "@/lib/iris-quick-intel.functions";
import { Zap, X, Minus, Send, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";

const GOLD = "#c9a84c";
const GOLD_DIM = "rgba(201,168,76,0.3)";
const AMBER = "#fbbf24";

const QUICK_FIRE = [
  "What are the evaluation criteria and point values?",
  "What are the top 3 risks in this RFP?",
  "What does the state want most from this procurement?",
  "Who are the likely competitors and what are their weaknesses?",
  "What are the most important compliance requirements?",
];

type Turn = {
  id: string;
  query: string;
  answer: string;
  generatedAt: string;
  grounded?: { oracleSignals: number; winThemes: number; hasNorthStar: boolean };
};

function relTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function IrisConsolePanel({
  missionId,
  fullScreen = false,
  onMinimize,
  onClose,
}: {
  missionId: string;
  fullScreen?: boolean;
  onMinimize?: () => void;
  onClose?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<Turn | null>(null);
  const [history, setHistory] = useState<Turn[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const askFn = useServerFn(askIrisQuickIntel);
  const statusFn = useServerFn(getQuickIntelStatus);

  const statusQ = useQuery({
    queryKey: ["iris-quick-intel-status", missionId],
    queryFn: () => statusFn({ data: { missionId } }),
    refetchInterval: 60_000,
  });
  const s = statusQ.data;

  useEffect(() => { inputRef.current?.focus(); }, []);
  // Reset on mission switch
  useEffect(() => { setCurrent(null); setHistory([]); }, [missionId]);

  async function submit(q: string) {
    const text = q.trim();
    if (!text || busy) return;
    setBusy(true); setError(null);
    try {
      const res = await askFn({ data: { missionId, query: text } });
      const turn: Turn = {
        id: `${Date.now()}`,
        query: text,
        answer: res.answer,
        generatedAt: res.generatedAt,
        grounded: res.groundedOn,
      };
      setCurrent(turn);
      setHistory((prev) => {
        const next = current ? [current, ...prev] : prev;
        return next.slice(0, 5);
      });
      setQuery("");
    } catch (e: any) {
      const msg = String(e?.message ?? e ?? "");
      if (msg.includes("rate limited")) setError("IRIS is rate-limited. Try again in a moment.");
      else if (msg.includes("credits exhausted")) setError("AI credits exhausted. Add credits in workspace settings.");
      else if (msg.includes("Forbidden")) setError("Access denied — admin or engagement-lead only.");
      else setError(msg || "IRIS could not generate a response.");
    } finally {
      setBusy(false);
    }
  }

  const statusStripText = useMemo(() => {
    if (!s) return "Loading mission pulse…";
    const code = s.shortCode || s.missionName?.split(" ")[0] || "Mission";
    const dParts: string[] = [String(code)];
    if (s.daysToSubmission != null) dParts.push(`${s.daysToSubmission}d to submission`);
    dParts.push(`${s.finalized} finalized / ${s.unstarted} unstarted`);
    if (s.sosActive > 0) dParts.push(`⚠ SOS: ${s.sosActive} active`);
    dParts.push(`ORACLE: ${s.oracleSignals} signals`);
    return dParts.join("  ·  ");
  }, [s]);

  const outerStyle: React.CSSProperties = fullScreen
    ? { width: "100%", height: "100%", borderRadius: 0, border: "none" }
    : {
        position: "fixed", bottom: 20, right: 20, zIndex: 9989,
        width: 480, height: 580, borderRadius: 8,
        border: `1px solid ${GOLD_DIM}`,
      };

  return (
    <div
      style={{
        ...outerStyle,
        background: "#000308",
        color: "white",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
      className="iris-console-panel"
    >
      <style>{`
        @keyframes iris-scan { 0%{transform:translateX(-100%)} 100%{transform:translateX(100%)} }
        @media (max-width: 600px) {
          .iris-console-panel { width: 100vw !important; height: 100vh !important; bottom: 0 !important; right: 0 !important; border-radius: 0 !important; }
        }
      `}</style>

      {/* Header */}
      <div
        className="shrink-0 flex items-center justify-between px-3"
        style={{ height: 40, borderBottom: "1px solid rgba(255,255,255,0.06)", background: "#01050b" }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Zap size={12} style={{ color: GOLD }} />
          <span style={{ color: GOLD, fontSize: 9, letterSpacing: "0.15em", fontFamily: "'Courier New', monospace", textTransform: "", fontWeight: 600 }}>
            IRIS QUICK INTEL
          </span>
          {s?.shortCode && (
            <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 8, fontFamily: "'Courier New', monospace" }}>
              {s.shortCode}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {onMinimize && (
            <button onClick={onMinimize} aria-label="Minimize" style={iconBtn}><Minus size={12} /></button>
          )}
          {onClose && (
            <button onClick={onClose} aria-label="Close" style={iconBtn}><X size={12} /></button>
          )}
        </div>
      </div>

      {/* Sub-header */}
      <div className="px-3 py-1.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", background: "#01050b" }}>
        <div style={{ fontSize: 8, color: "rgba(255,255,255,0.45)", fontFamily: "'Courier New', monospace" }}>
          {s
            ? `Grounded in ${s.docsProcessed} RFP signals · ${s.oracleSignals} ORACLE items · Updated ${relTime(s.lastUpdatedIso)}`
            : "Loading…"}
        </div>
      </div>

      {/* Quick flags strip */}
      <div
        className="px-3"
        style={{
          height: 24, display: "flex", alignItems: "center",
          borderBottom: "1px solid rgba(255,255,255,0.04)",
          background: "rgba(255,255,255,0.02)",
          fontSize: 8, fontFamily: "'Courier New', monospace",
          color: (s?.sosActive ?? 0) > 0 ? "#fca5a5" : "rgba(255,255,255,0.6)",
          whiteSpace: "nowrap", overflowX: "auto",
        }}
      >
        {statusStripText}
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 flex flex-col">
        {/* Query input */}
        <div className="p-3 shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submit(query); }}
              placeholder="Ask anything about this RFP..."
              style={{
                flex: 1, height: 40, padding: "0 12px",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 4, color: "white", fontSize: 12, outline: "none",
              }}
              disabled={busy}
            />
            <button
              onClick={() => submit(query)}
              disabled={busy || !query.trim()}
              style={{
                width: 60, height: 40, borderRadius: 4,
                background: GOLD, color: "#070f1c",
                fontSize: 11, fontWeight: 600,
                opacity: busy || !query.trim() ? 0.5 : 1,
                cursor: busy || !query.trim() ? "not-allowed" : "pointer",
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4,
              }}
            >
              <Send size={12} /> Ask
            </button>
          </div>

          {/* Quick fire pills */}
          <div
            className="mt-2 flex gap-1.5"
            style={{ overflowX: "auto", paddingBottom: 2 }}
          >
            {QUICK_FIRE.map((q) => (
              <button
                key={q}
                onClick={() => { setQuery(q); submit(q); }}
                disabled={busy}
                style={{
                  flex: "0 0 auto",
                  height: 24, padding: "0 10px",
                  fontSize: 9, color: GOLD,
                  border: `1px solid ${GOLD_DIM}`,
                  borderRadius: 999,
                  background: "transparent",
                  whiteSpace: "nowrap",
                  cursor: busy ? "not-allowed" : "pointer",
                  opacity: busy ? 0.5 : 1,
                }}
                title={q}
              >
                {q.length > 38 ? q.slice(0, 36) + "…" : q}
              </button>
            ))}
          </div>
        </div>

        {/* Response area */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
          {busy && <LoadingCard signals={s?.oracleSignals ?? 0} />}

          {error && !busy && (
            <div style={{ ...responseCard, borderLeftColor: "rgba(248,113,113,0.5)" }}>
              <div style={{ color: "#fca5a5", fontSize: 11 }}>{error}</div>
            </div>
          )}

          {current && !busy && <ResponseCard turn={current} expanded />}

          {history.length > 0 && (
            <div className="pt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
              <div style={{ fontSize: 8, color: "rgba(255,255,255,0.4)", letterSpacing: "0.15em", textTransform: "", marginBottom: 6 }}>
                Recent · {history.length}
              </div>
              <div className="space-y-1.5">
                {history.map((t) => <HistoryCard key={t.id} turn={t} />)}
              </div>
            </div>
          )}

          {!current && !busy && !error && (
            <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, padding: "20px 4px" }}>
              Ask a question above, or tap a quick-fire pill. Answers cite their sources.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  width: 24, height: 24, display: "inline-flex", alignItems: "center", justifyContent: "center",
  color: "rgba(255,255,255,0.55)", background: "transparent", border: 0, cursor: "pointer", borderRadius: 4,
};

const responseCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.02)",
  borderLeft: `2px solid ${GOLD_DIM}`,
  padding: 12,
  borderRadius: 4,
};

function LoadingCard({ signals }: { signals: number }) {
  return (
    <div style={responseCard}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: GOLD, fontSize: 12, fontWeight: 500 }}>
        <Zap size={12} /> IRIS is scanning…
      </div>
      <div style={{ marginTop: 8, height: 2, background: "rgba(255,255,255,0.05)", overflow: "hidden" }}>
        <div style={{
          width: "40%", height: "100%", background: "rgba(201,168,76,0.6)",
          animation: "iris-scan 1.5s linear infinite",
        }} />
      </div>
      <div style={{ marginTop: 6, fontSize: 9, color: "rgba(255,255,255,0.45)", fontFamily: "'Courier New', monospace" }}>
        Searching {signals} ORACLE signals · Analyzing mission context
      </div>
    </div>
  );
}

function ResponseCard({ turn, expanded }: { turn: Turn; expanded: boolean }) {
  if (!expanded) return null;
  return (
    <div style={responseCard}>
      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", fontFamily: "'Courier New', monospace", marginBottom: 6 }}>
        Q: {turn.query}
      </div>
      <RenderedAnswer text={turn.answer} />
      <div style={{ marginTop: 8, fontSize: 8, color: "rgba(255,255,255,0.3)", fontFamily: "'Courier New', monospace" }}>
        {relTime(turn.generatedAt)}
        {turn.grounded ? ` · grounded on ${turn.grounded.oracleSignals} ORACLE signals` : ""}
      </div>
    </div>
  );
}

function HistoryCard({ turn }: { turn: Turn }) {
  const [open, setOpen] = useState(false);
  const headline = useMemo(() => {
    const line = turn.answer.split("\n").find((l) => l.trim().startsWith("⚡"));
    return (line ?? turn.query).replace(/^⚡\s*/, "");
  }, [turn]);
  return (
    <div style={{ ...responseCard, padding: 8, borderLeftColor: "rgba(255,255,255,0.1)" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left flex items-start gap-2"
        style={{ background: "transparent", border: 0, color: "white", cursor: "pointer", padding: 0 }}
      >
        {open ? <ChevronDown size={10} className="mt-0.5 shrink-0" style={{ color: GOLD }} /> : <ChevronRight size={10} className="mt-0.5 shrink-0" style={{ color: GOLD }} />}
        <div className="flex-1 min-w-0">
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", fontFamily: "'Courier New', monospace" }}>{turn.query}</div>
          <div style={{ fontSize: 11, color: GOLD, marginTop: 1 }}>{headline}</div>
        </div>
      </button>
      {open && (
        <div className="mt-2">
          <RenderedAnswer text={turn.answer} />
        </div>
      )}
    </div>
  );
}

function RenderedAnswer({ text }: { text: string }) {
  const lines = useMemo(() => text.split("\n"), [text]);
  return (
    <div className="space-y-1">
      {lines.map((rawLine, idx) => {
        const line = rawLine.trimEnd();
        if (!line.trim()) return <div key={idx} style={{ height: 4 }} />;
        if (line.startsWith("⚡")) {
          return (
            <div key={idx} style={{ color: GOLD, fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
              {line}
            </div>
          );
        }
        if (/^\s*↳/.test(line)) {
          return (
            <div key={idx} style={{ fontSize: 8, color: "rgba(201,168,76,0.75)", paddingLeft: 16, fontFamily: "'Courier New', monospace" }}>
              {line.trim()}
            </div>
          );
        }
        if (line.startsWith("⚠")) {
          return (
            <div
              key={idx}
              className="mt-2 pt-2"
              style={{ borderTop: `1px solid rgba(251,191,36,0.2)`, color: AMBER, fontSize: 10, display: "flex", alignItems: "flex-start", gap: 4 }}
            >
              <AlertTriangle size={10} className="mt-0.5 shrink-0" />
              <span>{line.replace(/^⚠\s*/, "")}</span>
            </div>
          );
        }
        if (/^\s*[-•*]\s+/.test(line)) {
          return (
            <div key={idx} style={{ color: "white", fontSize: 11, paddingLeft: 8, lineHeight: 1.45 }}>
              • {line.replace(/^\s*[-•*]\s+/, "")}
            </div>
          );
        }
        // Fallback prose line
        return (
          <div key={idx} style={{ color: "rgba(255,255,255,0.85)", fontSize: 11, lineHeight: 1.45 }}>
            {line}
          </div>
        );
      })}
    </div>
  );
}
