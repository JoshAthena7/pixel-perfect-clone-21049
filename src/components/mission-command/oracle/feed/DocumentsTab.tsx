/**
 * Feed ATLAS — Documents tab.
 *
 * Lifted from Setup Wizard Step 1 (`Step1Fuel`). Drag-drop upload zone +
 * existing mission_documents list with tagging pills + "Analyze with IRIS"
 * button that triggers the same ORACLE document processing route Step 1 uses.
 *
 * No schema changes; no new pipelines.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Upload, X, Sparkles, FileText } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { extractRFPText } from "@/lib/extract-rfp-text.browser";
import type { DocumentPurpose } from "@/lib/oracle/types";

const BUCKET = "atlas-rfp-documents";
const MAX_BYTES = 100 * 1024 * 1024;
const ALLOWED_EXT = [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".csv", ".txt", ".md", ".rtf"];
const PROCESSOR_URL = "/api/public/hooks/oracle-document-processor";

const PURPOSE_OPTIONS: { value: DocumentPurpose; label: string }[] = [
  { value: "procurement", label: "Procurement" },
  { value: "competitive_intel", label: "Comp Intel" },
  { value: "writing_standards", label: "Writing Guide" },
  { value: "client_strategy", label: "Client Strategy" },
  { value: "reference", label: "Reference" },
];

function guessPurpose(name: string): DocumentPurpose {
  const n = name.toLowerCase();
  if (/rfp|rfq|solicitation|amendment|sow|contract/.test(n)) return "procurement";
  if (/style|guide|voice|tone|brand|writing/.test(n)) return "writing_standards";
  if (/strategy|overview|deck|brief|positioning/.test(n)) return "client_strategy";
  if (/incumbent|prior|former|response|competitor/.test(n)) return "competitive_intel";
  return "reference";
}

type Row = {
  uid: string;
  name: string;
  size: number;
  progress: number;
  status: "queued" | "uploading" | "done" | "error";
  documentId?: string;
  error?: string;
  purpose?: DocumentPurpose;
  userTagged?: boolean;
};

async function extractTextFromBlob(blob: Blob, fileName: string): Promise<string> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".txt") || lower.endsWith(".md") || lower.endsWith(".csv") || lower.endsWith(".rtf")) {
    return blob.text();
  }
  const file = new File([blob], fileName, { type: blob.type });
  return extractRFPText(file);
}

const GOLD = "#C49A2B";

export function DocumentsTab({ missionId }: { missionId: string }) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<{ items: number; docs: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load existing mission_documents on mount
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("mission_documents")
        .select("id, title, file_url, document_purpose")
        .eq("mission_id", missionId)
        .order("created_at", { ascending: true });
      if (!data) return;
      setRows(
        data.map((d) => ({
          uid: d.id,
          name: d.title ?? "Document",
          size: 0,
          progress: 100,
          status: "done" as const,
          documentId: d.id,
          purpose: (d.document_purpose as DocumentPurpose | null) ?? guessPurpose(d.title ?? ""),
          userTagged: !!d.document_purpose,
        })),
      );
    })();
  }, [missionId]);

  const hasAnyDone = rows.some((r) => r.status === "done");
  const allTagged = rows.filter((r) => r.status === "done").every((r) => r.userTagged);
  const canAnalyze = hasAnyDone && allTagged && !analyzing;

  function setRowPurpose(uid: string, purpose: DocumentPurpose) {
    let docId: string | undefined;
    setRows((cur) =>
      cur.map((r) => {
        if (r.uid !== uid) return r;
        docId = r.documentId;
        return { ...r, purpose, userTagged: true };
      }),
    );
    if (docId) void supabase.from("mission_documents").update({ document_purpose: purpose }).eq("id", docId);
  }

  async function removeRow(uid: string) {
    const row = rows.find((r) => r.uid === uid);
    if (!row?.documentId) {
      setRows((cur) => cur.filter((r) => r.uid !== uid));
      return;
    }
    if (!window.confirm(`Remove "${row.name}" from this mission?`)) return;
    const { error } = await supabase.from("mission_documents").delete().eq("id", row.documentId);
    if (error) {
      toast.error(`Failed to remove: ${error.message}`);
      return;
    }
    setRows((cur) => cur.filter((r) => r.uid !== uid));
  }

  async function uploadRow(initial: Row, file: File) {
    setRows((cur) => cur.map((r) => (r.uid === initial.uid ? { ...r, status: "uploading", progress: 15 } : r)));
    try {
      const path = `${missionId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9_.-]/g, "_")}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
      if (upErr) throw upErr;

      setRows((cur) => cur.map((r) => (r.uid === initial.uid ? { ...r, progress: 45 } : r)));
      let extractedText = "";
      try {
        extractedText = (await extractTextFromBlob(file, file.name)).trim();
      } catch (e) {
        console.warn("[FeedATLAS/Documents] extract failed", file.name, e);
      }

      const FIRST = 220_000;
      const CHUNK = 220_000;
      const MAX_TOTAL = 1_000_000;
      const capped = extractedText.slice(0, MAX_TOTAL);
      const head = capped.slice(0, FIRST);
      const chunkMeta: Record<string, string> = {};
      for (let i = FIRST, n = 2; i < capped.length; i += CHUNK, n++) {
        chunkMeta[`text_chunk_${n}`] = capped.slice(i, i + CHUNK);
      }

      const { data: userData } = await supabase.auth.getUser();
      const guessed = guessPurpose(file.name);
      const { data: doc, error: insErr } = await supabase
        .from("mission_documents")
        .insert({
          mission_id: missionId,
          document_type: "other",
          document_purpose: guessed,
          title: file.name.replace(/\.[^.]+$/, "").slice(0, 200),
          file_url: path,
          uploaded_by: userData.user?.id ?? null,
          content_summary: head || null,
          metadata: {
            full_text_length: extractedText.length,
            persisted_text_length: capped.length,
            intelligence_tier: 1,
            upload_timestamp: new Date().toISOString(),
            extraction_method: "browser_pdf_parse",
            text_extraction_ok: extractedText.length > 500,
            uploaded_via: "feed_atlas_drawer",
            ...chunkMeta,
          },
        })
        .select("id")
        .single();
      if (insErr) throw insErr;
      setRows((cur) =>
        cur.map((r) =>
          r.uid === initial.uid
            ? { ...r, status: "done", progress: 100, documentId: doc.id, purpose: guessed, userTagged: false }
            : r,
        ),
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      setRows((cur) => cur.map((r) => (r.uid === initial.uid ? { ...r, status: "error", error: msg } : r)));
    }
  }

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      setError(null);
      for (const f of Array.from(files)) {
        if (!ALLOWED_EXT.some((e) => f.name.toLowerCase().endsWith(e))) {
          setError(`Unsupported file type: ${f.name}`);
          continue;
        }
        if (f.size > MAX_BYTES) {
          setError(`${f.name} is too large (max 100MB).`);
          continue;
        }
        const row: Row = {
          uid: crypto.randomUUID(),
          name: f.name,
          size: f.size,
          progress: 0,
          status: "queued",
        };
        setRows((cur) => [...cur, row]);
        void uploadRow(row, f);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [missionId],
  );

  async function analyze() {
    setAnalyzing(true);
    setResult(null);
    try {
      const { data: docs } = await supabase
        .from("mission_documents")
        .select("id, title, file_url, document_type, document_purpose, processing_status")
        .eq("mission_id", missionId);
      if (!docs?.length) {
        toast.message("No documents to analyze.");
        return;
      }
      const targets = docs.filter(
        (d) => !d.processing_status || d.processing_status === "not_processed" || d.processing_status === "error",
      );
      const { data: { user } } = await supabase.auth.getUser();
      let totalItems = 0;
      let processedDocs = 0;
      for (const doc of targets) {
        if (!doc.file_url) continue;
        try {
          const { data: blob } = await supabase.storage.from(BUCKET).download(doc.file_url);
          if (!blob) continue;
          const file = new File([blob], doc.file_url.split("/").pop() || doc.title || "doc", { type: blob.type });
          const text = (await extractTextFromBlob(file, file.name)).trim();
          if (text.length < 100) continue;
          const res = await fetch(PROCESSOR_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              document_id: doc.id,
              mission_id: missionId,
              extracted_text: text,
              document_title: doc.title,
              document_type: doc.document_type ?? "other",
              content_type_hint: doc.document_purpose ?? null,
              char_count: text.length,
              user_id: user?.id ?? null,
            }),
          });
          const json = (await res.json().catch(() => ({}))) as { ok?: boolean; items_extracted?: number };
          if (json.ok) {
            totalItems += json.items_extracted ?? 0;
            processedDocs += 1;
          }
        } catch (e) {
          console.warn("[FeedATLAS/Documents] processing failed", doc.title, e);
        }
      }
      setResult({ items: totalItems, docs: processedDocs });
      qc.invalidateQueries({ queryKey: ["oracle-signals", missionId] });
      qc.invalidateQueries({ queryKey: ["olympus", "documents", missionId] });
      qc.invalidateQueries({ queryKey: ["olympus", "signals"] });
      qc.invalidateQueries({ queryKey: ["intel-status-widget", missionId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Drag-drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className="rounded cursor-pointer transition-colors flex flex-col items-center justify-center"
        style={{
          height: 120,
          border: `1px dashed ${dragOver ? GOLD : "rgba(196,154,43,0.3)"}`,
          background: dragOver ? "rgba(196,154,43,0.06)" : "transparent",
        }}
      >
        <Upload className="h-4 w-4 mb-2" style={{ color: GOLD }} />
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
          Drop documents here or click to browse
        </div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
          PDF, DOCX, TXT · max 100MB
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          accept={ALLOWED_EXT.join(",")}
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {error && (
        <div className="text-[11px] text-red-300/90 px-2 py-1.5 rounded" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}>
          {error}
        </div>
      )}

      {/* Document list */}
      {rows.length === 0 ? (
        <div className="text-[11px] text-white/40 py-4 text-center">
          No documents uploaded for this mission yet.
        </div>
      ) : (
        <div className="space-y-1.5 max-h-[280px] overflow-y-auto pr-1">
          {rows.map((r) => (
            <DocRow key={r.uid} row={r} onTag={setRowPurpose} onRemove={() => removeRow(r.uid)} />
          ))}
        </div>
      )}

      {/* Result banner */}
      {result && (
        <div
          className="rounded px-3 py-2 text-[11px] flex items-center gap-2"
          style={{ background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.3)", color: "rgb(110,231,183)" }}
        >
          <Sparkles className="h-3.5 w-3.5" />
          IRIS extracted {result.items} items from {result.docs} document{result.docs === 1 ? "" : "s"} — review them in the queue below.
        </div>
      )}

      {/* Analyze button */}
      <div className="flex items-center justify-between gap-3 pt-1">
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)" }}>
          {hasAnyDone && !allTagged ? "Tag every document before analyzing." : `${rows.filter((r) => r.status === "done").length} document${rows.length === 1 ? "" : "s"} ready`}
        </div>
        <button
          type="button"
          onClick={analyze}
          disabled={!canAnalyze}
          className="inline-flex items-center gap-2 rounded transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background: GOLD,
            color: "#000",
            fontWeight: 600,
            fontSize: 11,
            padding: "8px 16px",
            borderRadius: 4,
          }}
        >
          {analyzing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
          Analyze with IRIS
        </button>
      </div>
    </div>
  );
}

