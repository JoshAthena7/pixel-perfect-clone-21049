/**
 * Flight Deck — restructured workspace centered on a single assigned question.
 *
 *  Question Nav Strip   ← all questions  •  Q-number title • health  • prev/next
 *  ┌────────────────────────┬────────────────────────────────────┐
 *  │  INTELLIGENCE (45%)    │  MY WORK (55%)                     │
 *  │  · Athena Strategy     │  · The Question                    │
 *  │  · IRIS Brief          │  · My Status (+ Post Update)       │
 *  │  · How They're Thinking│  · My Confidence (Low/Med/High)    │
 *  │  · Key Requirements    │  · Score Me CTA                    │
 *  │                        │  · Ask IRIS quick prompts          │
 *  └────────────────────────┴────────────────────────────────────┘
 *  ─ FlightDeckAssistBar (pinned bottom) ─
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ArrowLeft, ChevronLeft, ChevronRight, Eye, Sparkles, Target,
  AlertTriangle, CheckCircle2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useIris } from "@/components/iris/IrisContext";
import { FlightDeckAssistBar } from "@/components/flight-deck/FlightDeckAssistBar";
import { ScoreMeDialog } from "@/components/flight-deck/ScoreMeDialog";
import { TeamPulseCard } from "@/components/atlas/TeamPulseCard";
import { AtlasAssistBar } from "@/components/atlas/AtlasAssistBar";
import { WritersBlockDialog } from "@/components/atlas/WritersBlockDialog";
import { ShoutoutToastListener } from "@/components/atlas/ShoutoutToastListener";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useIsAdmin } from "@/hooks/useAccess";
import { useMissionNoteCounts } from "@/components/flight-deck/QuestionNoteBadge";

type Props = {
  memberId: string | null;
  activeMissionId: string | null;
  activeMissionName: string;
  activeMissionStatus: string | null;
  onPrefillIris?: (text: string) => void;
};

export function FlightDeckLayout({
  memberId,
  activeMissionId,
  activeMissionName,
  activeMissionStatus,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [threadOpen, setThreadOpen] = useState(false);
  const [pulseOpen, setPulseOpen] = useState(false);
  const [pulsePrefill, setPulsePrefill] = useState<{ signalType: string; body: string } | null>(null);
  const iris = useIris();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { isAdmin } = useIsAdmin();

  // Fetch assignments. Writers see only their own. Admins/PMs see ALL
  // assignments on the active mission so they can verify cascading from
  // Mission Setup and preview any writer's Flight Deck context.
  const { data } = useQuery({
    queryKey: ["fd-assignments", memberId, activeMissionId, isAdmin],
    enabled: !!memberId || (isAdmin && !!activeMissionId),
    queryFn: async () => {
      let asgs: any[] = [];
      if (isAdmin && activeMissionId) {
        const { data: all } = await supabase
          .from("mission_assignments")
          .select("id, question_id, mission_id, assigned_writer_id, due_date, writer_confidence, acceptance_status")
          .eq("mission_id", activeMissionId)
          .limit(500);
        asgs = all ?? [];
      } else if (memberId) {
        const { data: mine } = await supabase
          .from("mission_assignments")
          .select("id, question_id, mission_id, assigned_writer_id, due_date, writer_confidence, acceptance_status")
          .eq("assigned_writer_id", memberId)
          .limit(100);
        asgs = (mine ?? []).filter((a: any) => !activeMissionId || a.mission_id === activeMissionId);
      }
      const qids = asgs.map((a: any) => a.question_id).filter(Boolean);
      const writerIds = Array.from(
        new Set(asgs.map((a: any) => a.assigned_writer_id).filter(Boolean)),
      ) as string[];
      const [qsRes, writersRes] = await Promise.all([
        qids.length
          ? supabase
              .from("mission_questions")
              .select("id, question_number, question_text, section_id, due_date, health_status, status")
              .in("id", qids)
          : Promise.resolve({ data: [] as any[] } as any),
        writerIds.length
          ? supabase
              .from("atlas_team_members")
              .select("id, first_name, last_name")
              .in("id", writerIds)
          : Promise.resolve({ data: [] as any[] } as any),
      ]);
      const writerMap = new Map<string, string>(
        ((writersRes as any).data ?? []).map((w: any) => [
          w.id,
          `${w.first_name ?? ""} ${w.last_name ?? ""}`.trim(),
        ]),
      );
      return { asgs, qs: ((qsRes as any).data ?? []) as any[], writerMap };
    },
  });

  const writerMap = data?.writerMap;

  // Sort by section then question number
  const sortedQs = useMemo(() => {
    const qs = [...(data?.qs ?? [])];
    qs.sort((a: any, b: any) => {
      const s = String(a.section_id ?? "").localeCompare(String(b.section_id ?? ""));
      if (s !== 0) return s;
      return String(a.question_number ?? "").localeCompare(
        String(b.question_number ?? ""),
        undefined,
        { numeric: true },
      );
    });
    return qs;
  }, [data?.qs]);

  // Default to first at-risk assignment, else first by section/question order.
  const defaultId = useMemo(() => {
    const atRisk = sortedQs.find(
      (q: any) =>
        q.health_status === "at_risk" ||
        q.health_status === "blocked" ||
        q.health_status === "critical",
    );
    return atRisk?.id ?? sortedQs[0]?.id ?? null;
  }, [sortedQs]);

  const effectiveId = selectedId ?? defaultId;
  const activeQ = effectiveId ? sortedQs.find((q: any) => q.id === effectiveId) : null;
  const activeAsg = (data?.asgs ?? []).find((a: any) => a.question_id === effectiveId);
  const idx = sortedQs.findIndex((q: any) => q.id === effectiveId);
  const prevQ = idx > 0 ? sortedQs[idx - 1] : null;
  const nextQ = idx >= 0 && idx < sortedQs.length - 1 ? sortedQs[idx + 1] : null;

  // Section info
  const { data: sectionInfo } = useQuery({
    queryKey: ["fd-section", activeQ?.section_id],
    enabled: !!activeQ?.section_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_sections")
        .select("id, name")
        .eq("id", activeQ!.section_id as string)
        .maybeSingle();
      return data;
    },
  });

  // Wire IRIS context and log question_views
  useEffect(() => {
    if (activeQ) {
      iris.setQuestion(activeQ.id, activeQ.question_text, activeQ.question_number);
      iris.setSection(activeQ.section_id ?? null, sectionInfo?.name ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeQ?.id, sectionInfo?.name]);

  useEffect(() => {
    if (!activeQ || !activeMissionId) return;
    let cancelled = false;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (cancelled || !u.user) return;
      await supabase.from("question_views" as any).insert({
        mission_id: activeMissionId,
        question_id: activeQ.id,
        user_id: u.user.id,
      });
    })();
    return () => { cancelled = true; };
  }, [activeQ?.id, activeMissionId]);

  // ---- Atlas window event listeners (Line of Sight wiring) ----
  useEffect(() => {
    const VALID_SIGNALS = [
      "risk_alert", "new_intelligence", "client_signal", "blocker",
      "opportunity", "resource_concern", "decision_needed", "observation",
    ];

    const handleThreadOpen = (e: Event) => {
      const detail = ((e as CustomEvent).detail ?? {}) as { questionId?: string; sectionName?: string };
      if (!detail.questionId) return;
      setSelectedId(detail.questionId);
      setThreadOpen(true);
      toast(`Opening ${detail.sectionName ?? "section"} Sticky Notes…`, {
        duration: 2000,
        style: {
          background: "rgba(196,154,43,0.95)",
          color: "white",
          border: "none",
          fontSize: 11,
          fontWeight: 500,
        },
      });
    };

    const handleOracleOpen = (e: Event) => {
      const detail = ((e as CustomEvent).detail ?? {}) as { feedItemId?: string };
      if (!detail.feedItemId || !activeMissionId) return;
      navigate({
        to: "/missions/$missionId/oracle",
        params: { missionId: activeMissionId },
        search: { highlight: detail.feedItemId, tab: "feed" } as any,
      });
    };

    const handlePulsePrefill = (e: Event) => {
      const detail = ((e as CustomEvent).detail ?? {}) as { signalType?: string; body?: string };
      if (!detail.body) return;
      const signalType = detail.signalType && VALID_SIGNALS.includes(detail.signalType)
        ? detail.signalType
        : "risk_alert";
      setPulsePrefill({ signalType, body: detail.body });
      setPulseOpen(true);
    };

    window.addEventListener("atlas:thread:open", handleThreadOpen);
    window.addEventListener("atlas:oracle:open", handleOracleOpen);
    window.addEventListener("atlas:pulse:prefill", handlePulsePrefill);
    return () => {
      window.removeEventListener("atlas:thread:open", handleThreadOpen);
      window.removeEventListener("atlas:oracle:open", handleOracleOpen);
      window.removeEventListener("atlas:pulse:prefill", handlePulsePrefill);
    };
  }, [activeMissionId, navigate]);

  return (
    <div className="space-y-4">
      <FlightDeckHeader name={activeMissionName} status={activeMissionStatus} />

      <ShoutoutToastListener missionId={activeMissionId} />
      <TeamPulseCard missionId={activeMissionId} />

      <NavStrip
        missionId={activeMissionId}
        activeQ={activeQ}
        dueDate={activeAsg?.due_date ?? activeQ?.due_date ?? null}
        prevQ={prevQ}
        nextQ={nextQ}
        onSelect={setSelectedId}
        assignedWriterName={
          activeAsg?.assigned_writer_id
            ? (writerMap?.get(activeAsg.assigned_writer_id) ?? null)
            : null
        }
        isAdminView={isAdmin && !!activeMissionId}
      />

      {!activeQ ? (
        <NoAssignmentState missionId={activeMissionId} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[45%_55%] gap-4 items-start">
          <IntelligenceColumn
            missionId={activeMissionId}
            questionId={activeQ.id}
            sectionId={activeQ.section_id ?? null}
          />
          <MyWorkColumn
            missionId={activeMissionId}
            questionId={activeQ.id}
            questionNumber={activeQ.question_number}
            questionText={activeQ.question_text}
            sectionName={sectionInfo?.name ?? null}
            assignmentId={activeAsg?.id ?? null}
            writerConfidence={activeAsg?.writer_confidence ?? null}
            dueDate={activeAsg?.due_date ?? activeQ?.due_date ?? null}
            status={activeQ.status ?? null}
            onChanged={() => qc.invalidateQueries({ queryKey: ["fd-assignments"] })}
          />
        </div>
      )}

      <FlightDeckAssistBar
        missionId={activeMissionId}
        questionId={activeQ?.id ?? null}
        questionNumber={activeQ?.question_number ?? null}
        questionText={activeQ?.question_text ?? null}
        dueDate={activeAsg?.due_date ?? activeQ?.due_date ?? null}
        confidence={activeAsg?.writer_confidence ?? null}
        progressId={(activeAsg as any)?.progress_id ?? (activeQ as any)?.progress_id ?? null}
        threadOpen={threadOpen}
        onThreadOpenChange={setThreadOpen}
        pulseOpen={pulseOpen}
        onPulseOpenChange={(v) => { setPulseOpen(v); if (!v) setPulsePrefill(null); }}
        pulsePrefill={pulsePrefill}
        onPulsePrefillConsumed={() => setPulsePrefill(null)}
        onHealthChanged={() => {
          // optimistic local update + cache invalidation
          if (activeQ) {
            qc.setQueryData(["fd-assignments", memberId, activeMissionId], (prev: any) => {
              if (!prev) return prev;
              return {
                ...prev,
                qs: prev.qs.map((q: any) =>
                  q.id === activeQ.id ? { ...q, health_status: "at_risk" } : q,
                ),
              };
            });
          }
          qc.invalidateQueries({ queryKey: ["fd-assignments"] });
        }}
      />
    </div>
  );
}

/* -------------------- Header -------------------- */
function FlightDeckHeader({ name, status }: { name: string; status: string | null }) {
  const tone =
    status === "active" ? "bg-green-500/15 text-green-400 border-green-500/40"
    : status === "pens_down" ? "bg-red-500/15 text-red-400 border-red-500/40"
    : "bg-slate-500/15 text-slate-300 border-slate-500/40";
  return (
    <div className="flex flex-wrap items-center gap-3">
      <h1 className="text-2xl font-medium text-foreground">{name || "Flight Deck"}</h1>
      {status && (
        <span className={cn("rounded-full border px-2.5 py-0.5 text-[12px] font-medium  ", tone)}>
          {status.replace(/_/g, " ")}
        </span>
      )}
    </div>
  );
}

