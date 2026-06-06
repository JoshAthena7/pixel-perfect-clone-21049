import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  Flag,
  Pin,
  Target,
} from "lucide-react";
import { AssistsBar } from "@/components/v4/AssistsBar";
import { SOSButton, SOSModal } from "@/components/v2/SOSButton";
import { ScoreMeOverlay } from "@/components/v2/ScoreMeOverlay";
import { PhoneAFriendOverlay } from "@/components/v2/PhoneAFriendOverlay";
import { DailyPulse } from "@/components/v4/DailyPulse";
import { ThreadPanel } from "@/components/threads/ThreadPanel";
import { openUpdateReality } from "@/components/v2/UpdateRealityModal";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { IrisKickoffBadge } from "@/components/v2/IrisKickoffBadge";
import { QuestionProvider, useQuestion, type SelectedQuestion } from "@/contexts/QuestionContext";

export const Route = createFileRoute("/_authenticated/missions/$missionId/")({
  component: MissionFlightDeckLandingWrapper,
});

function MissionFlightDeckLandingWrapper() {
  return (
    <QuestionProvider>
      <MissionFlightDeckLanding />
    </QuestionProvider>
  );
}

function sectionToSelected(s: Section): SelectedQuestion {
  return {
    id: s.id,
    questionNumber: s.question_number,
    sectionNumber: s.section_number,
    title: s.title,
    status: s.status,
    assignedWriterId: s.assigned_writer_id,
    pensDownDate: s.pens_down_date,
  };
}

/* ───────────────────────────── types ───────────────────────────── */

type Section = {
  id: string;
  mission_id: string;
  question_number: string;
  section_number: string | null;
  title: string;
  status: string | null;
  health: "red" | "yellow" | "green" | null;
  pens_down_date: string | null;
  assigned_writer_id: string | null;
  win_theme_alignment_score: number | null;
  iris_risk_flag: string | null;
  iris_risk_flag_text: string | null;
  sort_order: number | null;
};
type Profile = { id: string; display_name: string | null; email: string | null };
type Member = { user_id: string; role: string };
type Mission = {
  id: string;
  name: string;
  submission_date: string | null;
  win_themes: string[] | null;
};
type Gate = { id: string; gate_name: string; target_date: string | null };

/* ─────────────────────────── helpers ─────────────────────────── */

const STATUS_OPTIONS = [
  { ui: "Not Started", db: "not_started" },
  { ui: "In Progress", db: "in_progress" },
  { ui: "Draft Done", db: "draft_done" },
  { ui: "In Review", db: "ready_for_review" },
  { ui: "Approved", db: "approved" },
  { ui: "Blocked", db: "blocked" },
];

function statusUiLabel(db: string | null | undefined) {
  return STATUS_OPTIONS.find((s) => s.db === db)?.ui ?? "Not Started";
}
function statusPillClass(db: string | null | undefined): string {
  const v = db ?? "not_started";
  if (v === "in_progress") return "bg-sky-500/10 text-sky-300 border-sky-500/25";
  if (v === "draft_done") return "bg-indigo-500/10 text-indigo-300 border-indigo-500/25";
  if (v === "ready_for_review") return "bg-amber-500/10 text-amber-300 border-amber-500/25";
  if (v === "approved") return "bg-emerald-500/10 text-emerald-300 border-emerald-500/25";
  if (v === "blocked") return "bg-red-500/10 text-red-300 border-red-500/25";
  return "bg-muted/40 text-muted-foreground border-border";
}
function isComplete(db: string | null | undefined) {
  return db === "approved";
}
function isInProgress(db: string | null | undefined) {
  return db === "in_progress" || db === "draft_done" || db === "ready_for_review";
}
function daysUntil(iso: string | null) {
  return iso ? Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000) : null;
}
function fmtDate(iso: string | null) {
  return iso
    ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "—";
}
function fmtFullDate(iso: string | null) {
  return iso
    ? new Date(iso).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "—";
}
function initialsOf(name: string | null | undefined) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
function healthDotColor(h: Section["health"]) {
  if (h === "red") return "#ef4444";
  if (h === "yellow") return "#eab308";
  if (h === "green") return "#22c55e";
  return "rgba(255,255,255,0.25)";
}

