import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  X,
  Search,
  Download,
  Loader2,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";

const GOLD = "#C9A84C";
const NAVY = "#1F3864";

type Question = {
  id: string;
  question_number: string | null;
  question_name: string | null;
  question_text: string | null;
  section: string | null;
  subsection: string | null;
  page_limit: number | null;
  requirements: any;
  evaluation_criteria: any;
};

type Assignment = {
  id?: string;
  question_id: string;
  mission_id: string;
  writer_name: string | null;
  athena_sme_name: string | null;
  client_sme_name: string | null;
  reviewer_name: string | null;
  copy_editor_name: string | null;
  workstream_lead: string | null;
  internal_deadline: string | null;
  status: string | null;
  risk_level: string | null;
  notes: string | null;
};

type TeamMember = {
  id: string;
  name: string;
  role: string | null;
};

type Row = {
  question: Question;
  assignment: Assignment;
};

const STATUS_OPTIONS = [
  "Unassigned",
  "Assigned",
  "In Progress",
  "Complete",
  "At Risk",
] as const;

const RISK_OPTIONS = ["None", "Low", "Medium", "High"] as const;

const ASSIGN_FIELDS = [
  { key: "writer_name", label: "Writer", inferred: "Writer" },
  { key: "athena_sme_name", label: "Athena SME", inferred: "SME" },
  { key: "client_sme_name", label: "Client SME", inferred: "SME" },
  { key: "reviewer_name", label: "Reviewer", inferred: "Reviewer" },
  { key: "copy_editor_name", label: "Copy Editor", inferred: "Copy Editor" },
] as const;

type AssignFieldKey = (typeof ASSIGN_FIELDS)[number]["key"];

function emptyAssignment(missionId: string, questionId: string): Assignment {
  return {
    question_id: questionId,
    mission_id: missionId,
    writer_name: null,
    athena_sme_name: null,
    client_sme_name: null,
    reviewer_name: null,
    copy_editor_name: null,
    workstream_lead: null,
    internal_deadline: null,
    status: null,
    risk_level: null,
    notes: null,
  };
}

