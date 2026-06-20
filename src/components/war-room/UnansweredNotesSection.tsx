/**
 * Unanswered Notes — header section for the IRIS Alerts panel.
 * Surfaces unresolved QUESTION and BLOCKER sticky notes oldest-first
 * so leads can act on them from ATC.
 */
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

type Row = {
  id: string;
  note_type: "question" | "blocker";
  content: string;
  created_at: string;
  question_id: string;
  question_number: string | null;
};

function hoursAgoLabel(iso: string) {
  const h = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}m unanswered`;
  if (h < 48) return `${Math.round(h)}h unanswered`;
  return `${Math.round(h / 24)}d unanswered`;
}

function escalationColor(iso: string) {
  const h = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  if (h < 12) return "rgba(255,255,255,0.45)";
  if (h < 24) return "rgba(251,191,36,0.85)";
  return "rgba(248,113,113,0.95)";
}

export function UnansweredNotesSection({ missionId }: { missionId: string }) {
  const navigate = useNavigate();
  const { data } = useQuery<Row[]>({
    queryKey: ["unanswered-notes", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("question_notes")
        .select(
          "id, note_type, content, created_at, question_id, mission_questions!inner(question_number)",
        )
        .eq("mission_id", missionId)
        .eq("is_resolved", false)
        .in("note_type", ["question", "blocker"])
        .is("reply_to_note_id", null)
        .order("created_at", { ascending: true });
      return (
        ((data ?? []) as Array<{
          id: string;
          note_type: Row["note_type"];
          content: string;
          created_at: string;
          question_id: string;
          mission_questions: { question_number: string | null } | null;
        }>).map((r) => ({
          id: r.id,
          note_type: r.note_type,
          content: r.content,
          created_at: r.created_at,
          question_id: r.question_id,
          question_number: r.mission_questions?.question_number ?? null,
        }))
      );
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  if (!data || data.length === 0) return null;

  return (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{
          color: "rgba(255,255,255,0.55)",
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          marginBottom: 6,
          paddingLeft: 3,
        }}
      >
        Unanswered Notes ({data.length})
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
        {data.map((n) => {
          const isBlocker = n.note_type === "blocker";
          const color = isBlocker ? "rgba(248,113,113,0.95)" : "rgba(96,165,250,0.95)";
          const truncated = n.content.length > 80 ? n.content.slice(0, 80) + "…" : n.content;
          return (
            <li
              key={n.id}
              className="rounded border border-white/10 bg-white/[0.02] p-3"
              style={{ borderLeft: `3px solid ${color}` }}
            >
              <div
                style={{
                  color,
                  fontSize: 8,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                }}
              >
                {isBlocker ? "🚧 Blocker" : "❓ Question"}
              </div>
              <div style={{ marginTop: 4, color: "rgba(255,255,255,0.9)", fontSize: 11 }}>
                Q{n.question_number ?? "?"} — {truncated}
              </div>
              <div
                style={{
                  marginTop: 4,
                  fontSize: 9,
                  fontStyle: "italic",
                  color: escalationColor(n.created_at),
                }}
              >
                {hoursAgoLabel(n.created_at)}
              </div>
              <div style={{ marginTop: 6, display: "flex", gap: 12 }}>
                <button
                  onClick={() =>
                    navigate({
                      to: "/missions/$missionId/flight-deck",
                      params: { missionId },
                      hash: n.question_id,
                    })
                  }
                  className="text-[11px] font-medium hover:underline"
                  style={{ color, background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
                >
                  Reply →
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
