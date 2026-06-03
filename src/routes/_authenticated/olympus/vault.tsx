import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, FileText, ExternalLink, Trash2, Search, Sparkles, FolderOpen, Link2 } from "lucide-react";
import { useSelectedOlympusMission } from "../olympus";
import { logOlympusAction } from "@/lib/audit";
import { IrisRfpReviewModal } from "@/components/v2/IrisRfpReviewModal";

export const Route = createFileRoute("/_authenticated/olympus/vault")({
  component: VaultPage,
});

const CATEGORIES = [
  "RFP & Amendments", "State Q&A", "Past Responses", "Templates",
  "Reference Materials", "Research", "Supporting Materials", "Client Materials",
] as const;
type Category = (typeof CATEGORIES)[number];

type Doc = {
  id: string; mission_id: string; name: string; category: string;
  notes: string | null; url: string | null; file_path: string | null;
  is_rfp: boolean | null; added_by: string | null; created_at: string;
  file_size: number | null;
};

async function sha256(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function VaultPage() {
  const missionId = useSelectedOlympusMission();
  const qc = useQueryClient();
  const [activeCategory, setActiveCategory] = useState<Category | "All">("All");
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const [parsingId, setParsingId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadCategory, setUploadCategory] = useState<Category>("RFP & Amendments");
  const [uploadIsRfp, setUploadIsRfp] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [parsePromptFor, setParsePromptFor] = useState<{ id: string; name: string } | null>(null);
  const [amendmentPromptFor, setAmendmentPromptFor] = useState<{ id: string; name: string } | null>(null);
  const [amendmentType, setAmendmentType] = useState<"formal_amendment" | "qa_response" | "scope_change" | "deadline_extension" | "clarification">("formal_amendment");
  const [analyzingAmendment, setAnalyzingAmendment] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewDocId, setReviewDocId] = useState<string | undefined>(undefined);

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["olympus-vault", missionId],
    enabled: !!missionId,
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_library")
        .select("id,mission_id,name,category,notes,url,file_path,is_rfp,added_by,created_at,file_size")
        .eq("mission_id", missionId!)
        .order("created_at", { ascending: false });
      return (data ?? []) as Doc[];
    },
  });

  const counts = useMemo(() => {
    const m: Record<string, number> = { All: docs.length };
    for (const c of CATEGORIES) m[c] = 0;
    for (const d of docs) m[d.category] = (m[d.category] ?? 0) + 1;
    return m;
  }, [docs]);

  const visible = useMemo(() => {
    let list = activeCategory === "All" ? docs : docs.filter((d) => d.category === activeCategory);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((d) => d.name.toLowerCase().includes(q) || (d.notes ?? "").toLowerCase().includes(q));
    return list;
  }, [docs, activeCategory, search]);

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0 || !missionId) return;
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      // Does a base RFP already exist for this mission?
      const hasExistingRfp = docs.some(
        (d) => d.is_rfp || d.category === "RFP & Amendments" || d.category === "RFP",
      );
      let lastRfp: { id: string; name: string } | null = null;
      let lastAmendment: { id: string; name: string } | null = null;
      for (const file of Array.from(files)) {
        // Duplicate guard
        const dup = docs.find((d) => d.name === file.name);
        if (dup) {
          const choice = window.confirm(
            `A file named "${file.name}" already exists.\n\nOK = Replace existing\nCancel = Keep both (renames new file)`,
          );
          if (choice && dup.file_path) {
            await supabase.storage.from("mission-library").remove([dup.file_path]);
            await supabase.from("mission_library").delete().eq("id", dup.id);
          }
        }
        const hash = await sha256(file);
        const path = `${missionId}/${Date.now()}-${file.name}`;
        const { error: upErr } = await supabase.storage.from("mission-library").upload(path, file);
        if (upErr) throw upErr;
        const { data: row, error } = await supabase.from("mission_library").insert({
          mission_id: missionId,
          name: file.name,
          category: uploadCategory,
          file_path: path,
          file_size: file.size,
          file_hash: hash,
          is_rfp: uploadIsRfp,
          added_by: user?.email ?? null,
          added_by_id: user?.id ?? null,
        }).select("id").single();
        if (error) throw error;
        await logOlympusAction({
          action_type: "vault.upload",
          action_summary: `Uploaded "${file.name}" (${uploadCategory})`,
          mission_id: missionId,
          target_table: "mission_library",
          target_id: row?.id ?? null,
        });
        if (row?.id) {
          if (uploadCategory === "RFP & Amendments" && hasExistingRfp) {
            lastAmendment = { id: row.id, name: file.name };
          } else if (uploadIsRfp) {
            lastRfp = { id: row.id, name: file.name };
          }
        }
      }
      toast.success(`Uploaded ${files.length} file${files.length === 1 ? "" : "s"}`);
      qc.invalidateQueries({ queryKey: ["olympus-vault", missionId] });
      if (lastAmendment) setAmendmentPromptFor(lastAmendment);
      else if (lastRfp) setParsePromptFor(lastRfp);
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function addUrl(form: { name: string; url: string; category: Category; notes: string }) {
    if (!missionId || !form.name.trim() || !form.url.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    const { data: row, error } = await supabase.from("mission_library").insert({
      mission_id: missionId,
      name: form.name.trim(),
      category: form.category,
      url: form.url.trim(),
      notes: form.notes.trim() || null,
      added_by: user?.email ?? null,
      added_by_id: user?.id ?? null,
    }).select("id").single();
    if (error) { toast.error(error.message); return; }
    toast.success("Link added");
    await logOlympusAction({
      action_type: "vault.add_link",
      action_summary: `Added link "${form.name.trim()}"`,
      mission_id: missionId,
      target_table: "mission_library",
      target_id: row?.id ?? null,
    });
    qc.invalidateQueries({ queryKey: ["olympus-vault", missionId] });
  }

  async function openDoc(doc: Doc) {
    if (doc.url) { window.open(doc.url, "_blank"); return; }
    if (doc.file_path) {
      const { data } = await supabase.storage.from("mission-library").createSignedUrl(doc.file_path, 300);
      if (data?.signedUrl) window.open(data.signedUrl, "_blank");
    }
  }

  async function remove(doc: Doc) {
    if (!confirm(`Delete "${doc.name}"?`)) return;
    if (doc.file_path) await supabase.storage.from("mission-library").remove([doc.file_path]);
    const { error } = await supabase.from("mission_library").delete().eq("id", doc.id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    await logOlympusAction({
      action_type: "vault.delete",
      action_summary: `Deleted "${doc.name}"`,
      mission_id: missionId!,
      target_table: "mission_library",
      target_id: doc.id,
    });
    qc.invalidateQueries({ queryKey: ["olympus-vault", missionId] });
  }

  async function parseRfp(doc: Doc) {
    setParsingId(doc.id);
    try {
      const { parseRfpDocument } = await import("@/lib/rfp-parser.functions");
      const res = await parseRfpDocument({ data: { documentId: doc.id } });
      toast.success(`${res.inserted} questions parsed from "${doc.name}"`);
      await logOlympusAction({
        action_type: "vault.parse_rfp",
        action_summary: `Parsed RFP "${doc.name}" → ${res.inserted} questions`,
        mission_id: missionId!,
        target_table: "mission_library",
        target_id: doc.id,
      });
    } catch (e: any) {
      toast.error(e?.message ?? "Parse failed");
    } finally {
      setParsingId(null);
    }
  }

  if (!missionId) {
    return <div className="mx-auto max-w-4xl px-8 py-16 text-center text-sm text-muted-foreground">Select a mission to manage its vault.</div>;
  }

  return (
    <div className="mx-auto max-w-7xl px-8 py-8">
      <header className="mb-6">
        <div className="h2-label" style={{ letterSpacing: "0.32em" }}>Vault</div>
        <h1 className="h1-display mt-1">Document Vault</h1>
        <p className="mt-1 text-sm text-muted-foreground">Upload and manage every mission document. IRIS auto-parses RFPs into questions.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr_320px] gap-6">
        {/* Categories */}
        <aside className="rounded-[10px] border border-border bg-surface p-2">
          <button onClick={() => setActiveCategory("All")}
            className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm ${activeCategory === "All" ? "bg-surface-hover text-foreground" : "text-muted-foreground hover:bg-surface-hover hover:text-foreground"}`}>
            <span>All</span><span className="text-[11px]">{counts.All ?? 0}</span>
          </button>
          {CATEGORIES.map((c) => (
            <button key={c} onClick={() => setActiveCategory(c)}
              className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm ${activeCategory === c ? "bg-surface-hover text-foreground" : "text-muted-foreground hover:bg-surface-hover hover:text-foreground"}`}>
              <span className="truncate">{c}</span><span className="text-[11px]">{counts[c] ?? 0}</span>
            </button>
          ))}
        </aside>

        {/* Document list */}
        <div className="rounded-[10px] border border-border bg-surface overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search documents…"
                className="w-full rounded-md bg-background py-1.5 pl-8 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary border border-border" />
            </div>
          </div>
          {isLoading ? (
            <div className="p-4 space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-12 w-full" />)}</div>
          ) : visible.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              <FolderOpen className="mx-auto mb-2 h-6 w-6 opacity-60" />
              No documents in this view.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {visible.map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-hover">
                  {d.url ? <Link2 className="h-4 w-4 text-muted-foreground shrink-0" /> : <FileText className="h-4 w-4 text-muted-foreground shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{d.name}</span>
                      {d.is_rfp && <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-primary">RFP</span>}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {d.category} · {new Date(d.created_at).toLocaleDateString()}
                      {d.file_size ? ` · ${(d.file_size / 1024).toFixed(0)} KB` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {d.is_rfp && (
                      <button onClick={() => parseRfp(d)} disabled={parsingId !== null}
                        className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] hover:bg-surface-hover disabled:opacity-50">
                        <Sparkles className="h-3 w-3" /> {parsingId === d.id ? "Parsing…" : "Parse"}
                      </button>
                    )}
                    <button onClick={() => openDoc(d)} className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-hover hover:text-foreground" title="Open">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => remove(d)} className="rounded-md p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-400" title="Delete">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Upload panel */}
        <aside className="space-y-4">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault(); setDragOver(false);
              handleUpload(e.dataTransfer.files);
            }}
            className={`rounded-[10px] border-2 border-dashed p-5 transition ${dragOver ? "border-[#C49A22] bg-[#C49A22]/5" : "border-border bg-surface"}`}
          >
            <div className="mb-3 flex items-center gap-2 text-sm font-medium">
              <Upload className="h-4 w-4 text-muted-foreground" /> Upload files
            </div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Category</label>
            <select value={uploadCategory} onChange={(e) => setUploadCategory(e.target.value as Category)}
              className="mb-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <label className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={uploadIsRfp} onChange={(e) => setUploadIsRfp(e.target.checked)} />
              This is an RFP (enables IRIS parsing)
            </label>
            <div
              onClick={() => fileRef.current?.click()}
              className="cursor-pointer rounded-md border border-dashed border-border bg-background/40 px-3 py-4 text-center text-[11px] text-muted-foreground hover:bg-surface-hover"
            >
              Drop files here or click to browse
              <div className="mt-1 text-[10px] opacity-60">PDF, DOCX, XLSX, PPTX, TXT</div>
            </div>
            <input ref={fileRef} type="file" multiple accept=".pdf,.docx,.xlsx,.pptx,.txt"
              onChange={(e) => handleUpload(e.target.files)} disabled={uploading} className="hidden" />
            {uploading && <div className="mt-2 text-[11px] text-muted-foreground">Uploading…</div>}
          </div>

          <AddUrlPanel onSubmit={addUrl} />
        </aside>
      </div>

      {parsePromptFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setParsePromptFor(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div onClick={(e) => e.stopPropagation()} className="relative w-full max-w-md rounded-[10px] border border-border bg-surface p-6">
            <div className="flex items-center gap-2">
              <span className="relative inline-flex h-2.5 w-2.5">
                <span className="absolute inset-0 animate-ping rounded-full bg-teal-400 opacity-60" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-teal-400" />
              </span>
              <div className="h2-label text-teal-300" style={{ letterSpacing: "0.32em" }}>RFP Detected</div>
            </div>
            <h2 className="mt-2 text-lg font-semibold">Would you like IRIS to read this RFP and configure the mission automatically?</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              IRIS will read <span className="text-foreground font-medium">{parsePromptFor.name}</span> and pre-populate state, agency, deadlines, focus areas, evaluation criteria, and search terms — then parse questions. Typically 30–60 seconds.
            </p>
            <footer className="mt-6 flex flex-col gap-2">
              <button
                onClick={() => {
                  setReviewDocId(parsePromptFor.id);
                  setReviewOpen(true);
                  
                  setParsePromptFor(null);
                  // Kick off extraction immediately
                  (async () => {
                    try {
                      const { extractRfpConfig } = await import("@/lib/rfp-config-extractor.functions");
                      await extractRfpConfig({ data: { documentId: parsePromptFor!.id } });
                      qc.invalidateQueries({ queryKey: ["iris-rfp-mission", missionId] });
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "IRIS extraction failed");
                    }
                  })();
                  // Also parse questions in parallel
                  const d = docs.find((x) => x.id === parsePromptFor!.id);
                  if (d) parseRfp(d);
                }}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-teal-500 px-4 py-2.5 text-sm font-semibold text-black hover:bg-teal-400">
                <Sparkles className="h-4 w-4" /> Yes, configure mission
              </button>
              <button
                onClick={() => {
                  const d = docs.find((x) => x.id === parsePromptFor!.id);
                  if (d) parseRfp(d);
                  setParsePromptFor(null);
                }}
                className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-surface-hover">
                Skip — just parse questions
              </button>
            </footer>
          </div>
        </div>
      )}

      {amendmentPromptFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => !analyzingAmendment && setAmendmentPromptFor(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div onClick={(e) => e.stopPropagation()} className="relative w-full max-w-md rounded-[10px] border border-border bg-surface p-6">
            <div className="flex items-center gap-2">
              <span className="relative inline-flex h-2.5 w-2.5">
                <span className="absolute inset-0 animate-ping rounded-full bg-amber-400 opacity-60" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-400" />
              </span>
              <div className="h2-label text-amber-300" style={{ letterSpacing: "0.32em" }}>Amendment Detected</div>
            </div>
            <h2 className="mt-2 text-lg font-semibold">Is this an amendment or addendum to the existing RFP?</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              IRIS will read <span className="text-foreground font-medium">{amendmentPromptFor.name}</span> alongside the original RFP and surface exactly what changed — by question, with required writer actions.
            </p>
            <div className="mt-4">
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Amendment type</label>
              <select
                value={amendmentType}
                onChange={(e) => setAmendmentType(e.target.value as typeof amendmentType)}
                disabled={analyzingAmendment}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="formal_amendment">Formal Amendment / Addendum</option>
                <option value="qa_response">Q&amp;A Response Document</option>
                <option value="scope_change">Scope Change Notice</option>
                <option value="deadline_extension">Deadline Extension</option>
                <option value="clarification">Other Clarification</option>
              </select>
            </div>
            <footer className="mt-6 flex flex-col gap-2">
              <button
                disabled={analyzingAmendment}
                onClick={async () => {
                  if (!amendmentPromptFor) return;
                  setAnalyzingAmendment(true);
                  try {
                    const { analyzeAmendment } = await import("@/lib/rfp-amendment.functions");
                    const res = await analyzeAmendment({ data: { documentId: amendmentPromptFor.id, amendmentType } });
                    toast.success(`IRIS found ${res.totalChanges} change${res.totalChanges === 1 ? "" : "s"} (${res.criticalChanges} critical)`);
                    qc.invalidateQueries({ queryKey: ["olympus-vault", missionId] });
                    qc.invalidateQueries({ queryKey: ["amendment-changes"] });
                    setAmendmentPromptFor(null);
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Amendment analysis failed");
                  } finally {
                    setAnalyzingAmendment(false);
                  }
                }}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-black hover:bg-amber-400 disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" /> {analyzingAmendment ? "IRIS analyzing…" : "Yes — IRIS will analyze changes"}
              </button>
              <button
                disabled={analyzingAmendment}
                onClick={() => setAmendmentPromptFor(null)}
                className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-surface-hover disabled:opacity-50"
              >
                No — treat as new document
              </button>
            </footer>
          </div>
        </div>
      )}

      {missionId && (
        <IrisRfpReviewModal
          missionId={missionId}
          documentId={reviewDocId}
          open={reviewOpen}
          onClose={() => { setReviewOpen(false); }}
        />
      )}
    </div>
  );
}

function AddUrlPanel({ onSubmit }: { onSubmit: (f: { name: string; url: string; category: Category; notes: string }) => Promise<void> }) {
  const [form, setForm] = useState({ name: "", url: "", category: "Reference Materials" as Category, notes: "" });
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await onSubmit(form);
    setBusy(false);
    setForm({ name: "", url: "", category: "Reference Materials", notes: "" });
  }
  return (
    <form onSubmit={submit} className="rounded-[10px] border border-border bg-surface p-5">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium">
        <Link2 className="h-4 w-4 text-muted-foreground" /> Add link
      </div>
      <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Display name"
        className="mb-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
      <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://…"
        className="mb-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
      <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as Category })}
        className="mb-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
        {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="Notes (optional)"
        className="mb-3 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
      <button type="submit" disabled={busy || !form.name.trim() || !form.url.trim()}
        className="w-full rounded-md bg-[#C49A22] px-3 py-2 text-sm font-semibold text-black hover:bg-[#D4AA32] disabled:opacity-50">
        {busy ? "Adding…" : "Add Link"}
      </button>
    </form>
  );
}
