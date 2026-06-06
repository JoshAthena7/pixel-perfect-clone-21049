import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const SignalSchema = z.object({
  signals: z
    .array(
      z.object({
        signal_type: z.enum(["political", "regulatory", "competitive", "operational"]),
        signal_title: z.string().min(8).max(280),
        signal_summary: z.string().min(20).max(800),
        severity: z.enum(["info", "watch", "elevated", "critical"]),
        recommended_action: z.string().min(10).max(400),
        confidence: z.number().min(0).max(1),
        source_label: z.string().max(180),
      }),
    )
    .min(0)
    .max(20),
});
type SignalOut = z.infer<typeof SignalSchema>;

export const extractSignals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ missionId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const started = Date.now();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadMissionAndFeed, renderContext, callJsonExtractor } = await import("./shared.server");

    const { mission, rows } = await loadMissionAndFeed(supabaseAdmin, data.missionId);
    if (rows.length === 0) {
      return { stage: "signals", inserted: 0, skipped: true, reason: "no feed rows", ms: Date.now() - started };
    }

    const system = `You are an intelligence analyst producing the "Environmental Assessment" section of a procurement strategy brief.
From the mission context and recent market intelligence rows, extract 6-12 distinct environmental SIGNALS that materially affect this specific procurement.
Each signal must be drawn from the provided rows — never invent. Cite the row source in source_label.
Distribute across political, regulatory, and competitive when supported by the rows.
Skip any row that is not relevant. If fewer than 6 signals are clearly supported, return only what is supported.`;

    const result = await callJsonExtractor<SignalOut>({
      system,
      user: renderContext(mission, rows),
      toolName: "emit_signals",
      toolDescription: "Emit environmental signals derived from the provided market intelligence.",
      parametersSchema: {
        type: "object",
        properties: {
          signals: {
            type: "array",
            items: {
              type: "object",
              properties: {
                signal_type: { type: "string", enum: ["political", "regulatory", "competitive", "operational"] },
                signal_title: { type: "string" },
                signal_summary: { type: "string" },
                severity: { type: "string", enum: ["info", "watch", "elevated", "critical"] },
                recommended_action: { type: "string" },
                confidence: { type: "number" },
                source_label: { type: "string" },
              },
              required: [
                "signal_type",
                "signal_title",
                "signal_summary",
                "severity",
                "recommended_action",
                "confidence",
                "source_label",
              ],
              additionalProperties: false,
            },
          },
        },
        required: ["signals"],
        additionalProperties: false,
      },
      zodSchema: SignalSchema,
    });

    if (!result) {
      return { stage: "signals", inserted: 0, skipped: true, reason: "ai unavailable", ms: Date.now() - started };
    }

    const { upsertNode, recordEdges, clearMissionOutputGraph } = await import(
      "@/lib/iris-graph.server"
    );

    await supabaseAdmin
      .from("signals")
      .delete()
      .eq("mission_id", data.missionId)
      .eq("created_by_system", true);

    // Reset prior signal nodes/edges so re-runs don't accumulate stale provenance.
    await clearMissionOutputGraph(supabaseAdmin, data.missionId, "signal");

    if (result.signals.length === 0) {
      return { stage: "signals", inserted: 0, ms: Date.now() - started };
    }

    const sevMap: Record<string, "info" | "warning" | "critical"> = {
      info: "info",
      watch: "info",
      elevated: "warning",
      critical: "critical",
    };
    const inserts = result.signals.map((s) => ({
      mission_id: data.missionId,
      source_module: "iris_extractor",
      signal_type: s.signal_type,
      signal_title: s.signal_title,
      signal_summary: s.signal_summary,
      severity: sevMap[s.severity] ?? "info",
      confidence: s.confidence,
      status: "open",
      recommended_action: s.recommended_action,
      tags: [s.source_label],
      created_by_system: true,
    }));

    const { data: inserted, error } = await supabaseAdmin
      .from("signals")
      .insert(inserts)
      .select("id,signal_title");
    if (error) throw new Error(`insert signals: ${error.message}`);

    // ── Mission Intelligence Graph: link each signal to the market rows it came from.
    // Pre-upsert every input market row as a node so edge inserts are cheap.
    const rowNodeIds = new Map<string, string>();
    for (const r of rows) {
      const id = await upsertNode(supabaseAdmin, {
        mission_id: data.missionId,
        kind: "market_row",
        ref_table: "market_intelligence",
        ref_id: r.id,
        label: r.title,
        domain: "market",
        metadata: { source: r.source, url: r.url, published_at: r.published_at },
      });
      rowNodeIds.set(r.id, id);
    }

    const edges: Array<{
      mission_id: string;
      src_node_id: string;
      dst_node_id: string;
      edge_type: "derived_from" | "cites";
      weight: number;
      confidence: number;
      provenance: Record<string, unknown>;
    }> = [];

    for (let i = 0; i < (inserted ?? []).length; i++) {
      const sigRow = inserted![i];
      const aiSig = result.signals[i];
      const signalNodeId = await upsertNode(supabaseAdmin, {
        mission_id: data.missionId,
        kind: "signal",
        ref_table: "signals",
        ref_id: sigRow.id,
        label: sigRow.signal_title,
        domain: "signal",
        metadata: { signal_type: aiSig.signal_type, severity: aiSig.severity },
      });

      // Match source_label back to market rows (best-effort fuzzy).
      const needle = aiSig.source_label.toLowerCase();
      const matched = rows.filter(
        (r) =>
          needle.includes(r.source.toLowerCase()) ||
          (r.title && needle.includes(r.title.toLowerCase().slice(0, 40))),
      );
      const cited = matched.length > 0 ? matched : rows.slice(0, 3); // fall back: top 3 contextual rows
      for (const r of cited) {
        const srcId = rowNodeIds.get(r.id);
        if (!srcId) continue;
        edges.push({
          mission_id: data.missionId,
          src_node_id: srcId,
          dst_node_id: signalNodeId,
          edge_type: matched.length > 0 ? "cites" : "derived_from",
          weight: matched.length > 0 ? 1.0 : 0.4,
          confidence: aiSig.confidence,
          provenance: {
            extractor: "signals",
            source_label: aiSig.source_label,
            row_source: r.source,
            row_url: r.url,
            row_published_at: r.published_at,
          },
        });
      }
    }
    await recordEdges(supabaseAdmin, edges);

    return { stage: "signals", inserted: inserts.length, ms: Date.now() - started };
  });
