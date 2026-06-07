import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  Award,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  FileText,
  Loader2,
  Plane,
  Sparkles,
  Star,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import {
  addStoryToSectionBrief,
  createInterviewPlan,
  deleteInterviewPlan,
  generateInterviewPlan,
  getInterviewPlan,
  listInterviewPlans,
  runInterviewDebrief,
  updateInterviewPlan,
} from "@/lib/iris-interview.functions";
import { listSectionBriefs } from "@/lib/iris-section-questions.functions";

const NAVY = "#1F3864";
const GOLD = "#C9A84C";
const BG = "#0a0e1a";
const PANEL = "#111827";
const BORDER = "#1f2937";

type PlanStatus =
  | "draft"
  | "plan_ready"
  | "scheduled"
  | "in_progress"
  | "complete"
  | "debrief_pending"
  | "debriefed";

interface PlanRow {
  id: string;
  mission_id: string;
  section_brief_id: string | null;
  sme_name: string;
  sme_role: string;
  sme_organization: string | null;
  sme_type: string;
  assigned_to: string | null;
  status: PlanStatus;
  scheduled_at: string | null;
  completed_at: string | null;
  generated_at: string | null;
  content: PlanContent | null;
  additional_context: string | null;
  created_at: string;
}

interface PlanContent {
  sme_briefing?: {
    headline?: string;
    who_you_are_meeting?: string;
    why_they_matter?: string;
    questions_this_supports?: string[];
    relevant_requirements?: Array<{ requirement_id: string; requirement_text: string; why_relevant: string }>;
    known_sensitivities?: string[];
    preparation_note?: string;
  };
  interview_objective?: {
    primary_objective?: string;
    secondary_objectives?: string[];
    definition_of_success?: string;
  };
  recommended_questions?: Array<{
    question_id: string;
    topic: string;
    tier_1_basic: string;
    tier_2_better: string;
    tier_3_best: string;
    why_tier_3_wins: string;
    follow_up: string;
  }>;
  information_gaps?: Array<{
    gap_id: string;
    what_we_need: string;
    why_it_matters: string;
    question_to_close_gap: string;
    risk_if_unanswered: "High" | "Medium" | "Low";
  }>;
  story_mining?: {
    context?: string;
    questions?: Array<{
      question_id: string;
      question: string;
      what_to_listen_for: string;
      how_to_use: string;
    }>;
  };
  red_flag_questions?: Array<{
    question_id: string;
    risk_area: string;
    question: string;
    what_a_weak_answer_sounds_like: string;
    what_a_strong_answer_sounds_like: string;
    iris_note: string;
  }>;
  interview_flow?: {
    recommended_duration?: string;
    opening?: string;
    sequence?: Array<{ phase: string; duration: string; focus: string }>;
    closing?: string;
  };
  iris_briefing_note?: string;
}

interface DebriefRow {
  id: string;
  interview_flight_plan_id: string;
  iris_analysis: DebriefAnalysis | null;
  analyzed_at: string;
}

interface DebriefAnalysis {
  debrief_headline?: string;
  questions_answered?: Array<{
    question_id: string;
    question: string;
    answer_quality: "Strong" | "Adequate" | "Weak" | "Not Asked";
    key_insight: string;
    usable_content: string;
  }>;
  stories_found?: Array<{
    story_id: string;
    headline: string;
    story_summary: string;
    human_element: string;
    outcome: string;
    proposal_use: string;
    needs_follow_up: boolean;
    follow_up_needed: string | null;
  }>;
  requirements_addressed?: Array<{
    requirement_id: string;
    requirement_text: string;
    coverage_from_interview: string;
    supporting_content: string;
    recommended_coverage_update: string;
  }>;
  gaps_remaining?: Array<{
    gap: string;
    original_gap_id: string | null;
    why_still_needed: string;
    recommended_action: string;
  }>;
  risk_signals?: Array<{
    signal: string;
    evidence: string;
    severity: "High" | "Medium" | "Low";
    recommended_mitigation: string;
  }>;
  recommended_followup?: Array<{
    action: string;
    urgency: string;
    who_to_ask: string;
    specific_question: string;
  }>;
  iris_debrief_note?: string;
}

const STATUS_META: Record<PlanStatus, { label: string; bg: string; fg: string; pulse?: boolean }> = {
  draft: { label: "Draft", bg: "#1f2937", fg: "#9ca3af" },
  plan_ready: { label: "Plan Ready", bg: "#1e3a5f", fg: "#60A5FA" },
  scheduled: { label: "Scheduled", bg: "#3f2d12", fg: "#fbbf24" },
  in_progress: { label: "In Progress", bg: "#3f2d12", fg: "#fbbf24", pulse: true },
  complete: { label: "Complete", bg: "#14361f", fg: "#34d399" },
  debrief_pending: { label: "Debrief Pending", bg: "#3a2e0e", fg: GOLD },
  debriefed: { label: "Debriefed", bg: "#14361f", fg: "#34d399" },
};

