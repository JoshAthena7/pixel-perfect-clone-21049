// Athena Insights — IRIS-generated strategic guidance.
// Three types: daily (one per mission per day), section (one per RFP section,
// regenerated weekly), at_risk (per at-risk question, always fresh).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const APPROVED_TAGS = [
  "Family Voice","Youth-Guided","Wraparound","Crisis","I/DD","Behavioral Health",
  "Substance Use","Access","Quality","Equity","Provider Partnership","Community",
  "Compliance","Outcomes","Innovation","Risk","Differentiation",
];

const FORBIDDEN_WORDS = [
  "leverage","synergy","robust","comprehensive","holistic","impactful",
  "innovative","cutting-edge","best practices","stakeholder engagement",
];

const GENERIC_OPENINGS = [
  /^it is important/i, /^be sure to/i, /^remember (that|to)/i,
  /^make sure/i, /^you should/i, /^writers? should/i,
];

type GeneratedInsight = {
  strategic_quote: string;
  why_it_matters: string;
  writers_note: string;
  suggested_tags: string[];
  insight_title_suffix: string;
};

async function callGateway(system: string, user: string): Promise<string> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("IRIS not configured.");
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey, Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
  });
  if (r.status === 402) throw new Error("AI credits exhausted.");
  if (r.status === 429) throw new Error("Rate limited.");
  if (!r.ok) throw new Error(`Gateway ${r.status}`);
  const j = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return j.choices?.[0]?.message?.content?.trim() ?? "";
}

function parseJson(s: string): GeneratedInsight | null {
  try { return JSON.parse(s) as GeneratedInsight; } catch {
    const m = s.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try { return JSON.parse(m[0]) as GeneratedInsight; } catch { return null; }
  }
}

function validate(g: GeneratedInsight): { ok: true } | { ok: false; reason: string; instruction: string } {
  if (!g.strategic_quote?.trim() || !g.why_it_matters?.trim() || !g.writers_note?.trim()) {
    return { ok: false, reason: "missing fields", instruction: "Return all three of strategic_quote, why_it_matters, writers_note as non-empty strings." };
  }
  if (g.strategic_quote.length > 200) return { ok: false, reason: "quote too long", instruction: "strategic_quote must be 200 characters or fewer." };
  if (g.why_it_matters.length > 400) return { ok: false, reason: "why too long", instruction: "why_it_matters must be 400 characters or fewer." };
  if (g.writers_note.length > 350) return { ok: false, reason: "note too long", instruction: "writers_note must be 350 characters or fewer." };

  // Guardrail 1: no generic openings
  if (GENERIC_OPENINGS.some((re) => re.test(g.strategic_quote.trim()))) {
    return { ok: false, reason: "generic opening", instruction: "The strategic_quote must not begin with instructions to the writer. Rewrite it as a statement of strategic truth." };
  }

  // Guardrail 2: no forbidden words
  const full = `${g.strategic_quote} ${g.why_it_matters} ${g.writers_note}`.toLowerCase();
  const hit = FORBIDDEN_WORDS.find((w) => full.includes(w));
  if (hit) {
    return { ok: false, reason: `forbidden word: ${hit}`, instruction: "Remove all corporate jargon (leverage, synergy, robust, comprehensive, holistic, impactful, innovative, cutting-edge, best practices, stakeholder engagement). Rewrite in plain direct language." };
  }

  // Guardrail 3: why_it_matters must contain at least one specific reference
  // (proper noun with capital, a digit, or %/$).
  const hasSpecific = /[A-Z][a-z]{2,}/.test(g.why_it_matters) || /\d/.test(g.why_it_matters) || /[$%]/.test(g.why_it_matters);
  if (!hasSpecific) {
    return { ok: false, reason: "non-specific", instruction: "why_it_matters must reference at least one specific item: a proper noun (e.g. a report, person, agency, state), a number, or a percentage." };
  }
  return { ok: true };
}

