/**
 * Shared IRIS mission context builder.
 *
 * Every IRIS generation function (brief, AssistBar, Writer's Block,
 * mission moments, daily focus) calls this once to assemble the full
 * intel picture for a mission. Runs all queries in parallel, fails
 * soft per query, caches per (missionId, questionId, includeDocs)
 * for 5 minutes in memory.
 *
 * Pass a supabase client (RLS-scoped from requireSupabaseAuth or
 * supabaseAdmin for cron) — the builder never creates one itself.
 */

export type MissionContext = {
  mission: { id: string; name: string | null; state: string | null; programType: string | null; clientName: string | null; agencyName: string | null; submissionDeadline: string | null };
  // Oracle
  northStar: string;
  centralClaim: string;
  winThemes: string[];
  topRisks: string[];
  discriminators: string[];
  proofPoints: string[];
  evaluatorPriorities: string[];
  oecCompetitors: string[];
  oecStakeholders: string[];
  // Intelligence
  graphNodes: { label: string; description: string; nodeType: string; confidence: string }[];
  recentSignals: { eventType: string; title: string; summary: string; source: string }[];
  feedItems: { headline: string; summary: string; relevance: number | null }[];
  // People & orgs
  organizations: { name: string; type: string; incumbency: string; strengths: string[]; weaknesses: string[]; notes: string }[];
  people: { name: string; title: string; org: string; influence: string; priorities: string[]; notes: string }[];
  competitors: { name: string; type: string; strengths: string; weaknesses: string; narrative: string; differentiation: string }[];
  stakeholders: { name: string; title: string; org: string; priorities: string; concerns: string; relationship: string }[];
  // RFP structure
  sections: { number: string; name: string; description: string; weight: number | null }[];
  confirmedExtractions: { field: string; value: string }[];
  // State Intelligence Pack (per-state library, auto-attached by mission state)
  stateIntel: { category: string; title: string; description: string; effectiveDate: string | null }[];
  // Optional
  question?: { number: string; text: string; decodedIntent: string; weight: string; wordLimit: number | null; pageLimit: number | null; evaluationCriteria: string; sectionId: string | null };
  documentExcerpts?: { filename: string; type: string; excerpt: string }[];
  // Build telemetry
  _buildMs: number;
  _errors: string[];
};

// Human-readable category labels for the State Intelligence Pack.
const STATE_INTEL_LABEL: Record<string, string> = {
  waivers_authorities: "Waivers & Authorities",
  state_plan_amendments: "State Plan & Amendments",
  managed_care_landscape: "Managed Care Landscape",
  quality_strategy: "Quality Strategy",
  directed_payments: "Directed Payments & SDPs",
  core_set_performance: "Core Set Performance",
  legislative_budget: "Legislative & Budget",
  rate_setting: "Rate Setting",
  eligibility_enrollment: "Eligibility & Enrollment",
  workforce_network: "Workforce & Provider Network",
  demographics_health: "Demographics & Health Status",
  litigation_compliance: "Litigation & Compliance",
};

type SB = {
  from: (t: string) => any;
};

// ---- Simple in-process TTL cache (5 minutes) ---------------------------------
const CACHE = new Map<string, { at: number; value: MissionContext }>();
const TTL_MS = 5 * 60_000;
const cacheKey = (missionId: string, questionId?: string, includeDocs?: boolean) =>
  `${missionId}|${questionId ?? "-"}|${includeDocs ? "d" : "-"}`;

function arr(v: unknown): any[] { return Array.isArray(v) ? v : []; }
function strArr(v: unknown): string[] {
  return arr(v).map((x) => {
    if (typeof x === "string") return x;
    if (x && typeof x === "object") {
      const o = x as Record<string, unknown>;
      return String(o.title ?? o.theme ?? o.text ?? o.name ?? o.label ?? JSON.stringify(o));
    }
    return String(x);
  }).filter(Boolean);
}
function s(v: unknown): string { return v == null ? "" : String(v); }

async function safe<T>(label: string, errors: string[], p: Promise<T>, fallback: T): Promise<T> {
  try { return await p; } catch (e) {
    errors.push(`${label}: ${(e as Error).message ?? "error"}`);
    return fallback;
  }
}

