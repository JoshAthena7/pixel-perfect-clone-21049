import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  MessageSquare,
  Phone,
  Target,
  Activity,
  AlertTriangle,
  Radar,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { ThreadPanel } from "./ThreadPanel";
import { PhoneAFriendDialog } from "./PhoneAFriendDialog";
import { ScoreMeDialog } from "./ScoreMeDialog";
import { SOSDialog } from "./SOSDialog";
import { MissionPulsePanel } from "./MissionPulsePanel";
import { MissionCloseDebriefDialog } from "./MissionCloseDebriefDialog";
import { irisScoreGapAnalysis } from "@/lib/iris-score-gap-analysis.functions";

const CLOSED_STATUSES = new Set(["closed", "won", "lost", "win", "loss", "no_award", "cancelled"]);

function useMissionCloseDebriefTrigger(missionId: string) {
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ["mission-close-debrief-status", missionId],
    queryFn: async () => {
      const [{ data: m }, { data: ms }] = await Promise.all([
        supabase
          .from("missions")
          .select("status, debrief_completed")
          .eq("id", missionId)
          .maybeSingle(),
        supabase
          .from("mission_milestones")
          .select("id")
          .eq("mission_id", missionId)
          .eq("milestone_type", "award")
          .eq("status", "complete")
          .limit(1),
      ]);
      const statusClosed = m?.status ? CLOSED_STATUSES.has(String(m.status).toLowerCase()) : false;
      const awardComplete = (ms?.length ?? 0) > 0;
      return {
        debriefCompleted: !!m?.debrief_completed,
        shouldShow: !m?.debrief_completed && (statusClosed || awardComplete),
      };
    },
    staleTime: 30_000,
  });

  useEffect(() => {
    if (data?.shouldShow) setOpen(true);
  }, [data?.shouldShow]);

  return { open, setOpen };
}

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

type Props = {
  missionId: string;
  missionName: string;
};

type Filter = "all" | "not_started" | "in_progress" | "needs_review" | "complete";

export function FlightDeckV2({ missionId }: Props) {
  return (
    <div className="space-y-12">
      <ContextStrip missionId={missionId} />
      <WorkQueue missionId={missionId} />
      <ToolDock missionId={missionId} />
      <DailyPulse missionId={missionId} />
      <IrisAssistsSummary missionId={missionId} />
    </div>
  );
}

