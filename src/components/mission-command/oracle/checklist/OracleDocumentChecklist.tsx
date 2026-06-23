/**
 * ORACLE Document Checklist — replaces the generic 5-pill drop zone with a
 * guided, status-aware upload experience. ORACLE tells the user what it needs,
 * auto-tags each upload, polls processing status, and flags what's missing.
 *
 * Used by:
 *   - Feed ATLAS drawer Documents tab
 *   - Setup Wizard Step 1 (Fuel)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  FileText,
  Loader2,
  RefreshCw,
  Sparkles,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { extractRFPText } from "@/lib/extract-rfp-text.browser";
import type { DocumentPurpose } from "@/lib/oracle/types";
import {
  ALL_CHECKLIST_ITEMS,
  RECOMMENDED_DOCUMENTS,
  REQUIRED_DOCUMENTS,
  getChecklistItemById,
  matchDocumentToChecklist,
  type ChecklistItem,
  type ChecklistUrgency,
} from "./oracle-checklist-spec";

const BUCKET = "atlas-rfp-documents";
const MAX_BYTES = 100 * 1024 * 1024;
const PROCESSOR_URL = "/api/public/hooks/oracle-document-processor";
const GOLD = "#C49A2B";

const PURPOSE_OPTIONS: { value: DocumentPurpose; label: string }[] = [
  { value: "procurement", label: "Procurement" },
  { value: "competitive_intel", label: "Comp Intel" },
  { value: "writing_standards", label: "Writing Guide" },
  { value: "client_strategy", label: "Client Strategy" },
  { value: "reference", label: "Reference" },
];

type MissionDoc = {
  id: string;
  title: string | null;
  file_url: string | null;
  document_type: string | null;
  document_purpose: DocumentPurpose | null;
  document_checklist_category: string | null;
  processing_status: string | null;
  processing_error_message: string | null;
  processing_error: string | null;
  items_extracted: number | null;
};

type ItemStatus =
  | { kind: "missing" }
  | { kind: "uploading"; progress: number }
  | { kind: "pending"; doc: MissionDoc }
  | { kind: "processing"; doc: MissionDoc; progressLabel?: string }
  | { kind: "complete"; doc: MissionDoc }
  | { kind: "error"; doc: MissionDoc; message: string };

/**
 * Normalize the many `processing_status` values written by different
 * pipeline stages into the 4 buckets the UI understands.
 *  - "complete" / "processed"            → complete
 *  - "processing" / "processing_chunk_*" → processing (with progress label)
 *  - "error" / "failed"                  → error
 *  - "pending" / null / anything else    → pending
 */
function normalizeDocStatus(doc: MissionDoc): {
  kind: "complete" | "processing" | "error" | "pending";
  progressLabel?: string;
} {
  const s = (doc.processing_status ?? "").toLowerCase();
  if (s === "complete" || s === "processed") return { kind: "complete" };
  if (s === "error" || s === "failed") return { kind: "error" };
  if (s === "processing") return { kind: "processing" };
  const chunkMatch = s.match(/^processing_chunk_(\d+)_of_(\d+)$/);
  if (chunkMatch) {
    return { kind: "processing", progressLabel: `Chunk ${chunkMatch[1]}/${chunkMatch[2]}` };
  }
  if (s.startsWith("processing")) return { kind: "processing" };
  return { kind: "pending" };
}

function docErrorMessage(doc: MissionDoc): string {
  return doc.processing_error_message ?? doc.processing_error ?? "Processing failed";
}

async function extractTextFromBlob(blob: Blob, fileName: string): Promise<string> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".txt") || lower.endsWith(".md") || lower.endsWith(".csv") || lower.endsWith(".rtf")) {
    return blob.text();
  }
  const file = new File([blob], fileName, { type: blob.type });
  return extractRFPText(file);
}

function cleanTitle(name: string): string {
  return name.replace(/\.[^.]+$/, "").replace(/_/g, " ").slice(0, 200);
}

