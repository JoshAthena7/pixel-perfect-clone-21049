/**
 * Team Pulse Card — three tabs on the Flight Deck:
 *   ✨ Inspiration | 🧠 Trivia | 🤝 Team
 *
 * Default tab rotates by day-of-week; last-chosen tab is remembered in
 * localStorage. Inspiration & Trivia are IRIS-generated per mission per day.
 * Team tab shows recent wins, supportive nudges, and a shoutout box.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, Brain, Users, Loader2, PartyPopper, Send, Lock, Trophy, X, Flame, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ensureMissionMoment } from "@/lib/atlas-moments.functions";
import { submitTriviaAnswer, fetchTriviaLeaderboard } from "@/lib/trivia-scoring.functions";
import { toast } from "sonner";

const GOLD = "#C49A2B";
type Tab = "inspiration" | "trivia" | "team";

function defaultTab(): Tab {
  const dow = new Date().getDay(); // 0 Sun ... 6 Sat
  if (dow === 0 || dow === 6) return "team";
  if (dow === 2 || dow === 4) return "trivia";
  return "inspiration";
}

const LS_KEY = "atlas:team-pulse:tab";

export function TeamPulseCard({ missionId }: { missionId: string | null }) {
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window === "undefined") return defaultTab();
    const stored = window.localStorage.getItem(LS_KEY) as Tab | null;
    return stored ?? defaultTab();
  });

  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(LS_KEY, tab);
  }, [tab]);

  if (!missionId) return null;

  return (
    <div
      className="rounded-xl border bg-surface/30 overflow-hidden"
      style={{ borderColor: "rgba(255,255,255,0.08)" }}
    >
      <div className="flex items-center gap-1 px-2 pt-2">
        <TabBtn active={tab === "inspiration"} onClick={() => setTab("inspiration")} icon={<Sparkles className="h-3.5 w-3.5" />} label="Inspiration" />
        <TabBtn active={tab === "trivia"} onClick={() => setTab("trivia")} icon={<Brain className="h-3.5 w-3.5" />} label="Trivia" />
        <TabBtn active={tab === "team"} onClick={() => setTab("team")} icon={<Users className="h-3.5 w-3.5" />} label="Team" />
      </div>
      <div className="px-4 py-3">
        {tab === "inspiration" && <InspirationTab missionId={missionId} />}
        {tab === "trivia" && <TriviaTab missionId={missionId} />}
        {tab === "team" && <TeamTab missionId={missionId} />}
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors"
      style={{
        background: active ? "rgba(196,154,43,0.12)" : "transparent",
        color: active ? GOLD : "rgba(255,255,255,0.6)",
      }}
    >
      {icon} {label}
    </button>
  );
}

/* -------------------- Inspiration -------------------- */
function InspirationTab({ missionId }: { missionId: string }) {
  const ensure = useServerFn(ensureMissionMoment);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["atlas-moment", "inspiration", missionId, new Date().toISOString().slice(0, 10)],
    queryFn: () => ensure({ data: { missionId, momentType: "inspiration" } }),
    retry: false,
  });

  if (isLoading) return <Loading text="IRIS is finding the moment…" />;
  if (error) return <ErrorBlock message={String((error as Error).message)} onRetry={() => refetch()} />;
  const c = (data?.content ?? {}) as { quote?: string; attribution?: string; context?: string };
  return (
    <div className="relative">
      <span
        className="absolute right-0 top-0 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
        style={{ background: "rgba(196,154,43,0.12)", color: GOLD, border: "1px solid rgba(196,154,43,0.3)" }}
      >
        Today's Inspiration
      </span>
      <div className="pr-32">
        <div className="italic leading-snug" style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
          {c.quote || "—"}
        </div>
        {c.attribution && (
          <div className="mt-2 text-[11px]" style={{ color: "rgba(255,255,255,0.55)" }}>
            — <span style={{ color: GOLD }}>{c.attribution}</span>
          </div>
        )}
        {c.context && (
          <div className="mt-1 text-[10.5px] italic" style={{ color: "rgba(255,255,255,0.45)" }}>{c.context}</div>
        )}
      </div>
    </div>
  );
}

