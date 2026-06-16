/**
 * IRIS Brief Generator — reads a queued mission_questions row, generates
 * the full iris_brief JSONB via the Lovable AI gateway, and writes it back.
 *
 * Matches the IrisBrief interface in src/lib/oracle/types.ts and the AI
 * gateway pattern used in src/lib/score-me-coach.functions.ts.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({
  missionId: z.string().uuid(),
  questionId: z.string().uuid(),
});

export const generateIrisBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // 1) Flip status -> generating
    await supabase
      .from("mission_questions")
      .update({ iris_brief_status: "generating" })
      .eq("id", data.questionId);

    try {
      // 2) Parallel context fetch
      const [
        { data: question },
        { data: oracleConfig },
        { data: mission },
        { data: signals },
      ] = await Promise.all([
        supabase
          .from("mission_questions")
          .select(
            "question_number, question_text, word_limit, page_limit, point_value, evaluation_criteria, brief_notes",
          )
          .eq("id", data.questionId)
          .single(),
        supabase
          .from("oracle_engagement_config")
          .select("north_star, win_themes, top_risks, competitors, monitoring_mode")
          .eq("mission_id", data.missionId)
          .maybeSingle(),
        supabase
          .from("missions")
          .select("name, client_name, agency_name")
          .eq("id", data.missionId)
          .single(),
        supabase
          .from("intel_events")
          .select("title, content, confidence, event_type, created_at")
          .eq("mission_id", data.missionId)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

      // 3) Build prompts
      const winThemes = Array.isArray((oracleConfig as any)?.win_themes)
        ? ((oracleConfig as any).win_themes as any[])
        : [];
      const topRisks = Array.isArray((oracleConfig as any)?.top_risks)
        ? ((oracleConfig as any).top_risks as any[])
        : [];
      const competitors = Array.isArray((oracleConfig as any)?.competitors)
        ? ((oracleConfig as any).competitors as any[])
        : [];

      const system = `You are IRIS, the intelligence co-pilot for Athena Strategy Group's ATLAS platform. You are generating a pre-writing intelligence brief for a Medicaid RFP writer.

Your output must be a valid JSON object. No preamble. No markdown fences. Only the JSON object.

CRITICAL RULES:
- iris_evidence must contain only industry-level proof points from public sources. Never invent statistics.
- Never generate client-specific performance data, outcomes, or case studies.
- client_proof_points_prompt must instruct the writer to add their own organization's data.
- All content must be grounded in Medicaid managed care context.
- Be specific to the actual question being briefed.`;

      const q = (question ?? {}) as any;
      const m = (mission ?? {}) as any;
      const oc = (oracleConfig ?? {}) as any;

      const userMsg = [
        `Mission: ${m.name ?? "(unspecified)"}`,
        `Client: ${m.client_name ?? "(unspecified)"} — ${m.agency_name ?? "(unspecified)"}`,
        `North Star: ${oc.north_star ?? "Not set"}`,
        "",
        `Win Themes: ${JSON.stringify(winThemes)}`,
        `Top Risks: ${JSON.stringify(topRisks)}`,
        `Competitors: ${competitors.join(", ") || "(none)"}`,
        "",
        `Recent Intelligence (top 20):`,
        ...((signals ?? []) as any[]).map(
          (s) =>
            `- [${s.event_type ?? "signal"}] ${s.title ?? ""}: ${String(s.content ?? "").slice(0, 120)}`,
        ),
        "",
        `QUESTION TO BRIEF:`,
        `Number: ${q.question_number ?? "N/A"}`,
        `Text: ${q.question_text ?? ""}`,
        `Word Limit: ${q.word_limit ?? "Not specified"}`,
        `Page Limit: ${q.page_limit ?? "Not specified"}`,
        `Point Value: ${q.point_value ?? "Not specified"}`,
        `Evaluation Criteria: ${q.evaluation_criteria ?? "Not specified"}`,
        `Leadership Notes: ${q.brief_notes ?? "None"}`,
        "",
        `Return this exact JSON shape:
{
  "decoded_intent": "what the evaluator is really asking beneath the surface — 2 sentences max",
  "evaluation_focus": "what will make or break the score on this question — 2 sentences max",
  "win_theme_connections": [
    { "theme_id": "wt1", "theme_text": "theme text", "relevance_score": 85, "signal_authority": "client_stated" }
  ],
  "oracle_signals": [
    { "signal_id": "sig1", "title": "signal title", "why_it_matters": "one sentence", "relevance_score": 80 }
  ],
  "iris_evidence": [
    { "source": "CMS Managed Care Final Rule 2024", "finding": "specific finding", "citation": "42 CFR 438", "relevance": "why it matters for this question" }
  ],
  "client_proof_points_prompt": "Insert your organization's specific performance data here: [enrollment outcomes, quality metrics, care coordination results, contract performance data]. Do not leave this blank — evaluators want evidence, not assertions.",
  "language_guidance": {
    "use": ["specific terms to use"],
    "avoid": ["terms and phrases to avoid"]
  },
  "compliance_checklist": [
    { "item": "specific requirement", "required": true, "detail": "detail or null" }
  ],
  "recommended_approach": "2-3 sentence recommended response strategy",
  "competitive_intel": "brief note on competitor approach or null"
}`,
      ].join("\n");

      // 4) AI gateway
      const apiKey = process.env.LOVABLE_API_KEY;
      if (!apiKey) {
        throw new Error("IRIS brief generator is offline (LOVABLE_API_KEY missing).");
      }

      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Lovable-API-Key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: userMsg },
          ],
        }),
      });

      if (res.status === 429) throw new Error("IRIS is rate limited. Try again in a moment.");
      if (res.status === 402) throw new Error("AI credits exhausted.");
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error("[iris-brief] gateway error", res.status, body);
        throw new Error(`IRIS brief generator failed (${res.status}): ${body.slice(0, 200)}`);
      }

      const j = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const raw = (j.choices?.[0]?.message?.content ?? "").trim();
      // Strip ```json fences if the model wrapped its reply in a code block.
      const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      if (start === -1 || end === -1 || end <= start) {
        console.error("[iris-brief] unreadable content", raw.slice(0, 500));
        throw new Error("IRIS returned an unreadable response.");
      }
      const jsonStr = cleaned.slice(start, end + 1);

      let brief: any;
      try {
        brief = JSON.parse(jsonStr);
      } catch {
        console.error("[iris-brief] invalid JSON", jsonStr.slice(0, 500));
        throw new Error("IRIS brief generation failed: invalid JSON.");
      }

      // 5) Write back
      await supabase
        .from("mission_questions")
        .update({
          iris_brief: brief,
          iris_brief_status: "ready",
          iris_brief_generated_at: new Date().toISOString(),
          iris_decoded_intent: brief.decoded_intent ?? null,
          iris_evidence: brief.iris_evidence ?? [],
        })
        .eq("id", data.questionId);

      return { success: true, questionId: data.questionId };
    } catch (err) {
      await supabase
        .from("mission_questions")
        .update({ iris_brief_status: "error" })
        .eq("id", data.questionId);
      throw err;
    }
  });
