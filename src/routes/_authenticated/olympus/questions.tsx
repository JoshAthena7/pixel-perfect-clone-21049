import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2, Search, FileText, X, CheckSquare, Square, Sparkles, Download } from "lucide-react";
import { useSelectedOlympusMission } from "../olympus";
import { logOlympusAction } from "@/lib/audit";
import { PensDownCountdown } from "@/lib/countdowns";

export const Route = createFileRoute("/_authenticated/olympus/questions")({
  component: QuestionsPage,
});

const STATUS = ["not_started", "in_progress", "ready_for_review", "approved", "blocked"] as const;
type Status = (typeof STATUS)[number];

type QRow = {
  id: string;
  mission_id: string;
  question_number: string;
  title: string;
  question_text: string;
  section_number: string | null;
  status: string | null;
  assigned_writer_id: string | null;
  assigned_sme_id: string | null;
  pens_down_date: string | null;
  page_limit: number | null;
  evaluation_weight: number | null;
  health: string | null;
};

type Member = { user_id: string; role: string; profile: { display_name: string | null; email: string | null } | null };

function QuestionsPage() {
  const missionId = useSelectedOlympusMission();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["olympus-questions", missionId],
    enabled: !!missionId,
    queryFn: async () => {
      const { data } = await supabase
        .from("question_records")
        .select("id,mission_id,question_number,title,question_text,section_number,status,assigned_writer_id,assigned_sme_id,pens_down_date,page_limit,evaluation_weight,health")
        .eq("mission_id", missionId!)
        .order("sort_order", { ascending: true })
        .order("question_number", { ascending: true });
      return (data ?? []) as QRow[];
    },
  });

  const { data: members = [] } = useQuery({
    queryKey: ["olympus-questions-members", missionId],
    enabled: !!missionId,
    queryFn: async () => {
      const { data } = await supabase.from("mission_members").select("user_id,role").eq("mission_id", missionId!);
      const ids = (data ?? []).map((m: any) => m.user_id);
      if (!ids.length) return [];
      const { data: profs } = await supabase.from("profiles").select("id,display_name,email").in("id", ids);
      const map = new Map((profs ?? []).map((p: any) => [p.id, p]));
      return (data ?? []).map((m: any) => ({ ...m, profile: map.get(m.user_id) ?? null })) as Member[];
    },
  });

  const writers = useMemo(() => members.filter((m) => ["writer", "lead", "admin"].includes(m.role)), [members]);
  const smes = useMemo(() => members.filter((m) => ["sme", "reviewer", "lead", "admin"].includes(m.role)), [members]);

  const visible = useMemo(() => {
    return rows.filter((r) => {
      if (statusFilter !== "all" && (r.status ?? "not_started") !== statusFilter) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return r.title.toLowerCase().includes(q) || r.question_number.toLowerCase().includes(q) || (r.question_text ?? "").toLowerCase().includes(q);
    });
  }, [rows, search, statusFilter]);

  async function patch(q: QRow, fields: Partial<QRow>) {
    const { error } = await supabase.from("question_records").update(fields).eq("id", q.id);
    if (error) return toast.error(error.message);
    qc.setQueryData(["olympus-questions", missionId], (old: QRow[] | undefined) =>
      (old ?? []).map((r) => (r.id === q.id ? { ...r, ...fields } : r)),
    );
    await logOlympusAction({
      action_type: "question.update",
      action_summary: `Updated ${q.question_number}: ${Object.keys(fields).join(", ")}`,
      mission_id: missionId!,
      target_table: "question_records",
      target_id: q.id,
    });
  }

  async function remove(q: QRow) {
    if (!confirm(`Delete question ${q.question_number}?`)) return;
    const { error } = await supabase.from("question_records").delete().eq("id", q.id);
    if (error) return toast.error(error.message);
    toast.success("Question deleted");
    await logOlympusAction({
      action_type: "question.delete",
      action_summary: `Deleted ${q.question_number} — ${q.title}`,
      mission_id: missionId!,
      target_table: "question_records",
      target_id: q.id,
    });
    qc.invalidateQueries({ queryKey: ["olympus-questions", missionId] });
  }

  function toggleSel(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  }
  function selectAll() {
    if (selected.size === visible.length) setSelected(new Set());
    else setSelected(new Set(visible.map((r) => r.id)));
  }

  if (!missionId) {
    return <div className="mx-auto max-w-4xl px-8 py-16 text-center text-sm text-muted-foreground">Select a mission to manage its questions.</div>;
  }

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-8">
      <header className="mb-5 flex items-start justify-between gap-4">
        <div>
          <div className="h2-label" style={{ letterSpacing: "0.32em" }}>Questions</div>
          <h1 className="h1-display mt-1">Question Management</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Master table for every question in this mission. Inline-edit assignments, dates, weights, and status.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button onClick={() => setBulkOpen(true)}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-surface-hover">
              Bulk assign ({selected.size})
            </button>
          )}
          <button
            onClick={() => exportCsv(rows, members)}
            disabled={rows.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-surface-hover disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" /> Export
          </button>
          <Link to="/olympus/vault"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-surface-hover">
            <Sparkles className="h-3.5 w-3.5" /> Import from RFP
          </Link>
          <button onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-2 rounded-md bg-[#C49A22] px-4 py-2 text-sm font-semibold text-black hover:bg-[#D4AA32]">
            <Plus className="h-4 w-4" /> Add Question
          </button>
        </div>
      </header>

      <div className="mb-3 flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search number, title, or text…"
            className="w-full rounded-md border border-border bg-background py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-border bg-background px-2 py-2 text-xs">
          <option value="all">All statuses</option>
          {STATUS.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
        </select>
        <div className="ml-auto text-[11px] text-muted-foreground">{visible.length} of {rows.length}</div>
      </div>

      <div className="rounded-[10px] border border-border bg-surface overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-10 w-full" />)}</div>
        ) : visible.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            <FileText className="mx-auto mb-2 h-6 w-6 opacity-60" />
            No questions match. Upload an RFP in the Vault to auto-parse questions, or add one manually.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-surface-hover text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                <tr>
                  <th className="px-3 py-3 w-8">
                    <button onClick={selectAll} className="text-muted-foreground hover:text-foreground">
                      {selected.size === visible.length && visible.length > 0 ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
                    </button>
                  </th>
                  <th className="px-3 py-3 text-left w-20">Q#</th>
                  <th className="px-3 py-3 text-left">Title</th>
                  <th className="px-3 py-3 text-left w-36">Writer</th>
                  <th className="px-3 py-3 text-left w-36">SME</th>
                  <th className="px-3 py-3 text-left w-36">Pens Down</th>
                  <th className="px-3 py-3 text-left w-20">Pages</th>
                  <th className="px-3 py-3 text-left w-20">Weight</th>
                  <th className="px-3 py-3 text-left w-40">Status</th>
                  <th className="px-3 py-3 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visible.map((q) => (
                  <tr key={q.id} className={`hover:bg-surface-hover ${selected.has(q.id) ? "bg-primary/5" : ""}`}>
                    <td className="px-3 py-2">
                      <button onClick={() => toggleSel(q.id)} className="text-muted-foreground hover:text-foreground">
                        {selected.has(q.id) ? <CheckSquare className="h-3.5 w-3.5 text-primary" /> : <Square className="h-3.5 w-3.5" />}
                      </button>
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">{q.question_number}</td>
                    <td className="px-3 py-2">
                      <div className="text-sm font-medium truncate max-w-md">{q.title}</div>
                      {q.section_number && <div className="text-[10px] text-muted-foreground">§ {q.section_number}</div>}
                    </td>
                    <td className="px-3 py-2">
                      <SelectMember value={q.assigned_writer_id} members={writers} onChange={(v) => patch(q, { assigned_writer_id: v })} />
                    </td>
                    <td className="px-3 py-2">
                      <SelectMember value={q.assigned_sme_id} members={smes} onChange={(v) => patch(q, { assigned_sme_id: v })} />
                    </td>
                    <td className="px-3 py-2">
                      <input type="date" value={q.pens_down_date ?? ""}
                        onChange={(e) => patch(q, { pens_down_date: e.target.value || null })}
                        className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs" />
                      {q.pens_down_date && (
                        <div className="mt-1">
                          <PensDownCountdown date={q.pens_down_date} />
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" min={0} value={q.page_limit ?? ""}
                        onChange={(e) => patch(q, { page_limit: e.target.value ? Number(e.target.value) : null })}
                        className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs" />
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" step="0.1" min={0} value={q.evaluation_weight ?? ""}
                        onChange={(e) => patch(q, { evaluation_weight: e.target.value ? Number(e.target.value) : null })}
                        className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs" />
                    </td>
                    <td className="px-3 py-2">
                      <select value={q.status ?? "not_started"} onChange={(e) => patch(q, { status: e.target.value as Status })}
                        className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs">
                        {STATUS.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => remove(q)} className="rounded-md p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-400">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {addOpen && <AddQuestionModal missionId={missionId} nextNumber={`${rows.length + 1}`}
        onClose={() => setAddOpen(false)}
        onSaved={() => { qc.invalidateQueries({ queryKey: ["olympus-questions", missionId] }); setAddOpen(false); }} />}

      {bulkOpen && <BulkAssignModal selectedIds={Array.from(selected)} writers={writers} smes={smes}
        onClose={() => setBulkOpen(false)}
        onDone={() => { qc.invalidateQueries({ queryKey: ["olympus-questions", missionId] }); setSelected(new Set()); setBulkOpen(false); }} />}
    </div>
  );
}

function SelectMember({ value, members, onChange }: { value: string | null; members: Member[]; onChange: (v: string | null) => void }) {
  return (
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}
      className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs">
      <option value="">Unassigned</option>
      {members.map((m) => (
        <option key={m.user_id} value={m.user_id}>{m.profile?.display_name ?? m.profile?.email ?? m.user_id.slice(0,8)}</option>
      ))}
    </select>
  );
}

