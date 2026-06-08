import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ClientIntelEntrySchema = z.union([
  z.string().max(500),
  z.object({
    name: z.string().max(200),
    role: z.string().max(300),
    notes: z.string().max(600).optional(),
  }),
]);

const ClientIntelSchema = z.object({
  contacts: z.array(ClientIntelEntrySchema).max(15),
  decision_makers: z.array(ClientIntelEntrySchema).max(10),
  relationship_owners: z.array(ClientIntelEntrySchema).max(10),
  stakeholders: z.array(ClientIntelEntrySchema).max(15),
  political_considerations: z.string().max(1200),
  meeting_cadence: z.string().max(400).optional(),
  notes: z.string().max(1500),
});
type ClientIntelEntry = z.infer<typeof ClientIntelEntrySchema>;
type ClientIntelOut = z.infer<typeof ClientIntelSchema>;

export const extractClientIntel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ missionId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const started = Date.now();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadMissionAndFeed, renderContext, callJsonExtractor } =
      await import("./shared.server");

    const { mission, rows } = await loadMissionAndFeed(supabaseAdmin, data.missionId);

    // Pull every document source used by setup/the Vault. Named agency POCs
    // usually live in the RFP cover page or capture notes, not market rows.
    const [missionDocs, vaultDocs, libraryExtractions] = await Promise.all([
      supabaseAdmin
        .from("mission_documents")
        .select("file_name,document_type,extracted_text")
        .eq("mission_id", data.missionId)
        .eq("processing_status", "complete")
        .not("extracted_text", "is", null)
        .order("created_at", { ascending: false })
        .limit(8),
      supabaseAdmin
        .from("mission_vault_documents")
        .select("title,category,extracted_text")
        .eq("mission_id", data.missionId)
        .not("extracted_text", "is", null)
        .order("created_at", { ascending: false })
        .limit(10),
      supabaseAdmin
        .from("document_extractions")
        .select("extracted_text,summary,mission_library!inner(name,category,mission_id)")
        .eq("mission_id", data.missionId)
        .eq("status", "ready")
        .limit(10),
    ]);
    const sourceParts = [
      ...((missionDocs.data ?? []) as Array<{ document_type?: string | null; file_name?: string | null; extracted_text?: string | null }>).map((d) => ({
        label: `${d.document_type ?? "Document"}: ${d.file_name ?? "Uploaded document"}`,
        text: d.extracted_text,
      })),
      ...((vaultDocs.data ?? []) as Array<{ category?: string | null; title?: string | null; extracted_text?: string | null }>).map((d) => ({
        label: `${d.category ?? "Vault"}: ${d.title ?? "Vault document"}`,
        text: d.extracted_text,
      })),
      ...((libraryExtractions.data ?? []) as Array<{
        extracted_text?: string | null;
        summary?: string | null;
        mission_library?: { category?: string | null; name?: string | null } | null;
      }>).map((d) => ({
        label: `${d.mission_library?.category ?? "Library"}: ${d.mission_library?.name ?? "Library document"}`,
        text: d.extracted_text ?? d.summary,
      })),
    ];
    const docText = sourceParts
      .map((d) => `--- ${d.label} ---\n${String(d.text ?? "").slice(0, 8000)}`)
      .join("\n\n")
      .slice(0, 80_000);

    const system = `You produce the "Agency Intelligence" setup record for a procurement strategy brief.
Extract who matters on the ISSUING AGENCY side from the mission metadata, RFP cover pages, procurement instructions, capture notes, org charts, meeting summaries, and market context.
Arrays may contain named people OR clearly supported agency-side offices/roles when no name is provided, formatted as "Name or Office — Role (evidence)". Never invent names.
contacts = solicitation POCs, contracting/procurement officers, email/phone contacts, program contacts.
stakeholders = issuing agency, program office, oversight entities, affected agency-side units.
decision_makers = named approvers/evaluators OR documented decision bodies/roles such as evaluation committee, procurement director, agency executive.
relationship_owners = internal/client-side people only if capture notes explicitly identify who owns the agency relationship; otherwise leave empty.
For political_considerations and meeting_cadence, summarize supported evidence or write a concise "No documented ... found" statement. Honesty over completeness.`;

    const result = await callJsonExtractor<ClientIntelOut>({
      system,
      user:
        renderContext(mission, rows) +
        (docText ? `\n\n=== UPLOADED MISSION DOCUMENTS ===\n${docText}` : ""),
      toolName: "emit_client_intel",
      toolDescription: "Emit the client intelligence record for this mission.",
      parametersSchema: {
        type: "object",
        properties: {
          contacts: {
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
          relationship_owners: {
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
        required: [
          "contacts",
          "decision_makers",
          "relationship_owners",
          "stakeholders",
          "political_considerations",
          "notes",
        ],
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

    // Flatten model output into strings the setup form renders.
    const flatten = (arr: ClientIntelEntry[]) =>
      arr
        .map((x) => {
          if (typeof x === "string") return x.trim();
          const head = [x.name, x.role].filter(Boolean).join(" — ");
          return x.notes ? `${head} (${x.notes})` : head;
        })
        .filter(Boolean);

    const newContacts = flatten(result.contacts);
    const newStakeholders = flatten(result.stakeholders);
    const newDecisionMakers = flatten(result.decision_makers);
    const newRelationshipOwners = flatten(result.relationship_owners);

    // Merge with any existing row (manual entries / importer-populated values).
    const { data: existing } = await supabaseAdmin
      .from("mission_client_intel")
      .select("contacts,stakeholders,decision_makers,relationship_owners,political_considerations,meeting_cadence,notes")
      .eq("mission_id", data.missionId)
      .maybeSingle();
    const asStrings = (v: unknown): string[] =>
      Array.isArray(v)
        ? v
            .map((x) => {
              if (typeof x === "string") return x.trim();
              if (x && typeof x === "object") {
                const obj = x as { name?: unknown; role?: unknown; notes?: unknown };
                const head = [obj.name, obj.role]
                  .map((part) => String(part ?? "").trim())
                  .filter(Boolean)
                  .join(" — ");
                return obj.notes ? `${head} (${String(obj.notes).trim()})` : head;
              }
              return "";
            })
            .filter(Boolean)
        : [];
    const merge = (a: string[], b: string[]) => {
      const seen = new Set(a.map((s) => s.toLowerCase()));
      const out = [...a];
      for (const x of b) {
        if (!seen.has(x.toLowerCase())) {
          out.push(x);
          seen.add(x.toLowerCase());
        }
      }
      return out;
    };

    const { error } = await supabaseAdmin
      .from("mission_client_intel")
      .upsert({
        mission_id: data.missionId,
        contacts: merge(asStrings(existing?.contacts), newContacts),
        stakeholders: merge(asStrings(existing?.stakeholders), newStakeholders),
        decision_makers: merge(asStrings(existing?.decision_makers), newDecisionMakers),
        relationship_owners: merge(asStrings(existing?.relationship_owners), newRelationshipOwners),
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
