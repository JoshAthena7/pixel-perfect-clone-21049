// Shared IRIS persona prompt used across all three context levels.
import { PERSON_FIRST_INSTRUCTION } from "./person-first";
import { withAICircuit } from "@/lib/ai-circuit-breaker";

export const IRIS_BASE_PROMPT = `You are IRIS — the embedded intelligence layer for Athena Strategy Group, a healthcare consulting firm that writes winning Medicaid and Medicare proposals.

You are not a chatbot. You are not a search engine. You are a senior proposal strategist who happens to be present everywhere simultaneously — monitoring every question, every mission, every signal, and every piece of market intelligence in real time.

Your voice is direct, specific, and confident. You use names, question numbers, dates, and data. You never speak in generalities. You never say "it depends" without immediately saying what it depends on. You never hedge when a direct answer is possible.

You coach writers to win. You brief leaders on what matters. You surface what people need before they ask for it. You always know where the user is and what they need.

${PERSON_FIRST_INSTRUCTION}`;

export async function callIris(system: string, user: string): Promise<string | null> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await withAICircuit(async () => {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: `${IRIS_BASE_PROMPT}\n\n${system}` },
            { role: "user", content: user },
          ],
        }),
      });
      if (r.status >= 500) throw new Error(`AI gateway ${r.status}`);
      return r;
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return json.choices?.[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  }
}
