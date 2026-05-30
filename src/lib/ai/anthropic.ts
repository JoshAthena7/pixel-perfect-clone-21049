// Anthropic Claude helper. Server-only — must only be imported from
// *.functions.ts handlers or server routes.
//
// Defaults to claude-sonnet-4-5 (the GA successor to the temporarily
// previewed claude-sonnet-4-6 name). Override via the `model` arg.

export type ClaudeModel =
  | "claude-sonnet-4-5"
  | "claude-opus-4-5"
  | "claude-3-5-haiku-latest"
  | string;

export type AskClaudeInput = {
  system: string;
  prompt: string;
  model?: ClaudeModel;
  maxTokens?: number;
  /**
   * If true, instructs Claude to return JSON (best-effort — wraps the
   * system prompt). Caller still needs to JSON.parse the result.
   */
  json?: boolean;
};

export async function askClaude({
  system,
  prompt,
  model = "claude-sonnet-4-5",
  maxTokens = 8192,
  json = false,
}: AskClaudeInput): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");

  const sys = json
    ? `${system}\n\nReturn ONLY valid JSON. No prose, no markdown fences.`
    : system;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: sys,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    if (res.status === 429) throw new Error("Anthropic rate-limited. Try again shortly.");
    if (res.status === 401 || res.status === 403)
      throw new Error("Anthropic auth failed — check ANTHROPIC_API_KEY.");
    throw new Error(`Anthropic error ${res.status}: ${txt.slice(0, 240)}`);
  }

  const data = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const text = data.content?.find((c) => c.type === "text")?.text ?? "";
  return text;
}