const SYSTEM_PROMPT = `You are IRIS, the intelligence co-pilot for Athena Strategy Group. Athena helps managed care organizations win complex Medicaid procurements. You are generating an Athena Insight — a piece of strategic writing guidance that will be shown to proposal writers before they draft their response. Your job is to distill everything you know about this mission into the sharpest possible strategic thought.

THE ATHENA VOICE RULES — follow these exactly:

One big idea. Not a list. Not a summary. A single point of view.

The strategic_quote must be a statement a great engagement lead would say in the hallway. Confident. Direct. Slightly provocative. Never generic.

Ground everything in specific intelligence from the mission data provided. Cite specific reports, specific evaluator statements, specific competitor weaknesses.

The writers_note must tell the writer exactly what to do — specific action in specific location. Not motivation. Not encouragement. Instruction.

Short sentences. No em dashes. No bullet points. No corporate jargon.

Forbidden words: leverage, synergy, robust, comprehensive, holistic, impactful, stakeholder engagement, best practices, innovative, cutting-edge.

strategic_quote maximum 200 characters. why_it_matters maximum 400 characters. writers_note maximum 350 characters.

Return ONLY valid JSON with no other text, no markdown, no backticks: { "strategic_quote": string, "why_it_matters": string, "writers_note": string, "suggested_tags": array of strings from this list only: [Family Voice, Youth-Guided, Wraparound, Crisis, I/DD, Behavioral Health, Substance Use, Access, Quality, Equity, Provider Partnership, Community, Compliance, Outcomes, Innovation, Risk, Differentiation], "insight_title_suffix": string max 40 chars describing what this insight is about }`;

function fmtJsonArr(v: unknown): string {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map((x) => (typeof x === "string" ? x : (x as any)?.theme || (x as any)?.text || JSON.stringify(x))).filter(Boolean).join("; ");
  return JSON.stringify(v);
}

type AdminClient = Awaited<ReturnType<typeof loadAdmin>>;
async function loadAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function gatherContext(admin: AdminClient, missionId: string) {
  const [missionRes, wsRes, feedRes, stakeholdersRes, competitorsRes, peRes, graphRes] = await Promise.all([
    admin.from("missions").select("id,name,client_name,state,program_type,submission_deadline").eq("id", missionId).maybeSingle(),
    admin.from("mission_win_strategy").select("north_star_message,central_claim,win_themes,known_competitors,proof_points").eq("mission_id", missionId).maybeSingle(),
    admin.from("intelligence_feed_items").select("headline,iris_assessment,iris_relevance_score").eq("mission_id", missionId).eq("is_dismissed", false).order("iris_relevance_score", { ascending: false }).limit(3),
    admin.from("stakeholder_profiles").select("name,stakeholder_type,public_priorities,iris_confidence").eq("mission_id", missionId).in("stakeholder_type", ["evaluator", "influencer"]).order("iris_confidence", { ascending: false }).limit(4),
    admin.from("competitor_profiles").select("competitor_name,likely_narrative,known_weaknesses").eq("mission_id", missionId).limit(3),
    admin.from("procurement_evolution_records").select("iris_summary,iris_signals,iris_recommendations").eq("mission_id", missionId).limit(1).maybeSingle(),
    admin.from("intelligence_graph_nodes").select("label,node_type,description").eq("mission_id", missionId).order("created_at", { ascending: false }).limit(5),
  ]);
  return {
    mission: missionRes.data as any,
    ws: wsRes.data as any,
    feed: (feedRes.data ?? []) as any[],
    stakeholders: (stakeholdersRes.data ?? []) as any[],
    competitors: (competitorsRes.data ?? []) as any[],
    pe: peRes.data as any,
    graph: (graphRes.data ?? []) as any[],
  };
}

function dailyPrompt(c: Awaited<ReturnType<typeof gatherContext>>): string {
  const days = c.mission?.submission_deadline
    ? Math.ceil((new Date(c.mission.submission_deadline).getTime() - Date.now()) / 86400000)
    : null;
  const lines: string[] = [];
  lines.push(`Generate a daily Athena Insight for this mission. This insight applies to all writers on the mission and should capture the single most important strategic truth they need to carry into their work today.`);
  lines.push("");
  lines.push(`Mission: ${c.mission?.name ?? "Unknown"} — ${c.mission?.client_name ?? ""}`);
  if (c.mission?.program_type) lines.push(`Program type: ${c.mission.program_type}`);
  if (c.mission?.state) lines.push(`State: ${c.mission.state}`);
  if (days !== null) lines.push(`Days to submission: ${days}`);
  if (c.ws?.north_star_message) lines.push(`\nNorth Star: ${c.ws.north_star_message}`);
  if (c.ws?.central_claim) lines.push(`Central Claim: ${c.ws.central_claim}`);
  const themes = fmtJsonArr(c.ws?.win_themes);
  if (themes) lines.push(`Win Themes: ${themes}`);
  if (c.feed.length) {
    lines.push(`\nMost important intelligence right now:`);
    c.feed.forEach((f, i) => lines.push(`${i + 1}. ${f.headline}${f.iris_assessment ? ` — ${f.iris_assessment}` : ""}`));
  }
  if (c.stakeholders.length) {
    lines.push(`\nKey evaluator priorities:`);
    c.stakeholders.forEach((s) => lines.push(`- ${s.name} (${s.stakeholder_type}): ${s.public_priorities ?? "no public priorities"}`));
  }
  if (c.pe?.iris_signals) lines.push(`\nProcurement evolution signal: ${c.pe.iris_signals}`);
  if (c.competitors.length) {
    lines.push(`\nCompetitor landscape:`);
    c.competitors.forEach((co) => lines.push(`- ${co.competitor_name}: ${co.likely_narrative ?? "narrative unknown"}`));
  }
  lines.push(`\nWhat is most at risk right now on this mission? Generate an insight that addresses the most important strategic truth a writer needs to internalize today.`);
  return lines.join("\n");
}

