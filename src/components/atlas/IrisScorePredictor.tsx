/**
 * IRIS Score Predictor panel — renders below the brief tabs.
 * Generates 5 pre-writing checklist items the writer can tick off.
 * State persisted per (user, question) in question_progress.metadata.iris_checklist_state.
 */
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Target } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  generateScorePredictor,
  type ScorePredictor,
  type ScorePredictorItem,
} from "@/lib/iris-score-predictor.functions";

const GOLD = "#C49A2B";

const CATEGORY_COLOR: Record<ScorePredictorItem["category"], string> = {
  compliance: "#60a5fa",
  evidence: "#c084fc",
  specificity: GOLD,
  positioning: "#4ade80",
  structure: "rgba(255,255,255,0.5)",
};

type ChecklistState = { checked: number[]; generated_at?: string };

function readChecked(meta: any): number[] {
  const arr = meta?.iris_checklist_state?.checked;
  return Array.isArray(arr) ? arr.filter((n) => Number.isInteger(n)) : [];
}

export function IrisScorePredictor({
  missionId,
  questionId,
  visible,
}: {
  missionId: string;
  questionId: string;
  visible: boolean;
}) {
  const run = useServerFn(generateScorePredictor);
  const [data, setData] = useState<ScorePredictor | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState<number[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const generatedRef = useRef<string | null>(null);

  // Reset on question change
  useEffect(() => {
    setData(null);
    setError(null);
    setChecked([]);
    generatedRef.current = null;
  }, [questionId]);

  // Load checklist state + current user
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: me } = await supabase.auth.getUser();
      if (cancelled) return;
      setUserId(me.user?.id ?? null);
      if (!me.user) return;
      const { data: row } = await supabase
        .from("question_progress")
        .select("metadata")
        .eq("question_id", questionId)
        .eq("assignee_id", me.user.id)
        .maybeSingle();
      if (!cancelled && row) setChecked(readChecked((row as any).metadata));
    })();
    return () => {
      cancelled = true;
    };
  }, [questionId]);

  // Generate when visible
  useEffect(() => {
    if (!visible || !missionId || !questionId) return;
    if (generatedRef.current === questionId) return;
    generatedRef.current = questionId;

    (async () => {
      // Check if already stored on the brief — skip the AI call if so
      try {
        const { data: row } = await supabase
          .from("mission_questions")
          .select("iris_brief")
          .eq("id", questionId)
          .maybeSingle();
        const cached = (row as any)?.iris_brief?.score_predictor;
        if (cached && Array.isArray(cached.items) && cached.items.length) {
          setData(cached as ScorePredictor);
          return;
        }
      } catch { /* fall through to generate */ }

      setLoading(true);
      setError(null);
      try {
        const r = await run({ data: { missionId, questionId } });
        setData(r);
        // Persist onto the brief so Score Me can read it later
        try {
          const { data: row } = await supabase
            .from("mission_questions")
            .select("iris_brief")
            .eq("id", questionId)
            .maybeSingle();
          const brief = ((row as any)?.iris_brief ?? {}) as Record<string, unknown>;
          await supabase
            .from("mission_questions")
            .update({ iris_brief: { ...brief, score_predictor: r } as any })
            .eq("id", questionId);
        } catch { /* non-blocking */ }
      } catch (e: any) {
        setError(e?.message ?? "Score Predictor unavailable.");
      } finally {
        setLoading(false);
      }
    })();
  }, [visible, missionId, questionId, run]);

  async function persist(next: number[]) {
    setChecked(next);
    if (!userId) return;
    try {
      // Pull current metadata, merge, upsert
      const { data: existing } = await supabase
        .from("question_progress")
        .select("id, metadata")
        .eq("question_id", questionId)
        .eq("assignee_id", userId)
        .maybeSingle();
      const meta = ((existing as any)?.metadata ?? {}) as Record<string, unknown>;
      const merged = {
        ...meta,
        iris_checklist_state: { checked: next, generated_at: new Date().toISOString() } satisfies ChecklistState,
      };
      if (existing && (existing as any).id) {
        await supabase
          .from("question_progress")
          .update({ metadata: merged as any })
          .eq("id", (existing as any).id);
      } else {
        await supabase
          .from("question_progress")
          .insert({
            mission_id: missionId,
            question_id: questionId,
            assignee_id: userId,
            metadata: merged as any,
          } as any);
      }
    } catch {
      /* non-blocking */
    }
  }

  function toggle(idx: number) {
    const next = checked.includes(idx) ? checked.filter((n) => n !== idx) : [...checked, idx];
    persist(next);
  }

  if (!visible) return null;

  return (
    <div
      className="mt-3 rounded-lg p-3"
      style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(196,154,43,0.18)" }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5" style={{ color: GOLD }}>
          <Target size={12} />
          <span style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700 }}>
            Score Predictor
          </span>
        </div>
        <span style={{ fontSize: 9, fontStyle: "italic", color: "rgba(255,255,255,0.4)" }}>
          What a 4–5 answer contains
        </span>
      </div>

      {loading || (!data && !error) ? (
        <div className="space-y-2" aria-label="loading checklist">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              style={{
                height: 28,
                borderRadius: 4,
                background: "rgba(255,255,255,0.04)",
                animation: "pulse 1.6s ease-in-out infinite",
              }}
            />
          ))}
        </div>
      ) : error ? (
        <div style={{ fontSize: 11, color: "#f08080" }}>{error}</div>
      ) : data ? (
        <>
          <div className="space-y-1.5">
            {data.items.map((item, idx) => {
              const isChecked = checked.includes(idx);
              return (
                <div
                  key={idx}
                  className="flex items-start gap-2 rounded px-1.5 py-1"
                  style={{ background: isChecked ? "rgba(196,154,43,0.05)" : "transparent" }}
                >
                  {item.critical && (
                    <span
                      aria-label="Critical"
                      style={{
                        width: 4,
                        height: 4,
                        borderRadius: 999,
                        background: "#f87171",
                        marginTop: 8,
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <button
                    onClick={() => toggle(idx)}
                    aria-pressed={isChecked}
                    aria-label={`Toggle checklist item ${idx + 1}`}
                    style={{
                      width: 16,
                      height: 16,
                      flexShrink: 0,
                      marginTop: 2,
                      borderRadius: 3,
                      border: `1.5px solid ${isChecked ? GOLD : "rgba(255,255,255,0.25)"}`,
                      background: isChecked ? GOLD : "transparent",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#0a1320",
                      fontSize: 11,
                      lineHeight: 1,
                      cursor: "pointer",
                    }}
                  >
                    {isChecked ? "✓" : ""}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div
                      style={{
                        fontSize: 12,
                        color: isChecked ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.92)",
                        textDecoration: isChecked ? "line-through" : "none",
                        lineHeight: 1.5,
                      }}
                    >
                      {item.text}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 8,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      padding: "2px 6px",
                      borderRadius: 999,
                      background: `${CATEGORY_COLOR[item.category]}20`,
                      color: CATEGORY_COLOR[item.category],
                      flexShrink: 0,
                      marginTop: 2,
                      fontWeight: 600,
                    }}
                  >
                    {item.category}
                  </span>
                </div>
              );
            })}
          </div>

          <div
            style={{
              marginTop: 10,
              paddingTop: 8,
              borderTop: "1px solid rgba(255,255,255,0.05)",
              fontSize: 10,
              fontStyle: "italic",
              color: "#EF9F27",
            }}
          >
            ⚠ Watch out: {data.score_floor_note}
          </div>
          <div style={{ marginTop: 6, fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
            {checked.filter((i) => i < data.items.length).length} of {data.items.length} elements covered
          </div>
        </>
      ) : null}
    </div>
  );
}
