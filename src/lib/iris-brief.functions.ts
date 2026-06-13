// IRIS Intelligence Brief — single server fn that returns all six section
// bodies for a (mission, section, question) triple in one AI call.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type BriefBody = {
  whats_asked: string;
  evaluator_intel: string[];
  policy_context: string;
  research_evidence: Array<{ source: string; year?: string; finding: string; source_url?: string | null }>;
  competitive: string;
  iris_recommends: string;
  has_evaluators: boolean;
  has_competitors: boolean;
};

// ---------------------------------------------------------------------------
// Shared formatters for optional Olympus enrichment fields. Return "" when the
// underlying JSON is null/empty so callers can concat without conditionals.
// ---------------------------------------------------------------------------

type StakeholderGroup = {
  matters_most?: string | null;
  frustrations?: string | null;
  success_looks_like?: string | null;
} | null | undefined;

type StakeholderIntel = {
  member?: StakeholderGroup;
  provider?: StakeholderGroup;
  evaluator?: StakeholderGroup;
} | null | undefined;

type ExecutiveEntry = Partial<Record<"why_win" | "why_lose" | "risks" | "proof_points" | "what_matters_most", string>>;
type ExecutiveIntel = Record<string, ExecutiveEntry> | null | undefined;

function formatStakeholderBlock(s: StakeholderIntel): string {
  if (!s) return "";
  const row = (label: string, evaluatorLabels: boolean, g: StakeholderGroup) => {
    if (!g) return null;
    const a = (g.matters_most ?? "").trim();
    const b = (g.frustrations ?? "").trim();
    const c = (g.success_looks_like ?? "").trim();
    if (!a && !b && !c) return null;
    const bLabel = evaluatorLabels ? "what_keeps_awake" : "frustrations";
    return `- ${label}: [matters_most: ${a || "(blank)"}, ${bLabel}: ${b || "(blank)"}, success_looks_like: ${c || "(blank)"}]`;
  };
  const lines = [
    row("Members/Families", false, s.member),
    row("Providers", false, s.provider),
    row("Evaluators", true, s.evaluator),
  ].filter(Boolean) as string[];
  if (lines.length === 0) return "";
  return `=== STAKEHOLDER INTELLIGENCE (captured by capture team — voice of the audience) ===\n${lines.join("\n")}\n\n`;
}

function formatExecutiveBlock(e: ExecutiveIntel): string {
  if (!e) return "";
  const roleLabels: Record<string, string> = {
    executive_sponsor: "Executive Sponsor",
    market_lead: "Market Lead",
    product_clinical_lead: "Product/Clinical Lead",
    operations_lead: "Operations Lead",
    network_lead: "Network Lead",
    bd_lead: "BD Lead",
  };
  const collect = (field: keyof ExecutiveEntry) => {
    const parts: string[] = [];
    for (const [role, entry] of Object.entries(e)) {
      const v = (entry?.[field] ?? "").trim();
      if (!v) continue;
      const label = roleLabels[role] ?? role;
      parts.push(`(${label}) ${v}`);
    }
    return parts;
  };
  const win = collect("why_win");
  const lose = collect("why_lose");
  const risks = collect("risks");
  const proof = collect("proof_points");
  const matters = collect("what_matters_most");
  if (![win, lose, risks, proof, matters].some((a) => a.length)) return "";
  const fmt = (arr: string[]) => (arr.length ? arr.map((s) => `  • ${s}`).join("\n") : "  (none)");
  return `=== EXECUTIVE PERSPECTIVE (aggregated from leadership) ===
- Why we win:
${fmt(win)}
- Why we lose:
${fmt(lose)}
- Key risks:
${fmt(risks)}
- Strongest proof points:
${fmt(proof)}
- What matters most to the evaluator:
${fmt(matters)}

`;
}