function sectionPrompt(c: Awaited<ReturnType<typeof gatherContext>>, section: any, questions: any[], reqs: any[]): string {
  const lines: string[] = [];
  lines.push(`Generate an Athena Insight for a specific section of this proposal. This insight will be shown to the writer assigned to this section before they draft their response.`);
  lines.push("");
  lines.push(`Mission: ${c.mission?.name ?? ""} — ${c.mission?.client_name ?? ""}`);
  lines.push(`Section: ${section?.section_number ? `${section.section_number} — ` : ""}${section?.description ?? "Untitled section"}`);
  if (questions.length) {
    lines.push(`Questions in this section:`);
    questions.forEach((q, i) => lines.push(`${i + 1}. ${q.question_number ? `[${q.question_number}] ` : ""}${q.question_text ?? ""}`));
  }
  if (reqs.length) {
    lines.push(`\nHigh-risk compliance requirements:`);
    reqs.forEach((r) => lines.push(`- ${r.requirement}`));
  }
  if (c.ws?.north_star_message) lines.push(`\nNorth Star: ${c.ws.north_star_message}`);
  const themes = fmtJsonArr(c.ws?.win_themes);
  if (themes) lines.push(`Win Themes: ${themes}`);
  if (c.stakeholders.length) {
    lines.push(`\nEvaluator priorities most relevant to this section:`);
    c.stakeholders.forEach((s) => lines.push(`- ${s.name}: ${s.public_priorities ?? ""}`));
  }
  if (c.feed.length) {
    lines.push(`\nIntelligence items most relevant to this section:`);
    c.feed.slice(0, 3).forEach((f, i) => lines.push(`${i + 1}. ${f.headline}${f.iris_assessment ? ` — ${f.iris_assessment}` : ""}`));
  }
  if (c.competitors.length) {
    lines.push(`\nCompetitor weaknesses on this section:`);
    c.competitors.forEach((co) => lines.push(`- ${co.competitor_name}: ${co.known_weaknesses ?? "unknown"}`));
  }
  lines.push(`\nGenerate an insight that gives this writer the sharpest possible strategic advantage before they write this section. What is the one thing they absolutely must understand?`);
  return lines.join("\n");
}

function atRiskPrompt(c: Awaited<ReturnType<typeof gatherContext>>, section: any, question: any, writerName: string | null): string {
  const lines: string[] = [];
  lines.push(`Generate an Athena Insight for a specific question that has been flagged at risk. This writer needs specific strategic guidance right now.`);
  lines.push("");
  lines.push(`Mission: ${c.mission?.name ?? ""}`);
  lines.push(`Section: ${section?.description ?? "unknown"}`);
  lines.push(`Question: ${question?.question_number ? `[${question.question_number}] ` : ""}${question?.question_text ?? ""}`);
  lines.push(`Why it is at risk: ${question?.health_status === "at_risk" ? "health status flagged at risk" : "flagged at risk"}`);
  if (writerName) lines.push(`Writer: ${writerName}`);
  if (c.ws?.north_star_message) lines.push(`\nNorth Star: ${c.ws.north_star_message}`);
  const themes = fmtJsonArr(c.ws?.win_themes);
  if (themes) lines.push(`Win Themes: ${themes}`);
  if (c.feed.length) {
    lines.push(`\nMost relevant intelligence for this question:`);
    c.feed.slice(0, 2).forEach((f, i) => lines.push(`${i + 1}. ${f.headline}${f.iris_assessment ? ` — ${f.iris_assessment}` : ""}`));
  }
  if (c.stakeholders.length) {
    lines.push(`\nMost relevant evaluator priorities:`);
    c.stakeholders.slice(0, 3).forEach((s) => lines.push(`- ${s.name}: ${s.public_priorities ?? ""}`));
  }
  lines.push(`\nGenerate an insight that gives this specific writer specific guidance on how to turn this question around. What is the one strategic truth they need to understand to fix this draft?`);
  return lines.join("\n");
}