export function InterviewManager({ missionId }: { missionId: string }) {
  const listFn = useServerFn(listInterviewPlans);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["interview-plans", missionId],
    queryFn: () => listFn({ data: { mission_id: missionId } }),
  });
  const plans: PlanRow[] = (data?.success ? (data.plans as unknown as PlanRow[]) : []) ?? [];

  useEffect(() => {
    if (!selectedId && plans.length > 0) setSelectedId(plans[0].id);
  }, [plans, selectedId]);

  return (
    <div className="min-h-screen" style={{ background: BG, color: "#e5e7eb" }}>
      <div className="mx-auto max-w-7xl grid grid-cols-12 gap-6 px-6 py-8">
        <aside
          className="col-span-12 md:col-span-3 rounded-xl p-4"
          style={{ background: PANEL, border: `1px solid ${BORDER}` }}
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold tracking-wide uppercase" style={{ color: GOLD }}>
              Interviews
            </h2>
            <button
              onClick={() => setShowModal(true)}
              className="text-[11px] rounded-md px-2 py-1 font-semibold"
              style={{ background: GOLD, color: NAVY }}
            >
              + New
            </button>
          </div>
          {isLoading ? (
            <p className="text-xs text-neutral-500">Loading…</p>
          ) : plans.length === 0 ? (
            <p className="text-xs text-neutral-500 leading-relaxed">
              No interviews planned yet. Great proposals are built on great interviews. Create your
              first Interview Flight Plan™.
            </p>
          ) : (
            <ul className="space-y-1">
              {plans.map((p) => {
                const m = STATUS_META[p.status] ?? STATUS_META.draft;
                const active = p.id === selectedId;
                return (
                  <li key={p.id}>
                    <button
                      onClick={() => setSelectedId(p.id)}
                      className="w-full text-left rounded-md px-3 py-2 text-sm"
                      style={{
                        background: active ? NAVY : "transparent",
                        color: active ? "white" : "#cbd5e1",
                        border: `1px solid ${active ? NAVY : BORDER}`,
                      }}
                    >
                      <div className="font-medium truncate">{p.sme_name}</div>
                      <div className="text-[11px] opacity-70 truncate">{p.sme_role}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider ${m.pulse ? "animate-pulse" : ""}`}
                          style={{ background: m.bg, color: m.fg }}
                        >
                          {m.label}
                        </span>
                        {p.scheduled_at && (
                          <span className="text-[9px] text-neutral-500 inline-flex items-center gap-1">
                            <Calendar className="w-2.5 h-2.5" />
                            {new Date(p.scheduled_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        <section className="col-span-12 md:col-span-9">
          {selectedId ? (
            <PlanDetail interviewId={selectedId} missionId={missionId} onDeleted={() => setSelectedId(null)} />
          ) : (
            <div
              className="rounded-xl p-10 text-center"
              style={{ background: PANEL, border: `1px solid ${BORDER}` }}
            >
              <Plane className="mx-auto mb-3 w-8 h-8" style={{ color: GOLD }} />
              <p className="text-neutral-400">
                Select an interview on the left, or create a new Interview Flight Plan™.
              </p>
            </div>
          )}
        </section>
      </div>

      {showModal && (
        <NewInterviewModal
          missionId={missionId}
          onClose={() => setShowModal(false)}
          onCreated={(id) => {
            setShowModal(false);
            setSelectedId(id);
          }}
        />
      )}
    </div>
  );
}

function PlanDetail({
  interviewId,
  missionId,
  onDeleted,
}: {
  interviewId: string;
  missionId: string;
  onDeleted: () => void;
}) {
  const getFn = useServerFn(getInterviewPlan);
  const genFn = useServerFn(generateInterviewPlan);
  const delFn = useServerFn(deleteInterviewPlan);
  const updateFn = useServerFn(updateInterviewPlan);
  const qc = useQueryClient();
  const [generating, setGenerating] = useState(false);
  const [tab, setTab] = useState<"plan" | "notes" | "debrief" | "link">("plan");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["interview-plan", interviewId],
    queryFn: () => getFn({ data: { interview_flight_plan_id: interviewId } }),
  });

  const plan: PlanRow | null = data?.success ? (data.plan as unknown as PlanRow) : null;
  const debrief: DebriefRow | null = data?.success ? ((data.debrief as unknown as DebriefRow) ?? null) : null;

  function invalidate() {
    void refetch();
    qc.invalidateQueries({ queryKey: ["interview-plans", missionId] });
  }

  async function handleGenerate() {
    if (!plan) return;
    setGenerating(true);
    try {
      const res = await genFn({ data: { interview_flight_plan_id: plan.id } });
      if (!res.success) {
        toast.error(res.error ?? "Could not generate plan");
      } else {
        toast.success("Interview Flight Plan™ ready");
        invalidate();
      }
    } finally {
      setGenerating(false);
    }
  }

  async function handleDelete() {
    if (!plan) return;
    if (!confirm("Delete this Interview Flight Plan and its debrief?")) return;
    const res = await delFn({ data: { interview_flight_plan_id: plan.id } });
    if (!res.success) toast.error(res.error ?? "Could not delete");
    else {
      toast.success("Deleted");
      onDeleted();
      qc.invalidateQueries({ queryKey: ["interview-plans", missionId] });
    }
  }

  async function markComplete() {
    if (!plan) return;
    const res = await updateFn({ data: { interview_flight_plan_id: plan.id, status: "complete" } });
    if (res.success) invalidate();
  }

  if (isLoading || !plan) {
    return (
      <div className="rounded-xl p-10 text-center" style={{ background: PANEL, border: `1px solid ${BORDER}` }}>
        <Loader2 className="mx-auto animate-spin" />
      </div>
    );
  }

  const hasPlan = plan.status !== "draft" && plan.content;
  const meta = STATUS_META[plan.status] ?? STATUS_META.draft;

  return (
    <div className="rounded-xl" style={{ background: PANEL, border: `1px solid ${BORDER}` }}>
      <header className="px-6 py-5 border-b flex items-start justify-between gap-4" style={{ borderColor: BORDER }}>
        <div>
          <p className="text-xs uppercase tracking-wider" style={{ color: GOLD }}>
            Interview Flight Plan™
          </p>
          <h1 className="text-xl font-semibold text-white">{plan.sme_name}</h1>
          <p className="text-sm text-neutral-400">
            {plan.sme_role}
            {plan.sme_organization ? ` · ${plan.sme_organization}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="text-[10px] px-2 py-1 rounded font-semibold uppercase tracking-wider"
            style={{ background: meta.bg, color: meta.fg }}
          >
            {meta.label}
          </span>
          <button
            onClick={handleDelete}
            className="text-neutral-500 hover:text-red-400 p-1"
            title="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </header>

      {!hasPlan ? (
        <div className="p-10 text-center space-y-4">
          <Sparkles className="mx-auto w-8 h-8" style={{ color: GOLD }} />
          <p className="text-neutral-300">
            IRIS hasn't generated this Interview Flight Plan™ yet.
          </p>
          <button
            onClick={() => void handleGenerate()}
            disabled={generating}
            className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold"
            style={{ background: GOLD, color: NAVY }}
          >
            {generating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                IRIS is preparing your Interview Flight Plan™…
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Generate Interview Flight Plan™
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      ) : (
        <>
          <nav className="flex items-center gap-1 px-6 py-3 border-b overflow-x-auto" style={{ borderColor: BORDER }}>
            {(
              [
                ["plan", "Pre-Flight Plan"],
                ["notes", "Notes & Debrief"],
                ["debrief", "Debrief Results"],
                ["link", "Link to Proposal"],
              ] as const
            ).map(([k, label]) => {
              const enabled =
                k === "plan" ||
                k === "notes" ||
                (k === "debrief" && plan.status === "debriefed") ||
                (k === "link" && plan.status === "debriefed");
              return (
                <button
                  key={k}
                  onClick={() => enabled && setTab(k)}
                  disabled={!enabled}
                  className="text-xs px-3 py-1.5 rounded-md font-medium disabled:opacity-40 whitespace-nowrap"
                  style={{
                    background: tab === k ? NAVY : "transparent",
                    color: tab === k ? "white" : "#94a3b8",
                    border: `1px solid ${tab === k ? NAVY : BORDER}`,
                  }}
                >
                  {label}
                </button>
              );
            })}
            {plan.status !== "complete" && plan.status !== "debriefed" && (
              <button
                onClick={() => void markComplete()}
                className="ml-auto text-[11px] px-3 py-1.5 rounded-md font-semibold"
                style={{ background: NAVY, color: "white" }}
              >
                Mark Interview Complete
              </button>
            )}
          </nav>
          <div className="p-6">
            {tab === "plan" && <PreFlightTab content={plan.content!} />}
            {tab === "notes" && (
              <NotesTab plan={plan} hasDebrief={!!debrief} onDebriefed={invalidate} />
            )}
            {tab === "debrief" && debrief?.iris_analysis && (
              <DebriefResultsTab analysis={debrief.iris_analysis} analyzedAt={debrief.analyzed_at} />
            )}
            {tab === "link" && (
              <LinkTab plan={plan} debrief={debrief} missionId={missionId} onLinked={invalidate} />
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* -------------------- TAB 1: PRE-FLIGHT PLAN -------------------- */

function PreFlightTab({ content }: { content: PlanContent }) {
  const briefing = content.sme_briefing;
  const obj = content.interview_objective;

  return (
    <div className="space-y-8">
      {/* SME Briefing — gold-bordered hero */}
      {briefing && (
        <div
          className="rounded-xl p-5"
          style={{ background: BG, border: `2px solid ${GOLD}` }}
        >
          {content.iris_briefing_note && (
            <p className="text-base text-white mb-4 leading-relaxed italic">
              "{content.iris_briefing_note}"
            </p>
          )}
          {briefing.headline && (
            <p className="text-sm font-semibold mb-4" style={{ color: GOLD }}>
              {briefing.headline}
            </p>
          )}
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            {briefing.who_you_are_meeting && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">
                  Who You're Meeting
                </p>
                <p className="text-neutral-300">{briefing.who_you_are_meeting}</p>
              </div>
            )}
            {briefing.why_they_matter && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">
                  Why They Matter
                </p>
                <p className="text-neutral-300">{briefing.why_they_matter}</p>
              </div>
            )}
          </div>
          {briefing.questions_this_supports && briefing.questions_this_supports.length > 0 && (
            <div className="mt-4">
              <p className="text-[10px] uppercase tracking-wider text-neutral-500 mb-2">
                Questions This Supports
              </p>
              <div className="flex flex-wrap gap-2">
                {briefing.questions_this_supports.map((q, i) => (
                  <span
                    key={i}
                    className="text-[11px] px-2 py-1 rounded-full"
                    style={{ background: NAVY, color: "white" }}
                  >
                    {q}
                  </span>
                ))}
              </div>
            </div>
          )}
          {briefing.known_sensitivities && briefing.known_sensitivities.length > 0 && (
            <div className="mt-4">
              <p className="text-[10px] uppercase tracking-wider text-neutral-500 mb-2">
                Known Sensitivities
              </p>
              <div className="flex flex-wrap gap-2">
                {briefing.known_sensitivities.map((s, i) => (
                  <span
                    key={i}
                    className="text-[11px] px-2 py-1 rounded-full inline-flex items-center gap-1"
                    style={{ background: "#3a1f1f", color: "#fca5a5", border: "1px solid #7f1d1d" }}
                  >
                    <AlertTriangle className="w-3 h-3" /> {s}
                  </span>
                ))}
              </div>
            </div>
          )}
          {briefing.preparation_note && (
            <p
              className="mt-4 text-xs italic px-3 py-2 rounded"
              style={{ background: "rgba(201,168,76,0.08)", color: "#fcd34d" }}
            >
              {briefing.preparation_note}
            </p>
          )}
        </div>
      )}

      {/* Objective */}
      {obj && (
        <Section title="Interview Objective" icon={<Award className="w-4 h-4" />}>
          {obj.primary_objective && (
            <p className="text-base font-semibold text-white mb-3">{obj.primary_objective}</p>
          )}
          {obj.secondary_objectives && obj.secondary_objectives.length > 0 && (
            <ul className="list-disc pl-5 text-sm text-neutral-300 space-y-1 mb-3">
              {obj.secondary_objectives.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          )}
          {obj.definition_of_success && (
            <div
              className="rounded-md p-3 text-sm"
              style={{ background: BG, border: `1px dashed ${GOLD}`, color: "#fcd34d" }}
            >
              <strong>Success looks like:</strong> {obj.definition_of_success}
            </div>
          )}
        </Section>
      )}

      {/* Three-tier questions */}
      {content.recommended_questions && content.recommended_questions.length > 0 && (
        <Section title="Recommended Questions">
          <div className="space-y-4">
            {content.recommended_questions.map((q) => (
              <ThreeTierCard key={q.question_id} q={q} />
            ))}
          </div>
        </Section>
      )}

      {/* Information gaps */}
      {content.information_gaps && content.information_gaps.length > 0 && (
        <Section title="Information Gaps" icon={<AlertTriangle className="w-4 h-4" />}>
          <div className="space-y-2">
            {[...content.information_gaps]
              .sort((a, b) => riskWeight(b.risk_if_unanswered) - riskWeight(a.risk_if_unanswered))
              .map((g) => (
                <div
                  key={g.gap_id}
                  className="rounded-md p-3 text-sm"
                  style={{
                    background: g.risk_if_unanswered === "High" ? "#2a1612" : BG,
                    border: `1px solid ${g.risk_if_unanswered === "High" ? "#7f1d1d" : BORDER}`,
                  }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold" style={{ color: GOLD }}>
                      {g.gap_id}
                    </span>
                    <RiskBadge level={g.risk_if_unanswered} />
                  </div>
                  <p className="font-semibold text-white">{g.what_we_need}</p>
                  <p className="text-xs text-neutral-400 mt-1">{g.why_it_matters}</p>
                  <p className="text-sm text-neutral-200 mt-2 italic">
                    Ask: "{g.question_to_close_gap}"
                  </p>
                </div>
              ))}
          </div>
        </Section>
      )}

      {/* Story Mining */}
      {content.story_mining?.questions && content.story_mining.questions.length > 0 && (
        <div
          className="rounded-xl p-5"
          style={{
            background: "linear-gradient(135deg, rgba(201,168,76,0.05), rgba(96,165,250,0.03))",
            border: `1px solid rgba(201,168,76,0.3)`,
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4" style={{ color: GOLD }} />
            <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: GOLD }}>
              Mine for Stories — This Is Where Proposals Win
            </h3>
          </div>
          {content.story_mining.context && (
            <p className="text-xs text-neutral-400 mb-4 italic">{content.story_mining.context}</p>
          )}
          <div className="space-y-3">
            {content.story_mining.questions.map((q) => (
              <div
                key={q.question_id}
                className="rounded-md p-3"
                style={{ background: BG, border: `1px solid ${BORDER}` }}
              >
                <p className="text-[10px] font-bold mb-1" style={{ color: GOLD }}>
                  {q.question_id}
                </p>
                <p className="text-sm font-semibold text-white">{q.question}</p>
                <p className="text-xs text-neutral-400 mt-2">
                  <strong className="text-neutral-300">Listen for:</strong> {q.what_to_listen_for}
                </p>
                <p className="text-xs text-neutral-400 mt-1">
                  <strong className="text-neutral-300">How to use:</strong> {q.how_to_use}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Red flag questions */}
      {content.red_flag_questions && content.red_flag_questions.length > 0 && (
        <Section title="Red Flag Questions">
          <div className="space-y-2">
            {content.red_flag_questions.map((rf) => (
              <RedFlagCard key={rf.question_id} rf={rf} />
            ))}
          </div>
        </Section>
      )}

      {/* Interview flow */}
      {content.interview_flow && (
        <Section title="Interview Flow">
          {content.interview_flow.recommended_duration && (
            <p className="text-xs text-neutral-400 mb-3">
              Recommended duration:{" "}
              <span className="text-white font-semibold">
                {content.interview_flow.recommended_duration}
              </span>
            </p>
          )}
          {content.interview_flow.opening && (
            <div className="mb-3">
              <p className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Opening</p>
              <p className="text-sm text-neutral-200 italic">"{content.interview_flow.opening}"</p>
            </div>
          )}
          {content.interview_flow.sequence && (
            <ol className="space-y-2 mb-3">
              {content.interview_flow.sequence.map((s, i) => (
                <li
                  key={i}
                  className="rounded-md p-2 text-sm flex items-center gap-3"
                  style={{ background: BG, border: `1px solid ${BORDER}` }}
                >
                  <span className="text-[10px] font-bold w-12 shrink-0" style={{ color: GOLD }}>
                    {s.duration}
                  </span>
                  <span className="font-semibold text-white">{s.phase}</span>
                  <span className="text-neutral-400 text-xs">— {s.focus}</span>
                </li>
              ))}
            </ol>
          )}
          {content.interview_flow.closing && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Closing</p>
              <p className="text-sm text-neutral-200 italic">"{content.interview_flow.closing}"</p>
            </div>
          )}
        </Section>
      )}

      <div className="flex justify-end pt-4 border-t" style={{ borderColor: BORDER }}>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs"
          style={{ background: NAVY, color: "white" }}
        >
          <FileText className="w-3 h-3" /> Export Flight Plan
        </button>
      </div>
    </div>
  );
}

function ThreeTierCard({ q }: { q: NonNullable<PlanContent["recommended_questions"]>[number] }) {
  return (
    <div className="rounded-lg overflow-hidden" style={{ background: BG, border: `1px solid ${BORDER}` }}>
      <div className="px-4 py-2 border-b flex items-center justify-between" style={{ borderColor: BORDER }}>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold" style={{ color: GOLD }}>
            {q.question_id}
          </span>
          <span className="text-xs text-neutral-400">{q.topic}</span>
        </div>
        <button
          onClick={() => {
            void navigator.clipboard.writeText(q.tier_3_best);
            toast.success("Best question copied");
          }}
          className="text-[10px] inline-flex items-center gap-1 text-neutral-400 hover:text-white"
        >
          <Copy className="w-3 h-3" /> Copy Best
        </button>
      </div>
      <div className="divide-y" style={{ borderColor: BORDER }}>
        <TierRow label="BASIC" text={q.tier_1_basic} />
        <TierRow label="BETTER" text={q.tier_2_better} />
        <div
          className="px-4 py-3"
          style={{ borderLeft: `3px solid ${GOLD}`, background: "rgba(201,168,76,0.06)" }}
        >
          <div className="flex items-center gap-2 mb-1">
            <Star className="w-3.5 h-3.5" style={{ color: GOLD }} fill={GOLD} />
            <span className="text-[10px] font-bold tracking-wider" style={{ color: GOLD }}>
              BEST
            </span>
          </div>
          <p className="text-base text-white font-medium">{q.tier_3_best}</p>
        </div>
      </div>
      <div className="px-4 py-3 text-xs space-y-1" style={{ background: PANEL }}>
        <p className="text-neutral-400">
          <strong className="text-neutral-300">Why Best wins:</strong> {q.why_tier_3_wins}
        </p>
        <p className="text-neutral-400">
          <strong className="text-neutral-300">Follow-up:</strong> {q.follow_up}
        </p>
      </div>
    </div>
  );
}

function TierRow({ label, text }: { label: string; text: string }) {
  return (
    <div className="px-4 py-2 flex gap-3 items-start">
      <span className="text-[10px] font-bold tracking-wider text-neutral-500 w-12 shrink-0 pt-0.5">
        {label}
      </span>
      <p className="text-sm text-neutral-300">"{text}"</p>
    </div>
  );
}

function RedFlagCard({ rf }: { rf: NonNullable<PlanContent["red_flag_questions"]>[number] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md" style={{ background: BG, border: `1px solid ${BORDER}` }}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-4 py-3 flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-red-400">{rf.question_id}</span>
          <span className="text-sm font-semibold text-white">{rf.risk_area}</span>
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-neutral-500" />
        ) : (
          <ChevronDown className="w-4 h-4 text-neutral-500" />
        )}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-2 text-sm">
          <p className="text-white italic">"{rf.question}"</p>
          <div className="grid sm:grid-cols-2 gap-2 text-xs">
            <div className="rounded p-2" style={{ background: "#2a1612", border: "1px solid #7f1d1d" }}>
              <p className="text-[10px] uppercase text-red-300 font-bold mb-1">Weak answer</p>
              <p className="text-neutral-300">{rf.what_a_weak_answer_sounds_like}</p>
            </div>
            <div
              className="rounded p-2"
              style={{ background: "#0f2317", border: "1px solid #14532d" }}
            >
              <p className="text-[10px] uppercase text-emerald-300 font-bold mb-1">Strong answer</p>
              <p className="text-neutral-300">{rf.what_a_strong_answer_sounds_like}</p>
            </div>
          </div>
          <p className="text-xs italic mt-2" style={{ color: GOLD }}>
            IRIS: {rf.iris_note}
          </p>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg p-4" style={{ background: PANEL, border: `1px solid ${BORDER}` }}>
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: GOLD }}>
          {title}
        </h3>
      </div>
      {children}
    </div>
  );
}

function RiskBadge({ level }: { level: "High" | "Medium" | "Low" }) {
  const styles =
    level === "High"
      ? { bg: "#3a1f1f", fg: "#fca5a5", border: "#7f1d1d" }
      : level === "Medium"
      ? { bg: "#3a2e0e", fg: "#fcd34d", border: "#854d0e" }
      : { bg: "#14361f", fg: "#86efac", border: "#14532d" };
  return (
    <span
      className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase"
      style={{ background: styles.bg, color: styles.fg, border: `1px solid ${styles.border}` }}
    >
      {level} risk
    </span>
  );
}

function riskWeight(r: "High" | "Medium" | "Low"): number {
  return r === "High" ? 3 : r === "Medium" ? 2 : 1;
}

/* -------------------- TAB 2: NOTES & DEBRIEF -------------------- */

function NotesTab({
  plan,
  hasDebrief,
  onDebriefed,
}: {
  plan: PlanRow;
  hasDebrief: boolean;
  onDebriefed: () => void;
}) {
  const runFn = useServerFn(runInterviewDebrief);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleRun() {
    if (notes.trim().length < 200) return;
    setBusy(true);
    try {
      const res = await runFn({
        data: { interview_flight_plan_id: plan.id, raw_notes: notes },
      });
      if (!res.success) toast.error(res.error ?? "Could not debrief");
      else {
        toast.success(`${res.stories_found} stories found · ${res.gaps_remaining} gaps`);
        setNotes("");
        onDebriefed();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-white mb-1">Upload Interview Notes</h2>
        <p className="text-sm text-neutral-400">
          Paste your interview notes here. IRIS will extract requirements, stories, gaps, and risk
          signals.
        </p>
        <p className="text-xs text-neutral-500 mt-1 italic">
          Your raw notes are not saved. Only IRIS's analysis is stored in ATLAS.
        </p>
      </div>
      {hasDebrief && (
        <div
          className="rounded-md p-3 text-xs"
          style={{ background: "#14361f", border: "1px solid #14532d", color: "#86efac" }}
        >
          A debrief already exists for this interview. Pasting new notes will run an additional
          debrief.
        </div>
      )}
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={14}
        placeholder="Paste your full interview notes here…"
        className="w-full rounded-md p-3 text-sm bg-transparent resize-y"
        style={{ border: `1px solid ${BORDER}`, color: "#e5e7eb" }}
      />
      <div className="flex items-center justify-between text-xs">
        <span className="text-neutral-500">
          {notes.length} chars · minimum 200 required
        </span>
        <button
          disabled={busy || notes.trim().length < 200}
          onClick={() => void handleRun()}
          className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-40"
          style={{ background: GOLD, color: NAVY }}
        >
          {busy ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> IRIS is debriefing the interview…
            </>
          ) : (
            <>
              Run IRIS Debrief <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

/* -------------------- TAB 3: DEBRIEF RESULTS -------------------- */

function DebriefResultsTab({
  analysis,
  analyzedAt,
}: {
  analysis: DebriefAnalysis;
  analyzedAt: string;
}) {
  const qualityColor = (q: string) =>
    q === "Strong"
      ? { bg: "#14361f", fg: "#86efac" }
      : q === "Adequate"
      ? { bg: "#3a2e0e", fg: "#fcd34d" }
      : q === "Weak"
      ? { bg: "#3a1f1f", fg: "#fca5a5" }
      : { bg: "#1f2937", fg: "#9ca3af" };

  return (
    <div className="space-y-6">
      {analysis.debrief_headline && (
        <div
          className="rounded-lg p-4"
          style={{ background: NAVY, border: `1px solid ${GOLD}` }}
        >
          <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: GOLD }}>
            Debrief Headline
          </p>
          <p className="text-base font-semibold text-white">{analysis.debrief_headline}</p>
          <p className="text-[10px] text-neutral-400 mt-2">
            Analyzed {new Date(analyzedAt).toLocaleString()}
          </p>
        </div>
      )}

      {analysis.questions_answered && analysis.questions_answered.length > 0 && (
        <Section title="Questions Answered">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-neutral-500 uppercase">
                <tr className="border-b" style={{ borderColor: BORDER }}>
                  <th className="text-left py-2 pr-3">Question</th>
                  <th className="text-left py-2 pr-3">Quality</th>
                  <th className="text-left py-2 pr-3">Key Insight</th>
                  <th className="text-left py-2">Usable Content</th>
                </tr>
              </thead>
              <tbody>
                {analysis.questions_answered.map((q) => {
                  const s = qualityColor(q.answer_quality);
                  return (
                    <tr key={q.question_id} className="border-b align-top" style={{ borderColor: BORDER }}>
                      <td className="py-2 pr-3 text-neutral-300">{q.question}</td>
                      <td className="py-2 pr-3">
                        <span
                          className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase"
                          style={{ background: s.bg, color: s.fg }}
                        >
                          {q.answer_quality}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-neutral-300">{q.key_insight}</td>
                      <td className="py-2 text-neutral-400 italic">{q.usable_content}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {analysis.stories_found && analysis.stories_found.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4" style={{ color: GOLD }} />
            <h3 className="text-base font-semibold" style={{ color: GOLD }}>
              Stories Found
            </h3>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            {analysis.stories_found.map((s) => (
              <div
                key={s.story_id}
                className="rounded-lg p-4"
                style={{
                  background: "linear-gradient(135deg, rgba(201,168,76,0.05), rgba(96,165,250,0.03))",
                  border: `1px solid rgba(201,168,76,0.3)`,
                }}
              >
                <p className="text-[10px] font-bold mb-1" style={{ color: GOLD }}>
                  {s.story_id}
                </p>
                <p className="text-base font-semibold text-white mb-2">{s.headline}</p>
                <p className="text-sm text-neutral-300 mb-3">{s.story_summary}</p>
                <div
                  className="rounded p-2 text-xs mb-2 italic"
                  style={{ background: BG, borderLeft: `2px solid ${GOLD}`, color: "#fcd34d" }}
                >
                  Human element: {s.human_element}
                </div>
                <p className="text-xs text-neutral-400 mb-2">
                  <strong className="text-neutral-300">Outcome:</strong> {s.outcome}
                </p>
                <div className="flex items-center justify-between gap-2 mt-2">
                  <span
                    className="text-[10px] px-2 py-0.5 rounded"
                    style={{ background: NAVY, color: "white" }}
                  >
                    {s.proposal_use}
                  </span>
                  {s.needs_follow_up && (
                    <span className="text-[10px] text-amber-400 inline-flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Needs follow-up
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {analysis.requirements_addressed && analysis.requirements_addressed.length > 0 && (
        <Section title="Requirements Updated">
          <ul className="space-y-2 text-sm">
            {analysis.requirements_addressed.map((r, i) => (
              <li
                key={i}
                className="rounded p-2"
                style={{ background: BG, border: `1px solid ${BORDER}` }}
              >
                <p className="text-xs text-neutral-500">{r.requirement_id}</p>
                <p className="text-neutral-300">{r.requirement_text}</p>
                <p className="text-xs mt-1" style={{ color: GOLD }}>
                  {r.coverage_from_interview}
                </p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {analysis.gaps_remaining && analysis.gaps_remaining.length > 0 && (
        <Section title="Gaps Remaining" icon={<AlertTriangle className="w-4 h-4" />}>
          <div className="space-y-2">
            {analysis.gaps_remaining.map((g, i) => (
              <div
                key={i}
                className="rounded-md p-3 text-sm"
                style={{ background: "#2a1612", border: "1px solid #7f1d1d" }}
              >
                <p className="font-semibold text-red-300">{g.gap}</p>
                <p className="text-xs text-neutral-300 mt-1">{g.why_still_needed}</p>
                <p className="text-xs text-neutral-400 mt-1">→ {g.recommended_action}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {analysis.risk_signals && analysis.risk_signals.length > 0 && (
        <Section title="Risk Signals">
          <div className="space-y-2">
            {analysis.risk_signals.map((r, i) => (
              <div
                key={i}
                className="rounded-md p-3 text-sm"
                style={{ background: BG, border: `1px solid ${BORDER}` }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <RiskBadge level={r.severity} />
                  <p className="font-semibold text-white">{r.signal}</p>
                </div>
                <p className="text-xs text-neutral-400">Evidence: {r.evidence}</p>
                <p className="text-xs mt-1" style={{ color: GOLD }}>
                  Mitigation: {r.recommended_mitigation}
                </p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {analysis.recommended_followup && analysis.recommended_followup.length > 0 && (
        <Section title="Follow-Up Actions">
          <FollowupChecklist items={analysis.recommended_followup} />
        </Section>
      )}

      {analysis.iris_debrief_note && (
        <div
          className="rounded-lg p-5"
          style={{ background: BG, border: `1px solid ${GOLD}` }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4" style={{ color: GOLD }} />
            <span className="text-xs uppercase tracking-wider" style={{ color: GOLD }}>
              IRIS Debrief Note
            </span>
          </div>
          <p className="text-sm text-neutral-200 italic">{analysis.iris_debrief_note}</p>
        </div>
      )}
    </div>
  );
}

function FollowupChecklist({
  items,
}: {
  items: NonNullable<DebriefAnalysis["recommended_followup"]>;
}) {
  const [done, setDone] = useState<Record<number, boolean>>({});
  return (
    <ul className="space-y-2">
      {items.map((a, i) => (
        <li
          key={i}
          className="rounded-md p-3 text-sm flex items-start gap-3"
          style={{ background: BG, border: `1px solid ${BORDER}` }}
        >
          <input
            type="checkbox"
            checked={!!done[i]}
            onChange={(e) => setDone((s) => ({ ...s, [i]: e.target.checked }))}
            className="mt-1"
          />
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span
                className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase"
                style={{
                  background:
                    a.urgency === "Before Writing"
                      ? "#3a1f1f"
                      : a.urgency === "Before Submission"
                      ? "#3a2e0e"
                      : "#1f2937",
                  color:
                    a.urgency === "Before Writing"
                      ? "#fca5a5"
                      : a.urgency === "Before Submission"
                      ? "#fcd34d"
                      : "#9ca3af",
                }}
              >
                {a.urgency}
              </span>
              <span className={`font-semibold ${done[i] ? "line-through text-neutral-500" : "text-white"}`}>
                {a.action}
              </span>
            </div>
            <p className="text-xs text-neutral-400">
              Ask {a.who_to_ask}: "{a.specific_question}"
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

/* -------------------- TAB 4: LINK TO PROPOSAL -------------------- */

function LinkTab({
  plan,
  debrief,
  missionId,
  onLinked,
}: {
  plan: PlanRow;
  debrief: DebriefRow | null;
  missionId: string;
  onLinked: () => void;
}) {
  const addFn = useServerFn(addStoryToSectionBrief);
  const stories = debrief?.iris_analysis?.stories_found ?? [];
  const reqs = debrief?.iris_analysis?.requirements_addressed ?? [];

  async function addStory(s: NonNullable<DebriefAnalysis["stories_found"]>[number]) {
    if (!plan.section_brief_id) {
      toast.error("This interview isn't linked to a Pre-Flight section");
      return;
    }
    const text = `${s.headline}\n\n${s.story_summary}\n\nHuman element: ${s.human_element}\nOutcome: ${s.outcome}`;
    const res = await addFn({
      data: {
        section_brief_id: plan.section_brief_id,
        story_id: s.story_id,
        story_text: text,
      },
    });
    if (res.success) {
      toast.success("Story added to Pre-Flight");
      onLinked();
    } else {
      toast.error(res.error ?? "Could not add");
    }
  }

  return (
    <div className="space-y-6">
      <Section title="Linked Pre-Flight Section">
        {plan.section_brief_id ? (
          <Link
            to="/missions/$missionId/section-briefs"
            params={{ missionId }}
            className="inline-flex items-center gap-2 text-sm rounded-md px-3 py-1.5"
            style={{ background: NAVY, color: "white" }}
          >
            Open linked Pre-Flight <ArrowRight className="w-3 h-3" />
          </Link>
        ) : (
          <p className="text-sm text-neutral-500">
            This is a standalone interview — not linked to a specific section.
          </p>
        )}
      </Section>

      {reqs.length > 0 && (
        <Section title="Requirements Updated by This Interview">
          <ul className="space-y-1 text-sm text-neutral-300">
            {reqs.map((r, i) => (
              <li key={i}>
                <span className="text-xs text-neutral-500">{r.requirement_id}</span> ·{" "}
                {r.requirement_text}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Stories Found">
        <p className="text-xs italic mb-3" style={{ color: GOLD }}>
          Stories are the most underpowered asset in most proposals. Every story IRIS found here
          belongs in your Pre-Flight answers.
        </p>
        {stories.length === 0 ? (
          <p className="text-sm text-neutral-500">No stories surfaced from this interview.</p>
        ) : (
          <ul className="space-y-2">
            {stories.map((s) => (
              <li
                key={s.story_id}
                className="rounded p-3 text-sm flex items-start justify-between gap-3"
                style={{ background: BG, border: `1px solid ${BORDER}` }}
              >
                <div className="flex-1">
                  <p className="font-semibold text-white">{s.headline}</p>
                  <p className="text-xs text-neutral-400 mt-1">{s.proposal_use}</p>
                </div>
                <button
                  onClick={() => void addStory(s)}
                  disabled={!plan.section_brief_id}
                  className="text-[11px] rounded-md px-3 py-1.5 font-semibold shrink-0 disabled:opacity-40"
                  style={{ background: GOLD, color: NAVY }}
                >
                  Add to Pre-Flight
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

/* -------------------- NEW INTERVIEW MODAL -------------------- */

function NewInterviewModal({
  missionId,
  onClose,
  onCreated,
}: {
  missionId: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const createFn = useServerFn(createInterviewPlan);
  const genFn = useServerFn(generateInterviewPlan);
  const listSbFn = useServerFn(listSectionBriefs);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const [smeName, setSmeName] = useState("");
  const [smeRole, setSmeRole] = useState("");
  const [smeOrg, setSmeOrg] = useState("");
  const [smeType, setSmeType] = useState<"internal" | "client_sme" | "subject_expert">(
    "subject_expert",
  );
  const [sectionBriefId, setSectionBriefId] = useState<string>("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [additional, setAdditional] = useState("");

  const { data: sbs } = useQuery({
    queryKey: ["section-briefs", missionId],
    queryFn: () => listSbFn({ data: { mission_id: missionId } }),
  });
  const sectionBriefs: Array<{ id: string; section_name: string }> = useMemo(
    () =>
      sbs?.success
        ? (sbs.briefs as unknown as Array<{ id: string; section_name: string }>)
        : [],
    [sbs],
  );

  async function handleSubmit() {
    if (!smeName.trim() || !smeRole.trim()) {
      toast.error("Name and role are required");
      return;
    }
    setBusy(true);
    try {
      const created = await createFn({
        data: {
          mission_id: missionId,
          sme_name: smeName.trim(),
          sme_role: smeRole.trim(),
          sme_organization: smeOrg.trim() || null,
          sme_type: smeType,
          section_brief_id: sectionBriefId || null,
          scheduled_at: scheduledAt || null,
          additional_context: additional.trim() || null,
        },
      });
      if (!created.success) {
        toast.error(created.error ?? "Could not create");
        return;
      }
      const id = (created.plan as { id: string }).id;
      const gen = await genFn({ data: { interview_flight_plan_id: id } });
      if (!gen.success) {
        toast.error(gen.error ?? "Created, but IRIS could not generate the plan");
      } else {
        toast.success("Interview Flight Plan™ ready");
      }
      qc.invalidateQueries({ queryKey: ["interview-plans", missionId] });
      onCreated(id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-6"
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-xl p-6 mt-12"
        style={{ background: PANEL, border: `1px solid ${BORDER}`, color: "#e5e7eb" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-white mb-1 inline-flex items-center gap-2">
          <Users className="w-4 h-4" style={{ color: GOLD }} /> New Interview Flight Plan™
        </h2>
        <p className="text-xs text-neutral-400 mb-4">
          IRIS will generate a complete pre-interview intelligence package.
        </p>
        <div className="space-y-3 text-sm">
          <Field label="SME Name *">
            <input
              value={smeName}
              onChange={(e) => setSmeName(e.target.value)}
              className="w-full rounded-md px-2 py-1.5 bg-transparent"
              style={{ border: `1px solid ${BORDER}`, color: "#e5e7eb" }}
            />
          </Field>
          <Field label="SME Role *">
            <input
              value={smeRole}
              onChange={(e) => setSmeRole(e.target.value)}
              className="w-full rounded-md px-2 py-1.5 bg-transparent"
              style={{ border: `1px solid ${BORDER}`, color: "#e5e7eb" }}
            />
          </Field>
          <Field label="SME Organization">
            <input
              value={smeOrg}
              onChange={(e) => setSmeOrg(e.target.value)}
              className="w-full rounded-md px-2 py-1.5 bg-transparent"
              style={{ border: `1px solid ${BORDER}`, color: "#e5e7eb" }}
            />
          </Field>
          <Field label="SME Type">
            <select
              value={smeType}
              onChange={(e) => setSmeType(e.target.value as typeof smeType)}
              className="w-full rounded-md px-2 py-1.5"
              style={{ border: `1px solid ${BORDER}`, background: BG, color: "#e5e7eb" }}
            >
              <option value="internal">Internal Team Member</option>
              <option value="client_sme">Client SME</option>
              <option value="subject_expert">Subject Matter Expert</option>
            </select>
          </Field>
          <Field label="Link to Pre-Flight Section">
            <select
              value={sectionBriefId}
              onChange={(e) => setSectionBriefId(e.target.value)}
              className="w-full rounded-md px-2 py-1.5"
              style={{ border: `1px solid ${BORDER}`, background: BG, color: "#e5e7eb" }}
            >
              <option value="">Standalone</option>
              {sectionBriefs.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.section_name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Scheduled Date/Time">
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="w-full rounded-md px-2 py-1.5 bg-transparent"
              style={{ border: `1px solid ${BORDER}`, color: "#e5e7eb" }}
            />
          </Field>
          <Field label="Additional Context">
            <textarea
              value={additional}
              onChange={(e) => setAdditional(e.target.value)}
              rows={3}
              placeholder="Anything IRIS should know going into this interview…"
              className="w-full rounded-md px-2 py-1.5 bg-transparent"
              style={{ border: `1px solid ${BORDER}`, color: "#e5e7eb" }}
            />
          </Field>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="text-xs px-3 py-1.5 rounded-md text-neutral-400">
            Cancel
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-50"
            style={{ background: GOLD, color: NAVY }}
          >
            {busy ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                IRIS is preparing your Interview Flight Plan™…
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" /> Generate Interview Flight Plan™
              </>
            )}
          </button>
        </div>
        <p className="text-[10px] text-neutral-500 mt-3 italic">
          For best results, generate a Mission Brief and Strategic Assessment first. IRIS will
          still generate a plan, but with limited procurement context.
        </p>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider text-neutral-500 block mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}

/* compat: avoid unused-icon warning */
void CheckCircle2;
