import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import { useSession } from "@/hooks/use-session";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { relativeTime } from "@/lib/time";
import { FileText, LinkIcon, Upload, Download, ExternalLink, Sparkles, Loader2 } from "lucide-react";
import { DeclareTriviaWinnerCard } from "@/components/war-room/DeclareTriviaWinnerCard";
import { Watermark } from "@/components/war-room/Watermark";
import { HolyGrailPanel } from "@/components/war-room/HolyGrailPanel";
import { analyzeOpportunity } from "@/lib/ai/holy-grail.functions";
import { logActivity } from "@/lib/activity-log";

async function extractTextFromFile(file: File): Promise<string> {
  if (file.type.startsWith("text/") || /\.(txt|md|csv|rtf)$/i.test(file.name)) return file.text();
  if (/\.docx$/i.test(file.name)) {
    const mammoth = await import("mammoth");
    const r = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return r.value;
  }
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    const [pdfjs, worker] = await Promise.all([
      import("pdfjs-dist"),
      import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
    ]);
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
    const doc = await task.promise;
    const pageCount = Math.min(doc.numPages, 40);
    const pages = await Promise.all(
      Array.from({ length: pageCount }, async (_, i) => {
        const page = await doc.getPage(i + 1);
        const content = await page.getTextContent();
        return content.items.map((item: any) => item.str ?? "").join(" ");
      }),
    );
    await doc.destroy();
    return pages.join("\n");
  }
  return "";
}

export const Route = createFileRoute("/_authenticated/intel")({
  head: () => ({ meta: [{ title: "Intel Library — Athena" }] }),
  component: IntelPage,
});

const CATEGORIES = ["RFP", "Amendment", "Q&A", "Client Doc", "Research", "Competitive", "Past Performance", "Other"] as const;

