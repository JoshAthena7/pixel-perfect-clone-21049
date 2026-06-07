import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  Upload,
  FileText,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import {
  listMissionDocuments,
  createMissionDocument,
  markDocumentProcessed,
  markDocumentError,
  deleteMissionDocument,
  generateIrisIntelligence,
} from "@/lib/iris-intelligence.functions";

const DOC_TYPES = [
  "RFP",
  "Amendment",
  "Model Contract",
  "Regulation",
  "Waiver",
  "Legislative",
  "Stakeholder Report",
  "Advocacy",
  "Research",
  "News",
  "Provider Materials",
  "Incumbent Report",
  "Other",
] as const;
type DocType = (typeof DOC_TYPES)[number];

const ACCEPT = ".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain";

interface PendingFile {
  tempId: string;
  file: File;
  docType: DocType;
}

// Extract text from a file in the browser. Returns { text, page_count }.
// TODO: Add OCR pipeline for scanned documents
async function extractText(file: File): Promise<{ text: string; page_count: number | null }> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".txt") || file.type === "text/plain") {
    return { text: await file.text(), page_count: null };
  }
  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    const { extractText: pdfExtract, getDocumentProxy } = await import("unpdf");
    const buf = new Uint8Array(await file.arrayBuffer());
    const pdf = await getDocumentProxy(buf);
    const { text, totalPages } = await pdfExtract(pdf, { mergePages: true });
    return { text: typeof text === "string" ? text : (text as string[]).join("\n"), page_count: totalPages ?? null };
  }
  if (name.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const buf = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: buf });
    return { text: result.value ?? "", page_count: null };
  }
  throw new Error("Unsupported file type. Use PDF, DOCX, or TXT.");
}

