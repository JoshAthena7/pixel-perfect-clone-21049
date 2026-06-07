import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FlightDeck } from "@/components/v4/FlightDeck";
import { toast } from "sonner";
import { ArrowLeft, HelpCircle, BookOpen, X } from "lucide-react";
import { createSignal } from "@/lib/signals";
import { useEffect, useState } from "react";
import { hasSeenBrief, markBriefSeen } from "@/lib/brief-seen";

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
};

function MissionFlightDeckPage() {
  const { missionId } = Route.useParams();
  const qc = useQueryClient();

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
          "id,mission_id,question_number,section_number,title,pens_down_date,assigned_writer_id,health,status,current_score",
        )
        .eq("mission_id", missionId)
        .order("question_number", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Q[];
    },
  });

  const myQuestions = meId
    ? allQuestions.filter((q) => q.assigned_writer_id === meId)
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
        Loading flight deck…
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
        <RestoreHelpTooltip />
      </div>


      <FlightDeck
        missionId={missionId}
        me={meId ?? ""}
        myQuestions={myQuestions}
        allQuestions={allQuestions}
        updateStatus={updateStatus}
      />
    </div>
  );
}

function RestoreHelpTooltip() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background/40 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground hover:bg-background/70"
        aria-expanded={open}
      >
        <HelpCircle className="h-3.5 w-3.5" />
        Restore older version
      </button>
      {open && (
        <div
          role="dialog"
          className="absolute right-0 z-50 mt-2 w-80 rounded-lg border border-border bg-popover p-4 text-left text-xs text-popover-foreground shadow-xl"
        >
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            How to restore an older Flight Deck
          </div>
          <ol className="mt-2 space-y-1.5 list-decimal pl-4 text-foreground/90 normal-case tracking-normal">
            <li>Open the chat panel on the left of the Lovable editor.</li>
            <li>Click the <span className="font-medium">clock / History</span> icon at the top of the chat (or use any AI message's revert button).</li>
            <li>Pick the version you want, then click <span className="font-medium">Restore</span>.</li>
          </ol>
          <p className="mt-2 text-[11px] text-muted-foreground normal-case tracking-normal">
            Restoring is a Lovable action — it can't be triggered from inside the app itself.
          </p>
        </div>
      )}
    </div>
  );
}
