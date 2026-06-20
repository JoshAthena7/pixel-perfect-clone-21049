import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const SubmitInput = z.object({
  missionId: z.string().uuid(),
  questionText: z.string().min(1),
  answerGiven: z.string().min(1),
  correctAnswer: z.string().min(1),
  isCorrect: z.boolean(),
  secondsToAnswer: z.number().min(0),
});

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayUTC(): string {
  return new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
}

export const submitTriviaAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SubmitInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Compute streak: count consecutive correct days ending yesterday
    const since = new Date(Date.now() - 14 * 86400_000).toISOString().slice(0, 10);
    const { data: prior } = await supabase
      .from("mission_trivia_scores")
      .select("question_date, is_correct, streak_day")
      .eq("mission_id", data.missionId)
      .eq("user_id", userId)
      .gte("question_date", since)
      .order("question_date", { ascending: false });

    let priorStreak = 0;
    if (prior && prior.length > 0) {
      const map = new Map<string, { is_correct: boolean; streak_day: number }>();
      prior.forEach((r: any) => map.set(r.question_date, { is_correct: r.is_correct, streak_day: r.streak_day }));
      let cursor = new Date(Date.now() - 86400_000);
      while (true) {
        const key = cursor.toISOString().slice(0, 10);
        const row = map.get(key);
        if (!row || !row.is_correct) break;
        priorStreak += 1;
        cursor = new Date(cursor.getTime() - 86400_000);
      }
    }

    const newStreak = data.isCorrect ? priorStreak + 1 : 0;
    const speedBonus = data.isCorrect && data.secondsToAnswer <= 10;
    const basePoints = data.isCorrect ? (speedBonus ? 15 : 10) : 0;
    let streakBonusPoints = 0;
    if (data.isCorrect) {
      if (newStreak >= 7) streakBonusPoints = 20;
      else if (newStreak >= 3) streakBonusPoints = 12;
    }
    const totalPoints = Math.max(basePoints, streakBonusPoints);

    const { data: row, error } = await supabase
      .from("mission_trivia_scores")
      .insert({
        mission_id: data.missionId,
        user_id: userId,
        question_date: todayUTC(),
        question_text: data.questionText,
        answer_given: data.answerGiven,
        correct_answer: data.correctAnswer,
        is_correct: data.isCorrect,
        points_earned: totalPoints,
        streak_day: newStreak,
      })
      .select()
      .single();

    if (error) {
      // Likely unique violation = already answered today; return existing row
      const { data: existing } = await supabase
        .from("mission_trivia_scores")
        .select("*")
        .eq("mission_id", data.missionId)
        .eq("user_id", userId)
        .eq("question_date", todayUTC())
        .maybeSingle();
      if (existing) return { ...existing, alreadyAnswered: true } as any;
      throw error;
    }

    // Log to mission_assist_events for ATC Radar
    try {
      await supabase.from("mission_assist_events").insert({
        mission_id: data.missionId,
        user_id: userId,
        event_type: "trivia_answered",
        metadata: {
          correct: data.isCorrect,
          points: totalPoints,
          streak: newStreak,
          speed_bonus: speedBonus,
          question_date: todayUTC(),
        },
      });
    } catch (e) {
      console.warn("[trivia] failed to log mission_assist_events", e);
    }

    return { ...row, speedBonus, streakBonus: streakBonusPoints > 0 } as any;
  });

const LeaderboardInput = z.object({
  missionId: z.string().uuid(),
  window: z.enum(["all", "week", "today"]).default("all"),
});

export const fetchTriviaLeaderboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => LeaderboardInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("get_trivia_leaderboard", {
      p_mission_id: data.missionId,
      p_window: data.window,
    });
    if (error) throw error;
    return (rows ?? []) as Array<{
      user_id: string;
      display_name: string;
      email: string | null;
      total_points: number;
      correct_answers: number;
      total_answers: number;
      accuracy_pct: number | null;
      best_streak: number;
    }>;
  });
