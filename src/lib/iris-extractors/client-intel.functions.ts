import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ClientIntelSchema = z.object({
  decision_makers: z
    .array(z.object({ name: z.string().max(120), role: z.string().max(180), notes: z.string().max(400).optional() }))
    .max(10),
  stakeholders: z
    .array(z.object({ name: z.string().max(120), role: z.string().max(180), notes: z.string().max(400).optional() }))
    .max(15),
  political_considerations: z.string().max(1200),
  meeting_cadence: z.string().max(400).optional(),
  notes: z.string().max(1500),
});
type ClientIntelOut = z.infer<typeof ClientIntelSchema>;

export const extractClientIntel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ missionId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const started = Date.now();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadMissionAndFeed, renderContext, callJsonExtractor } = await import("./shared.server");

    const { mission, rows } = await loadMissionAndFeed(supabaseAdmin, data.missionId);

    const system = `You produce the "Client Intel" record for a procurement strategy brief.
List only people, considerations, and dynamics you can support from the provided context — never invent contacts.
If a field has no supporting evidence, leave the array empty or write "No public evidence available" in the notes/political_considerations fields. Honesty over completeness.`;

    const result = await callJsonExtractor<ClientIntelOut>({
      system,
      user: renderContext(mission, rows),
      toolName: "emit_client_intel",
      toolDescription: "Emit the client intelligence record for this mission.",
      parametersSchema: {
        type: "object",
        properties: {
          decision_makers: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                role: { type: "string" },
                notes: { type: "string" },
              },
              required: ["name", "role"],
              additionalProperties: false,
            },
          },
          stakeholders: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                role: { type: "string" },
                notes: { type: "string" },
              },
              required: ["name", "role"],
              additionalProperties: false,
            },
          },
          political_considerations: { type: "string" },
          meeting_cadence: { type: "string" },
          notes: { type: "string" },
        },
        required: ["decision_makers", "stakeholders", "political_considerations", "notes"],
        additionalProperties: false,
      },
      zodSchema: ClientIntelSchema,
    });

    if (!result) {
      return {
        stage: "client_intel",
        inserted: 0,
        skipped: true,
        reason: "ai unavailable",
        ms: Date.now() - started,
      };
    }

    // Upsert (one row per mission). Delete then insert to keep idempotent.
    await supabaseAdmin
      .from("mission_client_intel")
      .delete()
      .eq("mission_id", data.missionId)
      .eq("created_by_system", true);

    const { error } = await supabaseAdmin.from("mission_client_intel").insert({
      mission_id: data.missionId,
      contacts: [],
      stakeholders: result.stakeholders,
      decision_makers: result.decision_makers,
      relationship_owners: [],
      political_considerations: result.political_considerations,
      meeting_cadence: result.meeting_cadence ?? null,
      notes: result.notes,
      created_by_system: true,
    });
    if (error) throw new Error(`insert client_intel: ${error.message}`);
    return { stage: "client_intel", inserted: 1, ms: Date.now() - started };
  });