export async function buildMissionContext(
  supabase: SB,
  missionId: string,
  options?: { includeDocumentText?: boolean; questionId?: string },
): Promise<MissionContext> {
  const key = cacheKey(missionId, options?.questionId, options?.includeDocumentText);
  const hit = CACHE.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const t0 = Date.now();
  const errors: string[] = [];
  const empty = { data: null as any };
  const emptyList = { data: [] as any[] };

  const [
    mRes, oecRes, nodesRes, eventsRes, orgsRes, peopleRes,
    compRes, stakeRes, secRes, feedRes, extRes,
    qRes, docRes,
  ] = await Promise.all([
    safe("missions", errors, supabase.from("missions")
      .select("id, name, state, program_type, client_name, agency_name, submission_deadline")
      .eq("id", missionId).maybeSingle(), empty),
    safe("oracle_engagement_config", errors, supabase.from("oracle_engagement_config")
      .select("north_star, central_claim, win_themes, top_risks, discriminators, proof_points, competitors, evaluator_priorities, stakeholders")
      .eq("mission_id", missionId).maybeSingle(), empty),
    safe("intelligence_graph_nodes", errors, supabase.from("intelligence_graph_nodes")
      .select("label, description, node_type, confidence_level")
      .eq("mission_id", missionId).eq("is_active", true)
      .order("created_at", { ascending: false }).limit(30), emptyList),
    safe("intel_events", errors, supabase.from("intel_events")
      .select("event_type, title, content, extracted_summary, source_title, source_url, confidence_score, relevance_score, created_at")
      .eq("mission_id", missionId)
      .order("created_at", { ascending: false }).limit(20), emptyList),
    // intel_organizations name lives in intel_entities — join for label.
    safe("intel_organizations", errors, supabase.from("intel_organizations")
      .select("org_type, incumbency_status, known_strengths, known_weaknesses, notes, intel_entities:entity_id(name)")
      .eq("mission_id", missionId).limit(15), emptyList),
    safe("intel_people", errors, supabase.from("intel_people")
      .select("name, title, organization, influence_level, role_type, known_priorities, notes")
      .eq("mission_id", missionId).limit(10), emptyList),
    safe("competitor_profiles", errors, supabase.from("competitor_profiles")
      .select("organization_name, competitor_type, known_strengths, known_weaknesses, likely_narrative, differentiation_strategy, recent_intelligence")
      .eq("mission_id", missionId), emptyList),
    safe("stakeholder_profiles", errors, supabase.from("stakeholder_profiles")
      .select("name, title, organization, public_priorities, known_concerns, relationship_to_athena")
      .eq("mission_id", missionId), emptyList),
    safe("mission_sections", errors, supabase.from("mission_sections")
      .select("section_number, name, description, evaluation_weight")
      .eq("mission_id", missionId)
      .order("section_number", { ascending: true }).limit(24), emptyList),
    safe("intelligence_feed_items", errors, supabase.from("intelligence_feed_items")
      .select("headline, summary, source_url, iris_relevance_score, published_at")
      .eq("mission_id", missionId).eq("is_dismissed", false)
      .order("iris_relevance_score", { ascending: false }).limit(10), emptyList),
    safe("mission_iris_extractions", errors, supabase.from("mission_iris_extractions")
      .select("extracted_field, extracted_value, user_override_value, confidence_score")
      .eq("mission_id", missionId).eq("confirmed_by_user", true)
      .order("confidence_score", { ascending: false }).limit(20), emptyList),
    options?.questionId
      ? safe("mission_questions", errors, supabase.from("mission_questions")
          .select("question_number, question_text, iris_decoded_intent, evaluation_weight, point_value, word_limit, page_limit, evaluation_criteria, section_id")
          .eq("id", options.questionId).maybeSingle(), empty)
      : Promise.resolve(empty),
    options?.includeDocumentText
      ? safe("mission_documents", errors, supabase.from("mission_documents")
          .select("title, document_type, content_summary")
          .eq("mission_id", missionId)
          .not("content_summary", "is", null)
          .limit(3), emptyList)
      : Promise.resolve(emptyList),
  ]);

  const m = (mRes.data ?? {}) as any;
  const oec = (oecRes.data ?? {}) as any;
  const q = (qRes.data ?? {}) as any;

  const ctx: MissionContext = {
    mission: {
      id: missionId,
      name: m.name ?? null,
      state: m.state ?? null,
      programType: m.program_type ?? null,
      clientName: m.client_name ?? null,
      agencyName: m.agency_name ?? null,
      submissionDeadline: m.submission_deadline ?? null,
    },
    northStar: s(oec.north_star),
    centralClaim: s(oec.central_claim),
    winThemes: strArr(oec.win_themes),
    topRisks: strArr(oec.top_risks),
    discriminators: strArr(oec.discriminators),
    proofPoints: strArr(oec.proof_points),
    evaluatorPriorities: strArr(oec.evaluator_priorities),
    oecCompetitors: strArr(oec.competitors),
    oecStakeholders: strArr(oec.stakeholders),
    graphNodes: (nodesRes.data ?? []).map((r: any) => ({
      label: s(r.label), description: s(r.description),
      nodeType: s(r.node_type), confidence: s(r.confidence_level),
    })).filter((n) => n.label || n.description),
    recentSignals: (eventsRes.data ?? []).map((r: any) => ({
      eventType: s(r.event_type),
      title: s(r.title),
      summary: s(r.extracted_summary || r.content).slice(0, 240),
      source: s(r.source_title || r.source_url),
    })).filter((e) => e.title || e.summary),
    feedItems: (feedRes.data ?? []).map((r: any) => ({
      headline: s(r.headline), summary: s(r.summary).slice(0, 240),
      relevance: typeof r.iris_relevance_score === "number" ? r.iris_relevance_score : null,
    })).filter((f) => f.headline),
    organizations: (orgsRes.data ?? []).map((r: any) => ({
      name: s(r.intel_entities?.name),
      type: s(r.org_type),
      incumbency: s(r.incumbency_status),
      strengths: strArr(r.known_strengths),
      weaknesses: strArr(r.known_weaknesses),
      notes: s(r.notes),
    })).filter((o) => o.name),
    people: (peopleRes.data ?? []).map((r: any) => ({
      name: s(r.name), title: s(r.title), org: s(r.organization),
      influence: s(r.influence_level),
      priorities: strArr(r.known_priorities),
      notes: s(r.notes),
    })).filter((p) => p.name),
    competitors: (compRes.data ?? []).map((r: any) => ({
      name: s(r.organization_name),
      type: s(r.competitor_type),
      strengths: s(r.known_strengths),
      weaknesses: s(r.known_weaknesses),
      narrative: s(r.likely_narrative),
      differentiation: s(r.differentiation_strategy),
    })).filter((c) => c.name),
    stakeholders: (stakeRes.data ?? []).map((r: any) => ({
      name: s(r.name), title: s(r.title), org: s(r.organization),
      priorities: s(r.public_priorities),
      concerns: s(r.known_concerns),
      relationship: s(r.relationship_to_athena),
    })).filter((s2) => s2.name),
    sections: (secRes.data ?? []).map((r: any) => ({
      number: s(r.section_number), name: s(r.name),
      description: s(r.description),
      weight: typeof r.evaluation_weight === "number" ? r.evaluation_weight : null,
    })).filter((sec) => sec.name || sec.number),
    confirmedExtractions: (extRes.data ?? []).map((r: any) => ({
      field: s(r.extracted_field),
      value: s(r.user_override_value || r.extracted_value),
    })).filter((e) => e.field && e.value),
    _buildMs: 0,
    _errors: errors,
  };

  if (options?.questionId && q && Object.keys(q).length) {
    ctx.question = {
      number: s(q.question_number),
      text: s(q.question_text),
      decodedIntent: s(q.iris_decoded_intent),
      weight: s(q.evaluation_weight ?? q.point_value ?? ""),
      wordLimit: typeof q.word_limit === "number" ? q.word_limit : null,
      pageLimit: typeof q.page_limit === "number" ? q.page_limit : null,
      evaluationCriteria: s(q.evaluation_criteria),
      sectionId: q.section_id ?? null,
    };
  }
  if (options?.includeDocumentText) {
    ctx.documentExcerpts = (docRes.data ?? []).map((r: any) => ({
      filename: s(r.title),
      type: s(r.document_type),
      excerpt: s(r.content_summary).slice(0, 3000),
    })).filter((d) => d.excerpt);
  }

  ctx._buildMs = Date.now() - t0;
  CACHE.set(key, { at: Date.now(), value: ctx });
  return ctx;
}

