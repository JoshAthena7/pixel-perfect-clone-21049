import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FlightDeck } from "@/components/v4/FlightDeck";
import { toast } from "sonner";
import { ArrowLeft, HelpCircle } from "lucide-react";
import { createSignal } from "@/lib/signals";
import { useState } from "react";

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
      <div className="mx-auto max-w-[1200px] px-6 pt-6">
        <Link
          to="/missions/$missionId/command"
          params={{ missionId }}
          className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to Mission Command
        </Link>
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
