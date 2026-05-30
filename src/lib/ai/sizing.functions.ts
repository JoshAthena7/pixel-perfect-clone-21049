import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY = "https://ai.gateway.lovable.dev/v1";

// ─────────── Types ───────────
export type SizingQuestion = {
  question_number: string | null;
  question_text: string;
  page_limit: number | null;
  evaluation_weight_pct: number | null;
  ai_estimated?: boolean;
};
export type SizingSection = {
  name: string;
  page_limit: number | null;
  evaluation_weight_pct: number | null;
  ai_estimated?: boolean;
  questions: SizingQuestion[];
};
export type SizingData = {
  total_page_limit: number | null;
  total_questions: number;
  sections: SizingSection[];
  ai_estimated_weights: boolean;
  extracted_at: string;
};

export type SizingAssumptions = {
  baseline: "weak" | "moderate" | "solid";
  turnaround_override_active: boolean;
  complexity: "standard" | "high";
};

export const SERVICE_CATEGORIES = [
  {
    key: "pre_writing",
    label: "Pre-Writing Services",
    items: [
      "Strategy workshops with client",
      "Win theme development sessions",
      "SME interviews and knowledge extraction",
      "Competitive positioning analysis",
      "RFP question clarification support (Q&A preparation)",
    ],
  },
  {
    key: "writing",
    label: "Writing Services",
    items: [
      "Executive summary",
      "Technical volume writing",
      "Past performance narratives",
      "Key personnel resumes and bios",
      "Management approach sections",
    ],
  },
  {
    key: "sme",
    label: "Subject Matter Expert Support",
    items: [
      "Clinical / Care Management SME",
      "LTSS / HCBS specialist",
      "Behavioral health expert",
      "IT / Systems SME",
      "Financial / Actuarial review",
      "Regulatory / Compliance review",
    ],
  },
  {
    key: "creative",
    label: "Creative and Production",
    items: [
      "Graphic design (infographics, org charts, process flows)",
      "Document design and layout / DTP",
      "Executive summary design treatment",
      "Oral presentation deck design",
      "Final production and formatting",
    ],
  },
  {
    key: "qa",
    label: "Quality and Editing",
    items: [
      "Technical editing",
      "Copy editing",
      "Compliance matrix review",
      "Red team review",
      "Final proof before submission",
    ],
  },
  {
    key: "post_submission",
    label: "Post-Submission",
    items: ["Oral presentation preparation", "BAFO support", "Debrief attendance and analysis"],
  },
] as const;

export type ServiceItem = {
  label: string;
  checked: boolean;
  notes: string;
  estimated_hours: number;
};
export type ServiceCategoryState = { items: ServiceItem[] };
export type ServicesChecklist = Record<string, ServiceCategoryState>;

export function defaultServicesChecklist(): ServicesChecklist {
  const out: ServicesChecklist = {};
  for (const cat of SERVICE_CATEGORIES) {
    out[cat.key] = {
      items: cat.items.map((label) => ({ label, checked: false, notes: "", estimated_hours: 0 })),
    };
  }
  return out;
}

// ─────────── Helpers ───────────
export function capacityFor(a: SizingAssumptions | null | undefined, daysRemaining: number | null): number {
  if (!a) return 70;
  if (daysRemaining !== null && daysRemaining < 90) return 30;
  if (a.turnaround_override_active) return 30;
  const base = a.baseline === "weak" ? 50 : a.baseline === "solid" ? 90 : 70;
  const mod = a.complexity === "high" ? -10 : 0;
  return Math.max(base + mod, 10);
}

// ─────────── Server fns ───────────

/**
 * Extract sizing data from the most recent Holy Grail opportunity analysis
 * (same data source as RFP question extraction). Writes engagement_config.sizing_data
 * and propagates evaluation weights to heatmap_sections + rfp_questions when matchable.
 */
