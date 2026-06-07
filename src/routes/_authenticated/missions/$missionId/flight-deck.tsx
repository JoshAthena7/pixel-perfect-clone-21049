import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FlightDeck } from "@/components/v4/FlightDeck";
import { toast } from "sonner";
import { ArrowLeft, BookOpen, X, Phone as PhoneIcon } from "lucide-react";
import { createSignal } from "@/lib/signals";
import { useEffect, useState } from "react";
import { getBriefProgress, markBriefCompleted, type BriefProgress } from "@/lib/brief-seen";
import { Check } from "lucide-react";
import { PhoneAFriendOverlay } from "@/components/v2/PhoneAFriendOverlay";
import { IrisAlertBar } from "@/components/v4/IrisAlertBar";

export const Route = createFileRoute("/_authenticated/missions/$missionId/flight-deck")({
  component: MissionFlightDeckPage,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="mx-auto max-w-xl px-6 py-16 text-center">
        <h2 className="text-lg font-semibold">Couldn't load the flight deck</h2>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <button
          onClick={() => {
            reset();
            router.invalidate();
          }}
          className="mt-4 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted/40"
        >
          Try again
        </button>
      </div>
    );
  },
  notFoundComponent: () => (
    <div className="mx-auto max-w-xl px-6 py-16 text-center text-sm text-muted-foreground">
      Mission not found.
    </div>
  ),
});

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
  updated_at?: string | null;
  writer_name?: string | null;
};

function MissionFlightDeckPage() {
  const { missionId } = Route.useParams();
  const qc = useQueryClient();
  const [globalPhoneOpen, setGlobalPhoneOpen] = useState(false);

  const { data: me, isLoading: meLoading } = useQuery({
    queryKey: ["mc-flight-deck-me"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user;
    },
  });

  const meId = me?.id ?? null;

  const { data: allQuestions = [], isLoading: qLoading } = useQuery<Q[]>({
    queryKey: ["mc-flight-deck-questions", missionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("question_records")
        .select(
          "id,mission_id,question_number,section_number,title,pens_down_date,assigned_writer_id,health,status,current_score,iris_risk_flag,iris_risk_flag_text,point_value,updated_at",
        )
        .eq("mission_id", missionId)
        .order("question_number", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Q[];
    },
  });

  // UX-5: Resolve writer display names for the assigned_writer_ids on this mission.
  const writerIds = Array.from(
    new Set(allQuestions.map((q) => q.assigned_writer_id).filter((id): id is string => !!id)),
  );
  const { data: writerMap = {} } = useQuery<Record<string, string>>({
    queryKey: ["mc-flight-deck-writers", missionId, writerIds.sort().join(",")],
    enabled: writerIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id,display_name")
        .in("id", writerIds);
      const map: Record<string, string> = {};
      for (const p of data ?? []) {
        map[(p as any).id] = (p as any).display_name ?? "";
      }
      return map;
    },
  });

  const enrichedAll = allQuestions.map((q) => ({
    ...q,
    writer_name: q.assigned_writer_id ? writerMap[q.assigned_writer_id] ?? null : null,
  }));

  const myQuestions = meId
    ? enrichedAll.filter((q) => q.assigned_writer_id === meId)
    : [];

  const updateStatus = async (q: Q, db: string) => {
    const { error } = await supabase
      .from("question_records")
      .update({ status: db })
      .eq("id", q.id);
    if (error) {
      toast.error(`Couldn't update status: ${error.message}`);
      return;
    }
    toast.success("Status updated");
    qc.invalidateQueries({ queryKey: ["mc-flight-deck-questions", missionId] });
    if (db === "ready_for_review" || db === "approved") {
      void createSignal({
        mission_id: q.mission_id,
        source_module: "flight-deck",
        signal_type: db === "ready_for_review" ? "question_ready_for_review" : "question_approved",
        signal_title: `Q${q.question_number} ${db === "ready_for_review" ? "ready for review" : "approved"}`,
        signal_summary: q.title ?? null,
        severity: "info",
        related_question_id: q.id,
      }, qc);
    }
  };

  if (meLoading || qLoading) {
    return (
      <div className="mx-auto max-w-[1200px] px-6 py-12 text-sm text-muted-foreground">
        Pulling your deck…
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "#060b14" }}>
      <div className="mx-auto max-w-[1200px] px-6 pt-6 flex items-center justify-between gap-4">
        <Link
          to="/missions/$missionId/command"
          params={{ missionId }}
          className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to Mission Command
        </Link>
      </div>

      {/* M-4: Personal Flight Deck header — visually distinct from the mission-wide Brief. */}
      <div className="mx-auto mt-4 max-w-[1200px] px-6">
        <div
          className="rounded-lg border px-4 py-3"
          style={{
            background: "linear-gradient(135deg, rgba(96,165,250,0.10), rgba(96,165,250,0.02))",
            borderColor: "rgba(96,165,250,0.35)",
          }}
        >
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: "#60A5FA" }}>
                Your Flight Deck
              </div>
              <div className="text-[15px] font-semibold text-foreground mt-1">
                {meId
                  ? `${myQuestions.length} question${myQuestions.length === 1 ? "" : "s"} assigned to you`
                  : "Sign in to see your personal assignments"}
              </div>
              <div className="text-[12px] text-muted-foreground mt-0.5">
                Personal task list and individual progress. For the mission-wide overview, win themes, team, and IRIS intelligence, open the Mission Brief.
              </div>
            </div>
            <Link
              to="/missions/$missionId/brief"
              params={{ missionId }}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground hover:text-foreground"
            >
              View Mission Brief
            </Link>
          </div>
        </div>
      </div>

      <IrisAlertBar missionId={missionId} />
      <BriefPrompt missionId={missionId} userId={meId ?? ""} />

      <FlightDeck
        missionId={missionId}
        me={meId ?? ""}
        myQuestions={myQuestions}
        allQuestions={enrichedAll}
        updateStatus={updateStatus}
      />
      {globalPhoneOpen && (
        <PhoneAFriendOverlay
          missionId={missionId}
          questionId={null}
          meId={meId}
          meName=""
          onClose={() => setGlobalPhoneOpen(false)}
        />
      )}
    </div>
  );
}

