import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, Circle, AlertTriangle, Sparkles, ChevronRight, Users, Target, ListChecks, Layers, Brain, Trophy } from "lucide-react";

export const Route = createFileRoute("/_authenticated/journey-map")({
  component: JourneyMapPage,
});

type Status = "complete" | "active" | "upcoming" | "at_risk";

type Stage = {
  num: number;
  name: string;
  status: Status;
  tasksDone: number;
  tasksTotal: number;
  objective: string;
  actions: string[];
  decisions: string[];
  atlas: string;
  iris: string;
  success: string[];
  risks: string[];
  emotion: { color: "green" | "yellow" | "blue"; label: string };
  irisRecommends: string;
  nextActions: string[];
};

const STAGES: Stage[] = [
  {
    num: 1, name: "Mission Activated", status: "complete", tasksDone: 5, tasksTotal: 5,
    objective: "Stand up the mission fast — get the right people briefed, documents uploaded, and team oriented within 24 hours.",
    actions: [
      "Create mission, assign team, set submission deadline",
      "Upload RFP and client materials to the Vault",
      "Draft Mission Briefing and initial win themes",
      "Invite contributors and assign roles",
    ],
    decisions: [
      "Who is on the team and in what capacity?",
      "What are our initial win themes?",
      "What do we already know about this client?",
    ],
    atlas: "Lobby surfaces new mission card. Mission Overview auto-populates from RFP metadata. Studio generates initial question set. Team members receive role-specific briefings on first login.",
    iris: "Reads full RFP on upload. Identifies all requirements, evaluation criteria, and ambiguous sections. Generates preliminary intelligence brief. Suggests win themes based on RFP language patterns. Maps available Oracle intelligence.",
    success: [
      "Mission is live within 4 hours of pursuit decision",
      "All core team members have accepted roles",
      "Mission Briefing reflects at least 3 defensible win themes",
    ],
    risks: [
      "Win themes set before full RFP analysis",
      "Critical team member not included",
      "Submission deadline misconfigured",
    ],
    emotion: { color: "yellow", label: "Engaged but Anxious — the clock is running" },
    irisRecommends: "Stage complete. Carry forward win theme drafts into Intelligence validation.",
    nextActions: ["Confirm all roles accepted", "Lock initial briefing version", "Open Intelligence stage"],
  },
  {
    num: 2, name: "Intelligence Gathered", status: "complete", tasksDone: 4, tasksTotal: 4,
    objective: "Rapidly synthesize everything known about this client, program, and competitive environment — and surface gaps before writing begins.",
    actions: [
      "Review IRIS-generated intelligence brief in the Oracle",
      "Add client-specific documents to the Vault",
      "Validate and annotate win themes based on gathered intelligence",
      "Document stakeholder intelligence from client conversations",
    ],
    decisions: [
      "Which intelligence gaps are blockers vs. acceptable uncertainties?",
      "How do competitive insights change win theme positioning?",
      "Which stakeholder relationships are strategic assets?",
    ],
    atlas: "Oracle reads as an intelligence dossier organized by category. Vault shows a visual gap analysis — what's uploaded vs. what IRIS has flagged as missing.",
    iris: "Cross-references RFP language with Oracle database. Identifies CMS regulations, state statutes, and policy frameworks. Builds stakeholder graph. Generates competitive intelligence and differentiator positioning. Produces a \"What We Know / What We Need\" brief.",
    success: [
      "Oracle has structured intelligence in all key categories",
      "Win themes have been tested against competitive landscape",
      "No critical intelligence gaps remain unaddressed",
    ],
    risks: [
      "Over-reliance on IRIS intelligence without human validation",
      "Stakeholder intelligence siloed in one person's head",
      "Competitive intelligence stale or incomplete",
    ],
    emotion: { color: "blue", label: "Focused — the team is being armed, not overwhelmed" },
    irisRecommends: "Intelligence base is strong. Move to Alignment.",
    nextActions: ["Publish intelligence digest", "Tag stakeholder graph owners", "Schedule alignment session"],
  },
  {
    num: 3, name: "Alignment Locked", status: "active", tasksDone: 3, tasksTotal: 5,
    objective: "Before a single word is written, every team member must understand and agree on the mission's strategy, win themes, and key decisions.",
    actions: [
      "Engagement Lead finalizes win themes in Mission Overview",
      "Team reviews and acknowledges Mission Briefing",
      "Key Decisions log is established and owned",
      "Writers are matched to sections and receive IRIS guidance notes",
      "Kickoff brief distributed — IRIS generates role-specific versions",
    ],
    decisions: [
      "Are all win themes defensible given current intelligence?",
      "Which sections require the most strategic direction?",
      "What are the non-negotiables — claims we must make to win?",
    ],
    atlas: "Mission Overview becomes the single source of strategic truth. Win themes display prominently. Decisions log shows what's closed and what's open. Studio shows every section with owner, due date, and status.",
    iris: "Analyzes win theme language against evaluation criteria. Cross-checks team activity against Mission Briefing — flags anyone who hasn't reviewed key materials. Generates section-specific context packets for each writer. Establishes the alignment baseline for continuous monitoring.",
    success: [
      "100% of core team has reviewed and acknowledged Mission Briefing",
      "Every section has a clear owner, deadline, and IRIS guidance note",
      "Zero open decisions that should be closed before writing begins",
    ],
    risks: [
      "Win themes finalized without full team buy-in",
      "Mission Briefing updated after writers have started",
      "Key decisions made verbally but not logged",
    ],
    emotion: { color: "green", label: "Aligned and Ready — everyone knows their role" },
    irisRecommends: "Two writers have not acknowledged the brief. Close the loop before execution begins.",
    nextActions: [
      "Chase brief acknowledgements from M. Reyes and J. Chen",
      "Resolve 1 open decision on pricing posture",
      "Assign owner to the Compliance section",
    ],
  },
  {
    num: 4, name: "Execution", status: "upcoming", tasksDone: 0, tasksTotal: 6,
    objective: "Produce excellent content. Writers execute with intelligence, SMEs contribute efficiently, the Studio tracks everything in real time.",
    actions: [
      "Writers open assigned sections and review IRIS section briefs",
      "Pull relevant Vault documents and Oracle intelligence into workspace",
      "Draft responses incorporating win themes and client language",
      "Submit questions to SMEs through the Studio",
      "Flag blockers for escalation",
    ],
    decisions: [
      "Which source materials to anchor each response in?",
      "How to express win themes within compliance requirements?",
      "When to escalate a section that needs strategic guidance before writing continues?",
    ],
    atlas: "Studio functions as the cockpit — RFP requirement, source documents, and IRIS guidance visible without leaving the screen. SME communication happens in-thread. Escalations surface immediately to the PM dashboard.",
    iris: "Runs continuous alignment monitoring across all active responses. Compares drafts against win themes — flags drift in real time. Detects contradictory claims across sections. Flags unanswered questions past input deadline. Surfaces risk signals — phrases or commitments that could create problems at evaluation.",
    success: [
      "80% of sections at \"In Progress\" or better by Day 3 of writing",
      "IRIS alignment score above threshold for all sections",
      "No escalations sitting unaddressed for more than 4 hours",
    ],
    risks: [
      "Writers making strategic decisions that belong to the Engagement Lead",
      "SME bottlenecks causing downstream failures",
      "Conflicting intelligence between Vault and Oracle",
    ],
    emotion: { color: "blue", label: "Focused with Momentum — equipped, not alone" },
    irisRecommends: "Pre-stage. Pre-load section briefs so writers can start the moment alignment locks.",
    nextActions: ["Generate per-section IRIS briefs", "Pre-assign SME coverage", "Open SME availability calendar"],
  },
  {
    num: 5, name: "Review & Refinement", status: "upcoming", tasksDone: 0, tasksTotal: 5,
    objective: "Elevate every section from accurate to exceptional. Validate strategic alignment. Verify compliance. Protect win themes through to final draft.",
    actions: [
      "PM moves completed sections to \"In Review\"",
      "Reviewers assess against win themes, compliance requirements, and quality standards",
      "Structured feedback captured in ATLAS (not email/track changes)",
      "Writers address feedback and resubmit",
      "Engagement Lead conducts final strategic review",
    ],
    decisions: [
      "Which sections require a full rewrite vs. targeted improvement?",
      "Where is win theme alignment weakest — is there time to fix it?",
      "Which feedback items require Engagement Lead sign-off?",
    ],
    atlas: "Review queue sorted by priority. IRIS pre-annotates each section with a win theme alignment score and flags specific paragraphs for strategic review. Feedback is structured by type, priority, and action. Writers see feedback as a clear action list.",
    iris: "Runs full compliance check — every RFP requirement mapped to a specific response location. Generates win theme coverage report. Identifies cross-section inconsistencies (pricing claims vs. operational claims). Produces Submission Readiness Score. Generates reviewer briefings.",
    success: [
      "All sections reviewed before the 48-hour submission window",
      "IRIS compliance check shows 100% requirement coverage",
      "Win theme alignment above target threshold across all sections",
    ],
    risks: [
      "Review happening too late for rewrites",
      "Conflicting reviewer feedback creating writer paralysis",
      "Compliance gaps missed because review focused on quality over requirements",
    ],
    emotion: { color: "yellow", label: "Intense but Controlled — surgical, not chaotic" },
    irisRecommends: "Pre-stage. Pre-warm the compliance matrix so review can start day one.",
    nextActions: ["Stage compliance scaffolding", "Identify reviewer pool", "Define alignment thresholds"],
  },
  {
    num: 6, name: "Final Assembly", status: "upcoming", tasksDone: 0, tasksTotal: 6,
    objective: "Convert reviewed, approved content into a complete, formatted, compliant submission package — on time, on strategy, on spec.",
    actions: [
      "PM runs ATLAS submission checklist",
      "All sections confirmed as \"Approved\" in the Studio",
      "Final document assembled from approved Studio sections",
      "Formatting, appendices, and required forms finalized",
      "IRIS runs final compliance and consistency scan",
      "Engagement Lead signs off",
    ],
    decisions: [
      "Which optional sections or appendices to include?",
      "Final word count and page compliance review",
      "Any last-minute intelligence that changes a claim?",
    ],
    atlas: "Submission checklist is the final instrument panel — every item has a status, nothing assumed complete without confirmation. Assembly pulls from approved Studio sections only. IRIS generates a final submission brief for the Engagement Lead.",
    iris: "Final comprehensive pre-submission scan: compliance sweep, cross-section consistency check, win theme confirmation in executive summary, prohibited language check, metadata and file format compliance. Produces final Submission Readiness Report.",
    success: [
      "Submission checklist at 100% green before package is sealed",
      "IRIS final scan shows zero critical compliance issues",
      "Submission delivered with time remaining — not at the deadline second",
    ],
    risks: [
      "Section approved but not the most current version pulled",
      "Formatting specifications missed",
      "Required certifications incomplete",
      "Submission platform logistics creating last-minute chaos",
    ],
    emotion: { color: "green", label: "Relief and Pride — earned confidence, not just relief" },
    irisRecommends: "Pre-stage. Lock submission format spec now to avoid late-stage churn.",
    nextActions: ["Confirm portal credentials", "Stage required forms", "Schedule sign-off window"],
  },
  {
    num: 7, name: "Submitted", status: "upcoming", tasksDone: 0, tasksTotal: 4,
    objective: "Seal the submission. Capture institutional knowledge. Prepare intelligence for the next mission.",
    actions: [
      "Post-submission debrief logged in Mission record",
      "Best-performing content flagged for reuse",
      "IRIS generates mission debrief report",
      "Lessons learned linked to relevant sections",
    ],
    decisions: [
      "Which content should be archived as a template?",
      "Which intelligence was most valuable and should be maintained?",
      "What process gaps need to be addressed for the next mission?",
    ],
    atlas: "Mission transitions from Active to Complete in the Lobby. Mission Overview becomes an archival record — every decision, signal, and piece of intelligence preserved. ATLAS builds a flywheel: more missions = smarter subsequent missions.",
    iris: "Synthesizes the mission into institutional memory. Flags high-performing response sections for the content library. Identifies patterns for future win theme strategy. Updates intelligence models with new client and competitive data.",
    success: [
      "Mission fully archived and searchable",
      "High-value content tagged for reuse",
      "Debrief completed before team disperses",
    ],
    risks: [
      "Team disperses before debrief",
      "Best content not flagged",
      "IRIS models not updated with mission learnings",
    ],
    emotion: { color: "green", label: "Proud and Forward-Looking — every mission makes the next one better" },
    irisRecommends: "Pre-stage. Schedule debrief at activation so it never gets lost.",
    nextActions: ["Set debrief on calendar", "Define content-library tags", "Earmark archival owner"],
  },
];

