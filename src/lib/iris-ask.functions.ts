import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const irisAskQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      questionId: z.string().uuid(),
      prompt: z.string().min(1).max(2000),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: q } = await supabase
      .from("question_records")
      .select("question_number,title,question_text,current_focus,next_step,waiting_on,guidance,mission_id")
      .eq("id", data.questionId)
      .maybeSingle();
    if (!q) throw new Error("Response not found");

    const { data: m } = await supabase
      .from("missions")
      .select("name,client,state,description,submission_date")
      .eq("id", q.mission_id)
      .maybeSingle();

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { answer: "_IRIS is not yet configured (missing LOVABLE_API_KEY)._" };
    }

    const sys = `You are IRIS, an intelligence analyst for Medicaid procurement consultants. Answer the writer's question about this specific response with sharp, concise, actionable guidance. No filler, no "Here is" preamble. Use short paragraphs or bullets.`;
    const user = `Mission: ${m?.name ?? "Unknown"} · Client: ${m?.client ?? "—"} · State: ${m?.state ?? "—"}\nResponse: ${q.question_number} — ${q.title}\nPrompt: ${q.question_text}\nCurrent focus: ${q.current_focus ?? "(none)"}\nNext step: ${q.next_step ?? "(none)"}\nWaiting on: ${q.waiting_on ?? "(none)"}\nLeadership guidance: ${q.guidance ?? "(none)"}\n\nWriter asks: ${data.prompt}`;

    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: sys },
            { role: "user", content: user },
          ],
        }),
      });
      if (!res.ok) {
        return { answer: `_IRIS gateway returned ${res.status}._` };
      }
      const json: any = await res.json();
      return { answer: (json?.choices?.[0]?.message?.content as string) ?? "_No response._" };
    } catch (e: any) {
      return { answer: `_IRIS error: ${e?.message ?? "unknown"}._` };
    }
  });
