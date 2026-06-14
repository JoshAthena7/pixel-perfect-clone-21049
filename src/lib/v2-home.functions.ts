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
      // No role row at all — keep the user in the writer workspace.
      role = "writer";
      home = "my-work";
    }

    return { role, home, roles: Array.from(roles) };
  });

const ScoreInput = z.object({
  questionId: z.string().uuid(),
  missionId: z.string().uuid(),
  draftText: z.string().min(20).max(20000),
  mode: z.enum(["full", "quick"]).optional().default("full"),
  includeWinStrategy: z.boolean().optional().default(true),
  includeStyleGuide: z.boolean().optional().default(true),
  includeEvaluatorPriorities: z.boolean().optional().default(true),
});

export type ScoreDimension = {
  category: string;
  score: number;
  max: number;
  explanation?: string;
};

export type ScoreGap = {
  description: string;
  impact: "high" | "medium" | "low";
  potential_points: number;
};

export type ScoreResult = {
  overall: number;
  label: string;
  breakdown: ScoreDimension[];
  // legacy gap shape kept for callers that still use it; new fields below.
  gaps: ScoreGap[];
  iris_recommendation?: string;
  word_count?: number;
  mode: "full" | "quick";
  saved_id?: string | null;
  // Quick-check checklist (only populated when mode === "quick")
  requirements_checklist?: Array<{ requirement: string; covered: boolean }>;
};

function labelFor(score: number): string {
  if (score >= 90) return "Exceptional";
  if (score >= 75) return "Strong draft";
  if (score >= 60) return "Good — gaps to close";
  return "Needs significant work";
}

