/**
 * IRIS Tactical Suggestion — a single 20-word writing tip shown as ghost
 * text below the Decode panel. Independent of the main brief; failures are
 * silent on the client side.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SYSTEM = `You are IRIS. Give one tactical writing suggestion in 20 words or fewer. Be specific. No preamble. No "consider" or "you might want to." Start with a verb. Example: "Open with the specific DCP&P referral protocol before stating the general coordination approach."`;

export const generateTacticalSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      questionNumber: z.string().nullable().optional(),
      questionTitle: z.string().nullable().optional(),
      decodeExcerpt: z.string().nullable().optional(),
      missionName: z.string().nullable().optional(),
      winTheme: z.string().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { text: "" };

    const user =
      `Question: ${data.questionNumber ?? "—"} — ${data.questionTitle ?? ""}\n` +
      `IRIS Decode: ${(data.decodeExcerpt ?? "").slice(0, 200)}\n` +
      `Mission: ${data.missionName ?? ""}\n` +
      `Win theme: ${data.winTheme ?? ""}\n\n` +
      `One tactical writing suggestion, 20 words maximum.`;

    // 5-second hard timeout — never block the UI.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    try {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        signal: ctrl.signal,
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: user },
          ],
        }),
      });
      if (!r.ok) return { text: "" };
      const j = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const text = (j.choices?.[0]?.message?.content ?? "").trim();
      // Hard cap to 20 words on the server too.
      const words = text.split(/\s+/).slice(0, 20).join(" ");
      return { text: words };
    } catch {
      return { text: "" };
    } finally {
      clearTimeout(timer);
    }
  });
