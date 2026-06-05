import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { daysUntil } from "@/lib/countdowns";
import { openUpdateReality } from "@/components/v2/UpdateRealityModal";
import { SOSModal, SOSButton } from "@/components/v2/SOSButton";
import { AssistsBar } from "@/components/v4/AssistsBar";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScoreMeOverlay } from "@/components/v2/ScoreMeOverlay";
import { PhoneAFriendOverlay } from "@/components/v2/PhoneAFriendOverlay";
import { LegacyRecord } from "@/components/v4/LegacyRecord";
import { DailyPulse } from "@/components/v4/DailyPulse";
import {
  Sparkles,
  Target,
  Phone,
  AlertTriangle,
  Zap,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Flag,
  Calendar,
  ClipboardList,
} from "lucide-react";

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

type Props = {
  missionId: string;
  me: string;
  myQuestions: Q[];
  allQuestions: Q[];
  updateStatus: (q: Q, db: string) => Promise<void>;
};

const STATUS_LABEL: Record<string, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  ready_for_review: "In review",
  approved: "Complete",
};

function statusLabel(db: string | null | undefined) {
  return STATUS_LABEL[db ?? "not_started"] ?? "Not started";
}

function statusClass(db: string | null | undefined) {
  const v = db ?? "not_started";
  if (v === "in_progress") return "bg-sky-500/10 text-sky-300 border-sky-500/25";
  if (v === "ready_for_review") return "bg-amber-500/10 text-amber-300 border-amber-500/25";
  if (v === "approved") return "bg-emerald-500/10 text-emerald-300 border-emerald-500/25";
  return "bg-muted/40 text-muted-foreground border-border";
}

