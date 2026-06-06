import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ChevronDown,
  AlertTriangle,
  Clock,
  Check,
  X,
  Users,
  Calendar,
  CircleDot,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/missions/$missionId/sections/")({
  component: SectionsTrackerPage,
});

// ── TYPES ────────────────────────────────────────────────
type Section = {
  id: string;
  mission_id: string;
  question_number: string;
  section_number: string | null;
  title: string;
  status: string | null;
  health: "red" | "yellow" | "green" | null;
  pens_down_date: string | null;
  assigned_writer_id: string | null;
  created_at: string;
  win_theme_alignment_score: number | null;
  iris_risk_flag: string | null;
  iris_risk_flag_text: string | null;
};

type Profile = {
  id: string;
  display_name: string | null;
  email: string | null;
};

type Member = {
  user_id: string;
  role: string;
};

// ── STATUS MAP ───────────────────────────────────────────
const STATUS_OPTIONS: Array<{ ui: string; db: string }> = [
  { ui: "Not Started", db: "not_started" },
  { ui: "In Progress", db: "in_progress" },
  { ui: "Draft Done", db: "draft_done" },
  { ui: "In Review", db: "ready_for_review" },
  { ui: "Approved", db: "approved" },
  { ui: "Blocked", db: "blocked" },
];

function statusUiLabel(db: string | null | undefined): string {
  const match = STATUS_OPTIONS.find((s) => s.db === db);
  if (match) return match.ui;
  if (!db || db === "not_started") return "Not Started";
  return db.replace(/_/g, " ");
}

function statusPillClass(db: string | null | undefined): string {
  const v = db ?? "not_started";
  if (v === "in_progress") return "bg-sky-500/10 text-sky-300 border-sky-500/25";
  if (v === "draft_done") return "bg-indigo-500/10 text-indigo-300 border-indigo-500/25";
  if (v === "ready_for_review") return "bg-amber-500/10 text-amber-300 border-amber-500/25";
  if (v === "approved") return "bg-emerald-500/10 text-emerald-300 border-emerald-500/25";
  if (v === "blocked") return "bg-red-500/10 text-red-300 border-red-500/25";
  return "bg-muted/40 text-muted-foreground border-border";
}

function isCompleteStatus(db: string | null | undefined): boolean {
  return db === "approved";
}
function isInProgressStatus(db: string | null | undefined): boolean {
  return db === "in_progress" || db === "draft_done" || db === "ready_for_review";
}

