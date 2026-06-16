import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({
  missionId: z.string().uuid(),
  competitorName: z.string().min(1).max(200),
});

/**
 * One-shot AI summary for a single competitor in the context of a mission.
 * Called once per competitor per session by WriterIntelView.
 */
export const summarizeCompetitor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => Input.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: mission } = await supabase
      .from("missions")
      .select("name, program_type, agency_name, client_name")
      .eq("id", data.missionId)
      .maybeSingle();

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { ok: false as const, summary: "Intel unavailable — gateway not configured." };
    }

    const prompt = `Mission: ${mission?.name ?? "Unknown"}. Competitor: ${data.competitorName}. Program type: ${mission?.program_type ?? "n/a"}. Client: ${mission?.client_name ?? mission?.agency_name ?? "n/a"}.\n\nIn 1–2 sentences, what is ${data.competitorName}'s likely position and most exploitable vulnerability in this pursuit? Be specific, no generic statements, no fluff. Output plain text only.`;

    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.3,
        }),
        signal: AbortSignal.timeout(20_000),
      });
      if (res.status === 429) {
        return { ok: false as const, summary: "Intel rate-limited — try again shortly." };
      }
      if (res.status === 402) {
        return { ok: false as const, summary: "Intel paused — AI credits exhausted." };
      }
      if (!res.ok) {
        return { ok: false as const, summary: "Intel loading…" };
      }
      const json = await res.json();
      const text: string = json?.choices?.[0]?.message?.content?.trim() ?? "";
      return { ok: true as const, summary: text || "Intel unavailable." };
    } catch {
      return { ok: false as const, summary: "Intel loading…" };
    }
  });
