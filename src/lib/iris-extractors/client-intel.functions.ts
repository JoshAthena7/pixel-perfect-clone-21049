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

  // ── Advocacy / CBO / research ecosystem ───────────────────────────────
  // Generic regex sweep — catch orgs explicitly named in the source docs.
  const advocacyPatterns: Array<[RegExp, string]> = [
    [/family[- ]?based services association of new jersey|\bfbsanj\b/i, "Family-Based Services Association of NJ (FBSANJ) — provider/advocacy coalition for children's behavioral health"],
    [/new jersey association of mental health and addiction agencies|\bnjamhaa\b/i, "NJ Association of Mental Health & Addiction Agencies (NJAMHAA) — provider association / policy advocacy"],
    [/mental health association in new jersey|\bmhanj\b/i, "Mental Health Association in NJ (MHANJ) — statewide mental health advocacy organization"],
    [/nami[- ]?new jersey|\bnami nj\b/i, "NAMI New Jersey — family & consumer mental health advocacy"],
    [/advocates for children of new jersey|\bacnj\b/i, "Advocates for Children of NJ (ACNJ) — statewide child welfare & policy advocacy"],
    [/association for children of new jersey/i, "Association for Children of NJ — child advocacy organization"],
    [/new jersey citizen action|\bnjca\b/i, "NJ Citizen Action — statewide policy advocacy coalition"],
    [/youth move|\byouthmove\b/i, "Youth MOVE NJ — youth-led peer advocacy organization"],
    [/family support organization|\bfso\b/i, "NJ Family Support Organizations (FSOs) — county-based parent/family peer advocacy network"],
    [/parents anonymous/i, "Parents Anonymous of NJ — parent peer support & advocacy"],
    [/(?:rutgers|montclair|princeton|seton hall|rowan|stockton|njit) (?:university|college|center|institute|school)/i, "Academic / research partner — university-based evaluation or technical assistance"],
    [/center of excellence|center for evidence[- ]based|behavioral health research/i, "Behavioral health research/evidence-based practice center — research & TA partner"],
    [/community[- ]based organization|\bcbo\b/i, "Community-based organizations (CBOs) — local service delivery & advocacy partners"],
    [/family voice|youth voice|lived experience|peer[- ]led/i, "Family/youth voice partners — lived-experience advisory stakeholders"],
    [/robert wood johnson|\brwjf\b|nicholson foundation|burke foundation|turrell fund/i, "Philanthropic funder (RWJF / Nicholson / Burke / Turrell) — funding & policy influence"],
  ];
  for (const [re, label] of advocacyPatterns) {
    if (re.test(text)) stakeholders.push(label);
  }

  // Always-add roster: when the scope is clearly NJ children's behavioral
  // health (CSOC / children's system of care / care management organization),
  // the ecosystem ALWAYS includes these advocacy & CBO actors — even if the
  // RFP doesn't name them. Add them with an "(inferred from scope)" note.
  const isNjChildBh =
    /\bcsoc\b|children[’']?s system of care|care management organization|\bcmo\b|mobile response and stabilization|\bmrss\b|perform care|children[’']?s mental health/i.test(text);
  if (isNjChildBh) {
    const alwaysAdd = [
      "Family-Based Services Association of NJ (FBSANJ) — provider/advocacy coalition for children's behavioral health (inferred from CSOC scope)",
      "NJ Association of Mental Health & Addiction Agencies (NJAMHAA) — provider association & policy advocacy (inferred from scope)",
      "Mental Health Association in NJ (MHANJ) — statewide advocacy (inferred from scope)",
      "NAMI New Jersey — family/consumer mental health advocacy (inferred from scope)",
      "Advocates for Children of NJ (ACNJ) — statewide child welfare & policy advocacy (inferred from scope)",
      "NJ Family Support Organizations (FSOs) — county-based parent/family peer advocacy network (inferred from CSOC scope)",
      "Youth MOVE NJ — youth-led peer advocacy (inferred from CSOC scope)",
      "PerformCare NJ — statewide Contracted System Administrator for CSOC (inferred from scope)",
      "Care Management Organizations (CMOs, 15 county-based) — intensive care coordination providers (inferred from CSOC scope)",
      "Mobile Response & Stabilization Services (MRSS) providers — crisis response network (inferred from CSOC scope)",
      "Rutgers University Behavioral Health Care / Rutgers School of Social Work — academic & research/evaluation partner (inferred from scope)",
      "Robert Wood Johnson Foundation — philanthropic funder & policy influence in NJ child health (inferred from scope)",
      "The Nicholson Foundation — NJ-focused philanthropic funder for vulnerable populations (inferred from scope)",
    ];
    for (const s of alwaysAdd) stakeholders.push(s);
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
    stakeholders: uniqueLines(stakeholders, 40),
    decision_makers: uniqueLines(decisionMakers, 10),
    meeting_cadence: meetingCadence,
  };
}

