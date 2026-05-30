import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Schema = z.object({
  engagementId: z.string().uuid(),
  documentId: z.string().uuid().optional(),
  fileName: z.string().min(1).max(240),
  text: z.string().min(20).max(80000),
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

const SYSTEM = `You are an expert proposal strategist analyzing a healthcare/Medicaid RFP.
Extract the "Holy Grail" intel writers need. Return ONLY JSON with these keys:
{
  "summary": string,                       // 2-3 sentence executive summary of the opportunity
  "client": string,                        // issuing agency / client name
  "scope": string,                         // scope of work summary
  "key_dates": [{"label": string, "date": string}],
  "evaluation_criteria": [{"criterion": string, "weight": string, "notes": string}],
  "must_have_requirements": [string],      // mandatory pass/fail items
  "scored_requirements": [string],         // items that earn points
  "page_limits": string,                   // page count / format constraints
  "submission_format": string,             // how to submit (portal, email, hard copy)
  "incumbent_signals": [string],           // hints about incumbent or current state
  "win_factors": [string],                 // what it will take to win
  "risks": [string],                       // red flags or risks
  "open_questions": [string]               // questions to send to client / clarify
}
Omit a key entirely if no information is available. Be specific, quote requirement numbers/sections when possible.`;

export const analyzeHolyGrail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => Schema.parse(input))
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI is not configured.");

    // Authorization: leadership only
    const { supabase, userId } = context;
    const { data: member } = await supabase
      .from("engagement_members")
      .select("role")
      .eq("engagement_id", data.engagementId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!member || !["founder", "pm", "engagement_lead"].includes(member.role)) {
      throw new Error("Only leadership can run Holy Grail analysis.");
    }

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `File: ${data.fileName}\n\nRFP TEXT:\n${data.text.slice(0, 75000)}` },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`AI analysis failed (${res.status}): ${body.slice(0, 200)}`);
    }
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const parsed = parseJsonObject(json.choices?.[0]?.message?.content ?? "");

    // Upsert as the latest holy_grail row (delete prior, insert new)
    await supabase
      .from("engagement_research")
      .delete()
      .eq("engagement_id", data.engagementId)
      .eq("category", "holy_grail");

    const { data: inserted, error } = await supabase
      .from("engagement_research")
      .insert({
        engagement_id: data.engagementId,
        category: "holy_grail",
        title: data.fileName,
        source: data.documentId ? `intel_documents:${data.documentId}` : "manual",
        content: parsed,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    return inserted;
  });
