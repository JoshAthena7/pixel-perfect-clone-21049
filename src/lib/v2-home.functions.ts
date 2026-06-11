/**
 * v2 Home Screen server functions — role detection, draft scoring,
 * and portfolio executive brief generation.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type RoleHome = "my-work" | "missions" | "portfolio";

/** Resolve the calling user's primary role and where they should land. */
export const getMyHome = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: rows } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const roles = new Set((rows ?? []).map((r) => r.role as string));

    let role: string = "writer";
    let home: RoleHome = "my-work";

    if (roles.has("admin")) {
      role = "admin";
      home = "missions";
    } else if (roles.has("executive")) {
      role = "executive";
      home = "portfolio";
    } else if (roles.has("engagement_lead") || roles.has("lead") || roles.has("project_manager")) {
      role = "engagement_lead";
      home = "missions";
    } else if (roles.has("sme")) {
      role = "sme";
      home = "my-work";
    } else if (roles.has("writer")) {
      role = "writer";
      home = "my-work";
    } else {
      // No role row at all — default to missions list.
      role = "writer";
      home = "missions";
    }

    return { role, home, roles: Array.from(roles) };
  });

const ScoreInput = z.object({
  questionId: z.string().uuid(),
  missionId: z.string().uuid(),
  draftText: z.string().min(20).max(20000),
});

export type ScoreResult = {
  overall: number;
  label: string;
  breakdown: Array<{ category: string; score: number; max: number }>;
  gaps: Array<{ severity: "high" | "medium" | "low"; description: string; fix: string }>;
};

/** Score a draft against the question's actual requirements + win themes. */
export const scoreDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ScoreInput.parse(d))
  .handler(async ({ data, context }): Promise<ScoreResult> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");
    const { supabase, userId } = context;

    const [q, reqs, ws, sg] = await Promise.all([
      supabase
        .from("mission_questions")
        .select("question_number, question_text, evaluation_criteria, word_limit")
        .eq("id", data.questionId)
        .maybeSingle(),
      supabase
        .from("mission_compliance_requirements")
        .select("requirement")
        .eq("mission_id", data.missionId)
        .limit(20),
      supabase
        .from("mission_win_strategy")
        .select("central_claim, win_themes, north_star_message")
        .eq("mission_id", data.missionId)
        .maybeSingle(),
      supabase
        .from("mission_style_guide")
        .select("voice_and_tone, banned_words")
        .eq("mission_id", data.missionId)
        .maybeSingle(),
    ]);

    const qData = (q.data ?? {}) as {
      question_number?: string;
      question_text?: string;
      evaluation_criteria?: string;
      word_limit?: number | null;
    };
    const requirements = ((reqs.data ?? []) as Array<{ requirement: string }>).map((r) => r.requirement);
    const wsData = (ws.data ?? {}) as {
      central_claim?: string;
      win_themes?: string[] | null;
      north_star_message?: string;
    };
    const sgData = (sg.data ?? {}) as { voice_and_tone?: string; banned_words?: string[] | null };

    const prompt = `You are IRIS, an evaluator scoring a proposal draft against the actual RFP criteria.

QUESTION ${qData.question_number ?? ""}: ${qData.question_text ?? ""}
EVALUATION CRITERIA: ${qData.evaluation_criteria ?? "(none specified)"}
WORD LIMIT: ${qData.word_limit ?? "n/a"}

KEY REQUIREMENTS:
${requirements.map((r, i) => `${i + 1}. ${r}`).join("\n") || "(no requirements indexed)"}

WIN THEMES: ${(wsData.win_themes ?? []).join("; ") || "(none)"}
CENTRAL CLAIM: ${wsData.central_claim ?? "(none)"}
NORTH STAR: ${wsData.north_star_message ?? "(none)"}
VOICE: ${sgData.voice_and_tone ?? "(none)"}

DRAFT:
"""
${data.draftText}
"""

Score the draft on five dimensions. Return ONLY valid JSON, no prose:
{
  "overall": <0-100>,
  "label": "<one-line verdict like 'Strong draft' or 'Needs work'>",
  "breakdown": [
    {"category":"Requirements Coverage","score":<0-30>,"max":30},
    {"category":"Win Theme Alignment","score":<0-25>,"max":25},
    {"category":"Evidence Quality","score":<0-20>,"max":20},
    {"category":"Style Compliance","score":<0-15>,"max":15},
    {"category":"Conciseness","score":<0-10>,"max":10}
  ],
  "gaps": [
    {"severity":"high|medium|low","description":"<gap>","fix":"<one-line recommended fix>"}
  ]
}
Maximum 5 gaps, most impactful first. Be specific and reference the actual requirements.`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You return strict JSON only. No markdown, no commentary." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`Scoring failed (${resp.status}): ${text.slice(0, 200)}`);
    }
    const json = await resp.json();
    const content = json?.choices?.[0]?.message?.content ?? "{}";
    let parsed: ScoreResult;
    try {
      parsed = JSON.parse(content) as ScoreResult;
    } catch {
      throw new Error("Score response was not valid JSON.");
    }

    // Fire-and-forget metadata log.
    try {
      await supabase.from("score_me_interactions").insert({
        writer_id: userId,
        question_id: data.questionId,
        mission_id: data.missionId,
        dimension: "overall",
        action: "viewed",
      });
    } catch {
      /* non-fatal */
    }

    return parsed;
  });

