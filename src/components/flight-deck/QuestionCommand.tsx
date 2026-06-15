import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Plus,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  FileText,
  X,
  ClipboardList,
  Sparkles,
  Eye,
} from "lucide-react";
import { generateIrisBrief } from "@/lib/iris-brief-generator.functions";


const GOLD = "#d4a843";
const RED = "#e05252";
const GREEN = "#4caf7d";
const BLUE = "#5b9bd5";
const AMBER = "#f0c040";
const PURPLE = "#7b6cff";
const CARD = "#13131a";
const CARD_2 = "#1c1c28";
const BORDER = "#2a2a3a";

const sectionLabel: React.CSSProperties = {
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: "0.18em",
  color: "rgba(255,255,255,0.45)",
  fontWeight: 600,
};

type QuestionRow = {
  id: string;
  question_number: string | null;
  question_text: string;
  word_limit: number | null;
  page_limit: number | null;
  point_value: number | null;
  status: string | null;
  iris_brief_status: string | null;
  due_date: string | null;
  assignees: string[];
};

const ASSIGN_ROLES = ["Lead Writer", "SME", "Editor", "Graphics", "Copy Editor"] as const;
type AssignRole = (typeof ASSIGN_ROLES)[number];

const statusMeta: Record<string, { label: string; color: string }> = {
  not_started: { label: "Not Started", color: "rgba(255,255,255,0.4)" },
  in_progress: { label: "In Progress", color: BLUE },
  needs_review: { label: "Needs Review", color: AMBER },
  complete: { label: "Complete", color: GREEN },
};