const PERSONAS = [
  "All Roles",
  "Executive Sponsor",
  "Engagement Lead",
  "PM",
  "Writer",
  "SME",
  "Reviewer",
] as const;
type Persona = (typeof PERSONAS)[number];

// Per-stage touchpoints: which action indices belong to each persona.
// Empty array = no touchpoint at that stage.
const PERSONA_TOUCHPOINTS: Record<Exclude<Persona, "All Roles">, Record<number, number[]>> = {
  "Executive Sponsor": {
    1: [0],                // approves mission, team, deadline
    3: [1],                // acknowledges Mission Briefing
    6: [],                 // sign-off via Engagement Lead, but visibility here
    7: [0],                // post-submission debrief
  },
  "Engagement Lead": {
    1: [0, 2, 3],
    2: [2, 3],
    3: [0, 1, 2],
    4: [4],
    5: [4],
    6: [5],
    7: [0, 2],
  },
  "PM": {
    1: [0, 3],
    2: [1],
    3: [2, 3],
    4: [4],
    5: [0, 2],
    6: [0, 1, 2, 3],
    7: [0, 3],
  },
  "Writer": {
    3: [3],
    4: [0, 1, 2, 4],
    5: [3],
    6: [],
    7: [1],
  },
  "SME": {
    2: [3],
    4: [3],
    5: [1],
  },
  "Reviewer": {
    5: [1, 2],
    6: [4],
  },
};