async function generateWithRetry(system: string, user: string): Promise<GeneratedInsight | null> {
  let prompt = user;
  for (let attempt = 0; attempt < 3; attempt++) {
    let raw: string;
    try { raw = await callGateway(system, prompt); } catch (e) {
      console.error("[athena-insights] gateway error", e);
      return null;
    }
    const parsed = parseJson(raw);
    if (!parsed) {
      prompt = `${user}\n\nYour previous response was not valid JSON. Return ONLY the JSON object.`;
      continue;
    }
    const v = validate(parsed);
    if (v.ok) {
      parsed.suggested_tags = (parsed.suggested_tags ?? []).filter((t) => APPROVED_TAGS.includes(t));
      return parsed;
    }
    if (attempt >= 2) {
      console.warn(`[athena-insights] failed guardrail after retries: ${v.reason}`);
      return null;
    }
    prompt = `${user}\n\nYour previous response failed validation: ${v.reason}. ${v.instruction}`;
  }
  return null;
}

const BuildSchema = z.object({
  missionId: z.string().uuid(),
  type: z.enum(["daily", "section", "at_risk"]),
  section_id: z.string().uuid().optional().nullable(),
  question_id: z.string().uuid().optional().nullable(),
  force_regenerate: z.boolean().optional(),
});

