/**
 * Model routing service — server-only.
 *
 * Routes IRIS tasks to the right Lovable AI Gateway model based on
 * complexity vs cost. All IRIS code paths should go through callAI() so
 * we can swap or A/B models in one place.
 */

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

export type IRISTask =
  | "brief_decode"
  | "brief_win_angle"
  | "brief_evidence"
  | "brief_risk"
  | "score_me"
  | "evaluator_simulation"
  | "ghost_text"
  | "score_predictor"
  | "iris_whisper"
  | "signal_classification"
  | "conflict_detection"
  | "lesson_extraction"
  | "chat_response";

export interface ModelConfig {
  model: string;
  maxTokens: number;
  temperature: number;
}

// High-reasoning: google/gemini-2.5-pro (replaces claude-sonnet placeholder)
// Fast/cheap: google/gemini-2.5-flash-lite (replaces gpt-4o-mini placeholder)
// Balanced: google/gemini-2.5-flash
const HIGH = "google/gemini-2.5-pro";
const FAST = "google/gemini-2.5-flash-lite";
const BALANCED = "google/gemini-2.5-flash";

const MODEL_ROUTING: Record<IRISTask, ModelConfig> = {
  brief_decode: { model: HIGH, maxTokens: 800, temperature: 0.4 },
  brief_win_angle: { model: HIGH, maxTokens: 600, temperature: 0.4 },
  brief_evidence: { model: HIGH, maxTokens: 600, temperature: 0.3 },
  brief_risk: { model: HIGH, maxTokens: 500, temperature: 0.3 },
  score_me: { model: HIGH, maxTokens: 1000, temperature: 0.5 },
  evaluator_simulation: { model: HIGH, maxTokens: 1200, temperature: 0.6 },
  conflict_detection: { model: BALANCED, maxTokens: 400, temperature: 0.2 },
  lesson_extraction: { model: HIGH, maxTokens: 1500, temperature: 0.4 },
  chat_response: { model: BALANCED, maxTokens: 800, temperature: 0.5 },
  ghost_text: { model: FAST, maxTokens: 60, temperature: 0.7 },
  score_predictor: { model: FAST, maxTokens: 500, temperature: 0.3 },
  iris_whisper: { model: FAST, maxTokens: 80, temperature: 0.5 },
  signal_classification: { model: FAST, maxTokens: 300, temperature: 0.2 },
};

export function getModelConfig(task: IRISTask): ModelConfig {
  return MODEL_ROUTING[task] ?? { model: FAST, maxTokens: 500, temperature: 0.5 };
}

export interface CallAIOptions extends Partial<ModelConfig> {
  responseJson?: boolean;
}

export async function callAI(
  task: IRISTask,
  systemPrompt: string,
  userPrompt: string,
  options?: CallAIOptions,
): Promise<string> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY missing — AI gateway unavailable");

  const config = { ...getModelConfig(task), ...options };

  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "raw-fetch",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: config.maxTokens,
      temperature: config.temperature,
      ...(options?.responseJson ? { response_format: { type: "json_object" } } : {}),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (res.status === 429) throw new Error("AI gateway rate limited (429)");
  if (res.status === 402) throw new Error("AI gateway credits exhausted (402)");
  if (!res.ok) {
    // Fallback to FAST tier if a heavier model failed for transient reasons
    if (config.model !== FAST) {
      console.warn(`[model-router] ${config.model} failed (${res.status}); falling back to ${FAST}`);
      return callAI(task, systemPrompt, userPrompt, { ...options, model: FAST });
    }
    const body = await res.text().catch(() => "");
    throw new Error(`AI gateway error ${res.status}: ${body.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return (json.choices?.[0]?.message?.content ?? "").trim();
}
