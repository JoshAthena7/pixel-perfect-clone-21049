/**
 * IRIS journey extraction — pulls timeline dates from uploaded documents
 * or from the mission's existing RFP text. Server-side so LOVABLE_API_KEY
 * never leaves the worker. Pure JSON; never throws on AI parse failure.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MILESTONE_TYPES = [
  "kickoff",
  "pink_team",
  "red_team",
  "gold_team",
  "submission",
  "award",
  "custom",
] as const;

const InputSchema = z.object({
  text: z.string().min(1).max(40000),
  source: z.enum(["upload", "rfp"]),
});

export type ExtractedMilestone = {
  title: string;
  date: string;
  milestone_type: (typeof MILESTONE_TYPES)[number];
  is_pens_down: boolean;
  is_hard_deadline: boolean;
  notes: string | null;
};

export const extractJourneyMilestones = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => InputSchema.parse(d))
  .handler(async ({ data }): Promise<{ milestones: ExtractedMilestone[] }> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      console.error("[journey-extract] LOVABLE_API_KEY missing");
      return { milestones: [] };
    }
    const limit = data.source === "rfp" ? 8000 : 6000;
    const trimmed = data.text.slice(0, limit);

    const userMsg =
      `Document content:\n${trimmed}\n\n` +
      `Extract every date and deadline mentioned. Return JSON only:\n` +
      `{ "milestones": [ { "title": string, "date": "YYYY-MM-DD", ` +
      `"milestone_type": "kickoff"|"pink_team"|"red_team"|"gold_team"|"submission"|"award"|"custom", ` +
      `"is_pens_down": boolean, "is_hard_deadline": boolean, "notes": string|null } ] }\n\n` +
      `Mapping rules:\n` +
      `- 'Proposal Due'/'Submission Deadline'/'Proposals Due' → submission, is_pens_down:true, is_hard_deadline:true\n` +
      `- 'Pre-Proposal Conference'/'Kickoff'/'Notice of Intent' → kickoff\n` +
      `- 'Q&A Closes'/'Questions Due'/'Last Day for Questions' → custom, title 'Q&A Period Closes'\n` +
      `- 'Award'/'Contract Award'/'Notice of Award' → award\n` +
      `- 'Red Team'/'Internal Review' → red_team\n` +
      `- 'Gold Team'/'Final Review' → gold_team\n` +
      `- 'Pink Team'/'First Draft Review' → pink_team\n` +
      `- Else → custom\n` +
      `Return only clear deadlines/events. Ignore page numbers, version numbers, phone numbers.`;

    let res: Response;
    try {
      res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content:
                "You are IRIS extracting procurement timeline dates from a government RFP schedule document. Respond with valid JSON only.",
            },
            { role: "user", content: userMsg },
          ],
        }),
      });
    } catch (err) {
      console.error("[journey-extract] gateway fetch failed", err);
      return { milestones: [] };
    }
    if (!res.ok) {
      console.error("[journey-extract] gateway", res.status, await res.text().catch(() => ""));
      return { milestones: [] };
    }
    const j = (await res.json().catch(() => null)) as { choices?: Array<{ message?: { content?: string } }> } | null;
    const raw = (j?.choices?.[0]?.message?.content ?? "").trim();
    const clean = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(clean);
    } catch {
      return { milestones: [] };
    }
    const arr = (parsed as { milestones?: unknown })?.milestones;
    if (!Array.isArray(arr)) return { milestones: [] };
    const out: ExtractedMilestone[] = [];
    for (const m of arr) {
      const item = m as Partial<ExtractedMilestone>;
      const date = typeof item.date === "string" ? item.date.slice(0, 10) : "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      const type = MILESTONE_TYPES.includes(item.milestone_type as never)
        ? (item.milestone_type as ExtractedMilestone["milestone_type"])
        : "custom";
      out.push({
        title: (item.title ?? "").toString().slice(0, 80) || "Untitled milestone",
        date,
        milestone_type: type,
        is_pens_down: !!item.is_pens_down,
        is_hard_deadline: !!item.is_hard_deadline,
        notes: typeof item.notes === "string" ? item.notes.slice(0, 500) : null,
      });
    }
    return { milestones: out };
  });
