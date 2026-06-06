// GAP 1 — notification helpers for events that require server-side detection
// (deadlines, derived health thresholds). Both functions are idempotent and
// safe to invoke repeatedly from pg_cron or admin-triggered refreshes.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const HEALTH_DROP_THRESHOLD = 60;

const MissionInput = z.object({ missionId: z.string().uuid() });

/**
 * Scan open client clarifications across a mission. For any unresolved item
 * whose due_date is within 48 hours, emit a `clarification_deadline` signal.
 * Dedupes against existing signals fired in the last 24 hours per item.
 */
export const notifyClarificationDeadlines = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => MissionInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const now = Date.now();
    const horizon = new Date(now + 48 * 60 * 60 * 1000).toISOString();

    const { data: items } = await supabase
      .from("client_clarifications")
      .select("id,number,question,due_date,status")
      .eq("mission_id", data.missionId)
      .not("status", "in", "(answered,closed,withdrawn)")
      .not("due_date", "is", null)
      .lt("due_date", horizon);

    const due = (items ?? []) as Array<{
      id: string;
      number: number | null;
      question: string | null;
      due_date: string;
      status: string | null;
    }>;
    if (due.length === 0) return { fired: 0 };

    // Dedupe — skip items we already alerted on in the last 24h.
    const sinceIso = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const { data: recent } = await supabase
      .from("signals")
      .select("signal_summary,created_at")
      .eq("mission_id", data.missionId)
      .eq("signal_type", "clarification_deadline")
      .gte("created_at", sinceIso);
    const alreadyAlerted = new Set(
      (recent ?? []).map((r) => String((r as { signal_summary: string }).signal_summary).split("::")[0] ?? ""),
    );

    let fired = 0;
    for (const item of due) {
      if (alreadyAlerted.has(item.id)) continue;
      const hours = Math.max(0, Math.round((new Date(item.due_date).getTime() - now) / (60 * 60 * 1000)));
      const { error } = await supabase.from("signals").insert({
        mission_id: data.missionId,
        source_module: "clarifications",
        signal_type: "clarification_deadline",
        signal_title: `Clarification #${item.number ?? "?"} due in ${hours}h`,
        signal_summary: `${item.id}::${(item.question ?? "").slice(0, 200)}`,
        severity: hours <= 24 ? "high" : "warning",
        tags: ["clarification", "deadline"],
        created_by_system: true,
      });
      if (!error) fired += 1;
    }
    return { fired };
  });

/**
 * Compare current IRIS / mission health score against the most recent prior
 * snapshot. When it crosses below 60%, emit `iris_health_drop`. Stores the
 * latest snapshot as a system signal to allow next-run comparison without
 * needing a dedicated table.
 */
export const checkMissionHealthDrop = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    MissionInput.extend({ currentScore: z.number().min(0).max(100) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: prior } = await supabase
      .from("signals")
      .select("confidence,created_at")
      .eq("mission_id", data.missionId)
      .eq("signal_type", "iris_health_snapshot")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const previous = prior ? Number((prior as { confidence: number }).confidence) * 100 : null;
    const crossed = previous != null && previous >= HEALTH_DROP_THRESHOLD && data.currentScore < HEALTH_DROP_THRESHOLD;

    // Always store the new snapshot for next comparison.
    await supabase.from("signals").insert({
      mission_id: data.missionId,
      source_module: "iris_health",
      signal_type: "iris_health_snapshot",
      signal_title: `Mission health snapshot: ${Math.round(data.currentScore)}%`,
      confidence: data.currentScore / 100,
      severity: "info",
      tags: ["snapshot", "system"],
      created_by_system: true,
    });

    if (!crossed) return { fired: false, previous, current: data.currentScore };

    await supabase.from("signals").insert({
      mission_id: data.missionId,
      source_module: "iris_health",
      signal_type: "iris_health_drop",
      signal_title: `Mission health dropped to ${Math.round(data.currentScore)}%`,
      signal_summary: `Previous: ${Math.round(previous!)}% → Current: ${Math.round(data.currentScore)}% (threshold ${HEALTH_DROP_THRESHOLD}%)`,
      severity: "high",
      confidence: data.currentScore / 100,
      tags: ["health", "alert"],
      recommended_action: "Investigate sections with red health and unassigned writers.",
      created_by_system: true,
    });
    return { fired: true, previous, current: data.currentScore };
  });
