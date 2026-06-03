import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, useRef, useEffect } from "react";
import { ChevronDown, ChevronRight, Filter as FilterIcon, Check, Sparkles, MoreHorizontal, FileText, Phone, LifeBuoy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PensDownCountdown, daysUntil } from "@/lib/countdowns";
import { toast } from "sonner";
import { StudioVaultOraclePeek } from "@/components/v2/StudioVaultOraclePeek";
import { StudioHealthStrip } from "@/components/v2/StudioHealthStrip";
import { openUpdateReality } from "@/components/v2/UpdateRealityModal";
import { SOSButton } from "@/components/v2/SOSButton";
import { ScoreMeOverlay } from "@/components/v2/ScoreMeOverlay";

export const Route = createFileRoute("/_authenticated/missions/$missionId/questions/")({
  component: ResponsesList,
});

type Q = {
  id: string;
  mission_id: string;
  question_number: string;
  section_number: string | null;
  title: string;
  pens_down_date: string | null;
  assigned_writer_id: string | null;
  health: "red" | "yellow" | "green" | null;
  status: string | null;
  current_score: number | null;
};

type Gate = { id: string; gate_name: string; target_date: string | null };
type Profile = { id: string; display_name: string | null; email: string | null };
type Collab = { id: string; question_id: string; entry_type: string; resolved: boolean; body: string | null };
type CollabLatest = { question_id: string; created_at: string; author_name: string };
type Conflict = { question_a_id: string; question_b_id: string; description: string; resolved_at: string | null };

type View = "mine" | "all";

const HEALTH_DOT: Record<string, string> = {
  red: "bg-red-500",
  yellow: "bg-yellow-500",
  green: "bg-emerald-500",
};
const HEALTH_LABEL: Record<string, string> = {
  red: "Red",
  yellow: "Yellow",
  green: "Green",
};

// UI status options for the pill -> DB question_records.status mapping
const STATUS_OPTIONS: Array<{ ui: string; db: string }> = [
  { ui: "Not Started", db: "not_started" },
  { ui: "In Progress", db: "in_progress" },
  { ui: "In Review", db: "ready_for_review" },
  { ui: "Complete", db: "approved" },
];

function statusUiLabel(db: string | null | undefined): string {
  const match = STATUS_OPTIONS.find((s) => s.db === db);
  if (match) return match.ui;
  if (!db || db === "not_started") return "Not Started";
  return db.replace(/_/g, " ");
}

function statusPillClass(db: string | null | undefined): string {
  const v = db ?? "not_started";
  if (v === "in_progress") return "bg-primary/15 text-primary border-primary/30";
  if (v === "ready_for_review") return "bg-yellow-500/15 text-yellow-300 border-yellow-500/30";
  if (v === "approved") return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
  return "bg-muted/30 text-muted-foreground border-border";
}

