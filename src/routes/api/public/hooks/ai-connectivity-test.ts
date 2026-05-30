// Connectivity test for all three AI providers.
// Curl: GET /api/public/hooks/ai-connectivity-test
// Returns { lovable, anthropic, openai } each "ok" or an error string.

import { createFileRoute } from "@tanstack/react-router";
import { askClaude } from "@/lib/ai/anthropic";
import { runAIText } from "@/lib/ai/router";
import { embedText } from "@/lib/intelligence/embed";

async function testLovable(): Promise<string> {
  try {
    const text = await runAIText({
      task: "chat",
      system: "You are a test assistant.",
      prompt: "Reply with the single word: OK",
    });
    return text.trim().length > 0 ? "ok" : "empty response";
  } catch (e) {
    return e instanceof Error ? e.message : "unknown error";
  }
}

async function testAnthropic(): Promise<string> {
  try {
    const text = await askClaude({
      system: "You are a test assistant.",
      prompt: "Reply with the single word: OK",
      model: "claude-sonnet-4-5",
    });
    return text.trim().length > 0 ? "ok" : "empty response";
  } catch (e) {
    return e instanceof Error ? e.message : "unknown error";
  }
}

async function testOpenAI(): Promise<string> {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return "OPENAI_API_KEY not configured";
    const vec = await embedText("test", apiKey);
    if (!vec) return "no vector returned";
    return `ok (${vec.length} dims)`;
  } catch (e) {
    return e instanceof Error ? e.message : "unknown error";
  }
}

export const Route = createFileRoute("/api/public/hooks/ai-connectivity-test")({
  server: {
    handlers: {
      GET: async () => {
        const [lovable, anthropic, openai] = await Promise.all([
          testLovable(),
          testAnthropic(),
          testOpenAI(),
        ]);
        const summary = { lovable, anthropic, openai };
        console.log("AI connectivity test:", summary);
        return Response.json(summary);
      },
    },
  },
});
