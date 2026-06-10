/**
 * Restored Flight Deck layout. Renders above the legacy Today's Focus /
 * Capacity / IRIS Assists / My Questions sections (kept for continuity).
 *
 * Sections (top → bottom):
 *   1. Horizontal Assists Bar (6 labeled actions)
 *   2. Flight Status (left)  +  Mission Radar (right, 3 sub-panels)
 *   3. Question Workspace (4 sub-panels + intelligence chips + external bar)
 *   4. Air Traffic Control (5 sub-panels)
 */
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import {
  AlertTriangle, Bell, PencilLine, Phone, Sparkles, MessagesSquare,
  Clock, ShieldAlert, AtSign, LifeBuoy, ShieldCheck, UserCheck,
  Eye, ExternalLink, Calendar, FileText, Users, Target,
  ChevronRight, MessageCircle, BookOpen, Lightbulb, Trophy, AlertCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useIris } from "@/components/iris/IrisContext";
import { UpdateRealityDialog, SOSDialog } from "@/components/iris/AssistsBar";
import { DailyPulseModal } from "@/components/iris/DailyPulseModal";
import { cn } from "@/lib/utils";

const GOLD = "#C9A55C";

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
  onPrefillIris,
}: Props) {
  return (
    <div className="space-y-6">
      <FlightDeckHeader name={activeMissionName} status={activeMissionStatus} />
      <HorizontalAssistsBar missionId={activeMissionId} onPrefillIris={onPrefillIris} />

      <div className="grid grid-cols-1 lg:grid-cols-[35%_1fr] gap-6">
        <FlightStatusPanel memberId={memberId} />
        <MissionRadarPanel memberId={memberId} missionId={activeMissionId} />
      </div>

      <QuestionWorkspacePanel memberId={memberId} missionId={activeMissionId} />
      <AirTrafficControlPanel missionId={activeMissionId} />
    </div>
  );
}

/* ---------------- Header ---------------- */
function FlightDeckHeader({ name, status }: { name: string; status: string | null }) {
  const tone =
    status === "active" ? "bg-green-500/15 text-green-400 border-green-500/40"
    : status === "pens_down" ? "bg-red-500/15 text-red-400 border-red-500/40"
    : "bg-slate-500/15 text-slate-300 border-slate-500/40";
  return (
    <div className="flex flex-wrap items-center gap-3">
      <h1 className="text-2xl font-bold text-foreground">{name || "Flight Deck"}</h1>
      {status && (
        <span className={cn("rounded-full border px-2.5 py-0.5 text-xs font-medium uppercase tracking-wider", tone)}>
          {status.replace(/_/g, " ")}
        </span>
      )}
    </div>
  );
}

