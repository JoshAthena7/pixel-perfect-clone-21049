/**
 * Atlas Assist Bar — four IRIS coaching tools for the expanded question.
 *   🔍 Decode | 🎯 Win Angle | 📊 Evidence | ⚠ Watch Out
 *
 * Caches response per (questionId, tool) in component state — switching
 * tabs back never re-bills the gateway. "Copy to brief notes" fires an
 * assist_acknowledged event; closing without copying fires assist_ignored.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Search, Target, BarChart3, AlertTriangle, Copy, RefreshCcw, ArrowDownToLine, Loader2, Zap, X } from "lucide-react";
import { runAssistTool } from "@/lib/atlas-assist.functions";
import { generateTacticalSuggestion } from "@/lib/iris-tactical.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { IrisScorePredictor } from "@/components/atlas/IrisScorePredictor";

type Tool = "decode" | "win_angle" | "evidence" | "watch_out";
const TOOLS: { id: Tool; label: string; icon: React.ReactNode }[] = [
  { id: "decode",    label: "Decode",     icon: <Search className="h-3.5 w-3.5" /> },
  { id: "win_angle", label: "Win Angle",  icon: <Target className="h-3.5 w-3.5" /> },
  { id: "evidence",  label: "Evidence",   icon: <BarChart3 className="h-3.5 w-3.5" /> },
  { id: "watch_out", label: "Risk Flags", icon: <AlertTriangle className="h-3.5 w-3.5" /> },
];

const GOLD = "#C49A2B";

export function AtlasAssistBar({
  missionId, questionId,
}: { missionId: string | null; questionId: string | null }) {
  const run = useServerFn(runAssistTool);
  const [active, setActive] = useState<Tool>("decode");
  const [cache, setCache] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<Tool | null>(null);
  const [error, setError] = useState<string | null>(null);
  const acknowledgedRef = useRef<Set<string>>(new Set());

  // Reset cache when question changes
  useEffect(() => {
    setCache({});
    setError(null);
    setActive("decode");
    acknowledgedRef.current = new Set();
  }, [questionId]);

  // Track whether the user has explicitly asked for the brief to be generated.
  const [generated, setGenerated] = useState(false);

  // Reset on question change
  useEffect(() => {
    setGenerated(false);
  }, [questionId]);

  // Auto-fetch only after user clicks Generate (or switches tabs once generated)
  useEffect(() => {
    if (!missionId || !questionId || !generated) return;
    const key = `${questionId}:${active}`;
    if (cache[key] !== undefined) return;
    fetchTool(active, "initial");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, questionId, missionId, generated]);

  async function fetchTool(tool: Tool, mode: "initial" | "regenerate" | "go_deeper") {
    if (!missionId || !questionId) return;
    setLoading(tool);
    setError(null);
    try {
      const prior = mode === "go_deeper" ? cache[`${questionId}:${tool}`] : undefined;
      const { text } = await run({ data: { missionId, questionId, tool, mode, priorResponse: prior } });
      setCache((c) => ({ ...c, [`${questionId}:${tool}`]: text }));
    } catch (e) {
      setError((e as Error).message || "IRIS is thinking — try again in a moment.");
    } finally {
      setLoading(null);
    }
  }

  async function fireEvent(type: "assist_acknowledged" | "assist_ignored") {
    if (!missionId || !questionId) return;
    const { data: me } = await supabase.auth.getUser();
    if (!me.user) return;
    await supabase.from("mission_assist_events").insert({
      mission_id: missionId,
      question_id: questionId,
      user_id: me.user.id,
      event_type: type,
      metadata: { tool: active } as any,
    });
  }

  // Fire assist_ignored on unmount if active tool was viewed but never copied.
  useEffect(() => {
    return () => {
      const key = questionId ? `${questionId}:${active}` : null;
      if (!key || !cache[key]) return;
      if (!acknowledgedRef.current.has(key)) {
        fireEvent("assist_ignored").catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const key = questionId ? `${questionId}:${active}` : null;
  const text = key ? cache[key] : undefined;

  const headerLabel = useMemo(() => TOOLS.find((t) => t.id === active)?.label ?? "", [active]);

  if (!missionId || !questionId) return null;

  const hasAnyCache = questionId
    ? TOOLS.some((t) => cache[`${questionId}:${t.id}`] !== undefined)
    : false;

  if (!generated && !hasAnyCache) {
    return (
      <div className="rounded-lg p-4 flex flex-col items-center gap-2" style={{ background: "rgba(127,119,221,0.04)", border: "1px solid rgba(127,119,221,0.18)" }}>
        <div className="text-[12px]" style={{ color: GOLD }}>IRIS Brief</div>
        <button
          onClick={() => { setGenerated(true); fetchTool("decode", "initial"); }}
          className="w-full inline-flex items-center justify-center gap-2 rounded-md py-2 text-[12.5px] font-medium"
          style={{ background: GOLD, color: "#1a1408" }}
        >
          <Zap className="h-4 w-4" /> Generate Brief
        </button>
        <div className="text-[10.5px] text-white/45 italic text-center">IRIS will decode the intent, surface the win angle, summon evidence, and flag risks.</div>
      </div>
    );
  }

  return (
    <div className="rounded-lg p-3" style={{ background: "rgba(127,119,221,0.04)", border: "1px solid rgba(127,119,221,0.18)" }}>
      <div className="flex flex-wrap items-center gap-1.5">
        {TOOLS.map((t) => {
          const isActive = active === t.id;
          return (
            <button
              key={t.id}
              onClick={() => { setGenerated(true); setActive(t.id); }}
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors"
              style={{
                background: isActive ? "rgba(196,154,43,0.12)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${isActive ? GOLD : "rgba(255,255,255,0.08)"}`,
                color: isActive ? GOLD : "rgba(255,255,255,0.7)",
              }}
            >
              {t.icon} {t.label}
            </button>
          );
        })}
      </div>

      <div className="mt-3 rounded-md px-3 py-2.5" style={{ background: "rgba(255,255,255,0.02)", borderLeft: `3px solid ${GOLD}` }}>
        <div className="text-[11px] font-medium flex items-center gap-1" style={{ color: GOLD }}>
          <Zap className="h-3 w-3" /> IRIS · {headerLabel}
        </div>
        {loading === active ? (
          <div className="mt-2 flex items-center gap-2 text-[11.5px] italic text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> IRIS is thinking…
          </div>
        ) : error ? (
          <div className="mt-2 text-[11.5px]" style={{ color: "#f08080" }}>
            {error} <button onClick={() => fetchTool(active, "initial")} className="underline ml-1" style={{ color: GOLD }}>Retry</button>
          </div>
        ) : text ? (
          <div className="mt-2 text-[12px] whitespace-pre-wrap" style={{ color: "rgba(255,255,255,0.82)", lineHeight: 1.7 }}>
            {text}
          </div>
        ) : null}

        {text && !loading && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                navigator.clipboard.writeText(text).catch(() => {});
                acknowledgedRef.current.add(key!);
                fireEvent("assist_acknowledged").catch(() => {});
                toast.success("Copied to clipboard ✓", { duration: 2000 });
              }}
              className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[12px] font-medium"
              style={{ background: "rgba(196,154,43,0.12)", border: `1px solid ${GOLD}`, color: GOLD }}
            >
              <Copy className="h-3 w-3" /> Copy to brief notes
            </button>
            <button
              onClick={() => fetchTool(active, "regenerate")}
              className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[12px] text-muted-foreground hover:text-white"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <RefreshCcw className="h-3 w-3" /> Regenerate
            </button>
            <button
              onClick={() => fetchTool(active, "go_deeper")}
              className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[12px] text-muted-foreground hover:text-white"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <ArrowDownToLine className="h-3 w-3" /> Go deeper
            </button>
          </div>
        )}

        {/* Ghost-text tactical suggestion — Decode tab only. Reserves 60px. */}
        <div style={{ minHeight: 60 }}>
          {active === "decode" && text && !loading && !error && (
            <TacticalGhostText
              key={`${questionId}:${text.slice(0, 24)}`}
              missionId={missionId}
              questionId={questionId}
              decodeText={text}
            />
          )}
        </div>
      </div>

      <IrisScorePredictor
        missionId={missionId}
        questionId={questionId}
        visible={hasAnyCache || generated}
      />
    </div>
  );
}