export default function AssignmentReview({
  missionId,
  mode,
  onConfirm,
}: {
  missionId: string;
  mode: "wizard" | "tab";
  onConfirm?: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);

  // filters
  const [filterSection, setFilterSection] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterWriter, setFilterWriter] = useState("");
  const [search, setSearch] = useState("");
  const [unassignedOnly, setUnassignedOnly] = useState(false);

  const [drawerQid, setDrawerQid] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const reload = async () => {
    const [{ data: qData, error: qErr }, { data: aData }, { data: tData }] =
      await Promise.all([
        supabase
          .from("questions")
          .select(
            "id, question_number, question_name, question_text, section, subsection, page_limit, requirements, evaluation_criteria",
          )
          .eq("mission_id", missionId)
          .eq("architecture_version", "v2")
          .order("section", { ascending: true })
          .order("sort_order", { ascending: true }),
        supabase
          .from("question_assignments")
          .select("*")
          .eq("mission_id", missionId),
        supabase
          .from("mission_team_members")
          .select("id, name, role")
          .eq("mission_id", missionId)
          .eq("active", true)
          .order("name", { ascending: true }),
      ]);

    if (qErr) {
      toast.error(qErr.message);
      setLoading(false);
      return;
    }

    const aMap = new Map<string, Assignment>();
    (aData ?? []).forEach((a: any) =>
      aMap.set(a.question_id, a as Assignment),
    );

    const built: Row[] = (qData ?? []).map((q: any) => ({
      question: q as Question,
      assignment:
        aMap.get(q.id) ?? emptyAssignment(missionId, q.id),
    }));

    setRows(built);
    setTeam((tData ?? []) as TeamMember[]);
    setLoading(false);
  };

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      await reload();
      if (!alive) return;
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missionId]);

  // ---- persistence ----
  const persistAssignment = async (
    questionId: string,
    patch: Partial<Assignment>,
  ) => {
    const row = rows.find((r) => r.question.id === questionId);
    const merged = {
      ...emptyAssignment(missionId, questionId),
      ...(row?.assignment ?? {}),
      ...patch,
      question_id: questionId,
      mission_id: missionId,
      updated_at: new Date().toISOString(),
    };
    // local
    setRows((rs) =>
      rs.map((r) =>
        r.question.id === questionId
          ? { ...r, assignment: { ...r.assignment, ...patch } }
          : r,
      ),
    );
    const { error } = await supabase
      .from("question_assignments")
      .upsert(merged as never, { onConflict: "question_id" });
    if (error) toast.error(error.message);
  };

  const persistQuestion = async (
    questionId: string,
    patch: Partial<Question>,
  ) => {
    setRows((rs) =>
      rs.map((r) =>
        r.question.id === questionId
          ? { ...r, question: { ...r.question, ...patch } }
          : r,
      ),
    );
    const { error } = await supabase
      .from("questions")
      .update({
        ...patch,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", questionId);
    if (error) toast.error(error.message);
  };

  const upsertTeamMember = async (name: string, inferredRole: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (team.some((t) => t.name.toLowerCase() === trimmed.toLowerCase())) return;
    const { data, error } = await supabase
      .from("mission_team_members")
      .upsert(
        {
          mission_id: missionId,
          name: trimmed,
          role: inferredRole,
          source: "manual",
          active: true,
        } as never,
        { onConflict: "mission_id,name" },
      )
      .select("id, name, role")
      .maybeSingle();
    if (error) {
      console.warn("team upsert failed", error);
      return;
    }
    if (data) setTeam((ts) => [...ts, data as TeamMember]);
  };

  // ---- derived ----
  const sections = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) =>
      set.add((r.question.section || "Unsorted").trim() || "Unsorted"),
    );
    return Array.from(set).sort();
  }, [rows]);

  const writers = useMemo(() => {
    const set = new Set<string>();
    team.forEach((t) => set.add(t.name));
    rows.forEach((r) => {
      if (r.assignment.writer_name) set.add(r.assignment.writer_name);
    });
    return Array.from(set).sort();
  }, [team, rows]);

  const filtered = useMemo(() => {
    const f = search.trim().toLowerCase();
    return rows.filter((r) => {
      const sec = (r.question.section || "Unsorted").trim() || "Unsorted";
      if (filterSection && sec !== filterSection) return false;
      if (filterStatus && (r.assignment.status || "") !== filterStatus)
        return false;
      if (filterWriter && (r.assignment.writer_name || "") !== filterWriter)
        return false;
      if (unassignedOnly && r.assignment.writer_name) return false;
      if (f) {
        const hay = [r.question.question_number, r.question.question_name]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(f)) return false;
      }
      return true;
    });
  }, [rows, filterSection, filterStatus, filterWriter, unassignedOnly, search]);

  // ---- counts ----
  const total = rows.length;
  const unassigned = rows.filter((r) => !r.assignment.writer_name).length;
  const atRisk = rows.filter(
    (r) =>
      r.assignment.risk_level === "High" || r.assignment.status === "At Risk",
  ).length;
  const complete = rows.filter((r) => r.assignment.status === "Complete").length;

  // ---- CSV export ----
  const exportCsv = () => {
    const cols = [
      "Question #",
      "Question",
      "Section",
      "Writer",
      "Athena SME",
      "Client SME",
      "Reviewer",
      "Copy Editor",
      "Status",
      "Risk",
      "Due",
    ];
    const escape = (s: any) => {
      const v = s == null ? "" : String(s);
      if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
      return v;
    };
    const lines = [cols.join(",")];
    for (const r of filtered) {
      lines.push(
        [
          r.question.question_number,
          r.question.question_name,
          r.question.section,
          r.assignment.writer_name,
          r.assignment.athena_sme_name,
          r.assignment.client_sme_name,
          r.assignment.reviewer_name,
          r.assignment.copy_editor_name,
          r.assignment.status,
          r.assignment.risk_level,
          r.assignment.internal_deadline,
        ]
          .map(escape)
          .join(","),
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `assignments-${missionId.slice(0, 8)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      const { error } = await supabase
        .from("missions")
        .update({ wizard_step: 7 } as never)
        .eq("id", missionId);
      if (error) throw error;
      toast.success("Assignments confirmed");
      onConfirm?.();
    } catch (e: any) {
      toast.error(e?.message || "Could not confirm");
    } finally {
      setConfirming(false);
    }
  };

  if (loading) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin" />
        Loading assignments…
      </div>
    );
  }

  const drawerRow = drawerQid
    ? rows.find((r) => r.question.id === drawerQid) ?? null
    : null;

  return (
    <div className="flex flex-col" style={{ minHeight: mode === "tab" ? "calc(100vh - 200px)" : "auto" }}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 mb-3">
        <select
          value={filterSection}
          onChange={(e) => setFilterSection(e.target.value)}
          className="rounded border border-border bg-background px-2 py-1 text-xs"
        >
          <option value="">All Sections</option>
          {sections.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded border border-border bg-background px-2 py-1 text-xs"
        >
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={filterWriter}
          onChange={(e) => setFilterWriter(e.target.value)}
          className="rounded border border-border bg-background px-2 py-1 text-xs"
        >
          <option value="">All Writers</option>
          {writers.map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </select>
        <div className="relative">
          <Search className="absolute left-2 top-1.5 h-3 w-3 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search questions…"
            className="rounded border border-border bg-background pl-7 pr-2 py-1 text-xs w-48"
          />
        </div>
        <label className="inline-flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={unassignedOnly}
            onChange={(e) => setUnassignedOnly(e.target.checked)}
          />
          Unassigned Only
        </label>
        <div className="ml-auto">
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-semibold hover:bg-surface-hover"
          >
            <Download className="h-3 w-3" /> Export CSV
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border border-border bg-surface overflow-auto flex-1">
        <table className="w-full text-xs">
          <thead className="bg-surface-hover sticky top-0 z-10">
            <tr>
              <Th className="w-14">#</Th>
              <Th>Question</Th>
              <Th>Section</Th>
              <Th>Writer</Th>
              <Th>Athena SME</Th>
              <Th>Client SME</Th>
              <Th>Reviewer</Th>
              <Th>Copy Editor</Th>
              <Th>Status</Th>
              <Th>Risk</Th>
              <Th>Due</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <AssignmentRow
                key={r.question.id}
                row={r}
                team={team}
                onOpen={() => setDrawerQid(r.question.id)}
                onChange={(patch) => persistAssignment(r.question.id, patch)}
                onUpsertTeam={upsertTeamMember}
              />
            ))}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={11}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  No questions match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Wizard confirm button */}
      {mode === "wizard" && (
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={confirming}
            className="rounded-md px-5 py-2 text-sm font-bold uppercase tracking-wider shadow disabled:opacity-50"
            style={{ backgroundColor: GOLD, color: NAVY }}
          >
            {confirming ? "Confirming…" : "Confirm Assignments →"}
          </button>
        </div>
      )}

      {/* Sticky footer */}
      <div className="sticky bottom-0 mt-3 rounded-md border border-border bg-surface px-4 py-2 text-xs font-medium flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>
          <strong>{total}</strong> questions total
        </span>
        <span className="text-muted-foreground">|</span>
        <span className={unassigned > 0 ? "text-amber-500" : ""}>
          <strong>{unassigned}</strong> unassigned
        </span>
        <span className="text-muted-foreground">|</span>
        <span className={atRisk > 0 ? "text-red-500" : ""}>
          <strong>{atRisk}</strong> at risk
        </span>
        <span className="text-muted-foreground">|</span>
        <span className="text-emerald-500">
          <strong>{complete}</strong> complete
        </span>
      </div>

      {/* Drawer */}
      {drawerRow && (
        <QuestionDrawer
          row={drawerRow}
          team={team}
          missionId={missionId}
          onClose={() => setDrawerQid(null)}
          onAssignmentChange={(patch) =>
            persistAssignment(drawerRow.question.id, patch)
          }
          onQuestionChange={(patch) =>
            persistQuestion(drawerRow.question.id, patch)
          }
          onUpsertTeam={upsertTeamMember}
        />
      )}
    </div>
  );
}

/* ---------- Row ---------- */

function AssignmentRow({
  row,
  team,
  onOpen,
  onChange,
  onUpsertTeam,
}: {
  row: Row;
  team: TeamMember[];
  onOpen: () => void;
  onChange: (patch: Partial<Assignment>) => void;
  onUpsertTeam: (name: string, inferredRole: string) => Promise<void>;
}) {
  const { question: q, assignment: a } = row;

  const writerMissing = !a.writer_name && !a.reviewer_name;
  const isAtRisk = a.risk_level === "High" || a.status === "At Risk";
  const isComplete = a.status === "Complete";

  const borderColor = isAtRisk
    ? "#ef4444"
    : writerMissing
      ? "#f59e0b"
      : "transparent";
  const bg = isComplete ? "rgba(16,185,129,0.05)" : undefined;
  const textCls = isComplete ? "text-muted-foreground" : "";

  const truncated =
    (q.question_name || "").length > 40
      ? (q.question_name || "").slice(0, 40) + "…"
      : q.question_name || "(no name)";

  const onTypeName = async (field: AssignFieldKey, value: string) => {
    onChange({ [field]: value || null } as Partial<Assignment>);
    if (value) {
      const meta = ASSIGN_FIELDS.find((f) => f.key === field);
      await onUpsertTeam(value, meta?.inferred ?? "Team Member");
    }
  };

  return (
    <tr
      className={`border-t border-border hover:bg-surface-hover ${textCls}`}
      style={{
        borderLeft: `4px solid ${borderColor}`,
        backgroundColor: bg,
      }}
    >
      <Td className="font-semibold">{q.question_number || "—"}</Td>
      <Td>
        <button
          type="button"
          onClick={onOpen}
          className="text-left hover:underline"
          title={q.question_name || ""}
        >
          {truncated}
        </button>
      </Td>
      <Td>{q.section || "—"}</Td>
      {ASSIGN_FIELDS.map((f) => (
        <Td key={f.key}>
          <NameCombobox
            value={(a[f.key] as string | null) || ""}
            options={team.map((t) => t.name)}
            onCommit={(v) => onTypeName(f.key, v)}
          />
        </Td>
      ))}
      <Td>
        <BadgeSelect
          value={a.status || "Unassigned"}
          options={STATUS_OPTIONS as readonly string[]}
          onChange={(v) => onChange({ status: v })}
          tone={badgeTone(a.status)}
        />
      </Td>
      <Td>
        <BadgeSelect
          value={a.risk_level || "None"}
          options={RISK_OPTIONS as readonly string[]}
          onChange={(v) => onChange({ risk_level: v })}
          tone={riskTone(a.risk_level)}
        />
      </Td>
      <Td>
        <input
          type="date"
          value={a.internal_deadline || ""}
          onChange={(e) =>
            onChange({ internal_deadline: e.target.value || null })
          }
          className="rounded border border-border bg-background px-1.5 py-0.5 text-xs"
        />
      </Td>
    </tr>
  );
}

function badgeTone(status: string | null): string {
  switch (status) {
    case "Complete":
      return "bg-emerald-500/15 text-emerald-500 border-emerald-500/30";
    case "In Progress":
      return "bg-blue-500/15 text-blue-500 border-blue-500/30";
    case "At Risk":
      return "bg-red-500/15 text-red-500 border-red-500/30";
    case "Assigned":
      return "bg-amber-500/15 text-amber-500 border-amber-500/30";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

function riskTone(risk: string | null): string {
  switch (risk) {
    case "High":
      return "bg-red-500/15 text-red-500 border-red-500/30";
    case "Medium":
      return "bg-amber-500/15 text-amber-500 border-amber-500/30";
    case "Low":
      return "bg-blue-500/15 text-blue-500 border-blue-500/30";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

/* ---------- Combobox: free-form + datalist ---------- */

function NameCombobox({
  value,
  options,
  onCommit,
}: {
  value: string;
  options: string[];
  onCommit: (v: string) => void | Promise<void>;
}) {
  const [local, setLocal] = useState(value);
  const id = useRef(
    `cb-${Math.random().toString(36).slice(2, 8)}`,
  ).current;
  useEffect(() => setLocal(value), [value]);
  return (
    <>
      <input
        list={id}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          if (local !== value) void onCommit(local.trim());
        }}
        className="w-full rounded border border-border bg-background px-1.5 py-0.5 text-xs"
        placeholder="—"
      />
      <datalist id={id}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </>
  );
}

/* ---------- Badge Select ---------- */

function BadgeSelect({
  value,
  options,
  onChange,
  tone,
}: {
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
  tone: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tone}`}
    >
      {options.map((o) => (
        <option key={o} value={o} className="bg-background text-foreground">
          {o}
        </option>
      ))}
    </select>
  );
}

