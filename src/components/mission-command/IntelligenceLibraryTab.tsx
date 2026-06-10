import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  FileText, File as FileIcon, Link as LinkIcon, StickyNote, Plus,
  Download, ExternalLink, ChevronDown, ChevronRight, AlertCircle, Loader2, Pencil,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SkeletonRows, ErrorState, EmptyState } from "@/components/shared/data-states";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { generateDocumentSummary, suggestSectionTags } from "@/lib/iris-intel-tabs.functions";
import { formatDate, isValidUrl, DOC_TYPE_LABEL } from "./intel-shared";

type Doc = {
  id: string; title: string | null; document_type: string;
  file_url: string | null; source_url: string | null;
  content_summary: string | null; section_tags: string[];
  created_at: string;
};
type Section = { id: string; section_number: string | null; name: string | null };

const FOLDERS: { id: string; label: string; types: string[] }[] = [
  { id: "rfp", label: "RFP Documents", types: ["primary_rfp", "amendment", "attachment", "scoring_criteria", "prior_qa"] },
  { id: "research", label: "Research and Intelligence", types: ["research"] },
  { id: "media", label: "Media and Sources", types: ["media_url"] },
  { id: "athena", label: "Athena Knowledge", types: ["other"] },
  { id: "style", label: "Style and Standards", types: ["manual_note"] },
];

const BUCKET = "atlas-intelligence";

function iconFor(d: Doc) {
  if (d.document_type === "manual_note") return <StickyNote className="h-4 w-4" />;
  if (d.source_url) return <LinkIcon className="h-4 w-4" />;
  const t = (d.title ?? "").toLowerCase();
  if (t.endsWith(".pdf")) return <FileText className="h-4 w-4 text-red-600" />;
  if (t.endsWith(".doc") || t.endsWith(".docx")) return <FileText className="h-4 w-4 text-blue-600" />;
  return <FileIcon className="h-4 w-4" />;
}