// =============================================================================
// Serializer
// =============================================================================

const MAX_LEN = 4000;

type Focus = "strategic" | "competitive" | "stakeholder" | "question" | "full";

function section(title: string, body: string): string {
  const b = body.trim();
  if (!b) return "";
  return `=== ${title} ===\n${b}\n\n`;
}

function list(lines: (string | undefined | null)[], max = 10): string {
  return lines.filter((l): l is string => !!l && l.trim().length > 0)
    .slice(0, max).map((l, i) => `${i + 1}. ${l}`).join("\n");
}

function fitWithin(blocks: { name: string; body: string; priority: number }[], limit: number): { out: string; dropped: string[] } {
  // Always keep priority 1 sections; drop higher priority numbers first when over limit.
  const ordered = [...blocks].sort((a, b) => a.priority - b.priority);
  let out = "";
  const kept: string[] = [];
  const dropped: string[] = [];
  for (const b of ordered) {
    if (!b.body) continue;
    if (out.length + b.body.length <= limit) {
      out += b.body;
      kept.push(b.name);
    } else {
      // Try to truncate medium-priority blocks
      if (b.priority <= 2) {
        const remaining = limit - out.length - 40;
        if (remaining > 200) {
          out += b.body.slice(0, remaining) + "…\n\n";
          kept.push(`${b.name} (truncated)`);
          continue;
        }
      }
      dropped.push(b.name);
    }
  }
  return { out: out.trim(), dropped };
}