export const generateIntelligenceBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    missionId: z.string().uuid(),
    sectionId: z.string().uuid().nullable().optional(),
    questionId: z.string().uuid().nullable().optional(),
  }).parse(d))
  .handler(async ({ data, context }): Promise<BriefBody> => {
    const { supabase } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("IRIS is not configured.");

    // Gather mission-scoped context in parallel.
    const [mission, ws, sg, section, question, stakeholders, competitors, evol, feed, researchNodes, missionCanvasRes, athenaInsightsRes] = await Promise.all([
      supabase.from("missions").select("name,state,agency_name,program_type,client_name").eq("id", data.missionId).maybeSingle(),
      supabase.from("mission_win_strategy").select("win_themes,central_claim,north_star_message,discriminators").eq("mission_id", data.missionId).maybeSingle(),
      supabase.from("mission_style_guide").select("voice_and_tone,political_sensitivities,cultural_sensitivities").eq("mission_id", data.missionId).maybeSingle(),
      data.sectionId
        ? supabase.from("mission_sections").select("section_name,name,description,section_number").eq("id", data.sectionId).maybeSingle()
        : Promise.resolve({ data: null }),
      data.questionId
        ? supabase.from("questions").select("question_text,question_number").eq("id", data.questionId).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from("stakeholder_profiles").select("name,title,organization,stakeholder_type,public_priorities,known_concerns").eq("mission_id", data.missionId),
      supabase.from("competitor_profiles").select("organization_name,competitor_type,likely_narrative,known_weaknesses,differentiation_strategy").eq("mission_id", data.missionId),
      supabase.from("procurement_evolution_records").select("iris_signals,iris_summary").eq("mission_id", data.missionId).maybeSingle(),
      supabase.from("intelligence_feed_items").select("category,headline,source_name,source_url,iris_assessment,iris_relevance_score,published_at").eq("mission_id", data.missionId).gte("iris_relevance_score", 50).order("iris_relevance_score", { ascending: false }).limit(50),
      supabase.from("intelligence_graph_nodes").select("label,description").eq("mission_id", data.missionId).eq("node_type", "research").limit(15),
      supabase.from("missions").select("north_star,why_win,why_lose,biggest_concerns,known_competitors,state_priorities,win_themes_text,reinforce,avoid,stakeholder_intelligence,executive_intelligence").eq("id", data.missionId).maybeSingle(),
      supabase.from("insights").select("insight_type,content,source,confidence,tags").is("mission_id", null).eq("expiry_flag", false).limit(100),
    ]);

    const missionState = (mission?.data as { state?: string | null } | null)?.state ?? null;
    const missionProgram = (mission?.data as { program_type?: string | null } | null)?.program_type ?? null;

    // Second wave: queries that depend on mission state/program.
    const programPattern = missionProgram
      ? `program.ilike.%${missionProgram}%,program.ilike.%CSOC%,program.ilike.%Children%`
      : `program.ilike.%CSOC%,program.ilike.%Children%`;
    const expertsOr = [
      missionState ? `states.cs.{${missionState}}` : null,
      missionProgram ? `programs.cs.{${missionProgram}}` : null,
    ].filter(Boolean).join(",");
    const [stateDnaRes, programDnaRes, decisionsRes, expertsRes] = await Promise.all([
      missionState
        ? supabase.from("state_dna").select("category,attribute,value,source,confidence").eq("state", missionState).limit(200)
        : Promise.resolve({ data: [] as any[] }),
      supabase.from("program_dna").select("category,attribute,value,source,confidence").or(programPattern).limit(200),
      // Q6: decisions scoped to THIS mission, where applies_to_states contains
      // the mission state OR applies_to_states is null (global to all states).
      missionState
        ? supabase.from("mission_decisions").select("title,rationale,status,category,applies_to_states,applies_to_programs").eq("mission_id", data.missionId).or(`applies_to_states.cs.{${missionState}},applies_to_states.is.null`).limit(50)
        : supabase.from("mission_decisions").select("title,rationale,status,category,applies_to_states,applies_to_programs").eq("mission_id", data.missionId).limit(50),

      expertsOr
        ? supabase.from("experts").select("name,role,expertise_areas,states,programs,contact_method,notes").or(expertsOr).limit(50)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const canvas = (missionCanvasRes?.data ?? null) as {
      north_star?: string | null; why_win?: string | null; why_lose?: string | null;
      biggest_concerns?: string | null; known_competitors?: string[] | null;
      state_priorities?: string | null; win_themes_text?: string | null;
      reinforce?: string[] | null; avoid?: string[] | null;
      stakeholder_intelligence?: StakeholderIntel;
      executive_intelligence?: ExecutiveIntel;
    } | null;
    const stakeholderBlock = formatStakeholderBlock(canvas?.stakeholder_intelligence);
    const executiveBlock = formatExecutiveBlock(canvas?.executive_intelligence);
    const insightsRows = (athenaInsightsRes?.data ?? []) as Array<{ insight_type: string; content: string; source: string | null; confidence: string | null; tags: string[] | null }>;
    const stateDnaRows = (stateDnaRes?.data ?? []) as Array<{ category: string; attribute: string; value: string; source: string | null; confidence: string | null }>;
    const programDnaRows = (programDnaRes?.data ?? []) as Array<{ category: string; attribute: string; value: string; source: string | null; confidence: string | null }>;
    const decisionsRows = (decisionsRes?.data ?? []) as Array<{ title: string; rationale: string | null; status: string | null; category: string | null }>;
    const expertsList = (expertsRes?.data ?? []) as Array<{ name: string; role: string | null; expertise_areas: string[] | null; states: string[] | null; programs: string[] | null; contact_method: string | null; notes: string | null }>;

    const groupByCategory = <T extends { category: string; attribute: string; value: string }>(rows: T[]): string => {
      if (rows.length === 0) return "(none)";
      const groups = new Map<string, T[]>();
      for (const r of rows) {
        if (!groups.has(r.category)) groups.set(r.category, []);
        groups.get(r.category)!.push(r);
      }
      return Array.from(groups.entries()).map(([cat, items]) =>
        `  [${cat}]\n${items.map((i) => `    - ${i.attribute}: ${i.value}`).join("\n")}`
      ).join("\n");
    };
    const insightsByType = (type: string) => insightsRows.filter((i) => i.insight_type === type);
    const fmtInsights = (rows: typeof insightsRows) =>
      rows.length === 0 ? "(none)" : rows.map((i) => `    - [${i.confidence ?? "?"}] ${i.content}${i.source ? ` (src: ${i.source})` : ""}`).join("\n");

    const m = mission?.data as { name?: string; state?: string | null; agency_name?: string | null; program_type?: string | null; client_name?: string | null } | null;
    const w = ws?.data as { win_themes?: unknown; central_claim?: string | null; north_star_message?: string | null; discriminators?: string | null } | null;
    const style = sg?.data as { voice_and_tone?: string | null; political_sensitivities?: string | null; cultural_sensitivities?: string | null } | null;
    const sec = section?.data as { section_name?: string | null; name?: string | null; description?: string | null; section_number?: string | null } | null;
    const qn = question?.data as { question_text?: string | null; question_number?: string | null } | null;
    const evaluators = (stakeholders?.data ?? []).filter((s) => s.stakeholder_type === "evaluator" || s.stakeholder_type === "influencer");
    const comps = competitors?.data ?? [];
    const ev = evol?.data as { iris_signals?: string | null; iris_summary?: string | null } | null;
    const items = (feed?.data ?? []) as Array<{ category: string; headline: string; source_name: string | null; source_url: string | null; iris_assessment: string | null; iris_relevance_score: number; published_at: string | null }>;
    const fedItems = items.filter((i) => i.category === "federal_policy").slice(0, 3);
    const stateItems = items.filter((i) => i.category === "state_policy" || i.category === "state_legislative").slice(0, 2);
    const researchItems = items.filter((i) => i.category === "research").slice(0, 4);

    const winThemesArr = Array.isArray(w?.win_themes)
      ? (w?.win_themes as unknown[]).map((x) => typeof x === "string" ? x : (x as { theme?: string; title?: string })?.theme ?? (x as { title?: string })?.title ?? "").filter(Boolean)
      : [];

    const sectionName = sec?.section_name ?? sec?.name ?? "(unspecified section)";
    const sectionDescription = sec?.description ?? "";
    const questionText = qn?.question_text ?? "";

    const system =
      "You are IRIS, a Medicaid procurement intelligence analyst. Return ONLY valid JSON with this exact shape: " +
      `{ "whats_asked": string, "evaluator_intel": string[], "policy_context": string, "research_evidence": [{"source": string, "year": string, "finding": string, "source_url": string|null}], "competitive": string, "iris_recommends": string }. ` +
      "whats_asked: 2-4 plain-language sentences explaining what this section/question is really asking, beyond the literal words. Do not start with 'This section' or 'This question'. " +
      "evaluator_intel: 2-4 short bullet strings of actionable insights based on evaluator priorities/concerns. If no evaluators given, return []. " +
      "policy_context: 2-3 sentences of federal/state policy context driving this requirement. Reference specific policy names when known. " +
      "research_evidence: 2-4 entries citing real studies/reports with source name, approximate year, and a concise finding. Set source_url if you got the item from the provided feed items. " +
      "competitive: 2-3 sentences on how to differentiate from likely competitors. Empty string if no competitor data. " +
      "iris_recommends: The single most useful, direct, specific strategic recommendation for the writer. Reference win strategy, evaluator priority, and the strongest research. Do not hedge. 3-5 sentences.";

    const canvasBlock = canvas && (canvas.north_star || canvas.why_win || canvas.why_lose || canvas.biggest_concerns || (canvas.known_competitors?.length) || canvas.state_priorities || canvas.win_themes_text || (canvas.reinforce?.length) || (canvas.avoid?.length))
      ? `=== MISSION CANVAS (HIGHEST PRIORITY — captured by the capture team for THIS mission) ===
- North Star: ${canvas.north_star ?? "(none)"}
- Why we win: ${canvas.why_win ?? "(none)"}
- Why we lose: ${canvas.why_lose ?? "(none)"}
- Biggest concerns: ${canvas.biggest_concerns ?? "(none)"}
- Known competitors: ${(canvas.known_competitors ?? []).join(", ") || "(none)"}
- State priorities: ${canvas.state_priorities ?? "(none)"}
- Win themes (capture team): ${canvas.win_themes_text ?? "(none)"}
- Reinforce: ${(canvas.reinforce ?? []).join(" | ") || "(none)"}
- Avoid: ${(canvas.avoid ?? []).join(" | ") || "(none)"}

`
      : "";

    const user = `${canvasBlock}${stakeholderBlock}${executiveBlock}Mission: ${m?.name ?? ""} | Client: ${m?.client_name ?? ""} | State: ${m?.state ?? ""} | Agency: ${m?.agency_name ?? ""} | Program: ${m?.program_type ?? ""}
Section ${sec?.section_number ?? ""}: ${sectionName}${sectionDescription ? ` — ${sectionDescription}` : ""}
${qn ? `Question ${qn.question_number ?? ""}: ${questionText}` : ""}

=== STATE DNA (${missionState ?? "unknown state"}) — procurement, political, stakeholder, regulatory, historical, cultural ===
${groupByCategory(stateDnaRows)}

=== PROGRAM DNA (matched to program_type / CSOC / Children) ===
${groupByCategory(programDnaRows)}

=== ATHENA GLOBAL INSIGHTS (apply across missions) ===
  Win patterns:
${fmtInsights(insightsByType("win_pattern"))}
  Loss lessons:
${fmtInsights(insightsByType("loss_lesson"))}
  Competitive intel:
${fmtInsights(insightsByType("competitive_intel"))}
  Other:
${fmtInsights(insightsRows.filter((i) => !["win_pattern","loss_lesson","competitive_intel"].includes(i.insight_type)))}

=== PRIOR DECISIONS APPLICABLE TO THIS STATE ===
${decisionsRows.length === 0 ? "(none)" : decisionsRows.map((d) => `- [${d.category ?? "general"}] ${d.title}${d.status ? ` (${d.status})` : ""}${d.rationale ? ` — ${d.rationale}` : ""}`).join("\n")}

=== EXPERTS (matched on state/program) ===
${expertsList.length === 0 ? "(none)" : expertsList.map((e) => `- ${e.name}${e.role ? `, ${e.role}` : ""} | expertise=${(e.expertise_areas ?? []).join("/") || "?"} | states=${(e.states ?? []).join("/") || "?"} | programs=${(e.programs ?? []).join("/") || "?"}${e.contact_method ? ` | contact=${e.contact_method}` : ""}`).join("\n")}


Win Strategy:
- Central Claim: ${w?.central_claim ?? ""}
- North Star: ${w?.north_star_message ?? ""}
- Discriminators: ${w?.discriminators ?? ""}
- Win Themes: ${winThemesArr.join(" | ") || "(none)"}

Style Guide:
- Voice/Tone: ${style?.voice_and_tone ?? ""}
- Political sensitivities: ${style?.political_sensitivities ?? ""}
- Cultural sensitivities: ${style?.cultural_sensitivities ?? ""}

Procurement Evolution signals: ${ev?.iris_signals ?? ev?.iris_summary ?? "(none)"}

Evaluators / Influencers:
${evaluators.length === 0 ? "(none)" : evaluators.map((e) => `- ${e.name}${e.title ? `, ${e.title}` : ""}${e.organization ? ` (${e.organization})` : ""} | type=${e.stakeholder_type} | priorities=${e.public_priorities ?? "?"} | concerns=${e.known_concerns ?? "?"}`).join("\n")}

Competitors:
${comps.length === 0 ? "(none)" : comps.map((c) => `- ${c.organization_name} | type=${c.competitor_type} | narrative=${c.likely_narrative ?? "?"} | weaknesses=${c.known_weaknesses ?? "?"}`).join("\n")}

Recent federal policy items:
${fedItems.map((i) => `- ${i.headline} (${i.source_name ?? "?"}): ${i.iris_assessment ?? ""} [url:${i.source_url ?? ""}]`).join("\n") || "(none)"}

Recent state policy items:
${stateItems.map((i) => `- ${i.headline} (${i.source_name ?? "?"}): ${i.iris_assessment ?? ""} [url:${i.source_url ?? ""}]`).join("\n") || "(none)"}

Recent research items:
${researchItems.map((i) => `- ${i.headline} (${i.source_name ?? "?"}, ${i.published_at?.slice(0, 4) ?? "?"}): ${i.iris_assessment ?? ""} [url:${i.source_url ?? ""}]`).join("\n") || "(none)"}

Research graph nodes:
${(researchNodes?.data ?? []).map((n) => `- ${n.label}${n.description ? `: ${n.description}` : ""}`).join("\n") || "(none)"}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        response_format: { type: "json_object" },
        max_tokens: 2000,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (res.status === 402) throw new Error("Workspace is out of AI credits.");
    if (res.status === 429) throw new Error("IRIS is rate limited. Try again shortly.");
    if (!res.ok) throw new Error(`IRIS gateway returned ${res.status}.`);

    const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = j.choices?.[0]?.message?.content ?? "";
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("IRIS returned a malformed response.");
    const parsed = JSON.parse(match[0]) as Partial<BriefBody>;

    return {
      whats_asked: String(parsed.whats_asked ?? ""),
      evaluator_intel: Array.isArray(parsed.evaluator_intel) ? parsed.evaluator_intel.map(String) : [],
      policy_context: String(parsed.policy_context ?? ""),
      research_evidence: Array.isArray(parsed.research_evidence)
        ? parsed.research_evidence.map((r) => {
            const rec = r as { source?: string; year?: string; finding?: string; source_url?: string | null };
            return {
              source: String(rec.source ?? ""),
              year: rec.year ? String(rec.year) : undefined,
              finding: String(rec.finding ?? ""),
              source_url: rec.source_url ?? null,
            };
          })
        : [],
      competitive: String(parsed.competitive ?? ""),
      iris_recommends: String(parsed.iris_recommends ?? ""),
      has_evaluators: evaluators.length > 0,
      has_competitors: comps.length > 0,
    };
  });

// ============================================================================
// Question Brief — IRIS-generated per-question brief for Flight Deck threads.
// Persisted to public.question_briefs (additive, does not affect mission brief).
// ============================================================================

export type QuestionBriefBody = {
  what_they_really_asking: string;
  why_it_matters: string;
  evaluator_perspective: string;
  member_perspective: string;
  provider_perspective: string;
  key_messages_to_reinforce: string[];
  things_to_avoid: string[];
  proof_points: string[];
  suggested_smes: string[];
};

export const generateQuestionBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    missionId: z.string().uuid(),
    questionId: z.string().uuid().nullable().optional(),
    threadId: z.string().uuid().nullable().optional(),
    questionText: z.string().min(3),
    persist: z.boolean().optional().default(true),
  }).parse(d))
  .handler(async ({ data, context }): Promise<QuestionBriefBody & { id?: string }> => {
    const { supabase } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("IRIS is not configured.");

    // Mission + canvas fields (single row from missions).
    const { data: missionRow } = await supabase
      .from("missions")
      .select("name,state,agency_name,program_type,client_name,north_star,why_win,why_lose,biggest_concerns,known_competitors,state_priorities,win_themes_text,reinforce,avoid,stakeholder_intelligence,executive_intelligence")
      .eq("id", data.missionId)
      .maybeSingle();
    const m = (missionRow ?? {}) as {
      name?: string | null; state?: string | null; agency_name?: string | null;
      program_type?: string | null; client_name?: string | null;
      north_star?: string | null; why_win?: string | null; why_lose?: string | null;
      biggest_concerns?: string | null; known_competitors?: string[] | null;
      state_priorities?: string | null; win_themes_text?: string | null;
      reinforce?: string[] | null; avoid?: string[] | null;
      stakeholder_intelligence?: StakeholderIntel;
      executive_intelligence?: ExecutiveIntel;
    };
    const stakeholderBlock = formatStakeholderBlock(m.stakeholder_intelligence);
    const executiveBlock = formatExecutiveBlock(m.executive_intelligence);
    const missionState = m.state ?? null;
    const missionProgram = m.program_type ?? null;

    // Parallel context fetches.
    const programPattern = missionProgram
      ? `program.ilike.%${missionProgram}%,program.ilike.%CSOC%,program.ilike.%Children%`
      : `program.ilike.%CSOC%,program.ilike.%Children%`;
    const [approvedBriefRes, stateDnaRes, programDnaRes, insightsRes, expertsRes] = await Promise.all([
      supabase.from("iris_brief_cache")
        .select("brief_text,generated_at")
        .eq("scope", "mission")
        .eq("ref_id", data.missionId)
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      missionState
        ? supabase.from("state_dna").select("category,attribute,value,source,confidence").eq("state", missionState).limit(200)
        : Promise.resolve({ data: [] as any[] }),
      supabase.from("program_dna").select("category,attribute,value,source,confidence").or(programPattern).limit(200),
      supabase.from("insights").select("insight_type,content,source,confidence,tags").is("mission_id", null).eq("expiry_flag", false).limit(100),
      missionState
        ? supabase.from("experts").select("name,role,expertise_areas,states,programs,contact_method,notes").contains("states", [missionState]).limit(50)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const approvedBrief = (approvedBriefRes?.data as { brief_text?: string | null } | null)?.brief_text ?? "";
    const stateDnaRows = (stateDnaRes?.data ?? []) as Array<{ category: string; attribute: string; value: string }>;
    const programDnaRows = (programDnaRes?.data ?? []) as Array<{ category: string; attribute: string; value: string }>;
    const insightsRows = (insightsRes?.data ?? []) as Array<{ insight_type: string; content: string; source: string | null; confidence: string | null }>;
    const expertsList = (expertsRes?.data ?? []) as Array<{ name: string; role: string | null; expertise_areas: string[] | null; states: string[] | null; programs: string[] | null; contact_method: string | null }>;

    const groupByCategory = <T extends { category: string; attribute: string; value: string }>(rows: T[]): string => {
      if (rows.length === 0) return "(none)";
      const groups = new Map<string, T[]>();
      for (const r of rows) {
        if (!groups.has(r.category)) groups.set(r.category, []);
        groups.get(r.category)!.push(r);
      }
      return Array.from(groups.entries()).map(([cat, items]) =>
        `  [${cat}]\n${items.map((i) => `    - ${i.attribute}: ${i.value}`).join("\n")}`
      ).join("\n");
    };

    const canvasBlock = `=== MISSION CANVAS (HIGHEST PRIORITY) ===
- North Star: ${m.north_star ?? "(none)"}
- Why we win: ${m.why_win ?? "(none)"}
- Why we lose: ${m.why_lose ?? "(none)"}
- Biggest concerns: ${m.biggest_concerns ?? "(none)"}
- Known competitors: ${(m.known_competitors ?? []).join(", ") || "(none)"}
- State priorities: ${m.state_priorities ?? "(none)"}
- Win themes: ${m.win_themes_text ?? "(none)"}
- Reinforce: ${(m.reinforce ?? []).join(" | ") || "(none)"}
- Avoid: ${(m.avoid ?? []).join(" | ") || "(none)"}`;

    const system =
      "You are IRIS, a Medicaid procurement intelligence analyst. Generate a per-question brief for a proposal writer. " +
      "Return ONLY valid JSON with this exact shape: " +
      `{ "what_they_really_asking": string, "why_it_matters": string, "evaluator_perspective": string, "member_perspective": string, "provider_perspective": string, "key_messages_to_reinforce": string[], "things_to_avoid": string[], "proof_points": string[], "suggested_smes": string[] }. ` +
      "Be specific to THIS question and mission — no boilerplate. Each text field is 2-4 sentences. Arrays contain 3-6 short, concrete items. Reference state and program specifics by name. Pull directly from the Mission Canvas and the approved Mission Brief when relevant.";

    const user = `${canvasBlock}

=== APPROVED MISSION BRIEF (synthesized — primary context) ===
${approvedBrief || "(not yet generated)"}

Mission: ${m.name ?? ""} | Client: ${m.client_name ?? ""} | State: ${missionState ?? ""} | Agency: ${m.agency_name ?? ""} | Program: ${missionProgram ?? ""}

=== QUESTION (this is the question to brief) ===
${data.questionText}

=== STATE DNA (${missionState ?? "unknown"}) ===
${groupByCategory(stateDnaRows)}

=== PROGRAM DNA ===
${groupByCategory(programDnaRows)}

=== GLOBAL INSIGHTS (Athena cross-mission) ===
${insightsRows.length === 0 ? "(none)" : insightsRows.map((i) => `- [${i.insight_type}/${i.confidence ?? "?"}] ${i.content}${i.source ? ` (src: ${i.source})` : ""}`).join("\n")}

=== EXPERTS available for this state ===
${expertsList.length === 0 ? "(none)" : expertsList.map((e) => `- ${e.name}${e.role ? `, ${e.role}` : ""} | expertise=${(e.expertise_areas ?? []).join("/") || "?"} | programs=${(e.programs ?? []).join("/") || "?"}${e.contact_method ? ` | contact=${e.contact_method}` : ""}`).join("\n")}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        response_format: { type: "json_object" },
        max_tokens: 2200,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (res.status === 402) throw new Error("Workspace is out of AI credits.");
    if (res.status === 429) throw new Error("IRIS is rate limited. Try again shortly.");
    if (!res.ok) throw new Error(`IRIS gateway returned ${res.status}.`);

    const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = j.choices?.[0]?.message?.content ?? "";
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("IRIS returned a malformed response.");
    const parsed = JSON.parse(match[0]) as Partial<QuestionBriefBody>;

    const asArr = (v: unknown): string[] => Array.isArray(v) ? v.map(String).filter(Boolean) : [];
    const body: QuestionBriefBody = {
      what_they_really_asking: String(parsed.what_they_really_asking ?? ""),
      why_it_matters: String(parsed.why_it_matters ?? ""),
      evaluator_perspective: String(parsed.evaluator_perspective ?? ""),
      member_perspective: String(parsed.member_perspective ?? ""),
      provider_perspective: String(parsed.provider_perspective ?? ""),
      key_messages_to_reinforce: asArr(parsed.key_messages_to_reinforce),
      things_to_avoid: asArr(parsed.things_to_avoid),
      proof_points: asArr(parsed.proof_points),
      suggested_smes: asArr(parsed.suggested_smes),
    };

    let insertedId: string | undefined;
    if (data.persist) {
      const { data: row, error } = await supabase
        .from("question_briefs")
        .insert({
          mission_id: data.missionId,
          question_id: data.questionId ?? null,
          thread_id: data.threadId ?? null,
          ...body,
          generated_by_iris: true,
          status: "draft",
        })
        .select("id")
        .single();
      if (error) {
        // Don't fail the brief generation if persistence fails; surface in logs.
        console.error("question_briefs insert failed:", error.message);
      } else {
        insertedId = (row as { id: string }).id;
      }
    }

    return { ...body, id: insertedId };
  });

