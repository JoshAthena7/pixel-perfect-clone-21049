/**
 * Shared client-side helper: download every mission_documents file, extract
 * text, call processRFPDocuments (Pass 1 — structure), then drive Pass 2
 * (per-section question extraction) from the browser with bounded
 * concurrency. Each Pass 2 call is its own short server request so the
 * Worker never exceeds its per-request timeout and the wizard never
 * bounces on a long single-shot.
 *
 * After Pass 2 completes, queues and generates IRIS briefs for every
 * pending question (concurrency 3, fire-and-forget). If Pass 2 produces
 * zero questions across all fallback attempts, flips the mission's
 * iris_extraction_status to 'needs_review' so the user is never left
 * thinking IRIS silently succeeded.
 */
import { supabase } from "@/integrations/supabase/client";
import { extractRFPText } from "@/lib/extract-rfp-text.browser";
import {
  processRFPDocuments,
  extractQuestionsForSection,
  sliceSectionTextWithFallbacks,
  type ProcessResult,
} from "@/lib/iris-process-rfp.functions";
import { generateIrisBrief } from "@/lib/iris-brief-generator.functions";

const BUCKET = "atlas-rfp-documents";
const PASS2_CONCURRENCY = 3;
const BRIEF_CONCURRENCY = 3;
const MIN_TEXT_CHARS = 50; // Was 200 — too aggressive for form-driven RFPs.

async function extractTextFromBlob(blob: Blob, fileName: string): Promise<string> {
  const lower = fileName.toLowerCase();
  if (
    lower.endsWith(".txt") ||
    lower.endsWith(".md") ||
    lower.endsWith(".csv") ||
    lower.endsWith(".rtf")
  ) {
    return blob.text();
  }
  const file = new File([blob], fileName, { type: blob.type });
  return extractRFPText(file);
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T, idx: number) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      try {
        await fn(items[i], i);
      } catch (e) {
        console.error("[iris-pass2/browser] worker item failed", e);
      }
    }
  });
  await Promise.all(workers);
}

