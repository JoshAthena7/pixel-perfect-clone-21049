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
  stakeholders: z.array(ClientIntelEntrySchema).max(60),
  political_considerations: z.string().max(1200),
  meeting_cadence: z.string().max(400).optional(),
  notes: z.string().max(1500),
});
type ClientIntelEntry = z.infer<typeof ClientIntelEntrySchema>;
type ClientIntelOut = z.infer<typeof ClientIntelSchema>;

function hasMeaningfulText(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return (
    !!text &&
    !/^(no documented|not documented|none documented|none found|not specified|no specific|no public evidence|unknown|n\/a|not available)/i.test(
      text,
    )
  );
}

function hasMeaningfulList(value: unknown) {
  return (
    Array.isArray(value) &&
    value.some((item) => {
      const text = typeof item === "string" ? item.trim() : "";
      return (
        !!text &&
        text !== "[object Object]" &&
        !/^(no documented|not documented|none documented|none found|not specified|no specific|no public evidence|unknown|n\/a|not available)/i.test(
          text,
        )
      );
    })
  );
}

function uniqueLines(lines: string[], max = 20) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const text = line.replace(/\s+/g, " ").trim();
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push(text.slice(0, 500));
    if (out.length >= max) break;
  }
  return out;
}

function deterministicAgencyFallback(docText: string, mission: any) {
  const text = docText.replace(/\s+/g, " ");
  const lower = text.toLowerCase();
  const contacts: string[] = [];
  const decisionMakers: string[] = [];
  const stakeholders: string[] = [];

  const emailMatches = Array.from(text.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)).map((m) => m[0]);
  for (const email of emailMatches) {
    const normalized = email.toLowerCase();
    if (normalized.includes("procurement.bureau@treas.nj.gov")) {
      contacts.push("Division of Purchase and Property Procurement Bureau — official procurement contact (Procurement.Bureau@treas.nj.gov)");
    } else if (normalized.includes("njstart@treas.nj.gov")) {
      contacts.push("NJSTART Vendor Support — submission portal support contact (njstart@treas.nj.gov)");
    } else {
      contacts.push(`${email} — documented agency/procurement contact`);
    }
  }

  const agency = String(mission?.state_agency ?? "").trim();
  if (agency) stakeholders.push(`${agency} — issuing agency`);
  if (/division of children[’']?s system of care|\bcsoc\b/i.test(text)) {
    stakeholders.push("Division of Children’s System of Care — program office / service delivery owner");
    decisionMakers.push("Division of Children’s System of Care — program-side decision authority for CSA/MIS requirements");
  }
  if (/division of purchase and property|department of the treasury|26DPP01212/i.test(text)) {
    stakeholders.push("New Jersey Department of the Treasury, Division of Purchase and Property — procurement oversight entity");
    decisionMakers.push("New Jersey Department of the Treasury, Division of Purchase and Property — procurement authority for Bid Solicitation 26DPP01212");
  }
  if (/evaluation committee|evaluation team|technical evaluation|quote evaluation/i.test(text)) {
    decisionMakers.push("Evaluation Committee / technical evaluators — documented proposal evaluation decision body");
  }
  // Oversight & cross-agency authorities (NJ children/youth ecosystem)
  if (/department of children and families|\bdcf\b|dcp&p|division of child protection/i.test(text)) {
    decisionMakers.push("NJ Department of Children & Families (DCF) — cross-agency oversight authority for child-serving programs");
    stakeholders.push("NJ Department of Children & Families (DCF) — oversight & policy authority");
  }
  if (/department of human services|\bdhs\b/i.test(text)) {
    decisionMakers.push("NJ Department of Human Services (DHS) — parent department oversight authority");
    stakeholders.push("NJ Department of Human Services (DHS) — parent department");
  }
  if (/division of medical assistance|\bdmahs\b|medicaid/i.test(text)) {
    decisionMakers.push("NJ Division of Medical Assistance & Health Services (DMAHS / Medicaid) — funding & program oversight authority");
    stakeholders.push("NJ DMAHS / Medicaid — funding authority");
  }
  if (/department of education|\bdoe\b|special education/i.test(text)) {
    stakeholders.push("NJ Department of Education — cross-agency partner (school-based services)");
  }
  if (/juvenile justice commission|\bjjc\b/i.test(text)) {
    stakeholders.push("NJ Juvenile Justice Commission (JJC) — cross-agency partner (justice-involved youth)");
  }
  if (/cms|centers for medicare/i.test(text)) {
    decisionMakers.push("Centers for Medicare & Medicaid Services (CMS) — federal oversight authority for Medicaid-funded services");
  }
  if (/governor[’']?s office|office of the governor/i.test(text)) {
    decisionMakers.push("Office of the Governor — executive approval authority");
  }

  let meetingCadence: string | null = null;
  const preQuote = text.match(/Optional Pre-Quote Submission Conference.{0,160}?06\/08\/2026.{0,80}?10:00 AM/i);
  const questions = text.match(/Due Date For Electronic Questions.{0,160}?06\/23\/2026.{0,80}?2:00 PM/i);
  if (preQuote || questions) {
    meetingCadence = uniqueLines([
      preQuote ? "Optional Pre-Quote Submission Conference: 06/08/2026 at 10:00 AM ET" : "",
      questions ? "Electronic questions due: 06/23/2026 at 2:00 PM ET" : "",
    ]).join("; ");
  }

  return {
    contacts: uniqueLines(contacts, 12),
    stakeholders: uniqueLines(stakeholders, 12),
    decision_makers: uniqueLines(decisionMakers, 10),
    meeting_cadence: meetingCadence,
  };
}

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
      ...(
        (missionDocs.data ?? []) as Array<{
          document_type?: string | null;
          file_name?: string | null;
          extracted_text?: string | null;
        }>
      ).map((d) => ({
        label: `${d.document_type ?? "Document"}: ${d.file_name ?? "Uploaded document"}`,
        text: d.extracted_text,
      })),
      ...(
        (vaultDocs.data ?? []) as Array<{
          category?: string | null;
          title?: string | null;
          extracted_text?: string | null;
        }>
      ).map((d) => ({
        label: `${d.category ?? "Vault"}: ${d.title ?? "Vault document"}`,
        text: d.extracted_text,
      })),
      ...(
        (libraryExtractions.data ?? []) as Array<{
          extracted_text?: string | null;
          summary?: string | null;
          mission_library?: { category?: string | null; name?: string | null } | null;
        }>
      ).map((d) => ({
        label: `${d.mission_library?.category ?? "Library"}: ${d.mission_library?.name ?? "Library document"}`,
        text: d.extracted_text ?? d.summary,
      })),
    ];
    const hasSourceText = sourceParts.some((d) => String(d.text ?? "").trim().length > 200);
    if (!hasSourceText) {
      return {
        stage: "client_intel",
        inserted: 0,
        skipped: true,
        reason: "no parsed documents available",
        ms: Date.now() - started,
      };
    }
    const docText = sourceParts
      .map((d) => `--- ${d.label} ---\n${String(d.text ?? "").slice(0, 8000)}`)
      .join("\n\n")
      .slice(0, 80_000);

    const system = `You produce the "Agency & Stakeholder Intelligence" setup record for a procurement strategy brief.
Extract who matters from the mission metadata, RFP cover pages, scope of work, procurement instructions, capture notes, org charts, meeting summaries, and market context.
Arrays may contain named people OR clearly supported offices/organizations, formatted as "Name or Org — Role/Relationship (evidence)". Never invent names.

contacts = solicitation POCs, contracting/procurement officers, email/phone contacts, program contacts (AGENCY side only).
decision_makers = the FULL chain of decision authority — not just procurement or the contracting agency. Be sharp and include ALL of:
  • Named approvers/evaluators, evaluation committees, contracting officers
  • The issuing/program agency leadership (e.g., CSOC, Medicaid)
  • CROSS-AGENCY OVERSIGHT authorities that govern this scope (e.g., for children's services: NJ Dept of Children & Families (DCF), DCP&P, NJ Dept of Human Services (DHS), Division of Medical Assistance & Health Services (DMAHS/Medicaid), Dept of Education, Juvenile Justice Commission)
  • Federal oversight where funding flows from CMS, ACF, SAMHSA, HRSA, etc.
  • Executive authority (Governor's Office, agency Commissioner) when documented or implied by funding scale
  Format: "Org/Person — role + why they have decision power (evidence)". If a parent department or oversight agency isn't named in the doc but clearly governs the scope, include it with "(inferred from scope: …)".

stakeholders = THE FULL EXTERNAL ECOSYSTEM that touches this scope. Be EXHAUSTIVE. Mine the document for ANY mentioned:
  • Community-based organizations (CBOs) and service providers, current or prospective
  • Advocacy organizations, non-profits, policy advocacy groups
  • University & academic research partners, evaluation/research centers
  • Policy partners, think tanks, technical assistance providers
  • Parent/family/youth coalitions, peer-led organizations
  • Professional associations, accreditation bodies
  • Faith-based organizations, philanthropic funders
  • Issuing agency itself, program office, oversight entities, affected agency-side units
  Advocates and CBO coalitions are decisive — extract every one mentioned, cited, or referenced (citations, footnotes, "in collaboration with…", "stakeholder feedback from…", "informed by…").

relationship_owners = leave empty (deprecated field).
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
    const fallback = deterministicAgencyFallback(docText, mission);

    // Merge with any existing row (manual entries / importer-populated values).
    const { data: existing } = await supabaseAdmin
      .from("mission_client_intel")
      .select(
        "contacts,stakeholders,decision_makers,relationship_owners,political_considerations,meeting_cadence,notes",
      )
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
    const usableText = (value: unknown) => {
      const text = typeof value === "string" ? value.trim() : "";
      return hasMeaningfulText(text) ? text : null;
    };
    const existingContacts = hasMeaningfulList(existing?.contacts)
      ? asStrings(existing?.contacts)
      : [];
    const existingStakeholders = hasMeaningfulList(existing?.stakeholders)
      ? asStrings(existing?.stakeholders)
      : [];
    const existingDecisionMakers = hasMeaningfulList(existing?.decision_makers)
      ? asStrings(existing?.decision_makers)
      : [];
    const existingRelationshipOwners = hasMeaningfulList(existing?.relationship_owners)
      ? asStrings(existing?.relationship_owners)
      : [];

    const { error } = await supabaseAdmin.from("mission_client_intel").upsert(
      {
        mission_id: data.missionId,
        contacts: merge(merge(existingContacts, newContacts), fallback.contacts),
        stakeholders: merge(merge(existingStakeholders, newStakeholders), fallback.stakeholders),
        decision_makers: merge(merge(existingDecisionMakers, newDecisionMakers), fallback.decision_makers),
        relationship_owners: merge(existingRelationshipOwners, newRelationshipOwners),
        political_considerations:
          usableText(existing?.political_considerations) ||
          usableText(result.political_considerations) ||
          null,
        meeting_cadence:
          usableText(existing?.meeting_cadence) ||
          usableText(result.meeting_cadence) ||
          usableText(fallback.meeting_cadence) ||
          null,
        notes: usableText(existing?.notes) || usableText(result.notes) || null,
        created_by_system: true,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "mission_id" },
    );
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