/* ---------------- Horizontal Assists Bar ---------------- */
function HorizontalAssistsBar({
  missionId,
  onPrefillIris,
}: {
  missionId: string | null;
  onPrefillIris?: (text: string) => void;
}) {
  const [updateOpen, setUpdateOpen] = useState(false);
  const [sosOpen, setSosOpen] = useState(false);
  const [pulseOpen, setPulseOpen] = useState(false);

  const items = [
    { Icon: PencilLine, label: "Update Reality", sub: "Post a status update", onClick: () => setUpdateOpen(true) },
    { Icon: Sparkles, label: "Score Me", sub: "AI scorecard", onClick: () => onPrefillIris?.("Score my draft: ") },
    { Icon: Phone, label: "Phone a Friend", sub: "Find an SME", onClick: () => onPrefillIris?.("I need an SME for: ") },
    { Icon: Bell, label: "Daily Pulse", sub: "Quick check-in", onClick: () => setPulseOpen(true) },
    { Icon: MessagesSquare, label: "Thread", sub: "Question thread", onClick: () => onPrefillIris?.("Open a thread on: ") },
    { Icon: AlertTriangle, label: "SOS", sub: "Get help now", onClick: () => setSosOpen(true), danger: true },
  ];

  return (
    <>
      <div className="hidden md:block rounded-xl border border-border bg-surface/30 backdrop-blur">
        <div className="grid grid-cols-6">
          {items.map((it, i) => (
            <button
              key={it.label}
              onClick={it.onClick}
              className={cn(
                "group flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface/60",
                i < items.length - 1 && "border-r border-border",
                it.danger && "hover:bg-red-500/10",
              )}
            >
              <div
                className="shrink-0 h-9 w-9 rounded-lg flex items-center justify-center"
                style={{
                  background: it.danger ? "rgba(220,38,38,0.15)" : "rgba(201,165,92,0.12)",
                  color: it.danger ? "#fca5a5" : GOLD,
                }}
              >
                <it.Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className={cn("text-sm font-semibold truncate", it.danger ? "text-red-300" : "text-foreground")}>
                  {it.label}
                </div>
                <div className="text-[11px] text-muted-foreground truncate">{it.sub}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
      <UpdateRealityDialog open={updateOpen} onOpenChange={setUpdateOpen} missionId={missionId} onSent={() => {}} />
      <SOSDialog open={sosOpen} onOpenChange={setSosOpen} missionId={missionId} />
      <DailyPulseModal open={pulseOpen} onOpenChange={setPulseOpen} missionId={missionId} />
    </>
  );
}

/* ---------------- Flight Status ---------------- */
function FlightStatusPanel({ memberId }: { memberId: string | null }) {
  const { data } = useQuery({
    queryKey: ["flight-status", memberId],
    enabled: !!memberId,
    queryFn: async () => {
      const [asgRes, notifRes] = await Promise.all([
        supabase
          .from("mission_assignments")
          .select("id, question_id, due_date, acceptance_status")
          .eq("assigned_writer_id", memberId!),
        supabase
          .from("atlas_notifications")
          .select("type, is_read")
          .eq("recipient_id", memberId!)
          .eq("is_read", false),
      ]);
      const asgs = asgRes.data ?? [];
      const now = Date.now();
      const due72 = asgs.filter((a: any) => a.due_date && new Date(a.due_date).getTime() - now < 72 * 3600 * 1000 && new Date(a.due_date).getTime() > now).length;
      const atRisk = asgs.filter((a: any) => a.acceptance_status === "need_help" || a.acceptance_status === "capacity_concern").length;
      const notifs = notifRes.data ?? [];
      const irisAlerts = notifs.filter((n: any) => n.type === "iris_alert").length;
      const mentions = notifs.filter((n: any) => n.type === "mention" || n.type === "comment_mention").length;
      const helpReqs = notifs.filter((n: any) => n.type === "sme_needed" || n.type === "help_request").length;
      const compliance = notifs.filter((n: any) => n.type === "compliance_issue").length;
      const reassigned = notifs.filter((n: any) => n.type === "assignment_reassigned").length;
      return { due72, atRisk, irisAlerts, mentions, helpReqs, compliance, reassigned };
    },
  });

  const items = [
    { label: "Due in 72h", Icon: Clock, count: data?.due72 ?? 0, tone: "amber" },
    { label: "At Risk", Icon: ShieldAlert, count: data?.atRisk ?? 0, tone: "red" },
    { label: "IRIS Alerts", Icon: Sparkles, count: data?.irisAlerts ?? 0, tone: "gold" },
    { label: "Mentions", Icon: AtSign, count: data?.mentions ?? 0, tone: "blue" },
    { label: "Help Requests", Icon: LifeBuoy, count: data?.helpReqs ?? 0, tone: "amber" },
    { label: "Compliance Issues", Icon: ShieldCheck, count: data?.compliance ?? 0, tone: "red" },
    { label: "Reassigned to You", Icon: UserCheck, count: data?.reassigned ?? 0, tone: "blue" },
  ];

  return (
    <section className="rounded-xl border border-border bg-surface/30 p-4">
      <PanelHeader title="FLIGHT STATUS" subtitle="What needs my attention?" />
      <ul className="mt-3 space-y-1">
        {items.map((it) => (
          <li key={it.label} className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-surface/60 transition-colors cursor-pointer">
            <it.Icon className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm text-foreground flex-1 truncate">{it.label}</span>
            <CountBadge n={it.count} tone={it.tone as any} />
          </li>
        ))}
      </ul>
      <div className="mt-3 pt-3 border-t border-border">
        <button className="text-xs text-[color:var(--athena-gold)] hover:underline">View all →</button>
      </div>
    </section>
  );
}

function CountBadge({ n, tone }: { n: number; tone: "amber" | "red" | "gold" | "blue" }) {
  const map: Record<string, string> = {
    amber: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    red: "bg-red-500/15 text-red-400 border-red-500/30",
    gold: "bg-[color:var(--athena-gold)]/15 text-[color:var(--athena-gold)] border-[color:var(--athena-gold)]/30",
    blue: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  };
  return (
    <span className={cn("min-w-[1.75rem] text-center rounded-full border px-2 py-0.5 text-xs font-semibold", map[tone])}>
      {n}
    </span>
  );
}

/* ---------------- Mission Radar ---------------- */
function MissionRadarPanel({ memberId, missionId }: { memberId: string | null; missionId: string | null }) {
  const { data: qhealth } = useQuery({
    queryKey: ["radar-my-questions", memberId],
    enabled: !!memberId,
    queryFn: async () => {
      const { data: asgs } = await supabase
        .from("mission_assignments")
        .select("question_id")
        .eq("assigned_writer_id", memberId!);
      const qids = (asgs ?? []).map((a: any) => a.question_id).filter(Boolean);
      if (!qids.length) return { total: 0, onTrack: 0, atRisk: 0, blocked: 0, notStarted: 0 };
      const { data: qs } = await supabase
        .from("mission_questions")
        .select("id, health_status, status")
        .in("id", qids);
      const rows = qs ?? [];
      const onTrack = rows.filter((q: any) => q.health_status === "healthy" || q.health_status === "on_track").length;
      const atRisk = rows.filter((q: any) => q.health_status === "watch" || q.health_status === "at_risk").length;
      const blocked = rows.filter((q: any) => q.health_status === "blocked" || q.health_status === "critical").length;
      const notStarted = rows.filter((q: any) => !q.health_status || q.status === "not_started").length;
      return { total: rows.length, onTrack, atRisk, blocked, notStarted };
    },
  });

  const { data: sections } = useQuery({
    queryKey: ["radar-sections", missionId],
    enabled: !!missionId,
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_sections")
        .select("id, name, completion_percentage, health_status")
        .eq("mission_id", missionId!)
        .order("display_order", { ascending: true });
      return (data ?? []) as any[];
    },
  });

  const { data: mission } = useQuery({
    queryKey: ["radar-mission", missionId],
    enabled: !!missionId,
    queryFn: async () => {
      const { data } = await supabase
        .from("missions")
        .select("submission_deadline, status")
        .eq("id", missionId!)
        .single();
      return data as any;
    },
  });

  const overall = useMemo(() => {
    if (!sections?.length) return 0;
    const sum = sections.reduce((acc: number, s: any) => acc + (s.completion_percentage ?? 0), 0);
    return Math.round(sum / sections.length);
  }, [sections]);

  const daysToDue = mission?.submission_deadline
    ? Math.ceil((new Date(mission.submission_deadline).getTime() - Date.now()) / (24 * 3600 * 1000))
    : null;

  return (
    <section className="rounded-xl border border-border bg-surface/30 p-4">
      <PanelHeader title="MISSION RADAR" subtitle="Where am I relative to the mission?" />
      <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* My Questions */}
        <SubPanel label="MY QUESTIONS">
          <div className="text-2xl font-bold text-foreground">Total {qhealth?.total ?? 0}</div>
          <SegmentedBar
            segments={[
              { v: qhealth?.onTrack ?? 0, c: "bg-green-500" },
              { v: qhealth?.atRisk ?? 0, c: "bg-amber-500" },
              { v: qhealth?.blocked ?? 0, c: "bg-red-500" },
              { v: qhealth?.notStarted ?? 0, c: "bg-slate-500" },
            ]}
          />
          <div className="text-[11px] text-muted-foreground leading-relaxed">
            On Track {qhealth?.onTrack ?? 0} · At Risk {qhealth?.atRisk ?? 0} · Blocked {qhealth?.blocked ?? 0} · Not Started {qhealth?.notStarted ?? 0}
          </div>
        </SubPanel>
        {/* Section Health */}
        <SubPanel label="SECTION HEALTH">
          {(sections ?? []).length === 0 ? (
            <div className="text-xs text-muted-foreground">No sections yet</div>
          ) : (
            <ul className="space-y-2">
              {(sections ?? []).slice(0, 6).map((s: any) => {
                const pct = s.completion_percentage ?? 0;
                const low = pct < 40;
                return (
                  <li key={s.id} className="text-xs">
                    <div className="flex items-center gap-2">
                      {low && <AlertTriangle className="h-3 w-3 text-amber-400 shrink-0" />}
                      <span className="flex-1 truncate text-foreground">{s.name}</span>
                      <span className="text-muted-foreground">{pct}%</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full rounded-full bg-background/60 overflow-hidden">
                      <div className={cn("h-full", low ? "bg-amber-500" : "bg-green-500")} style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </SubPanel>
        {/* Mission Health */}
        <SubPanel label="MISSION HEALTH">
          <div className="text-[11px] text-muted-foreground">Overall Progress</div>
          <Ring pct={overall} />
          <div className="text-xs font-semibold text-foreground">
            {overall >= 75 ? "On Track" : overall >= 40 ? "Watch" : "At Risk"}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Calendar className="h-3 w-3" />
            {daysToDue !== null ? `${daysToDue} days to due date` : "No deadline"}
          </div>
        </SubPanel>
      </div>
    </section>
  );
}

function SegmentedBar({ segments }: { segments: { v: number; c: string }[] }) {
  const total = segments.reduce((a, s) => a + s.v, 0) || 1;
  return (
    <div className="my-2 flex h-2 w-full rounded-full overflow-hidden bg-background/60">
      {segments.map((s, i) => (
        <div key={i} className={s.c} style={{ width: `${(s.v / total) * 100}%` }} />
      ))}
    </div>
  );
}

function Ring({ pct }: { pct: number }) {
  const r = 28;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  return (
    <div className="relative h-20 w-20 my-1">
      <svg viewBox="0 0 72 72" className="h-20 w-20 -rotate-90">
        <circle cx="36" cy="36" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
        <circle cx="36" cy="36" r={r} fill="none" stroke={GOLD} strokeWidth="6" strokeDasharray={`${dash} ${c - dash}`} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-sm font-bold text-foreground">
        {pct}%
      </div>
    </div>
  );
}

/* ---------------- Question Workspace ---------------- */
function QuestionWorkspacePanel({ memberId, missionId }: { memberId: string | null; missionId: string | null }) {
  const { data: questions } = useQuery({
    queryKey: ["workspace-questions", memberId],
    enabled: !!memberId,
    queryFn: async () => {
      const { data: asgs } = await supabase
        .from("mission_assignments")
        .select("id, question_id, mission_id, due_date, writer_confidence, acceptance_status")
        .eq("assigned_writer_id", memberId!)
        .limit(20);
      const qids = (asgs ?? []).map((a: any) => a.question_id).filter(Boolean);
      const { data: qs } = qids.length
        ? await supabase
            .from("mission_questions")
            .select("id, question_number, question_text, section_id, due_date")
            .in("id", qids)
        : { data: [] };
      return { asgs: asgs ?? [], qs: qs ?? [] };
    },
  });

  const active = (questions?.asgs ?? [])[0];
  const activeQ = active ? (questions?.qs ?? []).find((q: any) => q.id === active.question_id) : null;

  return (
    <section className="rounded-xl border border-border bg-surface/30 p-4">
      <div className="flex items-start justify-between mb-3">
        <PanelHeader title="QUESTION WORKSPACE" subtitle="Your mission operations hub. You do the writing in the client environment." />
        {missionId && (
          <Link
            to="/olympus/missions/$missionId"
            params={{ missionId }}
            className="text-xs text-[color:var(--athena-gold)] hover:underline shrink-0"
          >
            View My Questions →
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* 1. My Questions list */}
        <SubPanel label="MY QUESTIONS">
          {(questions?.qs ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">No assignments yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {(questions?.qs ?? []).slice(0, 5).map((q: any) => (
                <li key={q.id} className="flex items-center gap-2 text-xs">
                  <span className="font-mono text-[10px] text-[color:var(--athena-gold)] w-10 shrink-0">{q.question_number}</span>
                  <span className="flex-1 truncate text-foreground">{q.question_text}</span>
                  <PriorityBadge p={q.priority} />
                </li>
              ))}
            </ul>
          )}
          <button className="mt-2 text-[11px] text-[color:var(--athena-gold)] hover:underline">View all questions →</button>
        </SubPanel>

        {/* 2. Assignment Snapshot */}
        <SubPanel label="ASSIGNMENT SNAPSHOT">
          {!activeQ ? (
            <p className="text-xs text-muted-foreground">No active question.</p>
          ) : (
            <div className="space-y-1 text-xs">
              <div className="font-mono text-[color:var(--athena-gold)]">{activeQ.question_number}</div>
              <div className="text-foreground line-clamp-2">{activeQ.question_text}</div>
              {active?.due_date && (
                <div className="text-muted-foreground">Due {format(new Date(active.due_date), "MMM d")}</div>
              )}
              <div className="text-muted-foreground">Owner: You</div>
              <div className="text-muted-foreground">Confidence: {active?.writer_confidence ?? "—"}</div>
            </div>
          )}
        </SubPanel>

        {/* 3. Line of Sight */}
        <SubPanel label="LINE OF SIGHT">
          <ul className="space-y-1.5 text-xs">
            <li className="flex items-center justify-between"><span className="text-muted-foreground">Dependencies</span><span className="text-foreground">0</span></li>
            <li className="flex items-center justify-between"><span className="text-muted-foreground">Related Section</span><span className="text-foreground">—</span></li>
            <li className="flex items-center justify-between"><span className="text-muted-foreground">Neighbors</span><span className="text-foreground">—</span></li>
            <li className="flex items-center justify-between"><span className="text-muted-foreground">Recent Activity</span><span className="text-foreground">0</span></li>
          </ul>
        </SubPanel>

        {/* 4. Collaborate */}
        <SubPanel label="COLLABORATE">
          <div className="grid grid-cols-1 gap-1.5">
            {[
              { label: "Ask a Question", Icon: MessageCircle },
              { label: "Post an Update", Icon: PencilLine },
              { label: "Request Review", Icon: Eye },
              { label: "Open Thread", Icon: MessagesSquare },
            ].map((b) => (
              <button
                key={b.label}
                className="flex items-center gap-2 rounded-md border border-border bg-background/40 px-2 py-1.5 text-xs text-foreground hover:bg-surface transition-colors"
              >
                <b.Icon className="h-3.5 w-3.5 text-[color:var(--athena-gold)]" />
                {b.label}
              </button>
            ))}
          </div>
        </SubPanel>
      </div>

      {/* Mission Intelligence chips */}
      <div className="mt-4">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Mission Intelligence</div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {[
            { label: "Question Brief", sub: "What the question asks", Icon: FileText },
            { label: "Key Requirements", sub: "Must-have answers", Icon: BookOpen },
            { label: "IRIS Insights", sub: "AI-discovered context", Icon: Sparkles },
            { label: "Win Themes", sub: "Why we win", Icon: Trophy },
            { label: "Risks & Considerations", sub: "Watch-outs", Icon: AlertCircle },
          ].map((c) => (
            <button
              key={c.label}
              className="text-left rounded-lg border border-border bg-background/40 px-3 py-2 hover:bg-surface transition-colors"
            >
              <div className="flex items-center gap-1.5">
                <c.Icon className="h-3.5 w-3.5 text-[color:var(--athena-gold)]" />
                <span className="text-xs font-semibold text-foreground">{c.label}</span>
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{c.sub}</div>
            </button>
          ))}
        </div>
      </div>

      {/* External Workspace */}
      <div className="mt-4 rounded-lg border border-[color:var(--athena-gold)]/30 bg-[color:var(--athena-gold)]/5 p-3">
        <div className="flex items-center gap-2 mb-2">
          <ExternalLink className="h-3.5 w-3.5 text-[color:var(--athena-gold)]" />
          <span className="text-[10px] uppercase tracking-wider font-semibold text-[color:var(--athena-gold)]">
            External Workspace (Where writing happens)
          </span>
        </div>
        <p className="text-xs text-muted-foreground mb-2">
          Open your client environment to create or update your response.
        </p>
        <div className="flex flex-wrap gap-2">
          {["SharePoint", "Loopio", "Qvidian", "Word", "Other"].map((w) => (
            <button
              key={w}
              className="rounded-md border border-border bg-background/60 px-3 py-1 text-xs text-foreground hover:bg-surface transition-colors"
            >
              {w}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function PriorityBadge({ p }: { p: string | null }) {
  if (!p) return null;
  const tone = p === "high" ? "bg-red-500/15 text-red-400 border-red-500/30"
    : p === "medium" ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
    : "bg-slate-500/15 text-slate-300 border-slate-500/30";
  return <span className={cn("rounded border px-1.5 py-0.5 text-[9px] uppercase font-semibold", tone)}>{p}</span>;
}

/* ---------------- Air Traffic Control ---------------- */
function AirTrafficControlPanel({ missionId }: { missionId: string | null }) {
  const { data } = useQuery({
    queryKey: ["atc", missionId],
    enabled: !!missionId,
    queryFn: async () => {
      const [sosRes, decRes, updRes, intRes] = await Promise.all([
        supabase.from("atlas_notifications").select("id, created_at, message").eq("type", "sos").order("created_at", { ascending: false }).limit(5),
        supabase.from("mission_decisions").select("id, title, created_at, status").eq("mission_id", missionId!).order("created_at", { ascending: false }).limit(5),
        supabase.from("reality_updates").select("id, details, created_at").eq("mission_id", missionId!).order("created_at", { ascending: false }).limit(5),
        supabase.from("intelligence_feed_items").select("id, headline, created_at").eq("mission_id", missionId!).order("created_at", { ascending: false }).limit(5),
      ]);
      return {
        sos: sosRes.data ?? [],
        decisions: decRes.data ?? [],
        updates: updRes.data ?? [],
        intel: intRes.data ?? [],
      };
    },
  });

  const cards = [
    {
      label: "SOS STATUS",
      count: data?.sos.length ?? 0,
      sub: "Direction Needed",
      detail: data?.sos[0]?.created_at ? `Last ${formatDistanceToNow(new Date(data.sos[0].created_at), { addSuffix: true })}` : "No SOS items",
      tone: "red",
    },
    {
      label: "LEADERSHIP DECISIONS",
      count: data?.decisions.length ?? 0,
      sub: (data?.decisions[0] as any)?.title ?? "No recent decisions",
      detail: (data?.decisions[0] as any)?.status ?? "",
      tone: "green",
    },
    {
      label: "MISSION UPDATES",
      count: data?.updates.length ?? 0,
      sub: (data?.updates[0] as any)?.details?.slice(0, 60) ?? "No updates",
      detail: (data?.updates[0] as any)?.created_at ? formatDistanceToNow(new Date((data!.updates[0] as any).created_at), { addSuffix: true }) : "",
      tone: "blue",
    },
    {
      label: "NEW INTELLIGENCE",
      count: data?.intel.length ?? 0,
      sub: (data?.intel[0] as any)?.headline?.slice(0, 60) ?? "No new intel",
      detail: (data?.intel[0] as any)?.created_at ? formatDistanceToNow(new Date((data!.intel[0] as any).created_at), { addSuffix: true }) : "",
      tone: "gold",
    },
    {
      label: "ESCALATIONS",
      count: 0,
      sub: "No open escalations",
      detail: "",
      tone: "amber",
    },
  ];

  return (
    <section className="rounded-xl border border-border bg-surface/30 p-4">
      <PanelHeader title="AIR TRAFFIC CONTROL" subtitle="Leadership has you on their screen." />
      <div className="mt-3 grid grid-cols-1 md:grid-cols-5 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-lg border border-border bg-background/40 p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{c.label}</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-foreground">{c.count}</span>
              <CountBadge n={c.count} tone={c.tone as any} />
            </div>
            <div className="mt-1 text-xs text-foreground truncate">{c.sub}</div>
            {c.detail && <div className="text-[10px] text-muted-foreground truncate">{c.detail}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------------- Shared ---------------- */
function PanelHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h2 className="text-xs font-bold uppercase tracking-wider text-[color:var(--athena-gold)]">{title}</h2>
      {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
    </div>
  );
}

function SubPanel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-background/40 p-3 space-y-1.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
      {children}
    </div>
  );
}
