import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  missionName: z.string().min(1).max(200),
  deadline: z.string().min(1),
  daysToSubmission: z.number().int(),
  writersWriteDays: z.number().int(),
  totalReviewDays: z.number().int(),
});

export const assessJourneyTimeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const system =
      "You are IRIS evaluating a mission timeline for a Medicaid procurement proposal. " +
      "Based on the timeline provided assess whether it is realistic and flag any concerns. " +
      "Be direct and specific. Return 2-3 sentences maximum. Do not be alarming but do not hide real concerns.";

    const deadlineStr = new Date(data.deadline).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const user =
      `Mission: ${data.missionName}\n` +
      `Submission deadline: ${deadlineStr}\n` +
      `Days to submission: ${data.daysToSubmission}\n` +
      `Writers Write duration: ${data.writersWriteDays} days\n` +
      `Total review time: ${data.totalReviewDays} days`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 200);
      throw new Error(`AI gateway ${res.status}: ${body}`);
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = (json.choices?.[0]?.message?.content ?? "").trim();
    return { assessment: text };
  });
