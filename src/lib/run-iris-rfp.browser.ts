/**
 * Shared client-side helper: download every mission_documents file, extract
 * text, and call processRFPDocuments. Used by Step 1 (Fuel IRIS) and Step 7
 * (Team & Assignments — "Re-run IRIS" button).
 */
import { supabase } from "@/integrations/supabase/client";
import { extractRFPText } from "@/lib/extract-rfp-text.browser";
import { processRFPDocuments } from "@/lib/iris-process-rfp.functions";

const BUCKET = "atlas-rfp-documents";

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

export async function runIrisRfpExtraction(missionId: string) {
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
  return processRFPDocuments({
    data: { mission_id: missionId, primary_rfp_text: primaryRfpText },
  });
}
