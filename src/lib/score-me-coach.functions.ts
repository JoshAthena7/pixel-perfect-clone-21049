/**
 * Score Me — IRIS coaching wired to IRIS Memory context.
 * Coaching, not evaluator-score prediction.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ScoreInput = z.object({
  missionId: z.string().uuid(),
  questionId: z.string().uuid(),
  draftText: z.string().min(20).max(40000),
});

export type ScoreMeResult = {
  overall_score: number;
  iris_verdict: string;
  what_lands: string[];
  what_needs_work: string[];
  the_one_fix: string;
  opportunities: string[];
  compliance_flags: string[];
};

const clipArr = (v: unknown, n: number, max: number): string[] =>
  Array.isArray(v)
    ? v.filter((x) => typeof x === "string" && x.trim().length > 0).slice(0, max).map((s: string) => s.slice(0, n))
    : [];

export const scoreMeCoach = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ScoreInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 1) IRIS Memory context: question + section
    const { data: q } = await supabase
      .from("mission_questions")
      .select("question_number, question_text, section_id")
      .eq("id", data.questionId)
      .maybeSingle();
    const sectionId = (q as any)?.section_id ?? null;
    const questionNumber = (q as any)?.question_number ?? "";
    const questionTitle = (q as any)?.question_text ?? "";

    let sectionName = "";
    let sectionScoringWeight: number | null = null;
    if (sectionId) {
      const { data: sec } = await supabase
        .from("mission_sections")
        .select("*")
        .eq("id", sectionId)
        .maybeSingle();
      sectionName = (sec as any)?.name ?? (sec as any)?.title ?? "";
      sectionScoringWeight =
        (sec as any)?.scoring_weight ?? (sec as any)?.weight ?? null;
    }

    // 2) Parallel context fetch
    const [winRes, complianceRes, insightsRes, evalRes, missionRes, winThemesActiveRes] = await Promise.all([
      supabase
        .from("mission_win_strategy")
        .select("north_star_message, central_claim, win_themes, things_to_avoid, discriminators")
        .eq("mission_id", data.missionId)
        .maybeSingle(),
      sectionId
        ? supabase
            .from("mission_compliance_requirements")
            .select("requirement, is_high_risk, status")
            .eq("mission_id", data.missionId)
            .eq("section_id", sectionId)
        : Promise.resolve({ data: [] as any[] }),
      sectionId
        ? supabase
            .from("athena_insights")
            .select("strategic_quote, writers_note, quote")
            .eq("mission_id", data.missionId)
            .eq("section_id", sectionId)
            .order("created_at", { ascending: false })
            .limit(3)
        : Promise.resolve({ data: [] as any[] }),
      supabase
        .from("evaluator_pictures")
        .select("inferred_fears, inferred_defensibility_needs, one_sentence_bottom_line")
        .eq("mission_id", data.missionId)
        .maybeSingle(),
      supabase
        .from("missions")
        .select("writing_signals")
        .eq("id", data.missionId)
        .maybeSingle(),
      supabase
        .from("mission_win_themes")
        .select("title, why_it_matters, what_theyre_buying, proof_points")
        .eq("mission_id", data.missionId)
        .eq("status", "active"),
    ]);

    const win = (winRes as any)?.data ?? {};
    const complianceRows = ((complianceRes as any)?.data ?? []) as any[];
    const insights = ((insightsRes as any)?.data ?? []) as any[];
    const evalPic = (evalRes as any)?.data ?? {};
    const writingSignals = ((missionRes as any)?.data?.writing_signals ?? null) as
      | { care_about?: unknown; avoid?: unknown; repeat_often?: unknown }
      | null;
    const wsArr = (v: unknown): string[] =>
      Array.isArray(v) ? v.map((x) => (typeof x === "string" ? x : x?.text ?? "")).filter(Boolean) : [];
    const wsCare = wsArr(writingSignals?.care_about);
    const wsAvoid = wsArr(writingSignals?.avoid);
    const wsRepeat = wsArr(writingSignals?.repeat_often);
    if ((missionRes as any)?.error) {
      console.error("[score-me] writing_signals fetch failed", (missionRes as any).error);
    }
    const activeWinThemes = (((winThemesActiveRes as any)?.data ?? []) as any[])
      .map((t) => ({
        title: String(t?.title ?? "").trim(),
        what_theyre_buying: String(t?.what_theyre_buying ?? "").trim(),
      }))
      .filter((t) => t.title);
    if ((winThemesActiveRes as any)?.error) {
      console.error("[score-me] active win_themes fetch failed", (winThemesActiveRes as any).error);
    }



    const winThemes = Array.isArray(win.win_themes)
      ? win.win_themes
          .map((t: any) => (typeof t === "string" ? t : t?.title ?? t?.theme ?? ""))
          .filter(Boolean)
      : [];
    const complianceList = complianceRows
      .map((c: any) => c.requirement)
      .filter((s: any): s is string => typeof s === "string" && s.trim().length > 0);
    const irisGuidance = insights
      .map((i: any) => [i.strategic_quote, i.writers_note, i.quote].filter(Boolean).join(" — "))
      .filter(Boolean)
      .join(" | ");
    const fears = Array.isArray(evalPic.inferred_fears)
      ? evalPic.inferred_fears.map((f: any) => (typeof f === "string" ? f : f?.text ?? "")).filter(Boolean)
      : [];
    const defensibility = Array.isArray(evalPic.inferred_defensibility_needs)
      ? evalPic.inferred_defensibility_needs
          .map((f: any) => (typeof f === "string" ? f : f?.text ?? ""))
          .filter(Boolean)
      : [];

    // 3) AI gateway
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      throw new Error("IRIS coach is offline (LOVABLE_API_KEY missing).");
    }

    const system =
      "You are IRIS, the intelligence co-pilot for Athena Strategy Group. " +
      "You are coaching a proposal writer — not grading them and not predicting an evaluator score. " +
      "You are a rehearsal partner. Your analysis is grounded in the specific RFP context and evaluator intelligence provided. " +
      "Be direct, specific, and actionable. Focus on: what lands, what is missing, what the opportunities are, and the single most important thing to change. " +
      "Return only valid JSON.";

    const userMsg = [
      `Question: ${questionNumber ? `${questionNumber} — ` : ""}${questionTitle || "(unspecified)"}.`,
      `Section: ${sectionName || "(unspecified)"}${sectionScoringWeight ? ` (scoring weight ${sectionScoringWeight})` : ""}.`,
      "",
      "IRIS Memory context for this section:",
      `North Star: ${win.north_star_message || "(none)"}`,
      `Central Claim: ${win.central_claim || "(none)"}`,
      `Win Themes: ${winThemes.length ? winThemes.join("; ") : "(none)"}`,
      `Discriminators: ${win.discriminators || "(none)"}`,
      `Things to avoid: ${win.things_to_avoid || "(none)"}`,
      `Compliance requirements: ${complianceList.length ? complianceList.join(" | ") : "(none)"}`,
      `Strategic guidance from IRIS: ${irisGuidance || "(none)"}`,
      `How evaluators think — fears: ${fears.join("; ") || "(none)"}`,
      `How evaluators think — defensibility needs: ${defensibility.join("; ") || "(none)"}`,
      `Evaluator bottom line: ${evalPic.one_sentence_bottom_line || "(none)"}`,
      ...(wsCare.length || wsAvoid.length || wsRepeat.length
        ? [
            "",
            "Additionally evaluate whether this response follows the mission's Message Discipline:",
            `- Evaluators care about: ${wsCare.length ? wsCare.join("; ") : "(none)"}`,
            `- Avoid: ${wsAvoid.length ? wsAvoid.join("; ") : "(none)"}`,
            `- Repeat often: ${wsRepeat.length ? wsRepeat.join("; ") : "(none)"}`,
            "Score alignment with Message Discipline as a separate dimension in your feedback.",
          ]
        : []),
      ...(activeWinThemes.length
        ? [
            "",
            "Also evaluate whether this response demonstrates the mission's active win themes:",
            ...activeWinThemes.map(
              (t) => `- ${t.title}${t.what_theyre_buying ? ` — ${t.what_theyre_buying}` : ""}`,
            ),
            "For each win theme, assess: Does this response reinforce it, contradict it, or miss it entirely? Include a Win Theme Alignment section in your feedback.",
          ]
        : []),
      "",
      `Draft to coach:\n${data.draftText}`,
      "",
      'Return JSON: { "overall_score": number 1-10, "iris_verdict": string max 120 chars direct and slightly dry, "what_lands": array max 3 strings under 100 chars each, "what_needs_work": array max 3 strings under 100 chars each, "the_one_fix": string max 150 chars (the single most important change), "opportunities": array max 2 strings under 100 chars each, "compliance_flags": array of compliance requirements from the list above that are missing or inadequately addressed (verbatim phrases) }',
    ].join("\n");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        max_tokens: 1200,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userMsg },
        ],
      }),
    });
    if (res.status === 429) throw new Error("IRIS is rate limited. Try again in a moment.");
    if (res.status === 402) throw new Error("AI credits exhausted. Add credits in workspace settings.");
    if (!res.ok) throw new Error(`IRIS coach failed (${res.status}).`);

    const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = j.choices?.[0]?.message?.content ?? "";
    const m = content.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("IRIS returned an unreadable response.");

    let raw: any;
    try {
      raw = JSON.parse(m[0]);
    } catch {
      throw new Error("IRIS returned malformed JSON.");
    }

    const rawScore = Number(raw.overall_score);
    const overall_score = Number.isFinite(rawScore)
      ? Math.max(1, Math.min(10, Math.round(rawScore * 10) / 10))
      : 5;

    const result: ScoreMeResult = {
      overall_score,
      iris_verdict: String(raw.iris_verdict ?? "").slice(0, 200) || "Coaching complete.",
      what_lands: clipArr(raw.what_lands, 120, 3),
      what_needs_work: clipArr(raw.what_needs_work, 120, 3),
      the_one_fix: String(raw.the_one_fix ?? "").slice(0, 220) || "Sharpen the central claim.",
      opportunities: clipArr(raw.opportunities, 120, 2),
      compliance_flags: clipArr(raw.compliance_flags, 200, 8),
    };

    // 4) Oracle memory — score_me_history
    // Note: stores scoring metadata and analysis only (no raw draft text).
    // Do not store PHI or client confidential proposal text in this table.
    try {
      await supabase.from("score_me_history").insert({
        mission_id: data.missionId,
        question_id: data.questionId,
        scored_by: userId,
        score: result.overall_score,
        full_analysis: {
          ...result,
          context_meta: {
            section_id: sectionId,
            section_name: sectionName,
            compliance_count: complianceList.length,
            insight_count: insights.length,
          },
        },
      });
    } catch (e) {
      console.error("[score-me] history insert failed", e);
    }

    // Mission Radar event log (silent on failure — observability only)
    try {
      await supabase.from("mission_assist_events").insert({
        mission_id: data.missionId,
        question_id: data.questionId,
        user_id: userId,
        event_type: "score_me_run",
        metadata: {
          summary: `Score Me run — ${result.overall_score.toFixed(1)}/10`,
          score: result.overall_score,
          the_one_fix: result.the_one_fix,
          section_name: sectionName || null,
        },
      } as never);
    } catch (e) {
      console.warn("[score-me] assist event insert failed", e);
    }

    // 5) Fire-and-forget: persist full session row for analytics
    try {
      const to100 = (n: unknown): number | null => {
        const v = Number(n);
        if (!Number.isFinite(v)) return null;
        const scaled = v <= 10 ? Math.round(v * 10) : Math.round(v);
        return Math.max(0, Math.min(100, scaled));
      };
      void supabase
        .from("score_me_sessions")
        .insert({
          mission_id: data.missionId,
          section_name: sectionName || null,
          response_text: data.draftText,
          overall_score: to100(result.overall_score),
          message_discipline_score: to100(
            (raw as any)?.message_discipline_score ?? (raw as any)?.message_discipline?.score,
          ),
          win_theme_alignment_score: to100(
            (raw as any)?.win_theme_alignment_score ?? (raw as any)?.win_theme_alignment?.score,
          ),
          gaps: result.what_needs_work,
          strengths: result.what_lands,
          coaching_summary: result.iris_verdict,
          scored_by: userId,
        })
        .then(({ error }: { error: unknown }) => {
          if (error) console.error("[score-me] sessions insert failed", error);
        });
    } catch (e) {
      console.error("[score-me] sessions insert threw", e);
    }

    return { result, question: { number: questionNumber, title: questionTitle, section: sectionName } };
  });

const PostInput = z.object({
  missionId: z.string().uuid(),
  questionId: z.string().uuid(),
  questionNumber: z.string().nullable().optional(),
  overallScore: z.number(),
  theOneFix: z.string().min(1),
});

export const postScoreMeToThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => PostInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const body =
      `Score Me result for question ${data.questionNumber ?? ""}: ` +
      `${data.overallScore}/10. The one fix: ${data.theOneFix}`;
    const { error } = await supabase.from("thread_messages").insert({
      mission_id: data.missionId,
      question_id: data.questionId,
      sender_id: null,
      sender_name: "IRIS",
      message_type: "iris",
      message_body: body,
      metadata: { source: "score_me", score: data.overallScore },
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