export function QuestionCommand({ missionId }: { missionId: string }) {
  const [tab, setTab] = useState<"all" | "add">("all");
  const [assignTarget, setAssignTarget] = useState<QuestionRow | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [briefTarget, setBriefTarget] = useState<QuestionRow | null>(null);
  const generateBrief = useServerFn(generateIrisBrief);


  const { data: questions = [], refetch: refetchQ } = useQuery({
    queryKey: ["qc-questions", missionId],
    queryFn: async (): Promise<QuestionRow[]> => {
      const { data: qs } = await supabase
        .from("mission_questions")
        .select(
          "id, question_number, question_text, word_limit, page_limit, point_value, status, iris_brief_status, due_date",
        )
        .eq("mission_id", missionId)
        .order("question_number", { ascending: true });
      const qids = ((qs ?? []) as any[]).map((q) => q.id);
      const { data: asgs } =
        qids.length > 0
          ? await supabase
              .from("mission_assignments")
              .select("question_id, assigned_writer_id")
              .in("question_id", qids)
          : { data: [] as any[] };
      const byQ = new Map<string, string[]>();
      for (const a of (asgs ?? []) as any[]) {
        if (!byQ.has(a.question_id)) byQ.set(a.question_id, []);
        if (a.assigned_writer_id) byQ.get(a.question_id)!.push(a.assigned_writer_id);
      }
      return ((qs ?? []) as any[]).map((q) => ({
        ...q,
        assignees: byQ.get(q.id) ?? [],
      }));
    },
    staleTime: 15_000,
  });

  const stats = useMemo(() => {
    const total = questions.length;
    const assigned = questions.filter((q) => q.assignees.length > 0).length;
    const awaiting = questions.filter(
      (q) => q.iris_brief_status === "pending" || q.iris_brief_status === "queued",
    ).length;
    return { total, assigned, awaiting };
  }, [questions]);

  const handleGenerateBrief = async (q: QuestionRow) => {
    setGeneratingId(q.id);
    try {
      await generateBrief({ data: { missionId, questionId: q.id } });
      toast.success("IRIS brief ready.");
      refetchQ();
    } catch (e: any) {
      toast.error("Brief generation failed.", { description: e?.message });
      refetchQ();
    } finally {
      setGeneratingId(null);
    }
  };



  return (
    <section>
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <div style={sectionLabel}>Question Command</div>
          <h2 className="mt-1 font-bold" style={{ fontSize: 22 }}>
            Lead the response
          </h2>
        </div>
      </div>

      {/* Stat chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        <Stat label="Total Questions" value={stats.total} color={GOLD} />
        <Stat label="Assigned" value={stats.assigned} color={GREEN} />
        <Stat label="Awaiting Brief" value={stats.awaiting} color={AMBER} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4">
        {(
          [
            ["all", "All Questions"],
            ["add", "Add Questions"],
          ] as const
        ).map(([k, label]) => {
          const active = tab === k;
          return (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              style={{
                padding: "6px 14px",
                fontSize: 11,
                fontWeight: 600,
                borderRadius: 6,
                border: `1px solid ${active ? GOLD : BORDER}`,
                background: active ? `${GOLD}22` : "transparent",
                color: active ? GOLD : "rgba(255,255,255,0.65)",
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {tab === "all" ? (
        <AllQuestionsList
          questions={questions}
          onAssign={(q) => setAssignTarget(q)}
          onGenerate={handleGenerateBrief}
          onView={(q) => setBriefTarget(q)}
          generatingId={generatingId}
        />
      ) : (
        <AddQuestionsPanel missionId={missionId} onAdded={() => refetchQ()} />
      )}


      {assignTarget && (
        <AssignDialog
          missionId={missionId}
          question={assignTarget}
          onClose={() => setAssignTarget(null)}
          onAssigned={() => {
            setAssignTarget(null);
            refetchQ();
          }}
        />
      )}

      {briefTarget && (
        <BriefViewerDialog
          missionId={missionId}
          questionId={briefTarget.id}
          questionNumber={briefTarget.question_number}
          questionText={briefTarget.question_text}
          onClose={() => setBriefTarget(null)}
        />
      )}
    </section>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div
      className="rounded-lg px-4 py-2"
      style={{
        background: CARD,
        border: `1px solid ${BORDER}`,
        borderLeft: `3px solid ${color}`,
        minWidth: 140,
      }}
    >
      <div style={{ ...sectionLabel, fontSize: 9 }}>{label}</div>
      <div className="mt-0.5 font-bold" style={{ fontSize: 20, color }}>
        {value}
      </div>
    </div>
  );
}

/* ─────────── All Questions ─────────── */
function AllQuestionsList({
  questions,
  onAssign,
  onGenerate,
  onView,
  generatingId,
}: {
  questions: QuestionRow[];
  onAssign: (q: QuestionRow) => void;
  onGenerate: (q: QuestionRow) => void;
  onView: (q: QuestionRow) => void;
  generatingId: string | null;
}) {
  if (questions.length === 0) {
    return (
      <div
        className="rounded-xl p-8"
        style={{ background: CARD, border: `1px solid ${BORDER}` }}
      >
        <h3 className="font-bold" style={{ fontSize: 16 }}>
          No questions yet
        </h3>
        <p className="mt-2" style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
          Use the Add Questions tab to enter the first one manually or extract from the RFP.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {questions.map((q) => (
        <QuestionRowItem
          key={q.id}
          q={q}
          onAssign={() => onAssign(q)}
          onGenerate={() => onGenerate(q)}
          onView={() => onView(q)}
          isGenerating={generatingId === q.id}
        />
      ))}
    </div>

  );
}

function BriefIndicator({ status }: { status: string | null }) {
  switch (status) {
    case "ready":
      return (
        <span className="inline-flex items-center gap-1" style={{ fontSize: 11, color: GREEN }}>
          <CheckCircle2 size={12} /> Brief ready
        </span>
      );
    case "generating":
      return (
        <span className="inline-flex items-center gap-1" style={{ fontSize: 11, color: BLUE }}>
          <Loader2 size={12} className="animate-spin" /> Generating
        </span>
      );
    case "queued":
      return (
        <span className="inline-flex items-center gap-1" style={{ fontSize: 11, color: AMBER }}>
          <span
            className="inline-block rounded-full animate-pulse"
            style={{ width: 8, height: 8, background: AMBER }}
          />
          Queued
        </span>
      );
    case "stale":
      return (
        <span className="inline-flex items-center gap-1" style={{ fontSize: 11, color: AMBER }}>
          <AlertTriangle size={12} /> Stale
        </span>
      );
    case "error":
      return (
        <span className="inline-flex items-center gap-1" style={{ fontSize: 11, color: RED }}>
          <XCircle size={12} /> Error
        </span>
      );
    default:
      return (
        <span
          className="inline-flex items-center gap-1"
          style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}
        >
          <span
            className="inline-block rounded-full"
            style={{ width: 8, height: 8, background: "rgba(255,255,255,0.3)" }}
          />
          Pending
        </span>
      );
  }
}

function QuestionRowItem({
  q,
  onAssign,
  onGenerate,
  onView,
  isGenerating,
}: {
  q: QuestionRow;
  onAssign: () => void;
  onGenerate: () => void;
  onView: () => void;
  isGenerating: boolean;
}) {
  const text = q.question_text ?? "";
  const truncated = text.length > 80 ? text.slice(0, 80) + "…" : text;
  const sm = statusMeta[q.status ?? "not_started"] ?? statusMeta.not_started;
  const assigneeCount = q.assignees.length;

  return (
    <div
      className="rounded-lg p-3 flex items-center gap-3"
      style={{ background: CARD, border: `1px solid ${BORDER}` }}
    >
      <span
        className="rounded px-2 py-0.5 shrink-0"
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: GOLD,
          background: `${GOLD}1a`,
          border: `1px solid ${GOLD}55`,
        }}
      >
        {q.question_number ?? "—"}
      </span>
      <div className="min-w-0 flex-1">
        <div style={{ fontSize: 13, color: "white" }} className="truncate">
          {truncated}
        </div>
        <div className="mt-1 flex flex-wrap gap-2 items-center">
          {q.word_limit ? (
            <Chip>{q.word_limit} words</Chip>
          ) : null}
          {q.point_value ? <Chip>{q.point_value} pts</Chip> : null}
          <span
            className="rounded-full px-2 py-0.5"
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: sm.color,
              background: `${sm.color}1a`,
              border: `1px solid ${sm.color}55`,
            }}
          >
            {sm.label}
          </span>
          <BriefIndicator status={q.iris_brief_status} />
          {assigneeCount > 0 ? (
            <span
              className="rounded-full px-2 py-0.5"
              style={{
                fontSize: 10,
                color: "rgba(255,255,255,0.7)",
                border: `1px solid ${BORDER}`,
              }}
            >
              {assigneeCount} assigned
            </span>
          ) : (
            <span
              className="rounded-full px-2 py-0.5"
              style={{
                fontSize: 10,
                color: RED,
                background: `${RED}14`,
                border: `1px solid ${RED}55`,
              }}
            >
              Unassigned
            </span>
          )}
        </div>
      </div>
      <div className="flex gap-2 shrink-0">
        {/* Assignments are managed in admin setup — no Assign action in Flight Deck. */}
        {q.iris_brief_status === "ready" ? (
          <button
            type="button"
            onClick={onView}
            style={{
              padding: "6px 12px",
              fontSize: 11,
              fontWeight: 600,
              borderRadius: 6,
              border: `1px solid ${BORDER}`,
              background: "transparent",
              color: "rgba(255,255,255,0.85)",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <Eye size={12} /> View Brief
          </button>
        ) : q.iris_brief_status === "generating" || isGenerating ? (
          <button
            type="button"
            disabled
            style={{
              padding: "6px 12px",
              fontSize: 11,
              fontWeight: 600,
              borderRadius: 6,
              border: `1px solid ${BORDER}`,
              background: "transparent",
              color: "rgba(255,255,255,0.6)",
              cursor: "wait",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              opacity: 0.7,
            }}
          >
            <Loader2 size={12} className="animate-spin" /> Generating…
          </button>
        ) : q.iris_brief_status === "queued" ? (
          <button
            type="button"
            onClick={onGenerate}
            style={{
              padding: "6px 12px",
              fontSize: 11,
              fontWeight: 600,
              borderRadius: 6,
              border: `1px solid ${PURPLE}55`,
              background: `${PURPLE}1a`,
              color: "rgba(220,215,255,0.95)",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <Sparkles size={12} /> Generate Brief
          </button>
        ) : null}
      </div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="rounded-full px-2 py-0.5"
      style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", border: `1px solid ${BORDER}` }}
    >
      {children}
    </span>
  );
}

/* ─────────── Assign Dialog ─────────── */
function AssignDialog({
  missionId,
  question,
  onClose,
  onAssigned,
}: {
  missionId: string;
  question: QuestionRow;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const [memberId, setMemberId] = useState<string>("");
  const [role, setRole] = useState<AssignRole>("Lead Writer");
  const [dueDate, setDueDate] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const { data: members = [] } = useQuery({
    queryKey: ["qc-members", missionId],
    queryFn: async () => {
      const { data: mtm } = await supabase
        .from("mission_team_members")
        .select("member_id, mission_role")
        .eq("mission_id", missionId);
      const ids = ((mtm ?? []) as any[]).map((m) => m.member_id).filter(Boolean);
      if (ids.length === 0) return [] as Array<{ id: string; name: string; mission_role: string }>;
      const { data: people } = await supabase
        .from("atlas_team_members")
        .select("id, first_name, last_name, email")
        .in("id", ids);
      const byId = new Map(((people ?? []) as any[]).map((p) => [p.id, p]));
      return ((mtm ?? []) as any[]).map((m) => {
        const p = byId.get(m.member_id);
        const name =
          p?.first_name || p?.last_name
            ? `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim()
            : p?.email ?? "Unknown";
        return { id: m.member_id, name, mission_role: m.mission_role };
      });
    },
  });

  const text = question.question_text ?? "";
  const truncated = text.length > 120 ? text.slice(0, 120) + "…" : text;

  const onConfirm = async () => {
    if (!memberId) {
      toast.error("Pick a team member.");
      return;
    }
    setSaving(true);
    const { error: insErr } = await supabase.from("mission_assignments").insert({
      mission_id: missionId,
      question_id: question.id,
      assigned_writer_id: memberId,
      due_date: dueDate || null,
    });
    if (insErr) {
      setSaving(false);
      if ((insErr as any).code === "23505") {
        toast.error("Already assigned to this team member.");
      } else {
        toast.error(insErr.message ?? "Could not assign.");
      }
      return;
    }
    await supabase
      .from("mission_questions")
      .update({ iris_brief_status: "queued" })
      .eq("id", question.id);
    setSaving(false);
    toast.success("Question assigned. IRIS will prepare the brief.");
    onAssigned();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        className="rounded-xl w-full max-w-lg"
        style={{ background: CARD_2, border: `1px solid ${BORDER}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-start justify-between p-4"
          style={{ borderBottom: `1px solid ${BORDER}` }}
        >
          <div className="min-w-0">
            <div style={sectionLabel}>Assign Question</div>
            <div className="mt-1 font-bold" style={{ fontSize: 14 }}>
              {question.question_number ?? "—"}
            </div>
            <div className="mt-1" style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
              {truncated}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ color: "rgba(255,255,255,0.5)", background: "none", border: 0, cursor: "pointer" }}
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label style={{ ...sectionLabel, fontSize: 10 }}>Team Member</label>
            <select
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
              className="w-full mt-1 rounded-md"
              style={{
                background: CARD,
                border: `1px solid ${BORDER}`,
                color: "white",
                padding: "8px 10px",
                fontSize: 13,
              }}
            >
              <option value="">Select member…</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.mission_role ? ` — ${m.mission_role}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ ...sectionLabel, fontSize: 10 }}>Role</label>
            <div className="flex flex-wrap gap-1 mt-1">
              {ASSIGN_ROLES.map((r) => {
                const active = role === r;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    style={{
                      padding: "6px 10px",
                      fontSize: 11,
                      fontWeight: 600,
                      borderRadius: 999,
                      border: `1px solid ${active ? GOLD : BORDER}`,
                      background: active ? `${GOLD}22` : "transparent",
                      color: active ? GOLD : "rgba(255,255,255,0.65)",
                      cursor: "pointer",
                    }}
                  >
                    {r}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label style={{ ...sectionLabel, fontSize: 10 }}>Due date (optional)</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full mt-1 rounded-md"
              style={{
                background: CARD,
                border: `1px solid ${BORDER}`,
                color: "white",
                padding: "8px 10px",
                fontSize: 13,
                colorScheme: "dark",
              }}
            />
          </div>
        </div>

        <div
          className="p-4 flex justify-end gap-2"
          style={{ borderTop: `1px solid ${BORDER}` }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "8px 14px",
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 6,
              border: `1px solid ${BORDER}`,
              background: "transparent",
              color: "rgba(255,255,255,0.8)",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={saving || !memberId}
            style={{
              padding: "8px 14px",
              fontSize: 12,
              fontWeight: 700,
              borderRadius: 6,
              border: `1px solid ${GOLD}`,
              background: `${GOLD}33`,
              color: GOLD,
              cursor: saving ? "wait" : "pointer",
              opacity: !memberId ? 0.5 : 1,
            }}
          >
            {saving ? "Assigning…" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────── Add Questions ─────────── */
function AddQuestionsPanel({
  missionId,
  onAdded,
}: {
  missionId: string;
  onAdded: () => void;
}) {
  return (
    <div className="space-y-6">
      <div
        className="rounded-xl p-5"
        style={{ background: CARD, border: `1px solid ${BORDER}` }}
      >
        <div className="flex items-center gap-2 mb-3">
          <ClipboardList size={14} style={{ color: GOLD }} />
          <div style={sectionLabel}>Manual Entry</div>
        </div>
        <ManualEntryForm missionId={missionId} onAdded={onAdded} />
      </div>

      <div
        className="rounded-xl p-5"
        style={{ background: CARD, border: `1px solid ${BORDER}` }}
      >
        <div className="flex items-center gap-2 mb-3">
          <FileText size={14} style={{ color: GOLD }} />
          <div style={sectionLabel}>From RFP Documents</div>
        </div>
        <RfpDocumentsList missionId={missionId} />
      </div>
    </div>
  );
}

function ManualEntryForm({
  missionId,
  onAdded,
}: {
  missionId: string;
  onAdded: () => void;
}) {
  const [questionNumber, setQuestionNumber] = useState("");
  const [questionText, setQuestionText] = useState("");
  const [wordLimit, setWordLimit] = useState("");
  const [pageLimit, setPageLimit] = useState("");
  const [pointValue, setPointValue] = useState("");
  const [evaluationCriteria, setEvaluationCriteria] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setQuestionNumber("");
    setQuestionText("");
    setWordLimit("");
    setPageLimit("");
    setPointValue("");
    setEvaluationCriteria("");
  };

  const submit = async () => {
    if (!questionText.trim()) {
      toast.error("Question text is required.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("mission_questions").insert({
      mission_id: missionId,
      question_number: questionNumber || null,
      question_text: questionText,
      word_limit: wordLimit ? Number(wordLimit) : null,
      page_limit: pageLimit ? Number(pageLimit) : null,
      point_value: pointValue ? Number(pointValue) : null,
      evaluation_criteria: evaluationCriteria || null,
      iris_brief_status: "pending",
      status: "not_started",
    });
    setSaving(false);
    if (error) {
      toast.error(error.message ?? "Could not add question.");
      return;
    }
    toast.success("Question added.");
    reset();
    onAdded();
  };

  const inputStyle: React.CSSProperties = {
    background: CARD_2,
    border: `1px solid ${BORDER}`,
    color: "white",
    padding: "8px 10px",
    fontSize: 13,
    borderRadius: 6,
    width: "100%",
  };
  const labelStyle: React.CSSProperties = { ...sectionLabel, fontSize: 10 };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label style={labelStyle}>Question Number</label>
          <input
            value={questionNumber}
            onChange={(e) => setQuestionNumber(e.target.value)}
            placeholder="e.g. C.3.2"
            style={{ ...inputStyle, marginTop: 4 }}
          />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label style={labelStyle}>Word Limit</label>
            <input
              type="number"
              value={wordLimit}
              onChange={(e) => setWordLimit(e.target.value)}
              style={{ ...inputStyle, marginTop: 4 }}
            />
          </div>
          <div>
            <label style={labelStyle}>Page Limit</label>
            <input
              type="number"
              value={pageLimit}
              onChange={(e) => setPageLimit(e.target.value)}
              style={{ ...inputStyle, marginTop: 4 }}
            />
          </div>
          <div>
            <label style={labelStyle}>Points</label>
            <input
              type="number"
              value={pointValue}
              onChange={(e) => setPointValue(e.target.value)}
              style={{ ...inputStyle, marginTop: 4 }}
            />
          </div>
        </div>
      </div>
      <div>
        <label style={labelStyle}>Question Text</label>
        <textarea
          rows={4}
          value={questionText}
          onChange={(e) => setQuestionText(e.target.value)}
          style={{ ...inputStyle, marginTop: 4, resize: "vertical" }}
        />
      </div>
      <div>
        <label style={labelStyle}>Evaluation Criteria (optional)</label>
        <textarea
          rows={2}
          value={evaluationCriteria}
          onChange={(e) => setEvaluationCriteria(e.target.value)}
          style={{ ...inputStyle, marginTop: 4, resize: "vertical" }}
        />
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={submit}
          disabled={saving}
          className="inline-flex items-center gap-2"
          style={{
            padding: "8px 14px",
            fontSize: 12,
            fontWeight: 700,
            borderRadius: 6,
            border: `1px solid ${GOLD}`,
            background: `${GOLD}33`,
            color: GOLD,
            cursor: saving ? "wait" : "pointer",
          }}
        >
          <Plus size={14} /> {saving ? "Adding…" : "Add Question"}
        </button>
      </div>
    </div>
  );
}

function RfpDocumentsList({ missionId }: { missionId: string }) {
  const { data: docs = [] } = useQuery({
    queryKey: ["qc-rfp-docs", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_documents")
        .select("id, title, file_url, created_at")
        .eq("mission_id", missionId)
        .eq("document_purpose", "procurement")
        .order("created_at", { ascending: false });
      return (data ?? []) as any[];
    },
  });

  if (docs.length === 0) {
    return (
      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
        No procurement documents uploaded. Upload the RFP in the Setup Wizard first.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {docs.map((d) => (
        <div
          key={d.id}
          className="rounded-md p-3 flex items-center justify-between gap-3"
          style={{ background: CARD_2, border: `1px solid ${BORDER}` }}
        >
          <div className="min-w-0 flex items-center gap-2">
            <FileText size={14} style={{ color: "rgba(255,255,255,0.6)" }} />
            <span className="truncate" style={{ fontSize: 13 }}>
              {d.title ?? "Untitled document"}
            </span>
          </div>
          <button
            type="button"
            disabled
            style={{
              padding: "6px 12px",
              fontSize: 11,
              fontWeight: 600,
              borderRadius: 6,
              border: `1px solid ${BORDER}`,
              background: "transparent",
              color: "rgba(255,255,255,0.4)",
              cursor: "not-allowed",
            }}
          >
            Extract with IRIS (coming soon)
          </button>
        </div>
      ))}
    </div>
  );
}

/* ─────────── Brief Viewer Dialog ─────────── */
function BriefViewerDialog({
  missionId,
  questionId,
  questionNumber,
  questionText,
  onClose,
}: {
  missionId: string;
  questionId: string;
  questionNumber: string | null;
  questionText: string;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["qc-brief", missionId, questionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_questions")
        .select("iris_brief, iris_brief_generated_at")
        .eq("id", questionId)
        .maybeSingle();
      return data as { iris_brief: any; iris_brief_generated_at: string | null } | null;
    },
  });

  const brief = (data?.iris_brief ?? {}) as any;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={onClose}
    >
      <div
        className="rounded-xl max-w-3xl w-full max-h-[85vh] overflow-y-auto"
        style={{ background: CARD, border: `1px solid ${BORDER}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-start justify-between p-5"
          style={{ borderBottom: `1px solid ${BORDER}` }}
        >
          <div className="min-w-0">
            <div style={sectionLabel}>IRIS Brief</div>
            <div className="mt-1 font-bold" style={{ fontSize: 16, color: "white" }}>
              {questionNumber ? `${questionNumber} · ` : ""}
              {questionText.length > 90 ? questionText.slice(0, 90) + "…" : questionText}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "rgba(255,255,255,0.6)",
              cursor: "pointer",
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {isLoading ? (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>Loading…</div>
          ) : !brief || Object.keys(brief).length === 0 ? (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
              No brief content available.
            </div>
          ) : (
            <>
              <BriefBlock title="Decoded Intent" body={brief.decoded_intent} />
              <BriefBlock title="Evaluation Focus" body={brief.evaluation_focus} />
              <BriefBlock title="Recommended Approach" body={brief.recommended_approach} />

              {Array.isArray(brief.win_theme_connections) &&
                brief.win_theme_connections.length > 0 && (
                  <BriefSection title="Win Theme Connections">
                    <ul className="space-y-1" style={{ paddingLeft: 16 }}>
                      {brief.win_theme_connections.map((w: any, i: number) => (
                        <li key={i} style={{ fontSize: 12.5, color: "rgba(255,255,255,0.85)" }}>
                          {w.theme_text}
                          {w.relevance_score != null ? (
                            <span style={{ color: GOLD, marginLeft: 6 }}>
                              · {w.relevance_score}
                            </span>
                          ) : null}
                          {w.signal_authority ? (
                            <span style={{ color: "rgba(255,255,255,0.5)", marginLeft: 6 }}>
                              · {w.signal_authority}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </BriefSection>
                )}

              {Array.isArray(brief.iris_evidence) && brief.iris_evidence.length > 0 && (
                <BriefSection title="IRIS Evidence">
                  <ul className="space-y-2" style={{ paddingLeft: 16 }}>
                    {brief.iris_evidence.map((e: any, i: number) => (
                      <li key={i} style={{ fontSize: 12.5, color: "rgba(255,255,255,0.85)" }}>
                        <strong style={{ color: "white" }}>{e.source}</strong>
                        {e.citation ? (
                          <span style={{ color: "rgba(255,255,255,0.5)" }}> · {e.citation}</span>
                        ) : null}
                        <div style={{ marginTop: 2 }}>{e.finding}</div>
                        {e.relevance ? (
                          <div
                            style={{
                              marginTop: 2,
                              color: "rgba(255,255,255,0.6)",
                              fontStyle: "italic",
                            }}
                          >
                            {e.relevance}
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </BriefSection>
              )}

              {brief.client_proof_points_prompt && (
                <div
                  className="rounded-lg p-3"
                  style={{
                    background: `${GOLD}10`,
                    border: `1px solid ${GOLD}44`,
                  }}
                >
                  <div style={{ ...sectionLabel, color: GOLD }}>Client Proof Points</div>
                  <div
                    className="mt-1"
                    style={{ fontSize: 12.5, color: "rgba(255,255,255,0.9)" }}
                  >
                    {brief.client_proof_points_prompt}
                  </div>
                </div>
              )}

              {brief.language_guidance && (
                <BriefSection title="Language Guidance">
                  {Array.isArray(brief.language_guidance.use) &&
                    brief.language_guidance.use.length > 0 && (
                      <div>
                        <div style={{ fontSize: 11, color: GREEN, fontWeight: 600 }}>Use</div>
                        <ul style={{ paddingLeft: 16 }}>
                          {brief.language_guidance.use.map((u: string, i: number) => (
                            <li
                              key={i}
                              style={{ fontSize: 12.5, color: "rgba(255,255,255,0.85)" }}
                            >
                              {u}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  {Array.isArray(brief.language_guidance.avoid) &&
                    brief.language_guidance.avoid.length > 0 && (
                      <div className="mt-2">
                        <div style={{ fontSize: 11, color: RED, fontWeight: 600 }}>Avoid</div>
                        <ul style={{ paddingLeft: 16 }}>
                          {brief.language_guidance.avoid.map((u: string, i: number) => (
                            <li
                              key={i}
                              style={{ fontSize: 12.5, color: "rgba(255,255,255,0.85)" }}
                            >
                              {u}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                </BriefSection>
              )}

              {Array.isArray(brief.compliance_checklist) &&
                brief.compliance_checklist.length > 0 && (
                  <BriefSection title="Compliance Checklist">
                    <ul className="space-y-1" style={{ paddingLeft: 16 }}>
                      {brief.compliance_checklist.map((c: any, i: number) => (
                        <li key={i} style={{ fontSize: 12.5, color: "rgba(255,255,255,0.85)" }}>
                          {c.required ? (
                            <span style={{ color: RED, marginRight: 4 }}>●</span>
                          ) : (
                            <span style={{ color: "rgba(255,255,255,0.4)", marginRight: 4 }}>
                              ○
                            </span>
                          )}
                          {c.item}
                          {c.detail ? (
                            <span style={{ color: "rgba(255,255,255,0.55)" }}> — {c.detail}</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </BriefSection>
                )}

              <BriefBlock title="Competitive Intel" body={brief.competitive_intel} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function BriefBlock({ title, body }: { title: string; body: string | null | undefined }) {
  if (!body) return null;
  return (
    <div>
      <div style={sectionLabel}>{title}</div>
      <div
        className="mt-1"
        style={{ fontSize: 13, color: "rgba(255,255,255,0.9)", lineHeight: 1.55 }}
      >
        {body}
      </div>
    </div>
  );
}

function BriefSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={sectionLabel}>{title}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}
