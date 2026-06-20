/**
 * Olympus Documents Tab — lists mission_documents, lets the user kick off
 * ORACLE processing. Text extraction happens entirely client-side via the
 * existing pdfjs + mammoth extractors; the server route only receives plain
 * text and produces oracle_signals.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Zap, FileText, AlertCircle, CheckCircle2 } from "lucide-react";

const STORAGE_BUCKET = "atlas-rfp-documents";
const POLL_INTERVAL_MS = 3_000;
const PROCESSOR_URL = "/api/public/hooks/oracle-document-processor";

type Doc = {
  id: string;
  mission_id: string;
  title: string;
  document_type: string;
  document_purpose: string | null;
  file_url: string;
  created_at: string;
  processing_status: string | null;
  processed_at: string | null;
  items_extracted: number | null;
  processing_error: string | null;
};

function useDocuments(missionId: string | null) {
  return useQuery({
    queryKey: ["olympus", "documents", missionId],
    enabled: !!missionId,
    queryFn: async (): Promise<Doc[]> => {
      const { data, error } = await supabase
        .from("mission_documents")
        .select(
          "id,mission_id,title,document_type,document_purpose,file_url,created_at,processing_status,processed_at,items_extracted,processing_error",
        )
        .eq("mission_id", missionId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Doc[];
    },
    refetchInterval: (q) => {
      const docs = (q.state.data as Doc[] | undefined) ?? [];
      const anyProcessing = docs.some((d) =>
        (d.processing_status ?? "").startsWith("processing"),
      );
      return anyProcessing ? POLL_INTERVAL_MS : false;
    },
  });
}

export function DocumentsTab({ missionId }: { missionId: string | null }) {
  const qc = useQueryClient();
  const documentsQ = useDocuments(missionId);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [phase, setPhase] = useState<string>("");
  const beforeUnloadRef = useRef<((e: BeforeUnloadEvent) => void) | null>(null);

  const docs = documentsQ.data ?? [];
  const rfp = useMemo(
    () => docs.find((d) => d.document_type === "primary_rfp"),
    [docs],
  );
  const rfpProcessed = rfp && rfp.processing_status === "processed";

  const totalProcessed = docs.filter((d) => d.processing_status === "processed").length;
  const totalItems = docs.reduce((sum, d) => sum + (d.items_extracted ?? 0), 0);

  function installBeforeUnload() {
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue =
        "ORACLE is processing your document. Closing this tab will stop processing.";
    };
    beforeUnloadRef.current = handler;
    window.addEventListener("beforeunload", handler);
  }

  function removeBeforeUnload() {
    if (beforeUnloadRef.current) {
      window.removeEventListener("beforeunload", beforeUnloadRef.current);
      beforeUnloadRef.current = null;
    }
  }

  useEffect(() => () => removeBeforeUnload(), []);

  async function processDoc(doc: Doc, skipConfirm = false) {
    if (!skipConfirm) {
      const ok = window.confirm(
        `Process "${doc.title}" with IRIS?\n\nThis will extract intelligence items and add them to the ORACLE review queue. For large documents this may take 2–5 minutes — keep this tab open.`,
      );
      if (!ok) return;
    }

    setActiveId(doc.id);
    installBeforeUnload();
    let pollTimer: number | null = null;
    try {
      setPhase("Downloading file…");
      const { data: blob, error: dlErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .download(doc.file_url);
      if (dlErr || !blob) throw new Error(dlErr?.message || "Download failed");

      const lower = doc.file_url.toLowerCase();
      setPhase(`Extracting text from ${doc.title}…`);
      const file = new File([blob], doc.file_url.split("/").pop() || doc.title, {
        type: blob.type || guessMime(lower),
      });
      let text = "";
      if (lower.endsWith(".pdf") || file.type === "application/pdf") {
        text = await extractPdf(file);
      } else if (
        lower.endsWith(".docx") ||
        lower.endsWith(".doc") ||
        file.type ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      ) {
        text = await extractDocx(file);
      } else if (lower.endsWith(".txt") || lower.endsWith(".md")) {
        text = (await new Response(blob).text()).trim();
      } else {
        throw new Error(`Unsupported file type: ${lower.split(".").pop()}`);
      }

      if (text.length < 100) {
        throw new Error(`Extracted text too short (${text.length} chars)`);
      }

      console.log(`[DocumentsTab] Extracted ${text.length} chars from ${doc.title}`);
      setPhase(`${text.length.toLocaleString()} characters extracted — sending to IRIS…`);

      const { data: { user } } = await supabase.auth.getUser();

      setPhase("Processing with IRIS (this can take 2–5 minutes)…");
      pollTimer = window.setInterval(() => {
        qc.invalidateQueries({ queryKey: ["olympus", "documents", missionId] });
      }, POLL_INTERVAL_MS);

      const res = await fetch(PROCESSOR_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document_id: doc.id,
          mission_id: doc.mission_id,
          extracted_text: text,
          document_title: doc.title,
          document_type: doc.document_type,
          content_type_hint: (doc as { document_purpose?: string | null }).document_purpose ?? null,
          char_count: text.length,
          user_id: user?.id ?? null,
        }),
      });
      const result = (await res.json().catch(() => ({ ok: false, error: "Invalid JSON" }))) as {
        ok: boolean;
        items_extracted?: number;
        error?: string;
      };
      if (!res.ok || !result.ok) {
        throw new Error(result.error || `Processor failed with status ${res.status}`);
      }

      await qc.invalidateQueries({ queryKey: ["olympus", "documents", missionId] });
      await qc.invalidateQueries({ queryKey: ["olympus", "signals"] });

      const n = result.items_extracted ?? 0;
      toast.success(
        `Extracted ${n} intelligence items from "${doc.title}" — review them in the ORACLE queue`,
        { duration: 8_000 },
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[DocumentsTab] processing failed:", msg);
      toast.error(`Processing failed: ${msg}`);
    } finally {
      if (pollTimer != null) window.clearInterval(pollTimer);
      setActiveId(null);
      setPhase("");
      removeBeforeUnload();
    }
  }

  if (!missionId) {
    return <div className="text-[12px] text-white/40 py-6 text-center">Select a mission.</div>;
  }
  if (documentsQ.isLoading) {
    return <div className="text-[12px] text-white/40 py-6 text-center">Loading documents…</div>;
  }
  if (docs.length === 0) {
    return (
      <div className="text-[12px] text-white/40 py-6 text-center">
        No documents uploaded for this mission.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {rfp && !rfpProcessed && (
        <div
          className="rounded p-3 text-[12px] mb-3"
          style={{
            background: "rgba(196,154,43,0.12)",
            border: "1px solid rgba(196,154,43,0.3)",
          }}
        >
          <div className="flex items-start gap-2">
            <Zap className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "#d4af37" }} />
            <div className="flex-1">
              <div className="text-white/90 leading-snug mb-2">
                Your RFP document has not been processed yet. Processing it will ground every
                IRIS brief on every question with RFP-specific intelligence. This is the
                highest-value action you can take right now.
              </div>
              <button
                onClick={() => processDoc(rfp, true)}
                disabled={!!activeId}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-medium disabled:opacity-50"
                style={{ background: "#d4af37", color: "#0a0a0a" }}
              >
                {activeId === rfp.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Zap className="h-3 w-3" />
                )}
                Process RFP Now
              </button>
            </div>
          </div>
        </div>
      )}

      {rfp && rfpProcessed && (
        <div
          className="rounded p-2 text-[11px] mb-3 flex items-center gap-2"
          style={{
            background: "rgba(16,185,129,0.08)",
            border: "1px solid rgba(16,185,129,0.25)",
            color: "rgb(110,231,183)",
          }}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          RFP processed · {rfp.items_extracted ?? 0} items extracted ·{" "}
          {rfp.processed_at ? new Date(rfp.processed_at).toLocaleDateString() : "—"}
        </div>
      )}

      {docs.map((doc) => (
        <DocCard
          key={doc.id}
          doc={doc}
          processing={activeId === doc.id}
          phase={activeId === doc.id ? phase : ""}
          disabled={!!activeId && activeId !== doc.id}
          onProcess={() => processDoc(doc)}
        />
      ))}

      <div
        className="mt-4 pt-3 text-[11px] text-white/50 border-t"
        style={{ borderColor: "rgba(255,255,255,0.06)" }}
      >
        {totalProcessed} of {docs.length} documents processed · {totalItems} total intel items extracted
      </div>
    </div>
  );
}

function DocCard({
  doc,
  processing,
  phase,
  disabled,
  onProcess,
}: {
  doc: Doc;
  processing: boolean;
  phase: string;
  disabled: boolean;
  onProcess: () => void;
}) {
  const status = doc.processing_status ?? "not_processed";
  const isProcessing = status.startsWith("processing");
  const isProcessed = status === "processed";
  const isError = status === "error";

  const typeColor = doc.document_type === "primary_rfp" ? "#d4af37" : "#3b82f6";

  return (
    <div
      className="relative flex items-center gap-3 rounded"
      style={{
        minHeight: 80,
        padding: 12,
        paddingLeft: 16,
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 6,
        background: "rgba(255,255,255,0.02)",
      }}
    >
      <div
        className="absolute left-0 top-0 bottom-0"
        style={{ width: 4, background: typeColor, borderRadius: "6px 0 0 6px" }}
      />

      <FileText className="h-4 w-4 shrink-0 text-white/30" />

      <div className="flex-1 min-w-0">
        <div className="text-white text-[12px] font-medium truncate" title={doc.title}>
          {doc.title}
        </div>
        <div className="flex items-center gap-2 mt-1 text-[11px] text-white/40 flex-wrap">
          <span
            className="px-1.5 py-0.5 rounded"
            style={{ border: `1px solid ${typeColor}55`, color: typeColor }}
          >
            {doc.document_type === "primary_rfp" ? "RFP" : "Support Doc"}
          </span>
          <span>{new Date(doc.created_at).toLocaleDateString()}</span>
          <StatusBadge status={status} itemsExtracted={doc.items_extracted ?? 0} />
        </div>
        {processing && phase && (
          <div className="text-[11px] text-amber-300/80 mt-1 truncate">{phase}</div>
        )}
        {isProcessing && !processing && (
          <div className="text-[11px] text-amber-300/80 mt-1">{status.replace(/_/g, " ")}</div>
        )}
        {isError && doc.processing_error && (
          <div
            className="text-[11px] text-red-300/80 mt-1 truncate"
            title={doc.processing_error}
          >
            {doc.processing_error}
          </div>
        )}
      </div>

      <button
        onClick={onProcess}
        disabled={disabled || isProcessing || processing}
        className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[11px] font-medium disabled:opacity-40 disabled:cursor-not-allowed"
        style={{
          border: isProcessed
            ? "1px solid rgba(255,255,255,0.15)"
            : "1px solid #d4af37",
          color: "#fff",
          background: "transparent",
        }}
      >
        {processing || isProcessing ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : isError ? (
          <AlertCircle className="h-3 w-3 text-red-300" />
        ) : (
          <Zap className="h-3 w-3" style={{ color: isProcessed ? "#fff" : "#d4af37" }} />
        )}
        {isProcessed ? "Re-process" : isError ? "Retry" : "Process with IRIS"}
      </button>
    </div>
  );
}

function StatusBadge({ status, itemsExtracted }: { status: string; itemsExtracted: number }) {
  if (status === "processed") {
    return (
      <span
        className="px-1.5 py-0.5 rounded text-emerald-300"
        style={{ border: "1px solid rgba(16,185,129,0.4)" }}
      >
        Processed · {itemsExtracted} items extracted
      </span>
    );
  }
  if (status.startsWith("processing")) {
    return (
      <span
        className="px-1.5 py-0.5 rounded text-amber-300 animate-pulse"
        style={{ border: "1px solid rgba(245,158,11,0.4)" }}
      >
        Processing
      </span>
    );
  }
  if (status === "error") {
    return (
      <span
        className="px-1.5 py-0.5 rounded text-red-300"
        style={{ border: "1px solid rgba(239,68,68,0.4)" }}
      >
        Error
      </span>
    );
  }
  return (
    <span
      className="px-1.5 py-0.5 rounded text-white/40"
      style={{ border: "1px solid rgba(255,255,255,0.15)" }}
    >
      Not Processed
    </span>
  );
}

function guessMime(filenameLower: string): string {
  if (filenameLower.endsWith(".pdf")) return "application/pdf";
  if (filenameLower.endsWith(".docx"))
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (filenameLower.endsWith(".doc")) return "application/msword";
  if (filenameLower.endsWith(".txt")) return "text/plain";
  return "application/octet-stream";
}

// ============================================================
// Text extractors — reuse the existing browser-only pattern from
// src/lib/atlas-onboarding-text-extract.ts (pdfjs-dist + mammoth)
// ============================================================

async function extractPdf(file: File): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjs: any = await import("pdfjs-dist");
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
  const maxPages = Math.min(pdf.numPages, 500);
  for (let i = 1; i <= maxPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const line = (content.items as any[])
      .map((it) => ("str" in it ? it.str : ""))
      .filter(Boolean)
      .join(" ");
    pageTexts.push(line);
  }
  return pageTexts.join("\n\n").trim();
}

async function extractDocx(file: File): Promise<string> {
  // @ts-expect-error — mammoth ships a browser subpath without typings.
  const mammoth: any = await import("mammoth/mammoth.browser");
  const buf = await file.arrayBuffer();
  const res = await mammoth.extractRawText({ arrayBuffer: buf });
  return (res?.value ?? "").toString().trim();
}
