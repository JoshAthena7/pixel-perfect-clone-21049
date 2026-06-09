/**
 * Browser-side text extraction for the Atlas onboarding Step 4 resume
 * upload. Runs only in the browser because pdfjs-dist and mammoth both
 * require browser APIs.
 */

const PDF_MIME = "application/pdf";
const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const DOC_MIME = "application/msword";

export function isSupportedResumeMime(mime: string): boolean {
  return mime === PDF_MIME || mime === DOCX_MIME || mime === DOC_MIME;
}

export async function extractResumeText(file: File): Promise<string> {
  if (file.type === PDF_MIME || file.name.toLowerCase().endsWith(".pdf")) {
    return extractPdfText(file);
  }
  if (
    file.type === DOCX_MIME ||
    file.type === DOC_MIME ||
    /\.docx?$/i.test(file.name)
  ) {
    return extractDocxText(file);
  }
  throw new Error("Unsupported file type");
}

async function extractPdfText(file: File): Promise<string> {
  // Dynamic import so the worker is only loaded when needed.
  const pdfjs: any = await import("pdfjs-dist");
  // Inline-worker fallback: provide a no-op workerSrc which forces pdfjs
  // to run on the main thread (acceptable for resumes, which are small).
  try {
    pdfjs.GlobalWorkerOptions.workerSrc = "";
  } catch {
    /* noop */
  }
  const buf = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({
    data: buf,
    disableWorker: true,
    isEvalSupported: false,
  });
  const pdf = await loadingTask.promise;
  const pageTexts: string[] = [];
  const maxPages = Math.min(pdf.numPages, 25);
  for (let i = 1; i <= maxPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const line = (content.items as any[])
      .map((it) => ("str" in it ? it.str : ""))
      .filter(Boolean)
      .join(" ");
    pageTexts.push(line);
  }
  return pageTexts.join("\n\n").trim();
}

async function extractDocxText(file: File): Promise<string> {
  // @ts-expect-error — mammoth ships a browser subpath without typings.
  const mammoth: any = await import("mammoth/mammoth.browser");
  const buf = await file.arrayBuffer();
  const res = await mammoth.extractRawText({ arrayBuffer: buf });
  return (res?.value ?? "").toString().trim();
}
