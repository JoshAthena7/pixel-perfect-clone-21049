import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * IRIS Narrative Mapping Engine
 * Maps every mission_question to a primary/secondary win theme, an
 * evaluator fear, and a narrative role. Then upserts win_theme graph
 * nodes and connects each question's graph node to its theme.
 *
 * Admin-only writes; questions are read-only here apart from the four
 * narrative columns added by the matching migration.
 */

type ParsedTheme = {
  id?: string;
  title: string;
  description: string;
};

type MappingResult = {
  ok: boolean;
  message?: string;
  mapped: number;
  skipped: number;
  failed: number;
  winThemeDistribution: Record<string, number>;
  edgesCreated: number;
};

function parseWinThemes(raw: unknown): ParsedTheme[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t: any, i: number) => {
      if (typeof t === "string") {
        const [title, ...rest] = t.split(/\s+[—–-]\s+/);
        return {
          title: (title ?? `Theme ${i + 1}`).trim(),
          description: rest.join(" — ").trim(),
        };
      }
      const text =
        typeof t?.text === "string"
          ? t.text
          : typeof t?.title === "string"
            ? t.title
            : typeof t?.label === "string"
              ? t.label
              : "";
      const [titlePart, ...rest] = text.split(/\s+[—–-]\s+/);
      const title = (titlePart ?? `Theme ${i + 1}`).trim();
      const description =
        rest.join(" — ").trim() ||
        (typeof t?.description === "string" ? t.description : "") ||
        (typeof t?.rationale === "string" ? t.rationale : "");
      return { id: t?.id, title, description };
    })
    .filter((t) => t.title.length > 0);
}

async function callGemini(system: string, user: string): Promise<any> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY missing on server");
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      max_tokens: 1200,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`AI gateway ${r.status}: ${body.slice(0, 200)}`);
  }
  const j = (await r.json()) as any;
  const content = j.choices?.[0]?.message?.content ?? "";
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("AI returned no JSON object");
  return JSON.parse(match[0]);
}

function matchTheme(themes: ParsedTheme[], candidate: string | null | undefined): string | null {
  if (!candidate) return null;
  const needle = candidate.toLowerCase().trim();
  if (!needle || needle === "null" || needle === "none") return null;
  let best: { t: ParsedTheme; score: number } | null = null;
  for (const t of themes) {
    const title = t.title.toLowerCase();
    let score = 0;
    if (title === needle) score = 100;
    else if (title.includes(needle) || needle.includes(title)) score = 50;
    else {
      const a = new Set(title.split(/\W+/).filter(Boolean));
      const b = new Set(needle.split(/\W+/).filter(Boolean));
      let inter = 0;
      a.forEach((w) => b.has(w) && inter++);
      score = inter * 5;
    }
    if (!best || score > best.score) best = { t, score };
  }
  return best && best.score >= 5 ? best.t.title : null;
}

