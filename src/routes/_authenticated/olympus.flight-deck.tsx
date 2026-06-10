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
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { toast } from "sonner";
import { cn } from "@/lib/utils";


export const Route = createFileRoute("/_authenticated/olympus/flight-deck")({
  component: FlightDeck,
});

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
  const other = data.assignments.filter((a) => a.acceptance_status !== "pending");

  const missionName = (id: string) => data.missions.find((m) => m.id === id)?.name ?? "Mission";
  const questionLookup = (id: string) => data.questions.find((q) => q.id === id);
  const sectionLookup = (id: string) => data.sections.find((s) => s.id === id);

  return (
    <div className="min-h-screen">
      <div className="border-b border-border bg-surface/40">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Flight Deck</h1>
            <p className="text-xs text-muted-foreground">{userName || "Writer"}</p>
          </div>
          <div className="ml-auto">
            <NotificationBell />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-6 space-y-6">
        <section>
          <h2 className="text-lg font-semibold mb-3">Flight Status</h2>

          {pending.length === 0 && other.length === 0 && data.alerts.length === 0 && (
            <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
              No assignments yet. You will see them here when you are assigned to a mission.
            </div>
          )}

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

          {other.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-muted-foreground mb-2">Your Assignments</h3>
              <ul className="space-y-2">
                {other.map((a) => {
                  const q = questionLookup(a.question_id);
                  if (!q) return null;
                  return (
                    <li
                      key={a.id}
                      className="rounded-lg border border-border bg-surface/40 px-4 py-3 text-sm flex flex-wrap items-center gap-2"
                    >
                      <span className="font-mono text-primary text-xs">{q.question_number}</span>
                      <span className="text-foreground">{missionName(a.mission_id)}</span>
                      <span className="text-muted-foreground truncate flex-1">
                        {q.question_text.slice(0, 80)}
                      </span>
                      <span className="text-xs uppercase text-muted-foreground">
                        {a.acceptance_status?.replace(/_/g, " ")}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>
      </div>
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
