import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ThemeSchema = z.object({
  themes: z
    .array(
      z.object({
        title: z.string().min(6).max(120),
        key_message: z.string().min(20).max(500),
        description: z.string().min(20).max(900),
        source_label: z.string().max(180).optional(),
      }),
    )
    .max(8),
});
type ThemeOut = z.infer<typeof ThemeSchema>;

export const extractWinThemes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ missionId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const started = Date.now();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadMissionAndFeed, renderContext, callJsonExtractor } = await import("./shared.server");

    const { mission, rows } = await loadMissionAndFeed(supabaseAdmin, data.missionId);
    if (rows.length === 0) {
      return { stage: "win_themes", inserted: 0, skipped: true, reason: "no feed rows", ms: Date.now() - started };
    }

    const system = `You produce the "Recommended Strategy" win themes for a procurement strategy brief.
Propose 3-5 distinct WIN THEMES — strategic narratives this bidder should build the proposal around.
Each theme must:
- Be tied to what the State actually wants (inferred from the rows + mission context).
- Have a one-line key_message a reader could repeat from memory.
- Have a description with at least one concrete proof point grounded in the rows or mission context.
Never invent specific statistics or organizations not present in the inputs. If you do not have a proof point, say so plainly.`;

    const result = await callJsonExtractor<ThemeOut>({
      system,
      user: renderContext(mission, rows),
      toolName: "emit_win_themes",
      toolDescription: "Emit recommended win themes for the mission.",
      parametersSchema: {
        type: "object",
        properties: {
          themes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                key_message: { type: "string" },
                description: { type: "string" },
              },
              required: ["title", "key_message", "description"],
              additionalProperties: false,
            },
          },
        },
        required: ["themes"],
        additionalProperties: false,
      },
      zodSchema: ThemeSchema,
    });

    if (!result) {
      return { stage: "win_themes", inserted: 0, skipped: true, reason: "ai unavailable", ms: Date.now() - started };
    }

    await supabaseAdmin
      .from("win_themes")
      .delete()
      .eq("mission_id", data.missionId)
      .eq("created_by_system", true);

    if (result.themes.length === 0) return { stage: "win_themes", inserted: 0, ms: Date.now() - started };

    const inserts = result.themes.map((t) => ({
      mission_id: data.missionId,
      title: t.title,
      key_message: t.key_message,
      description: t.description,
      status: "active",
      created_by_system: true,
    }));

    const { error } = await supabaseAdmin.from("win_themes").insert(inserts);
    if (error) throw new Error(`insert win_themes: ${error.message}`);
    return { stage: "win_themes", inserted: inserts.length, ms: Date.now() - started };
  });
