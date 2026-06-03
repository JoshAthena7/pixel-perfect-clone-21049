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

  return (
    <>
      <div
        className="fixed inset-x-0 bottom-[58px] z-40 border-t border-border bg-background/95 backdrop-blur md:bottom-0"
      >
        <div className="mx-auto max-w-[1100px] px-6 pt-2 text-center text-[11px] text-muted-foreground max-md:hidden">
          Q{question.question_number} is your {urgency} question.
        </div>
        <div className="mx-auto flex h-16 max-w-[1100px] items-center justify-between gap-3 px-6">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => openUpdateReality(question.id)}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
            >
              Update Reality
            </button>
            <Link
              to="/missions/$missionId/questions/$questionId"
              params={{ missionId, questionId: question.id }}
              className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 px-4 py-2 text-sm font-semibold text-primary transition hover:bg-primary/10"
            >
              <Sparkles className="h-3.5 w-3.5" /> Ask IRIS
            </Link>
          </div>

          <div className="hidden min-w-0 flex-1 items-center justify-center gap-2 text-[12px] text-muted-foreground md:flex">
            <span className="font-mono">Q{question.question_number}</span>
            <span className="truncate">· {question.title}</span>
            {days !== null && <span className="shrink-0">· {days} days</span>}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => setOverflowOpen((open) => !open)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border bg-surface text-muted-foreground transition hover:text-foreground"
                aria-label="More Cockpit actions"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
              {overflowOpen && (
                <div className="absolute bottom-[calc(100%+8px)] right-0 z-50 w-48 overflow-hidden rounded-md border border-border bg-surface shadow-lg">
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

  const [view, setView] = useState<View>("mine");
  const [filtersOpen, setFiltersOpen] = useState(false);

  // For non-writers, default to All
  const effectiveView: View = isWriter === false ? "all" : view;

  const { data: questions = [], isLoading } = useQuery({
    queryKey: ["mission-questions-v2", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("question_records")
        .select("id,mission_id,question_number,title,pens_down_date,assigned_writer_id,health,status,current_score")
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

  const visible = effectiveView === "mine" ? myQuestions : questions;

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
    <div className="mx-auto max-w-[1200px] px-8 py-10">
      <div className="mb-6">
        <div className="text-[10px] font-semibold uppercase tracking-[0.32em]" style={{ color: "#3b7fff" }}>Questions</div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Your Workspace</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your questions. Your deadline. Help one click away.</p>
      </div>

      <StudioHealthStrip missionId={missionId} />
      <div className="h-4" />
      <StudioVaultOraclePeek missionId={missionId} />

      {isWriter && <WriterBriefPanel missionId={missionId} myQuestions={myQuestions} collabsByQ={collabsByQ} />}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {isWriter && (
          <div className="inline-flex rounded-full border border-border bg-surface p-0.5">
            {(["mine", "all"] as View[]).map((k) => (
              <button
                key={k}
                onClick={() => setView(k)}
                className={`rounded-full px-3 py-1 text-xs transition ${
                  view === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {k === "mine" ? "My Assignments" : "All Assignments"}
              </button>
            ))}
          </div>
        )}
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
          No additional filters configured. Use the toggle to switch between My Assignments and All Assignments.
        </div>
      )}

      {isLoading ? (
        <div className="rounded-[12px] border border-border bg-surface p-8 text-center text-sm text-muted-foreground">
          Loading responses…
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-[12px] border border-dashed border-border bg-surface/40 p-12 text-center text-sm text-muted-foreground">
          {effectiveView === "mine" ? "You have no assigned questions on this mission." : "No responses yet."}
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-[12px] border border-border bg-surface">
          {visible.map((q) => {
            const writer = q.assigned_writer_id ? writerById[q.assigned_writer_id] : null;
            const lastEdit = lastEditByQ[q.id];
            const note = statusNote(q);
            return (
              <li key={q.id} className="relative">
                <Link
                  to="/missions/$missionId/questions/$questionId"
                  params={{ missionId, questionId: q.id }}
                  className="block px-5 py-4 hover:bg-surface-hover"
                >
                  <div className="flex items-center gap-3">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${HEALTH_DOT[q.health ?? "yellow"] ?? "bg-muted"}`} />
                    <span className="font-mono text-[11px] text-muted-foreground shrink-0">Q{q.question_number}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">· {q.title}</span>

                    {/* ADD 1: Pens Down countdown */}
                    <PensDownCountdown date={q.pens_down_date} />

                    {/* ADD 4: status pill */}
                    <StatusPill current={q.status} onChange={(db) => updateStatus(q, db)} />

                    {/* ADD 2: last-edited indicator (rightmost) */}
                    <span className="shrink-0 text-[11px] text-muted-foreground/80 min-w-[140px] text-right">
                      {lastEdit
                        ? `Updated ${timeAgo(lastEdit.created_at)} by ${firstName(lastEdit.author_name)}`
                        : "Not yet started"}
                    </span>
                  </div>
                  {(note || (!isWriter && writer)) && (
                    <div className="mt-1 pl-[1.5rem] text-[11px] text-muted-foreground">
                      {note}
                      {!isWriter && writer && (
                        <span className="ml-3 opacity-70">· {writer.display_name || writer.email}</span>
                      )}
                    </div>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
