// Connectivity test for AI providers.
// Curl: GET /api/public/hooks/ai-connectivity-test
// Returns { lovable, anthropic, openai, perplexity } each "ok" or an error string.

import { createFileRoute } from "@tanstack/react-router";
import { askClaude } from "@/lib/ai/anthropic";
import { runAIText } from "@/lib/ai/router";
import { embedText } from "@/lib/intelligence/embed";
import { searchWeb } from "@/lib/ai/perplexity";

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

async function testPerplexity(): Promise<{
  status: string;
  citations: number;
  text_preview: string;
  citations_sample: string[];
}> {
  try {
    if (!process.env.PERPLEXITY_API_KEY) {
      return { status: "PERPLEXITY_API_KEY not configured", citations: 0, text_preview: "", citations_sample: [] };
    }
    const r = await searchWeb("Latest CMS Medicaid managed care news");
    const ok = r.text && r.text !== "Live search temporarily unavailable." && r.citations.length > 0;
    return {
      status: ok ? "ok" : "fail",
      citations: r.citations.length,
      text_preview: r.text.slice(0, 400),
      citations_sample: r.citations.slice(0, 5),
    };
  } catch (e) {
    return {
      status: e instanceof Error ? e.message : "unknown error",
      citations: 0,
      text_preview: "",
      citations_sample: [],
    };
  }
}

export const Route = createFileRoute("/api/public/hooks/ai-connectivity-test")({
  server: {
    handlers: {
      GET: async () => {
        const [lovable, anthropic, openai, perplexity] = await Promise.all([
          testLovable(),
          testAnthropic(),
          testOpenAI(),
          testPerplexity(),
        ]);
        const summary = { lovable, anthropic, openai, perplexity };
        console.log("AI connectivity test:", JSON.stringify(summary));
        return Response.json(summary);
      },
    },
  },
});
