import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * "What the State Wants" — decoded priorities. Stored in mission_strategy
 * with the closest existing strategy kind allowed by the database constraint.
 */
const StrategySchema = z.object({
  priorities: z
    .array(
      z.object({
        label: z.string().min(10).max(280),
        notes: z.string().min(20).max(900),
        supporting_theme: z.string().max(120).optional(),
        source_label: z.string().max(180).optional(),
      }),
    )
    .max(10),
});
type StrategyOut = z.infer<typeof StrategySchema>;

export const extractStrategy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ missionId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const started = Date.now();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadMissionAndFeed, renderContext, callJsonExtractor } =
      await import("./shared.server");

    const { mission, rows } = await loadMissionAndFeed(supabaseAdmin, data.missionId);
    if (rows.length === 0) {
      return {
        stage: "strategy",
        inserted: 0,
        skipped: true,
        reason: "no feed rows",
        ms: Date.now() - started,
      };
    }

    const system = `You produce the "What the State Wants" section of a procurement strategy brief.
Decode 4-7 STATE PRIORITIES — what the buying state actually cares about, not what the RFP says.
Each priority should explain WHY (the underlying pressure, evidence, or political reality) in the notes field, grounded in the rows or mission context. Never invent statistics not in the inputs. Optionally name a supporting_theme that this priority lines up with.`;

    const result = await callJsonExtractor<StrategyOut>({
      system,
      user: renderContext(mission, rows),
      toolName: "emit_state_priorities",
      toolDescription: "Emit decoded state priorities for the mission.",
      parametersSchema: {
        type: "object",
        properties: {
          priorities: {
            type: "array",
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                notes: { type: "string" },
                supporting_theme: { type: "string" },
                source_label: { type: "string" },
              },
              required: ["label", "notes"],
              additionalProperties: false,
            },
          },
        },
        required: ["priorities"],
        additionalProperties: false,
      },
      zodSchema: StrategySchema,
    });

    if (!result) {
      return {
        stage: "strategy",
        inserted: 0,
        skipped: true,
        reason: "ai unavailable",
        ms: Date.now() - started,
      };
    }

    const { upsertNode, recordEdges, clearMissionOutputGraph, upsertFeedNodes, matchFeedRows } =
      await import("@/lib/iris-graph.server");

    await supabaseAdmin
      .from("mission_strategy")
      .delete()
      .eq("mission_id", data.missionId)
      .eq("created_by_system", true);

    await clearMissionOutputGraph(supabaseAdmin, data.missionId, "state_priority");

    if (result.priorities.length === 0) {
      return { stage: "strategy", inserted: 0, ms: Date.now() - started };
    }

    const inserts = result.priorities.map((p, i) => ({
      mission_id: data.missionId,
      kind: "client_priority",
      label: p.label,
      notes: p.supporting_theme ? `${p.notes}\n\nSupports: ${p.supporting_theme}` : p.notes,
      sort_order: i,
      created_by_system: true,
    }));

    const { data: inserted, error } = await supabaseAdmin
      .from("mission_strategy")
      .insert(inserts)
      .select("id,label");
    if (error) throw new Error(`insert strategy: ${error.message}`);

    const rowNodeIds = await upsertFeedNodes(supabaseAdmin, data.missionId, rows);
    const edges: Parameters<typeof recordEdges>[1] = [];
    for (let i = 0; i < (inserted ?? []).length; i++) {
      const row = inserted![i];
      const ai = result.priorities[i];
      const nodeId = await upsertNode(supabaseAdmin, {
        mission_id: data.missionId,
        kind: "state_priority",
        ref_table: "mission_strategy",
        ref_id: row.id,
        label: row.label,
        domain: "policy",
        metadata: { supporting_theme: ai.supporting_theme ?? null },
      });
      const { matched, cited } = matchFeedRows(rows, ai.source_label);
      for (const r of cited) {
        const srcId = rowNodeIds.get(r.id);
        if (!srcId) continue;
        edges.push({
          mission_id: data.missionId,
          src_node_id: srcId,
          dst_node_id: nodeId,
          edge_type: matched.length > 0 ? "cites" : "derived_from",
          weight: matched.length > 0 ? 1.0 : 0.4,
          provenance: {
            extractor: "strategy",
            source_label: ai.source_label ?? null,
            row_source: r.source,
            row_url: r.url,
            row_published_at: r.published_at,
          },
        });
      }
    }
    await recordEdges(supabaseAdmin, edges);

    return { stage: "strategy", inserted: inserts.length, ms: Date.now() - started };
  });