export const buildAthenaInsight = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => BuildSchema.parse(input))
  .handler(async ({ data }) => {
    const admin = await loadAdmin();
    const { missionId, type, force_regenerate } = data;
    const sectionId = data.section_id ?? null;
    const questionId = data.question_id ?? null;

    // Step B: check existing
    if (!force_regenerate) {
      if (type === "daily") {
        const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0);
        const { data: existing } = await admin
          .from("athena_insights")
          .select("*")
          .eq("mission_id", missionId)
          .eq("is_daily_insight", true)
          .gte("updated_at", todayStart.toISOString())
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (existing) return { insight: existing, skipped: true };
      } else if (type === "section" && sectionId) {
        const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
        const { data: existing } = await (admin.from("athena_insights") as any)
          .select("*")
          .eq("mission_id", missionId)
          .eq("section_id", sectionId)
          .eq("insight_type", "section")
          .gte("updated_at", sevenDaysAgo)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (existing) return { insight: existing, skipped: true };
      }
    }

    // Step A: gather
    const ctx = await gatherContext(admin, missionId);
    if (!ctx.mission) return { insight: null, error: "Mission not found" };

    // Build prompt
    let userPrompt = "";
    let section: any = null;
    let question: any = null;
    let writerName: string | null = null;

    if (type === "daily") {
      userPrompt = dailyPrompt(ctx);
    } else if (type === "section") {
      if (!sectionId) return { insight: null, error: "section_id required" };
      const [secRes, qsRes, reqsRes] = await Promise.all([
        admin.from("mission_sections").select("id,section_number,description").eq("id", sectionId).maybeSingle(),
        admin.from("mission_questions").select("question_text,question_number").eq("section_id", sectionId).limit(5),
        admin.from("mission_compliance_requirements").select("requirement").eq("section_id", sectionId).eq("is_high_risk", true).limit(8),
      ]);
      section = secRes.data;
      userPrompt = sectionPrompt(ctx, section, qsRes.data ?? [], reqsRes.data ?? []);
    } else if (type === "at_risk") {
      if (!questionId) return { insight: null, error: "question_id required" };
      const { data: q } = await admin.from("mission_questions").select("id,question_text,question_number,health_status,section_id").eq("id", questionId).maybeSingle();
      question = q;
      if (q?.section_id) {
        const { data: s } = await admin.from("mission_sections").select("id,section_number,description").eq("id", q.section_id).maybeSingle();
        section = s;
      }
      const { data: assignment } = await admin.from("mission_assignments").select("assigned_writer_id").eq("question_id", questionId).maybeSingle();
      if (assignment?.assigned_writer_id) {
        const { data: prof } = await admin.from("profiles").select("display_name,full_name").eq("id", assignment.assigned_writer_id).maybeSingle();
        writerName = (prof as any)?.display_name ?? (prof as any)?.full_name ?? null;
      }
      userPrompt = atRiskPrompt(ctx, section, question, writerName);
    }

    // Step C/D: call + validate w/ retry
    const generated = await generateWithRetry(SYSTEM_PROMPT, userPrompt);
    if (!generated) return { insight: null, error: "Generation failed quality guardrails" };

    // Step E: insert/update
    const { count } = await admin.from("athena_insights").select("id", { count: "exact", head: true }).eq("mission_id", missionId);
    const insightNumber = (count ?? 0) + 1;
    const title = `Athena Insight #${insightNumber} — ${ctx.mission.name}`;

    const payload: Record<string, any> = {
      mission_id: missionId,
      strategic_quote: generated.strategic_quote,
      quote: generated.strategic_quote, // back-compat
      why_it_matters: generated.why_it_matters,
      writers_note: generated.writers_note,
      title,
      insight_number: insightNumber,
      tags: generated.suggested_tags,
      created_by_name: "IRIS",
      is_iris_generated: true,
      insight_type: type,
      is_daily_insight: type === "daily",
      section_id: type !== "daily" ? sectionId : null,
      question_id: type === "at_risk" ? questionId : null,
    };

    let upsertedId: string | null = null;
    if (type === "daily") {
      await (admin.from("athena_insights") as any).update({ is_daily_insight: false }).eq("mission_id", missionId).eq("is_daily_insight", true);
      const { data: ins, error } = await (admin.from("athena_insights") as any).insert(payload).select().single();
      if (error) { console.error("[athena-insights] insert daily failed", error); return { insight: null, error: error.message }; }
      upsertedId = ins.id;
    } else if (type === "section" && sectionId) {
      const { data: existing } = await (admin.from("athena_insights") as any)
        .select("id").eq("mission_id", missionId).eq("section_id", sectionId).eq("insight_type", "section")
        .order("updated_at", { ascending: false }).limit(1).maybeSingle();
      if (existing && !force_regenerate) {
        const { data: upd, error } = await (admin.from("athena_insights") as any).update(payload).eq("id", existing.id).select().single();
        if (error) { console.error("[athena-insights] update section failed", error); return { insight: null, error: error.message }; }
        upsertedId = upd.id;
      } else {
        const { data: ins, error } = await (admin.from("athena_insights") as any).insert(payload).select().single();
        if (error) { console.error("[athena-insights] insert section failed", error); return { insight: null, error: error.message }; }
        upsertedId = ins.id;
      }
    } else if (type === "at_risk") {
      const { data: ins, error } = await (admin.from("athena_insights") as any).insert(payload).select().single();
      if (error) { console.error("[athena-insights] insert at_risk failed", error); return { insight: null, error: error.message }; }
      upsertedId = ins.id;
    }

    // mappings
    if (upsertedId && (sectionId || questionId)) {
      await (admin.from("athena_insight_mappings") as any).upsert({
        insight_id: upsertedId,
        mission_id: missionId,
        section_id: type !== "daily" ? sectionId : null,
        question_id: type === "at_risk" ? questionId : null,
        scope: type,
      }, { onConflict: "section_id" }).select();
    }

    // notification for at_risk
    if (type === "at_risk" && questionId) {
      const { data: assignment } = await admin.from("mission_assignments").select("assigned_writer_id").eq("question_id", questionId).maybeSingle();
      if (assignment?.assigned_writer_id) {
        await (admin.from("atlas_notifications") as any).insert({
          recipient_id: assignment.assigned_writer_id,
          type: "iris_alert",
          message: `IRIS has new strategic guidance for your at-risk question: ${question?.question_number ?? ""}`,
          mission_id: missionId,
        });
      }
    }

    const { data: full } = await admin.from("athena_insights").select("*").eq("id", upsertedId!).maybeSingle();
    return { insight: full, skipped: false };
  });

export const listMissionInsights = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ missionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("athena_insights")
      .select("*")
      .eq("mission_id", data.missionId)
      .order("is_daily_insight", { ascending: false })
      .order("updated_at", { ascending: false });
    return { insights: rows ?? [] };
  });

export const listMissionSections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ missionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("mission_sections")
      .select("id,section_number,description,order_index")
      .eq("mission_id", data.missionId)
      .order("order_index", { ascending: true });
    return { sections: rows ?? [] };
  });

