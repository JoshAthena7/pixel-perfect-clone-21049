import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, differenceInDays, differenceInHours, formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  CheckCircle2,
  ArrowLeft,
  Target,
  Sparkles,
  Activity,
  ExternalLink,
  Clock,
  Flame,
  Eye,
  MessageCircle,
  FileText,
  Users,
} from "lucide-react";
import { FlightDeckLayout } from "@/components/flight-deck/FlightDeckLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { QaLogTab } from "@/components/mission-command/QaLogTab";
import { fireAssistEvent } from "@/lib/fireAssistEvent";


export const Route = createFileRoute("/_authenticated/olympus/flight-deck")({
  component: DeskPage,
});

function DeskPage() {
  const [tab, setTab] = useState<"deck" | "qa">("deck");
  return (
    <div>
      <div
        className="sticky top-12 z-30 flex items-center gap-1 px-6 h-10"
        style={{ background: "#070f1c", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        {[
          { id: "deck" as const, label: "Flight Deck" },
          { id: "qa" as const, label: "Q&A Log" },
        ].map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className="px-3 py-1.5 rounded-md transition-colors hover:bg-white/[0.05]"
              style={{
                fontSize: 12,
                color: active ? "#c9a84c" : "rgba(255,255,255,0.55)",
                fontWeight: active ? 600 : 400,
                borderBottom: active ? "2px solid #c9a84c" : "2px solid transparent",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {tab === "deck" ? <FlightDeck /> : <DeskQaPanel />}
    </div>
  );
}

function DeskQaPanel() {
  const { data: missionId, isLoading } = useQuery({
    queryKey: ["desk-qa-mission"],
    queryFn: async () => {
      const { data: m } = await supabase.rpc("current_atlas_member_id");
      if (!m) return null;
      const { data: asgs } = await supabase
        .from("mission_assignments")
        .select("mission_id")
        .eq("assigned_writer_id", m as string)
        .limit(1);
      return (asgs?.[0]?.mission_id as string) ?? null;
    },
    staleTime: 60_000,
  });
  if (isLoading) return <div className="p-8"><Skeleton className="h-40" /></div>;
  if (!missionId) {
    return (
      <div className="mx-auto max-w-3xl p-8 text-sm text-muted-foreground">
        No mission Q&A available — you have no active assignments.
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6">
      <QaLogTab missionId={missionId} />
    </div>
  );
}


type Assignment = {
  id: string;
  mission_id: string;
  question_id: string;
  assigned_writer_id: string | null;
  acceptance_status: string | null;
  acceptance_responded_at: string | null;
  writer_confidence: string | null;
  assigned_at: string | null;
  due_date: string | null;
};

type Question = {
  id: string;
  section_id: string;
  question_number: string;
  question_text: string;
  due_date: string | null;
};

type Mission = { id: string; name: string };
type Section = { id: string; name: string };

function FlightDeck() {
  const qc = useQueryClient();
  const [memberId, setMemberId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [bootstrapped, setBootstrapped] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id ?? null;
      setUserId(uid);
      const { data: m } = await supabase.rpc("current_atlas_member_id");
      setMemberId((m as string) ?? null);
      if (m) {
        const { data: atm } = await supabase
          .from("atlas_team_members")
          .select("first_name, last_name")
          .eq("id", m as string)
          .single();
        if (atm) setUserName(`${atm.first_name ?? ""} ${atm.last_name ?? ""}`.trim());
      }
      if (uid) {
        const { data: admin } = await supabase.rpc("has_role", {
          _user_id: uid,
          _role: "admin",
        });
        setIsAdmin(!!admin);
      }
      setBootstrapped(true);
    })();
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["flight-deck", memberId, isAdmin],
    enabled: bootstrapped && (!!memberId || isAdmin),
    queryFn: async () => {
      const { data: asgs } = memberId
        ? await supabase
            .from("mission_assignments")
            .select("*")
            .eq("assigned_writer_id", memberId)
        : { data: [] as Assignment[] };
      const assignments = (asgs ?? []) as Assignment[];
      const missionIds = Array.from(new Set(assignments.map((a) => a.mission_id)));
      const questionIds = assignments
        .map((a) => a.question_id)
        .filter((id): id is string => !!id);
      const [missions, questions, alerts] = await Promise.all([
        missionIds.length
          ? supabase.from("missions").select("id, name").in("id", missionIds)
          : Promise.resolve({ data: [] }),
        questionIds.length
          ? supabase
              .from("mission_questions")
              .select("id, section_id, question_number, question_text, due_date")
              .in("id", questionIds)
          : Promise.resolve({ data: [] }),
        supabase
          .from("atlas_notifications")
          .select("*")
          .eq("type", "iris_alert")
          .eq("is_read", false)
          .order("created_at", { ascending: false }),
      ]);
      const sectionIds = Array.from(
        new Set(((questions.data ?? []) as Question[]).map((q) => q.section_id)),
      );
      const [secsRes, signalsRes] = await Promise.all([
        sectionIds.length
          ? supabase.from("mission_sections").select("id, name").in("id", sectionIds)
          : Promise.resolve({ data: [] as Section[] }),
        questionIds.length
          ? supabase
              .from("signals")
              .select("id, signal_type, signal_title, signal_summary, severity, created_at, related_question_id, mission_id, source_module")
              .in("related_question_id", questionIds)
              .order("created_at", { ascending: false })
              .limit(40)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      return {
        assignments,
        missions: (missions.data ?? []) as Mission[],
        questions: (questions.data ?? []) as Question[],
        sections: (secsRes.data ?? []) as Section[],
        signals: (signalsRes.data ?? []) as any[],
        alerts: ((alerts.data ?? []) as any[]).filter(
          (n) => n.recipient_id === memberId || n.recipient_id === userId,
        ),
      };
    },
  });


  // Escalation checks on load
  useEffect(() => {
    if (!data || !memberId) return;
    const now = new Date();
    (async () => {
      for (const a of data.assignments) {
        if (a.acceptance_status !== "pending" || !a.assigned_at) continue;
        const hours = differenceInHours(now, new Date(a.assigned_at));
        const q = data.questions.find((x) => x.id === a.question_id);
        if (!q) continue;

        const insertAlert = async (recipientId: string, message: string) => {
          const { data: existing } = await supabase
            .from("atlas_notifications")
            .select("id")
            .eq("type", "iris_alert")
            .eq("recipient_id", recipientId)
            .eq("is_read", false)
            .contains("metadata", { question_id: q.id })
            .limit(1);
          if (existing && existing.length > 0) return;
          await supabase.from("atlas_notifications").insert({
            recipient_id: recipientId,
            recipient_role: "specific_user",
            type: "iris_alert",
            message,
            metadata: { mission_id: a.mission_id, question_id: q.id },
          });
        };

        if (hours > 24) {
          await insertAlert(
            memberId,
            `IRIS Alert: Assignment ${q.question_number} still awaiting your acceptance.`,
          );
        }
        if (hours > 48) {
          await supabase
            .from("mission_questions")
            .update({ health_status: "at_risk" })
            .eq("id", q.id);
          const { data: leads } = await supabase
            .from("mission_team_members")
            .select("member_id")
            .eq("mission_id", a.mission_id)
            .eq("mission_role", "engagement_lead");
          for (const l of leads ?? []) {
            await insertAlert(
              (l as any).member_id,
              `IRIS Alert: ${q.question_number} acceptance overdue (48h+). Writer hasn't responded.`,
            );
          }
        }
      }
    })();
  }, [data, memberId, userId]);

  if (bootstrapped && !memberId && !isAdmin) {
    return (
      <div className="mx-auto max-w-3xl p-8">
        <Link to="/olympus" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <h1 className="text-2xl font-bold mt-4">Flight Deck</h1>
        <p className="text-muted-foreground mt-2">
          Your account is not linked to a team member profile yet.
        </p>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="mx-auto max-w-4xl p-8 space-y-4">
        <Skeleton className="h-12" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  const pending = data.assignments.filter((a) => a.acceptance_status === "pending");
  const accepted = data.assignments.filter(
    (a) => a.acceptance_status === "accepted" || a.acceptance_status === null,
  );
  const blocked = data.assignments.filter(
    (a) => a.acceptance_status === "need_help" || a.acceptance_status === "capacity_concern",
  );

  const missionName = (id: string) => data.missions.find((m) => m.id === id)?.name ?? "Mission";
  const questionLookup = (id: string) => data.questions.find((q) => q.id === id);
  const sectionLookup = (id: string) => data.sections.find((s) => s.id === id);

  // Today's Focus: top 3 accepted/in-flight assignments sorted by soonest due
  const focus = [...accepted]
    .map((a) => ({ a, q: questionLookup(a.question_id) }))
    .filter((x) => !!x.q)
    .sort((x, y) => {
      const dx = x.q?.due_date ? new Date(x.q.due_date).getTime() : Number.POSITIVE_INFINITY;
      const dy = y.q?.due_date ? new Date(y.q.due_date).getTime() : Number.POSITIVE_INFINITY;
      return dx - dy;
    })
    .slice(0, 3);

  // Group accepted/other assignments by mission for the queue
  const queueByMission = new Map<string, Assignment[]>();
  for (const a of [...accepted, ...blocked]) {
    const list = queueByMission.get(a.mission_id) ?? [];
    list.push(a);
    queueByMission.set(a.mission_id, list);
  }

  // Capacity: simple load gauge
  const totalLoad = accepted.length + pending.length + blocked.length;
  const capacityPct = Math.min(100, Math.round((totalLoad / 8) * 100));
  const capacityTone =
    capacityPct < 50 ? "text-green-400" : capacityPct < 80 ? "text-amber-400" : "text-red-400";

  return (
    <div className="min-h-screen">
      <div className="border-b border-[#C49A2B]/30 bg-[#0D1B3E]/80">
        <div className="mx-auto max-w-6xl px-6 py-5 flex items-center gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-[#C49A2B]">Athena · ATLAS</p>
            <h1 className="text-2xl font-bold text-foreground">Flight Deck</h1>
            <p className="text-xs text-muted-foreground">
              {userName || "Writer"} · {totalLoad} active {totalLoad === 1 ? "assignment" : "assignments"}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Link
              to="/olympus"
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Olympus
            </Link>
            <NotificationBell />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-6 py-6">
        <FlightDeckLayout
          memberId={memberId}
          activeMissionId={data.assignments[0]?.mission_id ?? null}
          activeMissionName={data.assignments[0] ? (data.missions.find((m) => m.id === data.assignments[0].mission_id)?.name ?? "Flight Deck") : "Flight Deck"}
          activeMissionStatus={null}
          onPrefillIris={(t) =>
            window.dispatchEvent(new CustomEvent("atlas:iris:prefill", { detail: t }))
          }
        />
      </div>

      <div className="mx-auto max-w-6xl px-6 py-6 space-y-8">
        {/* Action Required — acceptance + IRIS alerts */}
        {(pending.length > 0 || data.alerts.length > 0) && (
          <section>
            <SectionHeader
              icon={<Flame className="h-4 w-4" />}
              title="Action Required"
              hint="Respond to keep missions moving"
            />
            {pending.map((a) => {
              const q = questionLookup(a.question_id);
              if (!q) return null;
              return (
                <AcceptanceCard
                  key={a.id}
                  assignment={a}
                  question={q}
                  missionName={missionName(a.mission_id)}
                  sectionName={sectionLookup(q.section_id)?.name ?? ""}
                  writerName={userName}
                  onResponded={() => qc.invalidateQueries({ queryKey: ["flight-deck"] })}
                />
              );
            })}
            {data.alerts.length > 0 && (
              <IRISAlertsSection
                alerts={data.alerts}
                onDismiss={async (id) => {
                  await supabase.from("atlas_notifications").update({ is_read: true }).eq("id", id);
                  qc.invalidateQueries({ queryKey: ["flight-deck"] });
                  qc.invalidateQueries({ queryKey: ["notifications"] });
                }}
              />
            )}
          </section>
        )}

        {/* Today's Focus + Capacity & Pulse */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <section className="lg:col-span-2">
            <SectionHeader
              icon={<Target className="h-4 w-4 text-[#C49A2B]" />}
              title="Today's Focus"
              hint="Top 3 due-soonest"
            />
            {focus.length === 0 ? (
              <EmptyTile message="Nothing due. Pick up an assignment from the queue below." />
            ) : (
              <ul className="space-y-2">
                {focus.map(({ a, q }) => {
                  const due = q!.due_date ? new Date(q!.due_date) : null;
                  const days = due ? differenceInDays(due, new Date()) : null;
                  const urgent = days !== null && days <= 2;
                  return (
                    <li
                      key={a.id}
                      className={cn(
                        "rounded-xl border bg-surface/40 p-4 flex items-start gap-3",
                        urgent ? "border-red-500/40 bg-red-500/5" : "border-border",
                      )}
                    >
                      <div
                        className={cn(
                          "h-10 w-10 rounded-lg flex items-center justify-center shrink-0",
                          urgent ? "bg-red-500/15 text-red-400" : "bg-[#C49A2B]/15 text-[#C49A2B]",
                        )}
                      >
                        <Clock className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs text-[#C49A2B]">
                            {q!.question_number}
                          </span>
                          <span className="text-sm font-semibold text-foreground">
                            {missionName(a.mission_id)}
                          </span>
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            {sectionLookup(q!.section_id)?.name ?? ""}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {q!.question_text}
                        </p>
                        <div className="flex items-center gap-3 mt-2 text-xs">
                          {due && (
                            <span className={urgent ? "text-red-400" : "text-muted-foreground"}>
                              Due {format(due, "MMM d")}
                              {days !== null && ` · ${days >= 0 ? `${days}d left` : `${-days}d over`}`}
                            </span>
                          )}
                          {a.writer_confidence && (
                            <ConfidencePill level={a.writer_confidence} />
                          )}
                        </div>
                      </div>
                      <Link
                        to="/olympus/missions/$missionId"
                        params={{ missionId: a.mission_id }}
                        className="text-xs text-[#C49A2B] hover:underline inline-flex items-center gap-1 shrink-0"
                      >
                        Open <ExternalLink className="h-3 w-3" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section>
            <SectionHeader
              icon={<Activity className="h-4 w-4 text-[#C49A2B]" />}
              title="Capacity & Pulse"
            />
            <div className="rounded-xl border border-border bg-surface/40 p-5 space-y-4">
              <div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Current load</span>
                  <span className={cn("font-semibold", capacityTone)}>{capacityPct}%</span>
                </div>
                <div className="mt-2 h-2 w-full rounded-full bg-background/60 overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      capacityPct < 50
                        ? "bg-green-500"
                        : capacityPct < 80
                          ? "bg-amber-500"
                          : "bg-red-500",
                    )}
                    style={{ width: `${capacityPct}%` }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {totalLoad} of ~8 recommended concurrent assignments
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <Stat label="Pending" value={pending.length} tone="text-[#C49A2B]" />
                <Stat label="In flight" value={accepted.length} tone="text-foreground" />
                <Stat label="Blocked" value={blocked.length} tone="text-red-400" />
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full border-[#C49A2B]/40 text-[#C49A2B] hover:bg-[#C49A2B]/10"
                onClick={() => toast("Daily pulse coming soon — log how you're feeling about your load.")}
              >
                Log daily pulse
              </Button>
            </div>
          </section>
        </div>

        {/* IRIS Assists */}
        <section>
          <SectionHeader
            icon={<Sparkles className="h-4 w-4 text-[#C49A2B]" />}
            title="IRIS Assists"
            hint="AI suggestions on your assignments"
          />
          <IrisAssistsPanel signals={data.signals} questionLookup={questionLookup} missionName={missionName} />
        </section>

        {/* My Questions queue */}
        <section>
          <SectionHeader
            icon={<FileText className="h-4 w-4 text-[#C49A2B]" />}
            title="My Questions"
            hint={`${totalLoad} across ${queueByMission.size} ${queueByMission.size === 1 ? "mission" : "missions"}`}
          />
          {queueByMission.size === 0 ? (
            <EmptyTile message="No assignments yet. You'll see them here when assigned." />
          ) : (
            <div className="space-y-4">
              {[...queueByMission.entries()].map(([mid, list]) => (
                <div key={mid} className="rounded-xl border border-border bg-surface/30">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-[#C49A2B]" />
                      <span className="font-semibold text-foreground">{missionName(mid)}</span>
                      <span className="text-xs text-muted-foreground">
                        {list.length} {list.length === 1 ? "question" : "questions"}
                      </span>
                    </div>
                    <Link
                      to="/olympus/missions/$missionId"
                      params={{ missionId: mid }}
                      className="text-xs text-[#C49A2B] hover:underline inline-flex items-center gap-1"
                    >
                      Mission Command <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                  <ul className="divide-y divide-border">
                    {list.map((a) => {
                      const q = questionLookup(a.question_id);
                      if (!q) return null;
                      const due = q.due_date ? new Date(q.due_date) : null;
                      return (
                        <li key={a.id} className="px-4 py-3 flex flex-wrap items-center gap-3">
                          <span className="font-mono text-xs text-[#C49A2B] w-16 shrink-0">
                            {q.question_number}
                          </span>
                          <span className="text-sm text-foreground flex-1 min-w-0 truncate">
                            {q.question_text}
                          </span>
                          {due && (
                            <span className="text-xs text-muted-foreground">
                              {format(due, "MMM d")}
                            </span>
                          )}
                          {a.writer_confidence && <ConfidencePill level={a.writer_confidence} />}
                          <StatusPill status={a.acceptance_status} />
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  hint,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex items-end justify-between mb-3">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
      </div>
      {hint && <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{hint}</span>}
    </div>
  );
}

function EmptyTile({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-lg bg-background/40 py-2">
      <div className={cn("text-lg font-bold", tone)}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

function ConfidencePill({ level }: { level: string }) {
  const map: Record<string, string> = {
    high: "border-green-500/40 text-green-400 bg-green-500/10",
    medium: "border-amber-500/40 text-amber-400 bg-amber-500/10",
    low: "border-red-500/40 text-red-400 bg-red-500/10",
  };
  return (
    <span className={cn("text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border", map[level] ?? "border-border text-muted-foreground")}>
      {level}
    </span>
  );
}

function StatusPill({ status }: { status: string | null }) {
  if (!status) return null;
  const tone =
    status === "accepted"
      ? "text-green-400 border-green-500/40 bg-green-500/10"
      : status === "need_help"
        ? "text-amber-400 border-amber-500/40 bg-amber-500/10"
        : status === "capacity_concern"
          ? "text-red-400 border-red-500/40 bg-red-500/10"
          : "text-muted-foreground border-border";
  return (
    <span className={cn("text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border", tone)}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

const ASSIST_META: Record<string, { Icon: any; label: string; tone: string }> = {
  comment_added: { Icon: MessageCircle, label: "Comment", tone: "text-blue-400" },
  sme_requested: { Icon: Users, label: "SME suggested", tone: "text-[#C49A2B]" },
  decision_needed: { Icon: AlertTriangle, label: "Decision needed", tone: "text-amber-400" },
  leadership_guidance_added: { Icon: Sparkles, label: "Guidance added", tone: "text-[#C49A2B]" },
  question_ready_for_review: { Icon: Eye, label: "Ready for review", tone: "text-green-400" },
  iris_alert: { Icon: AlertTriangle, label: "IRIS alert", tone: "text-amber-400" },
};

function IrisAssistsPanel({
  signals,
  questionLookup,
  missionName,
}: {
  signals: any[];
  questionLookup: (id: string) => Question | undefined;
  missionName: (id: string) => string;
}) {
  const top = signals.slice(0, 8);
  if (top.length === 0) {
    return (
      <EmptyTile message="No IRIS suggestions yet. Assists appear here as IRIS reviews your assignments." />
    );
  }
  return (
    <div className="rounded-xl border border-[#C49A2B]/30 bg-gradient-to-br from-[#0D1B3E]/40 to-surface/40">
      <ul className="divide-y divide-border">
        {top.map((s) => {
          const meta = ASSIST_META[s.signal_type] ?? {
            Icon: Sparkles,
            label: s.signal_type?.replace(/_/g, " ") ?? "Signal",
            tone: "text-[#C49A2B]",
          };
          const Icon = meta.Icon;
          const q = s.related_question_id ? questionLookup(s.related_question_id) : null;
          return (
            <li key={s.id} className="px-4 py-3 flex items-start gap-3">
              <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", meta.tone)} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className={cn("uppercase tracking-wider font-semibold", meta.tone)}>
                    {meta.label}
                  </span>
                  {q && <span className="font-mono text-[#C49A2B]">{q.question_number}</span>}
                  <span className="text-muted-foreground">{missionName(s.mission_id)}</span>
                  <span className="text-muted-foreground ml-auto">
                    {formatDistanceToNow(new Date(s.created_at), { addSuffix: true })}
                  </span>
                </div>
                <p className="text-sm text-foreground mt-1">{s.signal_title}</p>
                {s.signal_summary && (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                    {s.signal_summary}
                  </p>
                )}
              </div>
              <Link
                to="/olympus/missions/$missionId"
                params={{ missionId: s.mission_id }}
                className="text-xs text-[#C49A2B] hover:underline inline-flex items-center gap-1 shrink-0"
              >
                Open <ExternalLink className="h-3 w-3" />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}



function AcceptanceCard({
  assignment,
  question,
  missionName,
  sectionName,
  writerName,
  onResponded,
}: {
  assignment: Assignment;
  question: Question;
  missionName: string;
  sectionName: string;
  writerName: string;
  onResponded: () => void;
}) {
  const [phase, setPhase] = useState<"choose" | "confidence" | "concern" | "success">("choose");
  const [confidence, setConfidence] = useState<string | null>(null);
  const [concern, setConcern] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const due = question.due_date ? new Date(question.due_date) : null;
  const days = due ? differenceInDays(due, new Date()) : null;

  const logAudit = async (action: string, metadata: any) => {
    await supabase.from("mission_audit_log").insert({
      mission_id: assignment.mission_id,
      action,
      performed_by_name: writerName,
      metadata,
    });
  };

  const notifyLead = async (type: string, message: string) => {
    const { data: leads } = await supabase
      .from("mission_team_members")
      .select("member_id")
      .eq("mission_id", assignment.mission_id)
      .eq("mission_role", "engagement_lead");
    if (!leads?.length) return;
    await supabase.from("atlas_notifications").insert(
      leads.map((l: any) => ({
        recipient_id: l.member_id,
        recipient_role: "specific_user",
        type,
        message,
        metadata: { mission_id: assignment.mission_id, question_id: question.id },
      })),
    );
  };

  const handleAccept = async () => {
    setSubmitting(true);
    await supabase
      .from("mission_assignments")
      .update({ acceptance_status: "accepted", acceptance_responded_at: new Date().toISOString() })
      .eq("id", assignment.id);
    void fireAssistEvent(assignment.mission_id, question.id, null, "status_updated", {
      acceptance_status: "accepted",
    });
    setPhase("confidence");
    setSubmitting(false);
  };

  const handleConfidence = async (level: string) => {
    setSubmitting(true);
    setConfidence(level);
    await supabase
      .from("mission_assignments")
      .update({ writer_confidence: level })
      .eq("id", assignment.id);
    await logAudit("Assignment accepted", { question_id: question.id, confidence: level });
    setPhase("success");
    setTimeout(onResponded, 3000);
  };

  const handleNeedHelp = async () => {
    setSubmitting(true);
    await supabase
      .from("mission_assignments")
      .update({ acceptance_status: "need_help", acceptance_responded_at: new Date().toISOString() })
      .eq("id", assignment.id);
    await notifyLead(
      "sme_needed",
      `${writerName || "A writer"} needs SME support on ${question.question_number} for ${missionName}. Please assign a supporting SME.`,
    );
    await logAudit("Assignment need help", { question_id: question.id });
    toast.success("Your Engagement Lead has been notified.");
    setTimeout(onResponded, 4000);
    setPhase("success");
  };

  const handleConcernSubmit = async () => {
    if (concern.trim().length < 10) return;
    setSubmitting(true);
    await supabase
      .from("mission_assignments")
      .update({ acceptance_status: "capacity_concern", acceptance_responded_at: new Date().toISOString() })
      .eq("id", assignment.id);
    await notifyLead(
      "capacity_concern",
      `${writerName || "A writer"} has flagged a capacity concern on ${question.question_number} for ${missionName}: ${concern.trim()}. Please review.`,
    );
    await logAudit("Capacity concern flagged", {
      question_id: question.id,
      concern: concern.trim(),
    });
    toast.success("Your concern has been flagged to your Engagement Lead.");
    setTimeout(onResponded, 4000);
    setPhase("success");
  };

  return (
    <div className="rounded-xl border border-border border-l-[6px] border-l-primary bg-primary/5 p-5 mb-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
        <span className="text-xs font-semibold uppercase tracking-wider text-primary">
          Action Required
        </span>
      </div>
      <h3 className="text-lg font-bold text-foreground">{missionName}</h3>
      <p className="text-xs text-muted-foreground">You have been assigned:</p>
      <div className="mt-2">
        <span className="font-mono text-primary text-sm">{question.question_number}</span>
        <p className="text-sm text-foreground mt-1">
          {question.question_text.slice(0, 80)}
          {question.question_text.length > 80 ? "…" : ""}
        </p>
        {sectionName && <p className="text-xs text-muted-foreground mt-1">{sectionName}</p>}
      </div>
      {due && (
        <p className="mt-2 text-xs text-muted-foreground">
          Due {format(due, "MMM d, yyyy")}
          {days !== null && ` — ${days} days from now`}
        </p>
      )}

      {phase === "choose" && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            onClick={handleAccept}
            disabled={submitting}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            Accept Assignment
          </Button>
          <Button
            onClick={handleNeedHelp}
            disabled={submitting}
            className="bg-amber-500 hover:bg-amber-600 text-white"
          >
            Need Help
          </Button>
          <Button
            onClick={() => setPhase("concern")}
            disabled={submitting}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            Capacity Concern
          </Button>
        </div>
      )}

      {phase === "confidence" && (
        <div className="mt-4">
          <p className="text-sm font-medium">How confident are you about this assignment?</p>
          <p className="text-xs text-muted-foreground mb-2">
            Select your confidence level to complete acceptance.
          </p>
          <div className="flex gap-2">
            {["high", "medium", "low"].map((lvl) => (
              <Button
                key={lvl}
                variant="outline"
                disabled={submitting}
                onClick={() => handleConfidence(lvl)}
                className={cn(
                  lvl === "high" && "border-green-500 text-green-400 hover:bg-green-500/10",
                  lvl === "medium" && "border-amber-500 text-amber-400 hover:bg-amber-500/10",
                  lvl === "low" && "border-red-500 text-red-400 hover:bg-red-500/10",
                )}
              >
                {lvl.charAt(0).toUpperCase() + lvl.slice(1)}
              </Button>
            ))}
          </div>
        </div>
      )}

      {phase === "concern" && (
        <div className="mt-4">
          <p className="text-sm font-medium mb-2">Describe your concern</p>
          <Textarea
            value={concern}
            onChange={(e) => setConcern(e.target.value)}
            placeholder="e.g. I have a conflict with the due date, or I don't have the right expertise for this section"
            rows={3}
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {concern.trim().length}/10 chars minimum
            </span>
            <Button
              disabled={concern.trim().length < 10 || submitting}
              onClick={handleConcernSubmit}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Flag Concern
            </Button>
          </div>
        </div>
      )}

      {phase === "success" && (
        <div className="mt-4 flex items-center gap-2 text-green-400">
          <CheckCircle2 className="h-5 w-5" />
          <span className="text-sm font-medium">
            {confidence ? "Assignment accepted. Good luck." : "Response recorded."}
          </span>
        </div>
      )}
    </div>
  );
}

function IRISAlertsSection({
  alerts,
  onDismiss,
}: {
  alerts: any[];
  onDismiss: (id: string) => Promise<void>;
}) {
  return (
    <div className="mt-6 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
        <h3 className="font-semibold text-amber-400">IRIS Alerts</h3>
        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400">
          {alerts.length}
        </span>
      </div>
      <ul className="space-y-2">
        {alerts.map((n) => (
          <li
            key={n.id}
            className="flex items-start gap-3 rounded-md bg-background/40 px-3 py-2"
          >
            <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm">{n.message}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {n.created_at && format(new Date(n.created_at), "MMM d, h:mm a")}
              </p>
            </div>
            <button
              onClick={() => onDismiss(n.id)}
              className="text-xs text-primary hover:underline shrink-0"
            >
              Dismiss
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
