import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  FileText, File as FileIcon, Link as LinkIcon, StickyNote, Download,
  MoreVertical, Plus, ExternalLink, Loader2, AlertTriangle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { extractRFPText, detectRFPKind } from "@/lib/extract-rfp-text.client";
import {
  generateDocumentSummary, suggestSectionTags, analyzeAmendment,
  type AmendmentImpactT,
} from "@/lib/iris-intel-tabs.functions";
import { DOC_TYPES, DOC_TYPE_LABEL, DOC_TYPE_GROUP_ORDER, formatDate, isValidUrl } from "./intel-shared";

type Doc = {
  id: string;
  title: string | null;
  document_type: string;
  file_url: string | null;
  source_url: string | null;
  content_summary: string | null;
  section_tags: string[];
  uploaded_by: string | null;
  created_at: string;
  is_amendment: boolean;
  amendment_processed_at: string | null;
};
type Section = { id: string; section_number: string | null; name: string | null };

const BUCKET = "atlas-rfp-documents";

function docIcon(d: Doc) {
  if (d.document_type === "manual_note") return <StickyNote className="h-4 w-4" />;
  if (d.source_url) return <LinkIcon className="h-4 w-4" />;
  const t = (d.title ?? "").toLowerCase();
  if (t.endsWith(".pdf")) return <FileText className="h-4 w-4 text-red-600" />;
  if (t.endsWith(".doc") || t.endsWith(".docx")) return <FileText className="h-4 w-4 text-blue-600" />;
  return <FileIcon className="h-4 w-4" />;
}

