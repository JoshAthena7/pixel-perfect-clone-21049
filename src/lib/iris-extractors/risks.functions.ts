import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const RiskSchema = z.object({
  risks: z
    .array(
      z.object({
        title: z.string().min(10).max(280),
        description: z.string().min(20).max(900),
        severity: z.enum(["watch", "medium", "high", "critical"]),
        category: z.enum(["regulatory", "competitive", "political", "operational", "financial"]),
        source_label: z.string().max(180).optional(),
      }),
    )
    .max(15),
});
type RiskOut = z.infer<typeof RiskSchema>;

export const extractRisks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ missionId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const started = Date.now();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadMissionAndFeed, renderContext, callJsonExtractor } = await import("./shared.server");

    const { mission, rows } = await loadMissionAndFeed(supabaseAdmin, data.missionId);
    if (rows.length === 0) {
      return { stage: "risks", inserted: 0, skipped: true, reason: "no feed rows", ms: Date.now() - started };
    }

    const system = `You produce the "Emerging Risks" feed for a procurement strategy brief.
Identify 4-10 risks that could materially damage the win probability or execution. Each must be grounded in the supplied market rows or mission context — never invent.
Sort by severity (most serious first). Make titles concrete and specific, not generic.`;

    const result = await callJsonExtractor<RiskOut>({
      system,
      user: renderContext(mission, rows),
      toolName: "emit_risks",
      toolDescription: "Emit emerging risks for the mission.",
      parametersSchema: {
        type: "object",
        properties: {
          risks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                description: { type: "string" },
                severity: { type: "string", enum: ["watch", "medium", "high", "critical"] },
                category: {
                  type: "string",
                  enum: ["regulatory", "competitive", "political", "operational", "financial"],
                },
              },
              required: ["title", "description", "severity", "category"],
              additionalProperties: false,
            },
          },
        },
        required: ["risks"],
        additionalProperties: false,
      },
      zodSchema: RiskSchema,
    });

    if (!result) {
      return { stage: "risks", inserted: 0, skipped: true, reason: "ai unavailable", ms: Date.now() - started };
    }

    await supabaseAdmin
      .from("mission_risks")
      .delete()
      .eq("mission_id", data.missionId)
      .eq("created_by_system", true);

    if (result.risks.length === 0) return { stage: "risks", inserted: 0, ms: Date.now() - started };

    const sevMap: Record<string, "Low" | "Medium" | "High"> = {
      watch: "Low",
      medium: "Medium",
      high: "High",
      critical: "High",
    };
    const inserts = result.risks.map((r) => ({
      mission_id: data.missionId,
      title: r.title,
      description: r.description,
      severity: sevMap[r.severity] ?? "Medium",
      status: "Open",
      owner: `iris_extractor:${r.category}`,
      created_by_system: true,
    }));

    const { error } = await supabaseAdmin.from("mission_risks").insert(inserts);
    if (error) throw new Error(`insert risks: ${error.message}`);
    return { stage: "risks", inserted: inserts.length, ms: Date.now() - started };
  });
