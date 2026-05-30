import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RfpIntakeSchema = z.object({
  fileName: z.string().min(1).max(240),
  text: z.string().min(1).max(60000),
});

function parseJsonObject(raw: string) {
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return {};
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return {};
  }
}

export const extractRfpIntakeDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => RfpIntakeSchema.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI is not configured.");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `Extract proposal engagement setup fields from an RFP. Return only JSON with keys: name, client, stateCode, market, submissionDate, engagementType, contractValue, evalCriteria, differentiators, localRequirements, stateNotes. Use ISO date yyyy-mm-dd. stateCode must be US postal abbreviation. engagementType is one of RFP, Sole Source, Recompete, Task Order. Arrays must be short strings. Empty/unknown fields should be omitted.`,
          },
          { role: "user", content: `File name: ${data.fileName}\n\nRFP text:\n${data.text.slice(0, 55000)}` },
        ],
      }),
    });

    if (!res.ok) throw new Error(`AI extraction failed: ${res.status}`);
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return parseJsonObject(json.choices?.[0]?.message?.content ?? "");
  });