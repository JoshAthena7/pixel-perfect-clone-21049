/**
 * IRIS context: tracks where the user is, so the IRIS panel + brief
 * can build a mission-aware system prompt and proactively message
 * when context changes.
 *
 * Also resolves a lightweight "mission summary" (short code, state,
 * submission date, days remaining, signal count, finalized/total)
 * whenever the active mission changes. The IRIS panel reads this so
 * its header, grounding indicator, and mission stamp never have to
 * re-query and never fall back to showing the URL path.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export type IrisMissionSummary = {
  missionId: string;
  fullName: string;
  shortCode: string;
  stateCode: string;
  submissionDate: string | null;
  daysToSubmission: number | null;
  approvedSignals: number;
  totalQuestions: number;
  finalizedQuestions: number;
};

export type IrisCtxState = {
  current_page: string;
  current_mission_id: string | null;
  current_section_id: string | null;
  current_question_id: string | null;
  current_question_text: string | null;
  current_question_number: string | null;
  current_section_name: string | null;
  mission_summary: IrisMissionSummary | null;
};

type IrisCtxApi = IrisCtxState & {
  setMission: (id: string | null) => void;
  setSection: (id: string | null, name?: string | null) => void;
  setQuestion: (id: string | null, text?: string | null, number?: string | null) => void;
};

const IrisContext = createContext<IrisCtxApi | null>(null);

/** Match every URL shape that owns a missionId. */
function extractMissionId(path: string): string | null {
  // Primary mission routes: /missions/<id>/...
  let m = path.match(/^\/missions\/([0-9a-f-]{8,})(?:\/|$|\?|#)/i);
  if (m) return m[1];
  // Legacy / alternate: /olympus/missions/<id>
  m = path.match(/\/olympus\/missions\/([0-9a-f-]{8,})/i);
  if (m) return m[1];
  // Wizard: /olympus/wizard/<id>
  m = path.match(/\/olympus\/wizard\/([0-9a-f-]{8,})/i);
  if (m) return m[1];
  // Admin mission detail
  m = path.match(/\/admin\/missions\/([0-9a-f-]{8,})/i);
  if (m) return m[1];
  return null;
}

export function IrisProvider({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [mission, setMissionId] = useState<string | null>(null);
  const [missionSummary, setMissionSummary] = useState<IrisMissionSummary | null>(null);
  const [section, setSectionState] = useState<{ id: string | null; name: string | null }>({ id: null, name: null });
  const [question, setQuestionState] = useState<{ id: string | null; text: string | null; number: string | null }>({
    id: null, text: null, number: null,
  });

  // Auto-derive mission id from URL across every mission-scoped route.
  useEffect(() => {
    const next = extractMissionId(path);
    setMissionId((prev) => {
      if (next !== prev && next !== "new") {
        setSectionState({ id: null, name: null });
        setQuestionState({ id: null, text: null, number: null });
      }
      return next && next !== "new" ? next : prev;
    });
  }, [path]);

  // Resolve mission summary whenever the active mission changes.
  useEffect(() => {
    let cancelled = false;
    if (!mission) { setMissionSummary(null); return; }
    (async () => {
      try {
        const [missionRes, sigRes, qRes] = await Promise.all([
          supabase.from("missions").select("name,state,blast_off_at").eq("id", mission).maybeSingle(),
          supabase.from("oracle_signals").select("id", { count: "exact", head: true })
            .eq("mission_id", mission).in("status", ["approved", "pushed"]),
          supabase.from("questions").select("status").eq("mission_id", mission),
        ]);
        if (cancelled) return;
        const mm = missionRes.data as { name?: string | null; state?: string | null; blast_off_at?: string | null } | null;
        const fullName = mm?.name ?? "Unknown Mission";
        const shortCode = (fullName.split(/[-—:]/)[0] ?? fullName).trim().slice(0, 24) || "Mission";
        const stateCode = (mm?.state ?? "—").toString().slice(0, 6).toUpperCase();
        const sub = mm?.blast_off_at ?? null;
        const days = sub ? Math.ceil((new Date(sub).getTime() - Date.now()) / 86_400_000) : null;
        const qs = (qRes.data ?? []) as Array<{ status: string | null }>;
        const total = qs.length;
        const finalized = qs.filter((q) => q.status === "finalized" || q.status === "submitted").length;
        setMissionSummary({
          missionId: mission,
          fullName,
          shortCode,
          stateCode,
          submissionDate: sub,
          daysToSubmission: days,
          approvedSignals: sigRes.count ?? 0,
          totalQuestions: total,
          finalizedQuestions: finalized,
        });
      } catch (err) {
        if (!cancelled) console.warn("[IRIS] mission summary resolve failed:", err);
      }
    })();
    return () => { cancelled = true; };
  }, [mission]);

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
    mission_summary: missionSummary,
    setMission,
    setSection,
    setQuestion,
  }), [path, mission, section.id, section.name, question.id, question.text, question.number, missionSummary, setMission, setSection, setQuestion]);

  return <IrisContext.Provider value={value}>{children}</IrisContext.Provider>;
}

export function useIris(): IrisCtxApi {
  const v = useContext(IrisContext);
  if (!v) throw new Error("useIris must be used inside <IrisProvider>");
  return v;
}

/** Convenient label for the panel header when no mission is active. */
export function getPageLabel(path: string): string {
  if (path === "/olympus/flight-deck") return "Flight Deck";
  if (path.startsWith("/olympus/wizard")) return "Mission Setup";
  if (path.startsWith("/olympus/missions/") && path.includes("/wizard")) return "Mission Setup";
  if (/^\/missions\/[^/]+\/briefing/.test(path)) return "Briefing Room";
  if (/^\/missions\/[^/]+\/flight-deck/.test(path)) return "Mission Flight Deck";
  if (/^\/missions\/[^/]+\/intelligence/.test(path)) return "Intelligence";
  if (/^\/missions\/[^/]+\/oracle/.test(path)) return "ORACLE";
  if (/^\/missions\/[^/]+\/team/.test(path)) return "Team";
  if (/^\/missions\/[^/]+\/health/.test(path)) return "Mission Health";
  if (/^\/missions\/[^/]+\/qa/.test(path)) return "Questions";
  if (/^\/missions\/[^/]+\/journey/.test(path)) return "Mission Journey";
  if (/^\/missions\/[^/]+\/?$/.test(path)) return "Mission Command Center";
  if (/\/olympus\/missions\/[^/]+$/.test(path)) return "Mission Command Center";
  if (path === "/olympus/missions" || path === "/missions") return "Missions";
  if (path.startsWith("/admin")) return "Admin";
  if (path.startsWith("/home")) return "Home";
  if (path.startsWith("/profile")) return "Profile";
  return "ATLAS";
}