/**
 * Generate the IRIS executive portfolio brief. Client owns the 4-hour
 * cache via React Query staleTime (iris_brief_cache RLS blocks non-admin
 * writes, so we don't try to persist here).
 */
export const getPortfolioBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ force: z.boolean().optional() }).parse(d ?? {}))
  .handler(async ({ context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");
    const { supabase } = context;

    const { data: missions } = await supabase
      .from("missions")
      .select("id, name, submission_deadline")
      .eq("status", "active");
    const missionIds = (missions ?? []).map((m) => m.id as string);

    const [atRisk, decisions, intel] = await Promise.all([
      missionIds.length
        ? supabase
            .from("mission_questions")
            .select("mission_id")
            .in("mission_id", missionIds)
            .eq("health_status", "at_risk")
        : Promise.resolve({ data: [] as Array<{ mission_id: string }> }),
      missionIds.length
        ? supabase
            .from("mission_decisions")
            .select("mission_id, title")
            .in("mission_id", missionIds)
            .eq("status", "Pending")
        : Promise.resolve({ data: [] as Array<{ mission_id: string; title: string }> }),
      missionIds.length
        ? supabase
            .from("intelligence_feed_items")
            .select("headline, iris_assessment")
            .in("mission_id", missionIds)
            .gte("iris_relevance_score", 70)
            .order("created_at", { ascending: false })
            .limit(2)
        : Promise.resolve({ data: [] as Array<{ headline: string; iris_assessment: string | null }> }),
    ]);

    const atRiskRows = (atRisk.data ?? []) as Array<{ mission_id: string }>;
    const decisionRows = (decisions.data ?? []) as Array<{ title: string }>;
    const intelRows = (intel.data ?? []) as Array<{ headline: string; iris_assessment: string | null }>;

    const prompt = `You are IRIS briefing an executive on the current state of the proposal portfolio. Be direct. Be specific. Flag only what requires executive attention — decisions, risks, and timeline issues. Do not summarize what is going well. Maximum 4 sentences.

Active missions: ${(missions ?? [])
      .map((m) => `${m.name} (deadline ${m.submission_deadline ?? "TBD"})`)
      .join(", ") || "(none)"}
At-risk questions: ${atRiskRows.length} total across ${new Set(atRiskRows.map((r) => r.mission_id)).size} missions
Open decisions: ${decisionRows.slice(0, 5).map((d) => d.title).join("; ") || "(none)"}
Recent intelligence: ${intelRows.map((i) => `${i.headline} — ${i.iris_assessment ?? ""}`).join(" | ") || "(none)"}`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are IRIS, briefing an executive. Be terse, specific, attention-flagging only." },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!resp.ok) throw new Error(`Brief generation failed (${resp.status})`);
    const json = await resp.json();
    const brief = (json?.choices?.[0]?.message?.content as string) ?? "No brief available.";
    return { brief, generatedAt: new Date().toISOString(), cached: false };
  });
