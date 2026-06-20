/**
 * Compact badge showing unresolved sticky-note count for a question.
 *
 * Reads from useMissionNoteCounts() (single mission-wide query) and renders
 * a colored pill positioned absolutely in the top-right of a parent card.
 * Drop into any question card with a position:relative container.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type NoteCountEntry = {
  total: number;
  hasBlocker: boolean;
  hasQuestion: boolean;
};

export type NoteCountMap = Record<string, NoteCountEntry>;

export function useMissionNoteCounts(missionId: string | null) {
  return useQuery<NoteCountMap>({
    queryKey: ["question-note-counts", missionId],
    enabled: !!missionId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("question_notes")
        .select("question_id, note_type")
        .eq("mission_id", missionId!)
        .eq("is_resolved", false)
        .is("reply_to_note_id", null);
      if (error) throw error;
      const map: NoteCountMap = {};
      for (const row of (data ?? []) as { question_id: string; note_type: string }[]) {
        const entry = (map[row.question_id] ??= {
          total: 0,
          hasBlocker: false,
          hasQuestion: false,
        });
        entry.total += 1;
        if (row.note_type === "blocker") entry.hasBlocker = true;
        if (row.note_type === "question") entry.hasQuestion = true;
      }
      return map;
    },
  });
}

export function QuestionNoteBadge({ entry }: { entry: NoteCountEntry | undefined }) {
  if (!entry || entry.total === 0) return null;
  const variant = entry.hasBlocker
    ? { color: "rgba(248,113,113,0.95)", bg: "rgba(248,113,113,0.15)", icon: "🚧" }
    : entry.hasQuestion
      ? { color: "rgba(96,165,250,0.95)", bg: "rgba(96,165,250,0.15)", icon: "❓" }
      : { color: "rgba(196,154,43,0.95)", bg: "rgba(196,154,43,0.15)", icon: "📌" };

  return (
    <span
      title={`${entry.total} unresolved note${entry.total === 1 ? "" : "s"}`}
      style={{
        position: "absolute",
        top: 6,
        right: 6,
        minWidth: 22,
        height: 18,
        padding: "0 5px",
        background: variant.bg,
        border: `1px solid ${variant.color}`,
        color: variant.color,
        fontSize: 8,
        fontWeight: 700,
        borderRadius: 9,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        lineHeight: 1,
      }}
    >
      <span>{variant.icon}</span>
      <span>{entry.total}</span>
    </span>
  );
}