/** Score a draft against the question's actual requirements + win themes. */
export const scoreDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ScoreInput.parse(d))
  .handler(async ({ data, context }): Promise<ScoreResult> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");
    const { supabase, userId } = context;

    const [q, reqs, ws, sg, stake] = await Promise.all([
      supabase
        .from("mission_questions")
        .select("question_number, question_text, evaluation_criteria, word_limit, section_id")
        .eq("id", data.questionId)
        .maybeSingle(),
      supabase
        .from("mission_compliance_requirements")
        .select("requirement")
        .eq("mission_id", data.missionId)
        .limit(30),
      data.includeWinStrategy
        ? supabase
            .from("mission_win_strategy")
            .select("central_claim, win_themes, north_star_message")
            .eq("mission_id", data.missionId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      data.includeStyleGuide
        ? supabase
            .from("mission_style_guide")
            .select("voice_and_tone, banned_words")
            .eq("mission_id", data.missionId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      data.includeEvaluatorPriorities
        ? supabase
            .from("stakeholder_profiles")
            .select("name, role, public_priorities")
            .eq("mission_id", data.missionId)
            .limit(5)
        : Promise.resolve({ data: [] as Array<{ name: string; role: string; public_priorities: string }> }),
    ]);

    const qData = (q.data ?? {}) as {
      question_number?: string;
      question_text?: string;
      evaluation_criteria?: string;
      word_limit?: number | null;
      section_id?: string;
    };
    const requirements = ((reqs.data ?? []) as Array<{ requirement: string }>).map((r) => r.requirement);
    const wsData = (ws?.data ?? {}) as {
      central_claim?: string;
      win_themes?: string[] | null;
      north_star_message?: string;
    };
    const sgData = (sg?.data ?? {}) as { voice_and_tone?: string; banned_words?: string[] | null };
    const stakeData = (stake.data ?? []) as Array<{ name: string; role: string; public_priorities: string }>;

    const wordCount = data.draftText.trim().split(/\s+/).filter(Boolean).length;

    // QUICK CHECK — simpler, faster, requirements-only prompt
    if (data.mode === "quick") {
      const quickPrompt = `You are IRIS, scoring whether a Medicaid proposal draft covers the explicit requirements.

QUESTION: ${qData.question_text ?? ""}
REQUIREMENTS:
${requirements.map((r, i) => `${i + 1}. ${r}`).join("\n") || "(none indexed)"}

DRAFT:
"""
${data.draftText}
"""

Return ONLY valid JSON:
{
  "requirements_score": <0-30>,
  "explanation": "<one sentence>",
  "checklist": [{"requirement":"<exact requirement text>","covered":true|false}]
}`;
      const qresp = await callGateway(apiKey, quickPrompt, 600);
      const qjson = safeParseJson(qresp);
      const reqScore = clamp(qjson.requirements_score, 0, 30);
      const overall = Math.round((reqScore / 30) * 100);
      const result: ScoreResult = {
        overall,
        label: labelFor(overall),
        breakdown: [
          {
            category: "Requirements Coverage",
            score: reqScore,
            max: 30,
            explanation: qjson.explanation ?? "",
          },
        ],
        gaps: [],
        word_count: wordCount,
        mode: "quick",
        requirements_checklist: Array.isArray(qjson.checklist) ? qjson.checklist : [],
      };
      const saved = await persistScore(supabase, userId, data, result, wordCount);
      result.saved_id = saved;
      return result;
    }

    // FULL SCORE prompt
    const stakeLine = stakeData.length
      ? stakeData
          .map((s) => `${s.name} (${s.role}): ${s.public_priorities ?? "(unknown)"}`)
          .join(" | ")
      : "(no stakeholder profiles)";
    const prompt = `You are IRIS, an expert Medicaid proposal evaluator. Score this draft response against the RFP criteria provided. Be honest. Be specific. Do not award points for vague claims — only for clear evidence, specific commitments, and demonstrated understanding.

Return ONLY valid JSON in exactly this format with no other text:
{
  "overall_score": <0-100>,
  "requirements_score": <0-30>,
  "win_theme_score": <0-25>,
  "evidence_score": <0-20>,
  "style_score": <0-15>,
  "conciseness_score": <0-10>,
  "requirements_explanation": "<one sentence>",
  "win_theme_explanation": "<one sentence>",
  "evidence_explanation": "<one sentence>",
  "style_explanation": "<one sentence>",
  "conciseness_explanation": "<one sentence>",
  "gaps": [{"description":"<specific>","impact":"high|medium|low","potential_points":<number>}],
  "iris_recommendation": "<one specific forward-looking recommendation>",
  "word_count": <number>
}

Scoring criteria:
Requirements Coverage (0-30): Award points only for explicit requirements addressed. Deduct for missing requirements. Partial mention without direct answer = partial credit only.
Win Theme Alignment (0-25): Award points for reflecting the mission's strategic positioning. Technically-correct-but-strategically-generic scores low.
  Central claim: ${wsData.central_claim ?? "(none)"}
  Win themes: ${(wsData.win_themes ?? []).join("; ") || "(none)"}
Evidence Quality (0-20): Award points only for specific data, outcomes, named programs, or cited research. Assertions without support = 0.
Style Compliance (0-15): Check against the style guide; deduct for sensitivity violations.
  Voice/tone: ${sgData.voice_and_tone ?? "(none)"}
  Banned words: ${(sgData.banned_words ?? []).join(", ") || "(none)"}
Conciseness (0-10): Word/page limit: ${qData.word_limit ?? "n/a"}. Over 1-10%: lose 3. Over 11-25%: lose 6. Over 26%+: lose 10. Under: full points.

RFP question: ${qData.question_text ?? ""}
Question number: ${qData.question_number ?? ""}
Evaluator priorities: ${stakeLine}
Key requirements (max 30):
${requirements.map((r, i) => `${i + 1}. ${r}`).join("\n") || "(none indexed)"}

Draft to score:
"""
${data.draftText}
"""`;

    const content = await callGateway(apiKey, prompt, 1500);
    const parsed = safeParseJson(content);

    const breakdown: ScoreDimension[] = [
      {
        category: "Requirements Coverage",
        score: clamp(parsed.requirements_score, 0, 30),
        max: 30,
        explanation: parsed.requirements_explanation ?? "",
      },
      {
        category: "Win Theme Alignment",
        score: clamp(parsed.win_theme_score, 0, 25),
        max: 25,
        explanation: parsed.win_theme_explanation ?? "",
      },
      {
        category: "Evidence Quality",
        score: clamp(parsed.evidence_score, 0, 20),
        max: 20,
        explanation: parsed.evidence_explanation ?? "",
      },
      {
        category: "Style Compliance",
        score: clamp(parsed.style_score, 0, 15),
        max: 15,
        explanation: parsed.style_explanation ?? "",
      },
      {
        category: "Conciseness",
        score: clamp(parsed.conciseness_score, 0, 10),
        max: 10,
        explanation: parsed.conciseness_explanation ?? "",
      },
    ];
    const overall = clamp(
      parsed.overall_score ?? breakdown.reduce((s, b) => s + b.score, 0),
      0,
      100,
    );
    const gaps: ScoreGap[] = Array.isArray(parsed.gaps)
      ? parsed.gaps
          .slice(0, 5)
          .map((g: any) => ({
            description: String(g?.description ?? ""),
            impact: (["high", "medium", "low"].includes(g?.impact) ? g.impact : "medium") as
              | "high"
              | "medium"
              | "low",
            potential_points: Number(g?.potential_points ?? 0),
          }))
          .sort((a: ScoreGap, b: ScoreGap) => b.potential_points - a.potential_points)
      : [];

    const result: ScoreResult = {
      overall,
      label: labelFor(overall),
      breakdown,
      gaps,
      iris_recommendation: parsed.iris_recommendation ?? "",
      word_count: parsed.word_count ?? wordCount,
      mode: "full",
    };
    const saved = await persistScore(supabase, userId, data, result, wordCount);
    result.saved_id = saved;
    return result;
  });

function clamp(n: unknown, min: number, max: number): number {
  const v = Number.isFinite(Number(n)) ? Number(n) : 0;
  return Math.max(min, Math.min(max, Math.round(v)));
}

function safeParseJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    // Try to extract JSON object from a wrapped response
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        /* fall through */
      }
    }
    throw new Error("Score response was not valid JSON.");
  }
}

