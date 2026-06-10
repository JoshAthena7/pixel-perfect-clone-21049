/**
 * IRIS context: tracks where the user is, so the IRIS Dock + brief
 * can build a mission-aware system prompt and proactively message
 * when context changes.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";

export type IrisCtxState = {
  current_page: string;
  current_mission_id: string | null;
  current_section_id: string | null;
  current_question_id: string | null;
  current_question_text: string | null;
  current_question_number: string | null;
  current_section_name: string | null;
};

type IrisCtxApi = IrisCtxState & {
  setMission: (id: string | null) => void;
  setSection: (id: string | null, name?: string | null) => void;
  setQuestion: (id: string | null, text?: string | null, number?: string | null) => void;
};

const IrisContext = createContext<IrisCtxApi | null>(null);

export function IrisProvider({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [mission, setMissionId] = useState<string | null>(null);
  const [section, setSectionState] = useState<{ id: string | null; name: string | null }>({ id: null, name: null });
  const [question, setQuestionState] = useState<{ id: string | null; text: string | null; number: string | null }>({
    id: null, text: null, number: null,
  });

  // Auto-derive mission id from URL when on an /olympus/missions/:id route.
  useEffect(() => {
    const m = path.match(/\/olympus\/missions\/([^/?#]+)/);
    setMissionId((prev) => {
      const next = m ? m[1] : null;
      if (next !== prev && next !== "new") {
        // Reset section/question scope when mission changes.
        setSectionState({ id: null, name: null });
        setQuestionState({ id: null, text: null, number: null });
      }
      return next && next !== "new" ? next : prev;
    });
  }, [path]);

  const setMission = useCallback((id: string | null) => setMissionId(id), []);
  const setSection = useCallback((id: string | null, name: string | null = null) => setSectionState({ id, name }), []);
  const setQuestion = useCallback(
    (id: string | null, text: string | null = null, number: string | null = null) =>
      setQuestionState({ id, text, number }),
    [],
  );

  const value = useMemo<IrisCtxApi>(() => ({
    current_page: path,
    current_mission_id: mission,
    current_section_id: section.id,
    current_section_name: section.name,
    current_question_id: question.id,
    current_question_text: question.text,
    current_question_number: question.number,
    setMission,
    setSection,
    setQuestion,
  }), [path, mission, section.id, section.name, question.id, question.text, question.number, setMission, setSection, setQuestion]);

  return <IrisContext.Provider value={value}>{children}</IrisContext.Provider>;
}

export function useIris(): IrisCtxApi {
  const v = useContext(IrisContext);
  if (!v) throw new Error("useIris must be used inside <IrisProvider>");
  return v;
}

/** Convenient label for the dock header. */
export function getPageLabel(path: string): string {
  if (path === "/olympus/flight-deck") return "Flight Deck";
  if (path.startsWith("/olympus/missions/") && path.includes("/wizard")) return "Mission Setup";
  if (/\/olympus\/missions\/[^/]+$/.test(path)) return "Mission Command Center";
  if (path === "/olympus/missions") return "Missions";
  if (path.startsWith("/admin")) return "Admin";
  if (path.startsWith("/home")) return "Home";
  if (path.startsWith("/profile")) return "Profile";
  return path;
}