/* -------------------- No-Assignment Empty State -------------------- */
function NoAssignmentState({ missionId }: { missionId: string | null }) {
  const { isAdmin } = useIsAdmin();
  if (isAdmin && missionId) {
    return (
      <div className="rounded-xl border border-border bg-surface/30 px-6 py-12">
        <div className="mx-auto flex max-w-[480px] flex-col items-center text-center">
          <Eye className="h-8 w-8" style={{ color: "#C49A2B" }} />
          <div className="mt-4 text-[16px] font-medium text-white">
            You're viewing the Flight Deck as an admin.
          </div>
          <div className="mt-2 text-[14px] text-muted-foreground" style={{ lineHeight: 1.6 }}>
            Writers see their assigned questions here. To see the team at work, visit ATC.
          </div>
          <Link
            to="/missions/$missionId/war-room"
            params={{ missionId }}
            className="mt-5 inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-[12px] font-medium"
            style={{
              background: "#C49A2B",
              color: "#070f1c",
            }}
          >
            Open ATC →
          </Link>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-border bg-surface/30 px-6 py-12">
      <div className="mx-auto flex max-w-[440px] flex-col items-center text-center">
        <Eye className="h-8 w-8" style={{ color: "#C8C3FF" }} />
        <div className="mt-4 text-[16px] font-medium text-white">No questions assigned yet.</div>
        <div
          className="mt-2 text-[14px] text-muted-foreground"
          style={{ lineHeight: 1.6 }}
        >
          Check back once your Engagement Lead assigns your questions.
        </div>
        {missionId && (
          <Link
            to="/missions/$missionId/briefing"
            params={{ missionId }}
            className="mt-5 inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-[12px] font-medium"
            style={{
              background: "rgba(196,154,43,0.06)",
              border: "1px solid rgba(196,154,43,0.4)",
              color: "#C49A2B",
            }}
          >
            View Mission Brief →
          </Link>
        )}
      </div>
    </div>
  );
}



/* -------------------- Question Nav Strip -------------------- */
function NavStrip({
  missionId, activeQ, dueDate, prevQ, nextQ, onSelect, assignedWriterName, isAdminView,
}: {
  missionId: string | null;
  activeQ: any;
  dueDate: string | null;
  prevQ: any;
  nextQ: any;
  onSelect: (id: string) => void;
  assignedWriterName?: string | null;
  isAdminView?: boolean;
}) {
  const health = activeQ?.health_status as string | undefined;
  const badge =
    health === "at_risk" || health === "blocked" || health === "critical"
      ? { label: "AT RISK", cls: "bg-red-500/15 text-red-400 border-red-500/30" }
      : health === "healthy" || health === "on_track"
        ? { label: "ON TRACK", cls: "bg-green-500/15 text-green-400 border-green-500/30" }
        : { label: "NOT STARTED", cls: "bg-slate-500/15 text-slate-400 border-slate-500/30" };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface/30 px-3 py-2">
      {missionId ? (
        <Link
          to="/missions/$missionId/briefing"
          params={{ missionId }}
          hash="my-assignments"
          className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3 w-3" /> All Questions
        </Link>
      ) : (
        <Link to="/my-work" className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> All Questions
        </Link>
      )}
      <span className="text-muted-foreground/40">·</span>
      {activeQ && (
        <>
          <span style={{ display: "inline-flex", alignItems: "center" }}>
            <span className="font-mono text-[12px] text-[color:var(--athena-gold)]">{activeQ.question_number}</span>
            <NavStripNoteBadge missionId={missionId} questionId={activeQ.id} />
          </span>
          <span className="text-[12px] font-medium text-foreground truncate max-w-[40ch]">{activeQ.question_text}</span>
          <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium  ", badge.cls)}>
            {badge.label}
          </span>
          {isAdminView && (
            <span
              className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium"
              style={{
                background: assignedWriterName ? "rgba(196,154,43,0.1)" : "rgba(127,119,221,0.1)",
                borderColor: assignedWriterName ? "rgba(196,154,43,0.35)" : "rgba(127,119,221,0.3)",
                color: assignedWriterName ? "#C49A2B" : "rgba(200,195,255,0.85)",
              }}
              title={assignedWriterName ? "Assigned writer" : "No writer assigned yet"}
            >
              {assignedWriterName ? `→ ${assignedWriterName}` : "Unassigned"}
            </span>
          )}
          {dueDate && (
            <span className="text-[11px] text-muted-foreground">Due {format(new Date(dueDate), "MMM d")}</span>
          )}
        </>
      )}
      <div className="ml-auto flex items-center gap-1">
        {prevQ && (
          <button
            onClick={() => onSelect(prevQ.id)}
            className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground rounded px-2 py-1 hover:bg-surface/50"
          >
            <ChevronLeft className="h-3 w-3" /> prev
          </button>
        )}
        {nextQ && (
          <button
            onClick={() => onSelect(nextQ.id)}
            className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground rounded px-2 py-1 hover:bg-surface/50"
          >
            next <ChevronRight className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}

function NavStripNoteBadge({ missionId, questionId }: { missionId: string | null; questionId: string }) {
  const { data } = useMissionNoteCounts(missionId);
  const entry = data?.[questionId];
  if (!entry || entry.total === 0) return null;
  const variant = entry.hasBlocker
    ? { color: "rgba(248,113,113,0.95)", bg: "rgba(248,113,113,0.15)", icon: "🚧" }
    : entry.hasQuestion
      ? { color: "rgba(96,165,250,0.95)", bg: "rgba(96,165,250,0.15)", icon: "❓" }
      : { color: "rgba(196,154,43,0.95)", bg: "rgba(196,154,43,0.15)", icon: "📌" };
  return (
    <span
      title={`${entry.total} unresolved note${entry.total === 1 ? "" : "s"}`}
      style={{
        marginLeft: 4,
        background: variant.bg,
        border: `1px solid ${variant.color}`,
        color: variant.color,
        fontSize: 9,
        fontWeight: 700,
        padding: "1px 5px",
        borderRadius: 9,
        display: "inline-flex",
        alignItems: "center",
        gap: 2,
        verticalAlign: "middle",
        lineHeight: 1,
      }}
    >
      <span>{variant.icon}</span>
      <span>{entry.total}</span>
    </span>
  );
}

/* -------------------- LEFT: Intelligence -------------------- */
function IntelligenceColumn({
  missionId, questionId, sectionId,
}: {
  missionId: string | null;
  questionId: string;
  sectionId: string | null;
}) {
  // Athena insight — by section mapping, fall back to daily
  const { data: athena } = useQuery({
    queryKey: ["fd-athena", missionId, sectionId],
    enabled: !!missionId,
    queryFn: async () => {
      if (sectionId) {
        const { data: maps } = await supabase
          .from("athena_insight_mappings")
          .select("insight_id")
          .eq("mission_id", missionId!)
          .eq("section_id", sectionId);
        const ids = (maps ?? []).map((m: any) => m.insight_id).filter(Boolean);
        if (ids.length) {
          const { data } = await supabase
            .from("athena_insights")
            .select("strategic_quote, quote, writers_note, why_it_matters, title")
            .in("id", ids)
            .limit(1);
          if (data?.length) return data[0];
        }
      }
      const { data: daily } = await supabase
        .from("athena_insights")
        .select("strategic_quote, quote, writers_note, why_it_matters, title")
        .eq("mission_id", missionId!)
        .eq("is_daily_insight", true)
        .order("created_at", { ascending: false })
        .limit(1);
      return daily?.[0] ?? null;
    },
  });

  // Section brief
  const { data: brief } = useQuery({
    queryKey: ["fd-brief", sectionId],
    enabled: !!sectionId,
    queryFn: async () => {
      const { data } = await supabase
        .from("section_briefs")
        .select("refined_brief, content, section_name")
        .eq("section_id", sectionId!)
        .order("created_at", { ascending: false })
        .limit(1);
      return data?.[0] ?? null;
    },
  });

  // Evaluator picture
  const { data: evaluator } = useQuery({
    queryKey: ["fd-evaluator", missionId, questionId],
    enabled: !!missionId,
    queryFn: async () => {
      const { data } = await supabase
        .from("evaluator_pictures")
        .select("inferred_fears, inferred_defensibility_needs, one_sentence_bottom_line, question_snapshots")
        .eq("mission_id", missionId!)
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!data) return null;
      const snaps = Array.isArray(data.question_snapshots) ? data.question_snapshots : [];
      const snap = snaps.find((s: any) => s?.question_id === questionId || s?.section_id === sectionId) as any;
      return {
        oneThing: snap?.one_thing_to_know ?? data.one_sentence_bottom_line ?? null,
        fears: (Array.isArray(data.inferred_fears) ? data.inferred_fears : []).slice(0, 2),
        needs: (Array.isArray(data.inferred_defensibility_needs) ? data.inferred_defensibility_needs : []).slice(0, 2),
      };
    },
  });

  // Compliance requirements (section, fallback to question linkage)
  const { data: reqs } = useQuery({
    queryKey: ["fd-reqs", sectionId, missionId],
    enabled: !!sectionId || !!missionId,
    queryFn: async () => {
      if (sectionId) {
        const { data } = await supabase
          .from("mission_compliance_requirements")
          .select("id, requirement, is_high_risk, status")
          .eq("section_id", sectionId);
        return data ?? [];
      }
      return [];
    },
  });

  return (
    <div className="space-y-3">
      <div>
        <div className="text-[11px]  tracking-[0.07em] text-muted-foreground font-medium">INTELLIGENCE</div>
        <div className="text-[11px] text-muted-foreground/60 italic mt-0.5">Updated by IRIS</div>
      </div>

      {/* Athena */}
      {athena ? (
        <div className="rounded-lg p-3" style={{ background: "rgba(196,154,43,0.06)", border: "1px solid rgba(196,154,43,0.3)" }}>
          <div className="text-[11px]   font-medium" style={{ color: "#C49A2B" }}>✦ ATHENA STRATEGY</div>
          <div className="mt-2 text-[14px] italic text-white" style={{ lineHeight: 1.6 }}>
            {athena.strategic_quote || athena.quote || athena.title}
          </div>
          {athena.writers_note && (
            <div className="mt-2 pl-2 text-[12px] italic text-muted-foreground" style={{ borderLeft: "2px solid #C49A2B" }}>
              {athena.writers_note}
            </div>
          )}
        </div>
      ) : (
        <PurplePlaceholder text="IRIS is generating the strategic insight for this section." />
      )}

      {/* IRIS Brief */}
      <div className="rounded-lg p-3" style={{ background: "rgba(127,119,221,0.06)", border: "0.5px solid rgba(127,119,221,0.2)" }}>
        <div className="text-[11px]   font-medium" style={{ color: "#C8C3FF" }}>IRIS BRIEF</div>
        {brief?.refined_brief || brief?.content ? (
          <div className="mt-2 text-[12px]" style={{ color: "rgba(255,255,255,0.75)", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
            {String(brief.refined_brief || brief.content)}
          </div>
        ) : (
          <div className="mt-2 flex items-center gap-2 text-[12px] text-muted-foreground">
            <Eye className="h-3 w-3 animate-pulse" style={{ color: "#C8C3FF" }} />
            IRIS is preparing your brief...
          </div>
        )}
      </div>

      {/* How They Are Thinking */}
      <div className="rounded-lg p-3" style={{ background: "rgba(255,255,255,0.03)", border: "0.5px solid rgba(255,255,255,0.06)" }}>
        <div className="text-[11px]   font-medium text-muted-foreground">HOW THEY ARE THINKING</div>
        {evaluator ? (
          <div className="mt-2 space-y-2">
            {evaluator.oneThing && (
              <div className="text-[12px] italic text-white pl-2" style={{ borderLeft: "2px solid #C49A2B" }}>
                {String(evaluator.oneThing)}
              </div>
            )}
            {(evaluator.fears as unknown[]).map((f, i) => (
              <div key={`f${i}`} className="flex items-start gap-2 text-[11px] text-muted-foreground">
                <span className="mt-1 h-1.5 w-1.5 rounded-full shrink-0" style={{ background: "#E04A4A" }} />
                <span>{String(f)}</span>
              </div>
            ))}
            {(evaluator.needs as unknown[]).map((n, i) => (
              <div key={`n${i}`} className="flex items-start gap-2 text-[11px] text-muted-foreground">
                <span className="mt-1 h-1.5 w-1.5 rounded-full shrink-0" style={{ background: "#C49A2B" }} />
                <span>{String(n)}</span>
              </div>
            ))}

            {missionId && (
              <Link
                to="/missions/$missionId/oracle"
                params={{ missionId }}
                
                className="inline-block text-[11px] font-medium hover:underline"
                style={{ color: "#C49A2B" }}
              >
                Full Evaluator Picture →
              </Link>
            )}
          </div>
        ) : (
          <div className="mt-2 text-[12px] italic text-muted-foreground">
            Evaluator Picture not yet built. It appears after BLAST OFF.
          </div>
        )}
      </div>

      {/* Requirements */}
      <div className="rounded-lg p-3" style={{ background: "rgba(255,255,255,0.03)", border: "0.5px solid rgba(255,255,255,0.06)" }}>
        <div className="text-[11px]   font-medium text-muted-foreground">KEY REQUIREMENTS</div>
        {reqs && reqs.length > 0 ? (
          <ul className="mt-2 space-y-1.5">
            {reqs.map((r: any) => {
              const dot = r.is_high_risk ? "#E04A4A" : r.status === "in_progress" ? "#EF9F27" : "rgba(255,255,255,0.4)";
              return (
                <li key={r.id} className="flex items-start gap-2 text-[12px]" style={{ color: "rgba(255,255,255,0.65)" }}>
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full shrink-0" style={{ background: dot }} />
                  <span>{r.requirement}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="mt-2 text-[12px] italic text-muted-foreground">
            No compliance requirements linked to this section. Check the Compliance section in the sidebar.
          </div>
        )}
      </div>
    </div>
  );
}

function PurplePlaceholder({ text }: { text: string }) {
  return (
    <div className="rounded-lg p-3 flex items-center gap-2" style={{ background: "rgba(127,119,221,0.06)", border: "0.5px solid rgba(127,119,221,0.2)" }}>
      <Eye className="h-3 w-3 animate-pulse" style={{ color: "#C8C3FF" }} />
      <span className="text-[12px] italic" style={{ color: "rgba(200,195,255,0.8)" }}>{text}</span>
    </div>
  );
}

/* -------------------- RIGHT: My Work -------------------- */
function MyWorkColumn({
  missionId, questionId, questionNumber, questionText, sectionName,
  assignmentId, writerConfidence, dueDate, status, onChanged,
}: {
  missionId: string | null;
  questionId: string;
  questionNumber: string | null;
  questionText: string | null;
  sectionName: string | null;
  assignmentId: string | null;
  writerConfidence: string | null;
  dueDate: string | null;
  status: string | null;
  onChanged: () => void;
}) {
  const [scoreOpen, setScoreOpen] = useState(false);
  const [stuckOpen, setStuckOpen] = useState(false);
  const [confidence, setConfidence] = useState<string | null>(writerConfidence);

  useEffect(() => setConfidence(writerConfidence), [writerConfidence]);

  // Status updates live in Thread (question-level) and Mission Pulse (mission-level).
  // There is no third "Post Update" surface here on purpose.

  async function pickConfidence(c: "low" | "medium" | "high") {
    setConfidence(c); // optimistic
    if (!assignmentId) return;
    try {
      await supabase.from("mission_assignments").update({ writer_confidence: c } as any).eq("id", assignmentId);
      onChanged();
    } catch (e) {
      console.error(e);
      toast.error("Could not save confidence");
      setConfidence(writerConfidence);
    }
  }

  // IRIS coaching for this question is delivered exclusively via
  // <AtlasAssistBar /> (Decode / Win Angle / Evidence / Watch Out).
  // The old "Ask IRIS quick prompts" block below was removed to avoid
  // duplicating the same guidance in two spots.



  return (
    <div className="space-y-3">
      {/* The Question */}
      <div className="rounded-lg p-3 border border-border bg-background/40">
        {sectionName && (
          <div className="text-[11px]   text-muted-foreground font-medium">{sectionName}</div>
        )}
        <div className="mt-1 text-[14px] text-white" style={{ lineHeight: 1.7 }}>
          {questionText}
        </div>
      </div>

      {/* Atlas IRIS coach — Decode / Win Angle / Evidence / Watch Out */}
      <AtlasAssistBar missionId={missionId} questionId={questionId} />

      {/* Status updates live in Thread (question-level) and Mission Pulse (mission-level).
          See the assist bar at the bottom of the page. */}

      {/* Confidence */}
      <div className="rounded-lg p-3 border border-border bg-background/40">
        <div className="text-[11px] text-muted-foreground">My confidence</div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {(["low", "medium", "high"] as const).map((c) => {
            const active = confidence === c;
            const map = {
              low: { bg: "rgba(224,74,74,0.15)", border: "rgba(224,74,74,0.5)", color: "#f08080", icon: AlertTriangle },
              medium: { bg: "rgba(239,159,39,0.15)", border: "rgba(239,159,39,0.5)", color: "#EF9F27", icon: Sparkles },
              high: { bg: "rgba(26,122,74,0.15)", border: "rgba(26,122,74,0.5)", color: "#3DBE7D", icon: CheckCircle2 },
            }[c];
            const Icon = map.icon;
            return (
              <button
                key={c}
                onClick={() => pickConfidence(c)}
                className="rounded-md py-2.5 text-[12px] font-medium capitalize flex items-center justify-center gap-1.5"
                style={{
                  background: active ? map.bg : "rgba(255,255,255,0.03)",
                  border: `1px solid ${active ? map.border : "rgba(255,255,255,0.08)"}`,
                  color: active ? map.color : "rgba(255,255,255,0.55)",
                }}
              >
                <Icon className="h-3.5 w-3.5" /> {c}
              </button>
            );
          })}
        </div>
      </div>

      {/* Action row: Score Me + Stuck? */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
        <button
          onClick={() => setScoreOpen(true)}
          className="w-full text-left rounded-lg p-3"
          style={{ background: "rgba(196,154,43,0.06)", border: "1px solid rgba(196,154,43,0.4)" }}
        >
          <div className="flex items-center gap-2 text-[14px] font-medium" style={{ color: "#C49A2B" }}>
            <Target className="h-3.5 w-3.5" /> Score My Response
          </div>
          <div className="mt-1 text-[12px] text-muted-foreground">
            Paste your draft from the client environment — IRIS coaches it before anyone else sees it.
          </div>
        </button>
        <button
          onClick={() => setStuckOpen(true)}
          title="IRIS can unstick you"
          className="rounded-lg px-3 py-2 text-[12px] font-medium inline-flex items-center justify-center gap-1.5 self-start"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.75)" }}
        >
          🧱 Stuck?
        </button>
      </div>

      {/* "Ask IRIS quick prompts" block intentionally removed — duplicates the
          AtlasAssistBar (Decode / Win Angle / Evidence / Watch Out) above. */}



      <ScoreMeDialog
        open={scoreOpen}
        onOpenChange={setScoreOpen}
        missionId={missionId}
        questionId={questionId}
        questionNumber={questionNumber}
        questionText={questionText}
      />

      <WritersBlockDialog
        open={stuckOpen}
        onOpenChange={setStuckOpen}
        missionId={missionId}
        questionId={questionId}
        questionNumber={questionNumber}
        questionText={questionText}
        dueDate={dueDate}
        status={status}
      />
    </div>
  );
}
