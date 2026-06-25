/**
 * ORACLE Document Processor — server-only logic.
 *
 * Document-type-aware extraction:
 *   - Selects an ExtractionTemplate based on document_type + content_type_hint
 *   - RFPs / State Plans chunk on section boundaries (keeps requirements intact)
 *   - Writing guides are stored as mission configuration (no oracle_signals)
 *   - All other types use a standard chunker with type-specific prompts
 *
 * Pipeline:
 *   1. Pick template
 *   2. Chunk text (section-aware when requested)
 *   3. Call Lovable AI Gateway per chunk
 *   4. Deduplicate by title similarity
 *   5. Insert into oracle_signals (tier='mission', status='needs_review')
 *   6. Update mission_documents.processing_status throughout
 *   7. For primary_rfp: also extract TOC into mission_documents.toc_data
 *   8. Write a mission_assist_events row on success
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

const STANDARD_CHUNK_SIZE = 4_000;
const STANDARD_CHUNK_OVERLAP = 500;
const MAX_CHARS = 100_000;
const MAX_CHUNKS = 20;

const VALID_CATEGORIES = new Set([
  "regulatory_federal",
  "regulatory_state",
  "quality_performance",
  "health_outcomes_sdoh",
  "policy_innovation",
  "evidence_base",
  "field_intelligence",
  "competitive_landscape",
  "client_content_map",
]);
const VALID_AUTHORITY = new Set(["primary", "secondary", "tertiary", "field"]);
const VALID_URGENCY = new Set(["immediate", "high", "normal", "low"]);

type ExtractedItem = {
  title: string;
  what_happened: string;
  why_it_matters: string;
  recommended_action: string | null;
  category: string;
  authority: string;
  urgency: string;
  relevance_score: number;
  topic_tags: string[];
  section_reference?: string | null;
};

type ChunkStrategy = "section_boundary" | "standard";

type ExtractionTemplate = {
  id: string;
  systemPrompt: string;
  chunkStrategy: ChunkStrategy;
  defaultCategory: string;
  defaultSubcategory: string | null;
  defaultUrgency: string;
  defaultAuthority: string;
  relevanceFloor: number;
  // null = treat as oracle_signal extraction. Other = special-case storage.
  specialHandling?: "style_guide" | "response_outline" | "compliance_extraction" | null;
};

export type ProcessInput = {
  documentId: string;
  missionId: string;
  extractedText: string;
  documentTitle: string;
  documentType: string;
  contentTypeHint?: string | null;
  userId: string | null;
};

export type ProcessResult = {
  items_extracted: number;
  chunks_processed: number;
  toc_entries: number;
  template_id: string;
  note?: string;
};

// ============================================================
// Template selector
// ============================================================

export function selectExtractionTemplate(
  documentType: string,
  contentTypeHint: string | null | undefined,
  documentTitle?: string,
): ExtractionTemplate {
  const hint = normalizeHint(contentTypeHint);
  const titleLower = (documentTitle ?? "").toLowerCase();

  // Style guide always wins — never produces oracle_signals.
  if (hint === "writing_standards" || /style\s*guide|writing\s*(guide|standard)|voice\s*and\s*tone/.test(titleLower)) {
    return TEMPLATES.style_guide;
  }

  // Response outline — client-provided structure for how to answer each question.
  if (hint === "response_outline" || /response\s*outline|response\s*structure|response\s*template/.test(titleLower)) {
    return TEMPLATES.response_outline;
  }

  // Model Contract & Scope of Work — compliance obligation extraction.
  if (documentType === "model_contract" || /\bmodel\s*contract\b|state\s*contract/.test(titleLower)) {
    return TEMPLATES.model_contract;
  }
  if (documentType === "scope_of_work" || /\bscope\s*of\s*work\b|\bsow\b|statement\s*of\s*work/.test(titleLower)) {
    return TEMPLATES.scope_of_work;
  }

  // Primary RFP always uses Template 1 regardless of hint.
  if (documentType === "primary_rfp") return TEMPLATES.primary_rfp;

  // State Plan: Procurement hint + title mentions "state plan".
  if (hint === "procurement" && /state\s*plan/.test(titleLower)) {
    return TEMPLATES.state_plan;
  }

  if (hint === "procurement") return TEMPLATES.primary_rfp;
  if (hint === "competitive_intel") return TEMPLATES.competitive_intel;
  if (hint === "client_strategy") return TEMPLATES.client_strategy;
  if (hint === "reference") return TEMPLATES.reference;

  // No hint → fall back on document_type.
  if (documentType === "state_plan") return TEMPLATES.state_plan;
  return TEMPLATES.reference;
}

// Accepts both the wizard pill labels ("Procurement", "Comp Intel") and the
// stored document_purpose enum values ("procurement", "competitive_intel"…).
function normalizeHint(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (s === "procurement") return "procurement";
  if (s === "comp intel" || s === "competitive_intel" || s === "competitive intel") return "competitive_intel";
  if (s === "writing guide" || s === "writing_standards" || s === "style guide") return "writing_standards";
  if (s === "client strategy" || s === "client_strategy") return "client_strategy";
  if (s === "reference") return "reference";
  if (s === "response outline" || s === "response_outline") return "response_outline";
  return null;
}

const TEMPLATES: Record<string, ExtractionTemplate> = {
  primary_rfp: {
    id: "primary_rfp",
    chunkStrategy: "section_boundary",
    relevanceFloor: 75,
    defaultCategory: "regulatory_state",
    defaultSubcategory: "state_contract_requirement",
    defaultUrgency: "high",
    defaultAuthority: "primary",
    systemPrompt: `You are ORACLE extracting procurement intelligence from a Medicaid managed care RFP.
This is the primary bid solicitation document. Extract only items that reveal:
- Scored evaluation criteria (what evaluators will score and how much it's worth)
- Compliance requirements (shall, must, will be required to — specific obligations)
- Performance standards and metrics (thresholds, benchmarks, measurement periods)
- Deliverables and reporting requirements (what must be submitted, when, to whom)
- Competitive positioning signals (what the state emphasizes, what concerns they signal)

DO NOT extract: administrative submission instructions, font/format requirements,
boilerplate legal language, standard definitions unless substantively different.

For each item include the section reference if identifiable.
Return JSON only.`,
  },
  state_plan: {
    id: "state_plan",
    chunkStrategy: "section_boundary",
    relevanceFloor: 65,
    defaultCategory: "regulatory_state",
    defaultSubcategory: "state_plan",
    defaultUrgency: "normal",
    defaultAuthority: "primary",
    systemPrompt: `You are ORACLE extracting regulatory intelligence from a Medicaid State Plan.
Extract only items relevant to behavioral health, children's services, managed care,
or system administration. Focus on:
- Service definitions for covered behavioral health and children's services
- Eligibility criteria for relevant populations
- Federal authority citations (42 CFR references, waiver authorities)
- Any provisions updated or amended in the last 24 months (flag as higher urgency)
- Compliance obligations imposed on managed care organizations

Skip: financial management boilerplate, standard assurances language,
demographic tables unless they contain CSOC-specific data.
Return JSON only.`,
  },
  competitive_intel: {
    id: "competitive_intel",
    chunkStrategy: "standard",
    relevanceFloor: 60,
    defaultCategory: "competitive_landscape",
    defaultSubcategory: "prior_award_pattern",
    defaultUrgency: "normal",
    defaultAuthority: "secondary",
    systemPrompt: `You are ORACLE extracting competitive intelligence from a comparison or crosswalk document.
This document compares old and new requirements or analyzes competitor positioning.
Extract:
- Changes between old and new versions — each change as a discrete item
- New requirements that didn't exist before (urgency = high)
- Requirements relaxed or removed (competitive opportunity)
- Competitor strengths or weaknesses implied by the changes
- Strategic implications for positioning

Return JSON only.`,
  },
  client_strategy: {
    id: "client_strategy",
    chunkStrategy: "standard",
    relevanceFloor: 70,
    defaultCategory: "client_content_map",
    defaultSubcategory: "win_theme",
    defaultUrgency: "normal",
    defaultAuthority: "secondary",
    systemPrompt: `You are ORACLE extracting client intelligence from a prior proposal or strategy document.
This is internal Athena or client content. Extract:
- Win themes and positioning arguments made
- Specific proof points and metrics cited (data that supports claims)
- Differentiators — what made this proposal distinctive
- Claims that need updating (flag if data appears more than 2 years old)
- Content gaps — important topics that were underdeveloped

Return JSON only. Mark items with stale data as urgency = high.`,
  },
  reference: {
    id: "reference",
    chunkStrategy: "standard",
    relevanceFloor: 50,
    defaultCategory: "field_intelligence",
    defaultSubcategory: "stakeholder_communication",
    defaultUrgency: "low",
    defaultAuthority: "tertiary",
    systemPrompt: `You are ORACLE extracting background intelligence from a reference document.
Extract any items that provide useful context for a Medicaid managed care RFP response.
Apply conservative relevance scoring — only extract genuinely useful items.
Return JSON only.`,
  },
  style_guide: {
    id: "style_guide",
    chunkStrategy: "standard",
    relevanceFloor: 100, // unused
    defaultCategory: "client_content_map",
    defaultSubcategory: null,
    defaultUrgency: "normal",
    defaultAuthority: "secondary",
    specialHandling: "style_guide",
    systemPrompt: "", // never called
  },
  response_outline: {
    id: "response_outline",
    chunkStrategy: "standard",
    relevanceFloor: 100, // unused
    defaultCategory: "client_content_map",
    defaultSubcategory: null,
    defaultUrgency: "normal",
    defaultAuthority: "secondary",
    specialHandling: "response_outline",
    systemPrompt: "", // never called
  },
  model_contract: {
    id: "model_contract",
    chunkStrategy: "standard",
    relevanceFloor: 100,
    defaultCategory: "regulatory_state",
    defaultSubcategory: "contract_obligation",
    defaultUrgency: "high",
    defaultAuthority: "primary",
    specialHandling: "compliance_extraction",
    systemPrompt: "",
  },
  scope_of_work: {
    id: "scope_of_work",
    chunkStrategy: "standard",
    relevanceFloor: 100,
    defaultCategory: "regulatory_state",
    defaultSubcategory: "sow_obligation",
    defaultUrgency: "high",
    defaultAuthority: "primary",
    specialHandling: "compliance_extraction",
    systemPrompt: "",
  },
};

// ============================================================
// Main entry
// ============================================================

export async function processDocument(input: ProcessInput): Promise<ProcessResult> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

  const client = supabaseAdmin;
  const template = selectExtractionTemplate(
    input.documentType,
    input.contentTypeHint,
    input.documentTitle,
  );

  const fullText = input.extractedText.slice(0, MAX_CHARS);
  if (input.extractedText.length > MAX_CHARS) {
    console.warn(
      `[oracle-document-processor] truncating ${input.documentTitle}: ${input.extractedText.length} -> ${MAX_CHARS} chars`,
    );
  }

  await updateStatus(client, input.documentId, {
    processing_status: "processing",
    processing_error: null,
  });

  // ---------- Special case: style guide ----------
  if (template.specialHandling === "style_guide") {
    try {
      await updateStatus(client, input.documentId, {
        style_guide_text: fullText,
        is_style_guide: true,
        processing_status: "processed",
        processed_at: new Date().toISOString(),
        items_extracted: 0,
        processing_error: null,
      });

      // Mirror onto the mission so IRIS prompt-builders can read it cheaply.
      const { data: mission } = await client
        .from("missions")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("metadata" as any)
        .eq("id", input.missionId)
        .maybeSingle();
      const existingMeta = ((mission as { metadata?: Record<string, unknown> } | null)?.metadata ?? {}) as Record<
        string,
        unknown
      >;
      await client
        .from("missions")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ metadata: { ...existingMeta, style_guide: fullText } } as any)
        .eq("id", input.missionId);

      if (input.userId) {
        await client.from("mission_assist_events").insert({
          mission_id: input.missionId,
          user_id: input.userId,
          event_type: "oracle_intel_added",
          metadata: {
            summary: `Stored "${input.documentTitle}" as mission style guide`,
            document_id: input.documentId,
            document_title: input.documentTitle,
            items_extracted: 0,
            ingestion_source: "style_guide_config",
          },
        });
      }

      return {
        items_extracted: 0,
        chunks_processed: 0,
        toc_entries: 0,
        template_id: template.id,
        note: "Style guide stored as mission configuration. Will condition all IRIS content generation for this mission.",
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await updateStatus(client, input.documentId, {
        processing_status: "error",
        processing_error: msg.slice(0, 1000),
      });
      throw err;
    }
  }

  // ---------- Special case: response outline ----------
  if (template.specialHandling === "response_outline") {
    try {
      const sectionsParsed = await parseResponseOutline(apiKey, client, {
        missionId: input.missionId,
        documentId: input.documentId,
        outlineText: fullText,
      });
      await updateStatus(client, input.documentId, {
        processing_status: "processed",
        processed_at: new Date().toISOString(),
        items_extracted: sectionsParsed,
        processing_error: null,
      });
      if (input.userId) {
        await client.from("mission_assist_events").insert({
          mission_id: input.missionId,
          user_id: input.userId,
          event_type: "oracle_intel_added",
          metadata: {
            summary: `Parsed "${input.documentTitle}" — ${sectionsParsed} outline sections written to question cockpits`,
            document_id: input.documentId,
            document_title: input.documentTitle,
            items_extracted: sectionsParsed,
            ingestion_source: "response_outline_parser",
          },
        });
      }
      return {
        items_extracted: sectionsParsed,
        chunks_processed: 1,
        toc_entries: 0,
        template_id: template.id,
        note: `Response outline parsed: ${sectionsParsed} sections surfaced in question cockpits.`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await updateStatus(client, input.documentId, {
        processing_status: "error",
        processing_error: msg.slice(0, 1000),
      });
      throw err;
    }
  }

  const allItems: ExtractedItem[] = [];
  let chunksProcessed = 0;
  let tocEntries: Array<{ section_number: string; section_title: string; page_number: number | null }> = [];
  const isRfp = template.id === "primary_rfp";

  try {
    const chunks = chunkForTemplate(fullText, template.chunkStrategy);
    const totalChunks = Math.min(chunks.length, MAX_CHUNKS);

    for (let i = 0; i < totalChunks; i++) {
      await updateStatus(client, input.documentId, {
        processing_status: `processing_chunk_${i + 1}_of_${totalChunks}`,
      });
      const items = await extractFromChunk(apiKey, {
        chunk: chunks[i],
        chunkIndex: i + 1,
        totalChunks,
        documentTitle: input.documentTitle,
        template,
      });
      allItems.push(...items);
      chunksProcessed++;
    }

    if (isRfp) {
      try {
        tocEntries = await extractToc(apiKey, fullText.slice(0, 3000));
      } catch (err) {
        console.warn("[oracle-document-processor] TOC extraction failed:", err);
      }
    }

    // Apply template defaults + relevance floor
    const filtered: ExtractedItem[] = [];
    for (const it of allItems) {
      const rel = clamp(it.relevance_score, 0, 100);
      if (rel < template.relevanceFloor) continue;
      if (!VALID_CATEGORIES.has(it.category)) it.category = template.defaultCategory;
      if (!VALID_URGENCY.has(it.urgency)) it.urgency = template.defaultUrgency;
      if (!VALID_AUTHORITY.has(it.authority)) it.authority = template.defaultAuthority;
      it.relevance_score = rel;
      filtered.push(it);
    }

    const deduped = dedupeByTitle(filtered);

    if (deduped.length > 0) {
      const rows = deduped.map((it) => ({
        mission_id: input.missionId,
        signal_type: "policy",
        title: it.title.slice(0, 200),
        what_happened: it.what_happened,
        why_it_matters: it.why_it_matters,
        recommended_action: it.recommended_action ?? null,
        summary: it.what_happened.slice(0, 280),
        category: it.category,
        subcategory: template.defaultSubcategory,
        authority: it.authority,
        urgency: it.urgency,
        relevance_score: it.relevance_score,
        topic_tags: Array.isArray(it.topic_tags) ? it.topic_tags.slice(0, 12) : [],
        tier: "mission",
        scope_tier: "mission",
        status: "needs_review",
        visibility: "all_users",
        ingestion_source: isRfp ? "rfp_extraction" : "document_processing",
        source_name: input.documentTitle,
        metadata: {
          document_id: input.documentId,
          document_title: input.documentTitle,
          document_type: input.documentType,
          content_type_hint: input.contentTypeHint ?? null,
          template_id: template.id,
          section_reference: it.section_reference ?? null,
        },
      }));

      // Defensive: strip any generated/server-managed columns. `oracle_score`
      // is a GENERATED ALWAYS column — including it (even as null) in the
      // INSERT column list triggers a hard Postgres error.
      const GENERATED_COLS = ["oracle_score", "id", "created_at", "updated_at"] as const;
      const sanitized = rows.map((r) => {
        const copy: Record<string, unknown> = { ...r };
        for (const k of GENERATED_COLS) delete copy[k];
        return copy;
      });

      for (let i = 0; i < sanitized.length; i += 50) {
        const slice = sanitized.slice(i, i + 50);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: insErr } = await client.from("oracle_signals").insert(slice as any);
        if (insErr) throw new Error(`oracle_signals insert failed: ${insErr.message}`);
      }
    }

    const updatePayload: Record<string, unknown> = {
      processing_status: "processed",
      processed_at: new Date().toISOString(),
      items_extracted: deduped.length,
      processing_error: null,
    };
    if (tocEntries.length > 0) {
      updatePayload.toc_data = tocEntries;
    }
    await updateStatus(client, input.documentId, updatePayload);

    if (input.userId) {
      await client.from("mission_assist_events").insert({
        mission_id: input.missionId,
        user_id: input.userId,
        event_type: "oracle_intel_added",
        metadata: {
          summary: `Processed "${input.documentTitle}" (${template.id}) — extracted ${deduped.length} intel items`,
          document_id: input.documentId,
          document_title: input.documentTitle,
          items_extracted: deduped.length,
          ingestion_source: "document_processing",
          template_id: template.id,
        },
      });
    }

    return {
      items_extracted: deduped.length,
      chunks_processed: chunksProcessed,
      toc_entries: tocEntries.length,
      template_id: template.id,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await updateStatus(client, input.documentId, {
      processing_status: "error",
      processing_error: msg.slice(0, 1000),
    });
    throw err;
  }
}

// ============================================================
// Chunking
// ============================================================

function chunkForTemplate(text: string, strategy: ChunkStrategy): Array<{ text: string; sectionHeader: string | null }> {
  if (strategy === "section_boundary") {
    const sectioned = chunkBySection(text);
    if (sectioned.length > 0) return sectioned;
    // Fall back to standard if no section headers found.
  }
  return chunkStandard(text, STANDARD_CHUNK_SIZE, STANDARD_CHUNK_OVERLAP).map((t) => ({
    text: t,
    sectionHeader: null,
  }));
}

// Detect lines that look like section headers:
//   "4.16.5 Quality Management"
//   "Section 4 — Scope of Work"
const SECTION_HEADER_RE = /^(?:(\d+(?:\.\d+)*)\s+[A-Z][^\n]{0,200}|Section\s+\d+[^\n]{0,200})$/m;

function chunkBySection(text: string): Array<{ text: string; sectionHeader: string | null }> {
  const lines = text.split(/\r?\n/);
  const out: Array<{ text: string; sectionHeader: string | null }> = [];
  let current: string[] = [];
  let header: string | null = null;

  const flush = () => {
    const body = current.join("\n").trim();
    if (body.length > 0) out.push({ text: body, sectionHeader: header });
  };

  for (const line of lines) {
    if (SECTION_HEADER_RE.test(line.trim())) {
      flush();
      current = [line];
      header = line.trim();
    } else {
      current.push(line);
    }
  }
  flush();

  // If we only got one massive section (no headers detected), bail.
  if (out.length <= 1) return [];

  // Re-pack tiny sections so each chunk is at least ~1500 chars; split huge ones.
  const packed: Array<{ text: string; sectionHeader: string | null }> = [];
  for (const entry of out) {
    if (entry.text.length <= STANDARD_CHUNK_SIZE * 1.5) {
      if (packed.length && packed[packed.length - 1].text.length < 1500) {
        const prev = packed[packed.length - 1];
        prev.text = `${prev.text}\n\n${entry.text}`;
        // keep the earlier header
      } else {
        packed.push({ ...entry });
      }
    } else {
      const parts = chunkStandard(entry.text, STANDARD_CHUNK_SIZE, STANDARD_CHUNK_OVERLAP);
      parts.forEach((p, i) => packed.push({ text: p, sectionHeader: i === 0 ? entry.sectionHeader : entry.sectionHeader }));
    }
  }
  return packed;
}

function chunkStandard(text: string, size: number, overlap: number): string[] {
  if (text.length <= size) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + size, text.length);
    chunks.push(text.slice(start, end));
    if (end >= text.length) break;
    start = end - overlap;
  }
  return chunks;
}

// ============================================================
// Helpers
// ============================================================

function clamp(n: number, min: number, max: number): number {
  if (typeof n !== "number" || Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function dedupeByTitle(items: ExtractedItem[]): ExtractedItem[] {
  const out: ExtractedItem[] = [];
  for (const item of items) {
    const norm = normTitle(item.title);
    let dup = false;
    for (const kept of out) {
      const sim = jaccard(norm, normTitle(kept.title));
      if (sim > 0.75) {
        const merged = new Set([...(kept.topic_tags || []), ...(item.topic_tags || [])]);
        kept.topic_tags = Array.from(merged);
        dup = true;
        break;
      }
    }
    if (!dup) out.push(item);
  }
  return out;
}

function normTitle(t: string): Set<string> {
  return new Set(
    t
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

async function updateStatus(
  client: typeof supabaseAdmin,
  documentId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  // Keep `processing_error` and `processing_error_message` in lockstep — the
  // schema has both columns and different consumers historically read one or
  // the other. Mirror whichever one the caller set onto the other.
  const mirrored: Record<string, unknown> = { ...patch };
  if ("processing_error" in mirrored && !("processing_error_message" in mirrored)) {
    mirrored.processing_error_message = mirrored.processing_error;
  } else if ("processing_error_message" in mirrored && !("processing_error" in mirrored)) {
    mirrored.processing_error = mirrored.processing_error_message;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await client.from("mission_documents").update(mirrored as any).eq("id", documentId);
  if (error) console.error("[oracle-document-processor] status update failed:", error.message);
}

async function callGateway(apiKey: string, systemPrompt: string, userPrompt: string): Promise<string> {
  const res = await fetch(AI_GATEWAY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`gateway ${res.status}: ${text.slice(0, 200)}`);
  }
  const payload = (await res.json().catch(() => null)) as {
    choices?: Array<{ message?: { content?: string } }>;
  } | null;
  return (payload?.choices?.[0]?.message?.content ?? "").trim();
}

function parseJsonArray(raw: string): unknown[] {
  const cleaned = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object") {
      for (const key of ["items", "intelligence_items", "results", "data", "extracted"]) {
        if (Array.isArray((parsed as Record<string, unknown>)[key])) {
          return (parsed as Record<string, unknown>)[key] as unknown[];
        }
      }
    }
    return [];
  } catch {
    return [];
  }
}

async function extractFromChunk(
  apiKey: string,
  opts: {
    chunk: { text: string; sectionHeader: string | null };
    chunkIndex: number;
    totalChunks: number;
    documentTitle: string;
    template: ExtractionTemplate;
  },
): Promise<ExtractedItem[]> {
  const { template, chunk } = opts;
  const sectionLine = chunk.sectionHeader ? `SECTION CONTEXT: ${chunk.sectionHeader}\n\n` : "";

  const user = `DOCUMENT: ${opts.documentTitle}
TEMPLATE: ${template.id}
Chunk ${opts.chunkIndex} of ${opts.totalChunks}

${sectionLine}${chunk.text}

Extract 0-12 intelligence items per the system prompt. Return JSON in this shape:
{ "items": [
  {
    "title": "max 80 chars",
    "what_happened": "core content of this intel item",
    "why_it_matters": "why this matters for the bid",
    "recommended_action": "what the team should do (or null)",
    "category": "regulatory_federal|regulatory_state|quality_performance|health_outcomes_sdoh|policy_innovation|evidence_base|field_intelligence|competitive_landscape|client_content_map",
    "authority": "primary|secondary|tertiary|field",
    "urgency": "immediate|high|normal|low",
    "relevance_score": 0-100,
    "topic_tags": [],
    "section_reference": "section number if identifiable, or null"
  }
] }
Return { "items": [] } if this chunk has no genuine intelligence.`;

  let raw: string;
  try {
    raw = await callGateway(apiKey, template.systemPrompt, user);
  } catch (err) {
    console.error("[oracle-document-processor] chunk extraction failed:", err);
    return [];
  }

  const arr = parseJsonArray(raw);
  return arr
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .map((x) => ({
      title: String(x.title ?? "").trim(),
      what_happened: String(x.what_happened ?? "").trim(),
      why_it_matters: String(x.why_it_matters ?? "").trim(),
      recommended_action: x.recommended_action == null ? null : String(x.recommended_action).trim(),
      category: String(x.category ?? template.defaultCategory),
      authority: String(x.authority ?? template.defaultAuthority),
      urgency: String(x.urgency ?? template.defaultUrgency),
      relevance_score: Number(x.relevance_score ?? 60),
      topic_tags: Array.isArray(x.topic_tags) ? (x.topic_tags as unknown[]).map(String) : [],
      section_reference:
        x.section_reference == null
          ? chunk.sectionHeader
          : String(x.section_reference) || chunk.sectionHeader,
    }))
    .filter((it) => it.title.length > 0 && it.what_happened.length > 0);
}

async function extractToc(
  apiKey: string,
  text: string,
): Promise<Array<{ section_number: string; section_title: string; page_number: number | null }>> {
  const system = "You extract RFP table-of-contents entries. Return ONLY valid JSON — no markdown, no prose.";
  const user = `Extract the table of contents from the start of this RFP. Return JSON in this shape:
{ "toc": [{ "section_number": "4.16", "section_title": "...", "page_number": 42 }] }
If no TOC is present, return { "toc": [] }.

DOCUMENT START:
${text}`;

  const raw = await callGateway(apiKey, system, user);
  const cleaned = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  try {
    const parsed = JSON.parse(cleaned) as { toc?: unknown };
    const toc = Array.isArray(parsed.toc) ? parsed.toc : [];
    return toc
      .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
      .map((x) => ({
        section_number: String(x.section_number ?? "").trim(),
        section_title: String(x.section_title ?? "").trim(),
        page_number:
          typeof x.page_number === "number"
            ? x.page_number
            : x.page_number == null
              ? null
              : Number(x.page_number) || null,
      }))
      .filter((e) => e.section_number.length > 0 && e.section_title.length > 0);
  } catch {
    return [];
  }
}

// ============================================================
// Response Outline parser — client-provided per-question structure
// ============================================================

type OutlineSection = {
  question_number: string | null;
  section_headers: string[];
  content_guidance: string | null;
  word_allocation: Record<string, number>;
  total_word_limit: number | null;
  format_notes: string | null;
  required_elements: string[];
  prohibited_elements: string[];
  source_text: string | null;
  confidence: number;
};

async function parseResponseOutline(
  apiKey: string,
  client: typeof supabaseAdmin,
  input: { missionId: string; documentId: string; outlineText: string },
): Promise<number> {
  // Pull all questions for matching
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: questions } = await (client as any)
    .from("mission_questions")
    .select("id, question_number, question_text, section_title")
    .eq("mission_id", input.missionId)
    .order("question_number");

  const qList = (questions ?? []) as Array<{
    id: string;
    question_number: string | null;
    question_text: string | null;
    section_title: string | null;
  }>;

  const questionRefBlock = qList.length
    ? qList
        .slice(0, 30)
        .map(
          (q) =>
            `Q${q.question_number ?? "?"}: ${(q.question_text ?? "").substring(0, 100)}`,
        )
        .join("\n")
    : "(no questions yet loaded for this mission — return question_number as null for general guidance)";

  const system =
    "You are a precise document parser. You read client-provided response outlines and extract per-question writing structure. Return ONLY valid JSON — no markdown fences, no prose.";

  const user = `You are parsing a client-provided RESPONSE OUTLINE document. This document tells writers HOW to structure their answer to each question — section headers, content order, word allocations, required/prohibited elements.

MISSION QUESTIONS (for matching question_number):
${questionRefBlock}

OUTLINE DOCUMENT TEXT (truncated):
${input.outlineText.substring(0, 8000)}

Parse the outline. Return JSON in this exact shape:
{ "sections": [
  {
    "question_number": "4.10.3",          // null if guidance applies to all questions
    "section_headers": ["string"],         // ordered list of subsection headers
    "content_guidance": "string|null",     // approach guidance
    "word_allocation": {"Section": 200},   // words per section if specified
    "total_word_limit": 500,               // null if not specified
    "format_notes": "string|null",         // formatting rules
    "required_elements": ["string"],       // must include
    "prohibited_elements": ["string"],     // must NOT include
    "source_text": "string|null",          // relevant raw excerpt
    "confidence": 0.85                     // 0.0-1.0
  }
] }
Return { "sections": [] } if nothing structural is detectable.`;

  let raw: string;
  try {
    raw = await callGateway(apiKey, system, user);
  } catch (err) {
    console.error("[response-outline-parser] gateway failed:", err);
    throw err;
  }

  const cleaned = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  let parsed: { sections?: unknown };
  try {
    parsed = JSON.parse(cleaned) as { sections?: unknown };
  } catch (err) {
    console.error("[response-outline-parser] JSON parse failed:", err, raw.slice(0, 300));
    return 0;
  }

  const sections = Array.isArray(parsed.sections) ? (parsed.sections as unknown[]) : [];
  const cleanSections: OutlineSection[] = sections
    .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
    .map((s) => ({
      question_number: s.question_number == null ? null : String(s.question_number).trim() || null,
      section_headers: Array.isArray(s.section_headers)
        ? (s.section_headers as unknown[]).map((x) => String(x)).filter(Boolean)
        : [],
      content_guidance: s.content_guidance == null ? null : String(s.content_guidance).trim() || null,
      word_allocation:
        s.word_allocation && typeof s.word_allocation === "object"
          ? Object.fromEntries(
              Object.entries(s.word_allocation as Record<string, unknown>)
                .map(([k, v]) => [k, Number(v) || 0])
                .filter(([, v]) => (v as number) > 0),
            )
          : {},
      total_word_limit:
        s.total_word_limit == null
          ? null
          : Number.isFinite(Number(s.total_word_limit))
            ? Number(s.total_word_limit)
            : null,
      format_notes: s.format_notes == null ? null : String(s.format_notes).trim() || null,
      required_elements: Array.isArray(s.required_elements)
        ? (s.required_elements as unknown[]).map((x) => String(x)).filter(Boolean)
        : [],
      prohibited_elements: Array.isArray(s.prohibited_elements)
        ? (s.prohibited_elements as unknown[]).map((x) => String(x)).filter(Boolean)
        : [],
      source_text: s.source_text == null ? null : String(s.source_text).trim() || null,
      confidence:
        s.confidence == null
          ? 0.7
          : Math.max(0, Math.min(1, Number(s.confidence) || 0.7)),
    }))
    .filter(
      (s) =>
        s.section_headers.length > 0 ||
        s.content_guidance ||
        s.required_elements.length > 0 ||
        s.prohibited_elements.length > 0 ||
        s.total_word_limit != null,
    );

  if (cleanSections.length === 0) return 0;

  // Clear previous outlines from this same document, then insert fresh
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (client as any)
    .from("question_response_outlines")
    .delete()
    .eq("mission_id", input.missionId)
    .eq("document_id", input.documentId);

  const rows = cleanSections.map((s) => {
    let questionId: string | null = null;
    if (s.question_number) {
      const match = qList.find(
        (q) =>
          q.question_number === s.question_number ||
          (q.question_number && s.question_number && q.question_number.includes(s.question_number)) ||
          (q.question_number && s.question_number && s.question_number.includes(q.question_number)),
      );
      questionId = match?.id ?? null;
    }
    return {
      mission_id: input.missionId,
      question_id: questionId,
      document_id: input.documentId,
      section_headers: s.section_headers,
      content_guidance: s.content_guidance,
      word_allocation: s.word_allocation,
      total_word_limit: s.total_word_limit,
      format_notes: s.format_notes,
      required_elements: s.required_elements,
      prohibited_elements: s.prohibited_elements,
      source_text: s.source_text,
      confidence: s.confidence,
      parsed_at: new Date().toISOString(),
    };
  });

  for (let i = 0; i < rows.length; i += 50) {
    const slice = rows.slice(i, i + 50);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (client as any).from("question_response_outlines").insert(slice);
    if (error) throw new Error(`question_response_outlines insert failed: ${error.message}`);
  }

  return rows.length;
}