function fmtDate(date: string | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

// ---------- Writer brief panel ----------

function WriterBriefPanel({
  missionId,
  myQuestions,
  collabsByQ,
}: {
  missionId: string;
  myQuestions: Q[];
  collabsByQ: Record<string, Collab[]>;
}) {
  const { data: nextGate } = useQuery({
    queryKey: ["writer-brief-gate", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_review_gates")
        .select("gate_name,target_date")
        .eq("mission_id", missionId)
        .order("target_date", { ascending: true });
      return (data ?? []).find((g: any) => g.target_date && new Date(g.target_date) >= new Date()) ?? null;
    },
  });

  // Row 1: today
  const attention = myQuestions.filter((q) => q.health === "red" || q.health === "yellow");
  const row1 =
    attention.length === 0
      ? "All questions on track."
      : `${attention.length} question${attention.length === 1 ? "" : "s"} need your attention — ${attention.map((q) => `Q${q.question_number}`).join(", ")}`;

  // Row 2: next step
  const candidates = (myQuestions.filter((q) => q.pens_down_date) as Q[]).sort(
    (a, b) => new Date(a.pens_down_date!).getTime() - new Date(b.pens_down_date!).getTime(),
  );
  const nextStepQ =
    candidates.find((q) => q.health !== "green") ?? candidates[0] ?? null;

  // Row 3: waiting on
  const openItems: { q: Q; type: string }[] = [];
  for (const q of myQuestions) {
    const items = collabsByQ[q.id] ?? [];
    for (const it of items) {
      if (!it.resolved && (it.entry_type === "sme_request" || it.entry_type === "decision_needed")) {
        openItems.push({ q, type: it.entry_type });
      }
    }
  }
  let row3: string;
  if (openItems.length === 0) {
    row3 = "Nothing waiting. Clear to write.";
  } else {
    const samples = openItems.slice(0, 2).map(({ q, type }) =>
      type === "sme_request"
        ? `SME response pending on Q${q.question_number}`
        : `decision needed on Q${q.question_number}`,
    );
    row3 = `${openItems.length} open item${openItems.length === 1 ? "" : "s"} — ${samples.join(", ")}`;
  }

  // Row 4: next gate
  const row4 = nextGate ? `${nextGate.gate_name} · ${fmtDate(nextGate.target_date)}` : "No gates scheduled.";

  return (
    <div className="mb-6 rounded-[10px] border border-primary/30 bg-primary/[0.04] px-5 py-4">
      <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.32em] text-primary">Writer Brief</div>
      <dl className="space-y-2 text-sm">
        <BriefRow label="TODAY" value={row1} />
        <BriefRow
          label="NEXT STEP"
          value={
            nextStepQ ? (
              <span className="inline-flex items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">Q{nextStepQ.question_number}</span>
                <span>· {nextStepQ.title}</span>
                {nextStepQ.pens_down_date && (
                  <span className="text-muted-foreground">· Pens Down {fmtDate(nextStepQ.pens_down_date)}</span>
                )}
                {nextStepQ.health && (
                  <span className="inline-flex items-center gap-1">
                    <span className={`h-2 w-2 rounded-full ${HEALTH_DOT[nextStepQ.health]}`} />
                    {HEALTH_LABEL[nextStepQ.health]}
                  </span>
                )}
              </span>
            ) : (
              "No upcoming deadline."
            )
          }
        />
        <BriefRow label="WAITING ON" value={row3} />
        <BriefRow label="NEXT GATE" value={row4} />
      </dl>
    </div>
  );
}

function BriefRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
      <dt className="w-28 shrink-0 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">{label}</dt>
      <dd className="flex-1 text-foreground">{value}</dd>
    </div>
  );
}

// ---------- Status pill (clickable, ADD 4) ----------

