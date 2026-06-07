// Browser-only resume text extraction. Lazy-imports pdfjs-dist and mammoth
// so SSR / route prerender never pulls in their large/Node-only dependencies.
//
// Privacy: the resulting text is sent to the IRIS server fn for parsing and
// then discarded; the raw file bytes are NEVER uploaded to Supabase Storage.

export type ResumeFileKind = "pdf" | "docx";

export const MAX_RESUME_BYTES = 5 * 1024 * 1024; // 5 MB

export function detectKind(file: File): ResumeFileKind | null {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf") || file.type === "application/pdf") return "pdf";
  if (
    name.endsWith(".docx") ||
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return "docx";
  }
  return null;
}

async function extractPdf(file: File): Promise<string> {
  // Use the legacy ESM build that ships a worker-less mode via fake workers.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // @ts-expect-error - workerSrc is documented but not in the public types we ship.
  pdfjs.GlobalWorkerOptions.workerSrc = await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url").then(
    (m: { default: string }) => m.default,
  );

  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf, disableFontFace: true }).promise;
  const parts: string[] = [];
  const pageCount = Math.min(doc.numPages, 25); // cap to keep payload reasonable
  for (let i = 1; i <= pageCount; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((it: any) => (typeof it?.str === "string" ? it.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) parts.push(text);
  }
  await doc.destroy();
  return parts.join("\n\n");
}

async function extractDocx(file: File): Promise<string> {
  const mammoth = await import("mammoth/mammoth.browser");
  const buf = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buf });
  return (result?.value ?? "").replace(/\r\n?/g, "\n").trim();
}

/** Extract plain text from a resume file. Throws on unsupported/oversized files. */
export async function extractResumeText(file: File): Promise<string> {
  if (file.size > MAX_RESUME_BYTES) {
    throw new Error("Resume is larger than 5 MB. Please upload a smaller file.");
  }
  const kind = detectKind(file);
  if (!kind) {
    throw new Error("Unsupported file. Upload a .pdf or .docx resume.");
  }
  const text = kind === "pdf" ? await extractPdf(file) : await extractDocx(file);
  const cleaned = text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (cleaned.length < 50) {
    throw new Error(
      "We couldn't read enough text from this file. If it's a scanned PDF, try uploading a text-based version.",
    );
  }
  // Cap to the server-side max so we don't waste a round-trip.
  return cleaned.slice(0, 60_000);
}
