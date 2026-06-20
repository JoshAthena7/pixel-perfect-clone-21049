/**
 * IRIS task -> Lovable AI Gateway model router.
 *
 * Server-only. Every AI call site should resolve its model through getModelConfig
 * so model choice stays consistent across the platform.
 *
 * Substitution from the original spec (Claude isn't in the Lovable AI Gateway):
 *   - Complex reasoning tasks  -> openai/gpt-5-mini
 *   - Default / fast tasks     -> google/gemini-3-flash-preview
 *   - High-volume / cheap      -> openai/gpt-5-nano
 */
export type IRISTask =
  | "brief_decode"
  | "brief_win_angle"
  | "brief_evidence"
  | "brief_risk"
  | "brief_combined"
  | "score_me"
  | "evaluator_simulation"
  | "conflict_detection"
  | "lesson_extraction"
  | "chat_response"
  | "ghost_text"
  | "score_predictor"
  | "iris_whisper"
  | "signal_classification";

export interface ModelConfig {
  model: string;
  maxTokens: number;
  temperature: number;
}

const COMPLEX = "openai/gpt-5-mini";
const DEFAULT = "google/gemini-3-flash-preview";
const FAST = "openai/gpt-5-nano";

const ROUTING: Record<IRISTask, ModelConfig> = {
  // Complex strategic reasoning
  brief_decode: { model: COMPLEX, maxTokens: 1200, temperature: 0.4 },
  brief_win_angle: { model: COMPLEX, maxTokens: 900, temperature: 0.4 },
  brief_evidence: { model: COMPLEX, maxTokens: 900, temperature: 0.3 },
  brief_risk: { model: COMPLEX, maxTokens: 700, temperature: 0.3 },
  brief_combined: { model: COMPLEX, maxTokens: 16000, temperature: 0.4 },
  score_me: { model: COMPLEX, maxTokens: 1500, temperature: 0.5 },
  evaluator_simulation: { model: COMPLEX, maxTokens: 1500, temperature: 0.6 },
  conflict_detection: { model: COMPLEX, maxTokens: 600, temperature: 0.2 },
  lesson_extraction: { model: COMPLEX, maxTokens: 1500, temperature: 0.4 },
  chat_response: { model: COMPLEX, maxTokens: 1000, temperature: 0.5 },
  // Default-tier
  signal_classification: { model: DEFAULT, maxTokens: 400, temperature: 0.2 },
  score_predictor: { model: DEFAULT, maxTokens: 600, temperature: 0.3 },
  // Fast/cheap
  ghost_text: { model: FAST, maxTokens: 80, temperature: 0.7 },
  iris_whisper: { model: FAST, maxTokens: 100, temperature: 0.5 },
};

export function getModelConfig(task: IRISTask, overrides?: Partial<ModelConfig>): ModelConfig {
  return { ...(ROUTING[task] ?? { model: DEFAULT, maxTokens: 600, temperature: 0.5 }), ...overrides };
}

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

/**
 * Server-only AI call helper. Falls back to gemini-3-flash-preview if the
 * primary model fails with a non-rate-limit error.
 */
export async function callAI(
  task: IRISTask,
  systemPrompt: string,
  userPrompt: string,
  overrides?: Partial<ModelConfig> & { json?: boolean },
): Promise<{ content: string; model: string }> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

  const config = getModelConfig(task, overrides);
  const body: Record<string, unknown> = {
    model: config.model,
    max_tokens: config.maxTokens,
    temperature: config.temperature,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  };
  if (overrides?.json) body.response_format = { type: "json_object" };

  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Lovable-API-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (res.status === 429) throw new Error("AI rate limited");
  if (res.status === 402) throw new Error("AI credits exhausted");
  if (!res.ok) {
    // Fallback to default model if not already on it
    if (config.model !== DEFAULT) {
      console.warn(`[ai-router] ${config.model} failed (${res.status}); falling back to ${DEFAULT}`);
      return callAI(task, systemPrompt, userPrompt, { ...overrides, model: DEFAULT });
    }
    const text = await res.text().catch(() => "");
    throw new Error(`AI call failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return {
    content: (j.choices?.[0]?.message?.content ?? "").trim(),
    model: config.model,
  };
}
