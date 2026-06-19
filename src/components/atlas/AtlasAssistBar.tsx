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
import { Search, Target, BarChart3, AlertTriangle, Copy, RefreshCcw, ArrowDownToLine, Loader2, Zap } from "lucide-react";
import { runAssistTool } from "@/lib/atlas-assist.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
        <div className="text-[11px] uppercase tracking-wider" style={{ color: GOLD }}>IRIS Brief</div>
        <button
          onClick={() => { setGenerated(true); fetchTool("decode", "initial"); }}
          className="w-full inline-flex items-center justify-center gap-2 rounded-md py-2 text-[12.5px] font-semibold"
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
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors"
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
        <div className="text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1" style={{ color: GOLD }}>
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
                toast.success("Copied to clipboard");
              }}
              className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium"
              style={{ background: "rgba(196,154,43,0.12)", border: `1px solid ${GOLD}`, color: GOLD }}
            >
              <Copy className="h-3 w-3" /> Copy to brief notes
            </button>
            <button
              onClick={() => fetchTool(active, "regenerate")}
              className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] text-muted-foreground hover:text-white"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <RefreshCcw className="h-3 w-3" /> Regenerate
            </button>
            <button
              onClick={() => fetchTool(active, "go_deeper")}
              className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] text-muted-foreground hover:text-white"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <ArrowDownToLine className="h-3 w-3" /> Go deeper
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
