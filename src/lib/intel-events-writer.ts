// Centralized writer for the new entity-first intel architecture.
//
// All IRIS generators (sweep, thread extraction, score-gap, mission close,
// competitor intel, etc.) call writeIntelEvent / writeIntelEvents to record
// intelligence in intel_events. Writes are fire-and-forget: failures are
// logged to the server console and never surfaced to callers.
//
// When an event is written with significance = "high", a background IRIS
// evaluation is fired against the current Mission Brief sections to detect
// whether the new intel materially affects the brief. The UI never blocks
// on this.

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
    | "rfp_parse"
    | string;
  title: string;
  content: string;
  confidence?: "high" | "medium" | "low" | null;
  significance?: "high" | "medium" | "low" | null;
  generated_by?: string | null;
  tags?: string[];
  entity_refs?: string[];
  source_entity_id?: string | null;
};

function rowFor(input: IntelEventInput) {
  return {
    mission_id: input.mission_id,
    event_type: input.event_type,
    title: (input.title ?? "").slice(0, 280),
    content: (input.content ?? "").slice(0, 4000),
    confidence: input.confidence ?? null,
    significance: input.significance ?? null,
    generated_by: input.generated_by ?? "iris",
    tags: input.tags ?? [],
    entity_refs: input.entity_refs ?? [],
    source_entity_id: input.source_entity_id ?? null,
  };
}

async function maybeEvaluateForBrief(input: IntelEventInput, id: string | null) {
  if (input.significance !== "high" || !id) return;
  try {
    const { triggerBriefImpactEvaluation } = await import("@/lib/iris-evaluate-brief-impact.server");
    triggerBriefImpactEvaluation({
      missionId: input.mission_id,
      intelEventId: id,
      title: input.title ?? "",
      content: input.content ?? "",
    });
  } catch (e) {
    console.error("[intel-events] brief-impact dispatch failed", e);
  }
}

export function writeIntelEvent(input: IntelEventInput): void {
  void (async () => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data, error } = await supabaseAdmin
        .from("intel_events")
        .insert(rowFor(input) as any)
        .select("id")
        .single();
      if (error) {
        console.error("[intel-events] insert failed:", error.message);
        return;
      }
      await maybeEvaluateForBrief(input, (data as { id: string } | null)?.id ?? null);
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
      const rows = inputs.map(rowFor);
      const { data, error } = await supabaseAdmin
        .from("intel_events")
        .insert(rows as any)
        .select("id");
      if (error) {
        console.error("[intel-events] bulk insert failed:", error.message);
        return;
      }
      const ids = ((data ?? []) as { id: string }[]).map((r) => r.id);
      inputs.forEach((input, idx) => {
        void maybeEvaluateForBrief(input, ids[idx] ?? null);
      });
    } catch (e) {
      console.error("[intel-events] unexpected bulk write failure:", e);
    }
  })();
}
