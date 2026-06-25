import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PulseEvent {
  id: string;
  icon: string;
  text: string;
  time: string;
  href: string;
  iconColor: string;
  // Navigation hints for tanstack router
  to: string;
  params: Record<string, string>;
}

const CATEGORY_COLORS: Record<string, string> = {
  regulatory_federal: "rgba(248,113,113,0.9)",
  regulatory_state: "rgba(248,113,113,0.8)",
  policy_innovation: "rgba(251,191,36,0.9)",
  quality_performance: "rgba(96,165,250,0.8)",
  field_intelligence: "rgba(74,222,128,0.8)",
  competitive_landscape: "rgba(96,165,250,0.9)",
  evidence_base: "rgba(167,139,250,0.8)",
  health_outcomes_sdoh: "rgba(74,222,128,0.7)",
  default: "rgba(196,154,43,0.9)",
};

function formatAssistEvent(event: any, missionId: string): PulseEvent | null {
  const meta = event.metadata || {};
  const qNum = meta.question_number ? `Q${meta.question_number}` : "a question";
  const baseId = event.id || `${event.event_type}-${event.created_at}`;

  switch (event.event_type) {
    case "brief_exported":
      return {
        id: baseId,
        icon: "↓",
        text: `Brief exported for ${qNum}`,
        time: event.created_at,
        href: `/missions/${missionId}/flight-deck`,
        iconColor: "rgba(255,255,255,0.5)",
        to: "/missions/$missionId/flight-deck",
        params: { missionId },
      };
    case "sos_raised":
      return {
        id: baseId,
        icon: "⚠",
        text: `Help needed on ${qNum}`,
        time: event.created_at,
        href: `/missions/${missionId}/war-room`,
        iconColor: "rgba(248,113,113,0.9)",
        to: "/missions/$missionId/war-room",
        params: { missionId },
      };
    default:
      return null;
  }
}


function formatSignalEvent(signal: any, missionId: string): PulseEvent {
  const title = signal.title || "Untitled signal";
  const truncatedTitle = title.length > 65 ? title.substring(0, 65) + "…" : title;

  return {
    id: signal.id,
    icon: "⚡",
    text: `New intel — "${truncatedTitle}"`,
    time: signal.updated_at || signal.created_at,
    href: `/missions/${missionId}/olympus`,
    iconColor: CATEGORY_COLORS[signal.category] || CATEGORY_COLORS.default,
    to: "/missions/$missionId/olympus",
    params: { missionId },
  };
}

export function useMissionPulse(missionId: string) {
  const [events, setEvents] = useState<PulseEvent[]>([]);
  const [isLive, setIsLive] = useState(false);

  const addEvent = useCallback((event: PulseEvent) => {
    setEvents((prev) => {
      if (prev.some((e) => e.id === event.id)) return prev;
      return [event, ...prev].slice(0, 40);
    });
  }, []);

  useEffect(() => {
    if (!missionId) return;
    let cancelled = false;

    async function loadInitial() {
      const [assistRes, signalRes] = await Promise.all([
        supabase
          .from("mission_assist_events")
          .select("*")
          .eq("mission_id", missionId)
          .in("event_type", [
            "brief_exported",
            "check_in",
            "sticky_note_posted",
            "sos_raised",
            "status_updated",
          ])
          .order("created_at", { ascending: false })
          .limit(25),
        supabase
          .from("oracle_signals")
          .select("id, title, category, relevance_score, updated_at, created_at")
          .eq("mission_id", missionId)
          .eq("status", "approved")
          .order("updated_at", { ascending: false })
          .limit(15),
      ]);

      const assistEvents = ((assistRes.data || []) as any[])
        .map((e) => formatAssistEvent(e, missionId))
        .filter((e): e is PulseEvent => !!e);

      const signalEvents = ((signalRes.data || []) as any[]).map((s) =>
        formatSignalEvent(s, missionId),
      );

      const merged = [...assistEvents, ...signalEvents]
        .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
        .slice(0, 40);

      if (!cancelled) setEvents(merged);
    }

    loadInitial();

    const channel = supabase
      .channel(`mission-pulse-${missionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "mission_assist_events",
          filter: `mission_id=eq.${missionId}`,
        },
        (payload) => {
          const formatted = formatAssistEvent(payload.new, missionId);
          if (formatted) addEvent(formatted);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "oracle_signals",
          filter: `mission_id=eq.${missionId}`,
        },
        (payload) => {
          const next = payload.new as any;
          const prev = payload.old as any;
          if (next?.status === "approved" && prev?.status !== "approved") {
            addEvent(formatSignalEvent(next, missionId));
          }
        },
      )
      .subscribe((status) => {
        setIsLive(status === "SUBSCRIBED");
      });

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
      setIsLive(false);
    };
  }, [missionId, addEvent]);

  return { events, isLive };
}
