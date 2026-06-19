/**
 * ORACLE Document Processor — server-only logic.
 *
 * Receives plain text (already extracted client-side) and:
 *   1. Chunks based on document type / size
 *   2. Calls Lovable AI Gateway per chunk to extract intelligence items
 *   3. Deduplicates by title similarity
 *   4. Inserts into oracle_signals (tier='mission', status='needs_review')
 *   5. Updates mission_documents.processing_status throughout
 *   6. For primary_rfp: also extracts TOC into mission_documents.toc_data
 *   7. Writes a mission_assist_events row on success
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

const RFP_CHUNK_SIZE = 4_000;
const RFP_CHUNK_OVERLAP = 500;
const SUPPORT_CHUNK_SIZE = 5_000;
const SUPPORT_CHUNK_OVERLAP = 500;
const STANDARD_LIMIT = 20_000;
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

export type ProcessInput = {
  documentId: string;
  missionId: string;
  extractedText: string;
  documentTitle: string;
  documentType: string;
  userId: string | null;
};

export type ProcessResult = {
  items_extracted: number;
  chunks_processed: number;
  toc_entries: number;
};

export async function processDocument(input: ProcessInput): Promise<ProcessResult> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

  const client = supabaseAdmin;
  const isRfp = input.documentType === "primary_rfp";
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

  const allItems: ExtractedItem[] = [];
  let chunksProcessed = 0;
  let tocEntries: Array<{ section_number: string; section_title: string; page_number: number | null }> = [];

  try {
    if (isRfp) {
      const chunks = chunkText(fullText, RFP_CHUNK_SIZE, RFP_CHUNK_OVERLAP);
      const totalChunks = Math.min(chunks.length, MAX_CHUNKS);
      for (let i = 0; i < totalChunks; i++) {
        await updateStatus(client, input.documentId, {
          processing_status: `processing_chunk_${i + 1}_of_${totalChunks}`,
        });
        const items = await extractFromChunk(apiKey, {
          text: chunks[i],
          chunkIndex: i + 1,
          totalChunks,
          documentTitle: input.documentTitle,
          documentType: "primary_rfp",
        });
        allItems.push(...items);
        chunksProcessed++;
      }
      try {
        tocEntries = await extractToc(apiKey, fullText.slice(0, 3000));
      } catch (err) {
        console.warn("[oracle-document-processor] TOC extraction failed:", err);
      }
    } else if (fullText.length < STANDARD_LIMIT) {
      const chunks = chunkText(fullText, 6_000, 300);
      const totalChunks = Math.min(chunks.length, 2);
      for (let i = 0; i < totalChunks; i++) {
        await updateStatus(client, input.documentId, {
          processing_status: `processing_chunk_${i + 1}_of_${totalChunks}`,
        });
        const items = await extractFromChunk(apiKey, {
          text: chunks[i],
          chunkIndex: i + 1,
          totalChunks,
          documentTitle: input.documentTitle,
          documentType: input.documentType,
        });
        allItems.push(...items);
        chunksProcessed++;
      }
    } else {
      const chunks = chunkText(fullText, SUPPORT_CHUNK_SIZE, SUPPORT_CHUNK_OVERLAP);
      const totalChunks = Math.min(chunks.length, MAX_CHUNKS);
      for (let i = 0; i < totalChunks; i++) {
        await updateStatus(client, input.documentId, {
          processing_status: `processing_chunk_${i + 1}_of_${totalChunks}`,
        });
        const items = await extractFromChunk(apiKey, {
          text: chunks[i],
          chunkIndex: i + 1,
          totalChunks,
          documentTitle: input.documentTitle,
          documentType: input.documentType,
        });
        allItems.push(...items);
        chunksProcessed++;
      }
    }

    const titleLower = input.documentTitle.toLowerCase();
    const isKickoffOrStyle =
      titleLower.includes("kickoff") || titleLower.includes("knowledge transfer") || titleLower.includes("style guide");
    const isHistoricalRfp = titleLower.includes("2017") || titleLower.includes("crosswalk");

    for (const it of allItems) {
      if (isKickoffOrStyle && !isRfp) {
        it.category = it.category || "client_content_map";
        if (it.urgency !== "immediate" && it.urgency !== "high") it.urgency = "high";
        it.relevance_score = Math.max(it.relevance_score, 65);
      }
      if (isHistoricalRfp && !isRfp) {
        if (!VALID_CATEGORIES.has(it.category)) it.category = "competitive_landscape";
      }
    }

    const deduped = dedupeByTitle(allItems);

    if (deduped.length > 0) {
      const rows = deduped.map((it) => ({
        mission_id: input.missionId,
        signal_type: "policy",
        title: it.title.slice(0, 200),
        what_happened: it.what_happened,
        why_it_matters: it.why_it_matters,
        recommended_action: it.recommended_action ?? null,
        summary: it.what_happened.slice(0, 280),
        category: VALID_CATEGORIES.has(it.category) ? it.category : "field_intelligence",
        authority: VALID_AUTHORITY.has(it.authority) ? it.authority : isRfp ? "primary" : "secondary",
        urgency: VALID_URGENCY.has(it.urgency) ? it.urgency : "normal",
        relevance_score: clamp(it.relevance_score, 0, 100),
        oracle_score: clamp(it.relevance_score, 0, 100),
        topic_tags: Array.isArray(it.topic_tags) ? it.topic_tags.slice(0, 12) : [],
        tier: "mission",
        scope_tier: "mission",
        status: "needs_review",
        visibility: "mission",
        ingestion_source: isRfp ? "rfp_extraction" : "document_processing",
        source_name: input.documentTitle,
        metadata: {
          document_id: input.documentId,
          document_title: input.documentTitle,
          document_type: input.documentType,
          section_reference: it.section_reference ?? null,
        },
      }));

      for (let i = 0; i < rows.length; i += 50) {
        const slice = rows.slice(i, i + 50);
        const { error: insErr } = await client.from("oracle_signals").insert(slice);
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
          summary: `Processed "${input.documentTitle}" — extracted ${deduped.length} intel items`,
          document_id: input.documentId,
          document_title: input.documentTitle,
          items_extracted: deduped.length,
          ingestion_source: "document_processing",
        },
      });
    }

    return {
      items_extracted: deduped.length,
      chunks_processed: chunksProcessed,
      toc_entries: tocEntries.length,
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
// Helpers
// ============================================================

function clamp(n: number, min: number, max: number): number {
  if (typeof n !== "number" || Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function chunkText(text: string, size: number, overlap: number): string[] {
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await client.from("mission_documents").update(patch as any).eq("id", documentId);
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
    text: string;
    chunkIndex: number;
    totalChunks: number;
    documentTitle: string;
    documentType: string;
  },
): Promise<ExtractedItem[]> {
  const isRfp = opts.documentType === "primary_rfp";

  const system = isRfp
    ? "You are ORACLE extracting procurement intelligence from an RFP document. Extract only items that reveal evaluator priorities, scoring criteria, compliance requirements, or competitive positioning opportunities. Ignore boilerplate, administrative instructions, and definitions. Return ONLY valid JSON — no markdown, no prose."
    : "You are ORACLE extracting intelligence from a Medicaid managed care RFP support document. Extract discrete, actionable intelligence items. Return ONLY valid JSON — no markdown, no prose.";

  const user = isRfp
    ? `RFP: ${opts.documentTitle}
Chunk ${opts.chunkIndex} of ${opts.totalChunks}:

${opts.text}

Extract 0-5 intelligence items. Only extract if the chunk contains genuine evaluator intelligence. Return JSON in this shape: { "items": [ ... ] } where each item is:
{
  "title": "max 80 chars",
  "what_happened": "what this RFP provision says",
  "why_it_matters": "what evaluators are testing with this requirement",
  "recommended_action": "what writers must address",
  "category": "regulatory_state|quality_performance|field_intelligence|competitive_landscape",
  "authority": "primary",
  "urgency": "high|normal",
  "relevance_score": 70-100,
  "topic_tags": [],
  "section_reference": "section number or page if identifiable, or null"
}
Return { "items": [] } if this chunk has no evaluator intelligence.`
    : `MISSION: NJ T1932 — CSOC Contracted System Administrator
DOCUMENT: ${opts.documentTitle}
DOCUMENT TYPE: ${opts.documentType}
Chunk ${opts.chunkIndex} of ${opts.totalChunks}:

${opts.text}

Extract 5-15 intelligence items. Each item should be a self-contained piece of intel — a key insight, a requirement, a positioning opportunity, a risk, a proof point. Return JSON in this shape: { "items": [ ... ] } where each item is:
{
  "title": "max 80 chars",
  "what_happened": "core content of this intel item",
  "why_it_matters": "why this matters for the bid",
  "recommended_action": "what the team should do (or null)",
  "category": "regulatory_federal|regulatory_state|quality_performance|health_outcomes_sdoh|policy_innovation|evidence_base|field_intelligence|competitive_landscape|client_content_map",
  "authority": "primary|secondary|tertiary|field",
  "urgency": "high|normal|low",
  "relevance_score": 0-100,
  "topic_tags": []
}`;

  let raw: string;
  try {
    raw = await callGateway(apiKey, system, user);
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
      category: String(x.category ?? "field_intelligence"),
      authority: String(x.authority ?? (isRfp ? "primary" : "secondary")),
      urgency: String(x.urgency ?? "normal"),
      relevance_score: Number(x.relevance_score ?? 60),
      topic_tags: Array.isArray(x.topic_tags) ? (x.topic_tags as unknown[]).map(String) : [],
      section_reference: x.section_reference == null ? null : String(x.section_reference),
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