function TacticalGhostText({
  missionId,
  questionId,
  decodeText,
}: {
  missionId: string;
  questionId: string;
  decodeText: string;
}) {
  const run = useServerFn(generateTacticalSuggestion);
  const [tip, setTip] = useState<string>("");
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [hover, setHover] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [{ data: q }, { data: m }] = await Promise.all([
          supabase.from("mission_questions").select("question_number, question_text, mission_id").eq("id", questionId).maybeSingle(),
          supabase.from("missions").select("name").eq("id", missionId).maybeSingle(),
        ]);
        const { data: wt } = await supabase
          .from("mission_win_themes")
          .select("title")
          .eq("mission_id", missionId)
          .limit(1)
          .maybeSingle();
        if (cancelled) return;
        const { text } = await run({
          data: {
            questionNumber: q?.question_number ?? null,
            questionTitle: q?.question_text ?? null,
            decodeExcerpt: decodeText.slice(0, 200),
            missionName: m?.name ?? null,
            winTheme: wt?.title ?? null,
          },
        });
        if (cancelled || !text) return;
        setTip(text);
        // 2-second delay before fading in
        setTimeout(() => { if (!cancelled) setVisible(true); }, 2000);
      } catch {
        // silent
      }
    })();
    return () => { cancelled = true; };
  }, [missionId, questionId, decodeText, run]);

  if (!tip || dismissed) return null;

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        marginTop: 16,
        paddingTop: 12,
        borderTop: "1px solid rgba(255,255,255,0.06)",
        opacity: visible ? 1 : 0,
        transition: "opacity 800ms ease-out",
        position: "relative",
      }}
    >
      <div style={{
        fontSize: 8,
        textTransform: "",
        letterSpacing: "0.08em",
        color: "rgba(196,154,43,0.4)",
        fontWeight: 600,
      }}>
        IRIS · Tactical
      </div>
      <div style={{
        fontFamily: "Georgia, serif",
        fontSize: 12,
        fontStyle: "italic",
        color: "rgba(255,255,255,0.3)",
        marginTop: 4,
        paddingRight: 16,
      }}>
        {tip}
      </div>
      <button
        aria-label="Dismiss tactical suggestion"
        onClick={() => setDismissed(true)}
        style={{
          position: "absolute",
          top: 12,
          right: 0,
          background: "transparent",
          border: "none",
          padding: 2,
          cursor: "pointer",
          color: "rgba(255,255,255,0.2)",
          opacity: hover ? 1 : 0,
          transition: "opacity 150ms ease-out",
        }}
      >
        <X size={10} />
      </button>
    </div>
  );
}
