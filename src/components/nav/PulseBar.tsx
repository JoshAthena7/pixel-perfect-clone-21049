import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type PulseState = "idle" | "team" | "oracle" | "sos";

export function PulseBar() {
  const [state, setState] = useState<PulseState>("idle");
  const [teamFlash, setTeamFlash] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let oracleActive = false;
    let sosActive = false;
    let lastTeamSeen = new Date().toISOString();

    const resolve = () => {
      if (cancelled) return;
      if (sosActive) setState("sos");
      else if (oracleActive) setState("oracle");
      // team handled via teamFlash timer
      else setState((s) => (s === "team" ? "team" : "idle"));
    };

    const checkTeam = async () => {
      const since = new Date(Date.now() - 30_000).toISOString();
      const { data } = await supabase
        .from("mission_assist_events")
        .select("id, created_at")
        .gt("created_at", lastTeamSeen)
        .gte("created_at", since)
        .limit(1);
      if (cancelled) return;
      if (data && data.length > 0) {
        lastTeamSeen = data[0].created_at;
        setTeamFlash((n) => n + 1);
      }
    };

    const checkOracle = async () => {
      const { data } = await supabase
        .from("oracle_ingestion_queue")
        .select("id")
        .in("status", ["pending", "classifying"])
        .limit(1);
      if (cancelled) return;
      oracleActive = !!(data && data.length > 0);
      resolve();
    };

    const checkSos = async () => {
      const since = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
      const { data: raised } = await supabase
        .from("mission_assist_events")
        .select("question_id, created_at")
        .eq("event_type", "sos_raised")
        .gte("created_at", since);
      if (cancelled) return;
      if (!raised || raised.length === 0) {
        sosActive = false;
        resolve();
        return;
      }
      const qIds = raised.map((r: any) => r.question_id).filter(Boolean);
      if (qIds.length === 0) {
        sosActive = false;
        resolve();
        return;
      }
      const { data: acked } = await supabase
        .from("mission_assist_events")
        .select("question_id")
        .eq("event_type", "sos_acknowledged")
        .in("question_id", qIds);
      const ackSet = new Set((acked || []).map((a: any) => a.question_id));
      sosActive = raised.some((r: any) => r.question_id && !ackSet.has(r.question_id));
      resolve();
    };

    checkTeam();
    checkOracle();
    checkSos();
    const t1 = setInterval(checkTeam, 15_000);
    const t2 = setInterval(checkOracle, 30_000);
    const t3 = setInterval(checkSos, 60_000);

    return () => {
      cancelled = true;
      clearInterval(t1);
      clearInterval(t2);
      clearInterval(t3);
    };
  }, []);

  // Team flash: show "team" briefly when not overridden
  useEffect(() => {
    if (teamFlash === 0) return;
    setState((s) => (s === "sos" || s === "oracle" ? s : "team"));
    const t = setTimeout(() => {
      setState((s) => (s === "team" ? "idle" : s));
    }, 2000);
    return () => clearTimeout(t);
  }, [teamFlash]);

  return (
    <div
      aria-hidden
      className="pulse-bar"
      data-state={state}
    />
  );
}
