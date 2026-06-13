// Centralized writer for the new entity-first intel architecture.
//
// All IRIS generators (sweep, thread extraction, score-gap, mission close,
// competitor intel, etc.) call writeIntelEvent / writeIntelEvents to record
// intelligence in intel_events. Writes are fire-and-forget: failures are
// logged to the server console and never surfaced to callers. This keeps
// the UI fast and never blocks on the new pipeline while the old
// insights/signals tables continue to receive writes for backward
// compatibility.

export type IntelEventInput = {
  mission_id: string;
  event_type:
    | "sweep_legislative"
    | "sweep_stakeholder"
    | "sweep_competitive"
    | "sweep_procurement"
    | "sweep_regulatory"
    | "sweep_mission_risk"
    | "sweep_research"
    | "thread_extraction"
    | "score_gap"
    | "mission_close_lesson"
    | "mission_close_competitor"
    | "mission_close_summary"
    | "competitor_intel"
    | "manual"
    | string;
  title: string;
  content: string;
  confidence?: "high" | "medium" | "low" | null;
  generated_by?: string | null;
  tags?: string[];
  entity_refs?: string[];
  source_entity_id?: string | null;
};

export function writeIntelEvent(input: IntelEventInput): void {
  // Truly fire-and-forget: we intentionally do not return the promise.
  void (async () => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin.from("intel_events").insert({
        mission_id: input.mission_id,
        event_type: input.event_type,
        title: (input.title ?? "").slice(0, 280),
        content: (input.content ?? "").slice(0, 4000),
        confidence: input.confidence ?? null,
        generated_by: input.generated_by ?? "iris",
        tags: input.tags ?? [],
        entity_refs: input.entity_refs ?? [],
        source_entity_id: input.source_entity_id ?? null,
      });
      if (error) console.error("[intel-events] insert failed:", error.message);
    } catch (e) {
      console.error("[intel-events] unexpected write failure:", e);
    }
  })();
}

export function writeIntelEvents(inputs: IntelEventInput[]): void {
  if (!inputs.length) return;
  void (async () => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const rows = inputs.map((i) => ({
        mission_id: i.mission_id,
        event_type: i.event_type,
        title: (i.title ?? "").slice(0, 280),
        content: (i.content ?? "").slice(0, 4000),
        confidence: i.confidence ?? null,
        generated_by: i.generated_by ?? "iris",
        tags: i.tags ?? [],
        entity_refs: i.entity_refs ?? [],
        source_entity_id: i.source_entity_id ?? null,
      }));
      const { error } = await supabaseAdmin.from("intel_events").insert(rows);
      if (error) console.error("[intel-events] bulk insert failed:", error.message);
    } catch (e) {
      console.error("[intel-events] unexpected bulk write failure:", e);
    }
  })();
}