function AddQuestionModal({ missionId, nextNumber, onClose, onSaved }: {
  missionId: string; nextNumber: string; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    question_number: nextNumber, title: "", question_text: "", section_number: "",
    page_limit: "", evaluation_weight: "",
  });
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.question_text.trim()) return toast.error("Title and question text are required");
    setBusy(true);
    const { data, error } = await supabase.from("question_records").insert({
      mission_id: missionId,
      question_number: form.question_number.trim() || nextNumber,
      title: form.title.trim(),
      question_text: form.question_text.trim(),
      section_number: form.section_number.trim() || null,
      page_limit: form.page_limit ? Number(form.page_limit) : null,
      evaluation_weight: form.evaluation_weight ? Number(form.evaluation_weight) : null,
      status: "not_started",
    }).select("id").single();
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Question added");
    await logOlympusAction({
      action_type: "question.create",
      action_summary: `Added question ${form.question_number} — ${form.title}`,
      mission_id: missionId,
      target_table: "question_records",
      target_id: data?.id ?? null,
    });
    onSaved();
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="relative w-full max-w-xl rounded-[10px] border border-border bg-surface p-6">
        <button type="button" onClick={onClose} className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-surface-hover">
          <X className="h-4 w-4" />
        </button>
        <div className="h2-label" style={{ letterSpacing: "0.32em" }}>New Question</div>
        <h2 className="mt-1 text-lg font-semibold">Add Question</h2>
        <div className="mt-5 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <Field label="Number">
              <input value={form.question_number} onChange={(e) => setForm({ ...form, question_number: e.target.value })}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
            </Field>
            <Field label="Section">
              <input value={form.section_number} onChange={(e) => setForm({ ...form, section_number: e.target.value })}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
            </Field>
            <Field label="Pages">
              <input type="number" value={form.page_limit} onChange={(e) => setForm({ ...form, page_limit: e.target.value })}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
            </Field>
          </div>
          <Field label="Title">
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
          </Field>
          <Field label="Question text">
            <textarea value={form.question_text} onChange={(e) => setForm({ ...form, question_text: e.target.value })} rows={5}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
          </Field>
          <Field label="Evaluation weight">
            <input type="number" step="0.1" value={form.evaluation_weight} onChange={(e) => setForm({ ...form, evaluation_weight: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
          </Field>
        </div>
        <footer className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-surface-hover">Cancel</button>
          <button type="submit" disabled={busy} className="rounded-lg bg-[#C49A22] px-4 py-2 text-sm font-semibold text-black hover:bg-[#D4AA32] disabled:opacity-50">
            {busy ? "Adding…" : "Add Question"}
          </button>
        </footer>
      </form>
    </div>
  );
}

function BulkAssignModal({ selectedIds, writers, smes, onClose, onDone }: {
  selectedIds: string[]; writers: Member[]; smes: Member[]; onClose: () => void; onDone: () => void;
}) {
  const [writer, setWriter] = useState<string>("");
  const [sme, setSme] = useState<string>("");
  const [pensDown, setPensDown] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);

  async function apply() {
    const update: any = {};
    if (writer) update.assigned_writer_id = writer === "__clear__" ? null : writer;
    if (sme) update.assigned_sme_id = sme === "__clear__" ? null : sme;
    if (pensDown) update.pens_down_date = pensDown;
    if (status) update.status = status;
    if (Object.keys(update).length === 0) return toast.message("Nothing to change");
    setBusy(true);
    const { error } = await supabase.from("question_records").update(update).in("id", selectedIds);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Updated ${selectedIds.length} questions`);
    onDone();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div onClick={(e) => e.stopPropagation()} className="relative w-full max-w-md rounded-[10px] border border-border bg-surface p-6">
        <button onClick={onClose} className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-surface-hover">
          <X className="h-4 w-4" />
        </button>
        <div className="h2-label" style={{ letterSpacing: "0.32em" }}>Bulk Update</div>
        <h2 className="mt-1 text-lg font-semibold">Update {selectedIds.length} Questions</h2>
        <div className="mt-5 space-y-3">
          <Field label="Writer (leave blank to skip)">
            <select value={writer} onChange={(e) => setWriter(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
              <option value="">— don't change —</option>
              <option value="__clear__">Clear (unassign)</option>
              {writers.map((m) => <option key={m.user_id} value={m.user_id}>{m.profile?.display_name ?? m.profile?.email}</option>)}
            </select>
          </Field>
          <Field label="SME">
            <select value={sme} onChange={(e) => setSme(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
              <option value="">— don't change —</option>
              <option value="__clear__">Clear (unassign)</option>
              {smes.map((m) => <option key={m.user_id} value={m.user_id}>{m.profile?.display_name ?? m.profile?.email}</option>)}
            </select>
          </Field>
          <Field label="Pens down date">
            <input type="date" value={pensDown} onChange={(e) => setPensDown(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
          </Field>
          <Field label="Status">
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
              <option value="">— don't change —</option>
              {STATUS.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
            </select>
          </Field>
        </div>
        <footer className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-surface-hover">Cancel</button>
          <button onClick={apply} disabled={busy} className="rounded-lg bg-[#C49A22] px-4 py-2 text-sm font-semibold text-black hover:bg-[#D4AA32] disabled:opacity-50">
            {busy ? "Applying…" : "Apply"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function exportCsv(rows: QRow[], members: Member[]) {
  const nameFor = (id: string | null) => {
    if (!id) return "";
    const m = members.find((x) => x.user_id === id);
    return m?.profile?.display_name ?? m?.profile?.email ?? id;
  };
  const header = ["Q#", "Title", "Section", "Status", "Writer", "SME", "Pens Down", "Pages", "Weight", "Health"];
  const lines = [header.join(",")];
  for (const r of rows) {
    const cells = [
      r.question_number, r.title, r.section_number ?? "", r.status ?? "",
      nameFor(r.assigned_writer_id), nameFor(r.assigned_sme_id),
      r.pens_down_date ?? "", r.page_limit ?? "", r.evaluation_weight ?? "", r.health ?? "",
    ].map((v) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    });
    lines.push(cells.join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `questions-${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
  toast.success("Exported CSV");
}