export function serializeContextForPrompt(ctx: MissionContext, focus: Focus): string {
  const blocks: { name: string; body: string; priority: number }[] = [];

  // Always: mission header
  blocks.push({
    name: "mission",
    priority: 1,
    body: section("MISSION",
      `${ctx.mission.name ?? "—"} (${ctx.mission.state ?? "—"}, ${ctx.mission.programType ?? "—"})\n` +
      `Client: ${ctx.mission.clientName ?? "—"} · Agency: ${ctx.mission.agencyName ?? "—"}` +
      (ctx.mission.submissionDeadline ? `\nSubmission: ${ctx.mission.submissionDeadline}` : "")),
  });

  // Strategic core — almost always wanted
  if (ctx.northStar) blocks.push({ name: "north_star", priority: 1, body: section("NORTH STAR", ctx.northStar) });
  if (ctx.centralClaim) blocks.push({ name: "central_claim", priority: 1, body: section("CENTRAL CLAIM", ctx.centralClaim) });
  if (ctx.winThemes.length) blocks.push({ name: "win_themes", priority: 1, body: section("WIN THEMES", list(ctx.winThemes)) });

  // Question context — top priority when present
  if (ctx.question) {
    const q = ctx.question;
    blocks.push({
      name: "question",
      priority: 1,
      body: section("QUESTION",
        `${q.number}: ${q.text}\n` +
        `Decoded intent: ${q.decodedIntent || "(none)"}\n` +
        `Weight: ${q.weight || "—"} · Word limit: ${q.wordLimit ?? "—"} · Page limit: ${q.pageLimit ?? "—"}` +
        (q.evaluationCriteria ? `\nEval criteria: ${q.evaluationCriteria}` : "")),
    });
  }

  if (focus === "question" || focus === "strategic" || focus === "full") {
    if (ctx.discriminators.length) blocks.push({ name: "discriminators", priority: 2, body: section("DISCRIMINATORS", list(ctx.discriminators)) });
    if (ctx.proofPoints.length) blocks.push({ name: "proof_points", priority: 2, body: section("PROOF POINTS", list(ctx.proofPoints)) });
    if (ctx.evaluatorPriorities.length) blocks.push({ name: "evaluator_priorities", priority: 2, body: section("EVALUATOR PRIORITIES", list(ctx.evaluatorPriorities)) });
    if (ctx.topRisks.length) blocks.push({ name: "top_risks", priority: 2, body: section("TOP RISKS", list(ctx.topRisks)) });
    if (ctx.graphNodes.length) {
      const nodes = ctx.graphNodes.slice(0, focus === "question" ? 5 : 10)
        .map((n) => `[${n.nodeType || "node"}] ${n.label}${n.description ? ` — ${n.description.slice(0, 200)}` : ""}`);
      blocks.push({ name: "graph_nodes", priority: 2, body: section("KEY INTELLIGENCE (IRIS graph)", nodes.join("\n")) });
    }
    if (ctx.confirmedExtractions.length) {
      const lines = ctx.confirmedExtractions.slice(0, 10).map((e) => `${e.field}: ${e.value}`);
      blocks.push({ name: "extractions", priority: 3, body: section("CONFIRMED RFP FACTS", lines.join("\n")) });
    }
  }

  if (focus === "competitive" || focus === "full") {
    if (ctx.competitors.length) {
      const lines = ctx.competitors.slice(0, 8).map((c) =>
        `${c.name}${c.type ? ` (${c.type})` : ""}:` +
        (c.strengths ? `\n  Strengths: ${c.strengths}` : "") +
        (c.weaknesses ? `\n  Weaknesses: ${c.weaknesses}` : "") +
        (c.narrative ? `\n  Likely narrative: ${c.narrative}` : "") +
        (c.differentiation ? `\n  Differentiation: ${c.differentiation}` : ""));
      blocks.push({ name: "competitors", priority: 1, body: section("COMPETITIVE LANDSCAPE", lines.join("\n")) });
    }
    if (ctx.organizations.length) {
      const lines = ctx.organizations.slice(0, 10).map((o) =>
        `${o.name} (${o.type || "org"}${o.incumbency ? ` · ${o.incumbency}` : ""})` +
        (o.strengths.length ? ` · strengths: ${o.strengths.join(", ")}` : "") +
        (o.weaknesses.length ? ` · weaknesses: ${o.weaknesses.join(", ")}` : "") +
        (o.notes ? ` · ${o.notes.slice(0, 120)}` : ""));
      blocks.push({ name: "organizations", priority: 2, body: section("ORGANIZATIONS", lines.join("\n")) });
    }
    // Competitive signals from recent intel
    const compSignals = ctx.recentSignals.filter((e) => /competit|incumb|protest|award/i.test(`${e.eventType} ${e.title}`)).slice(0, 5);
    if (compSignals.length) {
      blocks.push({ name: "competitive_signals", priority: 2, body: section("RECENT COMPETITIVE SIGNALS",
        compSignals.map((e) => `[${e.eventType}] ${e.title}${e.summary ? `: ${e.summary}` : ""}`).join("\n")) });
    }
  }

  if (focus === "stakeholder" || focus === "full") {
    if (ctx.people.length) {
      const lines = ctx.people.slice(0, 10).map((p) =>
        `${p.name}${p.title ? `, ${p.title}` : ""}${p.org ? ` @ ${p.org}` : ""}` +
        (p.influence ? ` · influence: ${p.influence}` : "") +
        (p.priorities.length ? `\n  Priorities: ${p.priorities.join(", ")}` : "") +
        (p.notes ? `\n  ${p.notes.slice(0, 160)}` : ""));
      blocks.push({ name: "people", priority: 1, body: section("KEY PEOPLE", lines.join("\n")) });
    }
    if (ctx.stakeholders.length) {
      const lines = ctx.stakeholders.slice(0, 8).map((s2) =>
        `${s2.name}${s2.title ? `, ${s2.title}` : ""}${s2.org ? ` (${s2.org})` : ""}` +
        (s2.priorities ? `\n  Priorities: ${s2.priorities}` : "") +
        (s2.concerns ? `\n  Concerns: ${s2.concerns}` : "") +
        (s2.relationship ? `\n  Relationship: ${s2.relationship}` : ""));
      blocks.push({ name: "stakeholders", priority: 1, body: section("STAKEHOLDERS", lines.join("\n")) });
    }
    if (ctx.organizations.length && focus === "stakeholder") {
      const lines = ctx.organizations.slice(0, 8).map((o) =>
        `${o.name} (${o.type || "org"})${o.notes ? ` — ${o.notes.slice(0, 120)}` : ""}`);
      blocks.push({ name: "organizations", priority: 2, body: section("RELATED ORGANIZATIONS", lines.join("\n")) });
    }
  }

  if (focus === "full" || focus === "question") {
    if (ctx.sections.length) {
      const lines = ctx.sections.slice(0, focus === "full" ? 24 : 8).map((sec) =>
        `${sec.number} ${sec.name}${sec.weight != null ? ` (${sec.weight}%)` : ""}${sec.description ? `: ${sec.description.slice(0, 140)}` : ""}`);
      blocks.push({ name: "sections", priority: 3, body: section("RFP STRUCTURE", lines.join("\n")) });
    }
  }

  if (focus === "full") {
    if (ctx.recentSignals.length) {
      const lines = ctx.recentSignals.slice(0, 8).map((e) =>
        `[${e.eventType}] ${e.title}${e.summary ? `: ${e.summary}` : ""}`);
      blocks.push({ name: "recent_signals", priority: 2, body: section("RECENT SIGNALS", lines.join("\n")) });
    }
    if (ctx.feedItems.length) {
      const lines = ctx.feedItems.slice(0, 5).map((f) => `• ${f.headline}${f.summary ? ` — ${f.summary}` : ""}`);
      blocks.push({ name: "feed", priority: 3, body: section("INTEL FEED", lines.join("\n")) });
    }
  }

  if (ctx.documentExcerpts && ctx.documentExcerpts.length) {
    const lines = ctx.documentExcerpts.map((d) =>
      `--- ${d.filename} (${d.type}) ---\n${d.excerpt.slice(0, 1500)}`);
    blocks.push({ name: "documents", priority: 3, body: section("RFP DOCUMENT EXCERPTS", lines.join("\n\n")) });
  }

  const { out, dropped } = fitWithin(blocks, MAX_LEN);
  if (dropped.length) {
    // eslint-disable-next-line no-console
    console.warn(`[iris-context] serializer dropped sections for focus=${focus}: ${dropped.join(", ")}`);
  }
  return out;
}