function fmtShort(date: string | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function healthTone(h: Q["health"]): { dot: string; text: string; bg: string; border: string } {
  if (h === "red") return { dot: "bg-red-500", text: "text-red-400", bg: "bg-red-500/5", border: "border-red-500/30" };
  if (h === "yellow") return { dot: "bg-amber-400", text: "text-amber-300", bg: "bg-amber-500/5", border: "border-amber-500/30" };
  return { dot: "bg-emerald-500", text: "text-emerald-400", bg: "bg-emerald-500/5", border: "border-emerald-500/30" };
}

// ---------- Status strip ----------

function StatusStrip({
  missionTitle,
  missionHealth,
  attentionCount,
  pensDownDays,
  pensDownLabel,
  gateName,
  gateDays,
  submitDays,
  submitDate,
  myCount,
  greenCount,
}: {
  missionTitle: string;
  missionHealth: "red" | "yellow" | "green";
  attentionCount: number;
  pensDownDays: number | null;
  pensDownLabel: string;
  gateName: string | null;
  gateDays: number | null;
  submitDays: number | null;
  submitDate: string;
  myCount: number;
  greenCount: number;
}) {
  const tone = healthTone(missionHealth);
  return (
    <section
      className={`rounded-[12px] border ${tone.border} ${tone.bg} px-6 py-4`}
      aria-label="Mission status"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${tone.dot}`} />
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Mission · {missionHealth === "green" ? "On track" : missionHealth === "yellow" ? "Needs attention" : "At risk"}
          </span>
        </div>
        <span className="truncate text-xs text-muted-foreground">{missionTitle}</span>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Cell label="Your queue" value={String(myCount)} sub={`${greenCount} on track`} />
        <Cell
          label="Pens down"
          value={pensDownDays !== null ? `${pensDownDays}d` : "—"}
          sub={pensDownLabel}
          tone={pensDownDays !== null && pensDownDays < 14 ? "warn" : "default"}
        />
        <Cell
          label="Next gate"
          value={gateName ?? "—"}
          sub={gateDays !== null ? `${gateDays}d` : "Not scheduled"}
          tone={gateDays !== null && gateDays < 7 ? "warn" : "default"}
        />
        <Cell
          label="Submission"
          value={submitDays !== null ? `${submitDays}d` : "—"}
          sub={submitDate}
        />
        <Cell
          label="Attention"
          value={attentionCount === 0 ? "Clear" : String(attentionCount)}
          sub={attentionCount === 0 ? "Nothing flagged" : "Need a look"}
          tone={attentionCount > 0 ? "warn" : "default"}
        />
      </div>
    </section>
  );
}

function Cell({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "default" | "warn";
}) {
  return (
    <div className="rounded-[8px] border border-border/60 bg-background/40 px-3 py-2.5">
      <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </div>
      <div className={`mt-1 text-lg font-medium tracking-tight ${tone === "warn" ? "text-amber-300" : "text-foreground"}`}>
        {value}
      </div>
      <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{sub}</div>
    </div>
  );
}

// ---------- IRIS Mission Briefing ----------

function MissionBriefing({
  missionId,
  briefText,
  suggested,
  pensDownDays,
  gateName,
  gateDays,
}: {
  missionId: string;
  briefText: string | null;
  suggested: Q | null;
  pensDownDays: number | null;
  gateName: string | null;
  gateDays: number | null;
}) {
  const fallback = `${
    suggested ? `Q${suggested.question_number} is your priority — ${suggested.title}. ` : ""
  }${
    pensDownDays !== null ? `${pensDownDays} days to pens down. ` : ""
  }${gateName ? `${gateName} in ${gateDays} days. ` : ""}Stay focused on what's urgent.`;

  const text = (briefText && briefText.trim()) || fallback;

  return (
    <section
      className="rounded-[12px] border border-sky-500/25 bg-sky-500/[0.04] px-6 py-5"
      aria-label="IRIS mission briefing"
    >
      <div className="mb-3 flex items-center gap-2">
        <span className="iris-dot-v4" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-300">
          IRIS · Today's briefing
        </span>
      </div>
      <p className="text-[14px] leading-relaxed text-foreground/85">
        {text.split(/(?<=[.!?])\s+/).slice(0, 3).join(" ")}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        <Link
          to="/missions/$missionId"
          params={{ missionId }}
          className="inline-flex items-center gap-1 hover:text-foreground"
        >
          <ClipboardList className="h-3 w-3" /> Mission room
        </Link>
        <span className="opacity-30">·</span>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("atlas:open-ask-iris", { detail: { missionId, questionId: suggested?.id } }))}
          className="inline-flex items-center gap-1 hover:text-foreground"
        >
          <Sparkles className="h-3 w-3" /> Ask IRIS
        </button>
      </div>
      <style>{`
        .iris-dot-v4 {
          width: 7px; height: 7px; border-radius: 50%; background: #38bdf8;
          box-shadow: 0 0 8px rgba(56,189,248,0.6);
          animation: iris-pulse-v4 2.5s infinite;
        }
        @keyframes iris-pulse-v4 {
          0%,100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </section>
  );
}

// ---------- Focus Stack (top 3) ----------

function FocusStack({
  missionId,
  questions,
  updateStatus,
}: {
  missionId: string;
  questions: Q[];
  updateStatus: (q: Q, db: string) => Promise<void>;
}) {
  const top3 = questions.slice(0, 3);

  return (
    <section className="rounded-[12px] border border-border bg-surface px-6 py-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Your focus today
          </div>
          <p className="mt-1 text-sm text-foreground/80">
            {top3.length === 0 ? "Nothing assigned yet — head to All questions below." : `${top3.length} question${top3.length === 1 ? "" : "s"} ordered by urgency.`}
          </p>
        </div>
        {questions.length > 3 && (
          <span className="text-[11px] text-muted-foreground">+{questions.length - 3} more in your queue</span>
        )}
      </div>

      {top3.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-border bg-background/40 px-5 py-8 text-center">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            No questions assigned to you yet
          </div>
          <p className="mt-2 text-sm text-foreground/70 max-w-md mx-auto">
            When a mission lead assigns you a question, it will appear here at the top of your Cockpit — and in the <span className="text-foreground font-medium">All Questions</span> list below with a “Mine” badge.
          </p>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Browse open questions below to volunteer for one.
          </p>
        </div>
      ) : (
        <ol className="space-y-3">
          {top3.map((q, i) => (
            <FocusItem key={q.id} q={q} missionId={missionId} index={i} updateStatus={updateStatus} primary={i === 0} />
          ))}
        </ol>
      )}
    </section>
  );
}

function FocusItem({
  q,
  missionId,
  index,
  updateStatus,
  primary,
}: {
  q: Q;
  missionId: string;
  index: number;
  updateStatus: (q: Q, db: string) => Promise<void>;
  primary: boolean;
}) {
  const tone = healthTone(q.health);
  const days = daysUntil(q.pens_down_date);
  const [pending, setPending] = useState(false);

  async function nextStatus() {
    const flow: Record<string, string> = {
      not_started: "in_progress",
      in_progress: "ready_for_review",
      ready_for_review: "approved",
      approved: "approved",
    };
    const next = flow[q.status ?? "not_started"];
    if (next === q.status) return;
    setPending(true);
    try {
      await updateStatus(q, next);
    } finally {
      setPending(false);
    }
  }

  return (
    <li
      className={`group relative overflow-hidden rounded-[10px] border ${primary ? "border-sky-500/40 bg-sky-500/[0.04]" : "border-border bg-background/40"} px-4 py-3 transition hover:border-foreground/30`}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-foreground/5 text-[11px] font-semibold text-foreground/70">
          {index + 1}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${tone.dot}`} />
            <span className="font-mono text-[11px] text-muted-foreground">Q{q.question_number}</span>
            <span className={`rounded-full border px-2 py-px text-[10px] font-medium ${statusClass(q.status)}`}>
              {statusLabel(q.status)}
            </span>
            {days !== null && (
              <span className={`text-[11px] ${days < 7 ? "text-red-400" : days < 14 ? "text-amber-300" : "text-muted-foreground"}`}>
                <Calendar className="mr-1 inline h-3 w-3" />
                {days}d to pens down
              </span>
            )}
          </div>
          <div className="mt-1.5 truncate text-[14px] font-medium text-foreground">{q.title}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {q.status !== "approved" && (
            <button
              onClick={nextStatus}
              disabled={pending}
              className="rounded-md border border-border bg-surface px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              {pending ? "…" : "Advance"}
            </button>
          )}
          <Link
            to="/missions/$missionId/questions/$questionId"
            params={{ missionId, questionId: q.id }}
            className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-[12px] font-semibold ${primary ? "bg-foreground text-background hover:opacity-90" : "border border-border text-foreground hover:bg-surface-hover"}`}
          >
            Open <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </li>
  );
}

// ---------- Assists row ----------

function AssistsRow({
  missionId,
  suggestedId,
  openSOS: _openSOS,
  openScore,
  openPhone,
  openPulse,
  openThread,
}: {
  missionId: string;
  suggestedId: string | null;
  openSOS: () => void;
  openScore: () => void;
  openPhone: () => void;
  openPulse: () => void;
  openThread: () => void;
}) {
  return (
    <section className="rounded-[12px] border border-border bg-surface overflow-hidden">
      <AssistsBar
        onUpdateReality={() => openUpdateReality(suggestedId)}
        onScoreMe={openScore}
        onPhone={() => {
          if (!suggestedId) { toast("Pick a question first to use Phone a Friend"); return; }
          openPhone();
        }}
        onPulse={openPulse}
        onThread={() => {
          if (!suggestedId) { toast("Open a question to use Thread"); return; }
          openThread();
        }}
        sosSlot={<SOSButton missionId={missionId} questionId={suggestedId ?? undefined} />}
      />
    </section>
  );
}

// ---------- All-questions drawer ----------

function AllQuestionsDrawer({
  missionId,
  allQuestions,
  me,
}: {
  missionId: string;
  allQuestions: Q[];
  me: string;
}) {
  const [open, setOpen] = useState(false);
  const counts = useMemo(() => {
    let r = 0, y = 0, g = 0;
    for (const q of allQuestions) {
      if (q.health === "red") r++;
      else if (q.health === "yellow") y++;
      else g++;
    }
    return { r, y, g };
  }, [allQuestions]);

  return (
    <section className="rounded-[12px] border border-border bg-surface">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-6 py-4 text-left"
      >
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            All questions
          </div>
          <div className="mt-1 text-sm text-foreground/80">
            {allQuestions.length} across the mission · click to {open ? "collapse" : "browse"}
          </div>
        </div>
        <div className="flex items-center gap-4 text-[12px]">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /><span className="text-emerald-400">{counts.g}</span></span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" /><span className="text-amber-300">{counts.y}</span></span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" /><span className="text-red-400">{counts.r}</span></span>
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>
      {open && (
        <ul className="divide-y divide-border/60 border-t border-border/60">
          {allQuestions.map((q) => {
            const tone = healthTone(q.health);
            const days = daysUntil(q.pens_down_date);
            const isMine = q.assigned_writer_id === me;
            return (
              <li key={q.id}>
                <Link
                  to="/missions/$missionId/questions/$questionId"
                  params={{ missionId, questionId: q.id }}
                  className="flex items-center gap-3 px-6 py-3 text-sm hover:bg-surface-hover"
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${tone.dot}`} />
                  <span className="w-12 shrink-0 font-mono text-[11px] text-muted-foreground">Q{q.question_number}</span>
                  {isMine && (
                    <span className="rounded bg-sky-500/15 px-1.5 py-px text-[9px] font-bold tracking-[0.1em] text-sky-300">
                      YOU
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-foreground/85">{q.title}</span>
                  <span className={`shrink-0 rounded-full border px-2 py-px text-[10px] ${statusClass(q.status)}`}>
                    {statusLabel(q.status)}
                  </span>
                  <span className={`w-12 shrink-0 text-right text-[11px] ${days !== null && days < 7 ? "text-red-400" : days !== null && days < 14 ? "text-amber-300" : "text-muted-foreground"}`}>
                    {days !== null ? `${days}d` : "—"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ---------- Co-pilot broadcast banner ----------

function CoPilotBanner({ missionId, me }: { missionId: string; me: string }) {
  const qc = useQueryClient();
  const { data: messages = [] } = useQuery({
    queryKey: ["cockpit-v4-copilot", missionId, me],
    queryFn: async () => {
      const { data: bs } = await supabase
        .from("broadcasts")
        .select("id,from_name,text,created_at,mission_id")
        .eq("mission_id", missionId)
        .order("created_at", { ascending: false })
        .limit(20);
      const ids = (bs ?? []).map((b: any) => b.id);
      if (ids.length === 0) return [];
      const { data: reads } = await supabase
        .from("note_reads").select("note_id").eq("user_id", me).in("note_id", ids);
      const seen = new Set((reads ?? []).map((r: any) => r.note_id));
      return (bs ?? []).filter((b: any) => !seen.has(b.id));
    },
  });
  const ack = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("note_reads").insert({ note_id: id, user_id: me, mission_id: missionId });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cockpit-v4-copilot", missionId, me] }),
  });

  if (messages.length === 0) return null;
  const m: any = messages[0];
  const sender = (m.from_name ?? "Lead").split(/\s+/)[0];

  return (
    <div className="flex items-center gap-3 rounded-[10px] border border-amber-500/30 bg-amber-500/[0.05] px-4 py-3">
      <Flag className="h-4 w-4 shrink-0 text-amber-400" />
      <div className="min-w-0 flex-1 text-sm">
        <span className="font-semibold text-amber-300">{sender}</span>
        <span className="text-muted-foreground"> → </span>
        <span className="text-foreground/80">"{m.text}"</span>
      </div>
      <button
        onClick={() => ack.mutate(m.id)}
        className="shrink-0 rounded-md border border-amber-500/40 px-3 py-1 text-[11px] font-semibold text-amber-300 hover:bg-amber-500/10"
      >
        Got it
      </button>
    </div>
  );
}

// ---------- Main ----------

export function CockpitV4({ missionId, me, myQuestions, allQuestions, updateStatus }: Props) {
  const [sosOpen, setSosOpen] = useState(false);
  const [scoreOpen, setScoreOpen] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [pulseOpen, setPulseOpen] = useState(false);
  const [threadOpen, setThreadOpen] = useState(false);

  const { data: mission } = useQuery({
    queryKey: ["cockpit-v4-mission", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("missions")
        .select("submission_date,name,title")
        .eq("id", missionId)
        .maybeSingle();
      return data as { submission_date: string | null; name: string | null; title: string | null } | null;
    },
  });

  const { data: nextGate } = useQuery({
    queryKey: ["cockpit-v4-gate", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_review_gates")
        .select("gate_name,target_date")
        .eq("mission_id", missionId)
        .order("target_date", { ascending: true });
      return (data ?? []).find((g: any) => g.target_date && new Date(g.target_date) >= new Date()) ?? null;
    },
  });

  const { data: briefRow } = useQuery({
    queryKey: ["cockpit-v4-brief", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("iris_brief_cache")
        .select("brief_text")
        .eq("scope", "mission")
        .eq("ref_id", missionId)
        .maybeSingle();
      return data as { brief_text: string | null } | null;
    },
  });

  useEffect(() => {
    const onSOS = () => setSosOpen(true);
    const onScore = () => setScoreOpen(true);
    const onPhone = () => setPhoneOpen(true);
    window.addEventListener("atlas:open-sos", onSOS as EventListener);
    window.addEventListener("atlas:open-score-me", onScore as EventListener);
    window.addEventListener("atlas:open-phone-a-friend", onPhone as EventListener);
    return () => {
      window.removeEventListener("atlas:open-sos", onSOS as EventListener);
      window.removeEventListener("atlas:open-score-me", onScore as EventListener);
      window.removeEventListener("atlas:open-phone-a-friend", onPhone as EventListener);
    };
  }, []);

  const counts = useMemo(() => {
    let r = 0, y = 0, g = 0;
    for (const q of myQuestions) {
      if (q.health === "red") r++;
      else if (q.health === "yellow") y++;
      else g++;
    }
    return { r, y, g };
  }, [myQuestions]);

  const overallHealth: "red" | "yellow" | "green" =
    counts.r > 0 ? "red" : counts.y > 0 ? "yellow" : "green";

  const myQuestionsSorted = useMemo(() => {
    return [...myQuestions].sort((a, b) => {
      const rank = (h: Q["health"]) => (h === "red" ? 0 : h === "yellow" ? 1 : h === "green" ? 3 : 2);
      const d = rank(a.health) - rank(b.health);
      if (d !== 0) return d;
      return (daysUntil(a.pens_down_date) ?? 9999) - (daysUntil(b.pens_down_date) ?? 9999);
    });
  }, [myQuestions]);

  const suggestedQ = myQuestionsSorted[0] ?? null;
  const nearestPensDown = useMemo(
    () =>
      [...myQuestions]
        .filter((q) => q.pens_down_date)
        .sort((a, b) => new Date(a.pens_down_date!).getTime() - new Date(b.pens_down_date!).getTime())[0] ?? null,
    [myQuestions],
  );

  const pensDownDays = nearestPensDown ? daysUntil(nearestPensDown.pens_down_date) : null;
  const gateDays = nextGate?.target_date ? daysUntil(nextGate.target_date) : null;
  const submitDays = mission?.submission_date ? daysUntil(mission.submission_date) : null;
  const attentionCount = counts.r + counts.y;

  const missionTitle =
    mission?.name?.trim() || mission?.title?.trim() || "This mission";

  return (
    <div className="mx-auto max-w-[1200px] px-6 pb-24 pt-6">
      <header className="mb-6">
        <div className="text-[10px] font-semibold uppercase tracking-[0.32em] text-sky-400">Cockpit</div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Your seat for {missionTitle}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The full picture, the next move, and every assist — in one read.
        </p>
      </header>

      <div className="space-y-5">
        <CoPilotBanner missionId={missionId} me={me} />

        <StatusStrip
          missionTitle={missionTitle}
          missionHealth={overallHealth}
          attentionCount={attentionCount}
          pensDownDays={pensDownDays}
          pensDownLabel={nearestPensDown?.pens_down_date ? fmtShort(nearestPensDown.pens_down_date) : "No pens-down set"}
          gateName={nextGate?.gate_name ?? null}
          gateDays={gateDays}
          submitDays={submitDays}
          submitDate={mission?.submission_date ? fmtShort(mission.submission_date) : "TBD"}
          myCount={myQuestions.length}
          greenCount={counts.g}
        />

        <MissionBriefing
          missionId={missionId}
          briefText={briefRow?.brief_text ?? null}
          suggested={suggestedQ}
          pensDownDays={pensDownDays}
          gateName={nextGate?.gate_name ?? null}
          gateDays={gateDays}
        />

        <FocusStack missionId={missionId} questions={myQuestionsSorted} updateStatus={updateStatus} />

        <AssistsRow
          missionId={missionId}
          suggestedId={suggestedQ?.id ?? null}
          openSOS={() => setSosOpen(true)}
          openScore={() => setScoreOpen(true)}
          openPhone={() => setPhoneOpen(true)}
          openPulse={() => setPulseOpen(true)}
        />

        <Sheet open={pulseOpen} onOpenChange={setPulseOpen}>
          <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
            <SheetHeader><SheetTitle>Daily Pulse</SheetTitle></SheetHeader>
            <div className="mt-4"><DailyPulse /></div>
          </SheetContent>
        </Sheet>

        <DailyPulse />

        <LegacyRecord />

        <AllQuestionsDrawer missionId={missionId} allQuestions={allQuestions} me={me} />
      </div>

      {sosOpen && <SOSModal missionId={missionId} onClose={() => setSosOpen(false)} />}
      <ScoreMeOverlay
        open={scoreOpen}
        onClose={() => setScoreOpen(false)}
        missionId={missionId}
        lockedQuestionId={suggestedQ?.id}
      />
      {phoneOpen && suggestedQ && (
        <PhoneAFriendOverlay
          missionId={missionId}
          questionId={suggestedQ.id}
          questionNumber={suggestedQ.question_number}
          meId={me}
          meName=""
          onClose={() => setPhoneOpen(false)}
        />
      )}
    </div>
  );
}
