// Server-only helpers for seeding the Mission Intelligence Graph from
// territory (state + agency + program_type) context and from extracted RFP
// content. Used by Step7Territory, Step1CProcessing, BLAST OFF, and
// buildIntelligenceGraph. Idempotent: safe to call multiple times.

import { withAICircuit } from "@/lib/ai-circuit-breaker";

type AnySupabase = {
  from: (t: string) => any;
};

const VALID_NODE_TYPES = [
  "requirement", "evaluator", "stakeholder", "policy", "competitor",
  "research", "win_theme", "risk", "internal_knowledge",
] as const;
type NodeType = (typeof VALID_NODE_TYPES)[number];

const VALID_CONF = new Set(["high", "medium", "low"]);

async function callAI(apiKey: string, system: string, user: string): Promise<string> {
  const res = await withAICircuit(async () => {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (r.status >= 500) throw new Error(`AI gateway ${r.status}`);
    return r;
  });
  if (!res.ok) throw new Error(`AI gateway ${res.status}`);
  const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return j.choices?.[0]?.message?.content?.trim() ?? "";
}

function parseJsonArray<T>(s: string): T[] {
  const cleaned = s.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  // Try direct array first.
  try {
    const j = JSON.parse(cleaned);
    if (Array.isArray(j)) return j as T[];
    // Sometimes the model returns { items: [...] } or {nodes: [...]}.
    if (j && typeof j === "object") {
      for (const v of Object.values(j)) if (Array.isArray(v)) return v as T[];
    }
  } catch {
    // fall through
  }
  const m = cleaned.match(/\[[\s\S]*\]/);
  if (!m) return [];
  try {
    const j = JSON.parse(m[0]);
    return Array.isArray(j) ? (j as T[]) : [];
  } catch {
    return [];
  }
}

async function insertNodesAvoidingDupes(
  supabase: AnySupabase,
  missionId: string,
  rows: Array<{
    node_type: NodeType;
    label: string;
    description?: string | null;
    metadata?: Record<string, unknown>;
    source: string;
    source_document_id?: string | null;
    confidence_level: "high" | "medium" | "low";
  }>,
): Promise<Array<{ id: string; label: string }>> {
  if (rows.length === 0) return [];
  const { data: existing } = await supabase
    .from("intelligence_graph_nodes")
    .select("id,label")
    .eq("mission_id", missionId);
  const have = new Set<string>((existing ?? []).map((n: { label: string }) => n.label.toLowerCase()));
  const fresh = rows.filter((r) => !have.has(r.label.toLowerCase()));
  if (fresh.length === 0) return (existing ?? []) as Array<{ id: string; label: string }>;
  const { data: inserted } = await supabase
    .from("intelligence_graph_nodes")
    .insert(fresh.map((r) => ({
      mission_id: missionId,
      node_type: r.node_type,
      label: r.label.slice(0, 200),
      description: r.description ?? null,
      metadata: r.metadata ?? {},
      source: r.source,
      source_document_id: r.source_document_id ?? null,
      confidence_level: r.confidence_level,
      is_active: true,
    })))
    .select("id,label");
  return [...((existing ?? []) as Array<{ id: string; label: string }>), ...((inserted ?? []) as Array<{ id: string; label: string }>)];
}

async function recalcCompleteness(supabase: AnySupabase, missionId: string): Promise<number> {
  const { count } = await supabase
    .from("intelligence_graph_nodes")
    .select("id", { count: "exact", head: true })
    .eq("mission_id", missionId);
  const pct = Math.min(100, Math.round(((count ?? 0) / 40) * 100));
  await supabase.from("missions").update({ intelligence_graph_completeness: pct }).eq("id", missionId);
  return pct;
}

/* -------------------- Territory seeding -------------------- */