function DocRow({
  row,
  onTag,
  onRemove,
}: {
  row: Row;
  onTag: (uid: string, p: DocumentPurpose) => void;
  onRemove: () => void;
}) {
  return (
    <div
      className="rounded px-2.5 py-2"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
    >
      <div className="flex items-center gap-2">
        <FileText className="h-3.5 w-3.5 shrink-0 text-white/40" />
        <div className="flex-1 min-w-0">
          <div className="text-[12px] text-white truncate" title={row.name}>{row.name}</div>
          {row.size > 0 && (
            <div className="text-[9px] text-white/40">{(row.size / 1024).toFixed(0)} KB</div>
          )}
          {row.status === "uploading" && (
            <div className="mt-1 h-0.5 w-full rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
              <div className="h-full" style={{ width: `${row.progress}%`, background: GOLD, transition: "width 200ms ease" }} />
            </div>
          )}
          {row.status === "error" && (
            <div className="text-[9px] text-red-300/80 mt-0.5">{row.error}</div>
          )}
        </div>
        {row.status === "done" && (
          <button
            type="button"
            onClick={onRemove}
            className="shrink-0 text-white/30 hover:text-white/70"
            aria-label="Remove document"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {row.status === "done" && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {PURPOSE_OPTIONS.map((p) => {
            const active = row.purpose === p.value;
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => onTag(row.uid, p.value)}
                className="rounded-full transition-colors"
                style={{
                  fontSize: 10,
                  padding: "2px 8px",
                  color: active ? "#000" : "rgba(255,255,255,0.6)",
                  background: active ? GOLD : "rgba(255,255,255,0.04)",
                  border: `0.5px solid ${active ? GOLD : "rgba(255,255,255,0.1)"}`,
                  fontWeight: active ? 600 : 400,
                }}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