function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const d = new Date(date).getTime();
  return Math.ceil((d - Date.now()) / (1000 * 60 * 60 * 24));
}
function hoursSince(date: string): number {
  return (Date.now() - new Date(date).getTime()) / (1000 * 60 * 60);
}
function fmtDate(date: string | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Compute the "effective" IRIS risk flag, including the client-side
// "unassigned > 72h" implicit flag.
function effectiveFlag(s: Section): { flag: string; text: string } | null {
  if (s.iris_risk_flag) {
    return { flag: s.iris_risk_flag, text: s.iris_risk_flag_text ?? s.iris_risk_flag };
  }
  if (!s.assigned_writer_id && hoursSince(s.created_at) > 72) {
    return {
      flag: "unassigned_stale",
      text: "Unassigned — section has no owner.",
    };
  }
  return null;
}

// ══════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════
function SectionsTrackerPage() {
  const { missionId } = Route.useParams();
  const qc = useQueryClient();

  // Me
  const { data: me } = useQuery({
    queryKey: ["sections-me"],
    queryFn: async () => (await supabase.auth.getUser()).data.user?.id ?? null,
  });

  // My role on this mission
  const { data: myRole } = useQuery({
    queryKey: ["sections-mission-role", missionId, me],
    enabled: !!me,
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_members")
        .select("role")
        .eq("mission_id", missionId)
        .eq("user_id", me!)
        .maybeSingle();
      return (data?.role ?? "writer") as string;
    },
  });
  const canBulkEdit = ["pm", "lead", "admin"].includes(myRole ?? "");

  // All sections for the mission
  const { data: sections = [], isLoading } = useQuery({
    queryKey: ["sections-tracker", missionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("question_records")
        .select(
          "id,mission_id,question_number,section_number,title,status,health,pens_down_date,assigned_writer_id,created_at,win_theme_alignment_score,iris_risk_flag,iris_risk_flag_text"
        )
        .eq("mission_id", missionId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Section[];
    },
  });

  // Mission members (for owner filter + assign)
  const { data: members = [] } = useQuery({
    queryKey: ["sections-mission-members", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_members")
        .select("user_id,role")
        .eq("mission_id", missionId);
      return (data ?? []) as Member[];
    },
  });

  // Profile lookup for everyone referenced
  const ownerIds = useMemo(() => {
    const ids = new Set<string>();
    sections.forEach((s) => s.assigned_writer_id && ids.add(s.assigned_writer_id));
    members.forEach((m) => ids.add(m.user_id));
    return Array.from(ids);
  }, [sections, members]);

  const { data: profiles = [] } = useQuery({
    queryKey: ["sections-profiles", ownerIds.join(",")],
    enabled: ownerIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id,display_name,email")
        .in("id", ownerIds);
      return (data ?? []) as Profile[];
    },
  });
  const profileById = useMemo(
    () => new Map(profiles.map((p) => [p.id, p])),
    [profiles]
  );

  // ── FILTERS ─────────────────────────────────────────────
  const [ownerFilter, setOwnerFilter] = useState<string>("all"); // user_id | "all" | "unassigned"
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dueFilter, setDueFilter] = useState<string>("all"); // all | overdue | week | month

  const filtered = useMemo(() => {
    let list = sections;
    if (ownerFilter === "unassigned") list = list.filter((s) => !s.assigned_writer_id);
    else if (ownerFilter !== "all") list = list.filter((s) => s.assigned_writer_id === ownerFilter);
    if (statusFilter !== "all") list = list.filter((s) => (s.status ?? "not_started") === statusFilter);
    if (dueFilter !== "all") {
      list = list.filter((s) => {
        const d = daysUntil(s.pens_down_date);
        if (d === null) return false;
        if (dueFilter === "overdue") return d < 0;
        if (dueFilter === "week") return d >= 0 && d <= 7;
        if (dueFilter === "month") return d >= 0 && d <= 30;
        return true;
      });
    }
    return list;
  }, [sections, ownerFilter, statusFilter, dueFilter]);

  // ── SUMMARY ─────────────────────────────────────────────
  const summary = useMemo(() => {
    const total = sections.length;
    let complete = 0,
      inProgress = 0,
      notStarted = 0;
    for (const s of sections) {
      if (isCompleteStatus(s.status)) complete++;
      else if (isInProgressStatus(s.status)) inProgress++;
      else notStarted++;
    }
    const pct = total > 0 ? Math.round((complete / total) * 100) : 0;
    return { total, complete, inProgress, notStarted, pct };
  }, [sections]);

  // ── SELECTION ───────────────────────────────────────────
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const visibleIds = useMemo(() => filtered.map((s) => s.id), [filtered]);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAllVisible() {
    if (allVisibleSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        visibleIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        visibleIds.forEach((id) => next.add(id));
        return next;
      });
    }
  }
  function clearSelection() {
    setSelected(new Set());
  }

  // ── BULK ACTIONS ────────────────────────────────────────
  async function bulkAssign(userId: string | null) {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    const { error } = await supabase
      .from("question_records")
      .update({ assigned_writer_id: userId })
      .in("id", ids);
    if (error) return toast.error(error.message);
    toast.success(`${ids.length} sections ${userId ? "assigned" : "unassigned"}`);
    qc.invalidateQueries({ queryKey: ["sections-tracker", missionId] });
    clearSelection();
  }
  async function bulkStatus(db: string) {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    const { error } = await supabase
      .from("question_records")
      .update({ status: db })
      .in("id", ids);
    if (error) return toast.error(error.message);
    toast.success(`${ids.length} sections → ${statusUiLabel(db)}`);
    qc.invalidateQueries({ queryKey: ["sections-tracker", missionId] });
    clearSelection();
  }
  async function bulkDueDate(date: string | null) {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    const { error } = await supabase
      .from("question_records")
      .update({ pens_down_date: date })
      .in("id", ids);
    if (error) return toast.error(error.message);
    toast.success(`${ids.length} due dates updated`);
    qc.invalidateQueries({ queryKey: ["sections-tracker", missionId] });
    clearSelection();
  }

  // ── RENDER ──────────────────────────────────────────────
  return (
    <div className="mission-room-bg min-h-screen">
      <style>{`
        .mission-room-bg {
          background-color: #060b14;
          background-image: radial-gradient(circle, rgba(255,255,255,0.03) 1px, transparent 1px);
          background-size: 24px 24px;
        }
        .sec-label {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.25em;
          text-transform: uppercase;
          color: hsl(var(--muted-foreground));
        }
      `}</style>

      <div className="mx-auto max-w-[1200px] px-8 pt-10 pb-24 space-y-6">
        {/* Header */}
        <header className="space-y-2">
          <div className="sec-label">Sections Tracker</div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Master Tracker</h1>
          <p className="text-sm text-muted-foreground">
            Every section in this mission — owners, deadlines, status, IRIS alignment.
          </p>
        </header>

        {/* Summary strip + progress */}
        <section className="rounded-[12px] border border-border bg-card/40 px-5 py-4 space-y-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
            <span className="font-semibold text-foreground">{summary.total} sections</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-emerald-400">{summary.complete} complete</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-sky-300">{summary.inProgress} in progress</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">{summary.notStarted} not started</span>
            <span className="ml-auto text-xs text-muted-foreground">
              {summary.pct}% complete
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-white/[0.05] overflow-hidden">
            <div
              className="h-full bg-emerald-500/70 transition-all"
              style={{ width: `${summary.pct}%` }}
            />
          </div>
        </section>

        {/* Filter bar */}
        <section className="flex flex-wrap items-center gap-2">
          <FilterDropdown
            icon={<Users className="h-3.5 w-3.5" />}
            label="Owner"
            value={ownerFilter}
            onChange={setOwnerFilter}
            options={[
              { value: "all", label: "All Owners" },
              { value: "unassigned", label: "Unassigned" },
              ...members.map((m) => ({
                value: m.user_id,
                label:
                  profileById.get(m.user_id)?.display_name ??
                  profileById.get(m.user_id)?.email ??
                  m.user_id.slice(0, 8),
              })),
            ]}
          />
          <FilterDropdown
            icon={<CircleDot className="h-3.5 w-3.5" />}
            label="Status"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: "all", label: "All Statuses" },
              ...STATUS_OPTIONS.map((s) => ({ value: s.db, label: s.ui })),
            ]}
          />
          <FilterDropdown
            icon={<Calendar className="h-3.5 w-3.5" />}
            label="Due"
            value={dueFilter}
            onChange={setDueFilter}
            options={[
              { value: "all", label: "Any time" },
              { value: "overdue", label: "Overdue" },
              { value: "week", label: "Next 7 days" },
              { value: "month", label: "Next 30 days" },
            ]}
          />
          {(ownerFilter !== "all" || statusFilter !== "all" || dueFilter !== "all") && (
            <button
              type="button"
              onClick={() => {
                setOwnerFilter("all");
                setStatusFilter("all");
                setDueFilter("all");
              }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Reset
            </button>
          )}
          <div className="ml-auto text-xs text-muted-foreground">
            Showing {filtered.length} of {sections.length}
          </div>
        </section>

        {/* Bulk action bar */}
        {canBulkEdit && selected.size > 0 && (
          <BulkActionBar
            count={selected.size}
            members={members}
            profileById={profileById}
            onAssign={bulkAssign}
            onStatus={bulkStatus}
            onDueDate={bulkDueDate}
            onClear={clearSelection}
          />
        )}

        {/* Table */}
        {isLoading ? (
          <div className="rounded-[12px] border border-border bg-card/40 p-10 text-center text-sm text-muted-foreground">
            Loading sections…
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-[12px] border border-dashed border-border bg-card/20 p-10 text-center text-sm text-muted-foreground">
            No sections match the current filters.
          </div>
        ) : (
          <SectionsTable
            sections={filtered}
            profileById={profileById}
            missionId={missionId}
            selected={selected}
            allVisibleSelected={allVisibleSelected}
            canBulkEdit={canBulkEdit}
            onToggleRow={toggleRow}
            onToggleAll={toggleAllVisible}
          />
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// TABLE
// ══════════════════════════════════════════════════════════
function SectionsTable({
  sections,
  profileById,
  missionId,
  selected,
  allVisibleSelected,
  canBulkEdit,
  onToggleRow,
  onToggleAll,
}: {
  sections: Section[];
  profileById: Map<string, Profile>;
  missionId: string;
  selected: Set<string>;
  allVisibleSelected: boolean;
  canBulkEdit: boolean;
  onToggleRow: (id: string) => void;
  onToggleAll: () => void;
}) {
  return (
    <div className="rounded-[12px] border border-border bg-card/40 overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-[28px_60px_1fr_160px_110px_120px_90px_36px] items-center gap-3 px-4 py-2 border-b border-border text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
        <div>
          {canBulkEdit ? (
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={onToggleAll}
              className="h-3.5 w-3.5 rounded border-border cursor-pointer accent-primary"
              aria-label="Select all visible"
            />
          ) : null}
        </div>
        <div>#</div>
        <div>Section</div>
        <div>Owner</div>
        <div>Due</div>
        <div>Status</div>
        <div className="text-right">Align</div>
        <div></div>
      </div>

      <ul>
        {sections.map((s) => (
          <SectionRow
            key={s.id}
            s={s}
            profileById={profileById}
            missionId={missionId}
            isSelected={selected.has(s.id)}
            canBulkEdit={canBulkEdit}
            onToggle={() => onToggleRow(s.id)}
          />
        ))}
      </ul>
    </div>
  );
}

function SectionRow({
  s,
  profileById,
  missionId,
  isSelected,
  canBulkEdit,
  onToggle,
}: {
  s: Section;
  profileById: Map<string, Profile>;
  missionId: string;
  isSelected: boolean;
  canBulkEdit: boolean;
  onToggle: () => void;
}) {
  const owner = s.assigned_writer_id ? profileById.get(s.assigned_writer_id) ?? null : null;
  const pdDays = daysUntil(s.pens_down_date);
  const overdue = pdDays !== null && pdDays < 0 && !isCompleteStatus(s.status);
  const flag = effectiveFlag(s);
  const align = s.win_theme_alignment_score;

  return (
    <li
      className={`group grid grid-cols-[28px_60px_1fr_160px_110px_120px_90px_36px] items-center gap-3 px-4 py-3 border-b border-border last:border-b-0 hover:bg-white/[0.02] transition-colors ${
        isSelected ? "bg-primary/[0.04]" : ""
      }`}
    >
      {/* Checkbox (visible on hover or when selected) */}
      <div>
        {canBulkEdit && (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onToggle}
            className={`h-3.5 w-3.5 rounded border-border cursor-pointer accent-primary ${
              isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            }`}
            aria-label={`Select section ${s.question_number}`}
            onClick={(e) => e.stopPropagation()}
          />
        )}
      </div>

      {/* Section # */}
      <div className="font-mono text-xs text-muted-foreground">{s.question_number}</div>

      {/* Title — link to deep section workspace */}
      <Link
        to="/missions/$missionId/sections/$questionId"
        params={{ missionId, questionId: s.id }}
        className="min-w-0 text-[13px] font-medium text-foreground hover:underline truncate"
      >
        {s.section_number && (
          <span className="text-muted-foreground mr-2">{s.section_number}</span>
        )}
        {s.title || "Untitled section"}
      </Link>

      {/* Owner */}
      <div className="min-w-0">
        {owner ? (
          <div className="flex items-center gap-2 min-w-0">
            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
              {initialsOf(owner.display_name ?? owner.email)}
            </span>
            <span className="text-[12px] text-foreground truncate">
              {owner.display_name ?? owner.email ?? "—"}
            </span>
          </div>
        ) : (
          <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-300">
            Unassigned
          </span>
        )}
      </div>

      {/* Due */}
      <div
        className={`flex items-center gap-1 text-[11px] ${
          overdue ? "text-red-400 font-semibold" : "text-muted-foreground"
        }`}
      >
        {s.pens_down_date ? (
          <>
            {overdue ? <AlertTriangle size={12} /> : <Clock size={12} />}
            <span>{fmtDate(s.pens_down_date)}</span>
          </>
        ) : (
          <span>—</span>
        )}
      </div>

      {/* Status */}
      <div>
        <span
          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] ${statusPillClass(
            s.status
          )}`}
        >
          {statusUiLabel(s.status)}
        </span>
      </div>

      {/* Alignment % */}
      <div className="text-right text-[12px] tabular-nums">
        {align === null || align === undefined ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span
            className={
              align >= 80
                ? "text-emerald-400 font-semibold"
                : align >= 50
                ? "text-amber-300 font-semibold"
                : "text-red-400 font-semibold"
            }
          >
            {Math.round(align)}%
          </span>
        )}
      </div>

      {/* IRIS risk flag */}
      <div className="flex justify-center">
        {flag ? (
          <span
            title={flag.text}
            className="inline-flex h-5 w-5 items-center justify-center rounded text-amber-400 hover:bg-amber-500/10 cursor-help"
          >
            <AlertTriangle size={14} />
          </span>
        ) : null}
      </div>
    </li>
  );
}

function initialsOf(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ══════════════════════════════════════════════════════════
// FILTER DROPDOWN
// ══════════════════════════════════════════════════════════
function FilterDropdown({
  icon,
  label,
  value,
  onChange,
  options,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const current = options.find((o) => o.value === value)?.label ?? label;
  const isDefault = value === "all";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition ${
          isDefault
            ? "border-border bg-card text-muted-foreground hover:text-foreground"
            : "border-primary/40 bg-primary/10 text-primary"
        }`}
      >
        {icon}
        <span>{current}</span>
        <ChevronDown className="h-3 w-3 opacity-70" />
      </button>
      {open && (
        <div className="absolute left-0 top-[calc(100%+4px)] z-30 min-w-[200px] max-h-[280px] overflow-y-auto rounded-md border border-border bg-surface shadow-lg">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs hover:bg-surface-hover ${
                value === opt.value ? "text-foreground font-medium" : "text-muted-foreground"
              }`}
            >
              <span className="truncate">{opt.label}</span>
              {value === opt.value && <Check className="h-3 w-3 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// BULK ACTION BAR
// ══════════════════════════════════════════════════════════
function BulkActionBar({
  count,
  members,
  profileById,
  onAssign,
  onStatus,
  onDueDate,
  onClear,
}: {
  count: number;
  members: Member[];
  profileById: Map<string, Profile>;
  onAssign: (userId: string | null) => void;
  onStatus: (db: string) => void;
  onDueDate: (date: string | null) => void;
  onClear: () => void;
}) {
  const [openMenu, setOpenMenu] = useState<"assign" | "status" | "due" | null>(null);
  const [dueDraft, setDueDraft] = useState<string>("");
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!openMenu) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpenMenu(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [openMenu]);

  return (
    <div
      ref={ref}
      className="flex items-center gap-2 rounded-[10px] border border-primary/30 bg-primary/[0.06] px-4 py-2 text-sm"
    >
      <span className="text-foreground font-medium">{count} selected</span>
      <span className="text-muted-foreground">·</span>

      {/* Assign */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpenMenu(openMenu === "assign" ? null : "assign")}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1 text-xs text-foreground hover:bg-surface-hover"
        >
          Assign to… <ChevronDown className="h-3 w-3" />
        </button>
        {openMenu === "assign" && (
          <div className="absolute left-0 top-[calc(100%+4px)] z-30 min-w-[220px] max-h-[300px] overflow-y-auto rounded-md border border-border bg-surface shadow-lg">
            <button
              type="button"
              onClick={() => {
                onAssign(null);
                setOpenMenu(null);
              }}
              className="block w-full px-3 py-1.5 text-left text-xs text-muted-foreground hover:bg-surface-hover"
            >
              Unassign
            </button>
            <div className="border-t border-border" />
            {members.map((m) => {
              const p = profileById.get(m.user_id);
              return (
                <button
                  key={m.user_id}
                  type="button"
                  onClick={() => {
                    onAssign(m.user_id);
                    setOpenMenu(null);
                  }}
                  className="block w-full px-3 py-1.5 text-left text-xs text-foreground hover:bg-surface-hover truncate"
                >
                  {p?.display_name ?? p?.email ?? m.user_id.slice(0, 8)}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Status */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpenMenu(openMenu === "status" ? null : "status")}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1 text-xs text-foreground hover:bg-surface-hover"
        >
          Update status… <ChevronDown className="h-3 w-3" />
        </button>
        {openMenu === "status" && (
          <div className="absolute left-0 top-[calc(100%+4px)] z-30 min-w-[180px] rounded-md border border-border bg-surface shadow-lg">
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s.db}
                type="button"
                onClick={() => {
                  onStatus(s.db);
                  setOpenMenu(null);
                }}
                className="block w-full px-3 py-1.5 text-left text-xs text-foreground hover:bg-surface-hover"
              >
                {s.ui}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Due Date */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpenMenu(openMenu === "due" ? null : "due")}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1 text-xs text-foreground hover:bg-surface-hover"
        >
          Set due date <ChevronDown className="h-3 w-3" />
        </button>
        {openMenu === "due" && (
          <div className="absolute left-0 top-[calc(100%+4px)] z-30 rounded-md border border-border bg-surface shadow-lg p-3 space-y-2">
            <input
              type="date"
              value={dueDraft}
              onChange={(e) => setDueDraft(e.target.value)}
              className="rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  onDueDate(dueDraft || null);
                  setOpenMenu(null);
                  setDueDraft("");
                }}
                disabled={!dueDraft}
                className="rounded bg-primary px-2 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
              >
                Apply
              </button>
              <button
                type="button"
                onClick={() => {
                  onDueDate(null);
                  setOpenMenu(null);
                  setDueDraft("");
                }}
                className="rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
            </div>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onClear}
        className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <X className="h-3 w-3" /> Clear
      </button>
    </div>
  );
}