function StatusPill({
  current,
  onChange,
}: {
  current: string | null | undefined;
  onChange: (newDb: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [pending, setPending] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const handle = async (e: React.MouseEvent, db: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (db === (current ?? "not_started")) {
      setOpen(false);
      return;
    }
    setPending(true);
    try {
      await onChange(db);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 1200);
      setOpen(false);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        disabled={pending}
        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition ${statusPillClass(current)} hover:brightness-110 disabled:opacity-60`}
      >
        {justSaved ? <Check className="h-3 w-3" /> : null}
        <span>{statusUiLabel(current)}</span>
        <ChevronDown className="h-3 w-3 opacity-70" />
      </button>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 top-[calc(100%+4px)] z-20 min-w-[140px] overflow-hidden rounded-md border border-border bg-surface shadow-lg"
        >
          {STATUS_OPTIONS.map((opt) => {
            const active = (current ?? "not_started") === opt.db;
            return (
              <button
                key={opt.db}
                type="button"
                onClick={(e) => handle(e, opt.db)}
                className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs hover:bg-surface-hover ${active ? "text-foreground" : "text-muted-foreground"}`}
              >
                <span>{opt.ui}</span>
                {active && <Check className="h-3 w-3" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CockpitListActionBar({ missionId, question }: { missionId: string; question: Q }) {
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [scoreOpen, setScoreOpen] = useState(false);
  const days = daysUntil(question.pens_down_date);
  const urgency = question.health === "red" ? "most urgent" : question.health === "yellow" ? "needs attention" : "open";

  useEffect(() => {
    const onScore = () => setScoreOpen(true);
    window.addEventListener("atlas:open-score-me", onScore as EventListener);
    return () => window.removeEventListener("atlas:open-score-me", onScore as EventListener);
  }, []);


  return (
    <>
      <div className="fixed inset-x-0 bottom-[58px] z-40 border-t border-border bg-background/95 backdrop-blur md:bottom-0">
        {/* Row 1 — context label */}
        <div className="mx-auto flex max-w-[1100px] items-center justify-between gap-3 border-b border-border/50 px-6 py-1.5 text-[11px]">
          <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${question.health === "red" ? "bg-red-500" : question.health === "yellow" ? "bg-yellow-500" : "bg-green-500"}`} />
            <span className="font-mono text-foreground">Q{question.question_number}</span>
            <span className="truncate">· {question.title}</span>
          </div>
          <div className="flex shrink-0 items-center gap-2 text-muted-foreground">
            <span>Your {urgency} question</span>
            {days !== null && <span>· {days}d left</span>}
          </div>
        </div>

        {/* Row 2 — actions */}
        <div className="mx-auto flex h-14 max-w-[1100px] items-center justify-between gap-3 px-6">
          <div className="flex items-center gap-2">
            <Link
              to="/missions/$missionId/questions/$questionId"
              params={{ missionId, questionId: question.id }}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
            >
              Open Question →
            </Link>
            <Link
              to="/missions/$missionId/questions/$questionId"
              params={{ missionId, questionId: question.id }}
              className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 px-3 py-2 text-sm font-medium text-primary transition hover:bg-primary/10"
            >
              <Sparkles className="h-3.5 w-3.5" /> Ask IRIS
            </Link>
            <button
              type="button"
              onClick={() => openUpdateReality(question.id)}
              className="hidden rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground transition hover:bg-surface-hover sm:inline-flex"
            >
              Update Reality
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => setOverflowOpen((open) => !open)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface text-muted-foreground transition hover:text-foreground"
                aria-label="More Cockpit actions"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
              {overflowOpen && (
                <div className="absolute bottom-[calc(100%+8px)] right-0 z-50 w-48 overflow-hidden rounded-md border border-border bg-surface shadow-lg">
                  <button
                    type="button"
                    onClick={() => { openUpdateReality(question.id); setOverflowOpen(false); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-surface-hover sm:hidden"
                  >
                    <LifeBuoy className="h-3.5 w-3.5" /> Update Reality
                  </button>
                  <button
                    type="button"
                    onClick={() => { setScoreOpen(true); setOverflowOpen(false); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-surface-hover"
                  >
                    <FileText className="h-3.5 w-3.5" /> Score Me
                  </button>
                  <button
                    type="button"
                    onClick={() => { setOverflowOpen(false); toast("Phone a Friend — coming soon", { description: "Open the question workspace to collaborate." }); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-surface-hover"
                  >
                    <Phone className="h-3.5 w-3.5" /> Phone a Friend
                  </button>
                  <button
                    type="button"
                    onClick={() => { setOverflowOpen(false); openUpdateReality(question.id); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-surface-hover"
                  >
                    <LifeBuoy className="h-3.5 w-3.5" /> Get Help
                  </button>
                </div>
              )}
            </div>
            <SOSButton missionId={missionId} questionId={question.id} />
          </div>
        </div>
      </div>
      <ScoreMeOverlay open={scoreOpen} onClose={() => setScoreOpen(false)} missionId={missionId} lockedQuestionId={question.id} />
    </>
  );
}

// ---------- Question row (shared) ----------

function QuestionRow({
  q, me, missionId, writerById, lastEditByQ, conflictByQ, questionsById,
  statusNote, updateStatus, isWriter, showYouBadge, onOpenReadOnly,
}: {
  q: Q;
  me: string | null | undefined;
  missionId: string;
  writerById: Record<string, Profile>;
  lastEditByQ: Record<string, CollabLatest>;
  conflictByQ: Record<string, Conflict>;
  questionsById: Record<string, Q>;
  statusNote: (q: Q) => string;
  updateStatus: (q: Q, db: string) => Promise<void>;
  isWriter: boolean;
  showYouBadge: boolean;
  onOpenReadOnly: (q: Q) => void;
}) {
  const writer = q.assigned_writer_id ? writerById[q.assigned_writer_id] : null;
  const lastEdit = lastEditByQ[q.id];
  const note = statusNote(q);
  const isMine = !!me && q.assigned_writer_id === me;
  const isUnassigned = !q.assigned_writer_id;
  const conflict = conflictByQ[q.id];
  const otherId = conflict ? (conflict.question_a_id === q.id ? conflict.question_b_id : conflict.question_a_id) : null;
  const otherQ = otherId ? questionsById[otherId] : null;

  const ownStyle = isMine && showYouBadge
    ? { borderLeft: "2px solid #3b7fff", background: "rgba(59,127,255,0.04)" }
    : undefined;

  const rowInner = (
    <div className="flex items-center gap-3">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${HEALTH_DOT[q.health ?? "yellow"] ?? "bg-muted"}`} />
      <span className="font-mono text-[11px] text-muted-foreground shrink-0">Q{q.question_number}</span>
      {showYouBadge && isMine && (
        <span
          className="shrink-0 rounded px-1.5 py-px text-[9px] font-bold tracking-[0.12em]"
          style={{ background: "rgba(59,127,255,0.12)", color: "#3b7fff" }}
        >
          YOU
        </span>
      )}
      {showYouBadge && isUnassigned && (
        <span
          className="shrink-0 rounded px-1.5 py-px text-[9px] font-bold tracking-[0.12em]"
          style={{ background: "rgba(245,158,11,0.10)", color: "var(--yellow,#f59e0b)" }}
        >
          UNASSIGNED
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-sm font-medium">· {q.title}</span>
      <PensDownCountdown date={q.pens_down_date} />
      {isMine ? (
        <StatusPill current={q.status} onChange={(db) => updateStatus(q, db)} />
      ) : (
        <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${statusPillClass(q.status)}`}>
          {statusUiLabel(q.status)}
        </span>
      )}
      <span className="shrink-0 text-[11px] text-muted-foreground/80 min-w-[140px] text-right">
        {isMine
          ? (lastEdit ? `Updated ${timeAgo(lastEdit.created_at)} by ${firstName(lastEdit.author_name)}` : "Not yet started")
          : (writer ? firstName(writer.display_name || writer.email || "—") : "Unassigned")}
      </span>
    </div>
  );

  const subRow = (note || (!isWriter && writer)) ? (
    <div className="mt-1 pl-[1.5rem] text-[11px] text-muted-foreground">
      {note}
      {!isWriter && writer && (
        <span className="ml-3 opacity-70">· {writer.display_name || writer.email}</span>
      )}
    </div>
  ) : null;

  const conflictRow = conflict ? (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (otherQ) onOpenReadOnly(otherQ);
      }}
      className="mt-1 block w-full pl-[1.625rem] text-left text-[11px] hover:underline"
      style={{ color: "var(--yellow,#f59e0b)" }}
    >
      ⚠ IRIS: Conflict with Q{otherQ?.question_number ?? "?"}
    </button>
  ) : null;

  return (
    <li className="relative" style={ownStyle}>
      {isMine || !showYouBadge ? (
        <Link
          to="/missions/$missionId/questions/$questionId"
          params={{ missionId, questionId: q.id }}
          className="block px-5 py-4 hover:bg-surface-hover"
        >
          {rowInner}
          {subRow}
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => onOpenReadOnly(q)}
          className="block w-full cursor-pointer px-5 py-4 text-left hover:bg-surface-hover"
        >
          {rowInner}
          {subRow}
        </button>
      )}
      {conflictRow && <div className="px-5 pb-3">{conflictRow}</div>}
    </li>
  );
}

// ---------- Read-only question drawer ----------

function ReadOnlyQuestionDrawer({
  q, writer, onClose,
}: {
  q: Q;
  writer: Profile | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[1500] flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative h-full w-full max-w-[520px] overflow-y-auto border-l border-border bg-surface p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${HEALTH_DOT[q.health ?? "yellow"]}`} />
              <span className="font-mono text-[11px] text-muted-foreground">Q{q.question_number}</span>
              <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Read only</span>
            </div>
            <h2 className="mt-2 text-lg font-semibold leading-tight">{q.title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-border bg-surface px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Close
          </button>
        </div>

        <div className="mt-6 space-y-4 text-sm">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Health</div>
            <div className="mt-1">{HEALTH_LABEL[q.health ?? "yellow"]}</div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Assigned writer</div>
            <div className="mt-1">{writer ? (writer.display_name || writer.email) : <span className="text-yellow-400">Unassigned</span>}</div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Pens down</div>
            <div className="mt-1">{fmtDate(q.pens_down_date)}</div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Current score</div>
            <div className="mt-1">{q.current_score ?? "—"}</div>
          </div>
          <div className="rounded-md border border-border bg-background/40 p-3 text-[12px] text-muted-foreground">
            This is a read-only view. Only the assigned writer can edit Q{q.question_number}.
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Main ----------

function ResponsesList() {
  const { missionId } = Route.useParams();
  const qc = useQueryClient();

  const { data: me } = useQuery({
    queryKey: ["me-id"],
    queryFn: async () => (await supabase.auth.getUser()).data.user?.id ?? null,
  });

  const { data: meProfile } = useQuery({
    queryKey: ["me-profile", me],
    enabled: !!me,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("display_name,email")
        .eq("id", me!)
        .maybeSingle();
      return data;
    },
  });

  const { data: myRole } = useQuery({
    queryKey: ["mission-role", missionId, me],
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
  const isWriter = myRole === "writer";

  const OTHERS_KEY = `atlas_others_open_${missionId}`;
  const [othersOpen, setOthersOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try { return localStorage.getItem(OTHERS_KEY) === "1"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem(OTHERS_KEY, othersOpen ? "1" : "0"); } catch { /* noop */ }
  }, [OTHERS_KEY, othersOpen]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [drawerQ, setDrawerQ] = useState<Q | null>(null);

  const { data: questions = [], isLoading } = useQuery({
    queryKey: ["mission-questions-v2", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("question_records")
        .select("id,mission_id,question_number,section_number,title,pens_down_date,assigned_writer_id,health,status,current_score")
        .eq("mission_id", missionId)
        .order("sort_order", { ascending: true });
      return (data ?? []) as Q[];
    },
  });

  const writerIds = Array.from(new Set(questions.map((q) => q.assigned_writer_id).filter(Boolean) as string[]));
  const { data: profiles = [] } = useQuery({
    queryKey: ["mission-writers", missionId, writerIds.join(",")],
    enabled: writerIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id,display_name,email").in("id", writerIds);
      return (data ?? []) as Profile[];
    },
  });
  const writerById = Object.fromEntries(profiles.map((p) => [p.id, p]));

  const { data: collabs = [] } = useQuery({
    queryKey: ["mission-collabs", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("question_collaboration")
        .select("id,question_id,entry_type,resolved,body")
        .eq("mission_id", missionId)
        .eq("resolved", false);
      return (data ?? []) as Collab[];
    },
  });
  const collabsByQ = useMemo(() => {
    const m: Record<string, Collab[]> = {};
    for (const c of collabs) (m[c.question_id] ??= []).push(c);
    return m;
  }, [collabs]);

  // ADD 2: latest collaboration per question for "Updated X ago by Y"
  const { data: latestCollabs = [] } = useQuery({
    queryKey: ["mission-collabs-latest", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("question_collaboration")
        .select("question_id,created_at,author_name")
        .eq("mission_id", missionId)
        .order("created_at", { ascending: false })
        .limit(500);
      return (data ?? []) as CollabLatest[];
    },
  });
  const lastEditByQ = useMemo(() => {
    const m: Record<string, CollabLatest> = {};
    for (const c of latestCollabs) {
      if (!m[c.question_id]) m[c.question_id] = c;
    }
    return m;
  }, [latestCollabs]);

  const { data: conflicts = [] } = useQuery({
    queryKey: ["mission-conflicts", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("alignment_conflicts")
        .select("question_a_id,question_b_id,description,resolved_at")
        .eq("mission_id", missionId)
        .is("resolved_at", null);
      return (data ?? []) as Conflict[];
    },
  });
  const conflictByQ = useMemo(() => {
    const m: Record<string, Conflict> = {};
    for (const c of conflicts) {
      if (!m[c.question_a_id]) m[c.question_a_id] = c;
      if (!m[c.question_b_id]) m[c.question_b_id] = c;
    }
    return m;
  }, [conflicts]);

  const myQuestions = useMemo(
    () => (me ? questions.filter((q) => q.assigned_writer_id === me) : []),
    [questions, me],
  );

  // Sort: Red, Yellow, then nearest due, then Green last
  const sortForWriter = (list: Q[]) => {
    return [...list].sort((a, b) => {
      const rank = (h: Q["health"]) => (h === "red" ? 0 : h === "yellow" ? 1 : h === "green" ? 3 : 2);
      const d = rank(a.health) - rank(b.health);
      if (d !== 0) return d;
      const ad = daysUntil(a.pens_down_date) ?? 9999;
      const bd = daysUntil(b.pens_down_date) ?? 9999;
      return ad - bd;
    });
  };

  const myQuestionsSorted = useMemo(() => sortForWriter(myQuestions), [myQuestions]);

  // Natural sort by question_number (e.g. "2.10" after "2.2")
  const cmpNum = (a: string, b: string) => {
    const ap = a.split(".").map((s) => parseInt(s, 10));
    const bp = b.split(".").map((s) => parseInt(s, 10));
    const n = Math.max(ap.length, bp.length);
    for (let i = 0; i < n; i++) {
      const x = ap[i] ?? 0, y = bp[i] ?? 0;
      if (Number.isNaN(x) || Number.isNaN(y)) return a.localeCompare(b);
      if (x !== y) return x - y;
    }
    return 0;
  };

  // Health summary across the mission
  const healthCounts = useMemo(() => {
    let g = 0, y = 0, r = 0;
    for (const q of questions) {
      if (q.health === "red") r++;
      else if (q.health === "yellow") y++;
      else g++;
    }
    return { total: questions.length, green: g, yellow: y, red: r };
  }, [questions]);

  const myUrgentCount = useMemo(
    () => myQuestions.filter((q) => q.health === "red" || q.health === "yellow").length,
    [myQuestions],
  );

  // "Other" questions = everything not assigned to me (for writers).
  // Non-writers see all questions in this section.
  const otherQuestions = useMemo(
    () => (isWriter && me ? questions.filter((q) => q.assigned_writer_id !== me) : questions),
    [questions, me, isWriter],
  );

  // Group others by RFP section, sorted naturally by question_number within each.
  const groupedOthers = useMemo(() => {
    const map = new Map<string, Q[]>();
    for (const q of otherQuestions) {
      const sec = q.section_number?.trim() || "Unsectioned";
      if (!map.has(sec)) map.set(sec, []);
      map.get(sec)!.push(q);
    }
    const entries = Array.from(map.entries()).map(([section, items]) => ({
      section,
      items: [...items].sort((a, b) => cmpNum(a.question_number, b.question_number)),
    }));
    entries.sort((a, b) => {
      if (a.section === "Unsectioned") return 1;
      if (b.section === "Unsectioned") return -1;
      return cmpNum(a.section, b.section);
    });
    return entries;
  }, [otherQuestions]);

  const actionQuestion = useMemo(() => {
    const pool = myQuestions.length > 0 ? myQuestions : questions;
    return sortForWriter(pool)[0] ?? null;
  }, [myQuestions, questions]);

  // ADD 4: status update mutation
  const meName = meProfile?.display_name || meProfile?.email?.split("@")[0] || "Unknown";
  async function updateStatus(q: Q, newDb: string) {
    if (!me) {
      toast.error("Not signed in");
      return;
    }
    const prev = q.status;
    // Optimistic update
    qc.setQueryData<Q[]>(["mission-questions-v2", missionId], (old) =>
      (old ?? []).map((r) => (r.id === q.id ? { ...r, status: newDb } : r)),
    );

    const { error: e1 } = await supabase
      .from("question_records")
      .update({ status: newDb })
      .eq("id", q.id);
    if (e1) {
      qc.setQueryData<Q[]>(["mission-questions-v2", missionId], (old) =>
        (old ?? []).map((r) => (r.id === q.id ? { ...r, status: prev } : r)),
      );
      toast.error(e1.message);
      return;
    }

    const uiLabel = statusUiLabel(newDb);
    const { error: e2 } = await supabase.from("question_collaboration").insert({
      question_id: q.id,
      mission_id: missionId,
      author_id: me,
      author_name: meName,
      entry_type: "note",
      body: `Status updated to ${uiLabel}`,
    });
    if (e2) {
      // Non-fatal; status changed, just log
      console.warn("Failed to record status note", e2);
    }
    qc.invalidateQueries({ queryKey: ["mission-collabs-latest", missionId] });
    toast.success(`Status: ${uiLabel}`);
  }

  function statusNote(q: Q): string {
    const days = daysUntil(q.pens_down_date);
    if (q.health === "red" && conflictByQ[q.id]) {
      return `Alignment conflict — ${conflictByQ[q.id].description.slice(0, 80)}`;
    }
    const items = collabsByQ[q.id] ?? [];
    if ((q.health === "red" || q.health === "yellow") && items.some((i) => i.entry_type === "sme_request")) {
      return "Awaiting SME response";
    }
    if ((q.health === "red" || q.health === "yellow") && items.some((i) => i.entry_type === "decision_needed")) {
      return "Decision needed";
    }
    if (
      (!q.status || q.status === "not_started") &&
      days !== null && days >= 0 && days <= 14
    ) {
      return "No draft started";
    }
    if (q.health === "green") return "On track";
    return "";
  }

  return (
    <div className="mx-auto max-w-[1200px] px-8 pb-32 pt-10">
      <div className="mb-6">
        <div className="text-[10px] font-semibold uppercase tracking-[0.32em]" style={{ color: "#3b7fff" }}>Questions</div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Your Workspace</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your questions. Your deadline. Help one click away.</p>
      </div>

      <StudioHealthStrip missionId={missionId} />
      <div className="h-4" />
      <StudioVaultOraclePeek missionId={missionId} />

      {isWriter && <WriterBriefPanel missionId={missionId} myQuestions={myQuestions} collabsByQ={collabsByQ} />}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        {isWriter && (
          <div className="inline-flex items-center gap-2 text-[12px] text-muted-foreground">
            <span className="font-semibold text-foreground">My Assignments</span>
            <span className="rounded-full bg-white/[0.08] px-1.5 py-px text-[11px] font-medium text-muted-foreground">
              {myQuestions.length}
            </span>
            {myUrgentCount > 0 && (
              <span
                className="rounded-full px-1.5 py-px text-[11px] font-medium"
                style={{ background: "rgba(245,158,11,0.15)", color: "var(--yellow,#f59e0b)" }}
              >
                {myUrgentCount} need attention
              </span>
            )}
          </div>
        )}
        <div className="ml-auto" />
        <button
          onClick={() => setFiltersOpen((o) => !o)}
          className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <FilterIcon className="h-3 w-3" /> Filter
          {filtersOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>
      </div>

      {filtersOpen && (
        <div className="mb-4 rounded-md border border-border bg-surface/60 p-3 text-xs text-muted-foreground">
          No additional filters configured. Your assigned questions are shown first; expand "Other questions" below to see the rest of the mission.
        </div>
      )}

      {isLoading ? (
        <div className="rounded-[12px] border border-border bg-surface p-8 text-center text-sm text-muted-foreground">
          Loading responses…
        </div>
      ) : (
        <>
          {isWriter && (
            myQuestionsSorted.length === 0 ? (
              <div className="rounded-[12px] border border-dashed border-border bg-surface/40 p-12 text-center text-sm text-muted-foreground">
                <div className="font-medium text-foreground">No questions assigned yet.</div>
                <div className="mt-1">Your Engagement Lead will assign questions in Olympus.</div>
              </div>
            ) : (
              <ul className="divide-y divide-border rounded-[12px] border border-border bg-surface">
                {myQuestionsSorted.map((q) => (
                  <QuestionRow
                    key={q.id}
                    q={q}
                    me={me}
                    missionId={missionId}
                    writerById={writerById}
                    lastEditByQ={lastEditByQ}
                    conflictByQ={conflictByQ}
                    questionsById={Object.fromEntries(questions.map((x) => [x.id, x]))}
                    statusNote={statusNote}
                    updateStatus={updateStatus}
                    isWriter={isWriter}
                    showYouBadge={false}
                    onOpenReadOnly={setDrawerQ}
                  />
                ))}
              </ul>
            )
          )}

          {otherQuestions.length > 0 && (
            <div className={isWriter ? "mt-8" : ""}>
              <button
                onClick={() => setOthersOpen((o) => !o)}
                className="flex w-full items-center justify-between rounded-[10px] border border-border bg-surface/60 px-4 py-2.5 text-left transition hover:bg-surface"
              >
                <div className="flex items-center gap-2">
                  {othersOpen ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="text-[13px] font-semibold text-foreground">
                    {isWriter ? "Other questions in this mission" : "All questions"}
                  </span>
                  <span className="rounded-full bg-white/[0.08] px-1.5 py-px text-[11px] font-medium text-muted-foreground">
                    {otherQuestions.length}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /><span className="text-emerald-400">{healthCounts.green}</span></span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-yellow-500" /><span className="text-yellow-400">{healthCounts.yellow}</span></span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" /><span className="text-red-400">{healthCounts.red}</span></span>
                </div>
              </button>

              {othersOpen && (
                <div className="mt-3 space-y-6">
                  {groupedOthers.map(({ section, items }) => (
                    <div key={section}>
                      <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                        <div className="flex items-center justify-between border-b border-border pb-1.5 pt-1">
                          <span>Section {section}</span>
                          <span className="text-muted-foreground/70">{items.length} {items.length === 1 ? "question" : "questions"}</span>
                        </div>
                      </div>
                      <ul className="divide-y divide-border rounded-[12px] border border-border bg-surface">
                        {items.map((q) => (
                          <QuestionRow
                            key={q.id}
                            q={q}
                            me={me}
                            missionId={missionId}
                            writerById={writerById}
                            lastEditByQ={lastEditByQ}
                            conflictByQ={conflictByQ}
                            questionsById={Object.fromEntries(questions.map((x) => [x.id, x]))}
                            statusNote={statusNote}
                            updateStatus={updateStatus}
                            isWriter={isWriter}
                            showYouBadge
                            onOpenReadOnly={setDrawerQ}
                          />
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
      {actionQuestion && <CockpitListActionBar missionId={missionId} question={actionQuestion} />}
      {drawerQ && (
        <ReadOnlyQuestionDrawer
          q={drawerQ}
          writer={drawerQ.assigned_writer_id ? writerById[drawerQ.assigned_writer_id] : null}
          onClose={() => setDrawerQ(null)}
        />
      )}
    </div>
  );
}
