// Central AI router. Picks the right provider/model per task.
//
//   chat       → Lovable AI Gateway (Gemini 3 Flash) — fast conversational
//   summarize  → Lovable AI Gateway (Gemini 3 Flash) — short classifications
//   extract    → Anthropic Claude Sonnet — structured extraction from docs
//   analyze    → Anthropic Claude Sonnet (Opus for `deep:true`) — reasoning
//   embed      → OpenAI text-embedding-3-large (1536 dims) — RAG vectors
//
// All callers should go through runAI() rather than calling the providers
// directly. Server-only.

import { askClaude, type ClaudeModel } from "./anthropic";
import { embedText } from "@/lib/intelligence/embed";

export type AITask = "chat" | "extract" | "analyze" | "embed" | "summarize";

type ChatMsg = { role: "system" | "user" | "assistant"; content: string };

export type RunAIInput =
  | {
      task: "chat" | "summarize";
      system: string;
      prompt?: string;
      /** Optional full message thread (overrides `prompt` when provided). */
      messages?: ChatMsg[];
      /** Force JSON output via response_format. */
      json?: boolean;
      /** Override default model. */
      model?: string;
    }
  | {
      task: "extract" | "analyze";
      system: string;
      prompt: string;
      json?: boolean;
      /** Use Opus for high-reasoning workloads (compliance, deep pattern). */
      deep?: boolean;
      model?: ClaudeModel;
    }
  | {
      task: "embed";
      input: string;
    };

export type RunAIResult =
  | { kind: "text"; text: string }
  | { kind: "embedding"; vector: number[] | null };

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const DEFAULT_CHAT_MODEL = "google/gemini-2.5-flash";

async function callGateway(opts: {
  model: string;
  system: string;
  messages?: ChatMsg[];
  prompt?: string;
  json?: boolean;
}): Promise<string> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

  const msgs: ChatMsg[] =
    opts.messages && opts.messages.length > 0
      ? [{ role: "system", content: opts.system }, ...opts.messages]
      : [
          { role: "system", content: opts.system },
          { role: "user", content: opts.prompt ?? "" },
        ];

  const body: Record<string, unknown> = { model: opts.model, messages: msgs };
  if (opts.json) body.response_format = { type: "json_object" };

  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    if (res.status === 429) throw new Error("AI rate limit reached. Try again shortly.");
    if (res.status === 402) throw new Error("AI credits exhausted. Add funds in Settings.");
    throw new Error(`AI gateway ${res.status}: ${txt.slice(0, 240)}`);
  }
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return json.choices?.[0]?.message?.content ?? "";
}

export async function runAI(input: RunAIInput): Promise<RunAIResult> {
  if (input.task === "embed") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY not configured");
    const vector = await embedText(input.input, apiKey);
    return { kind: "embedding", vector };
  }

  if (input.task === "chat" || input.task === "summarize") {
    const text = await callGateway({
      model: input.model ?? DEFAULT_CHAT_MODEL,
      system: input.system,
      prompt: input.prompt,
      messages: input.messages,
      json: input.json,
    });
    return { kind: "text", text };
  }

  // extract | analyze → Claude
  if (input.task !== "extract" && input.task !== "analyze") {
    throw new Error(`Unsupported AI task: ${(input as { task: string }).task}`);
  }
  const deep = input.deep ?? false;
  const model: ClaudeModel =
    input.model ?? (deep ? "claude-opus-4-5" : "claude-sonnet-4-5");
  const text = await askClaude({
    system: input.system,
    prompt: input.prompt,
    model,
    json: input.json,
  });
  return { kind: "text", text };
}

/** Convenience: run a task and return raw text (throws for embed). */
export async function runAIText(input: Exclude<RunAIInput, { task: "embed" }>): Promise<string> {
  const r = await runAI(input);
  if (r.kind !== "text") throw new Error("runAIText called with embed task");
  return r.text;
}