/* ---------- Drawer ---------- */

function QuestionDrawer({
  row,
  team,
  missionId,
  onClose,
  onAssignmentChange,
  onQuestionChange,
  onUpsertTeam,
}: {
  row: Row;
  team: TeamMember[];
  missionId: string;
  onClose: () => void;
  onAssignmentChange: (patch: Partial<Assignment>) => void;
  onQuestionChange: (patch: Partial<Question>) => void;
  onUpsertTeam: (name: string, inferredRole: string) => Promise<void>;
}) {
  const [intel, setIntel] = useState<any | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("question_intelligence")
        .select(
          "iris_brief, key_messages, relevant_research, compliance_flags, state_priorities, procurement_priorities",
        )
        .eq("question_id", row.question.id)
        .eq("mission_id", missionId)
        .maybeSingle();
      if (!alive) return;
      setIntel(data || null);
    })();
    return () => {
      alive = false;
    };
  }, [row.question.id, missionId]);

  const q = row.question;
  const a = row.assignment;

  const reqs = Array.isArray(q.requirements) ? q.requirements : [];
  const evals = Array.isArray(q.evaluation_criteria) ? q.evaluation_criteria : [];

  const NameField = ({
    field,
    label,
    inferred,
  }: {
    field: AssignFieldKey | "workstream_lead";
    label: string;
    inferred: string;
  }) => (
    <label className="block">
      <div className="text-xs font-semibold mb-1">{label}</div>
      <NameCombobox
        value={(a[field as keyof Assignment] as string | null) || ""}
        options={team.map((t) => t.name)}
        onCommit={async (v) => {
          onAssignmentChange({ [field]: v || null } as Partial<Assignment>);
          if (v) await onUpsertTeam(v, inferred);
        }}
      />
    </label>
  );

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <div
        className="flex-1 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="w-full max-w-[560px] bg-background border-l border-border overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background px-5 py-3">
          <div className="text-sm font-semibold">Question Detail</div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <label className="block col-span-1">
              <div className="text-xs font-semibold mb-1">Number</div>
              <input
                defaultValue={q.question_number || ""}
                onBlur={(e) =>
                  e.target.value !== (q.question_number || "") &&
                  onQuestionChange({ question_number: e.target.value || null })
                }
                className="w-full rounded border border-border bg-background px-2 py-1 text-sm"
              />
            </label>
            <label className="block col-span-1">
              <div className="text-xs font-semibold mb-1">Page Limit</div>
              <input
                type="number"
                defaultValue={q.page_limit ?? ""}
                onBlur={(e) => {
                  const v = e.target.value === "" ? null : Number(e.target.value);
                  if (v !== q.page_limit) onQuestionChange({ page_limit: v });
                }}
                className="w-full rounded border border-border bg-background px-2 py-1 text-sm"
              />
            </label>
          </div>

          <label className="block">
            <div className="text-xs font-semibold mb-1">Name</div>
            <input
              defaultValue={q.question_name || ""}
              onBlur={(e) =>
                e.target.value !== (q.question_name || "") &&
                onQuestionChange({ question_name: e.target.value || null })
              }
              className="w-full rounded border border-border bg-background px-2 py-1 text-sm"
            />
          </label>

          <label className="block">
            <div className="text-xs font-semibold mb-1">Question Text</div>
            <textarea
              defaultValue={q.question_text || ""}
              onBlur={(e) =>
                e.target.value !== (q.question_text || "") &&
                onQuestionChange({ question_text: e.target.value || null })
              }
              rows={6}
              className="w-full rounded border border-border bg-background px-2 py-1 text-sm"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs font-semibold mb-1">Requirements</div>
              {reqs.length === 0 ? (
                <div className="text-xs text-muted-foreground">None</div>
              ) : (
                <ul className="list-disc pl-4 text-xs space-y-1 max-h-40 overflow-auto">
                  {reqs.map((r: any, i: number) => (
                    <li key={i}>{typeof r === "string" ? r : JSON.stringify(r)}</li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <div className="text-xs font-semibold mb-1">Evaluation Criteria</div>
              {evals.length === 0 ? (
                <div className="text-xs text-muted-foreground">None</div>
              ) : (
                <ul className="list-disc pl-4 text-xs space-y-1 max-h-40 overflow-auto">
                  {evals.map((r: any, i: number) => (
                    <li key={i}>{typeof r === "string" ? r : JSON.stringify(r)}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Assignments
            </div>
            <div className="grid grid-cols-2 gap-3">
              <NameField field="writer_name" label="Writer" inferred="Writer" />
              <NameField field="athena_sme_name" label="Athena SME" inferred="SME" />
              <NameField field="client_sme_name" label="Client SME" inferred="SME" />
              <NameField field="reviewer_name" label="Reviewer" inferred="Reviewer" />
              <NameField field="copy_editor_name" label="Copy Editor" inferred="Copy Editor" />
              <NameField field="workstream_lead" label="Workstream Lead" inferred="Workstream Lead" />
              <label className="block">
                <div className="text-xs font-semibold mb-1">Internal Deadline</div>
                <input
                  type="date"
                  defaultValue={a.internal_deadline || ""}
                  onBlur={(e) =>
                    onAssignmentChange({
                      internal_deadline: e.target.value || null,
                    })
                  }
                  className="w-full rounded border border-border bg-background px-2 py-1 text-sm"
                />
              </label>
            </div>
            <label className="block mt-3">
              <div className="text-xs font-semibold mb-1">Notes</div>
              <textarea
                defaultValue={a.notes || ""}
                onBlur={(e) =>
                  onAssignmentChange({ notes: e.target.value || null })
                }
                rows={3}
                className="w-full rounded border border-border bg-background px-2 py-1 text-sm"
              />
            </label>
          </div>

          <div className="border-t border-border pt-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Intelligence
            </div>
            {!intel ? (
              <div className="text-xs text-muted-foreground">
                No intelligence generated for this question yet.
              </div>
            ) : (
              <div className="space-y-2 text-xs">
                {intel.iris_brief && (
                  <div>
                    <div className="font-semibold">IRIS Brief</div>
                    <div className="text-muted-foreground line-clamp-4">
                      {intel.iris_brief}
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap gap-3">
                  <Stat label="Key Messages" value={countItems(intel.key_messages)} />
                  <Stat label="Research" value={countItems(intel.relevant_research)} />
                  <Stat
                    label="Compliance Flags"
                    value={countItems(intel.compliance_flags)}
                  />
                  <Stat
                    label="State Priorities"
                    value={countItems(intel.state_priorities)}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function countItems(v: any): number {
  if (Array.isArray(v)) return v.length;
  if (v && typeof v === "object") return Object.keys(v).length;
  return 0;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-border px-2 py-1">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="text-sm font-bold">{value}</div>
    </div>
  );
}

/* ---------- table primitives ---------- */

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`text-left px-2 py-1.5 font-semibold whitespace-nowrap ${className}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-2 py-1.5 align-middle ${className}`}>{children}</td>;
}