export function IntelligenceLibraryTab({ missionId }: { missionId: string }) {
  const qc = useQueryClient();
  const [view, setView] = useState<"type" | "section">("type");
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set(FOLDERS.map((f) => f.id)));
  const [tagEdit, setTagEdit] = useState<Doc | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["intel-library", missionId],
    queryFn: async () => {
      const [docsRes, secsRes, missionRes] = await Promise.all([
        supabase.from("mission_documents").select("*").eq("mission_id", missionId)
          .order("created_at", { ascending: false }),
        supabase.from("mission_sections").select("id, section_number, name")
          .eq("mission_id", missionId).order("order_index"),
        supabase.from("missions").select("status").eq("id", missionId).single(),
      ]);
      return {
        docs: (docsRes.data ?? []) as Doc[],
        sections: (secsRes.data ?? []) as Section[],
        isActive: missionRes.data?.status === "active",
      };
    },
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data.docs;
    return data.docs.filter((d) =>
      `${d.title ?? ""} ${d.content_summary ?? ""}`.toLowerCase().includes(q),
    );
  }, [data, search]);

  if (isError) return <ErrorState message="Couldn't load the intelligence library." onRetry={() => refetch()} />;
  if (isLoading || !data) return <SkeletonRows rows={6} height="h-16" />;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Intelligence Library</h2>
          <p className="text-sm text-muted-foreground">
            Everything relevant to this mission — organized by type and by section.
          </p>
        </div>
        <Button className="bg-primary text-primary-foreground" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add to Library
        </Button>
      </div>

      <div className="flex items-center gap-4 border-b">
        {(["type", "section"] as const).map((v) => (
          <button
            key={v}
            className={cn(
              "px-3 py-2 text-sm border-b-2 -mb-px",
              view === v ? "border-primary text-foreground font-medium" : "border-transparent text-muted-foreground",
            )}
            onClick={() => setView(v)}
          >
            By {v === "type" ? "Type" : "Section"}
          </button>
        ))}
        <div className="ml-auto">
          <Input placeholder="Search…" className="w-60" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {view === "type" ? (
        <div className="space-y-2">
          {FOLDERS.map((f) => {
            const list = filtered.filter((d) => f.types.includes(d.document_type));
            const isOpen = openFolders.has(f.id);
            return (
              <div key={f.id} className="rounded-lg border bg-card">
                <button
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/30"
                  onClick={() => {
                    const n = new Set(openFolders);
                    if (n.has(f.id)) n.delete(f.id); else n.add(f.id);
                    setOpenFolders(n);
                  }}
                >
                  <div className="flex items-center gap-2 font-medium">
                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    {f.label}
                    <Badge variant="secondary">{list.length}</Badge>
                  </div>
                </button>
                {isOpen && (
                  <div className="border-t divide-y">
                    {list.length === 0 ? (
                      <p className="px-4 py-6 text-sm text-muted-foreground">No documents.</p>
                    ) : list.map((d) => (
                      <ItemCard key={d.id} doc={d} sections={data.sections} onEditTags={() => setTagEdit(d)} onTagClick={(sid) => { setView("section"); setTimeout(() => {
                        const el = document.getElementById(`section-${sid}`); el?.scrollIntoView({ behavior: "smooth" });
                      }, 50); }} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {data.sections.map((s) => {
            const list = filtered.filter((d) => d.section_tags.includes(s.id));
            const noTags = list.length === 0;
            return (
              <details key={s.id} id={`section-${s.id}`} open className="rounded-lg border bg-card">
                <summary className="cursor-pointer px-4 py-3 font-medium flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    {noTags && data.isActive && <AlertCircle className="h-4 w-4 text-amber-500" />}
                    {s.section_number ?? ""} {s.name}
                  </span>
                  <Badge variant="secondary">{list.length}</Badge>
                </summary>
                <div className="border-t divide-y">
                  {list.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-muted-foreground">
                      No intelligence tagged to this section yet. Add documents and tag them to this section.
                    </p>
                  ) : list.map((d) => (
                    <ItemCard key={d.id} doc={d} sections={data.sections} onEditTags={() => setTagEdit(d)} onTagClick={() => {}} />
                  ))}
                </div>
              </details>
            );
          })}
        </div>
      )}

      {data.docs.length === 0 && (
        <EmptyState
          title="No documents in the library yet"
          description="Add your first piece of intelligence."
        />
      )}

      <AddContentModal
        open={addOpen} onOpenChange={setAddOpen}
        missionId={missionId} sections={data.sections}
        onSaved={() => qc.invalidateQueries({ queryKey: ["intel-library", missionId] })}
      />

      <EditTagsDialog
        doc={tagEdit} sections={data.sections}
        onClose={() => setTagEdit(null)}
        onSaved={() => qc.invalidateQueries({ queryKey: ["intel-library", missionId] })}
      />
    </div>
  );
}

function ItemCard({
  doc, sections, onEditTags, onTagClick,
}: { doc: Doc; sections: Section[]; onEditTags: () => void; onTagClick: (sid: string) => void }) {
  return (
    <div className="px-4 py-3 flex items-start gap-3">
      <div className="mt-1">{iconFor(doc)}</div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold">{doc.title}</div>
        {doc.content_summary && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{doc.content_summary}</p>
        )}
        <div className="flex flex-wrap gap-1 mt-2 items-center">
          {doc.section_tags.map((id) => {
            const s = sections.find((x) => x.id === id);
            if (!s) return null;
            return (
              <button key={id} onClick={() => onTagClick(id)}
                className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary hover:bg-primary/20">
                {s.section_number ?? ""} {s.name}
              </button>
            );
          })}
          <Badge variant="outline" className="text-[10px]">{DOC_TYPE_LABEL[doc.document_type] ?? doc.document_type}</Badge>
          <span className="text-xs text-muted-foreground ml-1">{formatDate(doc.created_at)}</span>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {doc.file_url && (
          <a href={doc.file_url} target="_blank" rel="noreferrer"><Button size="sm" variant="ghost"><Download className="h-4 w-4" /></Button></a>
        )}
        {doc.source_url && (
          <a href={doc.source_url} target="_blank" rel="noreferrer"><Button size="sm" variant="ghost"><ExternalLink className="h-4 w-4" /></Button></a>
        )}
        <Button size="sm" variant="ghost" onClick={onEditTags}><Pencil className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

function EditTagsDialog({
  doc, sections, onClose, onSaved,
}: { doc: Doc | null; sections: Section[]; onClose: () => void; onSaved: () => void }) {
  const [tags, setTags] = useState<string[]>([]);
  useMemo(() => { if (doc) setTags(doc.section_tags); }, [doc]);
  if (!doc) return null;
  return (
    <Dialog open={!!doc} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit section tags</DialogTitle></DialogHeader>
        <div className="max-h-80 overflow-y-auto space-y-2">
          {sections.map((s) => (
            <label key={s.id} className="flex items-center gap-2 text-sm">
              <Checkbox checked={tags.includes(s.id)}
                onCheckedChange={(c) => setTags((prev) => c ? [...prev, s.id] : prev.filter((x) => x !== s.id))} />
              <span>{s.section_number ?? ""} {s.name}</span>
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={async () => {
            await supabase.from("mission_documents").update({ section_tags: tags }).eq("id", doc.id);
            onSaved(); onClose(); toast.success("Tags updated.");
          }}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddContentModal({
  open, onOpenChange, missionId, sections, onSaved,
}: {
  open: boolean; onOpenChange: (o: boolean) => void;
  missionId: string; sections: Section[]; onSaved: () => void;
}) {
  const summarize = useServerFn(generateDocumentSummary);
  const suggestTags = useServerFn(suggestSectionTags);
  const [busy, setBusy] = useState(false);
  const [pendingDocId, setPendingDocId] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [urlVal, setUrlVal] = useState("");
  const [urlTitle, setUrlTitle] = useState("");
  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [noteTags, setNoteTags] = useState<string[]>([]);

  function reset() {
    setBusy(false); setPendingDocId(null); setSelectedTags([]);
    setFile(null); setTitle(""); setUrlVal(""); setUrlTitle("");
    setNoteTitle(""); setNoteBody(""); setNoteTags([]);
  }

  async function getUserId() {
    const { data: u } = await supabase.auth.getUser();
    return u.user?.id ?? null;
  }

  async function handleFile() {
    if (!file) return;
    if (file.size > 500 * 1024 * 1024) { toast.error("Max size 500MB."); return; }
    setBusy(true);
    try {
      const path = `${missionId}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file);
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const userId = await getUserId();
      const { data: row, error } = await supabase.from("mission_documents").insert({
        mission_id: missionId, title: title || file.name, document_type: "research",
        file_url: pub.publicUrl, uploaded_by: userId,
      } as never).select("id").single();
      if (error) throw error;
      try { await summarize({ data: { document_id: row.id } }); } catch {}
      try {
        const sugg = await suggestTags({ data: { mission_id: missionId, document_id: row.id } });
        setSelectedTags(sugg.section_ids);
      } catch {}
      setPendingDocId(row.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed.");
    } finally { setBusy(false); }
  }

  async function handleUrl() {
    if (!urlVal || !isValidUrl(urlVal) || !urlTitle.trim()) { toast.error("URL and title required."); return; }
    setBusy(true);
    try {
      const userId = await getUserId();
      const { data: row, error } = await supabase.from("mission_documents").insert({
        mission_id: missionId, title: urlTitle, document_type: "media_url",
        source_url: urlVal, uploaded_by: userId,
      } as never).select("id").single();
      if (error) throw error;
      try { await summarize({ data: { document_id: row.id, extra_text: `URL: ${urlVal}` } }); } catch {}
      try {
        const sugg = await suggestTags({ data: { mission_id: missionId, document_id: row.id } });
        setSelectedTags(sugg.section_ids);
      } catch {}
      setPendingDocId(row.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed.");
    } finally { setBusy(false); }
  }

  async function handleNote() {
    if (!noteTitle.trim() || noteBody.trim().length < 20) { toast.error("Title and content (min 20) required."); return; }
    setBusy(true);
    try {
      const userId = await getUserId();
      const { error } = await supabase.from("mission_documents").insert({
        mission_id: missionId, title: noteTitle, document_type: "manual_note",
        content_summary: noteBody, uploaded_by: userId, section_tags: noteTags,
      } as never);
      if (error) throw error;
      const names = noteTags.map((id) => sections.find((s) => s.id === id)?.name).filter(Boolean) as string[];
      toast.success(`Note saved. Relevant to ${names.length} section${names.length === 1 ? "" : "s"}.`);
      reset(); onOpenChange(false); onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed.");
    } finally { setBusy(false); }
  }

  async function confirmTags() {
    if (!pendingDocId) return;
    await supabase.from("mission_documents").update({ section_tags: selectedTags }).eq("id", pendingDocId);
    const names = selectedTags.map((id) => sections.find((s) => s.id === id)?.name).filter(Boolean) as string[];
    toast.success(`Document ingested. Relevant to ${names.length} section${names.length === 1 ? "" : "s"}. Intelligence panels updated.`);
    reset(); onOpenChange(false); onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add to Library</DialogTitle>
          <DialogDescription>Add a file, URL, or note to this mission's intelligence library.</DialogDescription>
        </DialogHeader>
        {pendingDocId ? (
          <div className="space-y-3">
            <Label>Tag to sections (IRIS suggestions pre-checked)</Label>
            <div className="max-h-80 overflow-y-auto border rounded-md p-3 space-y-2">
              {sections.map((s) => (
                <label key={s.id} className="flex items-start gap-2 text-sm">
                  <Checkbox
                    checked={selectedTags.includes(s.id)}
                    onCheckedChange={(c) => setSelectedTags((prev) => c ? [...prev, s.id] : prev.filter((x) => x !== s.id))}
                  />
                  <span>{s.section_number ?? ""} {s.name}</span>
                </label>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>Skip</Button>
              <Button onClick={confirmTags}>Confirm Tags</Button>
            </DialogFooter>
          </div>
        ) : (
          <Tabs defaultValue="file">
            <TabsList className="grid grid-cols-3">
              <TabsTrigger value="file">File Upload</TabsTrigger>
              <TabsTrigger value="url">URL Link</TabsTrigger>
              <TabsTrigger value="note">Manual Note</TabsTrigger>
            </TabsList>
            <TabsContent value="file" className="space-y-3 mt-3">
              <Input type="file" accept=".pdf,.doc,.docx,audio/*,video/*"
                onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); if (f && !title) setTitle(f.name); }} />
              <div><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
              <DialogFooter>
                <Button disabled={!file || busy} onClick={handleFile}>
                  {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Upload
                </Button>
              </DialogFooter>
            </TabsContent>
            <TabsContent value="url" className="space-y-3 mt-3">
              <div><Label>URL</Label><Input value={urlVal} onChange={(e) => { setUrlVal(e.target.value); if (!urlTitle) setUrlTitle(e.target.value); }} /></div>
              <div><Label>Title</Label><Input value={urlTitle} onChange={(e) => setUrlTitle(e.target.value)} /></div>
              <DialogFooter>
                <Button disabled={busy} onClick={handleUrl}>{busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Save</Button>
              </DialogFooter>
            </TabsContent>
            <TabsContent value="note" className="space-y-3 mt-3">
              <div><Label>Title</Label><Input value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} /></div>
              <div><Label>Content</Label><Textarea rows={6} value={noteBody} onChange={(e) => setNoteBody(e.target.value)} /></div>
              <div>
                <Label>Section tags</Label>
                <div className="max-h-40 overflow-y-auto border rounded-md p-2 space-y-1">
                  {sections.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={noteTags.includes(s.id)}
                        onCheckedChange={(c) => setNoteTags((prev) => c ? [...prev, s.id] : prev.filter((x) => x !== s.id))}
                      />
                      <span>{s.section_number ?? ""} {s.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <DialogFooter>
                <Button disabled={busy} onClick={handleNote}>{busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Save Note</Button>
              </DialogFooter>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