export function OracleDocumentChecklist({
  missionId,
  variant = "drawer",
  highlightMissing = false,
}: {
  missionId: string;
  variant?: "drawer" | "wizard";
  highlightMissing?: boolean;
}) {
  const qc = useQueryClient();
  const [docs, setDocs] = useState<MissionDoc[]>([]);
  const [uploadingByItem, setUploadingByItem] = useState<Record<string, number>>({});
  const [expandedWhy, setExpandedWhy] = useState<Record<string, boolean>>({});
  const [expandedAdvanced, setExpandedAdvanced] = useState<Record<string, boolean>>({});
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<{ items: number; docs: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pendingDrop, setPendingDrop] = useState<File | null>(null);
  const [dupeConfirm, setDupeConfirm] = useState<{ file: File; item: ChecklistItem; existing: MissionDoc } | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const dropInputRef = useRef<HTMLInputElement>(null);

  const loadDocs = useCallback(async () => {
    const { data } = await supabase
      .from("mission_documents")
      .select(
        "id, title, file_url, document_type, document_purpose, document_checklist_category, processing_status, processing_error_message, processing_error, items_extracted",
      )
      .eq("mission_id", missionId)
      .order("created_at", { ascending: true });
    setDocs((data ?? []) as MissionDoc[]);
  }, [missionId]);

  useEffect(() => {
    void loadDocs();
  }, [loadDocs]);

  // Poll while any doc is still being analyzed. Use the normalizer so the
  // many "processing_chunk_N_of_M" intermediate statuses also count.
  useEffect(() => {
    const inFlight = docs.some((d) => {
      const n = normalizeDocStatus(d).kind;
      return n === "processing" || n === "pending";
    });
    if (!inFlight) return;
    const t = setInterval(() => {
      void loadDocs();
    }, 10_000);
    return () => clearInterval(t);
  }, [docs, loadDocs]);

  // Match docs to items
  const docsByItem = useMemo(() => {
    const map: Record<string, MissionDoc[]> = {};
    for (const d of docs) {
      const cat =
        d.document_checklist_category ?? matchDocumentToChecklist(d.title) ?? "other";
      (map[cat] ??= []).push(d);
    }
    return map;
  }, [docs]);

  const requiredCount = REQUIRED_DOCUMENTS.length;
  const requiredCovered = REQUIRED_DOCUMENTS.filter(
    (i) => (docsByItem[i.id]?.length ?? 0) > 0,
  ).length;
  const totalCovered = ALL_CHECKLIST_ITEMS.filter(
    (i) => (docsByItem[i.id]?.length ?? 0) > 0,
  ).length;
  const totalItems = ALL_CHECKLIST_ITEMS.length;
  const coveragePct = totalItems === 0 ? 0 : Math.round((totalCovered / totalItems) * 100);

  async function performUpload(file: File, item: ChecklistItem, replaceDocId?: string) {
    if (file.size > MAX_BYTES) {
      toast.error(`${file.name} is too large (max 100MB).`);
      return;
    }
    setUploadingByItem((s) => ({ ...s, [item.id]: 10 }));
    try {
      if (replaceDocId) {
        await supabase.from("mission_documents").delete().eq("id", replaceDocId);
      }
      const path = `${missionId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9_.-]/g, "_")}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      setUploadingByItem((s) => ({ ...s, [item.id]: 45 }));

      let extractedText = "";
      try {
        extractedText = (await extractTextFromBlob(file, file.name)).trim();
      } catch (e) {
        console.warn("[OracleChecklist] extract failed", file.name, e);
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

      const title = cleanTitle(file.name);
      const { data: userData } = await supabase.auth.getUser();
      const insertPayload: Record<string, unknown> = {
        mission_id: missionId,
        document_type: item.document_type,
        document_purpose: item.document_purpose,
        document_checklist_category: item.checklist_category,
        title,
        file_url: path,
        is_primary: item.checklist_category === "primary_rfp",
        processing_status: "pending",
        uploaded_by: userData.user?.id ?? null,
        content_summary: head || null,
        metadata: {
          full_text_length: extractedText.length,
          persisted_text_length: capped.length,
          intelligence_tier: 1,
          upload_timestamp: new Date().toISOString(),
          extraction_method: "browser_pdf_parse",
          text_extraction_ok: extractedText.length > 500,
          uploaded_via: variant === "wizard" ? "wizard_step1" : "feed_atlas_drawer",
          checklist_item_id: item.id,
          ...chunkMeta,
        },
      };
      const { data: doc, error: insErr } = await supabase
        .from("mission_documents")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(insertPayload as any)
        .select("id, title, file_url, document_type, document_purpose, document_checklist_category, processing_status, processing_error_message, items_extracted")
        .single();
      if (insErr) throw insErr;

      setDocs((cur) => [...cur, doc as MissionDoc]);
      setUploadingByItem((s) => {
        const { [item.id]: _, ...rest } = s;
        return rest;
      });

      // Kick off processing
      void processOne(doc as MissionDoc).then(() => loadDocs());
    } catch (e) {
      setUploadingByItem((s) => {
        const { [item.id]: _, ...rest } = s;
        return rest;
      });
      toast.error(e instanceof Error ? e.message : "Upload failed");
    }
  }

  async function handleFileChosen(item: ChecklistItem, file: File) {
    // Dedupe guard
    const cleaned = cleanTitle(file.name).toLowerCase();
    const existing = docs.find(
      (d) => (d.title ?? "").toLowerCase() === cleaned && d.processing_status !== "deleted",
    );
    if (existing) {
      setDupeConfirm({ file, item, existing });
      return;
    }
    await performUpload(file, item);
  }

  async function processOne(doc: MissionDoc) {
    if (!doc.file_url) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const docs = supabase.from("mission_documents") as any;
    try {
      await docs.update({ processing_status: "processing", processing_error_message: null }).eq("id", doc.id);
      const { data: blob } = await supabase.storage.from(BUCKET).download(doc.file_url);
      if (!blob) throw new Error("Could not download file from storage");
      const file = new File([blob], doc.file_url.split("/").pop() || doc.title || "doc", { type: blob.type });
      const text = (await extractTextFromBlob(file, file.name)).trim();
      if (text.length < 100) {
        await docs
          .update({
            processing_status: "error",
            processing_error_message: "Could not extract text — this may be an image-only PDF.",
          })
          .eq("id", doc.id);
        return;
      }
      const { data: { user } } = await supabase.auth.getUser();
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
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; items_extracted?: number; error?: string };
      if (json.ok) {
        await docs
          .update({
            processing_status: "complete",
            items_extracted: json.items_extracted ?? 0,
            processing_error_message: null,
          })
          .eq("id", doc.id);
      } else {
        await docs
          .update({
            processing_status: "error",
            processing_error_message: json.error ?? "Processing failed",
          })
          .eq("id", doc.id);
      }
    } catch (e) {
      await docs
        .update({
          processing_status: "error",
          processing_error_message: e instanceof Error ? e.message : "Processing failed",
        })
        .eq("id", doc.id);
    }
  }


  async function retry(doc: MissionDoc) {
    setDocs((cur) =>
      cur.map((d) => (d.id === doc.id ? { ...d, processing_status: "processing", processing_error_message: null } : d)),
    );
    await processOne(doc);
    void loadDocs();
  }

  async function removeDoc(doc: MissionDoc) {
    if (!window.confirm(`Remove "${doc.title}" from this mission?`)) return;
    const { error } = await supabase.from("mission_documents").delete().eq("id", doc.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setDocs((cur) => cur.filter((d) => d.id !== doc.id));
  }

  async function setDocPurpose(doc: MissionDoc, purpose: DocumentPurpose) {
    await supabase.from("mission_documents").update({ document_purpose: purpose }).eq("id", doc.id);
    setDocs((cur) => cur.map((d) => (d.id === doc.id ? { ...d, document_purpose: purpose } : d)));
  }

  async function analyzeAll() {
    setAnalyzing(true);
    setResult(null);
    try {
      const targets = docs.filter(
        (d) => !d.processing_status || ["not_processed", "error", "pending"].includes(d.processing_status),
      );
      if (targets.length === 0) {
        toast.message("All documents are already processed.");
        setAnalyzing(false);
        return;
      }
      let totalItems = 0;
      let processedDocs = 0;
      for (const doc of targets) {
        await processOne(doc);
        processedDocs += 1;
      }
      await loadDocs();
      const { data: refreshed } = await supabase
        .from("mission_documents")
        .select("id, items_extracted")
        .eq("mission_id", missionId);
      totalItems = (refreshed ?? []).reduce((acc, d) => acc + (d.items_extracted ?? 0), 0);
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

  const allDocsProcessed = docs.length > 0 && docs.every((d) => d.processing_status === "complete");
  const anyUnprocessed = docs.some(
    (d) => !d.processing_status || ["not_processed", "error", "pending"].includes(d.processing_status),
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div style={{ fontSize: 9, color: GOLD, letterSpacing: "0.14em", fontWeight: 600, textTransform: "" }}>
            ⚡ ORACLE Document Checklist
          </div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", marginTop: 4 }}>
            IRIS needs these documents to brief your team correctly. Upload each one — ORACLE will handle the rest.
          </div>
        </div>
        <CoverageRing covered={totalCovered} total={totalItems} percent={coveragePct} />
      </div>

      {/* Drop zone (compact) */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) setPendingDrop(f);
        }}
        onClick={() => dropInputRef.current?.click()}
        className="rounded cursor-pointer transition-colors flex items-center justify-center gap-2"
        style={{
          height: 44,
          border: `1px dashed ${dragOver ? GOLD : "rgba(196,154,43,0.25)"}`,
          background: dragOver ? "rgba(196,154,43,0.06)" : "transparent",
        }}
      >
        <Upload className="h-3.5 w-3.5" style={{ color: GOLD }} />
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)" }}>
          Drop any document here to categorize it manually
        </div>
        <input
          ref={dropInputRef}
          type="file"
          className="hidden"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.rtf"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) setPendingDrop(f);
            e.target.value = "";
          }}
        />
      </div>

      {/* Required section */}
      <Section
        label="REQUIRED"
        labelColor="rgba(248,113,113,0.9)"
        subtitle="ORACLE cannot fully ground IRIS briefs without these."
      >
        {REQUIRED_DOCUMENTS.map((item) => (
          <ChecklistRow
            key={item.id}
            item={item}
            docs={docsByItem[item.id] ?? []}
            uploadingPct={uploadingByItem[item.id]}
            expandedWhy={!!expandedWhy[item.id]}
            expandedAdvanced={!!expandedAdvanced[item.id]}
            highlight={highlightMissing && (docsByItem[item.id]?.length ?? 0) === 0}
            inputRef={(el) => { inputRefs.current[item.id] = el; }}
            onPickFile={() => inputRefs.current[item.id]?.click()}
            onFileChosen={(f) => handleFileChosen(item, f)}
            onToggleWhy={() => setExpandedWhy((s) => ({ ...s, [item.id]: !s[item.id] }))}
            onToggleAdvanced={() => setExpandedAdvanced((s) => ({ ...s, [item.id]: !s[item.id] }))}
            onRetry={retry}
            onRemove={removeDoc}
            onSetPurpose={setDocPurpose}
          />
        ))}
      </Section>

      {/* Recommended */}
      <Section
        label="RECOMMENDED"
        labelColor="rgba(251,191,36,0.9)"
        subtitle="These significantly improve IRIS brief quality."
      >
        {RECOMMENDED_DOCUMENTS.map((item) => (
          <ChecklistRow
            key={item.id}
            item={item}
            docs={docsByItem[item.id] ?? []}
            uploadingPct={uploadingByItem[item.id]}
            expandedWhy={!!expandedWhy[item.id]}
            expandedAdvanced={!!expandedAdvanced[item.id]}
            highlight={false}
            inputRef={(el) => { inputRefs.current[item.id] = el; }}
            onPickFile={() => inputRefs.current[item.id]?.click()}
            onFileChosen={(f) => handleFileChosen(item, f)}
            onToggleWhy={() => setExpandedWhy((s) => ({ ...s, [item.id]: !s[item.id] }))}
            onToggleAdvanced={() => setExpandedAdvanced((s) => ({ ...s, [item.id]: !s[item.id] }))}
            onRetry={retry}
            onRemove={removeDoc}
            onSetPurpose={setDocPurpose}
          />
        ))}
      </Section>

      {/* Result banner */}
      {result && (
        <CoverageReport
          docs={docs}
          docsByItem={docsByItem}
          totalSignals={result.items}
          onRetryFailed={() => {
            const failed = docs.filter((d) => d.processing_status === "error");
            void Promise.all(failed.map((d) => retry(d)));
          }}
        />
      )}

      {/* Analyze button */}
      <div className="flex items-center justify-between gap-3 pt-1">
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)" }}>
          {requiredCovered}/{requiredCount} required · {totalCovered}/{totalItems} total documents loaded
        </div>
        <button
          type="button"
          onClick={analyzeAll}
          disabled={analyzing || docs.length === 0}
          title={allDocsProcessed ? "This will re-process all documents and may create duplicate signals" : undefined}
          className="inline-flex items-center gap-2 rounded transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background: anyUnprocessed ? GOLD : "rgba(196,154,43,0.4)",
            color: "#000",
            fontWeight: 600,
            fontSize: 11,
            padding: "8px 16px",
            borderRadius: 4,
          }}
        >
          {analyzing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
          {docs.length === 0 ? "Upload documents above to analyze" : allDocsProcessed ? "Re-analyze All" : "Analyze with IRIS"}
        </button>
      </div>

      {/* Drag-drop category picker */}
      {pendingDrop && (
        <CategoryPickerModal
          file={pendingDrop}
          onPick={(item) => {
            const f = pendingDrop;
            setPendingDrop(null);
            void handleFileChosen(item, f);
          }}
          onCancel={() => setPendingDrop(null)}
        />
      )}

      {/* Duplicate confirmation */}
      {dupeConfirm && (
        <DupeConfirmModal
          existing={dupeConfirm.existing}
          onReplace={() => {
            const { file, item, existing } = dupeConfirm;
            setDupeConfirm(null);
            void performUpload(file, item, existing.id);
          }}
          onNewVersion={() => {
            const { file, item } = dupeConfirm;
            setDupeConfirm(null);
            // Rename to vN
            const versionMatch = file.name.match(/v(\d+)/i);
            const next = versionMatch ? Number(versionMatch[1]) + 1 : 2;
            const renamed = new File(
              [file],
              file.name.replace(/(\.[^.]+)$/, ` v${next}$1`),
              { type: file.type },
            );
            void performUpload(renamed, item);
          }}
          onCancel={() => setDupeConfirm(null)}
        />
      )}
    </div>
  );
}

function Section({
  label,
  labelColor,
  subtitle,
  children,
}: {
  label: string;
  labelColor: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div>
        <div style={{ fontSize: 8, letterSpacing: "0.12em", fontWeight: 700, color: labelColor }}>{label}</div>
        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.45)", fontStyle: "italic", marginTop: 2 }}>{subtitle}</div>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function CoverageRing({ covered, total, percent }: { covered: number; total: number; percent: number }) {
  const size = 44;
  const stroke = 3;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (percent / 100) * c;
  return (
    <div className="flex flex-col items-center" style={{ minWidth: 64 }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={GOLD}
          strokeWidth={stroke}
          strokeDasharray={`${dash} ${c}`}
          strokeLinecap="round"
        />
      </svg>
      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>
        {covered} of {total}
      </div>
    </div>
  );
}

type RowProps = {
  item: ChecklistItem;
  docs: MissionDoc[];
  uploadingPct: number | undefined;
  expandedWhy: boolean;
  expandedAdvanced: boolean;
  highlight: boolean;
  inputRef: (el: HTMLInputElement | null) => void;
  onPickFile: () => void;
  onFileChosen: (f: File) => void;
  onToggleWhy: () => void;
  onToggleAdvanced: () => void;
  onRetry: (doc: MissionDoc) => void;
  onRemove: (doc: MissionDoc) => void;
  onSetPurpose: (doc: MissionDoc, p: DocumentPurpose) => void;
};

function ChecklistRow(props: RowProps) {
  const { item, docs, uploadingPct, expandedWhy, expandedAdvanced, highlight } = props;
  const isMissing = docs.length === 0 && uploadingPct === undefined;
  const isUploading = uploadingPct !== undefined;
  const firstDoc = docs[0];
  const status: ItemStatus = isUploading
    ? { kind: "uploading", progress: uploadingPct! }
    : isMissing
      ? { kind: "missing" }
      : firstDoc.processing_status === "complete"
        ? { kind: "complete", doc: firstDoc }
        : firstDoc.processing_status === "error"
          ? { kind: "error", doc: firstDoc, message: firstDoc.processing_error_message ?? "Processing failed" }
          : firstDoc.processing_status === "processing"
            ? { kind: "processing", doc: firstDoc }
            : { kind: "pending", doc: firstDoc };

  const borderColor =
    isMissing && item.urgency === "critical"
      ? "rgba(248,113,113,0.6)"
      : isMissing
        ? "rgba(251,191,36,0.3)"
        : status.kind === "complete"
          ? "rgba(74,222,128,0.7)"
          : status.kind === "error"
            ? "rgba(248,113,113,0.9)"
            : status.kind === "processing" || status.kind === "uploading"
              ? "rgba(251,191,36,0.8)"
              : "rgba(251,191,36,0.4)";

  return (
    <div
      className="rounded transition-all"
      style={{
        background: "rgba(255,255,255,0.02)",
        borderLeft: `3px solid ${borderColor}`,
        borderTop: "1px solid rgba(255,255,255,0.04)",
        borderRight: "1px solid rgba(255,255,255,0.04)",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
        padding: "12px 14px",
        boxShadow: highlight ? `0 0 0 1px ${GOLD}, 0 0 14px rgba(196,154,43,0.4)` : undefined,
        animation: highlight ? "pulse 1.4s ease-in-out 2" : undefined,
      }}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <StatusIcon status={status} urgency={item.urgency} />
            <div style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>{item.label}</div>
          </div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 4, lineHeight: 1.4 }}>
            {item.description}{" "}
            <button
              type="button"
              onClick={props.onToggleWhy}
              style={{ fontSize: 9, color: "rgba(255,255,255,0.45)", textDecoration: "underline", marginLeft: 2 }}
            >
              {expandedWhy ? "Hide" : "Why?"}
            </button>
          </div>
          {expandedWhy && (
            <div style={{ fontSize: 10, color: GOLD, fontStyle: "italic", marginTop: 6, lineHeight: 1.4 }}>
              {item.why_it_matters}
            </div>
          )}
          {/* Status detail line */}
          <StatusDetail status={status} onRetry={props.onRetry} />

          {/* Additional docs for multi items */}
          {item.multiple && docs.length > 1 && (
            <div className="mt-2 space-y-1">
              {docs.slice(1).map((d) => (
                <DocPillRow key={d.id} doc={d} onRetry={props.onRetry} onRemove={props.onRemove} />
              ))}
            </div>
          )}

          {/* Advanced tagging */}
          {firstDoc && (
            <div className="mt-2">
              <button
                type="button"
                onClick={props.onToggleAdvanced}
                style={{ fontSize: 8, color: "rgba(255,255,255,0.4)", textTransform: "", letterSpacing: "0.08em" }}
              >
                {expandedAdvanced ? "▼" : "▶"} Advanced tagging
              </button>
              {expandedAdvanced && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {PURPOSE_OPTIONS.map((p) => {
                    const active = firstDoc.document_purpose === p.value;
                    return (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => props.onSetPurpose(firstDoc, p.value)}
                        className="rounded-full transition-colors"
                        style={{
                          fontSize: 9,
                          padding: "2px 7px",
                          color: active ? "#000" : "rgba(255,255,255,0.55)",
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
          )}
        </div>

        <div className="flex-none flex flex-col items-end gap-1">
          {isMissing && (
            <button
              type="button"
              onClick={props.onPickFile}
              className="inline-flex items-center gap-1.5 rounded"
              style={{
                background: GOLD,
                color: "#000",
                fontWeight: 600,
                fontSize: 10,
                padding: "6px 10px",
                height: 28,
              }}
            >
              <Upload className="h-3 w-3" />
              Upload
            </button>
          )}
          {isUploading && (
            <div style={{ fontSize: 9, color: GOLD }} className="inline-flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              {Math.round(uploadingPct!)}%
            </div>
          )}
          {status.kind === "complete" && (
            <>
              <div style={{ fontSize: 9, color: "rgba(74,222,128,0.85)" }}>✓ Loaded</div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)" }}>
                {status.doc.items_extracted ?? 0} items
              </div>
            </>
          )}
          {status.kind === "error" && (
            <button
              type="button"
              onClick={() => props.onRetry(status.doc)}
              className="inline-flex items-center gap-1 rounded"
              style={{
                background: "rgba(248,113,113,0.15)",
                color: "rgb(252,165,165)",
                fontSize: 9,
                padding: "4px 8px",
                border: "1px solid rgba(248,113,113,0.4)",
              }}
            >
              <RefreshCw className="h-2.5 w-2.5" />
              Retry
            </button>
          )}
          {item.multiple && !isMissing && !isUploading && (
            <button
              type="button"
              onClick={props.onPickFile}
              style={{ fontSize: 9, color: GOLD, textDecoration: "underline" }}
            >
              + Add another
            </button>
          )}
        </div>
      </div>
      <input
        ref={props.inputRef}
        type="file"
        className="hidden"
        accept={item.accept}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) props.onFileChosen(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function StatusIcon({ status, urgency }: { status: ItemStatus; urgency: ChecklistUrgency }) {
  if (status.kind === "complete") return <CheckCircle2 className="h-3.5 w-3.5" style={{ color: "rgb(74,222,128)" }} />;
  if (status.kind === "error") return <XCircle className="h-3.5 w-3.5" style={{ color: "rgb(248,113,113)" }} />;
  if (status.kind === "processing" || status.kind === "uploading")
    return <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: GOLD }} />;
  if (status.kind === "pending") return <AlertTriangle className="h-3.5 w-3.5" style={{ color: GOLD }} />;
  return (
    <div
      className="h-3.5 w-3.5 rounded-sm"
      style={{
        border: `1px solid ${urgency === "critical" ? "rgba(248,113,113,0.55)" : "rgba(255,255,255,0.3)"}`,
      }}
    />
  );
}



function StatusDetail({ status, onRetry }: { status: ItemStatus; onRetry: (d: MissionDoc) => void }) {
  if (status.kind === "processing") {
    return (
      <div style={{ fontSize: 9, color: GOLD, fontStyle: "italic", marginTop: 4 }}>
        IRIS is reading this document...
      </div>
    );
  }
  if (status.kind === "pending") {
    return (
      <div style={{ fontSize: 9, color: "rgba(251,191,36,0.7)", marginTop: 4 }}>
        ⚠ Uploaded — waiting for analysis.
      </div>
    );
  }
  if (status.kind === "complete") {
    const n = status.doc.items_extracted ?? 0;
    return (
      <div style={{ fontSize: 9, color: "rgb(74,222,128)", marginTop: 4 }}>
        {n === 0
          ? "Processed — 0 signals found. This document may be an image PDF — try uploading a text version."
          : `${n} signal${n === 1 ? "" : "s"} extracted`}
      </div>
    );
  }
  if (status.kind === "error") {
    return (
      <div style={{ fontSize: 9, color: "rgb(252,165,165)", marginTop: 4 }}>
        {status.message}
      </div>
    );
  }
  return null;
}

function DocPillRow({
  doc,
  onRetry,
  onRemove,
}: {
  doc: MissionDoc;
  onRetry: (d: MissionDoc) => void;
  onRemove: (d: MissionDoc) => void;
}) {
  return (
    <div
      className="flex items-center gap-2 rounded px-2 py-1"
      style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}
    >
      <FileText className="h-3 w-3 text-white/30" />
      <div className="flex-1 min-w-0 truncate" style={{ fontSize: 10, color: "rgba(255,255,255,0.7)" }}>
        {doc.title}
      </div>
      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)" }}>
        {doc.processing_status === "complete"
          ? `✓ ${doc.items_extracted ?? 0}`
          : doc.processing_status === "error"
            ? "⚠ error"
            : doc.processing_status === "processing"
              ? "⏳"
              : "•"}
      </div>
      {doc.processing_status === "error" && (
        <button type="button" onClick={() => onRetry(doc)} style={{ fontSize: 9, color: GOLD }}>
          retry
        </button>
      )}
      <button type="button" onClick={() => onRemove(doc)} className="text-white/30 hover:text-white/70">
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

function CoverageReport({
  docs,
  docsByItem,
  totalSignals,
  onRetryFailed,
}: {
  docs: MissionDoc[];
  docsByItem: Record<string, MissionDoc[]>;
  totalSignals: number;
  onRetryFailed: () => void;
}) {
  const date = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return (
    <div
      className="rounded p-4 space-y-2 animate-in fade-in slide-in-from-bottom-2"
      style={{ background: "rgba(196,154,43,0.04)", border: "1px solid rgba(196,154,43,0.25)" }}
    >
      <div className="flex items-center justify-between">
        <div style={{ fontSize: 10, color: GOLD, letterSpacing: "0.12em", fontWeight: 700, textTransform: "" }}>
          ORACLE Coverage Report
        </div>
        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.45)" }}>{date}</div>
      </div>
      <div className="space-y-1">
        {ALL_CHECKLIST_ITEMS.map((item) => {
          const itemDocs = docsByItem[item.id] ?? [];
          const first = itemDocs[0];
          const status =
            !first ? "missing"
            : first.processing_status === "complete" ? "complete"
            : first.processing_status === "error" ? "error"
            : "processing";
          const icon = status === "complete" ? "✅" : status === "error" ? "❌" : status === "processing" ? "⏳" : "☐ ";
          const color =
            status === "complete" ? "rgb(74,222,128)"
            : status === "error" ? "rgb(248,113,113)"
            : status === "processing" ? GOLD
            : item.urgency === "critical" ? "rgba(248,113,113,0.7)" : "rgba(255,255,255,0.35)";
          const detail =
            status === "complete" ? `${first?.items_extracted ?? 0} signals extracted`
            : status === "error" ? "Processing failed — retry below"
            : status === "processing" ? "Still processing..."
            : item.urgency === "critical" ? "Not uploaded — IRIS has blind spots" : "Not uploaded";
          return (
            <div key={item.id} className="flex items-center gap-3" style={{ fontSize: 10 }}>
              <span style={{ width: 16 }}>{icon}</span>
              <span style={{ color, flex: 1 }}>{item.label}</span>
              <span style={{ color: "rgba(255,255,255,0.5)" }}>{detail}</span>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", paddingTop: 8 }}>
        ORACLE now has <span style={{ color: GOLD, fontWeight: 600 }}>{totalSignals}</span> signal candidate{totalSignals === 1 ? "" : "s"} ready for review.
      </div>
      {docs.some((d) => d.processing_status === "error") && (
        <button
          type="button"
          onClick={onRetryFailed}
          style={{
            fontSize: 10,
            color: "rgb(252,165,165)",
            background: "rgba(248,113,113,0.1)",
            border: "1px solid rgba(248,113,113,0.3)",
            padding: "4px 10px",
            borderRadius: 4,
          }}
        >
          Retry failed documents
        </button>
      )}
    </div>
  );
}

function CategoryPickerModal({
  file,
  onPick,
  onCancel,
}: {
  file: File;
  onPick: (item: ChecklistItem) => void;
  onCancel: () => void;
}) {
  const guess = useMemo(() => {
    const id = matchDocumentToChecklist(file.name);
    return id ? getChecklistItemById(id) : undefined;
  }, [file]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }}>
      <div
        className="w-full max-w-lg rounded p-5 space-y-3"
        style={{ background: "#0a121f", border: "1px solid rgba(196,154,43,0.3)" }}
      >
        <div>
          <div style={{ fontSize: 9, color: GOLD, letterSpacing: "0.12em", textTransform: "", fontWeight: 600 }}>
            What type of document is this?
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", marginTop: 4 }}>{file.name}</div>
        </div>
        {guess && (
          <button
            type="button"
            onClick={() => onPick(guess)}
            className="w-full text-left rounded p-3"
            style={{ background: "rgba(196,154,43,0.1)", border: `1px solid ${GOLD}` }}
          >
            <div style={{ fontSize: 9, color: GOLD, fontWeight: 600 }}>✨ Let ORACLE decide</div>
            <div style={{ fontSize: 11, color: "#fff", marginTop: 2 }}>{guess.label}</div>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)" }}>{guess.description}</div>
          </button>
        )}
        <div className="max-h-72 overflow-y-auto space-y-1">
          {ALL_CHECKLIST_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onPick(item)}
              className="w-full text-left rounded p-2 flex items-center gap-2 hover:bg-white/5"
              style={{ background: "rgba(255,255,255,0.02)" }}
            >
              <ChevronRight className="h-3 w-3 text-white/30" />
              <div className="flex-1 min-w-0">
                <div style={{ fontSize: 11, color: "#fff" }}>{item.label}</div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.45)" }}>{item.description}</div>
              </div>
            </button>
          ))}
        </div>
        <div className="flex justify-end">
          <button type="button" onClick={onCancel} style={{ fontSize: 10, color: "rgba(255,255,255,0.55)" }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function DupeConfirmModal({
  existing,
  onReplace,
  onNewVersion,
  onCancel,
}: {
  existing: MissionDoc;
  onReplace: () => void;
  onNewVersion: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }}>
      <div
        className="w-full max-w-md rounded p-5 space-y-4"
        style={{ background: "#0a121f", border: "1px solid rgba(196,154,43,0.3)" }}
      >
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>Document already exists</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", marginTop: 6 }}>
            <span style={{ color: GOLD }}>"{existing.title}"</span> has already been uploaded (status:{" "}
            {existing.processing_status ?? "pending"}). Replace it or upload as a new version?
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", padding: "6px 10px" }}>
            Cancel
          </button>
          <button
            type="button"
            onClick={onNewVersion}
            style={{ fontSize: 10, color: GOLD, padding: "6px 10px", border: `1px solid ${GOLD}`, borderRadius: 4 }}
          >
            Upload as new version
          </button>
          <button
            type="button"
            onClick={onReplace}
            style={{ fontSize: 10, background: GOLD, color: "#000", padding: "6px 10px", borderRadius: 4, fontWeight: 600 }}
          >
            Replace existing
          </button>
        </div>
      </div>
    </div>
  );
}
