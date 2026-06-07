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
import { MissionPulse } from "@/components/v4/MissionPulse";
import { MissionThreadsPanel } from "@/components/threads/MissionThreadsPanel";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  CircleSlash,
  Clock,
  Eye,
  Headphones,
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
  iris_risk_flag: string | null;
  iris_risk_flag_text: string | null;
  point_value: number | null;
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

  // ATC feed — existing reality/SOS/decision streams
  const { data: atcRows = [], refetch: refetchAtc } = useQuery({
    queryKey: ["fd-atc", missionId],
    queryFn: async () => {
      const [sos, reality, decisions, pulses] = await Promise.all([
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
        supabase
          .from("signals")
          .select("id, signal_title, signal_summary, severity, status, related_question_id, source_module, created_at")
          .eq("mission_id", missionId)
          .eq("source_module", "daily_pulse")
          .eq("status", "open")
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
        priorityLevel: "red" | "yellow" | "green";
        priorityTone: string;
        created_at: string;
        link: string | null;
      };
      const rows: Row[] = [];

      for (const r of sos.data ?? []) {
        const level: Row["priorityLevel"] = r.urgency === "right_now" ? "red" : r.urgency === "today" ? "yellow" : "green";
        rows.push({
          id: `sos:${r.id}`,
          type: "SOS",
          typeTone: "bg-red-500/15 text-red-300 border-red-500/30",
          question: r.body ?? "Support request",
          from: "Team member",
          priority: r.urgency === "right_now" ? "Critical" : r.urgency === "today" ? "High" : "Normal",
          priorityLevel: level,
          priorityTone: level === "red" ? "text-red-300" : level === "yellow" ? "text-amber-300" : "text-muted-foreground",
          created_at: r.created_at,
          link: null,
        });
      }
      for (const r of reality.data ?? []) {
        const q = r.question_id ? qMap.get(r.question_id) : null;
        const level: Row["priorityLevel"] = r.signal_type === "need" ? "yellow" : "green";
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
          priorityLevel: level,
          priorityTone: level === "yellow" ? "text-amber-300" : "text-muted-foreground",
          created_at: r.created_at,
          link: q ? `/missions/${missionId}/sections/${q.id}` : null,
        });
      }
      for (const r of decisions.data ?? []) {
        const level: Row["priorityLevel"] = r.urgency === "urgent" ? "yellow" : "green";
        rows.push({
          id: `ed:${r.id}`,
          type: "Decision",
          typeTone: "bg-violet-500/15 text-violet-300 border-violet-500/30",
          question: r.description ?? "Decision needed",
          from: "Leadership",
          priority: r.urgency === "urgent" ? "High" : "Normal",
          priorityLevel: level,
          priorityTone: level === "yellow" ? "text-amber-300" : "text-muted-foreground",
          created_at: r.created_at,
          link: null,
        });
      }
      // Daily Pulse user signals
      for (const r of pulses.data ?? []) {
        const level: Row["priorityLevel"] =
          r.severity === "critical" ? "red" : r.severity === "warning" ? "yellow" : "green";
        const q = r.related_question_id ? qMap.get(r.related_question_id) : null;
        rows.push({
          id: `sig:${r.id}`,
          type: "Pulse",
          typeTone: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30",
          question:
            (q ? `Q${q.question_number} · ` : "") +
            (r.signal_title ?? "Daily Pulse signal") +
            (r.signal_summary ? ` — ${r.signal_summary}` : ""),
          from: "Daily Pulse",
          priority: level === "red" ? "Critical" : level === "yellow" ? "High" : "Normal",
          priorityLevel: level,
          priorityTone: level === "red" ? "text-red-300" : level === "yellow" ? "text-amber-300" : "text-muted-foreground",
          created_at: r.created_at,
          link: q ? `/missions/${missionId}/sections/${q.id}` : null,
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

  // Realtime: refresh ATC when signals or question_records change for this mission
  useEffect(() => {
    const ch = supabase
      .channel(`atc-feed:${missionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "signals", filter: `mission_id=eq.${missionId}` },
        () => refetchAtc(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "question_records", filter: `mission_id=eq.${missionId}` },
        () => refetchAtc(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [missionId, refetchAtc]);

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
      awaitingExpert: openConsults.filter((c) =>
        c.status === "sent" || c.status === "acknowledged" || c.status === "needs_info",
      ).length,
    };
  }, [allQuestions, openConsults]);

  // Compute derived signals: PRISIM flags, Due alerts, Expert overdue, Coverage gaps, Expert responded
  const derivedAtcRows = useMemo(() => {
    const now = Date.now();
    type Row = {
      id: string;
      type: string;
      typeTone: string;
      question: string;
      from: string;
      priority: string;
      priorityLevel: "red" | "yellow" | "green";
      priorityTone: string;
      created_at: string;
      link: string | null;
    };
    const rows: Row[] = [];
    const qMap = new Map(allQuestions.map((q) => [q.id, q]));

    // 1) PRISIM flags — yellow
    for (const q of allQuestions) {
      if (!q.iris_risk_flag) continue;
      rows.push({
        id: `prisim:${q.id}`,
        type: "PRISIM",
        typeTone: "bg-amber-500/15 text-amber-300 border-amber-500/30",
        question: `Q${q.question_number} — ${q.iris_risk_flag_text ?? q.iris_risk_flag}`,
        from: "IRIS",
        priority: "High",
        priorityLevel: "yellow",
        priorityTone: "text-amber-300",
        created_at: new Date(now - 60_000).toISOString(),
        link: `/missions/${missionId}/sections/${q.id}`,
      });
    }

    // 2) Due date alerts — red if ≤72h and no approved draft
    for (const q of allQuestions) {
      if (!q.pens_down_date) continue;
      const t = new Date(q.pens_down_date).getTime();
      const hoursOut = (t - now) / 3_600_000;
      if (hoursOut <= 0 || hoursOut > 72) continue;
      if (q.status === "approved") continue;
      const label = hoursOut < 1 ? "<1h" : `${Math.round(hoursOut)}h`;
      rows.push({
        id: `due:${q.id}`,
        type: "Due",
        typeTone: "bg-red-500/15 text-red-300 border-red-500/30",
        question: `Q${q.question_number} — Due in ${label}. ${q.status === "ready_for_review" ? "Awaiting review." : "No approved draft."}`,
        from: "Schedule",
        priority: "Critical",
        priorityLevel: "red",
        priorityTone: "text-red-300",
        created_at: new Date(now - 30_000).toISOString(),
        link: `/missions/${missionId}/sections/${q.id}`,
      });
    }

    // 3) Expert overdue — yellow (urgent >4h, standard >24h, fyi >72h)
    const windowFor = (u: ExpertConsultRow["urgency"]) =>
      u === "urgent" ? 4 : u === "standard" ? 24 : 72;
    for (const c of openConsults) {
      if (c.status !== "sent" && c.status !== "acknowledged") continue;
      const ageHours = (now - new Date(c.created_at).getTime()) / 3_600_000;
      if (ageHours < windowFor(c.urgency)) continue;
      const q = c.question_id ? qMap.get(c.question_id) : null;
      rows.push({
        id: `expover:${c.id}`,
        type: "Expert",
        typeTone: "bg-amber-500/15 text-amber-300 border-amber-500/30",
        question: `${q ? `Q${q.question_number} · ` : ""}Expert request — ${Math.round(ageHours)}h no response (${c.urgency}).`,
        from: "Phone-a-Friend",
        priority: "High",
        priorityLevel: "yellow",
        priorityTone: "text-amber-300",
        created_at: c.created_at,
        link: q ? `/missions/${missionId}/sections/${q.id}` : null,
      });
    }

    // 4) Expert responded — green (recent, last 48h)
    for (const c of openConsults) {
      if (c.status !== "responded") continue;
      const responded = c.response_at ?? c.created_at;
      if ((now - new Date(responded).getTime()) / 3_600_000 > 48) continue;
      const q = c.question_id ? qMap.get(c.question_id) : null;
      rows.push({
        id: `ec:${c.id}`,
        type: "Expert",
        typeTone: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
        question: `${q ? `Q${q.question_number} · ` : ""}Response received — ${c.ask_subject}`,
        from: "Phone-a-Friend",
        priority: "Resolved",
        priorityLevel: "green",
        priorityTone: "text-emerald-300",
        created_at: responded,
        link: q ? `/missions/${missionId}/sections/${q.id}` : null,
      });
    }

    // 5) Coverage gaps — yellow when >50% of a section has No Owner
    const bySection = new Map<string, Q[]>();
    for (const q of allQuestions) {
      const key = (q.section_number ?? "").split(".")[0] || "—";
      const arr = bySection.get(key) ?? [];
      arr.push(q);
      bySection.set(key, arr);
    }
    for (const [section, qs] of bySection) {
      if (qs.length < 2) continue;
      const unassigned = qs.filter((q) => !q.assigned_writer_id).length;
      if (unassigned / qs.length <= 0.5) continue;
      const firstQ = qs[0];
      rows.push({
        id: `cov:${section}`,
        type: "Coverage",
        typeTone: "bg-amber-500/15 text-amber-300 border-amber-500/30",
        question: `Section ${section} — ${unassigned} of ${qs.length} questions unassigned.`,
        from: "Coverage",
        priority: "High",
        priorityLevel: "yellow",
        priorityTone: "text-amber-300",
        created_at: new Date(now - 90_000).toISOString(),
        link: `/missions/${missionId}/sections/${firstQ.id}`,
      });
    }

    return rows;
  }, [allQuestions, openConsults, missionId]);

  // Merge: derived signals first (most actionable), then the live feed
  const priorityRank = { red: 0, yellow: 1, green: 2 } as const;
  const combinedAtcRows = useMemo(() => {
    return [...derivedAtcRows, ...atcRows].sort((a, b) => {
      const pa = priorityRank[a.priorityLevel] ?? 3;
      const pb = priorityRank[b.priorityLevel] ?? 3;
      if (pa !== pb) return pa - pb;
      return +new Date(b.created_at) - +new Date(a.created_at);
    });
  }, [derivedAtcRows, atcRows]);

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
          onThread={() => setThreadOpen(true)}
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
          <AirTrafficControl rows={combinedAtcRows as any[]} />
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
      {rowPhoneFor && (
        <PhoneAFriendOverlay
          missionId={missionId}
          questionId={rowPhoneFor.id}
          questionNumber={rowPhoneFor.question_number}
          meId={me || null}
          meName={meName}
          onClose={() => setRowPhoneFor(null)}
        />
      )}
      <Sheet open={pulseOpen} onOpenChange={setPulseOpen}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Daily Pulse</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <MissionPulse missionId={missionId} />
          </div>
        </SheetContent>
      </Sheet>
      <MissionThreadsPanel
        open={threadOpen}
        onClose={() => setThreadOpen(false)}
        missionId={missionId}
        initialQuestionId={selected?.id ?? null}
      />

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
    awaitingExpert: number;
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
      label: "Awaiting Expert Response",
      value: s.awaitingExpert,
      icon: <Headphones className="h-3.5 w-3.5" />,
      tone: s.awaitingExpert > 0 ? "text-sky-300" : "",
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
        <RequestAssignmentEmptyState missionId={missionId} />
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

// R-2: Empty workspace gets a human bridge — request assignment from the
// engagement lead instead of just telling the user to wait.
function RequestAssignmentEmptyState({ missionId }: { missionId: string }) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const { data: lead } = useQuery({
    queryKey: ["request-assign-lead", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_members")
        .select("user_id,role,display_name")
        .eq("mission_id", missionId)
        .in("role", ["engagement_lead", "lead", "admin"])
        .order("role", { ascending: true })
        .limit(1);
      return data?.[0] ?? null;
    },
  });

  async function onRequest() {
    setSending(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const me = auth.user;
      const meName =
        (me?.user_metadata as any)?.display_name ??
        me?.email?.split("@")[0] ??
        "A team member";
      const { createSignal } = await import("@/lib/signals");
      await createSignal({
        mission_id: missionId,
        source_module: "flight-deck",
        signal_type: "assignment_requested",
        signal_title: `${meName} is requesting a question assignment`,
        signal_summary:
          "Team member has no questions assigned and is ready for work.",
        severity: "warning",
        owner_id: lead?.user_id ?? null,
        recommended_action: "Open the Question Workspace and assign a question to this team member.",
      });
      setSent(true);
      toast.success(
        lead?.display_name
          ? `Request sent to ${lead.display_name}.`
          : "Request sent to mission leadership.",
      );
    } catch (err: any) {
      toast.error(err?.message ?? "Couldn't send request");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="px-5 py-10 text-center">
      <div className="text-sm text-muted-foreground">
        No questions assigned to you yet.
      </div>
      <div className="mt-1 text-[12px] text-muted-foreground/80">
        When a mission lead assigns you a question, it will appear here.
      </div>
      {sent ? (
        <div className="mt-5 inline-flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/[0.08] px-3 py-2 text-[12px] text-emerald-200">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Request sent. {lead?.display_name ? `${lead.display_name} has been notified.` : "Mission leadership has been notified."}
        </div>
      ) : (
        <button
          type="button"
          onClick={onRequest}
          disabled={sending}
          className="mt-5 inline-flex items-center gap-2 rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100 hover:bg-amber-400/15 disabled:opacity-60"
        >
          {sending
            ? "Sending…"
            : lead?.display_name
              ? `Request assignment from ${lead.display_name}`
              : "Request question assignment"}
        </button>
      )}
    </div>
  );
}


function QuestionRow({
  q,
  missionId,
  selected,
  onSelect,
  updateStatus,
  onPhoneRow,
}: {
  q: Q;
  missionId: string;
  selected: boolean;
  onSelect: () => void;
  updateStatus: (q: Q, db: string) => Promise<void>;
  onPhoneRow: () => void;
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
          <span
            role="button"
            onClick={(e) => {
              e.stopPropagation();
              onPhoneRow();
            }}
            title="Phone a Friend about this question"
            className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2 py-1 text-[11px] text-primary hover:bg-primary/15"
          >
            <Phone className="h-3 w-3" />
          </span>
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
    priorityLevel: "red" | "yellow" | "green";
    priorityTone: string;
    created_at: string;
    link: string | null;
  }>;
}) {
  const dotClass = (lvl: "red" | "yellow" | "green") =>
    lvl === "red"
      ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.7)]"
      : lvl === "yellow"
        ? "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.55)]"
        : "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.55)]";

  const reds = rows.filter((r) => r.priorityLevel === "red").length;
  const yellows = rows.filter((r) => r.priorityLevel === "yellow").length;

  return (
    <section className="rounded-[12px] border border-border bg-surface">
      <div className="border-b border-border/60 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Air Traffic Control
          </div>
          <div className="flex items-center gap-2 text-[10px]">
            {reds > 0 && (
              <span className="inline-flex items-center gap-1 text-red-300">
                <span className={`h-1.5 w-1.5 rounded-full ${dotClass("red")}`} /> {reds}
              </span>
            )}
            {yellows > 0 && (
              <span className="inline-flex items-center gap-1 text-amber-300">
                <span className={`h-1.5 w-1.5 rounded-full ${dotClass("yellow")}`} /> {yellows}
              </span>
            )}
          </div>
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
                <th className="px-3 py-2 text-left font-semibold w-4"></th>
                <th className="px-3 py-2 text-left font-semibold">Type</th>
                <th className="px-3 py-2 text-left font-semibold">Signal</th>
                <th className="px-3 py-2 text-left font-semibold">From</th>
                <th className="px-3 py-2 text-left font-semibold">Age</th>
                <th className="px-3 py-2 text-left font-semibold"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {rows.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="px-3 py-2">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${dotClass(r.priorityLevel)}`}
                      title={r.priority}
                      aria-label={`${r.priorityLevel} priority`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full border px-1.5 py-px text-[9px] font-semibold ${r.typeTone}`}>
                      {r.type}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-foreground/85">
                    <div className="line-clamp-2">{r.question}</div>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{r.from}</td>
                  <td className="px-3 py-2 text-muted-foreground tabular-nums">{ageOf(r.created_at)}</td>
                  <td className="px-3 py-2">
                    {r.link ? (
                      <Link
                        to={r.link}
                        className="text-[11px] font-medium text-sky-300 hover:text-sky-200 whitespace-nowrap"
                      >
                        Go →
                      </Link>
                    ) : (
                      <span className="text-[11px] text-muted-foreground/60">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ---------- Open Consults (Phone-a-Friend status) ----------

function OpenConsultsPanel({
  rows,
  questions,
}: {
  rows: ExpertConsultRow[];
  questions: Q[];
}) {
  const open = rows.filter((r) => r.status !== "closed");
  const qMap = new Map(questions.map((q) => [q.id, q]));

  const statusTone = (s: ExpertConsultRow["status"]) => {
    switch (s) {
      case "sent":
        return "bg-sky-500/15 text-sky-300 border-sky-500/30";
      case "acknowledged":
        return "bg-violet-500/15 text-violet-300 border-violet-500/30";
      case "needs_info":
        return "bg-amber-500/15 text-amber-300 border-amber-500/30";
      case "reassigned":
        return "bg-muted text-muted-foreground border-border";
      case "responded":
        return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
      default:
        return "bg-muted text-muted-foreground border-border";
    }
  };

  return (
    <section className="rounded-[12px] border border-border bg-surface">
      <div className="border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          <Phone className="h-3 w-3" />
          Open Consults
        </div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">
          {open.length} active Phone-a-Friend request{open.length === 1 ? "" : "s"}
        </div>
      </div>
      {open.length === 0 ? (
        <div className="px-4 py-6 text-center text-[12px] text-muted-foreground">
          No open expert consults.
        </div>
      ) : (
        <ul className="max-h-[320px] divide-y divide-border/40 overflow-y-auto">
          {open.slice(0, 12).map((r) => {
            const q = r.question_id ? qMap.get(r.question_id) : null;
            const stage =
              r.status === "responded" ? 3
              : r.status === "acknowledged" || r.status === "needs_info" ? 2
              : 1;
            return (
              <li key={r.id} className="px-3 py-2.5 text-[11px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-muted-foreground">
                    {q ? `Q${q.question_number}` : "General"}
                  </span>
                  <span className={`rounded-full border px-1.5 py-px text-[9px] font-semibold uppercase tracking-[0.08em] ${statusTone(r.status)}`}>
                    {r.status.replace("_", " ")}
                  </span>
                </div>
                <div className="mt-1 line-clamp-2 text-foreground/85">{r.ask_subject}</div>
                {/* Sent → Acknowledged → Response Received tracker */}
                <div className="mt-2 flex items-center gap-1">
                  {[
                    { n: 1, label: "Sent" },
                    { n: 2, label: "Ack" },
                    { n: 3, label: "Response" },
                  ].map((step, i) => (
                    <div key={step.n} className="flex flex-1 items-center gap-1">
                      <div
                        className={`flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[8px] font-bold ${
                          stage >= step.n
                            ? step.n === 3
                              ? "bg-emerald-500 text-white"
                              : "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {stage > step.n ? "✓" : step.n}
                      </div>
                      <span className={`text-[9px] uppercase tracking-[0.1em] ${stage >= step.n ? "text-foreground/80" : "text-muted-foreground/60"}`}>
                        {step.label}
                      </span>
                      {i < 2 && (
                        <div className={`h-px flex-1 ${stage > step.n ? "bg-primary/60" : "bg-border"}`} />
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-1 text-[10px] text-muted-foreground tabular-nums">
                  {ageOf(r.created_at)} ago · urgency {r.urgency}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
