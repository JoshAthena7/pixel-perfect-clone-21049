import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Loader2, Plus, Upload, Trash2 } from "lucide-react";
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
// extract-rfp-text.client is loaded dynamically inside the handler to keep it out of the server bundle
import {
  generateQaInterpretation, parseBulkQaDocument,
} from "@/lib/iris-intel-tabs.functions";
import { formatDate } from "./intel-shared";

type Qa = {
  id: string;
  qa_number: string | null;
  question: string;
  state_response: string | null;
  answer: string | null;
  date_issued: string | null;
  impact_level: string;
  status: string;
  sections_affected: string[];
  iris_interpretation: string | null;
  created_at: string;
};
type Section = { id: string; section_number: string | null; name: string | null };

const IMPACT_BADGE: Record<string, string> = {
  high: "bg-red-100 text-red-800",
  medium: "bg-amber-100 text-amber-900",
  low: "bg-gray-100 text-gray-700",
};
const STATUS_BADGE: Record<string, string> = {
  new: "bg-yellow-100 text-yellow-800",
  reviewed: "bg-slate-200 text-slate-800",
  communicated: "bg-green-100 text-green-800",
};

export function QaLogTab({ missionId }: { missionId: string }) {
  const qc = useQueryClient();
  const interpretFn = useServerFn(generateQaInterpretation);
  const parseBulk = useServerFn(parseBulkQaDocument);
  const [addOpen, setAddOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [delTarget, setDelTarget] = useState<Qa | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [impactFilter, setImpactFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sectionFilter, setSectionFilter] = useState("all");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["qa-log", missionId],
    queryFn: async () => {
      const [qaRes, secsRes] = await Promise.all([
        supabase.from("mission_qa_log").select("*").eq("mission_id", missionId)
          .order("created_at", { ascending: false }),
        supabase.from("mission_sections").select("id, section_number, name")
          .eq("mission_id", missionId).order("order_index"),
      ]);
      return {
        rows: (qaRes.data ?? []) as Qa[],
        sections: (secsRes.data ?? []) as Section[],
      };
    },
  });

  const filtered = useMemo(() => {
    const rows = data?.rows ?? [];
    const term = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (impactFilter !== "all" && r.impact_level !== impactFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (sectionFilter !== "all" && !r.sections_affected.includes(sectionFilter)) return false;
      if (term) {
        const hay = `${r.question} ${r.state_response ?? r.answer ?? ""}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [data, search, impactFilter, statusFilter, sectionFilter]);

  async function generate(qa: Qa) {
    try {
      await interpretFn({ data: { qa_id: qa.id } });
      qc.invalidateQueries({ queryKey: ["qa-log", missionId] });
      toast.success("IRIS interpretation generated.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed."); }
  }

  async function markReviewed(qa: Qa) {
    await supabase.from("mission_qa_log").update({ status: "reviewed" }).eq("id", qa.id);
    qc.invalidateQueries({ queryKey: ["qa-log", missionId] });
  }

  async function notifyWriters(qa: Qa) {
    if (!qa.sections_affected.length) return;
    const { data: qs } = await supabase.from("mission_questions")
      .select("id").eq("mission_id", missionId).in("section_id", qa.sections_affected);
    const qIds = (qs ?? []).map((q) => q.id);
    if (!qIds.length) { toast.message("No questions in affected sections."); return; }
    const { data: assigns } = await supabase.from("mission_assignments")
      .select("assigned_writer_id").eq("mission_id", missionId).in("question_id", qIds);
    const writers = Array.from(new Set((assigns ?? []).map((a) => a.assigned_writer_id).filter(Boolean) as string[]));
    if (writers.length) {
      await supabase.from("atlas_notifications").insert(
        writers.map((w) => ({
          recipient_id: w, recipient_role: "writer",
          type: "qa_communicated", mission_id: missionId,
          message: "New Q&A posted affecting your section. Review before continuing your work.",
          is_read: false,
        })) as never,
      );
    }
    await supabase.from("mission_qa_log").update({ status: "communicated" }).eq("id", qa.id);
    qc.invalidateQueries({ queryKey: ["qa-log", missionId] });
    toast.success(`${writers.length} writer${writers.length === 1 ? "" : "s"} notified.`);
  }

  async function deleteQa() {
    if (!delTarget) return;
    await supabase.from("mission_qa_log").delete().eq("id", delTarget.id);
    setDelTarget(null);
    qc.invalidateQueries({ queryKey: ["qa-log", missionId] });
    toast.success("Q&A deleted.");
  }

  if (isError) return <ErrorState message="Couldn't load the Q&A log." onRetry={() => refetch()} />;
  if (isLoading || !data) return <SkeletonRows rows={5} height="h-16" />;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Q&amp;A Log</h2>
          <p className="text-sm text-muted-foreground">
            Track all questions and answers issued by the state during the procurement period.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="border-primary text-primary" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add Q&amp;A Entry
          </Button>
          <Button variant="outline" onClick={() => setBulkOpen(true)}>
            <Upload className="h-4 w-4 mr-1" /> Bulk Import
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-60" />
        <Select value={impactFilter} onValueChange={setImpactFilter}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Impact" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All impact</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="reviewed">Reviewed</SelectItem>
            <SelectItem value="communicated">Communicated</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sectionFilter} onValueChange={setSectionFilter}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Section" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sections</SelectItem>
            {data.sections.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.section_number ?? ""} {s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={data.rows.length === 0 ? "No Q&A entries yet" : "No entries match your filters"}
          description={
            data.rows.length === 0
              ? "Add entries as the state publishes them during the procurement period."
              : undefined
          }
        />
      ) : (
        <div className="rounded-lg border bg-card divide-y">
          <div className="grid grid-cols-12 px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <div className="col-span-2">Q&amp;A #</div>
            <div className="col-span-4">Question</div>
            <div className="col-span-2">Date</div>
            <div className="col-span-1">Impact</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-1 text-right">Sections</div>
          </div>
          {filtered.map((q) => {
            const isOpen = expanded === q.id;
            const response = q.state_response ?? q.answer ?? "";
            return (
              <div key={q.id}>
                <button
                  className="w-full grid grid-cols-12 px-4 py-3 text-sm hover:bg-muted/30 text-left"
                  onClick={() => setExpanded(isOpen ? null : q.id)}
                >
                  <div className="col-span-2 flex items-center gap-1 font-medium">
                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    {q.qa_number ?? "—"}
                  </div>
                  <div className="col-span-4 truncate">{q.question}</div>
                  <div className="col-span-2 text-muted-foreground">{formatDate(q.date_issued ?? q.created_at)}</div>
                  <div className="col-span-1"><Badge className={IMPACT_BADGE[q.impact_level] ?? ""}>{q.impact_level}</Badge></div>
                  <div className="col-span-2"><Badge className={STATUS_BADGE[q.status] ?? ""}>{q.status}</Badge></div>
                  <div className="col-span-1 text-right text-muted-foreground">{q.sections_affected.length}</div>
                </button>
                {isOpen && (
                  <div className="px-6 py-4 bg-muted/20 space-y-3 text-sm">
                    <div><strong>Question:</strong><p className="mt-1 whitespace-pre-wrap">{q.question}</p></div>
                    <div><strong>State response:</strong><p className="mt-1 whitespace-pre-wrap">{response || <em className="text-muted-foreground">No response recorded.</em>}</p></div>
                    <div>
                      <strong>IRIS interpretation:</strong>
                      {q.iris_interpretation ? (
                        <p className="mt-1 whitespace-pre-wrap">{q.iris_interpretation}</p>
                      ) : (
                        <div className="mt-1">
                          <Button size="sm" variant="outline" onClick={() => generate(q)}>
                            Generate IRIS Interpretation
                          </Button>
                        </div>
                      )}
                    </div>
                    {q.sections_affected.length > 0 && (
                      <div>
                        <strong>Sections affected:</strong>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {q.sections_affected.map((sid) => {
                            const s = data.sections.find((x) => x.id === sid);
                            return (
                              <Badge key={sid} variant="outline">
                                {s ? `${s.section_number ?? ""} ${s.name}` : sid}
                              </Badge>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    <div className="flex gap-2 pt-2">
                      {q.status === "reviewed" ? (
                        <span className="text-sm text-green-700 font-medium">Reviewed ✓</span>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => markReviewed(q)}>Mark Reviewed</Button>
                      )}
                      {q.status !== "communicated" && q.sections_affected.length > 0 && (
                        <Button size="sm" onClick={() => notifyWriters(q)}>Notify Affected Writers</Button>
                      )}
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDelTarget(q)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <AddQaModal
        open={addOpen} onOpenChange={setAddOpen}
        missionId={missionId} sections={data.sections}
        onSaved={() => qc.invalidateQueries({ queryKey: ["qa-log", missionId] })}
      />
      <BulkImportModal
        open={bulkOpen} onOpenChange={setBulkOpen}
        missionId={missionId} parseBulk={parseBulk} interpretFn={interpretFn}
        onSaved={() => qc.invalidateQueries({ queryKey: ["qa-log", missionId] })}
      />

      <AlertDialog open={!!delTarget} onOpenChange={(o) => !o && setDelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this Q&amp;A entry?</AlertDialogTitle>
            <AlertDialogDescription>This is permanent.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteQa}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AddQaModal({
  open, onOpenChange, missionId, sections, onSaved,
}: {
  open: boolean; onOpenChange: (o: boolean) => void;
  missionId: string; sections: Section[]; onSaved: () => void;
}) {
  const interpretFn = useServerFn(generateQaInterpretation);
  const [busy, setBusy] = useState(false);
  const [qaNumber, setQaNumber] = useState("");
  const [question, setQuestion] = useState("");
  const [response, setResponse] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [impact, setImpact] = useState("medium");
  const [tags, setTags] = useState<string[]>([]);

  async function save() {
    if (!question.trim() || !response.trim()) {
      toast.error("Question and response are required."); return;
    }
    setBusy(true);
    try {
      const { data: row, error } = await supabase.from("mission_qa_log").insert({
        mission_id: missionId, qa_number: qaNumber || null, question,
        state_response: response, answer: response, date_issued: date || null,
        sections_affected: tags, impact_level: impact, status: "new",
      } as never).select("id").single();
      if (error) throw error;
      try { await interpretFn({ data: { qa_id: row.id } }); } catch {}
      toast.success("Q&A entry added. IRIS interpretation generated.");
      setQaNumber(""); setQuestion(""); setResponse(""); setTags([]); setImpact("medium");
      onOpenChange(false); onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed.");
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Add Q&amp;A Entry</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Q&amp;A Number</Label><Input value={qaNumber} onChange={(e) => setQaNumber(e.target.value)} /></div>
            <div><Label>Date Issued</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          </div>
          <div><Label>Question</Label><Textarea rows={3} value={question} onChange={(e) => setQuestion(e.target.value)} /></div>
          <div><Label>State Response</Label><Textarea rows={3} value={response} onChange={(e) => setResponse(e.target.value)} /></div>
          <div>
            <Label>Impact Level</Label>
            <Select value={impact} onValueChange={setImpact}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Sections affected</Label>
            <div className="max-h-40 overflow-y-auto border rounded-md p-2 space-y-1">
              {sections.map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={tags.includes(s.id)}
                    onCheckedChange={(c) => setTags((prev) => c ? [...prev, s.id] : prev.filter((x) => x !== s.id))}
                  />
                  <span>{s.section_number ?? ""} {s.name}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button disabled={busy} onClick={save}>{busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BulkImportModal({
  open, onOpenChange, missionId, parseBulk, interpretFn, onSaved,
}: {
  open: boolean; onOpenChange: (o: boolean) => void;
  missionId: string;
  parseBulk: ReturnType<typeof useServerFn<typeof parseBulkQaDocument>>;
  interpretFn: ReturnType<typeof useServerFn<typeof generateQaInterpretation>>;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [entries, setEntries] = useState<{ number: string; question: string; response: string; date_issued?: string | null; checked: boolean }[]>([]);
  const [importing, setImporting] = useState<{ done: number; total: number } | null>(null);

  async function handleFile(file: File | null) {
    if (!file) return;
    const { extractRFPText, detectRFPKind } = await import("@/lib/extract-rfp-text.client");
    if (!detectRFPKind(file)) { toast.error("Upload a PDF or Word document."); return; }
    setBusy(true);
    try {
      const text = await extractRFPText(file);
      const parsed = await parseBulk({ data: { text } });
      setEntries(parsed.qa_entries.map((e) => ({ ...e, number: e.number ?? "", checked: true })));
      if (!parsed.qa_entries.length) toast.message("IRIS could not extract any Q&A pairs.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Parsing failed.");
    } finally { setBusy(false); }
  }

  async function importSelected() {
    const checked = entries.filter((e) => e.checked);
    if (!checked.length) return;
    setImporting({ done: 0, total: checked.length });
    for (let i = 0; i < checked.length; i++) {
      const e = checked[i];
      const { data: row } = await supabase.from("mission_qa_log").insert({
        mission_id: missionId, qa_number: e.number || null,
        question: e.question, state_response: e.response, answer: e.response,
        date_issued: e.date_issued || null, status: "new", impact_level: "medium",
      } as never).select("id").single();
      if (row) { try { await interpretFn({ data: { qa_id: row.id } }); } catch {} }
      setImporting({ done: i + 1, total: checked.length });
    }
    setImporting(null); setEntries([]); onSaved(); onOpenChange(false);
    toast.success(`Imported ${checked.length} Q&A entries.`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk Import Q&amp;A</DialogTitle>
          <DialogDescription>Upload a state-issued Q&amp;A document and IRIS will parse it into individual entries.</DialogDescription>
        </DialogHeader>
        {entries.length === 0 ? (
          <div className="space-y-3">
            <Input type="file" accept=".pdf,.doc,.docx" onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />
            {busy && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> IRIS is parsing…</div>}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{entries.length} entries extracted. Uncheck any you don't want to import.</p>
            <div className="border rounded-md divide-y max-h-96 overflow-y-auto">
              {entries.map((e, i) => (
                <label key={i} className="flex gap-3 p-3 text-sm">
                  <Checkbox
                    checked={e.checked}
                    onCheckedChange={(c) => setEntries((prev) => prev.map((x, j) => j === i ? { ...x, checked: !!c } : x))}
                  />
                  <div className="flex-1">
                    <div className="font-medium">{e.number ? `${e.number}. ` : ""}{e.question}</div>
                    <div className="text-muted-foreground mt-1 line-clamp-2">{e.response}</div>
                  </div>
                </label>
              ))}
            </div>
            {importing && (
              <p className="text-sm">Importing {importing.done} of {importing.total}…</p>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEntries([])}>Re-upload</Button>
              <Button onClick={importSelected} disabled={!!importing}>
                {importing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null} Import Selected
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