function touchpointActions(p: Persona, stageNum: number): number[] | null {
  if (p === "All Roles") return null;
  return PERSONA_TOUCHPOINTS[p]?.[stageNum] ?? [];
}

function hasTouchpoint(p: Persona, stageNum: number): boolean {
  if (p === "All Roles") return true;
  return (PERSONA_TOUCHPOINTS[p]?.[stageNum]?.length ?? 0) > 0;
}

function personaInitials(p: Persona): string {
  if (p === "All Roles") return "ALL";
  return p
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function statusColor(s: Status) {
  if (s === "complete") return "#22C55E";
  if (s === "active") return "#3B82F6";
  if (s === "at_risk") return "#F59E0B";
  return "#475569";
}

function emotionColor(c: "green" | "yellow" | "blue") {
  if (c === "green") return "#22C55E";
  if (c === "yellow") return "#F59E0B";
  return "#3B82F6";
}


type MotionPref = "auto" | "on" | "off";
const MOTION_KEY = "atlas.journeyMap.motionPref";

function useMotionPreference() {
  const [pref, setPref] = useState<MotionPref>("auto");
  const [systemReduced, setSystemReduced] = useState(false);

  // Load persisted preference
  useEffect(() => {
    try {
      const v = localStorage.getItem(MOTION_KEY);
      if (v === "auto" || v === "on" || v === "off") setPref(v);
    } catch {
      /* ignore */
    }
  }, []);

  // Watch system reduced-motion
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setSystemReduced(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  function update(next: MotionPref) {
    setPref(next);
    try {
      localStorage.setItem(MOTION_KEY, next);
    } catch {
      /* ignore */
    }
  }

  const animate = pref === "on" ? true : pref === "off" ? false : !systemReduced;
  return { pref, setPref: update, animate, systemReduced };
}

function JourneyMapPage() {
  const activeIdx = STAGES.findIndex((s) => s.status === "active");
  const [selected, setSelected] = useState<number>(activeIdx >= 0 ? activeIdx : 0);
  const [persona, setPersona] = useState<Persona>("All Roles");
  const [insightsOpen, setInsightsOpen] = useState(true);
  const [openTransition, setOpenTransition] = useState<number | null>(null);
  const { pref: motionPref, setPref: setMotionPref, animate, systemReduced } = useMotionPreference();

  const stage = STAGES[selected];

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Mission Context Bar */}
      <header className="border-b border-border bg-surface/60 backdrop-blur">
        <div className="mx-auto max-w-[1600px] px-6 py-4 flex flex-wrap items-center gap-6">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Mission</div>
            <div className="text-base font-semibold">Ohio Medicaid Managed Care — 2026</div>
          </div>
          <div className="h-8 w-px bg-border" />
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Active Stage</div>
            <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: "#3B82F6" }}>
              <span className="h-2 w-2 rounded-full bg-[#3B82F6] animate-pulse" />
              {STAGES[activeIdx]?.name ?? "—"}
            </div>
          </div>
          <div className="h-8 w-px bg-border" />
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Submission</div>
            <div className="text-sm font-semibold text-foreground">12d 04h remaining</div>
          </div>
          <div className="h-8 w-px bg-border" />
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">IRIS Mission Health</div>
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-32 rounded-full bg-border overflow-hidden">
                <div className="h-full rounded-full" style={{ width: "78%", background: "linear-gradient(90deg,#3B82F6,#6366F1)" }} />
              </div>
              <span className="text-sm font-semibold">78</span>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div
              role="radiogroup"
              aria-label="Persona switching animations"
              className="flex items-center rounded-md border border-border bg-surface p-0.5"
              title={
                motionPref === "auto"
                  ? `Auto — following system preference (${systemReduced ? "reduced" : "full motion"})`
                  : motionPref === "on"
                    ? "Animated — overrides system reduced motion"
                    : "Instant — no transitions"
              }
            >
              <span className="px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Motion
              </span>
              {(["auto", "on", "off"] as MotionPref[]).map((opt) => {
                const active = motionPref === opt;
                return (
                  <button
                    key={opt}
                    role="radio"
                    aria-checked={active}
                    onClick={() => setMotionPref(opt)}
                    className="rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] transition-colors"
                    style={{
                      background: active ? "rgba(59,130,246,0.15)" : "transparent",
                      color: active ? "#93C5FD" : "var(--muted-foreground)",
                    }}
                  >
                    {opt === "auto" ? "Auto" : opt === "on" ? "On" : "Off"}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setInsightsOpen((o) => !o)}
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
            >
              {insightsOpen ? "Hide" : "Show"} IRIS Insights
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1600px] px-6 py-8 flex gap-6">
        {/* MAIN COLUMN */}
        <div className="flex-1 min-w-0">
          {/* Personas */}
          <div className="mb-6">
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground mb-2">Filter by role</div>
            <div className="flex flex-wrap gap-2">
              {PERSONAS.map((p) => {
                const active = persona === p;
                return (
                  <button
                    key={p}
                    onClick={() => setPersona(p)}
                    className="rounded-full border px-3 py-1 text-[11px] font-medium transition"
                    style={{
                      borderColor: active ? "#3B82F6" : "var(--border)",
                      background: active ? "rgba(59,130,246,0.12)" : "transparent",
                      color: active ? "#93C5FD" : "var(--muted-foreground)",
                    }}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Timeline */}
          <div className="rounded-xl border border-border bg-surface/40 p-6">
            <div className="flex items-stretch gap-2">
              {STAGES.map((s, i) => {
                const isSelected = i === selected;
                const isActive = s.status === "active";
                const color = statusColor(s.status);
                const involved = hasTouchpoint(persona, s.num);
                const dim = persona !== "All Roles" && !involved;
                return (
                  <div key={s.num} className="flex-1 flex flex-col items-stretch min-w-0">
                    <button
                      onClick={() => setSelected(i)}
                      className={`group relative flex flex-col items-center text-center rounded-lg p-3 ${animate ? "transition-all duration-500 ease-out" : ""}`}
                      style={{
                        background: isSelected ? "rgba(59,130,246,0.08)" : "transparent",
                        border: `1px solid ${isSelected ? "rgba(59,130,246,0.4)" : "transparent"}`,
                        opacity: dim ? 0.35 : 1,
                      }}
                    >
                      <div className="relative mb-2">
                        <div
                          className="flex items-center justify-center rounded-full font-semibold text-white"
                          style={{
                            width: isActive ? 56 : 44,
                            height: isActive ? 56 : 44,
                            background: s.status === "complete" ? color : s.status === "active" ? "rgba(59,130,246,0.18)" : "transparent",
                            border: `2px solid ${color}`,
                            color: s.status === "upcoming" ? "var(--muted-foreground)" : "#fff",
                            boxShadow: isActive ? "0 0 0 6px rgba(59,130,246,0.18), 0 0 24px rgba(59,130,246,0.35)" : "none",
                          }}
                        >
                          {s.status === "complete" ? (
                            <CheckCircle2 size={20} />
                          ) : s.status === "at_risk" ? (
                            <AlertTriangle size={20} />
                          ) : (
                            <span className="text-sm">{s.num}</span>
                          )}
                        </div>
                        {isActive && (
                          <span className="absolute inset-0 rounded-full border-2 animate-ping" style={{ borderColor: "#3B82F6" }} />
                        )}
                        {persona !== "All Roles" && involved && (
                          <span
                            key={persona}
                            className={`absolute -bottom-1 -right-1 flex h-5 min-w-[20px] items-center justify-center rounded-full px-1 text-[9px] font-bold text-white shadow ${animate ? "animate-scale-in" : ""}`}
                            style={{ background: "#6366F1", border: "2px solid var(--background)" }}
                            title={`${persona} touchpoint`}
                          >
                            {personaInitials(persona)}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Stage {s.num}</div>
                      <div className="text-[12px] font-semibold text-foreground leading-tight">{s.name}</div>
                      <div className="mt-1 text-[10px] uppercase tracking-[0.16em]" style={{ color }}>
                        {s.status === "complete" ? "Complete" : s.status === "active" ? "Active" : s.status === "at_risk" ? "At Risk" : "Upcoming"}
                      </div>
                    </button>


                    {/* Transition indicator */}
                    {i < STAGES.length - 1 && (
                      <div className="relative mt-3 flex items-center justify-center">
                        <div
                          className="absolute left-1/2 right-[-50%] top-1/2 h-px -translate-y-1/2"
                          style={{
                            background: s.status === "complete" ? "#22C55E" : "transparent",
                            borderTop: s.status === "complete" ? undefined : "1px dashed var(--border)",
                          }}
                        />
                        <button
                          onClick={() => setOpenTransition(openTransition === i ? null : i)}
                          className="relative z-10 rounded-full border border-border bg-background px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.15em] text-muted-foreground hover:text-foreground"
                        >
                          {s.tasksDone}/{s.tasksTotal}
                        </button>
                      </div>
                    )}

                    {openTransition === i && i < STAGES.length - 1 && (
                      <div className="mt-2 rounded-md border border-border bg-background p-2 text-[10px] text-muted-foreground">
                        <div className="mb-1 font-semibold uppercase tracking-[0.16em] text-foreground">To unlock {STAGES[i + 1].name}</div>
                        <ul className="space-y-1">
                          {s.nextActions.map((a) => (
                            <li key={a} className="flex items-start gap-1.5">
                              <Circle size={10} className="mt-0.5 shrink-0" />
                              <span>{a}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Stage Detail Panel */}
          <section className="mt-6 rounded-xl border border-border bg-surface/40 p-6 animate-in fade-in slide-in-from-top-2 duration-200" key={selected}>
            <div className="flex items-center gap-3 mb-5">
              <span
                className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold"
                style={{
                  background: statusColor(stage.status),
                  color: "#fff",
                }}
              >
                {stage.num}
              </span>
              <div>
                <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Stage Detail</div>
                <h2 className="text-lg font-semibold">{stage.name}</h2>
              </div>
            </div>

            {persona !== "All Roles" && (
              hasTouchpoint(persona, stage.num) ? (
                <div
                  className={`mb-4 flex items-center gap-2 rounded-lg border px-3 py-2 text-[12px] ${animate ? "animate-fade-in" : ""}`}
                  style={{ borderColor: "rgba(99,102,241,0.4)", background: "rgba(99,102,241,0.08)", color: "#C7D2FE" }}
                >
                  <span
                    className="flex h-5 min-w-[20px] items-center justify-center rounded-full px-1 text-[9px] font-bold text-white"
                    style={{ background: "#6366F1" }}
                  >
                    {personaInitials(persona)}
                  </span>
                  <span>
                    <span className="font-semibold text-foreground">{persona}</span> is active at this stage — touchpoints highlighted below.
                  </span>
                </div>
              ) : (
                <div
                  className={`mb-4 flex items-center gap-2 rounded-lg border border-border bg-background/40 px-3 py-2 text-[12px] text-muted-foreground ${animate ? "animate-fade-in" : ""}`}
                >
                  <Users size={14} />
                  <span>
                    <span className="font-semibold text-foreground">{persona}</span> has no direct touchpoint at this stage. Stay informed; the team is operating on your behalf.
                  </span>
                </div>
              )
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
              <DetailCard icon={<Target size={14} />} title="User Objective">
                <p className="text-[12px] leading-relaxed text-muted-foreground">{stage.objective}</p>
              </DetailCard>
              <DetailCard icon={<ListChecks size={14} />} title="Key Actions">
                <ul className="space-y-1.5">
                  {stage.actions.map((a, idx) => {
                    const tps = touchpointActions(persona, stage.num);
                    const isYours = tps !== null && tps.includes(idx);
                    return (
                      <li
                        key={a}
                        className={`flex items-start gap-1.5 rounded px-1.5 py-1 text-[12px] ${animate ? "transition-all duration-500 ease-out" : ""}`}
                        style={{
                          background: isYours ? "rgba(99,102,241,0.1)" : "transparent",
                          color: isYours ? "#E0E7FF" : "var(--muted-foreground)",
                          opacity: persona !== "All Roles" && tps !== null && tps.length > 0 && !isYours ? 0.55 : 1,
                        }}
                      >
                        <ChevronRight
                          size={12}
                          className="mt-0.5 shrink-0"
                          style={{ color: isYours ? "#A5B4FC" : "var(--foreground)" }}
                        />
                        <span>{a}</span>
                        {isYours && (
                          <span
                            className="ml-auto rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em]"
                            style={{ background: "rgba(99,102,241,0.2)", color: "#A5B4FC" }}
                          >
                            You
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </DetailCard>

              <DetailCard icon={<Users size={14} />} title="Key Decisions">
                <ul className="space-y-1.5">
                  {stage.decisions.map((d) => (
                    <li key={d} className="flex items-start gap-1.5 text-[12px] text-muted-foreground">
                      <Circle size={8} className="mt-1 shrink-0" />
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
              </DetailCard>
              <DetailCard icon={<Layers size={14} />} title="ATLAS" accent="#3B82F6">
                <p className="text-[12px] leading-relaxed text-muted-foreground">{stage.atlas}</p>
              </DetailCard>
              <DetailCard icon={<Brain size={14} />} title="IRIS" accent="#6366F1">
                <p className="text-[12px] leading-relaxed text-muted-foreground">{stage.iris}</p>
              </DetailCard>
              <DetailCard icon={<Trophy size={14} />} title="Success Looks Like" accent="#22C55E">
                <ul className="space-y-1.5">
                  {stage.success.map((s) => (
                    <li key={s} className="flex items-start gap-1.5 text-[12px] text-muted-foreground">
                      <CheckCircle2 size={12} className="mt-0.5 shrink-0" style={{ color: "#22C55E" }} />
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </DetailCard>
            </div>

            {/* Risks */}
            <div
              className="mt-4 rounded-lg border p-4"
              style={{ borderColor: "rgba(245,158,11,0.35)", background: "rgba(245,158,11,0.06)" }}
            >
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={14} style={{ color: "#F59E0B" }} />
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "#F59E0B" }}>Risks</div>
              </div>
              <ul className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {stage.risks.map((r) => (
                  <li key={r} className="text-[12px] text-muted-foreground flex items-start gap-1.5">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full shrink-0" style={{ background: "#F59E0B" }} />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Emotional state */}
            <div className="mt-3 flex items-center gap-3 rounded-lg border border-border bg-background/40 px-4 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Emotional State</div>
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: emotionColor(stage.emotion.color) }} />
              <span className="text-[12px] text-foreground">{stage.emotion.label}</span>
            </div>
          </section>
        </div>

        {/* IRIS Insights Sidebar */}
        {insightsOpen && (
          <aside className="hidden lg:block w-[320px] shrink-0">
            <div
              className="sticky top-6 rounded-xl border p-5"
              style={{ borderColor: "rgba(99,102,241,0.35)", background: "rgba(99,102,241,0.06)" }}
            >
              <div className="flex items-center gap-2 mb-1">
                <Sparkles size={14} style={{ color: "#6366F1" }} />
                <div className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: "#6366F1" }}>IRIS Journey Insights</div>
              </div>
              <div className="text-[11px] text-muted-foreground mb-4">Stage {stage.num} — {stage.name}</div>

              <div className="mb-4">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-1.5">What IRIS Recommends</div>
                <p className="text-[12px] leading-relaxed text-foreground">{stage.irisRecommends}</p>
              </div>

              <div className="mb-4">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-1.5">Next 3 Actions</div>
                <ol className="space-y-1.5">
                  {stage.nextActions.slice(0, 3).map((a, idx) => (
                    <li key={a} className="flex items-start gap-2 text-[12px] text-foreground">
                      <span
                        className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold"
                        style={{ background: "rgba(99,102,241,0.18)", color: "#A5B4FC" }}
                      >
                        {idx + 1}
                      </span>
                      <span>{a}</span>
                    </li>
                  ))}
                </ol>
              </div>

              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-1.5">Active Risks</div>
                <ul className="space-y-1.5">
                  {stage.risks.slice(0, 3).map((r) => (
                    <li key={r} className="flex items-start gap-2 text-[12px] text-muted-foreground">
                      <AlertTriangle size={12} className="mt-0.5 shrink-0" style={{ color: "#F59E0B" }} />
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

function DetailCard({
  icon, title, children, accent,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  accent?: string;
}) {
  return (
    <div
      className="rounded-lg border bg-background/40 p-4"
      style={{ borderColor: accent ? `${accent}55` : "var(--border)" }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span style={{ color: accent ?? "var(--muted-foreground)" }}>{icon}</span>
        <div className="text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: accent ?? "var(--muted-foreground)" }}>
          {title}
        </div>
      </div>
      {children}
    </div>
  );
}
