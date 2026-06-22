/**
 * My Work — primary home for writers and SMEs.
 * Left: assignments list (sorted at-risk → pending → due-soonest).
 * Right: intelligence panel for the selected question (Athena strategy +
 * IrisIntelligenceBrief + quick actions).
 * Header: Score Draft (panel) + Ask IRIS (opens existing IRIS Dock).
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format, differenceInDays, formatDistanceToNow } from "date-fns";
import { Sparkles, MessageSquare, ChevronDown, ChevronRight, ArrowUp, ArrowDown, Minus, Target, ExternalLink } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useIris } from "@/components/iris/IrisContext";
import { IrisIntelligenceBrief } from "@/components/iris/IrisIntelligenceBrief";
import { Skeleton } from "@/components/ui/skeleton";
import { ScoreDraftPanel } from "./ScoreDraftPanel";
import { DailyIntelligenceBanner } from "./DailyIntelligenceBanner";

import { listMyRecentScores } from "@/lib/v2-home.functions";
import { countUnreadWhispers } from "@/lib/cockpit-intel.functions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const GOLD = "#C9A55C";
const IRIS_PURPLE_BG = "rgba(127,119,221,0.12)";
const IRIS_PURPLE_BORDER = "rgba(127,119,221,0.3)";
const IRIS_PURPLE_TEXT = "rgba(200,195,255,0.9)";

type Assignment = {
  id: string;
  mission_id: string;
  question_id: string;
  acceptance_status: string;
  due_date: string | null;
};

type Question = {
  id: string;
  mission_id: string;
  section_id: string | null;
  question_number: string | null;
  question_text: string | null;
  health_status: string;
  status: string;
  due_date: string | null;
};

type Props = {
  onOpenIris: () => void;
  onPrefillIris: (text: string) => void;
};

export function MyWorkPage({ onOpenIris, onPrefillIris }: Props) {
  const iris = useIris();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scoreOpen, setScoreOpen] = useState(false);
  const [historicalScore, setHistoricalScore] = useState<HistoricalScore | null>(null);
  const [activeMissionId, setActiveMissionIdState] = useState<string | null>(null);

  // Resolve current user → atlas team member id (assignments key off of this).
  const { data: memberId } = useQuery({
    queryKey: ["current-atlas-member-id"],
    queryFn: async () => (await supabase.rpc("current_atlas_member_id")).data as string | null,
    staleTime: 5 * 60_000,
  });

  // Pull all assignments + missions + questions + sections for this writer.
  const { data, isLoading } = useQuery({
    queryKey: ["my-work-assignments", memberId],
    enabled: !!memberId,
    queryFn: async () => {
      const { data: asgs } = await supabase
        .from("mission_assignments")
        .select("id, mission_id, question_id, acceptance_status, due_date")
        .eq("assigned_writer_id", memberId!);
      const assignments = (asgs ?? []) as Assignment[];
      const missionIds = Array.from(new Set(assignments.map((a) => a.mission_id)));
      const questionIds = assignments.map((a) => a.question_id);
      const [missions, questions] = await Promise.all([
        missionIds.length
          ? supabase
              .from("missions")
              .select("id, name, status")
              .in("id", missionIds)
          : Promise.resolve({ data: [] }),
        questionIds.length
          ? supabase
              .from("mission_questions")
              .select(
                "id, mission_id, section_id, question_number, question_text, health_status, status, due_date",
              )
              .in("id", questionIds)
          : Promise.resolve({ data: [] }),
      ]);
      const sectionIds = Array.from(
        new Set((questions.data as Question[] | null ?? []).map((q) => q.section_id).filter(Boolean) as string[]),
      );
      const { data: sections } = sectionIds.length
        ? await supabase.from("mission_sections").select("id, name").in("id", sectionIds)
        : { data: [] };
      return {
        assignments,
        missions: (missions.data ?? []) as Array<{ id: string; name: string; status: string }>,
        questions: (questions.data ?? []) as Question[],
        sections: (sections ?? []) as Array<{ id: string; name: string }>,
      };
    },
  });

  // Sort: at_risk → pending → due-soonest → question_number.
  const sorted = useMemo(() => {
    if (!data) return [] as Array<Assignment & { question: Question | null; sectionName: string }>;
    const qById = new Map(data.questions.map((q) => [q.id, q]));
    const sById = new Map(data.sections.map((s) => [s.id, s.name]));
    return data.assignments
      .map((a) => {
        const q = qById.get(a.question_id) ?? null;
        const sectionName = q?.section_id ? sById.get(q.section_id) ?? "" : "";
        return { ...a, question: q, sectionName };
      })
      .sort((a, b) => {
        const atRiskA = a.question?.health_status === "at_risk" ? 0 : 1;
        const atRiskB = b.question?.health_status === "at_risk" ? 0 : 1;
        if (atRiskA !== atRiskB) return atRiskA - atRiskB;
        const pendA = a.acceptance_status === "pending" ? 0 : 1;
        const pendB = b.acceptance_status === "pending" ? 0 : 1;
        if (pendA !== pendB) return pendA - pendB;
        const dueA = a.due_date ?? a.question?.due_date;
        const dueB = b.due_date ?? b.question?.due_date;
        const tA = dueA ? new Date(dueA).getTime() : Number.POSITIVE_INFINITY;
        const tB = dueB ? new Date(dueB).getTime() : Number.POSITIVE_INFINITY;
        if (tA !== tB) return tA - tB;
        return (a.question?.question_number ?? "").localeCompare(b.question?.question_number ?? "");
      });
  }, [data]);

  // Pick the first at-risk on initial load.
  useEffect(() => {
    if (!sorted.length || selectedId) return;
    setSelectedId(sorted[0].id);
  }, [sorted, selectedId]);

  const selected = useMemo(
    () => sorted.find((s) => s.id === selectedId) ?? null,
    [sorted, selectedId],
  );

  // Update iris context when selection changes.
  useEffect(() => {
    if (!selected?.question) return;
    iris.setQuestion(
      selected.question.id,
      selected.question.question_text,
      selected.question.question_number,
    );
    if (selected.question.section_id) {
      const name = data?.sections.find((s) => s.id === selected.question!.section_id)?.name ?? null;
      iris.setSection(selected.question.section_id, name);
    }
    setActiveMissionIdState(selected.mission_id);
  }, [selected, iris, data?.sections]);

  // Mission context for header dropdown.
  const missionsInPlay = useMemo(() => {
    if (!data) return [] as Array<{ id: string; name: string }>;
    const ids = Array.from(new Set(data.assignments.map((a) => a.mission_id)));
    return ids.map((id) => ({
      id,
      name: data.missions.find((m) => m.id === id)?.name ?? "Mission",
    }));
  }, [data]);

  const currentMission =
    missionsInPlay.find((m) => m.id === activeMissionId) ?? missionsInPlay[0] ?? null;

  // Daily insight for current mission.
  const { data: dailyInsight } = useQuery({
    queryKey: ["athena-daily-insight", currentMission?.id, selected?.question?.id],
    enabled: !!currentMission?.id,
    queryFn: async () => {
      const { data: daily } = await supabase
        .from("athena_insights")
        .select("quote, writers_note")
        .eq("mission_id", currentMission!.id)
        .eq("is_daily_insight", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (daily) return daily as { quote: string; writers_note: string | null };
      if (selected?.question?.id) {
        const { data: q } = await supabase
          .from("athena_insights")
          .select("quote, writers_note")
          .eq("mission_id", currentMission!.id)
          .eq("question_id", selected.question.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        return (q ?? null) as { quote: string; writers_note: string | null } | null;
      }
      return null;
    },
  });

  // Unread Whisper counts per question — drives the pulsing ⚡ on cards.
  const countWhispersFn = useServerFn(countUnreadWhispers);
  const { data: whisperCounts } = useQuery({
    queryKey: ["my-work-whispers", sorted.map((s) => s.question_id).join(",")],
    enabled: sorted.length > 0,
    refetchInterval: 60_000,
    queryFn: async () => {
      const pairs = sorted
        .filter((s) => s.question)
        .map((s) => ({ missionId: s.mission_id, questionId: s.question_id }));
      if (pairs.length === 0) return { counts: {} as Record<string, number> };
      return await countWhispersFn({ data: { pairs } });
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const pendingCount = sorted.filter((s) => s.acceptance_status === "pending").length;

  return (
    <div className="h-[calc(100vh-48px)] flex flex-col">
      {/* Header */}
      <div
        className="h-11 px-4 sm:px-6 flex items-center gap-3 shrink-0"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-white text-[14px] font-medium">My Work</span>
            {currentMission && missionsInPlay.length > 1 ? (
              <select
                value={currentMission.id}
                onChange={(e) => setActiveMissionIdState(e.target.value)}
                className="text-[12px] bg-transparent text-white/60 border-none focus:outline-none cursor-pointer"
              >
                {missionsInPlay.map((m) => (
                  <option key={m.id} value={m.id} className="bg-[#070f1c]">
                    {m.name}
                  </option>
                ))}
              </select>
            ) : currentMission ? (
              <span className="text-[12px] text-white/50">· {currentMission.name}</span>
            ) : null}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setScoreOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md text-[14px] font-medium"
            style={{
              background: "rgba(196,154,43,0.15)",
              border: "1px solid rgba(196,154,43,0.4)",
              color: GOLD,
              padding: "6px 14px",
            }}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Score Draft
          </button>

        </div>
      </div>

      {/* Daily Intelligence Banner — once per day, top of My Work */}
      <DailyIntelligenceBanner />

      {/* Body */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[45%_55%] min-h-0">
        {/* Left — assignments */}
        <div className="overflow-y-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[14px] text-white font-medium">My Assignments</span>
            <span className="text-[12px] text-white/45">
              {sorted.length} assignment{sorted.length === 1 ? "" : "s"} ·{" "}
              {missionsInPlay.length} mission{missionsInPlay.length === 1 ? "" : "s"}
            </span>
          </div>

          {pendingCount > 0 && (
            <div
              className="mb-3 rounded-md px-3 py-2 text-[12px] text-amber-200"
              style={{
                background: "rgba(239,159,39,0.08)",
                border: "0.5px solid rgba(239,159,39,0.25)",
              }}
            >
              You have {pendingCount} unaccepted assignment
              {pendingCount === 1 ? "" : "s"}. Click to accept each one.
            </div>
          )}

          {sorted.length === 0 ? (
            <div className="rounded-md py-12 text-center text-white/45 text-[14px]">
              No assignments yet. Your Engagement Lead will assign questions to you.
            </div>
          ) : (
            <div className="space-y-1.5">
              {sorted.map((a) => (
                <AssignmentCard
                  key={a.id}
                  data={a}
                  active={selectedId === a.id}
                  whisperCount={whisperCounts?.counts?.[a.question_id] ?? 0}
                  onClick={() => setSelectedId(a.id)}
                  onAccept={async () => {
                    const { error } = await supabase
                      .from("mission_assignments")
                      .update({
                        acceptance_status: "accepted",
                        acceptance_responded_at: new Date().toISOString(),
                      })
                      .eq("id", a.id);
                    if (error) toast.error(error.message);
                    else toast.success("Assignment accepted.");
                  }}
                />
              ))}
            </div>
          )}

          {currentMission && (
            <RecentScoresSection
              missionId={currentMission.id}
              onOpenScore={(s) => setHistoricalScore(s)}
            />
          )}
        </div>

        {/* Right — intelligence */}
        <div
          className="overflow-y-auto px-4 sm:px-6 py-4 min-h-0"
          style={{
            background: "rgba(255,255,255,0.02)",
            borderLeft: "1px solid rgba(255,255,255,0.05)",
          }}
        >
          {!selected ? (
            <div className="text-white/45 text-[14px] pt-12 text-center">
              Select an assignment on the left to see intelligence for that question.
            </div>
          ) : (
            <div className="space-y-5">
              {/* Question header */}
              <div className="pb-3 border-b" style={{ borderColor: "rgba(196,154,43,0.3)" }}>
                <div className="text-[14px] font-medium" style={{ color: GOLD }}>
                  {selected.question?.question_number ?? "—"}
                </div>
                <h2 className="text-white text-[14px] font-medium mt-1 line-clamp-2">
                  {selected.question?.question_text ?? ""}
                </h2>
                <p className="text-[12px] text-white/45 mt-1">{selected.sectionName}</p>
                <Link
                  to="/olympus/missions/$missionId"
                  params={{ missionId: selected.mission_id }}
                  search={{ tab: "work", sub: "questions" } as never}
                  className="inline-flex items-center gap-1.5 mt-3 text-[12px] font-medium rounded-md px-3 py-1.5"
                  style={{
                    background: "rgba(196,154,43,0.12)",
                    border: "1px solid rgba(196,154,43,0.35)",
                    color: GOLD,
                  }}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open Question Workspace
                </Link>
              </div>

              {/* Athena Strategy */}
              {dailyInsight && (
                <div
                  className="rounded-md p-4"
                  style={{
                    background: "rgba(196,154,43,0.05)",
                    borderTop: `2px solid rgba(196,154,43,0.5)`,
                  }}
                >
                  <div
                    className="text-[11px] mb-2"
                    style={{ color: GOLD }}
                  >
                    ✦ Athena Strategy
                  </div>
                  <p className="text-white italic font-medium text-[14px] leading-relaxed">
                    {dailyInsight.quote}
                  </p>
                  {dailyInsight.writers_note && (
                    <p className="text-white/55 italic text-[12px] mt-2">
                      {dailyInsight.writers_note}
                    </p>
                  )}
                </div>
              )}

              {/* IRIS Brief */}
              {selected.question && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: "#A78BFA" }}
                    />
                    <span
                      className="text-[12px] font-medium"
                      style={{ color: IRIS_PURPLE_TEXT }}
                    >
                      IRIS
                    </span>
                    <span className="text-[12px] text-white/40">For this question</span>
                  </div>
                  <IrisIntelligenceBrief
                    missionId={selected.mission_id}
                    sectionId={selected.question.section_id}
                    questionId={selected.question.id}
                    contextType="flight_deck"
                  />
                </div>
              )}

              {/* Quick actions */}
              <div className="flex flex-wrap gap-2 pt-2 border-t border-white/5">
                <QuickAction
                  label="Post Update"
                  onClick={() => {
                    onPrefillIris("Post an update for my team: ");
                  }}
                />
                <QuickAction
                  label="Request Review"
                  onClick={() => {
                    onPrefillIris(
                      `I need a review of my work on question ${selected.question?.question_number ?? ""}. Here is my current approach:\n\n`,
                    );
                  }}
                />
                <QuickAction
                  label="Flag Issue"
                  onClick={() => {
                    onPrefillIris(
                      `Flag an issue on ${selected.question?.question_number ?? ""}. Severity (Watch / At Risk / Blocked): `,
                    );
                  }}
                />
              </div>

              {/* Score Draft card — the flagship feature, one click away */}
              <div
                className="rounded-lg"
                style={{
                  background: "rgba(196,154,43,0.06)",
                  border: "1px solid rgba(196,154,43,0.15)",
                  borderTop: "2px solid rgba(196,154,43,0.5)",
                  padding: "14px 16px",
                }}
              >
                <div className="text-white text-[14px] font-medium">
                  Ready to score your draft?
                </div>
                <div className="text-[12px] mt-1 mb-3" style={{ color: "rgba(255,255,255,0.55)" }}>
                  IRIS will score it against the actual RFP criteria for this question.
                </div>
                <button
                  onClick={() => setScoreOpen(true)}
                  className="w-full rounded-md text-[14px] font-medium"
                  style={{ background: GOLD, color: "#0D1B3E", padding: "8px 14px" }}
                >
                  <Target className="h-3.5 w-3.5 inline mr-1.5" />
                  Score My Draft →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <ScoreDraftPanel
        open={scoreOpen}
        onOpenChange={setScoreOpen}
        missionId={selected?.mission_id ?? currentMission?.id ?? null}
        questionId={selected?.question?.id ?? null}
        questionNumber={selected?.question?.question_number ?? null}
        questionText={selected?.question?.question_text ?? null}
        lockQuestion={!!selected?.question?.id}
        onFixWithIris={(gaps, draftText, score, qLabel) => {
          setScoreOpen(false);
          const gapList = gaps
            .map((g, i) => `${i + 1}. ${g.description} (${g.impact})`)
            .join("\n");
          const text = `Help me fix my draft for ${qLabel}. My score was ${score}/100. The main gaps are:\n${gapList}\n\nHere is my current draft:\n${draftText}`;
          onPrefillIris(text);
        }}
      />

      {historicalScore && (
        <ScoreDraftPanel
          open={!!historicalScore}
          onOpenChange={(v) => !v && setHistoricalScore(null)}
          missionId={currentMission?.id ?? null}
          initialResult={historicalScore.result}
          initialQuestion={historicalScore.question}
        />
      )}
    </div>
  );
}

