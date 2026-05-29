import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const TONE = z.enum(["tlc", "recognition"]);

export const draftPulseMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      engagementId: z.string().uuid(),
      memberName: z.string().min(1).max(120),
      tone: TONE,
      note: z.string().min(1).max(2000),
      followUp: z.string().min(1).max(120),
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // Confirm requester is a leadership member of the engagement
    const { data: engMember } = await supabase
      .from("engagement_members")
      .select("role")
      .eq("engagement_id", data.engagementId)
      .eq("user_id", context.userId)
      .maybeSingle();

    const role = (engMember as { role?: string } | null)?.role ?? "";
    if (!["founder", "pm", "engagement_lead"].includes(role)) {
      throw new Error("Only engagement leadership can draft pulse messages.");
    }

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const system =
      data.tone === "tlc"
        ? "You write warm, sincere check-in messages from a project lead to a teammate who may be struggling. Tone: caring, low-pressure, specific. 3-5 sentences. No emojis. No corporate filler. Address them by first name. Offer one concrete next step (e.g., a 15-min chat, a gift card, time off). Return only the message body."
        : "You write genuine, specific recognition messages from a project lead to a teammate who did good work. Tone: warm, specific, no flattery. 3-5 sentences. No emojis. Address them by first name. Reference what they did. Return only the message body.";

    const user = `Teammate: ${data.memberName}
Follow-up choice: ${data.followUp}
Lead's note about what happened:
${data.note}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });

    if (res.status === 429) throw new Error("Rate limited — try again in a moment.");
    if (res.status === 402) throw new Error("AI credits exhausted — add funds in Settings.");
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`AI gateway error: ${res.status} ${txt.slice(0, 200)}`);
    }

    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const message = json?.choices?.[0]?.message?.content?.trim() ?? "";
    return { message };
  });
