// Atlas onboarding — Canon Starter Kit, IRIS source discovery, review queue.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withAICircuit } from "@/lib/ai-circuit-breaker";

/* ─────────── Canon Starter Kit (10 federal sources) ─────────── */

const CANON_STARTER_KIT = [
  { source_title: "42 CFR Part 438 — Managed Care", source_url: "https://www.ecfr.gov/current/title-42/chapter-IV/subchapter-C/part-438", issuing_authority: "CMS", source_type: "regulation", authority_score: 10, library_category: "Federal Regulations", summary: "Federal regulations governing Medicaid Managed Care Organizations (MCOs), PIHPs, and PAHPs." },
  { source_title: "42 CFR Part 441 Subpart G — HCBS Waivers (§1915(c))", source_url: "https://www.ecfr.gov/current/title-42/chapter-IV/subchapter-C/part-441/subpart-G", issuing_authority: "CMS", source_type: "regulation", authority_score: 10, library_category: "Federal Regulations", summary: "Home and Community-Based Services waiver program requirements." },
  { source_title: "Mental Health Parity and Addiction Equity Act (MHPAEA)", source_url: "https://www.cms.gov/marketplace/private-health-insurance/mental-health-parity-addiction-equity", issuing_authority: "CMS", source_type: "statute", authority_score: 10, library_category: "Federal Statutes", summary: "Parity requirements for behavioral health benefits in group/individual coverage and Medicaid." },
  { source_title: "EPSDT — Early and Periodic Screening, Diagnostic, and Treatment", source_url: "https://www.medicaid.gov/medicaid/benefits/early-and-periodic-screening-diagnostic-and-treatment/index.html", issuing_authority: "CMS / Medicaid.gov", source_type: "guidance", authority_score: 10, library_category: "Medicaid Authorities", summary: "Comprehensive child health benefit available to all Medicaid-enrolled children under 21." },
  { source_title: "SAMHSA — System of Care Framework", source_url: "https://www.samhsa.gov/childrens-awareness-day/past-events/2008/system-of-care", issuing_authority: "SAMHSA", source_type: "guidance", authority_score: 9, library_category: "CMS Guidance", summary: "Federal framework for coordinated children's behavioral health services." },
  { source_title: "Family First Prevention Services Act (FFPSA)", source_url: "https://www.acf.hhs.gov/cb/laws-policies/family-first-prevention-services-act-ffpsa", issuing_authority: "ACF / HHS", source_type: "statute", authority_score: 10, library_category: "Federal Statutes", summary: "2018 reform shifting Title IV-E funding toward family preservation and qualified residential treatment programs." },
  { source_title: "Medicaid Managed Care Quality Strategy Toolkit", source_url: "https://www.medicaid.gov/medicaid/quality-of-care/medicaid-managed-care/quality-of-care-performance-measurement/index.html", issuing_authority: "CMS", source_type: "guidance", authority_score: 9, library_category: "CMS Guidance", summary: "Quality strategy, EQR, and performance-measurement requirements for managed-care states." },
  { source_title: "MACPAC — Behavioral Health Reports", source_url: "https://www.macpac.gov/subtopic/behavioral-health/", issuing_authority: "MACPAC", source_type: "report", authority_score: 8, library_category: "MACPAC / MedPAC", summary: "Independent congressional advisory reports on Medicaid behavioral-health policy and financing." },
  { source_title: "KFF — Medicaid Managed Care Tracker", source_url: "https://www.kff.org/medicaid/state-indicator/total-medicaid-mcos/", issuing_authority: "Kaiser Family Foundation", source_type: "reference", authority_score: 7, library_category: "KFF Reference", summary: "State-by-state tracker of Medicaid MCO enrollment, plans, and structure." },
  { source_title: "Athena Proposal Writing Standards", source_url: "", issuing_authority: "Athena Strategy Group", source_type: "playbook", authority_score: 9, library_category: "Athena Methodologies", summary: "Internal writing voice, structure, evaluator alignment, and compliance checklist used on every Athena response." },
];

export const activateCanonStarterKit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    let inserted = 0, skipped = 0;
    for (const src of CANON_STARTER_KIT) {
      const { data: existing } = await supabase
        .from("atlas_sources")
        .select("id")
        .eq("source_title", src.source_title)
        .eq("knowledge_layer", "canon")
        .maybeSingle();
      if (existing) { skipped++; continue; }
      const { error } = await supabase.from("atlas_sources").insert({
        ...src,
        source_url: src.source_url || null,
        knowledge_layer: "canon",
        status: "active",
        tags: ["starter-kit"],
        ingested_by: userId,
      });
      if (error) throw new Error(error.message);
      inserted++;
    }
    return { inserted, skipped, total: CANON_STARTER_KIT.length };
  });

/* ─────────── IRIS source discovery (Lovable AI) ─────────── */