/* -------------------- Trivia -------------------- */
function TriviaTab({ missionId }: { missionId: string }) {
  const ensure = useServerFn(ensureMissionMoment);
  const submitAnswer = useServerFn(submitTriviaAnswer);
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const questionShownAt = useRef<number>(Date.now());
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(10);
  const [timerActive, setTimerActive] = useState(false);
  const [timerFrozen, setTimerFrozen] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [pendingFeedback, setPendingFeedback] = useState<
    { points: number; speedTier: "lightning" | "quick" | "good" | null; correct: boolean; correctText: string; timeout?: boolean } | null
  >(null);
  const [submitting, setSubmitting] = useState(false);
  const [expanded, setExpanded] = useState(false);


  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["atlas-moment", "trivia", missionId, today],
    queryFn: () => ensure({ data: { missionId, momentType: "trivia" } }),
    retry: false,
  });

  const { data: todaysAnswer, refetch: refetchTodays } = useQuery({
    queryKey: ["trivia-today", missionId, today],
    queryFn: async () => {
      const { data: me } = await supabase.auth.getUser();
      if (!me.user) return null;
      const { data: row } = await supabase
        .from("mission_trivia_scores")
        .select("*")
        .eq("mission_id", missionId)
        .eq("user_id", me.user.id)
        .eq("question_date", today)
        .maybeSingle();
      return row;
    },
  });

  const { data: myScore, refetch: refetchScore } = useQuery({
    queryKey: ["trivia-my-score", missionId],
    queryFn: async () => {
      const { data: me } = await supabase.auth.getUser();
      if (!me.user) return { total: 0, streak: 0 };
      const { data: rows } = await supabase
        .from("mission_trivia_scores")
        .select("points_earned, streak_day, question_date")
        .eq("mission_id", missionId)
        .eq("user_id", me.user.id)
        .order("question_date", { ascending: false });
      const total = (rows ?? []).reduce((s: number, r: any) => s + (r.points_earned ?? 0), 0);
      const streak = rows && rows.length > 0 ? (rows[0] as any).streak_day ?? 0 : 0;
      return { total, streak };
    },
  });

  const c = (data?.content ?? {}) as {
    question?: string;
    options?: string[];
    correct_index?: number;
    explanation?: string;
  };
  const opts = Array.isArray(c.options) ? c.options : [];
  const pickedAnswer = todaysAnswer?.answer_given ?? null;
  const pickedIndex = pickedAnswer && pickedAnswer !== "TIMEOUT" ? opts.findIndex((o) => o === pickedAnswer) : -1;
  const answered = !!todaysAnswer;
  const wasTimeout = todaysAnswer?.answer_given === "TIMEOUT";
  const correctIdx = typeof c.correct_index === "number" ? c.correct_index : -1;

  function clearTimers() {
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  }

  async function handleTimeout() {
    if (submitting) return;
    clearTimers();
    setTimerFrozen(true);
    setTimedOut(true);
    setSecondsLeft(0);
    setSubmitting(true);
    try {
      await submitAnswer({
        data: {
          missionId,
          questionText: c.question ?? "",
          answerGiven: "TIMEOUT",
          correctAnswer: opts[correctIdx] ?? "",
          isCorrect: false,
          secondsToAnswer: 10,
          timeout: true,
        },
      });
      setPendingFeedback({
        points: 0,
        speedTier: null,
        correct: false,
        correctText: opts[correctIdx] ?? "",
        timeout: true,
      });
      toast.error("⏱ Too slow! Streak reset.");
      await Promise.all([
        refetchTodays(),
        refetchScore(),
        qc.invalidateQueries({ queryKey: ["trivia-team-today", missionId] }),
      ]);
      setTimeout(() => setPendingFeedback(null), 3500);
    } catch (e: any) {
      console.error("[trivia] timeout submit failed", e);
    } finally {
      setSubmitting(false);
    }
  }

  // Start countdown when question loads and not answered
  useEffect(() => {
    if (!data || answered || timedOut) return;
    questionShownAt.current = Date.now();
    setSecondsLeft(10);
    setTimerActive(true);
    setTimerFrozen(false);
    intervalRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        const elapsed = Math.floor((Date.now() - questionShownAt.current) / 1000);
        const remaining = Math.max(0, 10 - elapsed);
        if (remaining <= 0 && intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        return remaining;
      });
    }, 250);
    timeoutRef.current = setTimeout(() => {
      handleTimeout();
    }, 10000);
    return () => clearTimers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, answered]);

  // Hide countdown number 300ms after hitting 0
  const [showCountdown, setShowCountdown] = useState(true);
  useEffect(() => {
    if (secondsLeft === 0 && timerActive) {
      const t = setTimeout(() => setShowCountdown(false), 300);
      return () => clearTimeout(t);
    }
    setShowCountdown(true);
  }, [secondsLeft, timerActive]);

  if (isLoading) return <Loading text="IRIS is drafting today's trivia…" />;
  if (error) return <ErrorBlock message={String((error as Error).message)} onRetry={() => refetch()} />;

  async function handlePick(i: number) {
    if (answered || submitting || timedOut) return;
    clearTimers();
    setTimerFrozen(true);
    const isCorrect = i === correctIdx;
    const secondsToAnswer = (Date.now() - questionShownAt.current) / 1000;
    setSubmitting(true);
    try {
      const result: any = await submitAnswer({
        data: {
          missionId,
          questionText: c.question ?? "",
          answerGiven: opts[i] ?? "",
          correctAnswer: opts[correctIdx] ?? "",
          isCorrect,
          secondsToAnswer,
        },
      });
      setPendingFeedback({
        points: result.points_earned ?? 0,
        speedTier: result.speedTier ?? null,
        correct: isCorrect,
        correctText: opts[correctIdx] ?? "",
      });
      await Promise.all([
        refetchTodays(),
        refetchScore(),
        qc.invalidateQueries({ queryKey: ["trivia-team-today", missionId] }),
      ]);
      setTimeout(() => setPendingFeedback(null), 3500);
    } catch (e: any) {
      console.error("[trivia] submit failed", e);
      toast.error("Could not record your answer");
    } finally {
      setSubmitting(false);
    }
  }

  // Color for countdown number based on seconds left
  const countdownColor =
    secondsLeft >= 5 ? "rgba(74,222,128,0.9)"
    : secondsLeft >= 2 ? "rgba(251,191,36,0.9)"
    : "rgba(248,113,113,0.9)";

  const showTimerBar = !answered && timerActive;

  return (
    <div className="relative">
      {/* Timer bar */}
      {showTimerBar && (
        <div className="absolute left-0 right-0 top-0 overflow-hidden" style={{ height: 3 }}>
          <div
            className="trivia-timer-bar"
            style={{
              height: 3,
              width: timerFrozen ? undefined : "100%",
              animation: timerFrozen
                ? "none"
                : "trivia-timer-deplete 10s linear forwards, trivia-timer-color 10s linear forwards",
              animationPlayState: timerFrozen ? "paused" : "running",
              background: "rgba(74,222,128,0.8)",
              transition: timerFrozen ? "opacity 800ms ease-out" : undefined,
              opacity: timerFrozen && (answered || timedOut) ? 0 : 1,
            }}
          />
          <style>{`
            @keyframes trivia-timer-deplete {
              from { width: 100%; }
              to { width: 0%; }
            }
            @keyframes trivia-timer-color {
              0%   { background-color: rgba(74,222,128,0.8); }
              50%  { background-color: rgba(74,222,128,0.8); }
              70%  { background-color: rgba(251,191,36,0.8); }
              85%  { background-color: rgba(248,113,113,0.8); }
              100% { background-color: rgba(248,113,113,0.8); }
            }
          `}</style>
        </div>
      )}

      {/* MY SCORE corner */}
      <div className="absolute right-0 top-0 flex items-start gap-2" style={{ marginTop: showTimerBar ? 6 : 0 }}>
        {showTimerBar && showCountdown && (
          <div
            style={{
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: 11,
              color: countdownColor,
              fontWeight: 600,
              lineHeight: 1,
              alignSelf: "center",
            }}
          >
            {secondsLeft}
          </div>
        )}
        <div className="text-right">
          <div className="text-[8px] uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.45)" }}>My Score</div>
          <div className="text-[16px] font-bold text-white leading-none mt-0.5">{myScore?.total ?? 0}</div>
          {myScore && myScore.streak > 0 && (
            <div className="text-[9px] mt-0.5 flex items-center justify-end gap-0.5" style={{ color: GOLD }}>
              <Flame className="h-2.5 w-2.5" /> {myScore.streak} day{myScore.streak === 1 ? "" : "s"}
            </div>
          )}
        </div>
        <button
          onClick={() => setLeaderboardOpen(true)}
          className="p-1 rounded-md transition-colors hover:bg-white/10"
          style={{ color: GOLD }}
          aria-label="Open leaderboard"
          title="Leaderboard"
        >
          <Trophy className="h-3.5 w-3.5" />
        </button>
      </div>

      {answered && !expanded ? (
        <div className="pt-2">
          <button
            onClick={() => setExpanded(true)}
            className="w-full flex items-center justify-between rounded-md px-3 py-2 text-left transition-colors hover:bg-white/5"
            style={{
              background: wasTimeout ? "rgba(248,113,113,0.06)" : "rgba(74,222,128,0.06)",
              border: `0.5px solid ${wasTimeout ? "rgba(248,113,113,0.25)" : "rgba(74,222,128,0.25)"}`,
            }}
          >
            <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.75)" }}>
              {wasTimeout ? (
                <>⏱ Timed out today · answer was <span style={{ color: "#86EFAC" }}>{opts[correctIdx] ?? ""}</span></>
              ) : todaysAnswer?.is_correct ? (
                <>✓ Answered today · <span style={{ color: GOLD, fontWeight: 600 }}>+{todaysAnswer?.points_earned ?? 0} pts</span></>
              ) : (
                <>Answered today · answer was <span style={{ color: "#86EFAC" }}>{opts[correctIdx] ?? ""}</span></>
              )}
            </span>
            <span className="text-[10px] flex items-center gap-1" style={{ color: "rgba(255,255,255,0.45)" }}>
              Show question <ChevronDown className="h-3 w-3" />
            </span>
          </button>
        </div>
      ) : (
        <>
          <div className="pr-32 pt-2" style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", fontWeight: 600 }}>
            {c.question || "—"}
          </div>
          <div className="mt-3 grid grid-cols-1 gap-1.5">
            {opts.map((opt, i) => {
              const isCorrectOpt = i === correctIdx;
              const isPicked = pickedIndex === i;
              const isLocked = answered || submitting || timedOut;
              let bg = "rgba(255,255,255,0.04)";
              let border = "rgba(255,255,255,0.1)";
              let color = "rgba(255,255,255,0.85)";
              let opacity = 1;
              if (timedOut && !answered) {
                if (isCorrectOpt) {
                  bg = "rgba(74,222,128,0.1)";
                  border = "rgba(74,222,128,0.4)";
                  color = "#86EFAC";
                } else {
                  opacity = 0.4;
                }
              } else if (answered) {
                if (isCorrectOpt) {
                  bg = "rgba(74,222,128,0.2)";
                  border = "rgba(74,222,128,0.6)";
                  color = "#86EFAC";
                } else if (isPicked) {
                  bg = "rgba(248,113,113,0.15)";
                  border = "rgba(248,113,113,0.5)";
                  color = "#FCA5A5";
                } else {
                  bg = "rgba(255,255,255,0.02)";
                  color = "rgba(255,255,255,0.4)";
                }
              }
              return (
                <button
                  key={i}
                  disabled={isLocked}
                  onClick={() => handlePick(i)}
                  className="text-left rounded-md transition-colors"
                  style={{
                    background: bg,
                    border: `0.5px solid ${border}`,
                    color,
                    padding: "6px 10px",
                    fontSize: 11,
                    opacity,
                    cursor: isLocked ? "not-allowed" : "pointer",
                    pointerEvents: isLocked ? "none" : "auto",
                  }}
                >
                  {opt}
                </button>
              );
            })}
          </div>

          {timedOut && !answered && (
            <div className="mt-2 text-center text-[11px]" style={{ color: "rgba(255,255,255,0.55)" }}>
              ⏱ Time's up — {opts[correctIdx] ?? ""} was correct
            </div>
          )}

          {answered && (
            <div className="mt-2 flex items-center justify-between">
              <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.5)" }}>
                {wasTimeout ? "⏱ Timed out today" : `You earned ${todaysAnswer?.points_earned ?? 0} pts today`}
              </div>
              <button
                onClick={() => setExpanded(false)}
                className="text-[10px] hover:text-white/80 transition-colors"
                style={{ color: "rgba(255,255,255,0.45)" }}
              >
                Hide question
              </button>
            </div>
          )}

          {answered && c.explanation && (
            <div
              className="mt-3 rounded-md px-3 py-2 text-[11px] italic"
              style={{ background: "rgba(196,154,43,0.06)", borderLeft: `2px solid ${GOLD}`, color: "rgba(255,255,255,0.78)", lineHeight: 1.6 }}
            >
              {c.explanation}
            </div>
          )}
        </>
      )}

      {/* Floating points toast */}
      {pendingFeedback && (
        <div
          className="absolute left-1/2 -translate-x-1/2 -top-7 rounded-md px-3 py-1 text-[11px] font-semibold animate-in fade-in zoom-in"
          style={{
            background: pendingFeedback.correct ? "rgba(74,222,128,0.2)" : "rgba(248,113,113,0.15)",
            border: `1px solid ${pendingFeedback.correct ? "rgba(74,222,128,0.6)" : "rgba(248,113,113,0.5)"}`,
            color: pendingFeedback.correct ? "#86EFAC" : "#FCA5A5",
          }}
        >
          {pendingFeedback.correct ? (
            pendingFeedback.speedTier === "lightning" ? <>+{pendingFeedback.points} pts ⚡ Lightning fast!</>
            : pendingFeedback.speedTier === "quick" ? <>+{pendingFeedback.points} pts 🏃 Quick answer!</>
            : <>+{pendingFeedback.points} pts ✓ Good timing!</>
          ) : pendingFeedback.timeout ? (
            <>⏱ Too slow! Streak reset.</>
          ) : (
            <>Not quite — {pendingFeedback.correctText} was right</>
          )}
        </div>
      )}


      {leaderboardOpen && (
        <LeaderboardPanel missionId={missionId} onClose={() => setLeaderboardOpen(false)} />
      )}
    </div>
  );
}