function BriefPrompt({ missionId, userId }: { missionId: string; userId: string }) {
  const [progress, setProgress] = useState<BriefProgress | null>(null);

  // Resolve on the client only — getBriefProgress reads localStorage.
  useEffect(() => {
    if (!userId) return;
    setProgress(getBriefProgress(userId, missionId));
    // Refresh on tab focus so completing the brief in another tab clears the banner.
    const onFocus = () => setProgress(getBriefProgress(userId, missionId));
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [userId, missionId]);

  if (!userId || progress === null || progress === "completed") return null;

  const opened = progress === "opened";
  const dismiss = () => {
    // Dismiss = mark as fully done so the banner never returns for this mission.
    markBriefCompleted(userId, missionId);
    setProgress("completed");
  };

  return (
    <div className="mx-auto mt-4 max-w-[1200px] px-6">
      <div
        role="status"
        className="flex items-start gap-3 rounded-lg border border-amber-400/30 bg-amber-400/[0.06] px-4 py-3 text-amber-100"
        style={{ backdropFilter: "blur(4px)" }}
      >
        <BookOpen className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-300" />
        <div className="flex-1 text-[13px] leading-relaxed">
          <div className="font-semibold tracking-wide">
            {opened ? "Finish reading the Mission Brief" : "Start with the Mission Brief"}
          </div>
          <div className="mt-0.5 text-amber-100/75">
            {opened
              ? "You've opened the brief — scroll to the end to mark it complete."
              : "Read the brief once to orient yourself — every output on this Flight Deck builds on it."}
          </div>
          <BriefProgressDots opened={opened} />
        </div>
        <Link
          to="/missions/$missionId/brief"
          params={{ missionId }}
          className="inline-flex items-center gap-1.5 rounded-md border border-amber-300/40 bg-amber-300/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100 hover:bg-amber-300/20"
        >
          {opened ? "Resume brief" : "Open brief"}
        </Link>
        {opened && (
          <button
            type="button"
            onClick={() => {
              markBriefCompleted(userId, missionId);
              setProgress("completed");
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300/40 bg-emerald-300/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100 hover:bg-emerald-300/20"
          >
            <Check className="h-3 w-3" strokeWidth={3} />
            I've finished reading
          </button>
        )}
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="rounded-md p-1 text-amber-100/60 hover:bg-amber-300/10 hover:text-amber-100"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function BriefProgressDots({ opened }: { opened: boolean }) {
  const Step = ({ done, label }: { done: boolean; label: string }) => (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={
          "flex h-3.5 w-3.5 items-center justify-center rounded-full border " +
          (done
            ? "border-emerald-300/60 bg-emerald-300/20 text-emerald-200"
            : "border-amber-200/40 text-amber-100/40")
        }
        aria-hidden
      >
        {done ? <Check className="h-2.5 w-2.5" strokeWidth={3} /> : null}
      </span>
      <span className={done ? "text-emerald-200/90" : "text-amber-100/55"}>{label}</span>
    </span>
  );
  return (
    <div className="mt-2 flex items-center gap-3 text-[11px] uppercase tracking-[0.16em]">
      <Step done={opened} label="Opened" />
      <span className="text-amber-100/25">—</span>
      <Step done={false} label="Completed" />
      <span className="ml-1 normal-case tracking-normal text-amber-100/55">
        ({opened ? 1 : 0} of 2)
      </span>
    </div>
  );
}
