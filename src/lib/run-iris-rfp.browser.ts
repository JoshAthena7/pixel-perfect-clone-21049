/**
 * Shared client-side helper: download every mission_documents file, extract
 * text, call processRFPDocuments (Pass 1 — structure), then drive Pass 2
 * (per-section question extraction) from the browser with bounded
 * concurrency. Each Pass 2 call is its own short server request so the
 * Worker never exceeds its per-request timeout and the wizard never
 * bounces on a long single-shot.
 */
import { supabase } from "@/integrations/supabase/client";
import { extractRFPText } from "@/lib/extract-rfp-text.browser";
import {
  processRFPDocuments,
  extractQuestionsForSection,
  sliceSectionTextForClient,
  type ProcessResult,
} from "@/lib/iris-process-rfp.functions";

const BUCKET = "atlas-rfp-documents";
const PASS2_CONCURRENCY = 3;

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
  let sectionsFailed = 0;
  let sectionsWithoutText = 0;

  await runWithConcurrency(targets, PASS2_CONCURRENCY, async (section) => {
    const slice = sliceSectionTextForClient(primaryRfpText, section.section_number);
    if (slice.length < 200) {
      sectionsWithoutText++;
      return;
    }
    try {
      const res = await extractQuestionsForSection({
        data: {
          mission_id: missionId,
          section_id: section.id,
          section_text: slice.slice(0, 20_000),
        },
      });
      if (res.ok) {
        questionsInserted += res.inserted;
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
    `[iris/browser] Pass 2 complete — ${questionsInserted} questions, ${sectionsFailed} failed, ${sectionsWithoutText} no-text`,
  );

  return {
    ...pass1,
    counts: { ...pass1.counts, questions: questionsInserted },
  };
}