async function callGateway(apiKey: string, prompt: string, maxTokens: number): Promise<string> {
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
    },
    body: JSON.stringify({
      // Per Phase 3 spec — use Claude Sonnet for higher-quality scoring.
      // The Lovable AI gateway is OpenAI-compatible and routes by model id.
      model: "anthropic/claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: "You return strict JSON only. No markdown, no commentary." },
        { role: "user", content: prompt },
      ]
    }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    if (resp.status === 429) throw new Error("IRIS is rate limited. Please retry in a moment.");
    if (resp.status === 402) throw new Error("Workspace credits exhausted. Add credits in Settings → Workspace → Usage.");
    throw new Error(`Scoring failed (${resp.status}): ${text.slice(0, 200)}`);
  }
  const json = await resp.json();
  return json?.choices?.[0]?.message?.content ?? "{}";
}

async function persistScore(
  supabase: any,
  userId: string,
  data: z.infer<typeof ScoreInput>,
  r: ScoreResult,
  wordCount: number,
): Promise<string | null> {
  try {
    const row = {
      mission_id: data.missionId,
      question_id: data.questionId,
      user_id: userId,
      overall_score: r.overall,
      requirements_score: r.breakdown.find((b) => b.category.startsWith("Requirements"))?.score ?? null,
      win_theme_score: r.breakdown.find((b) => b.category.startsWith("Win Theme"))?.score ?? null,
      evidence_score: r.breakdown.find((b) => b.category.startsWith("Evidence"))?.score ?? null,
      style_score: r.breakdown.find((b) => b.category.startsWith("Style"))?.score ?? null,
      conciseness_score: r.breakdown.find((b) => b.category.startsWith("Conciseness"))?.score ?? null,
      requirements_explanation: r.breakdown.find((b) => b.category.startsWith("Requirements"))?.explanation ?? null,
      win_theme_explanation: r.breakdown.find((b) => b.category.startsWith("Win Theme"))?.explanation ?? null,
      evidence_explanation: r.breakdown.find((b) => b.category.startsWith("Evidence"))?.explanation ?? null,
      style_explanation: r.breakdown.find((b) => b.category.startsWith("Style"))?.explanation ?? null,
      conciseness_explanation: r.breakdown.find((b) => b.category.startsWith("Conciseness"))?.explanation ?? null,
      gaps: r.gaps,
      iris_recommendation: r.iris_recommendation ?? null,
      draft_word_count: wordCount,
      scoring_mode: r.mode,
    };
    const { data: ins } = await supabase
      .from("draft_scores")
      .insert(row)
      .select("id")
      .maybeSingle();
    return (ins?.id as string | undefined) ?? null;
  } catch {
    return null;
  }
}

/** List the calling user's recent draft scores for a mission. Used by My Work. */
export const listMyRecentScores = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ missionId: z.string().uuid(), limit: z.number().min(1).max(20).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: rows } = await supabase
      .from("draft_scores")
      .select(
        "id, question_id, overall_score, scoring_mode, created_at, mission_questions(question_number, question_text)",
      )
      .eq("user_id", userId)
      .eq("mission_id", data.missionId)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 5);
    return { scores: rows ?? [] };
  });

/** Per-question latest score map (used for Question Health badges). */
export const listQuestionLatestScores = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        missionId: z.string().uuid(),
        scope: z.enum(["mine", "all"]).optional().default("mine"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let q = supabase
      .from("draft_scores")
      .select("question_id, overall_score, created_at, user_id")
      .eq("mission_id", data.missionId)
      .not("question_id", "is", null)
      .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order("created_at", { ascending: false });
    if (data.scope === "mine") q = q.eq("user_id", userId);
    const { data: rows } = await q;
    const latest: Record<string, { score: number; created_at: string }> = {};
    for (const r of (rows ?? []) as Array<{ question_id: string; overall_score: number; created_at: string }>) {
      if (!latest[r.question_id]) {
        latest[r.question_id] = { score: r.overall_score, created_at: r.created_at };
      }
    }
    return { latest };
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
        model: "gpt-4o-mini",
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
