import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().min(1).max(8000),
});

export const askAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      engagementId: z.string().uuid(),
      messages: z.array(MessageSchema).min(1).max(40),
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // Pull recent engagement context the user already has access to (RLS scoped)
    const [{ data: eng }, { data: huddles }, { data: heatmap }, { data: risks }, { data: decisions }, { data: pulses }] =
      await Promise.all([
        supabase.from("engagements").select("name, client, status, submission_date").eq("id", data.engagementId).maybeSingle(),
        supabase.from("huddles").select("health, priority, risk, client_concern, writer_concern, needs_leadership, notes, submitter_name, created_at").eq("engagement_id", data.engagementId).order("created_at", { ascending: false }).limit(10),
        supabase.from("heatmap_sections").select("section_name, status, owner_name, notes").eq("engagement_id", data.engagementId),
        supabase.from("risks").select("title, severity, status, owner_name, mitigation").eq("engagement_id", data.engagementId).limit(20),
        supabase.from("decisions").select("title, status, decision_date, rationale, owner_name").eq("engagement_id", data.engagementId).order("decision_date", { ascending: false }).limit(15),
        supabase.from("client_pulses").select("interaction_date, sentiment, summary, action_items").eq("engagement_id", data.engagementId).order("interaction_date", { ascending: false }).limit(10),
      ]);

    const systemContext = `You are Athena, the AI co-pilot for a proposal war room. Be concise, direct, and tactical. When asked for analysis, ground every claim in the data below. If data is missing, say so.

ENGAGEMENT: ${JSON.stringify(eng)}
HEAT MAP: ${JSON.stringify(heatmap)}
RECENT HUDDLES: ${JSON.stringify(huddles)}
RISKS: ${JSON.stringify(risks)}
DECISIONS: ${JSON.stringify(decisions)}
CLIENT PULSE: ${JSON.stringify(pulses)}`;

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: systemContext }, ...data.messages],
      }),
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`AI gateway error: ${res.status} ${txt.slice(0, 200)}`);
    }
    const json: any = await res.json();
    const reply = json?.choices?.[0]?.message?.content ?? "(no response)";
    return { reply };
  });