function AssignmentCard({
  data,
  active,
  whisperCount = 0,
  onClick,
  onAccept,
}: {
  data: Assignment & { question: Question | null; sectionName: string };
  active: boolean;
  whisperCount?: number;
  onClick: () => void;
  onAccept: () => void;
}) {
  const isAtRisk = data.question?.health_status === "at_risk";
  const isPending = data.acceptance_status === "pending";
  const due = data.due_date ?? data.question?.due_date ?? null;
  const days = due ? differenceInDays(new Date(due), new Date()) : null;
  const dueColor =
    days === null
      ? "text-white/55"
      : days < 0
        ? "text-red-400"
        : days < 7
          ? "text-amber-400"
          : "text-white/55";

  const bg = isAtRisk
    ? "rgba(224,74,74,0.08)"
    : isPending
      ? "rgba(239,159,39,0.08)"
      : "rgba(255,255,255,0.03)";
  const border = isAtRisk
    ? "rgba(224,74,74,0.2)"
    : isPending
      ? "rgba(239,159,39,0.2)"
      : "rgba(255,255,255,0.08)";

  const statusLabel = isAtRisk
    ? "AT RISK"
    : isPending
      ? "PENDING"
      : data.question?.status === "complete"
        ? "DONE"
        : data.question?.status === "in_progress"
          ? "ON TRACK"
          : "NOT STARTED";
  const statusColor = isAtRisk
    ? "rgba(224,74,74,0.85)"
    : isPending
      ? "rgba(239,159,39,0.9)"
      : data.question?.status === "complete"
        ? "rgba(125,207,125,0.8)"
        : "rgba(255,255,255,0.4)";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-lg px-3 py-2.5 cursor-pointer transition-colors relative",
        active && "ring-1",
      )}
      style={{
        background: bg,
        border: `0.5px solid ${border}`,
        boxShadow: active ? `inset 2px 0 0 ${GOLD}` : undefined,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[14px] font-medium flex items-center gap-1.5" style={{ color: GOLD }}>
          {data.question?.question_number ?? "—"}
          {whisperCount > 0 && (
            <span
              title={`${whisperCount} unread Whisper${whisperCount === 1 ? "" : "s"}`}
              className="whisper-pulse inline-flex items-center justify-center text-[11px] leading-none"
              style={{
                color: "#fde68a",
                background: "rgba(196,154,43,0.18)",
                border: "1px solid rgba(196,154,43,0.55)",
                borderRadius: 999,
                width: 18,
                height: 18,
              }}
            >
              ⚡
            </span>
          )}
        </span>
        <span
          className="text-[11px] font-medium"
          style={{ color: statusColor }}
        >
          {statusLabel}
        </span>
      </div>
      <p className="text-[12px] text-white mt-1 line-clamp-1">
        {(data.question?.question_text ?? "").slice(0, 80)}
      </p>
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-[12px] text-white/45">{data.sectionName}</span>
        {due && (
          <span className={cn("text-[12px] tabular-nums", dueColor)}>
            Due {format(new Date(due), "MMM d")}
          </span>
        )}
      </div>
      {isPending && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            onAccept();
          }}
          role="button"
          tabIndex={0}
          className="mt-2 -mx-3 -mb-2.5 px-3 py-1.5 text-[12px] text-amber-200 cursor-pointer hover:bg-amber-500/10"
          style={{ borderTop: "1px solid rgba(239,159,39,0.2)" }}
        >
          Tap to accept this assignment →
        </div>
      )}
    </button>
  );
}

function QuickAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[12px] px-3 py-1.5 rounded-full border text-white/65 hover:text-white hover:bg-white/5 transition-colors"
      style={{ borderColor: "rgba(255,255,255,0.12)" }}
    >
      {label}
    </button>
  );
}

/* ----------------- Recent Scores section + historical viewer ----------------- */

type HistoricalScore = {
  result: import("@/lib/v2-home.functions").ScoreResult;
  question: { number?: string | null; text?: string | null };
};

function scoreBadgeColor(n: number): string {
  if (n >= 90) return "#C49A2B";
  if (n >= 75) return "#7dcf7d";
  if (n >= 60) return "#EF9F27";
  return "#f08080";
}

function RecentScoresSection({
  missionId,
  onOpenScore,
}: {
  missionId: string;
  onOpenScore: (s: HistoricalScore) => void;
}) {
  const [open, setOpen] = useState(false);
  const listScores = useServerFn(listMyRecentScores);
  const { data } = useQuery({
    queryKey: ["my-work-recent-scores", missionId],
    queryFn: () => listScores({ data: { missionId, limit: 5 } }),
    enabled: open,
    staleTime: 30_000,
  });
  const rows = (data?.scores ?? []) as Array<{
    id: string;
    question_id: string | null;
    overall_score: number;
    scoring_mode: string;
    created_at: string;
    mission_questions: { question_number: string | null; question_text: string } | null;
  }>;

  // Compute trends per question
  const trendMap = useMemo(() => {
    const byQ = new Map<string, number[]>();
    [...rows]
      .reverse()
      .forEach((r) => {
        if (!r.question_id) return;
        const list = byQ.get(r.question_id) ?? [];
        list.push(r.overall_score);
        byQ.set(r.question_id, list);
      });
    const trends = new Map<string, "up" | "down" | "same">();
    for (const [qid, scores] of byQ) {
      if (scores.length < 2) continue;
      const last = scores[scores.length - 1];
      const prev = scores[scores.length - 2];
      trends.set(qid, last > prev ? "up" : last < prev ? "down" : "same");
    }
    return trends;
  }, [rows]);

  return (
    <div
      className="mt-5 rounded-md overflow-hidden"
      style={{
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-white/70 hover:bg-white/5"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <span className="font-medium">Recent Scores</span>
        <span className="text-white/40">· my last 5 on this mission</span>
      </button>
      {open && (
        <div className="px-3 pb-3">
          {rows.length === 0 ? (
            <div className="text-[12px] text-white/40 py-3">
              You haven't scored a draft on this mission yet.
            </div>
          ) : (
            <div className="space-y-1">
              {rows.map((r) => {
                const color = scoreBadgeColor(r.overall_score);
                const trend = r.question_id ? trendMap.get(r.question_id) : undefined;
                return (
                  <button
                    key={r.id}
                    onClick={() =>
                      onOpenScore({
                        result: {
                          overall: r.overall_score,
                          label:
                            r.overall_score >= 90
                              ? "Exceptional"
                              : r.overall_score >= 75
                                ? "Strong draft"
                                : r.overall_score >= 60
                                  ? "Good — gaps to close"
                                  : "Needs significant work",
                          breakdown: [],
                          gaps: [],
                          mode: (r.scoring_mode as "full" | "quick") ?? "full",
                        },
                        question: {
                          number: r.mission_questions?.question_number,
                          text: r.mission_questions?.question_text,
                        },
                      })
                    }
                    className="w-full text-left flex items-center gap-2 py-1.5 px-2 rounded hover:bg-white/5"
                  >
                    <span style={{ color: "#C9A55C", fontSize: 12, minWidth: 32 }}>
                      {r.mission_questions?.question_number ?? "—"}
                    </span>
                    <span style={{ color, fontSize: 13, fontWeight: 500, minWidth: 60 }}>
                      {r.overall_score} / 100
                    </span>
                    {trend === "up" && <ArrowUp className="h-3 w-3" style={{ color: "#7dcf7d" }} />}
                    {trend === "down" && <ArrowDown className="h-3 w-3" style={{ color: "#f08080" }} />}
                    {trend === "same" && <Minus className="h-3 w-3 text-white/30" />}
                    <span className="flex-1 text-[12px] text-white/40 text-right truncate">
                      {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
