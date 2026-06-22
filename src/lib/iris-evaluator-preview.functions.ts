/**
 * Evaluator Preview — a stricter, evaluator-persona simulation of a draft.
 * Distinct from scoreMeCoach (which is IRIS coaching). Uses the mission's
 * configured evaluator persona/lens/priorities from mission_iris_config.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({
  missionId: z.string().uuid(),
  questionId: z.string().uuid(),
  draftText: z.string().min(20).max(40000),
});

export type EvaluatorPreviewResult = {
  score: number; // 1-10
  what_works: string[];
  what_concerns: string[];
  fix: string;
  evaluator_signal: string; // one-line "how this would read to the evaluator"
  evaluator_name: string;
};

const clipArr = (v: unknown, n: number, max: number): string[] =>
  Array.isArray(v)
    ? v.filter((x) => typeof x === "string" && x.trim().length > 0).slice(0, max).map((s: string) => s.slice(0, n))
    : [];

export const irisEvaluatorPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data, context }): Promise<EvaluatorPreviewResult> => {
    const { supabase } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

    const [{ data: q }, { data: cfg }, { data: ws }, { data: mission }] = await Promise.all([
      supabase.from("mission_questions").select("question_number, question_text").eq("id", data.questionId).maybeSingle(),
      supabase.from("mission_iris_config").select("evaluator_name, evaluator_persona_name, evaluator_lens, evaluator_priorities, win_theme_keywords").eq("mission_id", data.missionId).maybeSingle(),
      supabase.from("mission_win_strategy").select("central_claim, win_themes, discriminators").eq("mission_id", data.missionId).maybeSingle(),
      supabase.from("missions").select("name, client_name, state, agency_name, program_type").eq("id", data.missionId).maybeSingle(),
    ]);

    const evaluatorName =
      (cfg as any)?.evaluator_name ||
      (cfg as any)?.evaluator_persona_name ||
      "the evaluation committee";
    const lens = (cfg as any)?.evaluator_lens ?? "";
    const priorities = Array.isArray((cfg as any)?.evaluator_priorities)
      ? ((cfg as any).evaluator_priorities as string[])
      : [];
    const winKw = Array.isArray((cfg as any)?.win_theme_keywords)
      ? ((cfg as any).win_theme_keywords as string[])
      : [];
    const themes = Array.isArray((ws as any)?.win_themes)
      ? ((ws as any).win_themes as unknown[]).map((t) =>
          typeof t === "string" ? t : (t as any)?.title ?? (t as any)?.theme ?? "",
        ).filter(Boolean)
      : [];

    const system = `You are simulating ${evaluatorName} — a state Medicaid procurement evaluator reading a draft response under time pressure. You are NOT coaching the writer. You are scoring as the evaluator would, with the evaluator's priorities and biases.

Mission: ${(mission as any)?.name ?? "?"} | Client: ${(mission as any)?.client_name ?? "?"} | State: ${(mission as any)?.state ?? "?"} | Agency: ${(mission as any)?.agency_name ?? "?"} | Program: ${(mission as any)?.program_type ?? "?"}
Evaluator lens: ${lens || "(not specified)"}
Evaluator priorities: ${priorities.join(", ") || "(not specified)"}
Mission central claim: ${(ws as any)?.central_claim ?? "?"}
Win themes: ${themes.join(" | ") || "(none)"}
Win theme keywords: ${winKw.join(", ") || "(none)"}
Discriminators: ${(ws as any)?.discriminators ?? "?"}

Score on the evaluator's actual scoring lens, not on writing quality. Be specific. Be brief. Do not pad. ATLAS is not a writing tool — never suggest the writer "revise here" or "edit in this panel".`;

    const userMsg = [
      `Question ${(q as any)?.question_number ?? ""}: ${(q as any)?.question_text ?? ""}`,
      "",
      `Draft:\n${data.draftText}`,
      "",
      'Return JSON ONLY: { "score": number 1-10, "what_works": array max 3 short strings, "what_concerns": array max 3 short strings, "fix": string max 200 chars (single most evaluator-defensive fix), "evaluator_signal": string max 160 chars (one-line "how this reads to the evaluator") }',
    ].join("\n");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        max_tokens: 900,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userMsg },
        ],
      }),
    });
    if (res.status === 429) throw new Error("IRIS is rate limited.");
    if (res.status === 402) throw new Error("AI credits exhausted.");
    if (!res.ok) throw new Error(`Evaluator preview failed (${res.status}).`);

    const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = j.choices?.[0]?.message?.content ?? "";
    const m = content.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("Evaluator returned an unreadable response.");
    let raw: any;
    try { raw = JSON.parse(m[0]); } catch { throw new Error("Evaluator returned malformed JSON."); }

    const rawScore = Number(raw.score);
    const score = Number.isFinite(rawScore)
      ? Math.max(1, Math.min(10, Math.round(rawScore * 10) / 10))
      : 5;

    return {
      score,
      what_works: clipArr(raw.what_works, 140, 3),
      what_concerns: clipArr(raw.what_concerns, 160, 3),
      fix: String(raw.fix ?? "").slice(0, 240) || "Tighten the central claim and add a measurable.",
      evaluator_signal: String(raw.evaluator_signal ?? "").slice(0, 200) || "Adequate, not memorable.",
      evaluator_name: evaluatorName,
    };
  });
