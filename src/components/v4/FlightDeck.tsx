import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { daysUntil } from "@/lib/countdowns";
import { openUpdateReality, UpdateRealityMount } from "@/components/v2/UpdateRealityModal";
import { SOSButton } from "@/components/v2/SOSButton";
import { AssistsBar } from "@/components/v4/AssistsBar";
import { IrisDock } from "@/components/v2/IrisDock";
import { ScoreMeOverlay } from "@/components/v2/ScoreMeOverlay";
import { PhoneAFriendOverlay } from "@/components/v2/PhoneAFriendOverlay";
import { DailyPulse } from "@/components/v4/DailyPulse";
import { ThreadPanel } from "@/components/threads/ThreadPanel";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  CircleSlash,
  Clock,
  Eye,
  Layers,
  ListChecks,
  Phone,
  UserX,
} from "lucide-react";
import { listMissionConsults, type ExpertConsultRow } from "@/lib/expert-consult.functions";
import { useServerFn } from "@tanstack/react-start";

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
  blocked: "Blocked",
};

function statusLabel(db: string | null | undefined) {
  return STATUS_LABEL[db ?? "not_started"] ?? "Not started";
}

function statusClass(db: string | null | undefined) {
  const v = db ?? "not_started";
  if (v === "in_progress") return "bg-sky-500/10 text-sky-300 border-sky-500/25";
  if (v === "ready_for_review") return "bg-amber-500/10 text-amber-300 border-amber-500/25";
  if (v === "approved") return "bg-emerald-500/10 text-emerald-300 border-emerald-500/25";
  if (v === "blocked") return "bg-red-500/10 text-red-300 border-red-500/25";
  return "bg-muted/40 text-muted-foreground border-border";
}

function healthDot(h: Q["health"]) {
  if (h === "red") return "bg-red-500";
  if (h === "yellow") return "bg-amber-400";
  return "bg-emerald-500";
}