/* -------------------- Leaderboard Panel -------------------- */
type LeaderboardWindow = "all" | "week" | "today";

function LeaderboardPanel({ missionId, onClose }: { missionId: string; onClose: () => void }) {
  const fetchBoard = useServerFn(fetchTriviaLeaderboard);
  const [tab, setTab] = useState<LeaderboardWindow>("all");
  const [missionName, setMissionName] = useState("Mission");

  useEffect(() => {
    supabase.from("missions").select("name").eq("id", missionId).maybeSingle()
      .then(({ data }) => { if (data?.name) setMissionName(data.name); });
  }, [missionId]);

  const { data: me } = useQuery({
    queryKey: ["auth-me"],
    queryFn: async () => (await supabase.auth.getUser()).data.user,
  });

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["trivia-leaderboard", missionId, tab],
    queryFn: () => fetchBoard({ data: { missionId, window: tab } }),
  });

  const scoreLabel = tab === "all" ? "pts total" : tab === "week" ? "pts this week" : "pts today";
  const myRow = me ? rows.find((r: any) => r.user_id === me.id) : null;
  const top20 = rows.slice(0, 20);
  const myRankIdx = me ? rows.findIndex((r: any) => r.user_id === me.id) : -1;
  const showPinned = myRow && myRankIdx >= 20;

  return (
    <>
      {/* Backdrop — dims & isolates the page behind the panel, click to close */}
      <div
        onClick={onClose}
        aria-hidden
        className="fixed inset-0 z-40 animate-in fade-in"
        style={{ background: "rgba(2,6,14,0.55)", backdropFilter: "blur(2px)" }}
      />
      <div
        role="dialog"
        aria-label="Trivia Leaderboard"
        className="fixed top-0 right-0 h-full z-50 flex flex-col animate-in slide-in-from-right"
        style={{
          width: 320,
          maxWidth: "92vw",
          background: "#0a1420",
          borderLeft: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "-8px 0 24px rgba(0,0,0,0.5)",
        }}
      >

      <div className="flex items-start justify-between px-4 py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <div>
          <div className="text-[14px] font-medium text-white flex items-center gap-1.5">
            <Trophy className="h-3.5 w-3.5" style={{ color: GOLD }} /> Trivia Leaderboard
          </div>
          <div className="text-[11px] mt-0.5" style={{ color: "rgba(255,255,255,0.5)" }}>
            {missionName} · {tab === "all" ? "All time" : tab === "week" ? "This week" : "Today"}
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-white/10"
          style={{ color: "rgba(255,255,255,0.6)" }}
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex gap-1 px-3 py-2 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        {(["all", "week", "today"] as LeaderboardWindow[]).map((w) => (
          <button
            key={w}
            onClick={() => setTab(w)}
            className="text-[10px] px-2 py-1 rounded-md transition-colors"
            style={{
              background: tab === w ? "rgba(196,154,43,0.15)" : "transparent",
              color: tab === w ? GOLD : "rgba(255,255,255,0.6)",
            }}
          >
            {w === "all" ? "All Time" : w === "week" ? "This Week" : "Today"}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 text-[11px] text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <div className="p-4 text-[11px] text-muted-foreground">
            No trivia answers {tab === "today" ? "today" : tab === "week" ? "this week" : "yet"}. Be the first.
          </div>
        ) : (
          <>
            {top20.map((r: any, i: number) => (
              <LeaderboardRow key={r.user_id} row={r} rank={i + 1} isMe={me?.id === r.user_id} scoreLabel={scoreLabel} />
            ))}
            {showPinned && (
              <>
                <div className="text-center text-[10px] py-1.5" style={{ color: "rgba(255,255,255,0.3)" }}>···</div>
                <LeaderboardRow row={myRow as any} rank={myRankIdx + 1} isMe scoreLabel={scoreLabel} />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function LeaderboardRow({
  row, rank, isMe, scoreLabel,
}: { row: any; rank: number; isMe: boolean; scoreLabel: string }) {
  const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null;
  const name = row.display_name || (row.email ? row.email.split("@")[0] : "Teammate");
  return (
    <div
      className="px-4 py-2 border-b transition-colors hover:bg-white/[0.03]"
      style={{ borderColor: "rgba(255,255,255,0.05)", minHeight: 56 }}
    >
      <div className="flex items-center gap-2">
        <div className="w-7 text-center" style={{
          fontSize: medal ? 16 : 11,
          fontWeight: rank === 1 ? 700 : rank <= 3 ? 600 : 400,
          color: medal ? undefined : "rgba(255,255,255,0.45)",
        }}>
          {medal ?? rank}
        </div>
        <div className="flex-1 min-w-0 truncate text-[12px]" style={{
          color: isMe ? GOLD : "rgba(255,255,255,0.85)",
          fontWeight: isMe ? 600 : 400,
        }}>
          {name}
          {isMe && <span className="ml-1 text-[9px]" style={{ color: "rgba(255,255,255,0.4)" }}>(you)</span>}
        </div>
        <div className="text-[13px] font-semibold text-white w-12 text-right">{row.total_points}</div>
      </div>
      {row.total_answers > 0 && (
        <div className="text-[9px] mt-0.5 pl-9" style={{ color: "rgba(255,255,255,0.4)" }}>
          {row.correct_answers}/{row.total_answers} correct · {row.accuracy_pct ?? 0}% · 🔥{row.best_streak} · {scoreLabel}
        </div>
      )}
    </div>
  );
}


/* -------------------- Team -------------------- */
function TeamTab({ missionId }: { missionId: string }) {
  return (
    <div className="space-y-4">
      <TeamTriviaStatus missionId={missionId} />
      <IrisNudges missionId={missionId} />
      <ShoutoutBox missionId={missionId} />
    </div>
  );
}

function TeamTriviaStatus({ missionId }: { missionId: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = useQuery({
    queryKey: ["trivia-team-today", missionId, today],
    queryFn: async () => {
      const { data: members } = await supabase
        .from("mission_team_members")
        .select("member_id, atlas_team_members:member_id(first_name, last_name)")
        .eq("mission_id", missionId);
      const memberIds = (members ?? []).map((m: any) => m.member_id);
      if (memberIds.length === 0) return [] as Array<{ id: string; name: string; status: "correct" | "wrong" | "pending" }>;
      const { data: scores } = await supabase
        .from("mission_trivia_scores")
        .select("user_id, is_correct")
        .eq("mission_id", missionId)
        .eq("question_date", today)
        .in("user_id", memberIds);
      const scoreMap = new Map<string, boolean>((scores ?? []).map((s: any) => [s.user_id, s.is_correct]));
      return (members ?? []).map((m: any) => {
        const name = `${m.atlas_team_members?.first_name ?? ""} ${m.atlas_team_members?.last_name ?? ""}`.trim() || "Teammate";
        const ans = scoreMap.get(m.member_id);
        const status: "correct" | "wrong" | "pending" = ans === true ? "correct" : ans === false ? "wrong" : "pending";
        return { id: m.member_id as string, name, status };
      });
    },
  });

  if (!data || data.length === 0) return null;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Today's Trivia</div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5">
        {data.map((m) => (
          <div key={m.id} className="text-[11px] flex items-center gap-1" style={{ color: "rgba(255,255,255,0.78)" }}>
            <span>{m.name}</span>
            {m.status === "correct" && <span style={{ color: GOLD }}>⭐</span>}
            {m.status === "wrong" && <span style={{ color: "rgba(255,255,255,0.35)" }}>●</span>}
          </div>
        ))}
      </div>
    </div>
  );
}


function RecentWins({ missionId }: { missionId: string }) {
  const { data: events } = useQuery({
    queryKey: ["atlas-recent-wins", missionId],
    queryFn: async () => {
      const since48 = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
      const since24 = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const [finalized, review, scores] = await Promise.all([
        supabase.from("question_progress")
          .select("id, question_id, assignee_id, status, status_changed_at")
          .eq("mission_id", missionId).eq("status", "finalized").gte("status_changed_at", since48).limit(10),
        supabase.from("question_progress")
          .select("id, question_id, assignee_id, status, status_changed_at")
          .eq("mission_id", missionId).eq("status", "internal_review").gte("status_changed_at", since24).limit(10),
        supabase.from("mock_scores")
          .select("id, question_id, recorded_by, score, scored_at")
          .eq("mission_id", missionId).gt("score", 80).gte("scored_at", since48).limit(10),
      ]);
      type Item = { kind: "finalized" | "review" | "score"; questionId: string | null; userId: string | null; when: string; meta?: string };
      const items: Item[] = [
        ...(finalized.data ?? []).map((r: any) => ({ kind: "finalized" as const, questionId: r.question_id, userId: r.assignee_id, when: r.status_changed_at })),
        ...(review.data ?? []).map((r: any) => ({ kind: "review" as const, questionId: r.question_id, userId: r.assignee_id, when: r.status_changed_at })),
        ...(scores.data ?? []).map((r: any) => ({ kind: "score" as const, questionId: r.question_id, userId: r.recorded_by, when: r.scored_at, meta: `${r.score}` })),
      ].sort((a, b) => +new Date(b.when) - +new Date(a.when)).slice(0, 6);
      const qids = Array.from(new Set(items.map(i => i.questionId).filter(Boolean))) as string[];
      const uids = Array.from(new Set(items.map(i => i.userId).filter(Boolean))) as string[];
      const [qs, users] = await Promise.all([
        qids.length ? supabase.from("mission_questions").select("id, question_number").in("id", qids) : Promise.resolve({ data: [] as any[] } as any),
        uids.length ? supabase.from("atlas_team_members").select("id, first_name, last_name").in("id", uids) : Promise.resolve({ data: [] as any[] } as any),
      ]);
      const qmap = new Map<string, string>((qs.data ?? []).map((q: any) => [q.id, q.question_number ?? "?"]));
      const umap = new Map<string, string>((users.data ?? []).map((u: any) => [u.id, `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim()]));
      return items.map(i => ({ ...i, qNum: i.questionId ? (qmap.get(i.questionId) ?? "?") : "?", who: i.userId ? (umap.get(i.userId) ?? "A teammate") : "A teammate" }));
    },
  });

  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Recent Wins</div>
      {!events || events.length === 0 ? (
        <div className="mt-2 text-[11px] italic text-muted-foreground">The team is heads down. Check back soon.</div>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {events.map((e, i) => (
            <li key={i} className="flex items-start gap-2 text-[11.5px]">
              <PartyPopper className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: GOLD }} />
              <span style={{ color: "rgba(255,255,255,0.85)" }}>
                <span className="font-medium">{e.who}</span>{" "}
                {e.kind === "finalized" && <>finalized <span style={{ color: GOLD }}>{e.qNum}</span></>}
                {e.kind === "review" && <>moved <span style={{ color: GOLD }}>{e.qNum}</span> to internal review</>}
                {e.kind === "score" && <>scored <span style={{ color: "#3DBE7D" }}>{e.meta}</span> on <span style={{ color: GOLD }}>{e.qNum}</span></>}
                <span className="ml-1.5 text-[10px] text-muted-foreground">· {timeAgo(e.when)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function IrisNudges({ missionId }: { missionId: string }) {
  const { data: nudges } = useQuery({
    queryKey: ["atlas-iris-nudges", missionId],
    queryFn: async () => {
      const { data: me } = await supabase.auth.getUser();
      const fourDaysAgo = new Date(Date.now() - 4 * 86400 * 1000).toISOString();
      const { data: asgs } = await supabase
        .from("mission_assignments")
        .select(`id, question_id, assigned_writer_id, last_activity_at,
          mission_questions:question_id(question_number, health_status, status),
          writer:atlas_team_members!mission_assignments_assigned_writer_id_fkey(first_name, last_name)`)
        .eq("mission_id", missionId)
        .lt("last_activity_at", fourDaysAgo)
        .limit(10);
      return (asgs ?? [])
        .filter((a: any) =>
          a.assigned_writer_id && a.assigned_writer_id !== me.user?.id
          && (a.mission_questions?.health_status === "at_risk" || a.mission_questions?.health_status === "blocked")
        )
        .slice(0, 2)
        .map((a: any) => ({
          name: `${a.writer?.first_name ?? ""} ${a.writer?.last_name ?? ""}`.trim() || "A teammate",
          qNum: a.mission_questions?.question_number ?? "?",
          days: Math.floor((Date.now() - +new Date(a.last_activity_at)) / 86400000),
        }));
    },
  });
  if (!nudges || nudges.length === 0) return null;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">IRIS Nudges</div>
      <div className="mt-2 space-y-2">
        {nudges.map((n, i) => (
          <div key={i} className="rounded-md px-3 py-2 text-[11.5px]" style={{ background: "rgba(127,119,221,0.06)", border: "1px solid rgba(127,119,221,0.2)", color: "rgba(255,255,255,0.78)", lineHeight: 1.6 }}>
            <span style={{ color: "#C8C3FF" }}>{n.name}</span> hasn't touched <span style={{ color: GOLD }}>{n.qNum}</span> in {n.days} days. If they need a hand, reach out — the team has each other's back.
          </div>
        ))}
      </div>
    </div>
  );
}

function ShoutoutBox({ missionId }: { missionId: string }) {
  const qc = useQueryClient();
  const [message, setMessage] = useState("");
  const [toId, setToId] = useState<string>("");
  const [sending, setSending] = useState(false);

  const { data: teammates } = useQuery({
    queryKey: ["atlas-teammates", missionId],
    queryFn: async () => {
      const { data: me } = await supabase.auth.getUser();
      const { data: rows } = await supabase
        .from("mission_team_members")
        .select("member_id, atlas_team_members:member_id(first_name, last_name)")
        .eq("mission_id", missionId);
      return (rows ?? [])
        .filter((r: any) => r.member_id !== me.user?.id)
        .map((r: any) => ({
          id: r.member_id as string,
          name: `${r.atlas_team_members?.first_name ?? ""} ${r.atlas_team_members?.last_name ?? ""}`.trim() || "Teammate",
        }));
    },
  });

  const { data: received } = useQuery({
    queryKey: ["atlas-shoutouts-mine", missionId],
    queryFn: async () => {
      const { data: me } = await supabase.auth.getUser();
      if (!me.user) return [];
      const { data: shouts } = await supabase
        .from("atlas_shoutouts")
        .select("id, message, from_user_id, created_at")
        .eq("mission_id", missionId)
        .eq("to_user_id", me.user.id)
        .order("created_at", { ascending: false })
        .limit(5);
      const fromIds = Array.from(new Set((shouts ?? []).map((s: any) => s.from_user_id)));
      const { data: senders } = fromIds.length
        ? await supabase.from("atlas_team_members").select("id, first_name, last_name").in("id", fromIds)
        : { data: [] as any[] };
      const map = new Map<string, string>((senders ?? []).map((u: any) => [u.id, `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim()]));
      return (shouts ?? []).map((s: any) => ({ ...s, from: map.get(s.from_user_id) ?? "A teammate" }));
    },
  });

  async function send() {
    if (!toId) { toast.error("Pick a teammate"); return; }
    const text = message.trim();
    if (!text) { toast.error("Write a message"); return; }
    if (text.length > 200) { toast.error("Keep it under 200 characters"); return; }
    setSending(true);
    const { data: me } = await supabase.auth.getUser();
    if (!me.user) { setSending(false); return; }
    if (me.user.id === toId) { toast.error("You can't shout out yourself"); setSending(false); return; }
    const { error } = await supabase.from("atlas_shoutouts").insert({
      mission_id: missionId, from_user_id: me.user.id, to_user_id: toId, message: text,
    });
    setSending(false);
    if (error) { toast.error(error.message); return; }
    const recip = teammates?.find(t => t.id === toId);
    toast.success(`Shoutout sent to ${recip?.name ?? "teammate"} ✓`);
    setMessage("");
    setToId("");
    qc.invalidateQueries({ queryKey: ["atlas-shoutouts-mine", missionId] });
  }

  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Shoutout</div>

      {received && received.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {received.map((s) => (
            <li
              key={s.id}
              className="rounded-md px-3 py-2 text-[11.5px]"
              style={{ background: "rgba(196,154,43,0.1)", border: "1px solid rgba(196,154,43,0.35)", color: "rgba(255,255,255,0.88)", lineHeight: 1.55 }}
            >
              <span className="font-semibold" style={{ color: GOLD }}>{s.from}:</span> {s.message}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 space-y-2">
        <select
          value={toId}
          onChange={(e) => setToId(e.target.value)}
          className="w-full text-[12px] px-2 py-1.5 rounded-md bg-background/60 text-white border focus:outline-none"
          style={{ borderColor: "rgba(255,255,255,0.1)" }}
        >
          <option value="">Shout out a teammate…</option>
          {(teammates ?? []).map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <div className="flex gap-2">
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, 200))}
            placeholder="They'll see it in their cockpit."
            className="flex-1 text-[12px] px-2 py-1.5 rounded-md bg-background/60 text-white border focus:outline-none placeholder:text-muted-foreground"
            style={{ borderColor: "rgba(255,255,255,0.1)" }}
          />
          <button
            onClick={send}
            disabled={sending}
            className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-[11.5px] font-semibold disabled:opacity-60"
            style={{ background: "rgba(196,154,43,0.15)", border: `1px solid ${GOLD}`, color: GOLD }}
          >
            {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />} Send
          </button>
        </div>
        <div className="text-[10px] text-muted-foreground/70">{200 - message.length} chars left</div>
      </div>
    </div>
  );
}

/* -------------------- shared -------------------- */
function Loading({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 text-[11.5px] italic text-muted-foreground">
      <Loader2 className="h-3.5 w-3.5 animate-spin" /> {text}
    </div>
  );
}
function ErrorBlock({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md px-3 py-2 text-[11px]" style={{ background: "rgba(224,74,74,0.06)", border: "1px solid rgba(224,74,74,0.2)", color: "rgba(255,255,255,0.7)" }}>
      <span><Lock className="inline h-3 w-3 mr-1" /> IRIS is thinking — {message}</span>
      <button onClick={onRetry} className="underline text-[11px]" style={{ color: GOLD }}>Try again</button>
    </div>
  );
}
function timeAgo(iso: string): string {
  const s = (Date.now() - +new Date(iso)) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