export async function runIrisRfpExtraction(missionId: string): Promise<ProcessResult> {
  // Guard — never re-extract if mission_questions already exist. Re-running
  // PASS 1/2 on a mission that already has questions creates `.1`-suffixed
  // duplicates and inflates the count (e.g. 75 -> 89). Brief generation for
  // any pending questions is still handled by the dedicated brief queue.
  const { count: existingCount } = await supabase
    .from("mission_questions")
    .select("id", { count: "exact", head: true })
    .eq("mission_id", missionId)
    .eq("is_withdrawn", false);
  if ((existingCount ?? 0) > 0) {
    console.log(
      `[IRIS] Skipping RFP extraction — mission ${missionId} already has ${existingCount} questions.`,
    );
    return { sections_created: 0, questions_created: 0, skipped: true } as unknown as ProcessResult;
  }

  const { data: docs, error: docsError } = await supabase
    .from("mission_documents")
    .select("id, title, file_url, content_summary")
    .eq("mission_id", missionId)
    .order("created_at", { ascending: true });
  if (docsError) throw docsError;

  const textParts: string[] = [];
  for (const doc of docs ?? []) {
    const title = doc.title ?? "Document";
    const cachedText = (doc.content_summary ?? "").trim();
    if (cachedText.length > 50) {
      textParts.push(`# ${title}\n\n${cachedText}`);
      continue;
    }
    if (!doc.file_url) continue;
    const { data: blob, error: dlError } = await supabase.storage
      .from(BUCKET)
      .download(doc.file_url);
    if (dlError || !blob) continue;
    const fileName = doc.file_url.split("/").pop() || title;
    try {
      const extracted = (await extractTextFromBlob(blob, fileName)).trim();
      if (extracted.length > 50) {
        textParts.push(`# ${title}\n\n${extracted}`);
        await supabase
          .from("mission_documents")
          .update({ content_summary: extracted.slice(0, 220_000) })
          .eq("id", doc.id);
      }
    } catch (e) {
      console.warn("[IRIS] Text extraction failed:", title, e);
    }
  }

  const primaryRfpText = textParts.join("\n\n---\n\n").slice(0, 700_000);
  if (primaryRfpText.trim().length < 50) {
    throw new Error("IRIS could not read text from the uploaded RFP documents.");
  }

  // PASS 1 — structure extraction (one short server call, idempotent).
  const pass1: ProcessResult = await processRFPDocuments({
    data: { mission_id: missionId, primary_rfp_text: primaryRfpText },
  });

  // PASS 2 — orchestrated from the browser, one short server call per
  // section. Bounded concurrency keeps it polite to the gateway.
  const { data: sectionRows } = await supabase
    .from("mission_sections")
    .select("id, section_number, name, is_form_only")
    .eq("mission_id", missionId)
    .order("order_index", { ascending: true });

  const targets = (sectionRows ?? []).filter(
    (s) => s.is_form_only !== true && !!s.section_number,
  );
  console.log(
    `[iris/browser] Pass 2 dispatch — ${targets.length} sections, concurrency ${PASS2_CONCURRENCY}`,
  );

  let questionsInserted = 0;
  let sectionsProcessed = 0;
  let sectionsFailed = 0;
  let sectionsSkipped = 0;
  let sectionsInferred = 0;

  await runWithConcurrency(targets, PASS2_CONCURRENCY, async (section, idx) => {
    // Fallback chain: regex → inline → proportional. If all return <50 chars,
    // fall through to inferred (attempt 4) which calls AI with section name only.
    const { text: slice, attempt } = sliceSectionTextWithFallbacks(
      primaryRfpText,
      section.section_number,
      idx,
      targets.length,
    );

    const useInferred = slice.length < MIN_TEXT_CHARS;
    try {
      const res = await extractQuestionsForSection({
        data: {
          mission_id: missionId,
          section_id: section.id,
          section_text: useInferred ? "" : slice.slice(0, 20_000),
          is_inferred: useInferred,
        },
      });
      if (res.ok) {
        sectionsProcessed++;
        questionsInserted += res.inserted;
        if (res.inferred) sectionsInferred++;
        if (res.inserted === 0) sectionsSkipped++;
        console.log(
          `[iris/browser] Pass 2 ✓ ${section.section_number} attempt=${useInferred ? 4 : attempt} inserted=${res.inserted}${res.inferred ? " (inferred)" : ""}`,
        );
      } else {
        sectionsFailed++;
        console.warn(
          `[iris/browser] Pass 2 ✗ ${section.section_number} ${section.name} — ${res.skipped ?? "fail"}`,
        );
      }
    } catch (e) {
      sectionsFailed++;
      console.error(
        `[iris/browser] Pass 2 call failed ${section.section_number}`,
        e instanceof Error ? e.message : e,
      );
    }
  });

  console.log(
    `[iris-pass2] Complete: ${questionsInserted} questions from ${sectionsProcessed} sections (${sectionsSkipped} skipped, ${sectionsInferred} inferred, ${sectionsFailed} failed)`,
  );

  // If nothing landed, do NOT silently succeed — flag for manual review.
  if (questionsInserted === 0) {
    await supabase
      .from("missions")
      .update({
        iris_extraction_status: "needs_review",
        iris_extraction_note: `Pass 2 produced 0 questions across ${targets.length} sections — manual review required`,
      } as never)
      .eq("id", missionId);
  } else {
    await supabase
      .from("missions")
      .update({
        iris_extraction_status: sectionsInferred > 0 ? "ready_with_inferred" : "ready",
        iris_extraction_note: null,
      } as never)
      .eq("id", missionId);

    // Auto-generate briefs for all extracted questions (fire-and-forget).
    const { data: newQuestions } = await supabase
      .from("mission_questions")
      .select("id")
      .eq("mission_id", missionId)
      .eq("iris_brief_status", "pending")
      .eq("is_withdrawn", false);

    if (newQuestions && newQuestions.length > 0) {
      console.log(`[iris-briefs] Queueing ${newQuestions.length} briefs`);
      await supabase
        .from("mission_questions")
        .update({ iris_brief_status: "queued" })
        .eq("mission_id", missionId)
        .eq("iris_brief_status", "pending");

      // Fire-and-forget — do not block return on full brief generation.
      void (async () => {
        const ids = newQuestions.map((q) => q.id);
        for (let i = 0; i < ids.length; i += BRIEF_CONCURRENCY) {
          const batch = ids.slice(i, i + BRIEF_CONCURRENCY);
          await Promise.allSettled(
            batch.map((qid) =>
              generateIrisBrief({ data: { missionId, questionId: qid } }).catch((err) =>
                console.error(`[iris-briefs] Failed for ${qid}:`, err),
              ),
            ),
          );
        }
        console.log(`[iris-briefs] Complete for mission ${missionId}`);
      })();
    }
  }

  return {
    ...pass1,
    counts: { ...pass1.counts, questions: questionsInserted },
  };
}