export const extractSizingData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ engagementId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI is not configured.");

    const { data: opp } = await supabase
      .from("engagement_research")
      .select("content")
      .eq("engagement_id", data.engagementId)
      .eq("category", "holy_grail_opportunity")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!opp?.content) {
      return { ok: false, message: "Run Holy Grail Opportunity first to extract sizing data." };
    }

    const sys = `You extract RFP sizing data from a parsed opportunity analysis.
Return STRICT JSON with this exact shape:
{
  "total_page_limit": number|null,
  "total_questions": number,
  "ai_estimated_weights": boolean,
  "sections": [
    {
      "name": string,
      "page_limit": number|null,
      "evaluation_weight_pct": number|null,
      "ai_estimated": boolean,
      "questions": [
        {
          "question_number": string|null,
          "question_text": string,
          "page_limit": number|null,
          "evaluation_weight_pct": number|null,
          "ai_estimated": boolean
        }
      ]
    }
  ]
}
Rules:
- evaluation_weight_pct is a percentage (0-100). All section weights should sum to ~100. Question weights within a section should sum to that section's weight.
- If explicit weights are in the RFP, use them (ai_estimated=false).
- If weights are NOT explicit, estimate them from section length, question count, and any scoring language. Set ai_estimated=true on every estimated weight, and ai_estimated_weights=true at the top level.
- Up to 20 sections, up to 15 questions per section. Prefer scored/evaluated items.`;
    const user = `OPPORTUNITY ANALYSIS:\n${JSON.stringify(opp.content).slice(0, 60000)}`;

    const res = await fetch(`${GATEWAY}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (res.status === 429) throw new Error("AI rate limit hit — try again in a minute.");
      if (res.status === 402) throw new Error("AI credits exhausted — top up in Settings → Workspace.");
      throw new Error(`AI extraction failed (${res.status}): ${body.slice(0, 200)}`);
    }
    const json = (await res.json()) as any;
    let parsed: any = {};
    try {
      parsed = JSON.parse(json.choices?.[0]?.message?.content ?? "{}");
    } catch {
      parsed = {};
    }

    const sections: SizingSection[] = Array.isArray(parsed.sections) ? parsed.sections : [];
    const totalQuestions =
      typeof parsed.total_questions === "number"
        ? parsed.total_questions
        : sections.reduce((s, sec) => s + (sec.questions?.length ?? 0), 0);

    // Compute submission_days_remaining
    const { data: eng } = await supabase
      .from("engagements")
      .select("submission_date")
      .eq("id", data.engagementId)
      .maybeSingle();
    let daysRemaining: number | null = null;
    if (eng?.submission_date) {
      const ms = new Date(eng.submission_date as string).getTime() - Date.now();
      daysRemaining = Math.ceil(ms / 86_400_000);
    }

    const sizingData: SizingData = {
      total_page_limit: parsed.total_page_limit ?? null,
      total_questions: totalQuestions,
      sections,
      ai_estimated_weights: !!parsed.ai_estimated_weights,
      extracted_at: new Date().toISOString(),
    };

    // Persist sizing_data + days remaining; create config row if missing
    const { data: existingCfg } = await supabase
      .from("engagement_config")
      .select("id")
      .eq("engagement_id", data.engagementId)
      .maybeSingle();
    if (existingCfg) {
      await supabase
        .from("engagement_config")
        .update({ sizing_data: sizingData as any, submission_days_remaining: daysRemaining })
        .eq("engagement_id", data.engagementId);
    } else {
      await supabase
        .from("engagement_config")
        .insert({ engagement_id: data.engagementId, sizing_data: sizingData as any, submission_days_remaining: daysRemaining });
    }

    // Propagate section weights to heatmap_sections (match by name, case-insensitive)
    const { data: heatRows } = await supabase
      .from("heatmap_sections")
      .select("id, section_name")
      .eq("engagement_id", data.engagementId);
    if (heatRows) {
      for (const sec of sections) {
        if (sec.evaluation_weight_pct == null) continue;
        const match = (heatRows as any[]).find(
          (h) => (h.section_name as string).toLowerCase().trim() === sec.name.toLowerCase().trim(),
        );
        if (match) {
          await supabase
            .from("heatmap_sections")
            .update({ evaluation_weight_pct: sec.evaluation_weight_pct })
            .eq("id", match.id);
        }
      }
    }

    // Propagate question weights / page limits to rfp_questions (match by body prefix)
    const { data: rfpQs } = await supabase
      .from("rfp_questions")
      .select("id, body, question_number")
      .eq("engagement_id", data.engagementId);
    if (rfpQs) {
      for (const sec of sections) {
        for (const q of sec.questions ?? []) {
          if (!q.question_text) continue;
          const key = q.question_text.slice(0, 60).toLowerCase().trim();
          const match = (rfpQs as any[]).find(
            (r) =>
              (q.question_number && r.question_number === q.question_number) ||
              (r.body && (r.body as string).toLowerCase().includes(key)),
          );
          if (match) {
            await supabase
              .from("rfp_questions")
              .update({
                evaluation_weight_pct: q.evaluation_weight_pct,
                page_limit: q.page_limit,
              })
              .eq("id", match.id);
          }
        }
      }
    }

    return { ok: true, sizing_data: sizingData, days_remaining: daysRemaining };
  });

export const saveSizingAssumptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        engagementId: z.string().uuid(),
        assumptions: z.object({
          baseline: z.enum(["weak", "moderate", "solid"]),
          turnaround_override_active: z.boolean(),
          complexity: z.enum(["standard", "high"]),
        }),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("engagement_config")
      .update({ sizing_assumptions: data.assumptions as any })
      .eq("engagement_id", data.engagementId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveServicesChecklist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        engagementId: z.string().uuid(),
        checklist: z.record(z.string(), z.any()),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("engagement_config")
      .update({ services_checklist: data.checklist as any })
      .eq("engagement_id", data.engagementId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const assignQuestionToWriter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        questionId: z.string().uuid(),
        memberId: z.string().uuid().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("rfp_questions")
      .update({ assigned_to: data.memberId })
      .eq("id", data.questionId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
