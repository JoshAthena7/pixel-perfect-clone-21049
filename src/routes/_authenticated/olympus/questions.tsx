import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Plus, Trash2, Search, FileText, X, CheckSquare, Square, Sparkles, Download,
  Pencil, GripVertical, FolderTree, List, CornerDownRight,
} from "lucide-react";
import { useSelectedOlympusMission } from "../olympus";
import { logOlympusAction } from "@/lib/audit";
import { PensDownCountdown } from "@/lib/countdowns";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export const Route = createFileRoute("/_authenticated/olympus/questions")({
  component: QuestionsPage,
});

const STATUS = ["not_started", "in_progress", "in_review", "complete"] as const;
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
  sort_order: number | null;
  parent_question_id: string | null;
};

type Member = { user_id: string; role: string; profile: { display_name: string | null; email: string | null } | null };

const COLS =
  "id,mission_id,question_number,title,question_text,section_number,status,assigned_writer_id,assigned_sme_id,pens_down_date,page_limit,evaluation_weight,health,sort_order,parent_question_id";

function QuestionsPage() {
  const missionId = useSelectedOlympusMission();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editing, setEditing] = useState<QRow | null>(null);
  const [renameSection, setRenameSection] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"sections" | "flat">("sections");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["olympus-questions", missionId],
    enabled: !!missionId,
    queryFn: async () => {
      const { data } = await supabase
        .from("question_records")
        .select(COLS)
        .eq("mission_id", missionId!)
        .order("section_number", { ascending: true, nullsFirst: false })
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
      return (
        r.title.toLowerCase().includes(q) ||
        r.question_number.toLowerCase().includes(q) ||
        (r.question_text ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, statusFilter]);

  // Group by section + nest children under parents.
  const grouped = useMemo(() => {
    const sectionMap = new Map<string, QRow[]>();
    for (const r of visible) {
      const key = (r.section_number?.trim() || "Unsectioned");
      if (!sectionMap.has(key)) sectionMap.set(key, []);
      sectionMap.get(key)!.push(r);
    }
    return Array.from(sectionMap.entries()).map(([section, items]) => {
      const byId = new Map(items.map((i) => [i.id, i]));
      const tops: Array<{ row: QRow; children: QRow[] }> = [];
      const childrenOf = new Map<string, QRow[]>();
      for (const it of items) {
        if (it.parent_question_id && byId.has(it.parent_question_id)) {
          if (!childrenOf.has(it.parent_question_id)) childrenOf.set(it.parent_question_id, []);
          childrenOf.get(it.parent_question_id)!.push(it);
        }
      }
      for (const it of items) {
        if (!it.parent_question_id || !byId.has(it.parent_question_id)) {
          tops.push({ row: it, children: childrenOf.get(it.id) ?? [] });
        }
      }
      return { section, items, tops };
    });
  }, [visible]);

  const allSections = useMemo(
    () => Array.from(new Set(rows.map((r) => r.section_number?.trim()).filter(Boolean))) as string[],
    [rows],
  );

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
    if (!confirm(`Delete question ${q.question_number}? Any sub-questions will become top-level.`)) return;
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

  async function removeSection(section: string) {
    const list = rows.filter((r) => (r.section_number?.trim() || "Unsectioned") === section);
    if (!list.length) return;
    if (!confirm(`Delete ALL ${list.length} questions in section "${section}"? This cannot be undone.`)) return;
    const { error } = await supabase.from("question_records").delete().in("id", list.map((r) => r.id));
    if (error) return toast.error(error.message);
    toast.success(`Deleted section "${section}"`);
    qc.invalidateQueries({ queryKey: ["olympus-questions", missionId] });
  }

  async function reorderTops(section: string, newOrder: QRow[]) {
    // Persist sort_order based on new array index. Re-number from 10, step 10.
    const updates = newOrder.map((r, idx) => ({ id: r.id, sort_order: (idx + 1) * 10 }));
    // Optimistic
    qc.setQueryData(["olympus-questions", missionId], (old: QRow[] | undefined) => {
      if (!old) return old;
      const map = new Map(updates.map((u) => [u.id, u.sort_order]));
      return old.map((r) => (map.has(r.id) ? { ...r, sort_order: map.get(r.id)! } : r));
    });
    for (const u of updates) {
      // eslint-disable-next-line no-await-in-loop
      await supabase.from("question_records").update({ sort_order: u.sort_order }).eq("id", u.id);
    }
    void section;
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
            Edit, add, delete, reorder, and re-section every question in this mission. Drag the handle to reorder; nest sub-questions under a parent.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button onClick={() => setBulkOpen(true)}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-surface-hover">
              Bulk edit ({selected.size})
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
        <div className="ml-2 inline-flex rounded-md border border-border bg-background p-0.5 text-xs">
          <button
            onClick={() => setViewMode("sections")}
            className={`inline-flex items-center gap-1 rounded px-2 py-1 ${viewMode === "sections" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}
          >
            <FolderTree className="h-3 w-3" /> Sections
          </button>
          <button
            onClick={() => setViewMode("flat")}
            className={`inline-flex items-center gap-1 rounded px-2 py-1 ${viewMode === "flat" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}
          >
            <List className="h-3 w-3" /> Flat
          </button>
        </div>
        <div className="ml-auto text-[11px] text-muted-foreground">{visible.length} of {rows.length}</div>
      </div>

      {isLoading ? (
        <div className="rounded-[10px] border border-border bg-surface p-4 space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-10 w-full" />)}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-[10px] border border-border bg-surface p-10 text-center text-sm text-muted-foreground">
          <FileText className="mx-auto mb-2 h-6 w-6 opacity-60" />
          No questions match. Upload an RFP in the Vault to auto-parse questions, or add one manually.
        </div>
      ) : viewMode === "sections" ? (
        <div className="space-y-4">
          {grouped.map((g) => (
            <SectionBlock
              key={g.section}
              section={g.section}
              tops={g.tops}
              allRows={rows}
              writers={writers}
              smes={smes}
              selected={selected}
              onToggleSel={toggleSel}
              onPatch={patch}
              onEdit={setEditing}
              onRename={() => setRenameSection(g.section)}
              onDeleteSection={() => removeSection(g.section)}
              onRemove={remove}
              onReorder={(arr) => reorderTops(g.section, arr)}
            />
          ))}
        </div>
      ) : (
        <FlatTable
          visible={visible}
          writers={writers}
          smes={smes}
          selected={selected}
          onToggleSel={toggleSel}
          onSelectAll={selectAll}
          onPatch={patch}
          onEdit={setEditing}
          onRemove={remove}
        />
      )}

      {addOpen && (
        <AddQuestionModal
          missionId={missionId}
          nextNumber={`${rows.length + 1}`}
          existingSections={allSections}
          possibleParents={rows}
          onClose={() => setAddOpen(false)}
          onSaved={() => { qc.invalidateQueries({ queryKey: ["olympus-questions", missionId] }); setAddOpen(false); }}
        />
      )}

      {editing && (
        <EditQuestionModal
          q={editing}
          missionId={missionId}
          existingSections={allSections}
          possibleParents={rows.filter((r) => r.id !== editing.id)}
          onClose={() => setEditing(null)}
          onSaved={() => { qc.invalidateQueries({ queryKey: ["olympus-questions", missionId] }); setEditing(null); }}
        />
      )}

      {renameSection !== null && (
        <RenameSectionModal
          missionId={missionId}
          currentName={renameSection}
          affected={rows.filter((r) => (r.section_number?.trim() || "Unsectioned") === renameSection).length}
          onClose={() => setRenameSection(null)}
          onSaved={() => { qc.invalidateQueries({ queryKey: ["olympus-questions", missionId] }); setRenameSection(null); }}
        />
      )}

      {bulkOpen && (
        <BulkAssignModal
          selectedIds={Array.from(selected)}
          writers={writers}
          smes={smes}
          sections={allSections}
          parents={rows.filter((r) => !selected.has(r.id))}
          onClose={() => setBulkOpen(false)}
          onDone={() => { qc.invalidateQueries({ queryKey: ["olympus-questions", missionId] }); setSelected(new Set()); setBulkOpen(false); }}
        />
      )}
    </div>
  );
}

