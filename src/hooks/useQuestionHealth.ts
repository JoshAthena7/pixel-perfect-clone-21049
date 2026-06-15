import { useCallback, useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { recalcMissionHealth } from "@/lib/atlas-health.functions";

/**
 * Triggers a health recalculation for one mission's questions.
 *
 * Fires on:
 *  - mount (user opens the view)
 *  - window focus (user comes back to the tab)
 *
 * Does NOT use setInterval. Health is event-driven.
 *
 * After a successful recalc, invalidates the standard
 * ["mission-questions", missionId] React-Query key so any list
 * subscribed to that key refetches the new health_status values.
 */
export function useQuestionHealthRefresh(missionId: string | null | undefined) {
  const qc = useQueryClient();
  const recalc = useServerFn(recalcMissionHealth);
  const lastRunRef = useRef(0);

  const triggerRefresh = useCallback(async () => {
    if (!missionId) return null;
    // De-dupe rapid back-to-back triggers (mount + focus on the same render)
    const now = Date.now();
    if (now - lastRunRef.current < 1500) return null;
    lastRunRef.current = now;

    try {
      const res = await recalc({ data: { missionId, onlyStale: true } });
      if (res.processed > 0) {
        qc.invalidateQueries({ queryKey: ["mission-questions", missionId] });
        qc.invalidateQueries({ queryKey: ["question-health", missionId] });
      }
      return res;
    } catch (err) {
      console.error("[useQuestionHealthRefresh] failed", err);
      return null;
    }
  }, [missionId, qc, recalc]);

  useEffect(() => {
    if (!missionId) return;
    void triggerRefresh();
    const onFocus = () => void triggerRefresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [missionId, triggerRefresh]);

  return { triggerRefresh };
}