export const mapNarrativeStructure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        missionId: z.string().uuid(),
        force: z.boolean().optional().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<MappingResult> => {
    const { supabase, userId } = context;

    // Admin OR mission team member
    const [{ data: isAdmin }, { data: team }] = await Promise.all([
      supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
      supabase
        .from("mission_team_members")
        .select("member_id")
        .eq("mission_id", data.missionId)
        .eq("member_id", userId)
        .maybeSingle(),
    ]);
    if (!isAdmin && !team) {
      return {
        ok: false,
        message: "Forbidden",
        mapped: 0,
        skipped: 0,
        failed: 0,
        winThemeDistribution: {},
        edgesCreated: 0,
      };
    }

    // STEP A — load context
    const { data: cfg } = await supabase
      .from("oracle_engagement_config")
      .select("win_themes, north_star, central_claim")
      .eq("mission_id", data.missionId)
      .maybeSingle();

    const themes = parseWinThemes((cfg as any)?.win_themes);
    if (themes.length === 0) {
      return {
        ok: false,
        message: "Win themes must be configured before narrative mapping can run.",
        mapped: 0,
        skipped: 0,
        failed: 0,
        winThemeDistribution: {},
        edgesCreated: 0,
      };
    }

    let qQuery = supabase
      .from("mission_questions")
      .select("id, question_number, question_text, evaluation_criteria, point_value, section_id, story_mapped_at")
      .eq("mission_id", data.missionId)
      .eq("is_withdrawn", false);
    if (!data.force) qQuery = qQuery.is("story_mapped_at", null);
    const { data: questions } = await qQuery;

    const allQs = questions ?? [];
    if (allQs.length === 0) {
      return {
        ok: true,
        message: "No questions need mapping.",
        mapped: 0,
        skipped: 0,
        failed: 0,
        winThemeDistribution: {},
        edgesCreated: 0,
      };
    }

    // Section names for prompt context
    const sectionIds = Array.from(new Set(allQs.map((q) => q.section_id).filter(Boolean))) as string[];
    const { data: sections } = sectionIds.length
      ? await supabase
          .from("mission_sections")
          .select("id, name, section_number")
          .in("id", sectionIds)
      : { data: [] as any[] };
    const sectionById = new Map<string, any>();
    (sections ?? []).forEach((s: any) => sectionById.set(s.id, s));

    // STEP B — win theme block
    const themeBlock = themes
      .map(
        (t, i) =>
          `${i + 1}. ${t.title}\nDescription: ${t.description || "(none)"}\nUse for: ${t.description || "—"}`,
      )
      .join("\n\n");
    const centralClaim =
      (cfg as any)?.central_claim ?? (cfg as any)?.north_star ?? "(not configured)";

    // STEP C — AI map (batches of 5, concurrency 3)
    const system =
      "You are mapping RFP questions to proposal win themes for a Medicaid procurement. Return ONLY valid JSON.";

    type MapOutput = {
      questionId: string;
      primary: string | null;
      secondary: string | null;
      fear: string;
      role: string;
    };
    const results: MapOutput[] = [];
    let failed = 0;

    async function mapOne(q: any): Promise<MapOutput | null> {
      const section = sectionById.get(q.section_id) ?? null;
      const user = `CENTRAL CLAIM:\n${centralClaim}\n\nWIN THEMES:\n${themeBlock}\n\nQUESTION TO MAP:\nNumber: ${q.question_number ?? "?"}\nText: ${String(q.question_text ?? "").slice(0, 2000)}\nSection: ${section ? `${section.section_number ?? ""} ${section.name ?? ""}` : "unknown"}\nEval weight: ${q.point_value ?? "not specified"}\n\nInstructions:\n1. Assign the PRIMARY win theme this question best supports.\n2. Assign a SECONDARY win theme only if it meaningfully serves a second theme; otherwise null.\n3. Identify the EVALUATOR FEAR — one specific sentence on what the state is actually worried about.\n4. Assign a NARRATIVE ROLE: opens_thread | advances_thread | closes_thread | bridges | standalone.\n\nReturn JSON only: { primary_win_theme: string, secondary_win_theme: string | null, evaluator_fear: string, narrative_role: string }`;
      try {
        const j = await callGemini(system, user);
        return {
          questionId: q.id,
          primary: matchTheme(themes, j.primary_win_theme),
          secondary: matchTheme(themes, j.secondary_win_theme),
          fear: String(j.evaluator_fear ?? "").slice(0, 600),
          role: ["opens_thread", "advances_thread", "closes_thread", "bridges", "standalone"].includes(
            j.narrative_role,
          )
            ? j.narrative_role
            : "standalone",
        };
      } catch (e) {
        console.error("[map-narrative] question failed", q.id, e);
        return null;
      }
    }

    const CONCURRENCY = 3;
    let cursor = 0;
    async function worker() {
      while (cursor < allQs.length) {
        const idx = cursor++;
        const r = await mapOne(allQs[idx]);
        if (r) results.push(r);
        else failed += 1;
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, allQs.length) }, () => worker()));

    // STEP D — write question rows
    const distribution: Record<string, number> = {};
    for (const r of results) {
      if (r.primary) distribution[r.primary] = (distribution[r.primary] ?? 0) + 1;
      await supabase
        .from("mission_questions")
        .update({
          primary_win_theme: r.primary,
          secondary_win_theme: r.secondary,
          evaluator_fear: r.fear,
          narrative_role: r.role,
          story_mapped_at: new Date().toISOString(),
        } as any)
        .eq("id", r.questionId)
        .eq("mission_id", data.missionId);
    }

    // Upsert win_theme graph nodes
    const { data: existingThemeNodes } = await supabase
      .from("intelligence_graph_nodes")
      .select("id, label")
      .eq("mission_id", data.missionId)
      .eq("node_type", "win_theme")
      .eq("is_active", true);
    const themeNodeIdByTitle = new Map<string, string>();
    (existingThemeNodes ?? []).forEach((n: any) =>
      themeNodeIdByTitle.set(String(n.label).toLowerCase(), n.id),
    );

    for (const t of themes) {
      if (themeNodeIdByTitle.has(t.title.toLowerCase())) continue;
      const { data: inserted, error } = await supabase
        .from("intelligence_graph_nodes")
        .insert({
          mission_id: data.missionId,
          node_type: "win_theme",
          label: t.title.slice(0, 200),
          description: t.description.slice(0, 800),
          confidence_level: "high",
          source: "narrative_mapper",
          is_active: true,
        })
        .select("id")
        .single();
      if (!error && inserted) {
        themeNodeIdByTitle.set(t.title.toLowerCase(), (inserted as any).id);
      }
    }

    // Upsert per-question requirement graph node, link to theme
    let edgesCreated = 0;
    const questionNodeIdByQid = new Map<string, string>();

    // Look up existing question nodes (those carrying metadata.question_id)
    const { data: existingQNodes } = await supabase
      .from("intelligence_graph_nodes")
      .select("id, metadata")
      .eq("mission_id", data.missionId)
      .eq("node_type", "requirement")
      .eq("is_active", true);
    (existingQNodes ?? []).forEach((n: any) => {
      const qid = n?.metadata?.question_id;
      if (typeof qid === "string") questionNodeIdByQid.set(qid, n.id);
    });

    for (const r of results) {
      const q = allQs.find((x) => x.id === r.questionId);
      if (!q) continue;
      let qNodeId = questionNodeIdByQid.get(q.id);
      if (!qNodeId) {
        const { data: ins, error } = await supabase
          .from("intelligence_graph_nodes")
          .insert({
            mission_id: data.missionId,
            node_type: "requirement",
            label: `${q.question_number ? `${q.question_number}: ` : ""}${String(q.question_text ?? "").slice(0, 120)}`,
            description: String(q.question_text ?? "").slice(0, 800),
            confidence_level: "high",
            source: "narrative_mapper",
            is_active: true,
            metadata: { question_id: q.id, question_number: q.question_number ?? null },
          })
          .select("id")
          .single();
        if (!error && ins) {
          qNodeId = (ins as any).id;
          questionNodeIdByQid.set(q.id, qNodeId!);
        }
      }
      if (!qNodeId) continue;

      // Edge q → primary win theme
      const primaryNodeId = r.primary ? themeNodeIdByTitle.get(r.primary.toLowerCase()) : undefined;
      if (primaryNodeId && primaryNodeId !== qNodeId) {
        const { data: dup } = await supabase
          .from("intelligence_graph_edges")
          .select("id")
          .eq("mission_id", data.missionId)
          .eq("source_node_id", qNodeId)
          .eq("target_node_id", primaryNodeId)
          .eq("relationship_type", "supports_win_theme")
          .maybeSingle();
        if (!dup) {
          const { error } = await supabase.from("intelligence_graph_edges").insert({
            mission_id: data.missionId,
            source_node_id: qNodeId,
            target_node_id: primaryNodeId,
            relationship_type: "supports_win_theme",
            strength: 10,
            is_confirmed: true,
          });
          if (!error) edgesCreated += 1;
        }
      }
      // Edge q → secondary win theme
      const secondaryNodeId = r.secondary ? themeNodeIdByTitle.get(r.secondary.toLowerCase()) : undefined;
      if (secondaryNodeId && secondaryNodeId !== qNodeId && secondaryNodeId !== primaryNodeId) {
        const { data: dup } = await supabase
          .from("intelligence_graph_edges")
          .select("id")
          .eq("mission_id", data.missionId)
          .eq("source_node_id", qNodeId)
          .eq("target_node_id", secondaryNodeId)
          .eq("relationship_type", "supports_win_theme")
          .maybeSingle();
        if (!dup) {
          const { error } = await supabase.from("intelligence_graph_edges").insert({
            mission_id: data.missionId,
            source_node_id: qNodeId,
            target_node_id: secondaryNodeId,
            relationship_type: "supports_win_theme",
            strength: 6,
            is_confirmed: true,
          });
          if (!error) edgesCreated += 1;
        }
      }
    }

    // STEP E — question↔question shares_narrative_thread, scoped to same
    // section OR weighted questions. Skip when both fail.
    const byTheme = new Map<string, typeof results>();
    for (const r of results) {
      if (!r.primary) continue;
      if (!byTheme.has(r.primary)) byTheme.set(r.primary, []);
      byTheme.get(r.primary)!.push(r);
    }
    const qById = new Map(allQs.map((q) => [q.id, q]));

    for (const [, group] of byTheme) {
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const a = qById.get(group[i].questionId);
          const b = qById.get(group[j].questionId);
          if (!a || !b) continue;
          const sameSection = a.section_id && a.section_id === b.section_id;
          const weighted =
            (typeof a.point_value === "number" && a.point_value > 0) ||
            (typeof b.point_value === "number" && b.point_value > 0);
          if (!sameSection && !weighted) continue;

          const aNode = questionNodeIdByQid.get(a.id);
          const bNode = questionNodeIdByQid.get(b.id);
          if (!aNode || !bNode || aNode === bNode) continue;

          const { data: dup } = await supabase
            .from("intelligence_graph_edges")
            .select("id")
            .eq("mission_id", data.missionId)
            .eq("relationship_type", "shares_narrative_thread")
            .or(
              `and(source_node_id.eq.${aNode},target_node_id.eq.${bNode}),and(source_node_id.eq.${bNode},target_node_id.eq.${aNode})`,
            )
            .maybeSingle();
          if (dup) continue;

          const { error } = await supabase.from("intelligence_graph_edges").insert({
            mission_id: data.missionId,
            source_node_id: aNode,
            target_node_id: bNode,
            relationship_type: "shares_narrative_thread",
            strength: 7,
            is_confirmed: true,
          });
          if (!error) edgesCreated += 1;
        }
      }
    }

    // Fire-and-forget pre-generation of narrative briefs for mapped questions.
    try {
      const { pregenerateNarrativeBriefs } = await import(
        "./generate-narrative-brief.functions"
      );
      await pregenerateNarrativeBriefs({ data: { missionId: data.missionId } } as any);
    } catch (e) {
      console.warn("[map-narrative] pre-generation failed", e);
    }

    return {
      ok: true,
      mapped: results.length,
      skipped: allQs.length - results.length - failed,
      failed,
      winThemeDistribution: distribution,
      edgesCreated,
    };
  });