/* ─────────── 1. Context Strip ─────────── */
function ContextStrip({ missionId }: { missionId: string }) {
  const today = new Date().toISOString().slice(0, 10);

  const { data: focus } = useQuery({
    queryKey: ["fd-ctx-focus", missionId, today],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_daily_focus")
        .select("focus_text")
        .eq("mission_id", missionId)
        .eq("focus_date", today)
        .eq("status", "approved")
        .maybeSingle();
      return data;
    },
  });

  const { data: risk } = useQuery({
    queryKey: ["fd-ctx-risk", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_risks")
        .select("*")
        .eq("mission_id", missionId)
        .eq("status", "active");
      const order: Record<string, number> = { critical: 1, high: 2, medium: 3, low: 4 };
      const sorted = ((data ?? []) as any[]).sort(
        (a, b) => (order[a.severity ?? ""] ?? 9) - (order[b.severity ?? ""] ?? 9),
      );
      return sorted[0] ?? null;
    },
  });

  const { data: submission } = useQuery({
    queryKey: ["fd-ctx-sub", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_milestones")
        .select("milestone_date")
        .eq("mission_id", missionId)
        .eq("milestone_type", "submission")
        .order("milestone_date", { ascending: true })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const days = submission?.milestone_date
    ? Math.ceil(
        (new Date(submission.milestone_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
      )
    : null;
  const dayColor =
    days === null ? "rgba(255,255,255,0.5)" : days >= 60 ? GREEN : days >= 30 ? AMBER : RED;

  const focusText = focus?.focus_text
    ? focus.focus_text.length > 80
      ? focus.focus_text.slice(0, 80) + "…"
      : focus.focus_text
    : "Focus pending.";

  const sevColor = (s?: string) =>
    s === "critical" ? RED : s === "high" ? GOLD : s === "medium" ? AMBER : "rgba(255,255,255,0.4)";

  const Item = ({
    label,
    children,
    to,
  }: {
    label: string;
    children: React.ReactNode;
    to: string;
  }) => (
    <Link
      to={to}
      params={{ missionId }}
      className="flex-1 min-w-0 px-4 py-2 hover:bg-white/5 transition-colors rounded"
      style={{ textDecoration: "none", color: "inherit" }}
    >
      <div style={{ ...sectionLabel, fontSize: 9 }}>{label}</div>
      <div className="mt-0.5 truncate" style={{ fontSize: 13 }}>
        {children}
      </div>
    </Link>
  );

  return (
    <div
      className="rounded-lg flex flex-col sm:flex-row divide-y sm:divide-y-0 sm:divide-x"
      style={{
        background: CARD,
        border: `1px solid ${BORDER}`,
        borderColor: BORDER,
      }}
    >
      <Item label="Today's Focus" to="/missions/$missionId/briefing">
        {focusText}
      </Item>
      <Item label="Top Risk" to="/missions/$missionId/briefing">
        {risk ? (
          <span className="flex items-center gap-2">
            <span
              className="inline-block rounded-full"
              style={{ width: 8, height: 8, background: sevColor(risk.severity) }}
            />
            <span className="truncate">{risk.title}</span>
          </span>
        ) : (
          <span style={{ color: "rgba(255,255,255,0.5)" }}>No active risks</span>
        )}
      </Item>
      <Item label="Days Remaining" to="/missions/$missionId/briefing">
        <span style={{ color: dayColor, fontWeight: 600 }}>
          {days === null ? "Submission TBD" : `${days} days`}
        </span>
      </Item>
    </div>
  );
}

/* ─────────── 2. Work Queue ─────────── */
function WorkQueue({ missionId }: { missionId: string }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [memberId, setMemberId] = useState<string | null>(null);
  const [thread, setThread] = useState<{ id: string; number: string | null; text: string } | null>(
    null,
  );
  const navigate = useNavigate();
  const qc = useQueryClient();
  const scoreGap = useServerFn(irisScoreGapAnalysis);
  const [scoringId, setScoringId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc("current_atlas_member_id");
      setMemberId((data as string) ?? null);
    })();
  }, []);

  const { data: items = [] } = useQuery({
    queryKey: ["fd-queue", missionId, memberId],
    enabled: !!memberId,
    queryFn: async () => {
      const { data: asgs } = await supabase
        .from("mission_assignments")
        .select("id, question_id, due_date")
        .eq("mission_id", missionId)
        .eq("assigned_writer_id", memberId!);
      const qids = (asgs ?? []).map((a: any) => a.question_id).filter(Boolean);
      if (qids.length === 0) return [];
      const [qsRes, scoresRes] = await Promise.all([
        supabase
          .from("mission_questions")
          .select("id, question_number, question_text, section_id, due_date, status, word_limit")
          .in("id", qids),
        supabase
          .from("draft_scores")
          .select("question_id, overall_score, iris_recommendation, created_at")
          .in("question_id", qids)
          .order("created_at", { ascending: false }),
      ]);
      const latestScoreByQ = new Map<string, any>();
      for (const s of ((scoresRes as any).data ?? []) as any[]) {
        if (!latestScoreByQ.has(s.question_id)) latestScoreByQ.set(s.question_id, s);
      }
      const merged = ((qsRes as any).data ?? []).map((q: any) => {
        const asg = (asgs ?? []).find((a: any) => a.question_id === q.id);
        return {
          ...q,
          assignment_id: asg?.id ?? null,
          due_date: asg?.due_date ?? q.due_date ?? null,
          score: latestScoreByQ.get(q.id) ?? null,
        };
      });
      merged.sort((a: any, b: any) => {
        const ad = a.due_date ? new Date(a.due_date).getTime() : Infinity;
        const bd = b.due_date ? new Date(b.due_date).getTime() : Infinity;
        return ad - bd;
      });
      return merged;
    },
  });

  const filtered = useMemo(() => {
    if (filter === "all") return items;
    return items.filter((q: any) => (q.status ?? "not_started") === filter);
  }, [items, filter]);

  const runScoreMe = async (q: any) => {
    setScoringId(q.id);
    try {
      await scoreGap({ data: { missionId, questionId: q.id } });
      toast.success("IRIS analyzed your work");
      qc.invalidateQueries({ queryKey: ["fd-queue", missionId, memberId] });
    } catch (e) {
      console.error("[ScoreMe]", e);
      toast.error("Could not analyze — try again");
    } finally {
      setScoringId(null);
    }
  };

  const Filters = (
    <div className="flex flex-wrap gap-1 mb-4">
      {(
        [
          ["all", "All"],
          ["not_started", "Not Started"],
          ["in_progress", "In Progress"],
          ["needs_review", "Needs Review"],
          ["complete", "Complete"],
        ] as [Filter, string][]
      ).map(([k, label]) => {
        const active = filter === k;
        return (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            style={{
              padding: "6px 12px",
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
  );

  return (
    <section>
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <div style={sectionLabel}>My Work Queue</div>
          <h2 className="mt-1 font-bold" style={{ fontSize: 22 }}>
            What's on your plate
          </h2>
        </div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
          {items.length} {items.length === 1 ? "question" : "questions"}
        </div>
      </div>

      {Filters}

      {filtered.length === 0 ? (
        <EmptyQueue missionId={missionId} hasItems={items.length > 0} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((q: any) => (
            <QuestionCard
              key={q.id}
              q={q}
              missionId={missionId}
              onScoreMe={() => runScoreMe(q)}
              scoring={scoringId === q.id}
              onThread={() =>
                setThread({ id: q.id, number: q.question_number ?? null, text: q.question_text })
              }
            />
          ))}
        </div>
      )}

      <ThreadPanel
        open={!!thread}
        onClose={() => setThread(null)}
        missionId={missionId}
        questionId={thread?.id ?? null}
        questionNumber={thread?.number ?? null}
        questionText={thread?.text ?? null}
      />
    </section>
  );
}

function QuestionCard({
  q,
  missionId,
  onScoreMe,
  scoring,
  onThread,
}: {
  q: any;
  missionId: string;
  onScoreMe: () => void;
  scoring: boolean;
  onThread: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const status = (q.status ?? "not_started") as string;
  const statusMeta: Record<string, { label: string; color: string }> = {
    not_started: { label: "Not Started", color: "rgba(255,255,255,0.4)" },
    in_progress: { label: "In Progress", color: BLUE },
    needs_review: { label: "Needs Review", color: AMBER },
    complete: { label: "Complete", color: GREEN },
  };
  const sm = statusMeta[status] ?? statusMeta.not_started;

  const days = q.due_date
    ? Math.ceil((new Date(q.due_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;
  const dueColor = days === null ? "rgba(255,255,255,0.4)" : days < 3 ? RED : days <= 7 ? AMBER : GREEN;
  const dueLabel =
    days === null
      ? "No due date"
      : days < 0
      ? `Overdue by ${Math.abs(days)}d`
      : days === 0
      ? "Due today"
      : `Due in ${days} day${days === 1 ? "" : "s"}`;

  const score = q.score?.overall_score ?? null;
  const irisSuggestion = q.score?.iris_recommendation ?? null;

  const text = q.question_text ?? "";
  const truncated = text.length > 180 && !expanded ? text.slice(0, 180) + "…" : text;

  return (
    <div
      className="rounded-xl p-5 transition-all duration-150"
      style={{
        background: CARD,
        border: `1px solid ${BORDER}`,
        borderLeft: `3px solid ${sm.color}`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = GOLD;
        e.currentTarget.style.borderLeftColor = sm.color;
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.4)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = BORDER;
        e.currentTarget.style.borderLeftColor = sm.color;
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div style={{ ...sectionLabel, fontSize: 9 }}>
            {q.section_id ? `SECTION ${q.section_id}` : "QUESTION"}
            {q.question_number ? ` · ${q.question_number}` : ""}
          </div>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-1 text-left font-bold w-full"
            style={{ fontSize: 14, lineHeight: 1.5, color: "white", background: "none", border: 0, padding: 0, cursor: "pointer" }}
          >
            {truncated}
          </button>
        </div>
        <ScoreRing score={score} />
      </div>

      <div className="mt-3 flex flex-wrap gap-2 items-center">
        <span
          className="rounded-full px-2 py-0.5"
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: dueColor,
            background: `${dueColor}1a`,
            border: `1px solid ${dueColor}55`,
          }}
        >
          {dueLabel}
        </span>
        {q.word_limit ? (
          <span
            className="rounded-full px-2 py-0.5"
            style={{
              fontSize: 11,
              color: "rgba(255,255,255,0.6)",
              border: `1px solid ${BORDER}`,
            }}
          >
            {q.word_limit} words
          </span>
        ) : null}
        <span
          className="rounded-full px-2 py-0.5"
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: sm.color,
            background: `${sm.color}1a`,
            border: `1px solid ${sm.color}55`,
          }}
        >
          {sm.label}
        </span>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onScoreMe}
          disabled={scoring}
          className="flex-1 rounded-md flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
          style={{
            background: "transparent",
            color: GOLD,
            border: `1px solid ${GOLD}55`,
            fontSize: 12,
            fontWeight: 600,
            padding: "8px 12px",
            cursor: scoring ? "wait" : "pointer",
          }}
        >
          {scoring ? <Loader2 size={14} className="animate-spin" /> : <Target size={14} />}
          {scoring ? "Analyzing…" : "Score Me"}
        </button>
        <button
          type="button"
          onClick={onThread}
          className="flex-1 rounded-md flex items-center justify-center gap-2 transition-colors"
          style={{
            background: "transparent",
            color: "rgba(255,255,255,0.85)",
            border: `1px solid ${BORDER}`,
            fontSize: 12,
            fontWeight: 600,
            padding: "8px 12px",
            cursor: "pointer",
          }}
        >
          <MessageSquare size={14} /> Thread
        </button>
      </div>

      {irisSuggestion && (
        <div
          className="mt-3 rounded-md p-3"
          style={{ background: `${PURPLE}11`, border: `1px solid ${PURPLE}33` }}
        >
          <div style={{ ...sectionLabel, fontSize: 9, color: PURPLE }}>IRIS suggests</div>
          <p className="mt-1" style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", lineHeight: 1.5 }}>
            {typeof irisSuggestion === "string"
              ? irisSuggestion
              : JSON.stringify(irisSuggestion).slice(0, 240)}
          </p>
        </div>
      )}
    </div>
  );
}

function ScoreRing({ score }: { score: number | null }) {
  if (score == null) {
    return (
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", whiteSpace: "nowrap" }}>
        Unscored
      </div>
    );
  }
  const pct = Math.max(0, Math.min(100, score));
  const color = pct >= 75 ? GREEN : pct >= 50 ? GOLD : RED;
  const r = 18;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  return (
    <div className="relative shrink-0" style={{ width: 44, height: 44 }}>
      <svg width={44} height={44}>
        <circle cx={22} cy={22} r={r} fill="none" stroke={BORDER} strokeWidth={3} />
        <circle
          cx={22}
          cy={22}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={3}
          strokeDasharray={`${dash} ${c}`}
          strokeLinecap="round"
          transform="rotate(-90 22 22)"
        />
      </svg>
      <div
        className="absolute inset-0 grid place-items-center font-bold"
        style={{ fontSize: 12, color }}
      >
        {pct}
      </div>
    </div>
  );
}

function EmptyQueue({ missionId, hasItems }: { missionId: string; hasItems: boolean }) {
  return (
    <div className="rounded-xl p-8" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
      <h3 className="font-bold" style={{ fontSize: 16 }}>
        {hasItems ? "No questions match this filter" : "No assignments yet"}
      </h3>
      <p className="mt-2" style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.6 }}>
        {hasItems
          ? "Try a different status filter, or check back as your team moves work forward."
          : "Your Engagement Lead will assign questions when the mission is ready."}
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link
          to="/missions/$missionId/briefing"
          params={{ missionId }}
          className="inline-flex items-center gap-1"
          style={{ color: GOLD, fontSize: 13, fontWeight: 600 }}
        >
          Review Mission Brief <ArrowRight size={14} />
        </Link>
        <a
          href="#tool-dock"
          className="inline-flex items-center gap-1"
          style={{ color: GOLD, fontSize: 13, fontWeight: 600 }}
        >
          Explore the tool dock below <ArrowRight size={14} />
        </a>
      </div>
    </div>
  );
}

/* ─────────── 3. Tool Dock ─────────── */
function ToolDock({ missionId }: { missionId: string }) {
  const navigate = useNavigate();
  const [thread, setThread] = useState(false);
  const [phone, setPhone] = useState(false);
  const [score, setScore] = useState(false);
  const [pulse, setPulse] = useState(false);
  const [flag, setFlag] = useState(false);

  // Pick a question for context: lowest-scoring or oldest unscored
  const { data: contextQ } = useQuery({
    queryKey: ["fd-tool-context", missionId],
    queryFn: async () => {
      const { data: memberRes } = await supabase.rpc("current_atlas_member_id");
      const memberId = (memberRes as string) ?? null;
      if (!memberId) return null;
      const { data: asgs } = await supabase
        .from("mission_assignments")
        .select("question_id")
        .eq("mission_id", missionId)
        .eq("assigned_writer_id", memberId);
      const qids = (asgs ?? []).map((a: any) => a.question_id).filter(Boolean);
      if (qids.length === 0) return null;
      const { data: qs } = await supabase
        .from("mission_questions")
        .select("id, question_number, question_text, created_at")
        .in("id", qids)
        .order("created_at", { ascending: true });
      const { data: scores } = await supabase
        .from("draft_scores")
        .select("question_id, overall_score")
        .in("question_id", qids);
      const scoreByQ = new Map<string, number>();
      for (const s of (scores ?? []) as any[]) {
        const cur = scoreByQ.get(s.question_id);
        if (cur == null || s.overall_score < cur) scoreByQ.set(s.question_id, s.overall_score);
      }
      const sorted = ((qs ?? []) as any[]).sort((a, b) => {
        const sa = scoreByQ.get(a.id);
        const sb = scoreByQ.get(b.id);
        if (sa == null && sb == null) return 0;
        if (sa == null) return -1;
        if (sb == null) return 1;
        return sa - sb;
      });
      return sorted[0] ?? null;
    },
  });

  const tools = [
    {
      icon: MessageSquare,
      title: "Thread",
      desc: "Capture context, ask the team, work the question.",
      btn: "Open Thread",
      onClick: () => setThread(true),
      color: GOLD,
    },
    {
      icon: Phone,
      title: "Phone a Friend",
      desc: "Find the right expert for your question.",
      btn: "Find an Expert",
      onClick: () => setPhone(true),
      color: BLUE,
    },
    {
      icon: Target,
      title: "Score Me",
      desc: "Get IRIS feedback on your lowest-scoring answer.",
      btn: "Analyze My Work",
      onClick: () => setScore(true),
      color: GREEN,
    },
    {
      icon: Activity,
      title: "Mission Pulse",
      desc: "Tell the mission how things are going.",
      btn: "Log Today's Pulse",
      onClick: () => setPulse(true),
      color: PURPLE,
    },
    {
      icon: AlertTriangle,
      title: "Raise a Flag",
      desc: "Escalate a blocker to leadership.",
      btn: "Raise a Flag",
      onClick: () => setFlag(true),
      color: AMBER,
    },
    {
      icon: Radar,
      title: "Mission Radar",
      desc: "Situational awareness across the full mission.",
      btn: "View Radar",
      onClick: () => navigate({ to: "/missions/$missionId/oracle", params: { missionId } }),
      color: RED,
    },
  ];

  return (
    <section id="tool-dock">
      <div style={sectionLabel} className="mb-4">
        Tool Dock
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {tools.map((t) => (
          <div
            key={t.title}
            className="rounded-xl p-5 flex flex-col transition-all duration-150"
            style={{
              background: CARD,
              border: `1px solid ${BORDER}`,
              minHeight: 160,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = GOLD;
              e.currentTarget.style.transform = "translateY(-2px)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = BORDER;
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >
            <t.icon size={32} style={{ color: t.color }} />
            <div className="mt-3 font-bold" style={{ fontSize: 16 }}>
              {t.title}
            </div>
            <div
              className="mt-1 flex-1"
              style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.5 }}
            >
              {t.desc}
            </div>
            <button
              type="button"
              onClick={t.onClick}
              className="mt-4 rounded-md transition-colors"
              style={{
                background: `${t.color}22`,
                color: t.color,
                border: `1px solid ${t.color}55`,
                fontSize: 12,
                fontWeight: 600,
                padding: "8px 12px",
                cursor: "pointer",
              }}
            >
              {t.btn}
            </button>
          </div>
        ))}
      </div>

      <ThreadPanel
        open={thread}
        onClose={() => setThread(false)}
        missionId={missionId}
        questionId={contextQ?.id ?? null}
        questionNumber={contextQ?.question_number ?? null}
        questionText={contextQ?.question_text ?? null}
      />
      <PhoneAFriendDialog
        open={phone}
        onOpenChange={setPhone}
        missionId={missionId}
        questionId={contextQ?.id ?? null}
        questionNumber={contextQ?.question_number ?? null}
        questionText={contextQ?.question_text ?? null}
      />
      <ScoreMeDialog
        open={score}
        onOpenChange={setScore}
        missionId={missionId}
        questionId={contextQ?.id ?? null}
        questionNumber={contextQ?.question_number ?? null}
        questionText={contextQ?.question_text ?? null}
      />
      <MissionPulsePanel
        open={pulse}
        onOpenChange={setPulse}
        missionId={missionId}
        prefill={null}
        onPrefillConsumed={() => {}}
      />
      <SOSDialog
        open={flag}
        onOpenChange={setFlag}
        missionId={missionId}
        questionId={contextQ?.id ?? null}
        questionNumber={contextQ?.question_number ?? null}
        questionText={contextQ?.question_text ?? null}
      />
    </section>
  );
}

/* ─────────── 4. Daily Pulse ─────────── */
type PulseAnswer = "confident" | "uncertain" | "blocked";

function DailyPulse({ missionId }: { missionId: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const qc = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [answers, setAnswers] = useState<{
    work: PulseAnswer | null;
    mission: PulseAnswer | null;
    team: PulseAnswer | null;
  }>({ work: null, mission: null, team: null });

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  // Momentum: completed this week + in flight + streak
  const { data: momentum } = useQuery({
    queryKey: ["fd-momentum", missionId, userId],
    enabled: !!userId,
    queryFn: async () => {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - 7);

      const { data: asgs } = await supabase
        .from("mission_assignments")
        .select("question_id")
        .eq("mission_id", missionId)
        .eq("assigned_writer_id", (await supabase.rpc("current_atlas_member_id")).data ?? "");
      const qids = (asgs ?? []).map((a: any) => a.question_id).filter(Boolean);

      let completed = 0;
      let inFlight = 0;
      if (qids.length > 0) {
        const { data: qs } = await supabase
          .from("mission_questions")
          .select("status, updated_at")
          .in("id", qids);
        for (const q of (qs ?? []) as any[]) {
          if (q.status === "complete") {
            if (q.updated_at && new Date(q.updated_at).getTime() >= weekStart.getTime()) completed++;
          } else if (q.status === "in_progress") {
            inFlight++;
          }
        }
      }

      // Streak: count distinct days with pulses in last 30
      const { data: pulses } = await supabase
        .from("question_pulses")
        .select("submitted_at")
        .eq("mission_id", missionId)
        .eq("writer_auth_user_id", userId!)
        .order("submitted_at", { ascending: false })
        .limit(60);
      const days = new Set<string>();
      for (const p of (pulses ?? []) as any[]) {
        days.add(new Date(p.submitted_at).toISOString().slice(0, 10));
      }
      // count consecutive days ending today
      let streak = 0;
      const d = new Date();
      while (days.has(d.toISOString().slice(0, 10))) {
        streak++;
        d.setDate(d.getDate() - 1);
      }
      return { completed, inFlight, streak };
    },
  });

  const { data: todayPulse, refetch: refetchPulse } = useQuery({
    queryKey: ["fd-pulse-today", missionId, userId, today],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("question_pulses")
        .select("*")
        .eq("mission_id", missionId)
        .eq("writer_auth_user_id", userId!)
        .is("question_id", null)
        .gte("submitted_at", `${today}T00:00:00Z`)
        .order("submitted_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const emojis: { key: PulseAnswer; emoji: string; label: string; color: string }[] = [
    { key: "confident", emoji: "👍", label: "Confident", color: GREEN },
    { key: "uncertain", emoji: "😐", label: "Uncertain", color: AMBER },
    { key: "blocked", emoji: "🚩", label: "Blocked", color: RED },
  ];

  const toScore = (a: PulseAnswer | null) =>
    a === "confident" ? 80 : a === "uncertain" ? 50 : a === "blocked" ? 10 : 50;

  const submit = async () => {
    if (!userId || !answers.work || !answers.mission || !answers.team) return;
    setSubmitting(true);
    try {
      const overall = Math.round(
        (toScore(answers.work) + toScore(answers.mission) + toScore(answers.team)) / 3,
      );
      const blocked = answers.work === "blocked" || answers.mission === "blocked" || answers.team === "blocked";
      const { error } = await supabase.from("question_pulses").insert({
        mission_id: missionId,
        question_id: null,
        writer_auth_user_id: userId,
        progress: overall,
        confidence: overall,
        blocked,
        hedging_score: 0,
        submitted_at: new Date().toISOString(),
        note: JSON.stringify({
          kind: "daily_checkin",
          work: answers.work,
          mission: answers.mission,
          team: answers.team,
        }),
      });
      if (error) throw error;
      toast.success("Pulse logged. Thanks.");
      setAnswers({ work: null, mission: null, team: null });
      refetchPulse();
      qc.invalidateQueries({ queryKey: ["fd-momentum", missionId, userId] });
    } catch (e) {
      console.error("[Pulse]", e);
      toast.error("Could not log pulse — try again");
    } finally {
      setSubmitting(false);
    }
  };

  let parsedNote: any = null;
  try {
    if (todayPulse?.note) parsedNote = JSON.parse(todayPulse.note);
  } catch {}

  const canSubmit = !!answers.work && !!answers.mission && !!answers.team && !submitting;

  return (
    <section>
      <div style={sectionLabel} className="mb-4">
        Daily Pulse
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl p-6" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
          <div style={sectionLabel}>Momentum</div>
          <div className="mt-4 grid grid-cols-3 gap-4">
            <Stat value={momentum?.completed ?? 0} label="Completed this week" color={GREEN} />
            <Stat value={momentum?.inFlight ?? 0} label="In flight now" color={BLUE} />
            <Stat value={momentum?.streak ?? 0} label="Day streak" color={GOLD} suffix="d" />
          </div>
        </div>

        <div className="rounded-xl p-6" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
          <div style={sectionLabel}>{todayPulse ? "Today's Pulse" : "30-Second Check-In"}</div>

          {todayPulse ? (
            <div className="mt-4 space-y-3" style={{ fontSize: 13 }}>
              {parsedNote ? (
                (["work", "mission", "team"] as const).map((k) => (
                  <div key={k} className="flex items-center justify-between">
                    <span style={{ color: "rgba(255,255,255,0.7)" }}>
                      {k === "work" ? "My work today" : k === "mission" ? "The mission overall" : "My team support"}
                    </span>
                    <span style={{ fontWeight: 600 }}>
                      {emojis.find((e) => e.key === parsedNote[k])?.emoji ?? "—"}{" "}
                      {emojis.find((e) => e.key === parsedNote[k])?.label ?? ""}
                    </span>
                  </div>
                ))
              ) : (
                <div style={{ color: "rgba(255,255,255,0.6)" }}>Pulse logged.</div>
              )}
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
                {new Date(todayPulse.submitted_at).toLocaleTimeString()}
              </div>
              <button
                type="button"
                onClick={() => qc.setQueryData(["fd-pulse-today", missionId, userId, today], null)}
                style={{
                  background: "none",
                  border: 0,
                  color: GOLD,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                Update pulse →
              </button>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              {(
                [
                  ["work", "My work today"],
                  ["mission", "The mission overall"],
                  ["team", "My team support"],
                ] as const
              ).map(([k, label]) => (
                <div key={k}>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>{label}</div>
                  <div className="mt-2 flex gap-2">
                    {emojis.map((e) => {
                      const selected = answers[k] === e.key;
                      return (
                        <button
                          key={e.key}
                          type="button"
                          onClick={() => setAnswers((s) => ({ ...s, [k]: e.key }))}
                          className="flex-1 rounded-md transition-colors"
                          style={{
                            padding: "8px 6px",
                            background: selected ? `${e.color}22` : CARD_2,
                            border: `1px solid ${selected ? e.color : BORDER}`,
                            color: selected ? e.color : "rgba(255,255,255,0.7)",
                            fontSize: 12,
                            cursor: "pointer",
                          }}
                        >
                          <div style={{ fontSize: 18 }}>{e.emoji}</div>
                          <div className="mt-1">{e.label}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={submit}
                disabled={!canSubmit}
                className="w-full rounded-md transition-colors disabled:opacity-50"
                style={{
                  background: GOLD,
                  color: "black",
                  fontWeight: 700,
                  fontSize: 13,
                  padding: "10px 14px",
                  border: 0,
                  cursor: canSubmit ? "pointer" : "not-allowed",
                }}
              >
                {submitting ? "Logging…" : "Submit Pulse"}
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function Stat({
  value,
  label,
  color,
  suffix,
}: {
  value: number;
  label: string;
  color: string;
  suffix?: string;
}) {
  return (
    <div>
      <div className="font-bold" style={{ fontSize: 30, color, lineHeight: 1 }}>
        {value}
        {suffix ? <span style={{ fontSize: 16, marginLeft: 2 }}>{suffix}</span> : null}
      </div>
      <div className="mt-2" style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", lineHeight: 1.4 }}>
        {label}
      </div>
    </div>
  );
}

/* ─────────── 5. IRIS Assists Summary ─────────── */
function IrisAssistsSummary({ missionId }: { missionId: string }) {
  const { data } = useQuery({
    queryKey: ["fd-iris-summary", missionId],
    queryFn: async () => {
      const { data: memberRes } = await supabase.rpc("current_atlas_member_id");
      const memberId = (memberRes as string) ?? null;
      if (!memberId) return null;
      const { data: asgs } = await supabase
        .from("mission_assignments")
        .select("question_id")
        .eq("mission_id", missionId)
        .eq("assigned_writer_id", memberId);
      const qids = (asgs ?? []).map((a: any) => a.question_id).filter(Boolean);
      if (qids.length === 0) return { reviewed: 0, total: 0 };
      const { data: scores } = await supabase
        .from("draft_scores")
        .select("question_id")
        .in("question_id", qids)
        .not("iris_recommendation", "is", null);
      const reviewed = new Set(((scores ?? []) as any[]).map((s) => s.question_id)).size;
      return { reviewed, total: qids.length };
    },
  });

  if (!data || data.reviewed === 0) return null;

  return (
    <section>
      <div className="rounded-xl p-4 flex items-center justify-between flex-wrap gap-3"
        style={{ background: `${PURPLE}11`, border: `1px solid ${PURPLE}33` }}>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.85)" }}>
          <span style={{ color: PURPLE, fontWeight: 700 }}>IRIS</span> has reviewed{" "}
          <span style={{ fontWeight: 700 }}>{data.reviewed}</span> of your{" "}
          <span style={{ fontWeight: 700 }}>{data.total}</span> questions.
        </div>
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            document.querySelector("section")?.scrollIntoView({ behavior: "smooth" });
          }}
          style={{ color: PURPLE, fontSize: 12, fontWeight: 600 }}
        >
          Review IRIS feedback on your cards above →
        </a>
      </div>
    </section>
  );
}