/* ─────────────────────────── page ─────────────────────────── */

function MissionFlightDeckLanding() {
  const { missionId } = Route.useParams();
  const qc = useQueryClient();

  /* selected question — the source of truth for every instrument on this page */
  const { selectedQuestion, setSelectedQuestion } = useQuestion();

  /* assist overlay state */
  const [sosOpen, setSosOpen] = useState(false);
  const [scoreOpen, setScoreOpen] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [pulseOpen, setPulseOpen] = useState(false);
  const [threadOpen, setThreadOpen] = useState(false);

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


  /* me + role */
  const { data: me } = useQuery({
    queryKey: ["flight deck-landing-me"],
    queryFn: async () => (await supabase.auth.getUser()).data.user?.id ?? null,
  });
  const { data: myRole } = useQuery({
    queryKey: ["flight deck-landing-role", missionId, me],
    enabled: !!me,
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_members")
        .select("role")
        .eq("mission_id", missionId)
        .eq("user_id", me!);
      const roles = (data ?? []).map((r: { role: string }) => r.role);
      if (roles.includes("admin")) return "admin";
      if (roles.includes("lead")) return "lead";
      if (roles.includes("pm")) return "pm";
      if (roles.includes("writer")) return "writer";
      return roles[0] ?? "writer";
    },
  });
  const isLead = ["admin", "lead", "pm"].includes(myRole ?? "");

  /* mission */
  const { data: mission } = useQuery<Mission | null>({
    queryKey: ["flight deck-landing-mission", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("missions")
        .select("id,name,submission_date,win_themes")
        .eq("id", missionId)
        .maybeSingle();
      return (data as Mission | null) ?? null;
    },
  });

  /* sections */
  const { data: sections = [], isLoading } = useQuery({
    queryKey: ["flight deck-landing-sections", missionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("question_records")
        .select(
          "id,mission_id,question_number,section_number,title,status,health,pens_down_date,assigned_writer_id,win_theme_alignment_score,iris_risk_flag,iris_risk_flag_text,sort_order",
        )
        .eq("mission_id", missionId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Section[];
    },
  });

  /* members + profiles for owner display */
  const { data: members = [] } = useQuery({
    queryKey: ["flight deck-landing-members", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_members")
        .select("user_id,role")
        .eq("mission_id", missionId);
      return (data ?? []) as Member[];
    },
  });
  const ownerIds = useMemo(() => {
    const ids = new Set<string>();
    sections.forEach((s) => s.assigned_writer_id && ids.add(s.assigned_writer_id));
    members.forEach((m) => ids.add(m.user_id));
    return Array.from(ids);
  }, [sections, members]);
  const { data: profiles = [] } = useQuery({
    queryKey: ["flight deck-landing-profiles", ownerIds.join(",")],
    enabled: ownerIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id,display_name,email")
        .in("id", ownerIds);
      return (data ?? []) as Profile[];
    },
  });
  const profileById = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);

  /* review gates for the key-dates strip */
  const { data: gates = [] } = useQuery<Gate[]>({
    queryKey: ["flight deck-landing-gates", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_review_gates")
        .select("id,gate_name,target_date")
        .eq("mission_id", missionId)
        .order("target_date", { ascending: true });
      return (data ?? []) as Gate[];
    },
  });

  /* derived: mine + others */
  const mySections = useMemo(
    () => (me ? sections.filter((s) => s.assigned_writer_id === me) : []),
    [sections, me],
  );
  const otherSections = useMemo(
    () => (me ? sections.filter((s) => s.assigned_writer_id !== me) : sections),
    [sections, me],
  );

  /* selected question is the source of truth — no auto-pick. */
  /* keep selection in sync if the selected section disappears from the list  */
  useEffect(() => {
    if (selectedQuestion && !sections.some((s) => s.id === selectedQuestion.id)) {
      setSelectedQuestion(null);
    }
  }, [sections, selectedQuestion, setSelectedQuestion]);
  const targetQ = selectedQuestion;

  /* summary */
  const summary = useMemo(() => {
    const total = sections.length;
    let complete = 0,
      inProgress = 0,
      red = 0,
      yellow = 0;
    for (const s of sections) {
      if (isComplete(s.status)) complete++;
      else if (isInProgress(s.status)) inProgress++;
      if (s.health === "red") red++;
      if (s.health === "yellow") yellow++;
    }
    const pct = total > 0 ? Math.round((complete / total) * 100) : 0;
    const aligns = sections
      .map((s) => s.win_theme_alignment_score)
      .filter((n): n is number => typeof n === "number");
    const avgAlign = aligns.length ? Math.round(aligns.reduce((a, b) => a + b, 0) / aligns.length) : null;
    return { total, complete, inProgress, red, yellow, pct, avgAlign };
  }, [sections]);

  /* IRIS flags */
  const flags = useMemo(
    () =>
      sections
        .filter((s) => s.iris_risk_flag)
        .map((s) => ({ s, text: s.iris_risk_flag_text ?? s.iris_risk_flag! })),
    [sections],
  );

  /* upcoming dates: submission + next 2 gates */
  const keyDates = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const upcoming: Array<{ label: string; date: string | null; primary?: boolean }> = [];
    if (mission?.submission_date) {
      upcoming.push({ label: "Submission", date: mission.submission_date, primary: true });
    }
    const futureGates = gates.filter((g) => g.target_date && g.target_date >= today).slice(0, 2);
    for (const g of futureGates) upcoming.push({ label: g.gate_name, date: g.target_date });
    return upcoming;
  }, [mission, gates]);

  /* render */
  return (
    <div className="min-h-screen" style={{ background: "#060b14" }}>
      <div className="mx-auto max-w-[1500px] px-6 lg:px-10 pt-8 pb-24">
        {/* Header */}
        <header className="mb-6 flex items-end justify-between gap-6 flex-wrap">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-muted-foreground">
              Flight Deck
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <h1 className="text-[26px] font-bold tracking-tight text-white">
                {mission?.name ?? "Mission"}
              </h1>
              <IrisKickoffBadge missionId={missionId} />
            </div>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {isLead
                ? "Every section in this mission — assign, track, intervene."
                : "Your sections first, then the rest of the mission."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <SummaryChip label="Complete" value={`${summary.complete}/${summary.total}`} accent="emerald" />
            <SummaryChip label="In progress" value={summary.inProgress} accent="sky" />
            {summary.red > 0 && (
              <SummaryChip label="Red" value={summary.red} accent="red" />
            )}
            {summary.yellow > 0 && (
              <SummaryChip label="Yellow" value={summary.yellow} accent="amber" />
            )}
          </div>
        </header>

        {/* 70 / 30 split */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">
          {/* ───────── LEFT — THE FLIGHT DECK ───────── */}
          <main className="min-w-0 space-y-5">
            {/* AssistsBar — 6 tools, scoped to active question */}
            <section
              className="rounded-xl border overflow-hidden"
              style={{ background: "#0a1628", borderColor: "rgba(255,255,255,0.08)" }}
            >
              {/* Selected-question header — always visible so the writer knows
                  which question their instruments are operating on. */}
              <div
                className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-6 py-2 text-[11px]"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
                    Assists ·
                  </span>
                  {targetQ ? (
                    <span className="min-w-0 truncate text-foreground/90">
                      <span className="font-mono text-muted-foreground mr-1.5">
                        Q{targetQ.questionNumber}
                      </span>
                      {targetQ.title || "Untitled section"}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">
                      Select a question below to activate your instruments
                    </span>
                  )}
                </div>
                {targetQ && (
                  <button
                    onClick={() => setSelectedQuestion(null)}
                    className="shrink-0 text-[10px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                  >
                    Clear
                  </button>
                )}
              </div>
              <AssistsBar
                disabled={!targetQ}
                onUpdateReality={() => {
                  if (!targetQ) { toast("Select a section first to update reality."); return; }
                  openUpdateReality(targetQ.id);
                }}
                onScoreMe={() => {
                  if (!targetQ) { toast("Select a section first to score it."); return; }
                  setScoreOpen(true);
                }}
                onPhone={() => {
                  if (!targetQ) { toast("Select a section first to phone a friend."); return; }
                  setPhoneOpen(true);
                }}
                onPulse={() => setPulseOpen(true)}
                onThread={() => {
                  if (!targetQ) { toast("Select a section first to start a thread."); return; }
                  setThreadOpen(true);
                }}
                sosSlot={<SOSButton missionId={missionId} questionId={targetQ?.id} />}
              />
            </section>

            {/* Progress strip */}
            <div
              className="rounded-xl border px-5 py-4"
              style={{
                background: "rgba(255,255,255,0.02)",
                borderColor: "rgba(255,255,255,0.08)",
              }}
            >
              <div className="flex items-center justify-between text-[12px] text-muted-foreground mb-2">
                <span className="font-semibold text-foreground">
                  {summary.pct}% complete
                </span>
                <span>
                  {summary.total} sections · {summary.complete} done · {summary.inProgress} in progress
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-white/[0.05] overflow-hidden">
                <div
                  className="h-full bg-emerald-500/70 transition-all"
                  style={{ width: `${summary.pct}%` }}
                />
              </div>
            </div>


            {isLoading ? (
              <div className="rounded-xl border border-border bg-card/30 p-10 text-center text-sm text-muted-foreground">
                Loading sections…
              </div>
            ) : (
              <>
                {/* YOUR SECTIONS — writers only, pinned at top */}
                {!isLead && me && mySections.length > 0 && (
                  <SectionBlock
                    eyebrow={
                      <span className="inline-flex items-center gap-1.5">
                        <Pin size={11} /> Your sections
                      </span>
                    }
                    subtitle={`${mySections.length} assigned to you`}
                    sections={mySections}
                    profileById={profileById}
                    missionId={missionId}
                    highlight
                  />
                )}

                {/* ALL SECTIONS (or "other sections" if writer) */}
                <SectionBlock
                  eyebrow={
                    !isLead && mySections.length > 0 ? "Other sections" : "All sections"
                  }
                  subtitle={
                    !isLead && mySections.length > 0
                      ? `${otherSections.length} across the mission`
                      : `${sections.length} in this mission`
                  }
                  sections={otherSections}
                  profileById={profileById}
                  missionId={missionId}
                />

                {sections.length === 0 && (
                  <div className="rounded-xl border border-dashed border-border bg-card/20 p-12 text-center">
                    <div className="text-sm text-muted-foreground">
                      No sections yet.
                    </div>
                    <Link
                      to="/missions/$missionId/scaffold"
                      params={{ missionId }}
                      className="inline-flex items-center gap-1 mt-3 text-xs text-primary hover:underline"
                    >
                      Build the scaffold <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                )}
              </>
            )}
          </main>

          {/* ───────── RIGHT — CONTEXT PANEL ───────── */}
          <aside className="space-y-4 lg:sticky lg:top-4">
            <ContextHealth
              pct={summary.pct}
              red={summary.red}
              yellow={summary.yellow}
              avgAlign={summary.avgAlign}
            />
            <ContextWinThemes
              themes={mission?.win_themes ?? []}
              sections={sections}
            />
            <ContextKeyDates dates={keyDates} />
            <ContextFlags missionId={missionId} flags={flags} />
          </aside>
        </div>
      </div>

      {/* ───────── Assist overlays ───────── */}
      {sosOpen && <SOSModal missionId={missionId} onClose={() => setSosOpen(false)} />}
      <ScoreMeOverlay
        open={scoreOpen}
        onClose={() => setScoreOpen(false)}
        missionId={missionId}
        lockedQuestionId={targetQ?.id}
      />
      {phoneOpen && targetQ && (
        <PhoneAFriendOverlay
          missionId={missionId}
          questionId={targetQ.id}
          questionNumber={targetQ.questionNumber}
          meId={me ?? null}
          meName=""
          onClose={() => setPhoneOpen(false)}
        />
      )}
      {targetQ && (
        <ThreadPanel
          open={threadOpen}
          onClose={() => setThreadOpen(false)}
          objectType="question_record"
          objectId={targetQ.id}
        />
      )}
      <Sheet open={pulseOpen} onOpenChange={setPulseOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader><SheetTitle>Daily Pulse</SheetTitle></SheetHeader>
          <div className="mt-4"><DailyPulse /></div>
        </SheetContent>
      </Sheet>
    </div>
  );
}


/* ─────────────────────── left: section block ─────────────────────── */

function SectionBlock({
  eyebrow,
  subtitle,
  sections,
  profileById,
  missionId,
  highlight,
}: {
  eyebrow: React.ReactNode;
  subtitle: string;
  sections: Section[];
  profileById: Map<string, Profile>;
  missionId: string;
  highlight?: boolean;
}) {
  if (sections.length === 0) return null;
  return (
    <section
      className="rounded-xl border overflow-hidden"
      style={{
        background: highlight ? "rgba(245,158,11,0.04)" : "rgba(255,255,255,0.02)",
        borderColor: highlight ? "rgba(245,158,11,0.30)" : "rgba(255,255,255,0.08)",
      }}
    >
      <div
        className="flex items-center justify-between px-5 py-3 border-b"
        style={{ borderColor: highlight ? "rgba(245,158,11,0.20)" : "rgba(255,255,255,0.06)" }}
      >
        <div>
          <div
            className="text-[10px] font-bold uppercase tracking-[0.22em]"
            style={{ color: highlight ? "#f59e0b" : "rgba(255,255,255,0.55)" }}
          >
            {eyebrow}
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</div>
        </div>
      </div>
      <ul>
        {sections.map((s) => (
          <SectionRow
            key={s.id}
            s={s}
            profileById={profileById}
            missionId={missionId}
          />
        ))}
      </ul>
    </section>
  );
}

function SectionRow({
  s,
  profileById,
  missionId,
}: {
  s: Section;
  profileById: Map<string, Profile>;
  missionId: string;
}) {
  const { selectedQuestion, setSelectedQuestion } = useQuestion();
  const owner = s.assigned_writer_id ? profileById.get(s.assigned_writer_id) ?? null : null;
  const pd = daysUntil(s.pens_down_date);
  const overdue = pd !== null && pd < 0 && !isComplete(s.status);
  const align = s.win_theme_alignment_score;
  const isSelected = selectedQuestion?.id === s.id;

  return (
    <li
      className="group relative border-b border-white/[0.04] last:border-b-0"
      style={isSelected ? { background: "rgba(59,127,255,0.08)" } : undefined}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => setSelectedQuestion(sectionToSelected(s))}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setSelectedQuestion(sectionToSelected(s));
          }
        }}
        className="grid grid-cols-[14px_56px_1fr_160px_100px_120px_70px_22px] items-center gap-3 px-5 py-3 hover:bg-white/[0.025] transition-colors cursor-pointer"
        aria-pressed={isSelected}
      >
        {/* health dot */}
        <span
          aria-hidden
          className="h-2.5 w-2.5 rounded-full"
          style={{
            background: healthDotColor(s.health),
            boxShadow: s.health ? `0 0 8px ${healthDotColor(s.health)}` : undefined,
          }}
        />
        {/* number */}
        <span className="font-mono text-[11px] text-muted-foreground">
          {s.question_number}
        </span>
        {/* title */}
        <span className="min-w-0 text-[13px] font-medium text-foreground truncate">
          {s.section_number && (
            <span className="text-muted-foreground mr-2">{s.section_number}</span>
          )}
          {s.title || "Untitled section"}
        </span>
        {/* owner */}
        <span className="min-w-0">
          {owner ? (
            <span className="flex items-center gap-2 min-w-0">
              <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[9px] font-medium text-muted-foreground">
                {initialsOf(owner.display_name ?? owner.email)}
              </span>
              <span className="text-[12px] text-foreground truncate">
                {owner.display_name ?? owner.email ?? "—"}
              </span>
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-300">
              Unassigned
            </span>
          )}
        </span>
        {/* due */}
        <span
          className={`flex items-center gap-1 text-[11px] ${
            overdue ? "text-red-400 font-semibold" : "text-muted-foreground"
          }`}
        >
          {s.pens_down_date ? (
            <>
              {overdue ? <AlertTriangle size={11} /> : <Clock size={11} />}
              <span>{fmtDate(s.pens_down_date)}</span>
            </>
          ) : (
            <span>—</span>
          )}
        </span>
        {/* status */}
        <span>
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${statusPillClass(
              s.status,
            )}`}
          >
            {statusUiLabel(s.status)}
          </span>
        </span>
        {/* alignment */}
        <span className="text-right text-[12px] tabular-nums">
          {align === null || align === undefined ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <span
              className={
                align >= 80
                  ? "text-emerald-400 font-semibold"
                  : align >= 50
                    ? "text-amber-300 font-semibold"
                    : "text-red-400 font-semibold"
              }
            >
              {Math.round(align)}%
            </span>
          )}
        </span>
        {/* open workspace */}
        <Link
          to="/missions/$missionId/sections/$questionId"
          params={{ missionId, questionId: s.id }}
          onClick={(e) => {
            e.stopPropagation();
            setSelectedQuestion(sectionToSelected(s));
          }}
          title="Open section workspace"
          className="inline-flex items-center justify-center text-muted-foreground hover:text-foreground"
        >
          <ArrowRight size={14} />
        </Link>
      </div>
    </li>
  );
}

/* ─────────────────────── header chip ─────────────────────── */

function SummaryChip({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent: "emerald" | "sky" | "red" | "amber";
}) {
  const map: Record<string, { bg: string; border: string; color: string }> = {
    emerald: { bg: "rgba(16,185,129,0.10)", border: "rgba(16,185,129,0.30)", color: "#6ee7b7" },
    sky: { bg: "rgba(56,189,248,0.10)", border: "rgba(56,189,248,0.28)", color: "#7dd3fc" },
    red: { bg: "rgba(239,68,68,0.10)", border: "rgba(239,68,68,0.32)", color: "#fca5a5" },
    amber: { bg: "rgba(245,158,11,0.10)", border: "rgba(245,158,11,0.32)", color: "#fcd34d" },
  };
  const t = map[accent];
  return (
    <div
      className="inline-flex items-baseline gap-2 rounded-lg border px-3 py-1.5"
      style={{ background: t.bg, borderColor: t.border }}
    >
      <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
        {label}
      </span>
      <span className="text-[14px] font-bold tabular-nums" style={{ color: t.color }}>
        {value}
      </span>
    </div>
  );
}

/* ─────────────────────── right rail ─────────────────────── */

function ContextHealth({
  pct,
  red,
  yellow,
  avgAlign,
}: {
  pct: number;
  red: number;
  yellow: number;
  avgAlign: number | null;
}) {
  const tone = red > 0 ? "red" : yellow > 0 ? "amber" : "emerald";
  const color = tone === "red" ? "#fca5a5" : tone === "amber" ? "#fcd34d" : "#86efac";
  const label = tone === "red" ? "At risk" : tone === "amber" ? "Caution" : "Healthy";
  return (
    <section
      className="rounded-xl border p-4"
      style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.08)" }}
    >
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
          Mission Health
        </div>
        <span
          className="rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em]"
          style={{
            background: `${color}1a`,
            borderColor: `${color}55`,
            color,
          }}
        >
          {label}
        </span>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-[28px] font-bold leading-none" style={{ color }}>
          {pct}
          <span className="text-[14px] text-muted-foreground font-normal">%</span>
        </span>
        <span className="text-[11px] text-muted-foreground">complete</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Mini label="Red" value={red} color="#fca5a5" />
        <Mini label="Yellow" value={yellow} color="#fcd34d" />
        <Mini label="Align" value={avgAlign === null ? "—" : `${avgAlign}%`} color="#7dd3fc" />
      </div>
    </section>
  );
}

function Mini({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div
      className="rounded-md border py-1.5"
      style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.06)" }}
    >
      <div className="text-[14px] font-bold tabular-nums" style={{ color }}>
        {value}
      </div>
      <div className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground">{label}</div>
    </div>
  );
}

function ContextWinThemes({
  themes,
  sections,
}: {
  themes: string[];
  sections: Section[];
}) {
  // Simple alignment per theme: average win_theme_alignment_score of all sections
  // (real per-theme breakdown lives in deep brief view).
  const aligns = sections
    .map((s) => s.win_theme_alignment_score)
    .filter((n): n is number => typeof n === "number");
  const overall = aligns.length ? Math.round(aligns.reduce((a, b) => a + b, 0) / aligns.length) : null;

  return (
    <section
      className="rounded-xl border p-4"
      style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.08)" }}
    >
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
        <Target size={11} /> Win Themes
      </div>
      {themes.length === 0 ? (
        <div className="mt-2 text-[11px] text-muted-foreground">No themes set.</div>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {themes.slice(0, 4).map((t, i) => (
            <li key={`${t}-${i}`} className="flex items-center gap-2">
              <span className="flex-1 text-[12px] text-foreground/90 truncate">{t}</span>
              <div className="h-1 w-16 rounded-full bg-white/[0.06] overflow-hidden">
                <div
                  className="h-full bg-emerald-500/60"
                  style={{ width: `${overall ?? 0}%` }}
                />
              </div>
            </li>
          ))}
          {themes.length > 4 && (
            <li className="text-[10px] text-muted-foreground">+{themes.length - 4} more</li>
          )}
        </ul>
      )}
    </section>
  );
}

function ContextKeyDates({
  dates,
}: {
  dates: Array<{ label: string; date: string | null; primary?: boolean }>;
}) {
  if (dates.length === 0) return null;
  return (
    <section
      className="rounded-xl border p-4"
      style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.08)" }}
    >
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
        <Calendar size={11} /> Key Dates
      </div>
      <ul className="mt-2 space-y-1.5">
        {dates.map((d, i) => {
          const days = daysUntil(d.date);
          return (
            <li key={`${d.label}-${i}`} className="flex items-baseline justify-between gap-3">
              <span className={`text-[12px] ${d.primary ? "font-semibold text-foreground" : "text-foreground/85"}`}>
                {d.label}
              </span>
              <span className="text-right">
                <div className="text-[11px] text-muted-foreground">{fmtFullDate(d.date)}</div>
                {days !== null && (
                  <div
                    className={`text-[10px] tabular-nums ${
                      days < 0 ? "text-red-400" : days <= 7 ? "text-amber-300" : "text-muted-foreground"
                    }`}
                  >
                    {days < 0 ? `${-days}d overdue` : days === 0 ? "today" : `in ${days}d`}
                  </div>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ContextFlags({
  missionId,
  flags,
}: {
  missionId: string;
  flags: Array<{ s: Section; text: string }>;
}) {
  return (
    <section
      className="rounded-xl border p-4"
      style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.08)" }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
          <Flag size={11} /> IRIS Flags
        </div>
        {flags.length > 3 && (
          <Link
            to="/missions/$missionId/intel"
            params={{ missionId }}
            className="text-[10px] text-primary hover:underline"
          >
            See all ({flags.length})
          </Link>
        )}
      </div>
      {flags.length === 0 ? (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-300/80">
          <CheckCircle2 size={11} /> No active flags
        </div>
      ) : (
        <ul className="mt-2 space-y-2">
          {flags.slice(0, 3).map(({ s, text }) => (
            <li key={s.id}>
              <Link
                to="/missions/$missionId/sections/$questionId"
                params={{ missionId, questionId: s.id }}
                className="block rounded-md border border-amber-500/20 bg-amber-500/[0.04] px-2.5 py-1.5 hover:bg-amber-500/[0.08] transition-colors"
              >
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[10px] text-amber-300/80">
                    {s.question_number}
                  </span>
                  <span className="text-[11px] text-foreground/90 line-clamp-2">{text}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

