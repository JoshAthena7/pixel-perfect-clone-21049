import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const PulseInput = z.object({
  missionId: z.string().uuid(),
  changed: z.string().trim().max(2000).optional().default(""),
  blocked: z.string().trim().max(2000).optional().default(""),
  confidence: z.enum(["low", "medium", "high"]),
});

export type MissionPulseRow = {
  id: string;
  mission_id: string;
  user_id: string | null;
  signal_title: string;
  signal_summary: string | null;
  severity: "info" | "warning" | "critical";
  created_at: string;
  // Parsed from summary
  payload?: {
    changed: string;
    blocked: string;
    confidence: "low" | "medium" | "high";
    author?: string;
  };
};

const CONFIDENCE_TO_SEVERITY = {
  low: "critical",
  medium: "warning",
  high: "info",
} as const;

export const submitMissionPulse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => PulseInput.parse(input))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Author display name
    const { data: prof } = await supabase
      .from("profiles")
      .select("display_name,email")
      .eq("id", userId)
      .maybeSingle();
    const author = prof?.display_name || prof?.email || "Team member";

    const summary = {
      changed: data.changed ?? "",
      blocked: data.blocked ?? "",
      confidence: data.confidence,
      author,
    };

    // Headline for the IRIS alert bar
    const headline =
      data.blocked && data.blocked.length > 0
        ? `Blocker reported: ${data.blocked.slice(0, 140)}`
        : data.changed && data.changed.length > 0
          ? `New intel: ${data.changed.slice(0, 140)}`
          : `Pulse · confidence ${data.confidence}`;

    const { data: row, error } = await supabaseAdmin
      .from("signals")
      .insert({
        mission_id: data.missionId,
        user_id: userId,
        source_module: "daily_pulse",
        signal_type: "mission_pulse",
        signal_title: headline,
        signal_summary: JSON.stringify(summary),
        severity: CONFIDENCE_TO_SEVERITY[data.confidence],
        status: "open",
        created_by_system: false,
        tags: ["daily-pulse", `confidence-${data.confidence}`],
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    // Log to Vault under the mission's Tier-2 record
    try {
      await supabaseAdmin.from("mission_vault_documents").insert({
        mission_id: data.missionId,
        uploaded_by: userId,
        uploaded_by_name: author,
        title: `Daily Pulse · ${new Date().toLocaleDateString()}`,
        description: headline,
        doc_type: "other",
        category: "daily_pulse_tier2",
        extracted_text: JSON.stringify(summary, null, 2),
        extraction_status: "skipped",
      });
    } catch {
      // Vault schema may differ; do not fail the pulse if archival fails.
    }

    return { id: row?.id, headline };
  });

export const getLatestMissionPulse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ missionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("signals")
      .select("id,mission_id,user_id,signal_title,signal_summary,severity,created_at")
      .eq("mission_id", data.missionId)
      .eq("source_module", "daily_pulse")
      .eq("signal_type", "mission_pulse")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!row) return null;
    let payload: MissionPulseRow["payload"] | undefined;
    try {
      payload = row.signal_summary ? JSON.parse(row.signal_summary) : undefined;
    } catch {
      payload = undefined;
    }
    return { ...row, payload } as MissionPulseRow;
  });

export const getMissionPulseHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ missionId: z.string().uuid(), limit: z.number().min(1).max(90).optional() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("signals")
      .select("id,signal_summary,severity,created_at")
      .eq("mission_id", data.missionId)
      .eq("source_module", "daily_pulse")
      .eq("signal_type", "mission_pulse")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 30);
    return (rows ?? []).map((r) => {
      let payload: any = null;
      try { payload = r.signal_summary ? JSON.parse(r.signal_summary) : null; } catch {}
      return {
        id: r.id,
        created_at: r.created_at,
        severity: r.severity,
        confidence: (payload?.confidence ?? null) as "low" | "medium" | "high" | null,
      };
    });
  });
