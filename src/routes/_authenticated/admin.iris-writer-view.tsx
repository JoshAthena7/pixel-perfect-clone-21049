/**
 * Admin · IRIS Writer View
 * Curated, writer-facing IntelligenceBrief shown side-by-side with a
 * mission + question picker. Lets platform admins QA exactly what writers
 * see on the Flight Deck without impersonating a writer.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { IrisIntelligenceBrief } from "@/components/iris/IrisIntelligenceBrief";

export const Route = createFileRoute("/_authenticated/admin/iris-writer-view")({
  component: IrisWriterViewPage,
});

type MissionRow = { id: string; name: string | null; client_name: string | null };
type QuestionRow = {
  id: string;
  question_number: string | null;
  question_text: string | null;
  section_id: string | null;
  iris_brief_status: string | null;
  is_inferred: boolean | null;
};

function IrisWriterViewPage() {
  const [missionId, setMissionId] = useState<string>("");
  const [questionId, setQuestionId] = useState<string>("");

  const { data: missions } = useQuery({
    queryKey: ["admin-iris-writer-view-missions"],
    queryFn: async (): Promise<MissionRow[]> => {
      const { data } = await supabase
        .from("missions")
        .select("id, name, client_name")
        .order("created_at", { ascending: false })
        .limit(200);
      return (data ?? []) as MissionRow[];
    },
  });

  const { data: questions } = useQuery({
    queryKey: ["admin-iris-writer-view-questions", missionId],
    enabled: !!missionId,
    queryFn: async (): Promise<QuestionRow[]> => {
      const { data } = await supabase
        .from("mission_questions")
        .select("id, question_number, question_text, section_id, iris_brief_status, is_inferred")
        .eq("mission_id", missionId)
        .eq("is_withdrawn", false)
        .order("question_number", { ascending: true })
        .limit(500);
      return (data ?? []) as QuestionRow[];
    },
  });

  const selectedQuestion = useMemo(
    () => (questions ?? []).find((q) => q.id === questionId) ?? null,
    [questions, questionId],
  );

  return (
    <div className="px-6 py-6 max-w-[1400px] mx-auto">
      <div className="mb-5">
        <h1 className="text-white text-[18px] font-medium">IRIS Writer View</h1>
        <p className="text-[12.5px] text-white/55 mt-1">
          Preview the curated brief writers see on the Flight Deck for any
          mission + question. Read-only QA tool — selections are not saved.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px,1fr] gap-5">
        {/* Picker */}
        <div
          className="rounded-lg p-4 self-start"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <label className="block text-[12px] tracking-wide text-white/55 mb-1.5">
            Mission
          </label>
          <select
            value={missionId}
            onChange={(e) => {
              setMissionId(e.target.value);
              setQuestionId("");
            }}
            className="w-full text-[12.5px] px-2.5 py-2 rounded-md bg-[#0B1224] text-white border border-white/10 focus:outline-none focus:border-white/30"
          >
            <option value="">Select a mission…</option>
            {(missions ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name ?? "Untitled"} {m.client_name ? `· ${m.client_name}` : ""}
              </option>
            ))}
          </select>

          <label className="block text-[12px] tracking-wide text-white/55 mb-1.5 mt-4">
            Question
          </label>
          <select
            value={questionId}
            onChange={(e) => setQuestionId(e.target.value)}
            disabled={!missionId}
            className="w-full text-[12.5px] px-2.5 py-2 rounded-md bg-[#0B1224] text-white border border-white/10 focus:outline-none focus:border-white/30 disabled:opacity-50"
          >
            <option value="">
              {missionId
                ? questions === undefined
                  ? "Loading questions…"
                  : (questions ?? []).length === 0
                    ? "No questions for this mission"
                    : "Select a question…"
                : "Pick a mission first"}
            </option>
            {(questions ?? []).map((q) => (
              <option key={q.id} value={q.id}>
                {q.question_number ?? "?"} — {(q.question_text ?? "").slice(0, 80)}
                {q.is_inferred ? " (inferred)" : ""}
              </option>
            ))}
          </select>

          {selectedQuestion && (
            <div className="mt-4 pt-4 border-t border-white/10 space-y-1.5 text-[11.5px] text-white/60">
              <div>
                <span className="text-white/40">Brief status:</span>{" "}
                <span className="text-white/85">{selectedQuestion.iris_brief_status ?? "—"}</span>
              </div>
              <div>
                <span className="text-white/40">Inferred:</span>{" "}
                <span className="text-white/85">{selectedQuestion.is_inferred ? "yes" : "no"}</span>
              </div>
            </div>
          )}
        </div>

        {/* Curated writer view */}
        <div
          className="rounded-lg p-4 min-h-[400px]"
          style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          {!missionId || !questionId ? (
            <div className="h-full flex items-center justify-center text-[12.5px] text-white/40 italic min-h-[400px]">
              Select a mission and a question to preview the writer's curated brief.
            </div>
          ) : (
            <>
              <div className="mb-3 pb-3 border-b border-white/10">
                <div className="text-[11px] tracking-wide text-white/40 mb-1">
                  Writer Flight Deck preview
                </div>
                {selectedQuestion && (
                  <div className="text-[14px] text-white/85">
                    <span className="text-white/55">{selectedQuestion.question_number}</span>{" "}
                    — {selectedQuestion.question_text}
                  </div>
                )}
              </div>
              <IrisIntelligenceBrief
                missionId={missionId}
                sectionId={selectedQuestion?.section_id ?? null}
                questionId={questionId}
                contextType="flight_deck"
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