const DISCOVERY_SYSTEM = `You are IRIS, Athena Strategy Group's research analyst.
Given a Medicaid program (state + program name + program type), propose authoritative source documents that should populate Atlas's Program Intelligence layer.

For each source, return:
- source_title: official title
- source_url: best-available official URL (state agency, federal portal, contractor site) — leave blank if unknown
- issuing_authority: agency or organization
- source_type: one of [regulation, statute, manual, guidance, contract, rfp, report, dataset, reference]
- authority_score: 1-10 (10 = primary official source)
- library_category: one of [Program Overview, Population, Service Array, Operations, Quality & Reporting, Proposal Insights, Procurement, Regulations]
- summary: 1-2 sentence description of why it matters for proposals

Prefer official agency publications, contractor manuals, model contracts, state regulations, RFP archives, EQR reports, and quality dashboards.
Return 15-30 candidates. JSON only, no prose.`;

export const discoverProgramSources = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    programCode: z.string().min(2),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: program, error: pErr } = await supabase
      .from("atlas_programs")
      .select("program_code,program_name,program_type,state_code")
      .eq("program_code", data.programCode)
      .single();
    if (pErr || !program) throw new Error("Program not found.");

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured.");

    const userPrompt = `Program: ${program.program_name}
State: ${program.state_code ?? "—"}
Type: ${program.program_type ?? "Medicaid program"}

Propose 15-30 authoritative source documents for Atlas's Program Intelligence layer.`;

    const res = await withAICircuit(async () => {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: DISCOVERY_SYSTEM },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
        }),
      });
      if (r.status >= 500) throw new Error(`AI gateway ${r.status}`);
      return r;
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`IRIS discovery failed: ${res.status} ${txt.slice(0, 200)}`);
    }
    const j = await res.json();
    const raw = j.choices?.[0]?.message?.content ?? "{}";
    let parsed: any = {};
    try { parsed = JSON.parse(raw); } catch { parsed = {}; }
    const candidates: any[] = Array.isArray(parsed) ? parsed
      : Array.isArray(parsed.sources) ? parsed.sources
      : Array.isArray(parsed.candidates) ? parsed.candidates
      : Array.isArray(parsed.results) ? parsed.results
      : [];

    if (candidates.length === 0) {
      return { inserted: 0, skipped: 0, message: "IRIS returned no candidates." };
    }

    let inserted = 0, skipped = 0;
    for (const c of candidates) {
      const title = (c.source_title ?? c.title ?? "").toString().trim();
      if (!title) { skipped++; continue; }
      const { data: existing } = await supabase
        .from("atlas_sources")
        .select("id")
        .eq("source_title", title)
        .eq("program_code", program.program_code)
        .maybeSingle();
      if (existing) { skipped++; continue; }
      const { error } = await supabase.from("atlas_sources").insert({
        knowledge_layer: "program",
        program_code: program.program_code,
        state_code: program.state_code,
        source_title: title,
        source_url: c.source_url || null,
        issuing_authority: c.issuing_authority || null,
        source_type: c.source_type || null,
        authority_score: typeof c.authority_score === "number" ? Math.max(1, Math.min(10, c.authority_score)) : 7,
        library_category: c.library_category || null,
        summary: c.summary || null,
        status: "under_review",
        needs_human_review: true,
        ingested_by: userId,
        tags: ["iris-discovered"],
      });
      if (error) { /* swallow per-row to keep going */ skipped++; continue; }
      inserted++;
    }
    return { inserted, skipped, total: candidates.length };
  });

/* ─────────── Review queue ─────────── */

export const listReviewQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    layer: z.enum(["canon", "state", "program", "mission", "collective"]).optional(),
    programCode: z.string().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("atlas_sources")
      .select("id,source_title,source_url,knowledge_layer,authority_score,issuing_authority,library_category,summary,state_code,program_code,created_at")
      .eq("status", "under_review")
      .order("created_at", { ascending: false });
    if (data.layer) q = q.eq("knowledge_layer", data.layer);
    if (data.programCode) q = q.eq("program_code", data.programCode);
    const { data: rows, error } = await q.limit(500);
    if (error) throw new Error(error.message);
    return { sources: rows ?? [] };
  });

export const setSourceStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    ids: z.array(z.string().uuid()).min(1),
    status: z.enum(["active", "archived", "under_review"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("atlas_sources")
      .update({ status: data.status, needs_human_review: data.status !== "active" })
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    return { ok: true, count: data.ids.length };
  });

/* ─────────── Create program helper ─────────── */

export const createProgram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    program_code: z.string().min(2).max(40).regex(/^[A-Z0-9_]+$/),
    program_name: z.string().min(2),
    state_code: z.string().length(2),
    program_type: z.string().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("atlas_programs").insert({
      program_code: data.program_code,
      program_name: data.program_name,
      state_code: data.state_code,
      program_type: data.program_type ?? null,
      is_active: true,
    });
    if (error) throw new Error(error.message);
    return { ok: true, program_code: data.program_code };
  });
