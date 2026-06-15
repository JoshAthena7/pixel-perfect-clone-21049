// Client-only text extraction for RFP documents.
// PDF via pdfjs-dist (legacy ESM), DOCX/DOC via mammoth browser build.
// Returns plain text capped to a reasonable length so the server prompt stays small.

export type RFPFileKind = "pdf" | "docx" | "doc";

export const MAX_RFP_BYTES = 100 * 1024 * 1024; // 100 MB
const MAX_PAGES = 200;
const MAX_CHARS = 600_000;

export function detectRFPKind(file: File): RFPFileKind | null {
  const n = file.name.toLowerCase();
  if (n.endsWith(".pdf") || file.type === "application/pdf") return "pdf";
  if (
    n.endsWith(".docx") ||
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  )
    return "docx";
  if (n.endsWith(".doc") || file.type === "application/msword") return "doc";
  return null;
}

async function extractPdf(file: File): Promise<string> {
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  try {
    const workerUrl: string = (await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"))
      .default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  } catch {
    try {
      pdfjs.GlobalWorkerOptions.workerSrc = "";
    } catch {
      /* noop */
    }
  }
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf, disableFontFace: true }).promise;
  const parts: string[] = [];
  const pageCount = Math.min(doc.numPages, MAX_PAGES);
  for (let i = 1; i <= pageCount; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = (content.items as any[])
      .map((it) => (typeof it?.str === "string" ? it.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) parts.push(`[Page ${i}]\n${text}`);
  }
  return parts.join("\n\n");
}

async function extractDocx(file: File): Promise<string> {
  const mammoth: any = await import("mammoth/mammoth.browser" as string);
  const buf = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buf });
  return (result?.value ?? "").replace(/\r\n?/g, "\n").trim();
}

export async function extractRFPText(file: File): Promise<string> {
  const kind = detectRFPKind(file);
  if (!kind) throw new Error("Unsupported file type.");
  let text = "";
  if (kind === "pdf") text = await extractPdf(file);
  else if (kind === "docx") text = await extractDocx(file);
  else throw new Error("Legacy .doc files cannot be parsed. Please convert to PDF or DOCX.");
  const cleaned = text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return cleaned.slice(0, MAX_CHARS);
}