function IntelPage() {
  const { engagement, member, isLeadership } = useEngagement();
  const { user } = useSession();
  const [items, setItems] = useState<any[]>([]);
  const [filter, setFilter] = useState<"All" | (typeof CATEGORIES)[number]>("All");
  const [search, setSearch] = useState("");

  const [mode, setMode] = useState<"file" | "url">("file");
  const [name, setName] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("RFP");
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [hgRefresh, setHgRefresh] = useState(0);

  async function runAnalyze(it: any) {
    if (!engagement || !it.file_path) {
      toast.error("Holy Grail analysis needs an uploaded file (PDF/DOCX/TXT).");
      return;
    }
    setAnalyzingId(it.id);
    try {
      const { data: signed, error: sErr } = await supabase.storage
        .from("intel-files")
        .createSignedUrl(it.file_path, 120);
      if (sErr || !signed) throw new Error(sErr?.message ?? "Could not access file");
      const resp = await fetch(signed.signedUrl);
      const blob = await resp.blob();
      const file = new File([blob], it.name || "rfp", { type: blob.type });
      toast.info("Extracting text…");
      const text = await extractTextFromFile(file);
      if (!text || text.trim().length < 50) throw new Error("Could not extract enough text from this file.");
      toast.info("Running Holy Grail analysis…");
      await analyzeOpportunity({ data: { engagementId: engagement.id, documentId: it.id, fileName: it.name, text } });
      toast.success("Holy Grail ready");
      setHgRefresh((n) => n + 1);
    } catch (err: any) {
      toast.error(err?.message ?? "Analysis failed");
    } finally {
      setAnalyzingId(null);
    }
  }



  async function load(eid: string) {
    const { data } = await supabase.from("intel_documents").select("*").eq("engagement_id", eid).order("created_at", { ascending: false });
    setItems(data ?? []);
  }

  useEffect(() => { if (engagement) load(engagement.id); }, [engagement?.id]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!engagement || !user || !member) return;
    const finalName = name.trim() || file?.name?.trim() || "";
    if (!finalName) return toast.error("Name required");
    if (mode === "file" && !file) return toast.error("Select a file");
    if (mode === "url" && !url.trim()) return toast.error("URL required");

    setUploading(true);
    let file_path: string | null = null;
    let linkUrl: string | null = mode === "url" ? url.trim() : null;

    try {
      if (mode === "file" && file) {
        const path = `${engagement.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const { error: upErr } = await supabase.storage.from("intel-files").upload(path, file, { upsert: false });
        if (upErr) throw upErr;
        file_path = path;
      }
      const { error } = await supabase.from("intel_documents").insert({
        engagement_id: engagement.id,
        name: finalName,
        category,
        url: linkUrl,
        file_path,
        notes: notes || null,
        uploaded_by: user.id,
        uploader_name: member.display_name,
      });
      if (error) throw error;
      toast.success("Added to intel library");
      setName(""); setUrl(""); setNotes(""); setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      load(engagement.id);
    } catch (err: any) {
      toast.error(err?.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function openItem(it: any) {
    if (engagement && member) {
      logActivity({
        engagementId: engagement.id,
        userId: user?.id ?? null,
        actorName: member.display_name,
        action: "view_intel_document",
        targetTable: "intel_documents",
        targetId: it.id,
        metadata: { name: it.name, category: it.category },
      });
    }
    if (it.url) return window.open(it.url, "_blank", "noopener");
    if (it.file_path) {
      const { data, error } = await supabase.storage.from("intel-files").createSignedUrl(it.file_path, 60 * 10);
      if (error || !data) return toast.error(error?.message ?? "Could not get link");
      window.open(data.signedUrl, "_blank", "noopener");
    }
  }

  const visible = items.filter((it) => {
    if (filter !== "All" && it.category !== filter) return false;
    if (search && !`${it.name} ${it.notes ?? ""}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="mx-auto grid max-w-7xl gap-6 p-4 md:p-8 lg:grid-cols-5">
      <Watermark />
      {engagement && <HolyGrailPanel engagementId={engagement.id} refreshKey={hgRefresh} />}
      {isLeadership && <DeclareTriviaWinnerCard />}
      {isLeadership && (
        <Card className="border-border bg-surface p-6 lg:col-span-2">
          <h1 className="text-xl font-bold">Add to Library</h1>
          <p className="mt-1 text-sm text-muted-foreground">Files or links — keep the source of truth in one place.</p>

          <div className="mt-4 inline-flex rounded-md border border-border p-0.5">
            <button onClick={() => setMode("file")} className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition ${mode === "file" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              <Upload className="h-3.5 w-3.5" /> File
            </button>
            <button onClick={() => setMode("url")} className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition ${mode === "url" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              <LinkIcon className="h-3.5 w-3.5" /> Link
            </button>
          </div>

          <form onSubmit={submit} className="mt-4 space-y-4">
            {mode === "file" ? (
              <div>
                <Label htmlFor="file">File</Label>
                <Input id="file" ref={fileRef} type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </div>
            ) : (
              <div>
                <Label htmlFor="url">URL</Label>
                <Input id="url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
              </div>
            )}
            <div>
              <Label htmlFor="name">Display name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder={file?.name ?? "What's this?"} />
            </div>
            <div>
              <Label>Category</Label>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {CATEGORIES.map((c) => (
                  <button key={c} type="button" onClick={() => setCategory(c)} className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${category === c ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Context, page refs, who cares about this" />
            </div>
            <Button type="submit" disabled={uploading} className="w-full">
              {uploading ? "Saving…" : "Add to Library"}
            </Button>
          </form>
        </Card>
      )}

      <Card className={`border-border bg-surface p-6 ${isLeadership ? "lg:col-span-3" : "lg:col-span-5"}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Library</h2>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="max-w-[200px]" />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {(["All", ...CATEGORIES] as const).map((c) => (
            <button key={c} onClick={() => setFilter(c)} className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${filter === c ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
              {c}
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <div className="mt-6 text-sm text-muted-foreground">Nothing here yet.</div>
        ) : (
          <ul className="mt-4 space-y-2 max-h-[70vh] overflow-auto">
            {visible.map((it) => (
              <li key={it.id} className="group flex items-start gap-3 rounded-md border border-border bg-surface-hover/40 p-3 hover:border-primary/40">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  {it.url ? <LinkIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <button onClick={() => openItem(it)} className="text-left text-sm font-semibold hover:text-primary">{it.name}</button>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="rounded-full border border-border px-2 py-0.5">{it.category}</span>
                    <span>{it.uploader_name ?? "—"}</span>
                    <span>{relativeTime(it.created_at)}</span>
                  </div>
                  {it.notes && <p className="mt-1 text-xs text-muted-foreground">{it.notes}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {isLeadership && it.file_path && (it.category === "RFP" || it.category === "Amendment") && (
                    <button
                      onClick={() => runAnalyze(it)}
                      disabled={analyzingId === it.id}
                      title="Run Holy Grail analysis"
                      className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/20 disabled:opacity-60"
                    >
                      {analyzingId === it.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                      {analyzingId === it.id ? "Analyzing…" : "Holy Grail"}
                    </button>
                  )}
                  <button onClick={() => openItem(it)} className="rounded-md border border-border p-1.5 text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:border-primary/50 hover:text-foreground">
                    {it.url ? <ExternalLink className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
