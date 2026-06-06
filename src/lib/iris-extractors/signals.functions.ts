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

    await supabaseAdmin
      .from("signals")
      .delete()
      .eq("mission_id", data.missionId)
      .eq("created_by_system", true);

    if (result.signals.length === 0) {
      return { stage: "signals", inserted: 0, ms: Date.now() - started };
    }

    const inserts = result.signals.map((s) => ({
      mission_id: data.missionId,
      source_module: "iris_extractor",
      signal_type: s.signal_type,
      signal_title: s.signal_title,
      signal_summary: s.signal_summary,
      severity: s.severity,
      confidence: s.confidence,
      status: "open",
      recommended_action: s.recommended_action,
      tags: [s.source_label],
      created_by_system: true,
    }));

    const { error } = await supabaseAdmin.from("signals").insert(inserts);
    if (error) throw new Error(`insert signals: ${error.message}`);
    return { stage: "signals", inserted: inserts.length, ms: Date.now() - started };
  });