export async function seedTerritoryForMission(
  missionId: string,
  supabase: AnySupabase,
  apiKey: string,
): Promise<{ seeded: number; edges: number; skipped: boolean }> {
  const { data: m } = await supabase
    .from("missions")
    .select("state, agency_name, program_type, name")
    .eq("id", missionId)
    .single();
  if (!m || !m.state || !m.agency_name || !m.program_type) {
    return { seeded: 0, edges: 0, skipped: true };
  }

  // Idempotency: skip if already seeded.
  const { count } = await supabase
    .from("intelligence_graph_nodes")
    .select("id", { count: "exact", head: true })
    .eq("mission_id", missionId)
    .eq("source", "territory_seed");
  if ((count ?? 0) >= 5) return { seeded: 0, edges: 0, skipped: true };

  const ctxLine = `State: ${m.state}\nAgency: ${m.agency_name}\nProgram type: ${m.program_type}`;

  type AiNode = {
    node_type?: string;
    label?: string;
    description?: string;
    metadata?: Record<string, unknown>;
  };

  let policyNodes: AiNode[] = [];
  let stakeNodes: AiNode[] = [];
  try {
    const policyText = await callAI(
      apiKey,
      "You build intelligence graphs for Medicaid procurements. Return ONLY a valid JSON object: {\"nodes\":[{node_type:\"policy\", label: string <=40 chars, description: 2-3 sentences of accurate factual information about this specific policy and how it relates to this procurement, metadata:{type:one of federal_policy|state_policy|waiver|executive_order|regulation, agency:string, year:number|null, relevance:direct|indirect}}]}. Generate 5 to 8 policy nodes. Only real policies that genuinely govern this program type in this state. Be accurate.",
      ctxLine,
    );
    policyNodes = parseJsonArray<AiNode>(policyText);
  } catch (e) {
    console.error("[seedTerritory] policy AI failed", e);
  }
  try {
    const stakeText = await callAI(
      apiKey,
      "You build intelligence graphs for Medicaid procurements. Return ONLY a valid JSON object: {\"nodes\":[{node_type:\"stakeholder\", label: string <=40 chars (person or organization name), description: 2-3 sentences of accurate factual information about this stakeholder, their role, and their known priorities relevant to this program type, metadata:{role:string, org:string, type:one of evaluator|influencer|advocate|oversight, priority:string}}]}. Generate 5 to 8 stakeholder nodes. Only real organizations and real people in known roles. Do not invent people or organizations.",
      ctxLine,
    );
    stakeNodes = parseJsonArray<AiNode>(stakeText);
  } catch (e) {
    console.error("[seedTerritory] stakeholder AI failed", e);
  }

  const all: Array<{
    node_type: NodeType;
    label: string;
    description?: string | null;
    metadata?: Record<string, unknown>;
    source: string;
    confidence_level: "high" | "medium" | "low";
  }> = [];
  for (const n of [...policyNodes, ...stakeNodes]) {
    const t = n.node_type;
    if (t !== "policy" && t !== "stakeholder") continue;
    const label = String(n.label ?? "").trim();
    if (!label) continue;
    all.push({
      node_type: t,
      label: label.slice(0, 200),
      description: typeof n.description === "string" ? n.description.slice(0, 800) : null,
      metadata: (n.metadata && typeof n.metadata === "object") ? n.metadata : {},
      source: "territory_seed",
      confidence_level: "medium",
    });
  }

  const allNodes = await insertNodesAvoidingDupes(supabase, missionId, all);
  const seedLabels = new Set(all.map((n) => n.label.toLowerCase()));
  const seedNodes = allNodes.filter((n) => seedLabels.has(n.label.toLowerCase()));

  // Edges between seeded nodes.
  let edgeCount = 0;
  if (seedNodes.length >= 2) {
    try {
      const edgeText = await callAI(
        apiKey,
        "You map relationships in a Medicaid procurement intelligence graph. Return ONLY a valid JSON object: {\"edges\":[{source_label:string exactly as provided, target_label:string exactly as provided, relationship_type:one of drives_requirement|influences_evaluator|supports|oversees, relationship_description:one sentence, strength:1-10}]}. Generate 5-10 edges only where genuine documented relationships exist.",
        `${ctxLine}\nNodes: ${JSON.stringify(seedNodes.map((n) => n.label))}`,
      );
      const edges = parseJsonArray<{
        source_label?: string; target_label?: string;
        relationship_type?: string; relationship_description?: string; strength?: number;
      }>(edgeText);
      const byLabel = new Map(seedNodes.map((n) => [n.label.toLowerCase(), n.id]));
      const rows = edges
        .map((e) => {
          const src = byLabel.get(String(e.source_label ?? "").toLowerCase());
          const tgt = byLabel.get(String(e.target_label ?? "").toLowerCase());
          if (!src || !tgt || src === tgt) return null;
          return {
            mission_id: missionId,
            source_node_id: src,
            target_node_id: tgt,
            relationship_type: String(e.relationship_type ?? "supports").slice(0, 80),
            relationship_description: typeof e.relationship_description === "string" ? e.relationship_description : null,
            strength: Math.max(1, Math.min(10, Number(e.strength) || 5)),
            is_confirmed: false,
          };
        })
        .filter((x): x is NonNullable<typeof x> => !!x)
        .slice(0, 20);
      if (rows.length) {
        const { data: ins } = await supabase.from("intelligence_graph_edges").insert(rows).select("id");
        edgeCount = ins?.length ?? 0;
      }
    } catch (e) {
      console.error("[seedTerritory] edge AI failed", e);
    }
  }

  await recalcCompleteness(supabase, missionId);
  return { seeded: seedNodes.length, edges: edgeCount, skipped: false };
}