/* ---------------- Section block (drag-to-reorder) ---------------- */

function SectionBlock({
  section, tops, writers, smes, selected, onToggleSel, onPatch, onEdit, onRename, onDeleteSection, onRemove, onReorder,
}: {
  section: string;
  tops: Array<{ row: QRow; children: QRow[] }>;
  allRows: QRow[];
  writers: Member[];
  smes: Member[];
  selected: Set<string>;
  onToggleSel: (id: string) => void;
  onPatch: (q: QRow, fields: Partial<QRow>) => void;
  onEdit: (q: QRow) => void;
  onRename: () => void;
  onDeleteSection: () => void;
  onRemove: (q: QRow) => void;
  onReorder: (newOrder: QRow[]) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = tops.map((t) => t.row.id);

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = ids.indexOf(String(active.id));
    const newIdx = ids.indexOf(String(over.id));
    if (oldIdx === -1 || newIdx === -1) return;
    const moved = arrayMove(tops.map((t) => t.row), oldIdx, newIdx);
    onReorder(moved);
  }

  return (
    <div className="rounded-[10px] border border-border bg-surface overflow-hidden">
      <div className="flex items-center justify-between border-b border-border bg-surface-hover px-4 py-2.5">
        <div className="flex items-center gap-2">
          <FolderTree className="h-3.5 w-3.5 text-muted-foreground" />
          <div className="text-sm font-semibold">{section}</div>
          <div className="text-[11px] text-muted-foreground">· {tops.reduce((acc, t) => acc + 1 + t.children.length, 0)} questions</div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onRename} className="rounded-md p-1.5 text-muted-foreground hover:bg-background hover:text-foreground" title="Rename section">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button onClick={onDeleteSection} className="rounded-md p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-400" title="Delete entire section">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div className="divide-y divide-border">
            {tops.map(({ row, children }) => (
              <SortableRow
                key={row.id}
                row={row}
                children={children}
                writers={writers}
                smes={smes}
                selected={selected}
                onToggleSel={onToggleSel}
                onPatch={onPatch}
                onEdit={onEdit}
                onRemove={onRemove}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function SortableRow(props: {
  row: QRow;
  children: QRow[];
  writers: Member[];
  smes: Member[];
  selected: Set<string>;
  onToggleSel: (id: string) => void;
  onPatch: (q: QRow, fields: Partial<QRow>) => void;
  onEdit: (q: QRow) => void;
  onRemove: (q: QRow) => void;
}) {
  const { row, children, writers, smes, selected, onToggleSel, onPatch, onEdit, onRemove } = props;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="bg-surface">
      <Row
        q={row}
        writers={writers}
        smes={smes}
        selected={selected.has(row.id)}
        onToggleSel={() => onToggleSel(row.id)}
        onPatch={(f) => onPatch(row, f)}
        onEdit={() => onEdit(row)}
        onRemove={() => onRemove(row)}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
      {children.map((c) => (
        <Row
          key={c.id}
          q={c}
          writers={writers}
          smes={smes}
          selected={selected.has(c.id)}
          onToggleSel={() => onToggleSel(c.id)}
          onPatch={(f) => onPatch(c, f)}
          onEdit={() => onEdit(c)}
          onRemove={() => onRemove(c)}
          isChild
        />
      ))}
    </div>
  );
}

/* ---------------- Single row (used both views) ---------------- */

function Row({
  q, writers, smes, selected, onToggleSel, onPatch, onEdit, onRemove, dragHandleProps, isChild,
}: {
  q: QRow;
  writers: Member[];
  smes: Member[];
  selected: boolean;
  onToggleSel: () => void;
  onPatch: (fields: Partial<QRow>) => void;
  onEdit: () => void;
  onRemove: () => void;
  dragHandleProps?: any;
  isChild?: boolean;
}) {
  return (
    <div className={`flex items-start gap-2 px-2 py-2 hover:bg-surface-hover ${selected ? "bg-primary/5" : ""} ${isChild ? "pl-10 border-l-2 border-l-primary/20" : ""}`}>
      {dragHandleProps ? (
        <button {...dragHandleProps} className="mt-1.5 cursor-grab touch-none text-muted-foreground hover:text-foreground" title="Drag to reorder">
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      ) : (
        <span className="mt-1.5 inline-block w-3.5"><CornerDownRight className="h-3.5 w-3.5 text-muted-foreground" /></span>
      )}
      <button onClick={onToggleSel} className="mt-1.5 text-muted-foreground hover:text-foreground">
        {selected ? <CheckSquare className="h-3.5 w-3.5 text-primary" /> : <Square className="h-3.5 w-3.5" />}
      </button>
      <div className="w-16 mt-1 font-mono text-[11px] text-muted-foreground shrink-0">{q.question_number}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <div className="text-sm font-medium truncate">{q.title}</div>
          <button onClick={onEdit} className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground" title="Edit">
            <Pencil className="h-3 w-3" />
          </button>
        </div>
        {q.question_text && <div className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2">{q.question_text}</div>}
      </div>
      <div className="w-32 shrink-0">
        <SelectMember value={q.assigned_writer_id} members={writers} onChange={(v) => onPatch({ assigned_writer_id: v })} placeholder="Writer" />
      </div>
      <div className="w-32 shrink-0">
        <SelectMember value={q.assigned_sme_id} members={smes} onChange={(v) => onPatch({ assigned_sme_id: v })} placeholder="SME" />
      </div>
      <div className="w-32 shrink-0">
        <input type="date" value={q.pens_down_date ?? ""}
          onChange={(e) => onPatch({ pens_down_date: e.target.value || null })}
          className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs" />
        {q.pens_down_date && <div className="mt-0.5"><PensDownCountdown date={q.pens_down_date} /></div>}
      </div>
      <div className="w-32 shrink-0">
        <select value={q.status ?? "not_started"} onChange={(e) => onPatch({ status: e.target.value as Status })}
          className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs">
          {STATUS.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
        </select>
      </div>
      <button onClick={onRemove} className="mt-1 rounded-md p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-400" title="Delete question">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/* ---------------- Flat table (the original) ---------------- */

function FlatTable({
  visible, writers, smes, selected, onToggleSel, onSelectAll, onPatch, onEdit, onRemove,
}: {
  visible: QRow[]; writers: Member[]; smes: Member[]; selected: Set<string>;
  onToggleSel: (id: string) => void; onSelectAll: () => void;
  onPatch: (q: QRow, fields: Partial<QRow>) => void;
  onEdit: (q: QRow) => void; onRemove: (q: QRow) => void;
}) {
  return (
    <div className="rounded-[10px] border border-border bg-surface overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-surface-hover text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            <tr>
              <th className="px-3 py-3 w-8">
                <button onClick={onSelectAll} className="text-muted-foreground hover:text-foreground">
                  {selected.size === visible.length && visible.length > 0 ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
                </button>
              </th>
              <th className="px-3 py-3 text-left w-20">Q#</th>
              <th className="px-3 py-3 text-left">Title</th>
              <th className="px-3 py-3 text-left w-32">Writer</th>
              <th className="px-3 py-3 text-left w-32">SME</th>
              <th className="px-3 py-3 text-left w-32">Pens Down</th>
              <th className="px-3 py-3 text-left w-32">Status</th>
              <th className="px-3 py-3 w-16" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visible.map((q) => (
              <tr key={q.id} className={`hover:bg-surface-hover ${selected.has(q.id) ? "bg-primary/5" : ""}`}>
                <td className="px-3 py-2">
                  <button onClick={() => onToggleSel(q.id)} className="text-muted-foreground hover:text-foreground">
                    {selected.has(q.id) ? <CheckSquare className="h-3.5 w-3.5 text-primary" /> : <Square className="h-3.5 w-3.5" />}
                  </button>
                </td>
                <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">{q.question_number}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate max-w-md">{q.title}</span>
                    <button onClick={() => onEdit(q)} className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground">
                      <Pencil className="h-3 w-3" />
                    </button>
                  </div>
                  {q.section_number && <div className="text-[10px] text-muted-foreground">§ {q.section_number}{q.parent_question_id ? " · sub-question" : ""}</div>}
                </td>
                <td className="px-3 py-2"><SelectMember value={q.assigned_writer_id} members={writers} onChange={(v) => onPatch(q, { assigned_writer_id: v })} /></td>
                <td className="px-3 py-2"><SelectMember value={q.assigned_sme_id} members={smes} onChange={(v) => onPatch(q, { assigned_sme_id: v })} /></td>
                <td className="px-3 py-2">
                  <input type="date" value={q.pens_down_date ?? ""}
                    onChange={(e) => onPatch(q, { pens_down_date: e.target.value || null })}
                    className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs" />
                </td>
                <td className="px-3 py-2">
                  <select value={q.status ?? "not_started"} onChange={(e) => onPatch(q, { status: e.target.value as Status })}
                    className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs">
                    {STATUS.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2 text-right">
                  <button onClick={() => onRemove(q)} className="rounded-md p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-400">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SelectMember({ value, members, onChange, placeholder }: { value: string | null; members: Member[]; onChange: (v: string | null) => void; placeholder?: string }) {
  return (
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}
      className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs">
      <option value="">{placeholder ?? "Unassigned"}</option>
      {members.map((m) => (
        <option key={m.user_id} value={m.user_id}>{m.profile?.display_name ?? m.profile?.email ?? m.user_id.slice(0,8)}</option>
      ))}
    </select>
  );
}

/* ---------------- Modals ---------------- */

function AddQuestionModal({ missionId, nextNumber, existingSections, possibleParents, onClose, onSaved }: {
  missionId: string; nextNumber: string; existingSections: string[]; possibleParents: QRow[];
  onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    question_number: nextNumber, title: "", question_text: "", section_number: "",
    page_limit: "", evaluation_weight: "", parent_question_id: "",
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
      parent_question_id: form.parent_question_id || null,
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
    <ModalShell title="Add Question" onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <Field label="Number">
            <input value={form.question_number} onChange={(e) => setForm({ ...form, question_number: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
          </Field>
          <Field label="Section">
            <input list="qsections" value={form.section_number} onChange={(e) => setForm({ ...form, section_number: e.target.value })}
              placeholder="e.g. 2.1"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
            <datalist id="qsections">{existingSections.map((s) => <option key={s} value={s} />)}</datalist>
          </Field>
          <Field label="Pages">
            <input type="number" value={form.page_limit} onChange={(e) => setForm({ ...form, page_limit: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
          </Field>
        </div>
        <Field label="Parent question (for sub-questions)">
          <select value={form.parent_question_id} onChange={(e) => setForm({ ...form, parent_question_id: e.target.value })}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
            <option value="">— Top-level question —</option>
            {possibleParents.filter((p) => !p.parent_question_id).map((p) => (
              <option key={p.id} value={p.id}>{p.question_number} · {p.title}</option>
            ))}
          </select>
        </Field>
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
        <footer className="mt-2 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-surface-hover">Cancel</button>
          <button type="submit" disabled={busy} className="rounded-lg bg-[#C49A22] px-4 py-2 text-sm font-semibold text-black hover:bg-[#D4AA32] disabled:opacity-50">
            {busy ? "Adding…" : "Add Question"}
          </button>
        </footer>
      </form>
    </ModalShell>
  );
}

function EditQuestionModal({ q, missionId, existingSections, possibleParents, onClose, onSaved }: {
  q: QRow; missionId: string; existingSections: string[]; possibleParents: QRow[];
  onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    question_number: q.question_number,
    title: q.title,
    question_text: q.question_text ?? "",
    section_number: q.section_number ?? "",
    page_limit: q.page_limit?.toString() ?? "",
    evaluation_weight: q.evaluation_weight?.toString() ?? "",
    parent_question_id: q.parent_question_id ?? "",
  });
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.question_text.trim()) return toast.error("Title and question text are required");
    setBusy(true);
    const { error } = await supabase.from("question_records").update({
      question_number: form.question_number.trim(),
      title: form.title.trim(),
      question_text: form.question_text.trim(),
      section_number: form.section_number.trim() || null,
      page_limit: form.page_limit ? Number(form.page_limit) : null,
      evaluation_weight: form.evaluation_weight ? Number(form.evaluation_weight) : null,
      parent_question_id: form.parent_question_id || null,
    }).eq("id", q.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Question updated");
    await logOlympusAction({
      action_type: "question.update",
      action_summary: `Edited question ${form.question_number} — ${form.title}`,
      mission_id: missionId,
      target_table: "question_records",
      target_id: q.id,
    });
    onSaved();
  }
  return (
    <ModalShell title={`Edit ${q.question_number}`} onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <Field label="Number">
            <input value={form.question_number} onChange={(e) => setForm({ ...form, question_number: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
          </Field>
          <Field label="Section">
            <input list="qsections-edit" value={form.section_number} onChange={(e) => setForm({ ...form, section_number: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
            <datalist id="qsections-edit">{existingSections.map((s) => <option key={s} value={s} />)}</datalist>
          </Field>
          <Field label="Pages">
            <input type="number" value={form.page_limit} onChange={(e) => setForm({ ...form, page_limit: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
          </Field>
        </div>
        <Field label="Parent question (nest as sub-question)">
          <select value={form.parent_question_id} onChange={(e) => setForm({ ...form, parent_question_id: e.target.value })}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
            <option value="">— Top-level question —</option>
            {possibleParents.filter((p) => !p.parent_question_id).map((p) => (
              <option key={p.id} value={p.id}>{p.question_number} · {p.title}</option>
            ))}
          </select>
        </Field>
        <Field label="Title">
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
        </Field>
        <Field label="Question text">
          <textarea value={form.question_text} onChange={(e) => setForm({ ...form, question_text: e.target.value })} rows={6}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
        </Field>
        <Field label="Evaluation weight">
          <input type="number" step="0.1" value={form.evaluation_weight} onChange={(e) => setForm({ ...form, evaluation_weight: e.target.value })}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
        </Field>
        <footer className="mt-2 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-surface-hover">Cancel</button>
          <button type="submit" disabled={busy} className="rounded-lg bg-[#C49A22] px-4 py-2 text-sm font-semibold text-black hover:bg-[#D4AA32] disabled:opacity-50">
            {busy ? "Saving…" : "Save"}
          </button>
        </footer>
      </form>
    </ModalShell>
  );
}

function RenameSectionModal({ missionId, currentName, affected, onClose, onSaved }: {
  missionId: string; currentName: string; affected: number; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState(currentName === "Unsectioned" ? "" : currentName);
  const [busy, setBusy] = useState(false);
  async function apply() {
    setBusy(true);
    const newVal = name.trim() || null;
    const filter = currentName === "Unsectioned"
      ? supabase.from("question_records").update({ section_number: newVal }).eq("mission_id", missionId).is("section_number", null)
      : supabase.from("question_records").update({ section_number: newVal }).eq("mission_id", missionId).eq("section_number", currentName);
    const { error } = await filter;
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Renamed section (${affected} questions)`);
    onSaved();
  }
  return (
    <ModalShell title={`Rename section "${currentName}"`} onClose={onClose}>
      <p className="text-xs text-muted-foreground">This will update {affected} question{affected === 1 ? "" : "s"}.</p>
      <Field label="New section number / name">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Leave blank for Unsectioned"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
      </Field>
      <footer className="mt-2 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-surface-hover">Cancel</button>
        <button onClick={apply} disabled={busy} className="rounded-lg bg-[#C49A22] px-4 py-2 text-sm font-semibold text-black hover:bg-[#D4AA32] disabled:opacity-50">
          {busy ? "Saving…" : "Rename"}
        </button>
      </footer>
    </ModalShell>
  );
}

function BulkAssignModal({ selectedIds, writers, smes, sections, parents, onClose, onDone }: {
  selectedIds: string[]; writers: Member[]; smes: Member[]; sections: string[]; parents: QRow[];
  onClose: () => void; onDone: () => void;
}) {
  const [writer, setWriter] = useState<string>("");
  const [sme, setSme] = useState<string>("");
  const [pensDown, setPensDown] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [section, setSection] = useState<string>("");
  const [parent, setParent] = useState<string>("");
  const [busy, setBusy] = useState(false);

  async function apply() {
    const update: any = {};
    if (writer) update.assigned_writer_id = writer === "__clear__" ? null : writer;
    if (sme) update.assigned_sme_id = sme === "__clear__" ? null : sme;
    if (pensDown) update.pens_down_date = pensDown;
    if (status) update.status = status;
    if (section) update.section_number = section === "__clear__" ? null : section;
    if (parent) update.parent_question_id = parent === "__clear__" ? null : parent;
    if (Object.keys(update).length === 0) return toast.message("Nothing to change");
    setBusy(true);
    const { error } = await supabase.from("question_records").update(update).in("id", selectedIds);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Updated ${selectedIds.length} questions`);
    onDone();
  }

  return (
    <ModalShell title={`Update ${selectedIds.length} Questions`} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Move to section">
          <input list="qsections-bulk" value={section} onChange={(e) => setSection(e.target.value)}
            placeholder="— don't change — (type __clear__ to remove)"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
          <datalist id="qsections-bulk">{sections.map((s) => <option key={s} value={s} />)}</datalist>
        </Field>
        <Field label="Nest under parent question">
          <select value={parent} onChange={(e) => setParent(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
            <option value="">— don't change —</option>
            <option value="__clear__">Clear (make top-level)</option>
            {parents.filter((p) => !p.parent_question_id).map((p) => (
              <option key={p.id} value={p.id}>{p.question_number} · {p.title}</option>
            ))}
          </select>
        </Field>
        <Field label="Writer">
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
    </ModalShell>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div onClick={(e) => e.stopPropagation()} className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-[10px] border border-border bg-surface p-6">
        <button type="button" onClick={onClose} className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-surface-hover">
          <X className="h-4 w-4" />
        </button>
        <div className="h2-label" style={{ letterSpacing: "0.32em" }}>Questions</div>
        <h2 className="mt-1 mb-4 text-lg font-semibold">{title}</h2>
        {children}
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
  const header = ["Q#", "Title", "Section", "Parent Q#", "Status", "Writer", "SME", "Pens Down", "Pages", "Weight", "Health"];
  const lines = [header.join(",")];
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const r of rows) {
    const parent = r.parent_question_id ? byId.get(r.parent_question_id)?.question_number ?? "" : "";
    const cells = [
      r.question_number, r.title, r.section_number ?? "", parent, r.status ?? "",
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