export function IntelligenceVault({ missionId }: { missionId: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [showLayerModal, setShowLayerModal] = useState(false);
  const [generatingLayer, setGeneratingLayer] = useState<null | "mission_brief" | "strategic_assessment">(null);

  const listFn = useServerFn(listMissionDocuments);
  const createFn = useServerFn(createMissionDocument);
  const markFn = useServerFn(markDocumentProcessed);
  const errFn = useServerFn(markDocumentError);
  const deleteFn = useServerFn(deleteMissionDocument);
  const generateFn = useServerFn(generateIrisIntelligence);

  const { data: docsData, isLoading } = useQuery({
    queryKey: ["mission-documents", missionId],
    queryFn: () => listFn({ data: { mission_id: missionId } }),
    refetchInterval: (q) => {
      const docs = (q.state.data as { documents?: Array<{ processing_status: string }> })?.documents ?? [];
      return docs.some((d) => d.processing_status === "pending" || d.processing_status === "processing") ? 2000 : false;
    },
  });
  const docs = docsData?.documents ?? [];
  const completeCount = docs.filter((d) => d.processing_status === "complete").length;
  const completeIds = docs.filter((d) => d.processing_status === "complete").map((d) => d.id);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Document removed");
      qc.invalidateQueries({ queryKey: ["mission-documents", missionId] });
    },
    onError: (e) => toast.error(`Failed to delete: ${(e as Error).message}`),
  });

  function onFilesPicked(files: FileList | null) {
    if (!files) return;
    const list: PendingFile[] = Array.from(files).map((file) => ({
      tempId: crypto.randomUUID(),
      file,
      docType: "RFP",
    }));
    setPending((prev) => [...prev, ...list]);
  }

  function updatePendingType(tempId: string, docType: DocType) {
    setPending((prev) => prev.map((p) => (p.tempId === tempId ? { ...p, docType } : p)));
  }

  function removePending(tempId: string) {
    setPending((prev) => prev.filter((p) => p.tempId !== tempId));
  }

  async function uploadAll() {
    if (pending.length === 0) return;
    const toUpload = [...pending];
    setPending([]);

    for (const item of toUpload) {
      const safeName = item.file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = `${missionId}/${crypto.randomUUID()}-${safeName}`;
      try {
        const { error: uploadErr } = await supabase.storage
          .from("mission-documents")
          .upload(filePath, item.file, { upsert: false });
        if (uploadErr) throw uploadErr;

        const created = await createFn({
          data: {
            mission_id: missionId,
            file_name: item.file.name,
            file_path: filePath,
            document_type: item.docType,
          },
        });
        if (!created.id) throw new Error(created.error ?? "Failed to record document");
        qc.invalidateQueries({ queryKey: ["mission-documents", missionId] });

        // Extract text on the client (no server runtime constraints).
        try {
          const { text, page_count } = await extractText(item.file);
          await markFn({ data: { id: created.id, extracted_text: text, page_count } });
        } catch (extractErr) {
          await errFn({ data: { id: created.id } });
          toast.error(`Could not extract text from ${item.file.name}: ${(extractErr as Error).message}`);
        }
        qc.invalidateQueries({ queryKey: ["mission-documents", missionId] });
      } catch (e) {
        toast.error(`Upload failed for ${item.file.name}: ${(e as Error).message}`);
      }
    }
  }

  async function runGeneration(layer: "mission_brief" | "strategic_assessment") {
    if (completeIds.length === 0) return;
    setGeneratingLayer(layer);
    setShowLayerModal(false);
    try {
      const result = await generateFn({
        data: { mission_id: missionId, document_ids: completeIds, layer },
      });
      if (!result.success) {
        toast.error(`IRIS generation failed: ${result.error}`);
        return;
      }
      toast.success(`IRIS ${layer === "mission_brief" ? "Mission Brief" : "Strategic Assessment"} v${result.version} ready`);
      qc.invalidateQueries({ queryKey: ["mission-intelligence", missionId, layer] });
      navigate({
        to: layer === "mission_brief"
          ? "/missions/$missionId/iris-brief"
          : "/missions/$missionId/iris-strategic",
        params: { missionId },
      });
    } catch (e) {
      toast.error(`Generation error: ${(e as Error).message}`);
    } finally {
      setGeneratingLayer(null);
    }
  }

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-white" style={{ color: "#C9A84C" }}>
          Intelligence Vault
        </h1>
        <p className="mt-1 text-sm text-white/60">
          Upload procurement documents. IRIS extracts structured intelligence — no need to read the source.
        </p>
      </header>

      {/* Drop / select zone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          onFilesPicked(e.dataTransfer.files);
        }}
        onClick={() => fileInputRef.current?.click()}
        className="cursor-pointer rounded-lg border-2 border-dashed border-white/15 bg-white/[0.02] p-10 text-center hover:border-[#C9A84C]/60 transition"
      >
        <Upload className="mx-auto h-8 w-8 text-white/40 mb-3" />
        <p className="text-sm text-white/80 font-medium">Drop PDFs, DOCX, or TXT here, or click to select</p>
        <p className="mt-1 text-xs text-white/40">Text-based files only — scanned PDFs not yet supported</p>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => {
            onFilesPicked(e.target.files);
            if (fileInputRef.current) fileInputRef.current.value = "";
          }}
        />
      </div>

      {/* Pending (pre-upload) list */}
      {pending.length > 0 && (
        <div className="mt-6 rounded-lg border border-white/10 bg-white/[0.03] p-4">
          <h3 className="text-sm font-semibold text-white mb-3">
            {pending.length} file{pending.length === 1 ? "" : "s"} ready to upload — pick document type for each:
          </h3>
          <ul className="space-y-2">
            {pending.map((p) => (
              <li key={p.tempId} className="flex items-center gap-3 rounded-md bg-white/[0.02] p-2">
                <FileText className="h-4 w-4 text-white/40 shrink-0" />
                <span className="flex-1 text-sm text-white/80 truncate">{p.file.name}</span>
                <select
                  value={p.docType}
                  onChange={(e) => updatePendingType(p.tempId, e.target.value as DocType)}
                  className="rounded-md border border-white/10 bg-[#0a0e1a] text-white text-xs px-2 py-1"
                >
                  {DOC_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <button
                  onClick={() => removePending(p.tempId)}
                  className="text-white/40 hover:text-red-300"
                  aria-label="Remove"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={() => setPending([])}
              className="px-3 py-1.5 text-xs rounded-md text-white/60 hover:text-white"
            >
              Cancel
            </button>
            <button
              onClick={uploadAll}
              className="px-4 py-1.5 text-xs font-medium rounded-md"
              style={{ background: "#1F3864", color: "white" }}
            >
              Upload {pending.length}
            </button>
          </div>
        </div>
      )}

      {/* Document list */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-white/80 uppercase tracking-wide">Documents</h2>
          <button
            disabled={completeCount === 0 || generatingLayer !== null}
            onClick={() => setShowLayerModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: "#C9A84C", color: "#0a0e1a" }}
          >
            {generatingLayer ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {generatingLayer ? "IRIS is thinking…" : "Generate IRIS Intelligence"}
          </button>
        </div>
        {isLoading ? (
          <p className="text-sm text-white/50">Loading documents…</p>
        ) : docs.length === 0 ? (
          <p className="text-sm text-white/40 italic">No documents uploaded yet.</p>
        ) : (
          <ul className="space-y-2">
            {docs.map((d) => (
              <li key={d.id} className="flex items-center gap-3 rounded-md border border-white/5 bg-white/[0.02] p-3">
                <FileText className="h-4 w-4 text-white/40 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{d.file_name}</p>
                  <p className="text-xs text-white/40">
                    {d.document_type}
                    {d.page_count ? ` · ${d.page_count} pages` : ""}
                  </p>
                </div>
                <StatusBadge status={d.processing_status} />
                <button
                  onClick={() => deleteMutation.mutate(d.id)}
                  className="text-white/30 hover:text-red-300 ml-2"
                  aria-label="Delete document"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Layer chooser modal */}
      {showLayerModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setShowLayerModal(false)}
        >
          <div
            className="w-full max-w-md rounded-lg border border-white/10 bg-[#0a0e1a] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-white mb-1">Generate IRIS Intelligence</h3>
            <p className="text-xs text-white/50 mb-1 flex items-center gap-1.5">
              <Clock className="h-3 w-3" /> Processing time: approximately 60–90 seconds
            </p>
            <p className="text-xs text-white/50 mb-5">
              {completeCount} document{completeCount === 1 ? "" : "s"} will be analyzed.
            </p>
            <div className="space-y-3">
              <button
                onClick={() => runGeneration("mission_brief")}
                className="w-full text-left rounded-md border border-white/10 bg-white/[0.03] hover:border-[#C9A84C]/50 p-4 transition"
              >
                <p className="font-medium text-white">Mission Brief</p>
                <p className="mt-1 text-xs text-white/50">
                  Procurement overview, key deadlines, risks, opportunities, win themes, and IRIS assessment.
                </p>
              </button>
              <button
                onClick={() => runGeneration("strategic_assessment")}
                className="w-full text-left rounded-md border border-white/10 bg-white/[0.03] hover:border-[#C9A84C]/50 p-4 transition"
              >
                <p className="font-medium text-white">Strategic Assessment</p>
                <p className="mt-1 text-xs text-white/50">
                  What the state really wants, political environment, stakeholders, incumbent analysis, emerging themes, landmines.
                </p>
              </button>
            </div>
            <div className="mt-5 text-right">
              <button
                onClick={() => setShowLayerModal(false)}
                className="text-xs text-white/50 hover:text-white"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "pending") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-white/10 text-white/60">
        <Clock className="h-3 w-3" /> Pending
      </span>
    );
  }
  if (status === "processing") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-amber-500/15 text-amber-300 animate-pulse">
        <Loader2 className="h-3 w-3 animate-spin" /> Processing
      </span>
    );
  }
  if (status === "complete") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-emerald-500/15 text-emerald-300">
        <CheckCircle2 className="h-3 w-3" /> Complete
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-red-500/15 text-red-300">
      <AlertCircle className="h-3 w-3" /> Error
    </span>
  );
}