/* -------------------- RFP requirement extraction -------------------- */

export async function extractRequirementNodesForMission(
  missionId: string,
  supabase: AnySupabase,
  apiKey: string,
): Promise<{ created: number; edges: number }> {
  // Build content from already-extracted sections + questions.
  const [sectionsRes, qsRes, docRes, winRes] = await Promise.all([
    supabase.from("mission_sections").select("name,description").eq("mission_id", missionId).limit(80),
    supabase.from("mission_questions").select("question_text,evaluation_criteria").eq("mission_id", missionId).limit(60),
    supabase.from("mission_documents").select("id").eq("mission_id", missionId).eq("document_type", "primary_rfp").limit(1).maybeSingle(),
    supabase.from("mission_win_strategy").select("win_themes").eq("mission_id", missionId).maybeSingle(),
  ]);
  const sections = (sectionsRes.data ?? []) as Array<{ name: string; description: string | null }>;
  const questions = (qsRes.data ?? []) as Array<{ question_text: string; evaluation_criteria: string | null }>;
  const primaryDocId = (docRes.data as { id?: string } | null)?.id ?? null;

  const parts: string[] = [];
  for (const s of sections) {
    parts.push(`SECTION ${s.name}${s.description ? `: ${s.description}` : ""}`);
  }
  for (const q of questions) {
    parts.push(`Q: ${q.question_text}${q.evaluation_criteria ? ` [${q.evaluation_criteria}]` : ""}`);
  }
  const corpus = parts.join("\n").slice(0, 6000);
  if (corpus.trim().length < 100) return { created: 0, edges: 0 };

  let nodes: Array<{ label?: string; description?: string; metadata?: Record<string, unknown> }> = [];
  try {
    const text = await callAI(
      apiKey,
      "You build an intelligence graph for a Medicaid procurement proposal. Read this RFP content and extract the most important explicit requirements as graph nodes. Return ONLY a valid JSON object: {\"nodes\":[{label: string <=40 chars, description: 1-2 sentences specific and actionable, metadata:{section: string, is_high_risk: boolean, weight: one of high|medium|low}}]}. Extract 10 to 20 nodes. Focus only on requirements that are specific, measurable, compliance-critical, or carry evaluation weight. Do not extract generic statements.",
      `RFP content:\n${corpus}`,
    );
    nodes = parseJsonArray<{ label?: string; description?: string; metadata?: Record<string, unknown> }>(text);
  } catch (e) {
    console.error("[extractRequirements] AI failed", e);
    return { created: 0, edges: 0 };
  }

  const reqRows = nodes
    .filter((n) => typeof n.label === "string" && n.label.trim().length > 0)
    .slice(0, 25)
    .map((n) => ({
      node_type: "requirement" as NodeType,
      label: String(n.label).trim().slice(0, 200),
      description: typeof n.description === "string" ? n.description.slice(0, 800) : null,
      metadata: (n.metadata && typeof n.metadata === "object") ? n.metadata : {},
      source: "rfp_upload",
      source_document_id: primaryDocId,
      confidence_level: "high" as const,
    }));

  const allNodes = await insertNodesAvoidingDupes(supabase, missionId, reqRows);
  const reqLabels = new Set(reqRows.map((r) => r.label.toLowerCase()));
  const reqNodes = allNodes.filter((n) => reqLabels.has(n.label.toLowerCase()));

  // Edges: win themes → requirements (if win strategy exists with themes).
  let edgeCount = 0;
  const winThemes = (winRes.data as { win_themes?: unknown } | null)?.win_themes;
  const themeList: Array<string | { label?: string; title?: string; name?: string }> = Array.isArray(winThemes) ? (winThemes as Array<string | { label?: string; title?: string; name?: string }>) : [];
  const themeLabels: string[] = themeList
    .map((t) => (typeof t === "string" ? t : (t.label ?? t.title ?? t.name ?? "")))
    .map((s) => String(s).trim())
    .filter(Boolean)
    .slice(0, 10);

  if (reqNodes.length && themeLabels.length) {
    // Ensure win_theme nodes exist for each theme.
    const themeRows = themeLabels.map((label) => ({
      node_type: "win_theme" as NodeType,
      label: label.slice(0, 200),
      description: null,
      metadata: {},
      source: "win_strategy",
      confidence_level: "high" as const,
    }));
    const allAfterThemes = await insertNodesAvoidingDupes(supabase, missionId, themeRows);
    const byLabel = new Map(allAfterThemes.map((n) => [n.label.toLowerCase(), n.id]));

    try {
      const edgeText = await callAI(
        apiKey,
        "Identify which win themes address which requirements for a Medicaid proposal. Return ONLY a valid JSON object: {\"edges\":[{source_label:string (win theme exactly as provided), target_label:string (requirement exactly as provided), relationship_type:\"addresses_requirement\", relationship_description:one sentence, strength:1-10}]}. Only include edges where the connection is genuine.",
        `Win themes: ${JSON.stringify(themeLabels)}\nRequirements: ${JSON.stringify(reqNodes.map((n) => n.label))}`,
      );
      const edges = parseJsonArray<{
        source_label?: string; target_label?: string;
        relationship_type?: string; relationship_description?: string; strength?: number;
      }>(edgeText);
      const rows = edges
        .map((e) => {
          const src = byLabel.get(String(e.source_label ?? "").toLowerCase());
          const tgt = byLabel.get(String(e.target_label ?? "").toLowerCase());
          if (!src || !tgt || src === tgt) return null;
          return {
            mission_id: missionId,
            source_node_id: src,
            target_node_id: tgt,
            relationship_type: "addresses_requirement",
            relationship_description: typeof e.relationship_description === "string" ? e.relationship_description : null,
            strength: Math.max(1, Math.min(10, Number(e.strength) || 5)),
            is_confirmed: true,
          };
        })
        .filter((x): x is NonNullable<typeof x> => !!x)
        .slice(0, 40);
      if (rows.length) {
        const { data: ins } = await supabase.from("intelligence_graph_edges").insert(rows).select("id");
        edgeCount = ins?.length ?? 0;
      }
    } catch (e) {
      console.error("[extractRequirements] edge AI failed", e);
    }
  }

  await recalcCompleteness(supabase, missionId);
  return { created: reqNodes.length, edges: edgeCount };
}

/* -------------------- Feed → research node promotion -------------------- */

export async function promoteFeedItemToResearchNode(
  supabase: AnySupabase,
  missionId: string,
  feedItem: { id: string; headline: string; summary: string | null; source_name: string | null; iris_relevance_score: number },
): Promise<void> {
  if ((feedItem.iris_relevance_score ?? 0) < 70) return;
  const headline = feedItem.headline.slice(0, 200);
  // Dedupe: skip if any research node with a similar label already exists.
  const { data: existing } = await supabase
    .from("intelligence_graph_nodes")
    .select("id")
    .eq("mission_id", missionId)
    .eq("node_type", "research")
    .ilike("label", `%${headline.slice(0, 40)}%`)
    .limit(1)
    .maybeSingle();
  if (existing) return;
  await supabase.from("intelligence_graph_nodes").insert({
    mission_id: missionId,
    node_type: "research",
    label: headline,
    description: (feedItem.summary ?? "").slice(0, 500),
    source: "feed_item",
    source_feed_item_id: feedItem.id,
    confidence_level: "medium",
    metadata: { source_name: feedItem.source_name ?? null },
    is_active: true,
  });
}