function ageOf(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return `${Math.max(1, Math.floor(diff / 60_000))}m`;
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function FlightDeck({ missionId, me, myQuestions, allQuestions, updateStatus }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Default selection to first my question, then any question
  useEffect(() => {
    if (selectedId) return;
    const initial = myQuestions[0]?.id ?? allQuestions[0]?.id ?? null;
    if (initial) setSelectedId(initial);
  }, [selectedId, myQuestions, allQuestions]);

  const selected = useMemo(
    () => allQuestions.find((q) => q.id === selectedId) ?? null,
    [allQuestions, selectedId],
  );

  // Overlay state
  const [scoreOpen, setScoreOpen] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [rowPhoneFor, setRowPhoneFor] = useState<Q | null>(null);
  const [pulseOpen, setPulseOpen] = useState(false);
  const [threadOpen, setThreadOpen] = useState(false);

  // Profile for Phone-a-Friend
  const { data: profile } = useQuery({
    queryKey: ["fd-profile", me],
    queryFn: async () => {
      if (!me) return null;
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, full_name, email")
        .eq("id", me)
        .maybeSingle();
      return data;
    },
    enabled: !!me,
  });
  const meName =
    (profile as any)?.display_name ||
    (profile as any)?.full_name ||
    (profile as any)?.email ||
    "You";

  // ATC feed
  const { data: atcRows = [] } = useQuery({
    queryKey: ["fd-atc", missionId],
    queryFn: async () => {
      const [sos, reality, decisions] = await Promise.all([
        supabase
          .from("support_requests")
          .select("id, body, urgency, status, requester_id, created_at")
          .eq("mission_id", missionId)
          .neq("status", "resolved")
          .order("created_at", { ascending: false })
          .limit(15),
        supabase
          .from("reality_updates")
          .select("id, details, signal_type, need_type, user_name, question_id, created_at, resolved")
          .eq("mission_id", missionId)
          .eq("resolved", false)
          .order("created_at", { ascending: false })
          .limit(15),
        supabase
          .from("executive_decisions")
          .select("id, description, urgency, status, submitted_by, created_at")
          .eq("mission_id", missionId)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(15),
      ]);

      const qMap = new Map(allQuestions.map((q) => [q.id, q]));
      type Row = {
        id: string;
        type: string;
        typeTone: string;
        question: string;
        from: string;
        priority: string;
        priorityTone: string;
        created_at: string;
      };
      const rows: Row[] = [];

      for (const r of sos.data ?? []) {
        rows.push({
          id: `sos:${r.id}`,
          type: "SOS",
          typeTone: "bg-red-500/15 text-red-300 border-red-500/30",
          question: r.body ?? "Support request",
          from: "Team member",
          priority:
            r.urgency === "right_now" ? "Critical" : r.urgency === "today" ? "High" : "Normal",
          priorityTone:
            r.urgency === "right_now"
              ? "text-red-300"
              : r.urgency === "today"
                ? "text-amber-300"
                : "text-muted-foreground",
          created_at: r.created_at,
        });
      }
      for (const r of reality.data ?? []) {
        const q = r.question_id ? qMap.get(r.question_id) : null;
        rows.push({
          id: `ru:${r.id}`,
          type: r.signal_type === "need" ? "Need" : "Update",
          typeTone:
            r.signal_type === "need"
              ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
              : "bg-sky-500/15 text-sky-300 border-sky-500/30",
          question: q ? `Q${q.question_number} · ${r.details ?? r.need_type ?? ""}` : (r.details ?? "Reality update"),
          from: r.user_name ?? "Unknown",
          priority: r.signal_type === "need" ? "High" : "Normal",
          priorityTone: r.signal_type === "need" ? "text-amber-300" : "text-muted-foreground",
          created_at: r.created_at,
        });
      }
      for (const r of decisions.data ?? []) {
        rows.push({
          id: `ed:${r.id}`,
          type: "Decision",
          typeTone: "bg-violet-500/15 text-violet-300 border-violet-500/30",
          question: r.description ?? "Decision needed",
          from: "Leadership",
          priority: r.urgency === "urgent" ? "High" : "Normal",
          priorityTone: r.urgency === "urgent" ? "text-amber-300" : "text-muted-foreground",
          created_at: r.created_at,
        });
      }

      rows.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
      return rows;
    },
  });

  // Open Phone-a-Friend consults (live)
  const listConsultsFn = useServerFn(listMissionConsults);
  const { data: openConsults = [], refetch: refetchConsults } = useQuery<ExpertConsultRow[]>({
    queryKey: ["mission-consults", missionId],
    queryFn: () => listConsultsFn({ data: { missionId } }),
  });
  useEffect(() => {
    const ch = supabase
      .channel(`expert_consults:${missionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "expert_consults", filter: `mission_id=eq.${missionId}` },
        () => refetchConsults(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [missionId, refetchConsults]);

  // Flight Status counts
  const flightStatus = useMemo(() => {
    const now = Date.now();
    const in72h = (d: string | null) => {
      if (!d) return false;
      const t = new Date(d).getTime();
      return t - now > 0 && t - now <= 72 * 3_600_000;
    };
    return {
      total: allQuestions.length,
      due72: allQuestions.filter((q) => in72h(q.pens_down_date) && q.status !== "approved").length,
      atRisk: allQuestions.filter((q) => q.health === "red").length,
      review: allQuestions.filter((q) => q.status === "ready_for_review").length,
      approved: allQuestions.filter((q) => q.status === "approved").length,
      blocked: allQuestions.filter((q) => q.status === "blocked").length,
      noOwner: allQuestions.filter((q) => !q.assigned_writer_id).length,
    };
  }, [allQuestions]);

  // Mission Radar segments
  const radar = useMemo(() => {
    const total = Math.max(1, allQuestions.length);
    const counts = {
      approved: allQuestions.filter((q) => q.status === "approved").length,
      review: allQuestions.filter((q) => q.status === "ready_for_review").length,
      progress: allQuestions.filter((q) => q.status === "in_progress").length,
      notStarted: allQuestions.filter((q) => !q.status || q.status === "not_started").length,
      blocked: allQuestions.filter((q) => q.status === "blocked").length,
    };
    return {
      counts,
      pct: {
        approved: (counts.approved / total) * 100,
        review: (counts.review / total) * 100,
        progress: (counts.progress / total) * 100,
        notStarted: (counts.notStarted / total) * 100,
        blocked: (counts.blocked / total) * 100,
      },
    };
  }, [allQuestions]);

  // Section health rollup
  const sectionHealth = useMemo(() => {
    const map = new Map<string, { total: number; red: number; yellow: number; green: number }>();
    for (const q of allQuestions) {
      const key = q.section_number ?? "—";
      const row = map.get(key) ?? { total: 0, red: 0, yellow: 0, green: 0 };
      row.total++;
      if (q.health === "red") row.red++;
      else if (q.health === "yellow") row.yellow++;
      else row.green++;
      map.set(key, row);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(0, 8);
  }, [allQuestions]);

  function requireSelected(action: string): boolean {
    if (!selected) {
      toast(`Select a question first to use ${action}.`);
      return false;
    }
    return true;
  }

  return (
    <div className="mx-auto max-w-[1400px] px-6 pb-24 pt-4" data-testid="flight-deck">
      <UpdateRealityMount missionId={missionId} />

      {/* AssistsBar — top */}
      <section className="rounded-[12px] border border-border bg-surface overflow-hidden">
        <AssistsBar
          onUpdateReality={() => openUpdateReality(selected?.id ?? null)}
          onScoreMe={() => requireSelected("Score Me") && setScoreOpen(true)}
          onPhone={() => requireSelected("Phone a Friend") && setPhoneOpen(true)}
          onPulse={() => setPulseOpen(true)}
          onThread={() => requireSelected("Thread") && setThreadOpen(true)}
          sosSlot={<SOSButton missionId={missionId} questionId={selected?.id} />}
        />
      </section>

      {/* Selected question banner */}
      {selected && (
        <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="uppercase tracking-[0.18em]">Assists scoped to</span>
          <span className="font-mono text-foreground">Q{selected.question_number}</span>
          <span className="truncate text-foreground/80">{selected.title}</span>
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-12">
        {/* LEFT: Flight Status + Mission Radar */}
        <div className="space-y-4 lg:col-span-3">
          <FlightStatusPanel s={flightStatus} />
          <MissionRadarPanel radar={radar} sections={sectionHealth} />
        </div>

        {/* CENTER: Question Workspace */}
        <div className="lg:col-span-6">
          <QuestionWorkspace
            missionId={missionId}
            myQuestions={myQuestions}
            selectedId={selectedId}
            onSelect={setSelectedId}
            updateStatus={updateStatus}
            onPhoneRow={(q) => setRowPhoneFor(q)}
          />
        </div>

        {/* RIGHT: Air Traffic Control + Open Consults */}
        <div className="lg:col-span-3 space-y-4">
          <AirTrafficControl rows={atcRows as any[]} />
          <OpenConsultsPanel rows={openConsults} questions={allQuestions} />
        </div>
      </div>

      {/* Overlays */}
      {selected && (
        <ScoreMeOverlay
          open={scoreOpen}
          onClose={() => setScoreOpen(false)}
          missionId={missionId}
          lockedQuestionId={selected.id}
        />
      )}
      {selected && phoneOpen && (
        <PhoneAFriendOverlay
          missionId={missionId}
          questionId={selected.id}
          questionNumber={selected.question_number}
          meId={me || null}
          meName={meName}
          onClose={() => setPhoneOpen(false)}
        />
      )}
      <Sheet open={pulseOpen} onOpenChange={setPulseOpen}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Daily Pulse</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <DailyPulse />
          </div>
        </SheetContent>
      </Sheet>
      {selected && (
        <ThreadPanel
          open={threadOpen}
          onClose={() => setThreadOpen(false)}
          objectType="question_record"
          objectId={selected.id}
        />
      )}

      {/* IRIS Dock — fixed bottom-right with ⌘J */}
      <IrisDock />
    </div>
  );
}

// ---------- Flight Status ----------

function FlightStatusPanel({
  s,
}: {
  s: {
    total: number;
    due72: number;
    atRisk: number;
    review: number;
    approved: number;
    blocked: number;
    noOwner: number;
  };
}) {
  const rows: Array<{
    label: string;
    value: number;
    icon: React.ReactNode;
    tone?: string;
  }> = [
    { label: "Total", value: s.total, icon: <ListChecks className="h-3.5 w-3.5" /> },
    {
      label: "Due in 72h",
      value: s.due72,
      icon: <Clock className="h-3.5 w-3.5" />,
      tone: s.due72 > 0 ? "text-amber-300" : "",
    },
    {
      label: "At Risk",
      value: s.atRisk,
      icon: <AlertTriangle className="h-3.5 w-3.5" />,
      tone: s.atRisk > 0 ? "text-red-300" : "",
    },
    {
      label: "Awaiting Review",
      value: s.review,
      icon: <Eye className="h-3.5 w-3.5" />,
      tone: s.review > 0 ? "text-amber-300" : "",
    },
    {
      label: "Approved",
      value: s.approved,
      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
      tone: "text-emerald-400",
    },
    {
      label: "Blocked",
      value: s.blocked,
      icon: <CircleSlash className="h-3.5 w-3.5" />,
      tone: s.blocked > 0 ? "text-red-300" : "",
    },
    {
      label: "No Owner",
      value: s.noOwner,
      icon: <UserX className="h-3.5 w-3.5" />,
      tone: s.noOwner > 0 ? "text-amber-300" : "",
    },
  ];

  return (
    <section className="rounded-[12px] border border-border bg-surface px-4 py-4">
      <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        Flight Status
      </div>
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li
            key={r.label}
            className="flex items-center justify-between rounded-md border border-border/40 bg-background/30 px-3 py-2"
          >
            <div className="flex items-center gap-2 text-[12px] text-foreground/80">
              <span className="text-muted-foreground">{r.icon}</span>
              {r.label}
            </div>
            <span className={`text-sm font-semibold tabular-nums ${r.tone ?? "text-foreground"}`}>
              {r.value}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------- Mission Radar ----------

function MissionRadarPanel({
  radar,
  sections,
}: {
  radar: {
    counts: { approved: number; review: number; progress: number; notStarted: number; blocked: number };
    pct: { approved: number; review: number; progress: number; notStarted: number; blocked: number };
  };
  sections: Array<[string, { total: number; red: number; yellow: number; green: number }]>;
}) {
  return (
    <section className="rounded-[12px] border border-border bg-surface px-4 py-4">
      <div className="mb-3 flex items-center gap-2">
        <Layers className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Mission Radar
        </span>
      </div>

      <div className="mb-2 flex h-3 overflow-hidden rounded-full border border-border/60 bg-background/40">
        <span style={{ width: `${radar.pct.approved}%` }} className="bg-emerald-500" title={`Approved: ${radar.counts.approved}`} />
        <span style={{ width: `${radar.pct.review}%` }} className="bg-amber-400" title={`In review: ${radar.counts.review}`} />
        <span style={{ width: `${radar.pct.progress}%` }} className="bg-sky-500" title={`In progress: ${radar.counts.progress}`} />
        <span style={{ width: `${radar.pct.notStarted}%` }} className="bg-muted" title={`Not started: ${radar.counts.notStarted}`} />
        <span style={{ width: `${radar.pct.blocked}%` }} className="bg-red-500" title={`Blocked: ${radar.counts.blocked}`} />
      </div>
      <div className="mb-4 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
        <Legend dot="bg-emerald-500" label="Approved" n={radar.counts.approved} />
        <Legend dot="bg-amber-400" label="Review" n={radar.counts.review} />
        <Legend dot="bg-sky-500" label="In progress" n={radar.counts.progress} />
        <Legend dot="bg-muted" label="Not started" n={radar.counts.notStarted} />
        <Legend dot="bg-red-500" label="Blocked" n={radar.counts.blocked} />
      </div>

      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        Section health
      </div>
      <ul className="mt-2 space-y-1">
        {sections.length === 0 ? (
          <li className="text-[11px] text-muted-foreground">No sections yet.</li>
        ) : (
          sections.map(([name, r]) => (
            <li key={name} className="flex items-center justify-between text-[11px]">
              <span className="font-mono text-muted-foreground">§ {name}</span>
              <span className="flex items-center gap-1.5">
                <span className="inline-flex items-center gap-0.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  <span className="tabular-nums text-foreground/80">{r.green}</span>
                </span>
                <span className="inline-flex items-center gap-0.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                  <span className="tabular-nums text-foreground/80">{r.yellow}</span>
                </span>
                <span className="inline-flex items-center gap-0.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                  <span className="tabular-nums text-foreground/80">{r.red}</span>
                </span>
              </span>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}

function Legend({ dot, label, n }: { dot: string; label: string; n: number }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      <span>{label}</span>
      <span className="tabular-nums text-foreground/70">{n}</span>
    </span>
  );
}

// ---------- Question Workspace ----------

function QuestionWorkspace({
  missionId,
  myQuestions,
  selectedId,
  onSelect,
  updateStatus,
  onPhoneRow,
}: {
  missionId: string;
  myQuestions: Q[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  updateStatus: (q: Q, db: string) => Promise<void>;
  onPhoneRow: (q: Q) => void;
}) {
  return (
    <section className="rounded-[12px] border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Question Workspace
          </div>
          <div className="mt-0.5 text-sm text-foreground/80">
            {myQuestions.length === 0
              ? "No questions assigned to you."
              : `${myQuestions.length} assigned to you · click to select`}
          </div>
        </div>
      </div>

      {myQuestions.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-muted-foreground">
          When a mission lead assigns you a question, it will appear here.
        </div>
      ) : (
        <ul className="divide-y divide-border/60">
          {myQuestions.map((q) => (
            <QuestionRow
              key={q.id}
              q={q}
              missionId={missionId}
              selected={q.id === selectedId}
              onSelect={() => onSelect(q.id)}
              updateStatus={updateStatus}
              onPhoneRow={() => onPhoneRow(q)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function QuestionRow({
  q,
  missionId,
  selected,
  onSelect,
  updateStatus,
}: {
  q: Q;
  missionId: string;
  selected: boolean;
  onSelect: () => void;
  updateStatus: (q: Q, db: string) => Promise<void>;
}) {
  const days = daysUntil(q.pens_down_date);
  const [pending, setPending] = useState(false);

  async function advance(e: React.MouseEvent) {
    e.stopPropagation();
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
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={`flex w-full items-start gap-3 px-5 py-3 text-left transition ${
          selected ? "bg-sky-500/[0.06] ring-1 ring-inset ring-sky-500/30" : "hover:bg-surface-hover"
        }`}
      >
        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${healthDot(q.health)}`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] text-muted-foreground">Q{q.question_number}</span>
            <span
              className={`rounded-full border px-2 py-px text-[10px] font-medium ${statusClass(q.status)}`}
            >
              {statusLabel(q.status)}
            </span>
            {days !== null && (
              <span
                className={`text-[11px] ${
                  days < 3 ? "text-red-400" : days < 7 ? "text-amber-300" : "text-muted-foreground"
                }`}
              >
                <Calendar className="mr-1 inline h-3 w-3" />
                {days}d
              </span>
            )}
            {selected && (
              <span className="rounded bg-sky-500/15 px-1.5 py-px text-[9px] font-bold tracking-[0.1em] text-sky-300">
                SELECTED
              </span>
            )}
          </div>
          <div className="mt-1 truncate text-[14px] font-medium text-foreground">{q.title}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {q.status !== "approved" && (
            <span
              role="button"
              onClick={advance}
              className="rounded-md border border-border bg-background/40 px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              {pending ? "…" : "Advance"}
            </span>
          )}
          <Link
            to="/missions/$missionId/sections/$questionId"
            params={{ missionId, questionId: q.id }}
            onClick={(e) => e.stopPropagation()}
            className="rounded-md border border-border px-2.5 py-1 text-[11px] text-foreground/80 hover:bg-surface-hover"
          >
            Open
          </Link>
        </div>
      </button>
    </li>
  );
}

// ---------- Air Traffic Control ----------

function AirTrafficControl({
  rows,
}: {
  rows: Array<{
    id: string;
    type: string;
    typeTone: string;
    question: string;
    from: string;
    priority: string;
    priorityTone: string;
    created_at: string;
  }>;
}) {
  return (
    <section className="rounded-[12px] border border-border bg-surface">
      <div className="border-b border-border/60 px-4 py-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Air Traffic Control
        </div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">
          {rows.length} open signals
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="px-4 py-8 text-center text-[12px] text-muted-foreground">
          All clear — no open signals.
        </div>
      ) : (
        <div className="max-h-[640px] overflow-y-auto">
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 bg-surface text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Type</th>
                <th className="px-3 py-2 text-left font-semibold">Question</th>
                <th className="px-3 py-2 text-left font-semibold">From</th>
                <th className="px-3 py-2 text-left font-semibold">Priority</th>
                <th className="px-3 py-2 text-left font-semibold">Age</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {rows.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="px-3 py-2">
                    <span className={`rounded-full border px-1.5 py-px text-[9px] font-semibold ${r.typeTone}`}>
                      {r.type}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-foreground/85">
                    <div className="line-clamp-2">{r.question}</div>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{r.from}</td>
                  <td className={`px-3 py-2 font-medium ${r.priorityTone}`}>{r.priority}</td>
                  <td className="px-3 py-2 text-muted-foreground tabular-nums">{ageOf(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
