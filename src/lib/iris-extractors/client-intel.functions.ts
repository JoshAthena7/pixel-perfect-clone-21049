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

    // ALSO pull uploaded mission documents — RFP cover pages, capture notes,
    // org charts, meeting summaries. These are where named contacts live.
    const { data: docs } = await supabaseAdmin
      .from("mission_documents")
      .select("file_name,document_type,extracted_text")
      .eq("mission_id", data.missionId)
      .eq("processing_status", "complete")
      .not("extracted_text", "is", null)
      .order("created_at", { ascending: false })
      .limit(8);
    const docText = (docs ?? [])
      .map((d: any) => `--- ${d.document_type}: ${d.file_name} ---\n${String(d.extracted_text ?? "").slice(0, 8000)}`)
      .join("\n\n")
      .slice(0, 60_000);

    const system = `You produce the "Client Intel" record for a procurement strategy brief.
List only people, considerations, and dynamics you can support from the provided context — never invent contacts.
If a field has no supporting evidence, leave the array empty or write "No public evidence available" in the notes/political_considerations fields. Honesty over completeness.`;

    const result = await callJsonExtractor<ClientIntelOut>({
      system,
      user: renderContext(mission, rows) + (docText ? `\n\n=== UPLOADED MISSION DOCUMENTS ===\n${docText}` : ""),
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

    const { upsertNode, recordEdges, clearMissionOutputGraph, upsertFeedNodes } =
      await import("@/lib/iris-graph.server");

    await clearMissionOutputGraph(supabaseAdmin, data.missionId, "client_intel");

    // Flatten {name, role, notes} objects into strings the setup form renders.
    const flatten = (arr: Array<{ name: string; role: string; notes?: string }>) =>
      arr.map((x) => {
        const head = [x.name, x.role].filter(Boolean).join(" — ");
        return x.notes ? `${head} (${x.notes})` : head;
      }).filter(Boolean);

    const newStakeholders = flatten(result.stakeholders);
    const newDecisionMakers = flatten(result.decision_makers);

    // Merge with any existing row (manual entries / importer-populated values).
    const { data: existing } = await supabaseAdmin
      .from("mission_client_intel")
      .select("contacts,stakeholders,decision_makers,relationship_owners,political_considerations,meeting_cadence,notes")
      .eq("mission_id", data.missionId)
      .maybeSingle();
    const asStrings = (v: unknown): string[] =>
      Array.isArray(v) ? v.map((x) => (typeof x === "string" ? x : "")).filter(Boolean) : [];
    const merge = (a: string[], b: string[]) => {
      const seen = new Set(a.map((s) => s.toLowerCase()));
      const out = [...a];
      for (const x of b) if (!seen.has(x.toLowerCase())) { out.push(x); seen.add(x.toLowerCase()); }
      return out;
    };

    const { error } = await supabaseAdmin
      .from("mission_client_intel")
      .upsert({
        mission_id: data.missionId,
        contacts: asStrings(existing?.contacts),
        stakeholders: merge(asStrings(existing?.stakeholders), newStakeholders),
        decision_makers: merge(asStrings(existing?.decision_makers), newDecisionMakers),
        relationship_owners: asStrings(existing?.relationship_owners),
        political_considerations: existing?.political_considerations || result.political_considerations || null,
        meeting_cadence: existing?.meeting_cadence || result.meeting_cadence || null,
        notes: existing?.notes || result.notes || null,
        created_by_system: true,
        updated_at: new Date().toISOString(),
      } as never, { onConflict: "mission_id" });
    if (error) throw new Error(`upsert client_intel: ${error.message}`);

    if (rows.length > 0) {
      const nodeId = await upsertNode(supabaseAdmin, {
        mission_id: data.missionId,
        kind: "client_intel",
        ref_table: "mission_client_intel",
        ref_id: data.missionId,
        label: "Client Intel",
        domain: "stakeholder",
        metadata: {
          decision_makers: result.decision_makers.length,
          stakeholders: result.stakeholders.length,
        },
      });
      const rowNodeIds = await upsertFeedNodes(supabaseAdmin, data.missionId, rows);
      const cited = rows.slice(0, 5); // top contextual rows
      const edges: Parameters<typeof recordEdges>[1] = [];
      for (const r of cited) {
        const srcId = rowNodeIds.get(r.id);
        if (!srcId) continue;
        edges.push({
          mission_id: data.missionId,
          src_node_id: srcId,
          dst_node_id: nodeId,
          edge_type: "derived_from",
          weight: 0.4,
          provenance: {
            extractor: "client_intel",
            row_source: r.source,
            row_url: r.url,
            row_published_at: r.published_at,
          },
        });
      }
      await recordEdges(supabaseAdmin, edges);
    }

    return { stage: "client_intel", inserted: 1, ms: Date.now() - started };
  });
