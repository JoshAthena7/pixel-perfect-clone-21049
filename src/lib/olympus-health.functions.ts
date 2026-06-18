/**
 * Olympus Health column server functions — admin-only.
 *
 *   - getBriefingCoverage(missionId): questions + per-layer link counts
 *   - getPipelineHealth(): scrape / classify / promote timestamps + queue depths
 *   - getIrisUsage(missionId): per-layer brief coverage stats
 *   - getTopIntelligence(missionId): top approved/pushed signals by relevance
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertAdmin(context: { supabase: { rpc: Function }; userId: string }) {
  const { data, error } = await (context.supabase as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: boolean | null; error: unknown }>;
  }).rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (error) throw new Error("role check failed");
  if (!data) throw new Error("Forbidden — admin role required");
}

const MissionInput = z.object({ missionId: z.string().uuid().nullable().optional() });

// Layer mapping per spec, against the actual qil.briefing_layer enum
// (regulatory|compliance|evidence|environmental|win_theme|content_map)
export const LAYER_MAP = {
  decode: ["regulatory", "compliance"],
  win_angle: ["win_theme", "content_map", "environmental"],
  evidence: ["evidence"],
  risk: ["regulatory", "environmental"],
} as const;

function bucketFor(layer: string | null): Array<keyof typeof LAYER_MAP> {
  const out: Array<keyof typeof LAYER_MAP> = [];
  if (!layer) return out;
  for (const k of Object.keys(LAYER_MAP) as Array<keyof typeof LAYER_MAP>) {
    if ((LAYER_MAP[k] as readonly string[]).includes(layer)) out.push(k);
  }
  return out;
}

export const getBriefingCoverage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => MissionInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (!data.missionId) return { questions: [], totals: { covered: 0, total: 0 } };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: qs }, { data: links }] = await Promise.all([
      supabaseAdmin
        .from("mission_questions")
        .select("id, question_number, question_text")
        .eq("mission_id", data.missionId)
        .eq("is_withdrawn", false)
        .order("question_number", { ascending: true }),
      supabaseAdmin
        .from("question_intel_links")
        .select("question_id, briefing_layer, signal_id")
        .eq("mission_id", data.missionId)
        .eq("is_suppressed", false),
    ]);

    type Counts = Record<keyof typeof LAYER_MAP, number>;
    const byQ = new Map<string, Counts>();
    for (const l of links ?? []) {
      const row = l as { question_id: string; briefing_layer: string | null };
      const c = byQ.get(row.question_id) ?? { decode: 0, win_angle: 0, evidence: 0, risk: 0 };
      for (const b of bucketFor(row.briefing_layer)) c[b] += 1;
      byQ.set(row.question_id, c);
    }

    const questions = (qs ?? []).map((q) => {
      const row = q as { id: string; question_number: string | null; question_text: string | null };
      const c = byQ.get(row.id) ?? { decode: 0, win_angle: 0, evidence: 0, risk: 0 };
      return {
        id: row.id,
        number: row.question_number,
        text: row.question_text ?? "",
        counts: c,
      };
    });
    const covered = questions.filter((q) =>
      q.counts.decode + q.counts.win_angle + q.counts.evidence + q.counts.risk > 0,
    ).length;
    return { questions, totals: { covered, total: questions.length } };
  });

export const getPipelineHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [sourcesQ, queueQ, signalsQ] = await Promise.all([
      supabaseAdmin
        .from("oracle_source_registry")
        .select("id, status, last_checked_at"),
      supabaseAdmin
        .from("oracle_ingestion_queue")
        .select("status, ingested_at, classified_at, promoted_at")
        .order("ingested_at", { ascending: false })
        .limit(2000),
      supabaseAdmin
        .from("oracle_signals")
        .select("created_at, status")
        .in("status", ["approved", "pushed"])
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    const sources = sourcesQ.data ?? [];
    const queue = (queueQ.data ?? []) as Array<{
      status: string;
      ingested_at: string;
      classified_at: string | null;
      promoted_at: string | null;
    }>;

    let lastScrape: string | null = null;
    let lastClassify: string | null = null;
    let lastPromote: string | null = null;
    let classifiedCount = 0;
    let dismissedCount = 0;
    let promotedCount = 0;
    let queuedCount = 0;
    const queueByStatus: Record<string, number> = {};
    for (const r of queue) {
      queueByStatus[r.status] = (queueByStatus[r.status] ?? 0) + 1;
      if (!lastScrape || r.ingested_at > lastScrape) lastScrape = r.ingested_at;
      if (r.classified_at && (!lastClassify || r.classified_at > lastClassify))
        lastClassify = r.classified_at;
      if (r.promoted_at && (!lastPromote || r.promoted_at > lastPromote))
        lastPromote = r.promoted_at;
      if (r.classified_at) classifiedCount += 1;
      if (r.status === "dismissed") dismissedCount += 1;
      if (r.promoted_at) promotedCount += 1;
      if (r.status === "pending") queuedCount += 1;
    }

    // Source-side last_checked_at can be more accurate
    for (const s of sources as Array<{ last_checked_at: string | null }>) {
      if (s.last_checked_at && (!lastScrape || s.last_checked_at > lastScrape))
        lastScrape = s.last_checked_at;
    }

    const failingSources = sources.filter(
      (s) => (s as { status: string }).status === "error",
    ).length;

    return {
      lastScrape,
      lastClassify,
      lastPromote,
      sourcesCount: sources.length,
      queuedCount,
      classifiedCount,
      dismissedCount,
      promotedCount,
      alertsCount: (signalsQ.data ?? []).length,
      queue: {
        pending: queueByStatus["pending"] ?? 0,
        classifying: queueByStatus["classifying"] ?? 0,
        errors: queueByStatus["error"] ?? 0,
      },
      failingSources,
    };
  });

export const getIrisUsage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => MissionInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (!data.missionId)
      return {
        perLayer: { decode: 0, win_angle: 0, evidence: 0, risk: 0 },
        totalQuestions: 0,
        briefsThisWeek: 0,
        distinctSignals: 0,
        totalLinks: 0,
        briefedQuestions: 0,
      };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();

    const [{ data: links }, { count: totalQ }, { data: recent }] = await Promise.all([
      supabaseAdmin
        .from("question_intel_links")
        .select("question_id, briefing_layer, signal_id")
        .eq("mission_id", data.missionId)
        .eq("is_suppressed", false),
      supabaseAdmin
        .from("mission_questions")
        .select("id", { count: "exact", head: true })
        .eq("mission_id", data.missionId)
        .eq("is_withdrawn", false),
      supabaseAdmin
        .from("question_intel_links")
        .select("question_id")
        .eq("mission_id", data.missionId)
        .gte("created_at", weekAgo),
    ]);

    const perLayer: Record<keyof typeof LAYER_MAP, Set<string>> = {
      decode: new Set(),
      win_angle: new Set(),
      evidence: new Set(),
      risk: new Set(),
    };
    const distinctSignals = new Set<string>();
    const briefedQs = new Set<string>();
    for (const l of (links ?? []) as Array<{
      question_id: string;
      briefing_layer: string | null;
      signal_id: string | null;
    }>) {
      briefedQs.add(l.question_id);
      if (l.signal_id) distinctSignals.add(l.signal_id);
      for (const b of bucketFor(l.briefing_layer)) perLayer[b].add(l.question_id);
    }
    const weekQs = new Set<string>();
    for (const r of (recent ?? []) as Array<{ question_id: string }>) weekQs.add(r.question_id);

    return {
      perLayer: {
        decode: perLayer.decode.size,
        win_angle: perLayer.win_angle.size,
        evidence: perLayer.evidence.size,
        risk: perLayer.risk.size,
      },
      totalQuestions: totalQ ?? 0,
      briefsThisWeek: weekQs.size,
      distinctSignals: distinctSignals.size,
      totalLinks: (links ?? []).length,
      briefedQuestions: briefedQs.size,
    };
  });

export const getTopIntelligence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => MissionInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let q = supabaseAdmin
      .from("oracle_signals")
      .select(
        "id, title, summary, source_name, relevance_score, status, metadata, taxonomy_node_ids",
      )
      .in("status", ["approved", "pushed"])
      .order("relevance_score", { ascending: false })
      .limit(8);
    if (data.missionId) {
      q = q.or(`mission_id.eq.${data.missionId},mission_id.is.null`);
    }
    const { data: signals, error } = await q;
    if (error) throw error;

    const ids = (signals ?? []).map((s) => (s as { id: string }).id);
    const usage = new Map<string, number>();
    if (ids.length > 0) {
      const { data: links } = await supabaseAdmin
        .from("question_intel_links")
        .select("signal_id, question_id")
        .in("signal_id", ids);
      const tmp = new Map<string, Set<string>>();
      for (const l of (links ?? []) as Array<{ signal_id: string; question_id: string }>) {
        if (!tmp.has(l.signal_id)) tmp.set(l.signal_id, new Set());
        tmp.get(l.signal_id)!.add(l.question_id);
      }
      for (const [k, v] of tmp) usage.set(k, v.size);
    }

    return {
      signals: (signals ?? []).map((s) => {
        const row = s as {
          id: string;
          title: string;
          summary: string | null;
          source_name: string | null;
          relevance_score: number;
          status: string;
          metadata: Record<string, unknown> | null;
        };
        return {
          ...row,
          usage_count: usage.get(row.id) ?? 0,
          source_url:
            (row.metadata as { source_url?: string } | null)?.source_url ?? null,
        };
      }),
    };
  });