/**
 * Web "scrub" for advocacy orgs, CBOs, research/policy partners, family/youth
 * coalitions, and philanthropic funders touching this scope. Uses Firecrawl
 * search when FIRECRAWL_API_KEY is set; returns "" silently when not.
 *
 * The goal is to give the LLM a *real* roster of named advocates rather than
 * relying solely on whatever the RFP happens to cite, so the Stakeholder
 * section comes back sharp and source-grounded.
 */
async function scrubAdvocatesFromWeb(mission: any, docText: string): Promise<{
  webContext: string;
  sources: Array<{ url: string; title?: string }>;
}> {
  const firecrawlKey = process.env.FIRECRAWL_API_KEY;
  if (!firecrawlKey) return { webContext: "", sources: [] };

  const state = String(mission?.state ?? "").trim();
  const agency = String(mission?.state_agency ?? "").trim();
  const program = String(mission?.program_type ?? mission?.name ?? "").trim();

  // Detect scope hints from doc text + mission so queries are sharp.
  const lower = (docText + " " + program).toLowerCase();
  const isChildBh =
    /\bcsoc\b|children'?s system of care|children'?s behavioral health|care management organization|\bcmo\b|\bmrss\b|perform ?care|youth mental health/i.test(
      lower,
    );
  const isMedicaid = /\bmedicaid\b|\bdmahs\b|managed care|mco\b/i.test(lower);
  const isChildWelfare = /child welfare|foster care|dcp&p|\bdcf\b|child protection/i.test(lower);
  const isJuvenileJustice = /juvenile justice|justice[- ]involved youth|\bjjc\b/i.test(lower);

  const stateOrUS = state || "United States";
  const queries = new Set<string>();
  // Always-on baseline
  queries.add(`${stateOrUS} ${program || "human services"} advocacy organizations`);
  queries.add(`${stateOrUS} community based organizations ${program || "health and human services"} coalition`);
  queries.add(`${stateOrUS} policy advocacy ${program || "human services"} nonprofit`);
  queries.add(`${stateOrUS} ${program || ""} family youth peer advocacy organization`);
  if (agency) queries.add(`${agency} stakeholder advocacy coalition partners`);
  // Scope-specific
  if (isChildBh) {
    queries.add(`${stateOrUS} children's behavioral health advocacy organization`);
    queries.add(`${stateOrUS} family support organization FSO children mental health`);
    queries.add(`${stateOrUS} NAMI MHA youth move children`);
  }
  if (isMedicaid) {
    queries.add(`${stateOrUS} Medicaid advocacy organization consumer coalition`);
  }
  if (isChildWelfare) {
    queries.add(`${stateOrUS} child welfare advocacy organization`);
  }
  if (isJuvenileJustice) {
    queries.add(`${stateOrUS} juvenile justice reform advocacy organization`);
  }
  // Research / academic partners
  queries.add(`${stateOrUS} university research center ${program || "behavioral health"} evaluation partner`);
  // Philanthropic funders
  queries.add(`${stateOrUS} foundation funder ${program || "health"} children youth`);

  const sources: Array<{ url: string; title?: string }> = [];
  const blocks: string[] = [];
  let blockIdx = 1;

  // Run queries in parallel, cap at 8 to keep latency + cost bounded.
  const queryList = Array.from(queries).slice(0, 8);
  const results = await Promise.allSettled(
    queryList.map((q) =>
      fetch("https://api.firecrawl.dev/v2/search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${firecrawlKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: q,
          limit: 5,
          scrapeOptions: { formats: ["markdown"] },
        }),
      }).then(async (r) => ({ q, ok: r.ok, json: r.ok ? await r.json() : null })),
    ),
  );

  const seenUrls = new Set<string>();
  for (const settled of results) {
    if (settled.status !== "fulfilled" || !settled.value.ok || !settled.value.json) continue;
    const { q, json } = settled.value as {
      q: string;
      json: { data?: Array<{ url?: string; title?: string; markdown?: string; description?: string }> };
    };
    const hits = (json.data ?? []).slice(0, 3);
    if (hits.length === 0) continue;
    blocks.push(`### Query: ${q}`);
    for (const h of hits) {
      if (!h.url || seenUrls.has(h.url)) continue;
      seenUrls.add(h.url);
      sources.push({ url: h.url, title: h.title });
      const snippet = (h.markdown ?? h.description ?? "").replace(/\s+/g, " ").slice(0, 900);
      blocks.push(`[${blockIdx}] ${h.title ?? h.url} — ${h.url}\n${snippet}`);
      blockIdx += 1;
    }
  }

  const webContext = blocks.join("\n\n").slice(0, 24_000);
  return { webContext, sources };
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
