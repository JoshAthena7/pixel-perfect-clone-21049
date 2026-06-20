/**
 * Compact "Open Notes" widget for the Briefing Room right column.
 * Hides entirely when there are zero unresolved question/blocker/insight
 * notes. Each row links to ATC / Flight Deck for the relevant question.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

type OpenNoteRow = {
  id: string;
  note_type: "decision" | "question" | "blocker" | "insight";
  created_at: string;
  question_id: string;
  question_number: string | null;
};

function relTime(iso: string) {
  const h = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}m ago`;
  if (h < 24) return `${Math.round(h)}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function OpenNotesWidget({ missionId }: { missionId: string }) {
  const navigate = useNavigate();
  const { data: notes } = useQuery<OpenNoteRow[]>({
    queryKey: ["open-notes-widget", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("question_notes")
        .select(
          "id, note_type, created_at, question_id, mission_questions!inner(question_number)",
        )
        .eq("mission_id", missionId)
        .eq("is_resolved", false)
        .is("reply_to_note_id", null)
        .order("created_at", { ascending: true });
      return (
        ((data ?? []) as Array<{
          id: string;
          note_type: OpenNoteRow["note_type"];
          created_at: string;
          question_id: string;
          mission_questions: { question_number: string | null } | null;
        }>).map((r) => ({
          id: r.id,
          note_type: r.note_type,
          created_at: r.created_at,
          question_id: r.question_id,
          question_number: r.mission_questions?.question_number ?? null,
        }))
      );
    },
    staleTime: 60_000,
  });

  const counts = useMemo(() => {
    const c = { blocker: 0, question: 0, insightNoReply: 0 } as const as {
      blocker: number;
      question: number;
      insightNoReply: number;
    };
    for (const n of notes ?? []) {
      if (n.note_type === "blocker") c.blocker += 1;
      else if (n.note_type === "question") c.question += 1;
      else if (n.note_type === "insight") c.insightNoReply += 1;
    }
    return c;
  }, [notes]);

  if (!notes || notes.length === 0) return null;
  const oldest = notes[0];

  return (
    <section
      className="rounded-lg border border-white/10 bg-white/[0.015] p-3"
      style={{ display: "flex", flexDirection: "column", gap: 8 }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h3
          style={{
            color: "white",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: 0.5,
            textTransform: "uppercase",
          }}
        >
          Open Notes
        </h3>
        <button
          onClick={() =>
            navigate({
              to: "/missions/$missionId/flight-deck",
              params: { missionId },
            })
          }
          style={{
            background: "transparent",
            border: "none",
            color: "rgba(201,168,76,0.9)",
            fontSize: 10,
            cursor: "pointer",
          }}
        >
          Go to ATC →
        </button>
      </header>

      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 4 }}>
        {counts.blocker > 0 && (
          <li style={{ color: "rgba(248,113,113,0.95)", fontSize: 11 }}>
            🚧 {counts.blocker} Blocker{counts.blocker === 1 ? "" : "s"}
          </li>
        )}
        {counts.question > 0 && (
          <li style={{ color: "rgba(96,165,250,0.95)", fontSize: 11 }}>
            ❓ {counts.question} Question{counts.question === 1 ? "" : "s"}
          </li>
        )}
        {counts.insightNoReply > 0 && (
          <li style={{ color: "rgba(74,222,128,0.85)", fontSize: 11 }}>
            💡 {counts.insightNoReply} Insight{counts.insightNoReply === 1 ? "" : "s"}
          </li>
        )}
      </ul>

      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.45)" }}>
        Oldest: {relTime(oldest.created_at)}
        {oldest.question_number ? ` — Q${oldest.question_number}` : ""}
      </div>
    </section>
  );
}