export function RfpDocumentsTab({ missionId }: { missionId: string }) {
  const qc = useQueryClient();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [removeDoc, setRemoveDoc] = useState<Doc | null>(null);
  const [amendmentImpact, setAmendmentImpact] = useState<{
    docId: string; data: AmendmentImpactT;
  } | null>(null);
  const [applyConfirm, setApplyConfirm] = useState(false);
  const analyze = useServerFn(analyzeAmendment);

  const { data, isLoading } = useQuery({
    queryKey: ["rfp-docs", missionId],
    queryFn: async () => {
      const [docsRes, secsRes, clientRes] = await Promise.all([
        supabase.from("mission_documents").select("*").eq("mission_id", missionId)
          .order("created_at", { ascending: false }),
        supabase.from("mission_sections").select("id, section_number, name")
          .eq("mission_id", missionId).order("order_index"),
        supabase.from("missions").select("client_name").eq("id", missionId).single(),
      ]);
      return {
        docs: (docsRes.data ?? []) as Doc[],
        sections: (secsRes.data ?? []) as Section[],
        clientName: clientRes.data?.client_name ?? "the client",
      };
    },
  });

  const grouped = useMemo(() => {
    const m = new Map<string, Doc[]>();
    DOC_TYPE_GROUP_ORDER.forEach((t) => m.set(t, []));
    (data?.docs ?? []).forEach((d) => {
      const bucket = DOC_TYPE_GROUP_ORDER.includes(d.document_type as never)
        ? d.document_type : "other";
      m.get(bucket)!.push(d);
    });
    return m;
  }, [data?.docs]);

  async function renameDoc(d: Doc, title: string) {
    const t = title.trim();
    if (!t || t === d.title) return;
    await supabase.from("mission_documents").update({ title: t }).eq("id", d.id);
    qc.invalidateQueries({ queryKey: ["rfp-docs", missionId] });
  }
  async function changeType(d: Doc, type: string) {
    await supabase.from("mission_documents").update({ document_type: type }).eq("id", d.id);
    qc.invalidateQueries({ queryKey: ["rfp-docs", missionId] });
  }
  async function confirmRemove() {
    if (!removeDoc) return;
    if (removeDoc.file_url) {
      const path = removeDoc.file_url.split(`${BUCKET}/`).pop();
      if (path) await supabase.storage.from(BUCKET).remove([path]);
    }
    await supabase.from("mission_documents").delete().eq("id", removeDoc.id);
    setRemoveDoc(null);
    qc.invalidateQueries({ queryKey: ["rfp-docs", missionId] });
    toast.success("Document removed.");
  }

  async function applyAmendment() {
    if (!amendmentImpact || !data) return;
    const { data: imp, docId } = amendmentImpact;
    const secs = data.sections;
    let flaggedCount = 0;
    for (const cs of imp.changed_sections) {
      const match = secs.find((s) => (s.name ?? "").toLowerCase() === cs.section_name.toLowerCase());
      if (match) {
        await supabase.from("mission_sections")
          .update({ amendment_flagged: true }).eq("id", match.id);
        flaggedCount++;
      }
    }
    let newQ = 0;
    for (const nq of imp.new_questions) {
      const match = secs.find((s) => (s.name ?? "").toLowerCase() === nq.section_name.toLowerCase());
      await supabase.from("mission_questions").insert({
        mission_id: missionId,
        section_id: match?.id ?? null,
        question_text: nq.question_text,
        is_withdrawn: false,
      } as never);
      newQ++;
    }
    let removed = 0;
    for (const rq of imp.removed_questions) {
      const { data: q } = await supabase.from("mission_questions")
        .select("id").eq("mission_id", missionId).eq("question_number", rq.question_number).maybeSingle();
      if (q) {
        await supabase.from("mission_questions").update({ is_withdrawn: true }).eq("id", q.id);
        removed++;
      }
    }
    // Notify affected writers
    const flaggedIds = new Set<string>();
    for (const cs of imp.changed_sections) {
      const m = secs.find((s) => (s.name ?? "").toLowerCase() === cs.section_name.toLowerCase());
      if (m) flaggedIds.add(m.id);
    }
    if (flaggedIds.size > 0) {
      const { data: qIds } = await supabase.from("mission_questions")
        .select("id").eq("mission_id", missionId).in("section_id", Array.from(flaggedIds));
      const qIdList = (qIds ?? []).map((q) => q.id);
      const { data: assigns } = qIdList.length
        ? await supabase.from("mission_assignments")
            .select("assigned_writer_id").eq("mission_id", missionId).in("question_id", qIdList)
        : { data: [] as { assigned_writer_id: string | null }[] };
      const notes = (assigns ?? []).filter((a) => a.assigned_writer_id).map((a) => ({
        recipient_id: a.assigned_writer_id!,
        recipient_role: "writer",
        type: "amendment_impact",
        mission_id: missionId,
        message: `Amendment posted. A section has been updated. Review your assignment before continuing.`,
        is_read: false,
      }));
      if (notes.length) await supabase.from("atlas_notifications").insert(notes as never);
    }
    await supabase.from("mission_audit_log").insert({
      mission_id: missionId, action: "Amendment applied",
      metadata: { changed_section_count: flaggedCount, new_question_count: newQ, removed_question_count: removed },
    } as never);
    toast.success(`Amendment applied. ${flaggedCount} sections flagged, ${newQ} questions added, ${removed} withdrawn.`);
    setApplyConfirm(false);
    setAmendmentImpact(null);
    qc.invalidateQueries({ queryKey: ["rfp-docs", missionId] });
  }

  if (isLoading || !data) {
    return <Skeleton className="h-96 w-full" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">RFP &amp; Documents</h2>
          <p className="text-sm text-muted-foreground">
            All intelligence documents for this mission. Upload amendments and new research anytime.
          </p>
        </div>
        <Button variant="outline" className="border-primary text-primary" onClick={() => setUploadOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Upload Document
        </Button>
      </div>

      <div className="space-y-3">
        {DOC_TYPE_GROUP_ORDER.map((t) => {
          const list = grouped.get(t) ?? [];
          if (list.length === 0) return null;
          return (
            <details key={t} open className="rounded-lg border bg-card">
              <summary className="cursor-pointer px-4 py-3 font-medium flex items-center justify-between">
                <span>{DOC_TYPE_LABEL[t]}</span>
                <Badge variant="secondary">{list.length}</Badge>
              </summary>
              <div className="border-t divide-y">
                {list.map((d) => (
                  <DocumentRow
                    key={d.id} doc={d} sections={data.sections}
                    onRename={renameDoc} onChangeType={changeType}
                    onRemove={() => setRemoveDoc(d)}
                  />
                ))}
              </div>
            </details>
          );
        })}
        {(data.docs.length ?? 0) === 0 && (
          <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
            No documents yet. Click "Upload Document" to add the RFP and supporting intel.
          </div>
        )}
      </div>

      <UploadModal
        open={uploadOpen} onOpenChange={setUploadOpen}
        missionId={missionId} sections={data.sections} clientName={data.clientName}
        onAmendmentReady={async (docId, text) => {
          setUploadOpen(false);
          toast.message("IRIS is analyzing what changed in this amendment…");
          try {
            const impact = await analyze({ data: { mission_id: missionId, amendment_document_id: docId, amendment_text: text } });
            setAmendmentImpact({ docId, data: impact });
          } catch (e) {
            toast.error("IRIS amendment analysis failed. Document was uploaded.");
          }
          qc.invalidateQueries({ queryKey: ["rfp-docs", missionId] });
        }}
      />

      {/* Amendment impact report */}
      <Dialog open={!!amendmentImpact} onOpenChange={(o) => !o && setAmendmentImpact(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>IRIS Amendment Analysis</DialogTitle>
            <DialogDescription>{amendmentImpact?.data.summary}</DialogDescription>
          </DialogHeader>
          {amendmentImpact && (
            <div className="space-y-4 text-sm">
              {amendmentImpact.data.disclaimer && (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900 flex gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5" /> {amendmentImpact.data.disclaimer}
                </div>
              )}
              <ImpactList title="Changed sections" items={amendmentImpact.data.changed_sections.map((c) => `${c.section_name}: ${c.change_description}`)} />
              <ImpactList title="New questions detected" items={amendmentImpact.data.new_questions.map((q) => `(${q.section_name}) ${q.question_text}`)} />
              <ImpactList title="Removed questions" items={amendmentImpact.data.removed_questions.map((q) => q.question_number)} />
              <ImpactList title="Changed requirements" items={amendmentImpact.data.changed_requirements} />
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => {
              setAmendmentImpact(null);
              toast.message("No changes applied. Review the amendment impact manually in Sections & Questions.");
            }}>Review Manually</Button>
            <Button onClick={() => setApplyConfirm(true)}>Apply Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={applyConfirm} onOpenChange={setApplyConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply amendment changes?</AlertDialogTitle>
            <AlertDialogDescription>
              This will update sections, add new questions, and withdraw removed questions. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={applyAmendment}>Apply</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!removeDoc} onOpenChange={(o) => !o && setRemoveDoc(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove document?</AlertDialogTitle>
            <AlertDialogDescription>
              Removing this document will not delete intelligence already extracted from it by IRIS. Remove anyway?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRemove}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ImpactList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <h4 className="font-semibold mb-1">{title}</h4>
      <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
        {items.map((i, idx) => <li key={idx}>{i}</li>)}
      </ul>
    </div>
  );
}

function DocumentRow({
  doc, sections, onRename, onChangeType, onRemove,
}: {
  doc: Doc; sections: Section[];
  onRename: (d: Doc, t: string) => void;
  onChangeType: (d: Doc, t: string) => void;
  onRemove: () => void;
}) {
  const [title, setTitle] = useState(doc.title ?? "");
  const tagNames = doc.section_tags
    .map((id) => sections.find((s) => s.id === id))
    .filter(Boolean)
    .map((s) => s!.name ?? "");
  return (
    <div className="px-4 py-3 flex items-start gap-3">
      <div className="mt-1">{docIcon(doc)}</div>
      <div className="flex-1 min-w-0">
        <Input
          value={title} onChange={(e) => setTitle(e.target.value)}
          onBlur={() => onRename(doc, title)}
          className="h-7 px-1 border-transparent hover:border-input focus:border-input font-semibold bg-transparent"
        />
        <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted-foreground">
          <Badge variant="outline">{DOC_TYPE_LABEL[doc.document_type] ?? doc.document_type}</Badge>
          <span>{formatDate(doc.created_at)}</span>
          {doc.is_amendment && doc.amendment_processed_at && (
            <Badge className="bg-amber-100 text-amber-900">Amendment processed</Badge>
          )}
        </div>
        {doc.content_summary && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{doc.content_summary}</p>
        )}
        {tagNames.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {tagNames.map((n, i) => (
              <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary">{n}</span>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {doc.file_url && (
          <a href={doc.file_url} target="_blank" rel="noreferrer">
            <Button size="sm" variant="ghost"><Download className="h-4 w-4" /></Button>
          </a>
        )}
        {doc.source_url && (
          <a href={doc.source_url} target="_blank" rel="noreferrer">
            <Button size="sm" variant="ghost"><ExternalLink className="h-4 w-4" /></Button>
          </a>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost"><MoreVertical className="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => {
              const next = window.prompt("Rename document", doc.title ?? "");
              if (next != null) onRename(doc, next);
            }}>Rename</DropdownMenuItem>
            <div className="px-2 py-1">
              <Select value={doc.document_type} onValueChange={(v) => onChangeType(doc, v)}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DOC_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <DropdownMenuItem className="text-destructive" onClick={onRemove}>Remove</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function UploadModal({
  open, onOpenChange, missionId, sections, clientName, onAmendmentReady,
}: {
  open: boolean; onOpenChange: (o: boolean) => void;
  missionId: string; sections: Section[]; clientName: string;
  onAmendmentReady: (docId: string, text: string) => void;
}) {
  const qc = useQueryClient();
  const summarize = useServerFn(generateDocumentSummary);
  const suggestTags = useServerFn(suggestSectionTags);
  const [busy, setBusy] = useState(false);
  const [pendingDocId, setPendingDocId] = useState<string | null>(null);
  const [suggested, setSuggested] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  // Per-tab fields
  const [docType, setDocType] = useState<string>("primary_rfp");
  const [file, setFile] = useState<File | null>(null);
  const [urlVal, setUrlVal] = useState("");
  const [urlTitle, setUrlTitle] = useState("");
  const [urlType, setUrlType] = useState("research");
  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [noteType, setNoteType] = useState("research");
  const [noteTags, setNoteTags] = useState<string[]>([]);
  const [extractedText, setExtractedText] = useState<string>("");

  function reset() {
    setBusy(false); setPendingDocId(null); setSuggested([]); setSelectedTags([]);
    setFile(null); setUrlVal(""); setUrlTitle(""); setNoteTitle(""); setNoteBody("");
    setNoteTags([]); setExtractedText("");
  }

  async function getUserId(): Promise<string | null> {
    const { data: u } = await supabase.auth.getUser();
    return u.user?.id ?? null;
  }

  async function finalizeWithTags(docId: string, tags: string[]) {
    await supabase.from("mission_documents")
      .update({ section_tags: tags }).eq("id", docId);
    qc.invalidateQueries({ queryKey: ["rfp-docs", missionId] });
    const names = tags.map((id) => sections.find((s) => s.id === id)?.name).filter(Boolean) as string[];
    toast.success(`Document ingested. Relevant to ${names.length} section${names.length === 1 ? "" : "s"}. Intelligence panels updated.`);
  }

  async function handleFileUpload() {
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) { toast.error("Max file size is 100MB."); return; }
    setBusy(true);
    try {
      const path = `${missionId}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file);
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const userId = await getUserId();
      const { data: row, error } = await supabase.from("mission_documents").insert({
        mission_id: missionId, title: file.name, document_type: docType,
        file_url: pub.publicUrl, uploaded_by: userId, is_amendment: docType === "amendment",
      } as never).select("id").single();
      if (error) throw error;

      let text = "";
      try {
        if (detectRFPKind(file)) text = await extractRFPText(file);
      } catch { /* ignore */ }
      setExtractedText(text);

      try { await summarize({ data: { document_id: row.id, extra_text: text } }); } catch {}

      if (docType === "amendment") {
        onAmendmentReady(row.id, text);
        reset();
        return;
      }
      // suggest tags
      try {
        const sugg = await suggestTags({ data: { mission_id: missionId, document_id: row.id } });
        setSuggested(sugg.section_ids); setSelectedTags(sugg.section_ids);
      } catch {}
      setPendingDocId(row.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed.");
    } finally { setBusy(false); }
  }

  async function handleUrlSave() {
    if (!urlVal || !isValidUrl(urlVal)) { toast.error("Enter a valid URL."); return; }
    if (!urlTitle.trim()) { toast.error("Title is required."); return; }
    setBusy(true);
    try {
      const userId = await getUserId();
      const { data: row, error } = await supabase.from("mission_documents").insert({
        mission_id: missionId, title: urlTitle, document_type: urlType,
        source_url: urlVal, uploaded_by: userId,
      } as never).select("id").single();
      if (error) throw error;
      try { await summarize({ data: { document_id: row.id, extra_text: `URL: ${urlVal}` } }); } catch {}
      try {
        const sugg = await suggestTags({ data: { mission_id: missionId, document_id: row.id } });
        setSuggested(sugg.section_ids); setSelectedTags(sugg.section_ids);
      } catch {}
      setPendingDocId(row.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed.");
    } finally { setBusy(false); }
  }

  async function handleNoteSave() {
    if (!noteTitle.trim() || noteBody.trim().length < 20) {
      toast.error("Title and content (min 20 chars) are required."); return;
    }
    setBusy(true);
    try {
      const userId = await getUserId();
      const { data: row, error } = await supabase.from("mission_documents").insert({
        mission_id: missionId, title: noteTitle, document_type: "manual_note",
        content_summary: noteBody, uploaded_by: userId, section_tags: noteTags,
      } as never).select("id").single();
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["rfp-docs", missionId] });
      const names = noteTags.map((id) => sections.find((s) => s.id === id)?.name).filter(Boolean) as string[];
      toast.success(`Note saved. Relevant to ${names.length} section${names.length === 1 ? "" : "s"}.`);
      reset(); onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed.");
    } finally { setBusy(false); }
  }

  async function confirmTags() {
    if (!pendingDocId) return;
    await finalizeWithTags(pendingDocId, selectedTags);
    reset(); onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Upload Document</DialogTitle>
          <DialogDescription>Add a file, URL, or note to this mission's intelligence library.</DialogDescription>
        </DialogHeader>
        {pendingDocId ? (
          <div className="space-y-3">
            <Label>Tag to sections {suggested.length > 0 && <span className="text-xs text-primary">(IRIS suggestions pre-selected)</span>}</Label>
            <div className="max-h-80 overflow-y-auto border rounded-md p-3 space-y-2">
              {sections.map((s) => (
                <label key={s.id} className="flex items-start gap-2 text-sm">
                  <Checkbox
                    checked={selectedTags.includes(s.id)}
                    onCheckedChange={(c) => setSelectedTags((prev) =>
                      c ? [...prev, s.id] : prev.filter((x) => x !== s.id))}
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
              <Input type="file" accept=".pdf,.doc,.docx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              <div>
                <Label>Document type</Label>
                <Select value={docType} onValueChange={setDocType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DOC_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button disabled={!file || busy} onClick={handleFileUpload}>
                  {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Upload
                </Button>
              </DialogFooter>
            </TabsContent>
            <TabsContent value="url" className="space-y-3 mt-3">
              <div><Label>URL</Label><Input value={urlVal} onChange={(e) => { setUrlVal(e.target.value); if (!urlTitle) setUrlTitle(e.target.value); }} placeholder="https://..." /></div>
              <div><Label>Title</Label><Input value={urlTitle} onChange={(e) => setUrlTitle(e.target.value)} /></div>
              <div>
                <Label>Document type</Label>
                <Select value={urlType} onValueChange={setUrlType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DOC_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button disabled={busy} onClick={handleUrlSave}>{busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Save</Button>
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
                        onCheckedChange={(c) => setNoteTags((prev) =>
                          c ? [...prev, s.id] : prev.filter((x) => x !== s.id))}
                      />
                      <span>{s.section_number ?? ""} {s.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <DialogFooter>
                <Button disabled={busy} onClick={handleNoteSave}>{busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Save Note</Button>
              </DialogFooter>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
