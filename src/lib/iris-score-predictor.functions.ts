/**
 * IRIS Score Predictor — pre-writing scoring checklist (5 items) for a question.
 * Generated on-demand from the AI gateway. Lightweight; no ORACLE pre-fetch.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({
  missionId: z.string().uuid(),
  questionId: z.string().uuid(),
});

export type ScorePredictorItem = {
  text: string;
  category: "compliance" | "evidence" | "specificity" | "positioning" | "structure";
  critical: boolean;
};

export type ScorePredictor = {
  items: ScorePredictorItem[];
  score_floor_note: string;
};

export const generateScorePredictor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data, context }): Promise<ScorePredictor> => {
    const { supabase } = context;

    const [qRes, mRes, lensRes, themesRes] = await Promise.all([
      supabase
        .from("mission_questions")
        .select("question_number, question_text, evaluation_criteria, iris_brief")
        .eq("id", data.questionId)
        .maybeSingle(),
      supabase
        .from("missions")
        .select("name")
        .eq("id", data.missionId)
        .maybeSingle(),
      supabase
        .from("mission_evaluation_criteria")
        .select("criterion, weight")
        .eq("mission_id", data.missionId)
        .order("weight", { ascending: false })
        .limit(2),
      supabase
        .from("mission_win_themes")
        .select("title")
        .eq("mission_id", data.missionId)
        .limit(2),
    ]);

    const q: any = (qRes as any)?.data ?? {};
    const m: any = (mRes as any)?.data ?? {};
    const lens: any[] = (lensRes as any)?.data ?? [];
    const themes: any[] = (themesRes as any)?.data ?? [];

    const briefDecode = q?.iris_brief?.decoded_intent ?? "";
    const complianceItems = Array.isArray(q?.iris_brief?.compliance_checklist)
      ? q.iris_brief.compliance_checklist.map((c: any) => c?.item).filter(Boolean).slice(0, 3).join("; ")
      : "none available";

    const system = `You are IRIS, the intelligence guide for Athena Strategy Group. Generate a pre-writing scoring checklist for a Medicaid managed care RFP question. You are telling a writer exactly what elements must be present in their answer to score a 4 or 5 from a state evaluator. Be specific to this question, this state, and this procurement. Do not be generic. Return JSON only.`;

    const user = [
      `MISSION: ${m?.name ?? "(unspecified)"}`,
      `STATE: New Jersey`,
      `QUESTION ${q?.question_number ?? "?"}: ${q?.question_text ?? ""}`,
      `QUESTION TEXT: ${q?.question_text ?? ""}`,
      `EVALUATOR LENS: ${lens.map((l) => l.criterion).join(" | ") || "balanced operational/compliance review"}`,
      `WIN THEMES: ${themes.map((t) => t.title).join(" | ") || "none stated"}`,
      `COMPLIANCE CONTEXT: ${complianceItems}`,
      briefDecode ? `DECODED INTENT: ${briefDecode}` : "",
      ``,
      `Generate exactly 5 checklist items. Each item is one specific thing the answer must contain to score 4-5. Items should be ordered by importance (most critical first). Be actionable — tell the writer what to include, not what to avoid.`,
      ``,
      `Return JSON:`,
      `{ "items": [ { "text": "...", "category": "compliance|evidence|specificity|positioning|structure", "critical": true } ], "score_floor_note": "one sentence" }`,
    ]
      .filter(Boolean)
      .join("\n");

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Score Predictor offline (LOVABLE_API_KEY missing).");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Lovable-API-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        response_format: { type: "json_object" },
        max_tokens: 1200,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });

    if (res.status === 429) throw new Error("IRIS is rate limited.");
    if (res.status === 402) throw new Error("AI credits exhausted.");
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Score Predictor failed (${res.status}): ${body.slice(0, 200)}`);
    }

    const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = (j.choices?.[0]?.message?.content ?? "").trim();
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");

    let parsed: ScorePredictor;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error("Score Predictor returned invalid JSON.");
    }

    const items = Array.isArray(parsed?.items) ? parsed.items.slice(0, 5) : [];
    while (items.length < 5) {
      items.push({
        text: "Add concrete operational detail specific to this state and program.",
        category: "specificity",
        critical: false,
      });
    }

    return {
      items: items.map((i) => ({
        text: String(i?.text ?? "").trim() || "Specific evaluator-facing requirement.",
        category: (["compliance", "evidence", "specificity", "positioning", "structure"].includes(
          (i as any)?.category,
        )
          ? (i as any).category
          : "specificity") as ScorePredictorItem["category"],
        critical: Boolean(i?.critical),
      })),
      score_floor_note:
        String(parsed?.score_floor_note ?? "").trim() ||
        "Missing operational specifics or unsupported claims typically drop this from a 4 to a 2-3.",
    };
  });
