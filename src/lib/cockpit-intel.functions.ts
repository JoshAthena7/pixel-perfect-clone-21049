/**
 * Cockpit intel — small read-only server fns that the WriterCockpit
 * auto-calls when a question expands.
 *
 * 1) getQuestionSignals — top 3 ORACLE signals for the question.
 *    Prefers question_intel_links (confirmed, not suppressed, by relevance);
 *    falls back to mission-level top oracle_score when no links exist.
 *
 * 2) getQuestionCompetitorAngle — per-competitor 1–2 sentence angle for
 *    each competitor in mission_iris_config.known_competitors. Best-effort,
 *    no caching, soft-fail.
 *
 * 3) countUnreadWhispers — for a list of (mission_id, question_id) pairs,
 *    counts mission_assist_events of whisper-like types created after the
 *    current user's last question_views row for that question. Used by
 *    My Work cards to render a pulsing ⚡ badge.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const WHISPER_EVENT_TYPES = ["whisper", "iris_whisper", "iris_alert", "iris_nudge"] as const;

/* ────────────────────────── SIGNALS ────────────────────────── */

const SignalsInput = z.object({
  missionId: z.string().uuid(),
  questionId: z.string().uuid(),
});

export type CockpitSignal = {
  id: string;
  title: string;
  summary: string | null;
  why_it_matters: string | null;
  signal_type: string | null;
  oracle_score: number | null;
  source_name: string | null;
  url?: string | null;
};

export const getQuestionSignals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SignalsInput.parse(d))
  .handler(async ({ data, context }): Promise<{ signals: CockpitSignal[]; source: "linked" | "mission" }> => {
    const { supabase } = context;

    // 1) Prefer explicitly linked signals.
    const { data: links } = await supabase
      .from("question_intel_links")
      .select("signal_id, relevance_score, is_critical")
      .eq("mission_id", data.missionId)
      .eq("question_id", data.questionId)
      .eq("is_suppressed", false)
      .order("is_critical", { ascending: false })
      .order("relevance_score", { ascending: false, nullsFirst: false })
      .limit(3);

    let signalIds: string[] = (links ?? []).map((l: any) => l.signal_id).filter(Boolean);
    let source: "linked" | "mission" = "linked";

    // 2) Fallback to mission-level top by oracle_score.
    if (signalIds.length === 0) {
      source = "mission";
      const { data: ms } = await supabase
        .from("oracle_signals")
        .select("id")
        .eq("mission_id", data.missionId)
        .in("status", ["approved", "pushed"])
        .order("oracle_score", { ascending: false, nullsFirst: false })
        .limit(3);
      signalIds = (ms ?? []).map((s: any) => s.id);
    }

    if (signalIds.length === 0) return { signals: [], source };

    const { data: rows } = await supabase
      .from("oracle_signals")
      .select("id, title, summary, why_it_matters, signal_type, oracle_score, source_name, metadata")
      .in("id", signalIds);

    // Re-order by signalIds order
    const byId = new Map<string, any>((rows ?? []).map((r: any) => [r.id, r]));
    const signals: CockpitSignal[] = signalIds
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((r: any) => ({
        id: r.id,
        title: r.title ?? "(untitled signal)",
        summary: r.summary ?? null,
        why_it_matters: r.why_it_matters ?? null,
        signal_type: r.signal_type ?? null,
        oracle_score: typeof r.oracle_score === "number" ? r.oracle_score : null,
        source_name: r.source_name ?? null,
        url: r.metadata?.url ?? r.metadata?.source_url ?? null,
      }));

    return { signals, source };
  });

/* ────────────────────────── COMPETITOR ANGLE ────────────────────────── */

const AngleInput = z.object({
  missionId: z.string().uuid(),
  questionId: z.string().uuid(),
});

export type CompetitorAngle = {
  name: string;
  angle: string;
  ok: boolean;
};

export const getQuestionCompetitorAngle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AngleInput.parse(d))
  .handler(async ({ data, context }): Promise<{ competitors: CompetitorAngle[] }> => {
    const { supabase } = context;
    const [{ data: cfg }, { data: q }, { data: mission }] = await Promise.all([
      supabase.from("mission_iris_config").select("known_competitors").eq("mission_id", data.missionId).maybeSingle(),
      supabase.from("mission_questions").select("question_number, question_text").eq("id", data.questionId).maybeSingle(),
      supabase.from("missions").select("name, state, client_name, agency_name, program_type").eq("id", data.missionId).maybeSingle(),
    ]);

    const rawList = (cfg as any)?.known_competitors;
    const names: string[] = Array.isArray(rawList)
      ? rawList
          .map((c) => (typeof c === "string" ? c : (c as any)?.name ?? ""))
          .filter((n: string) => n && n.trim().length > 0)
          .slice(0, 5)
      : [];

    if (names.length === 0) return { competitors: [] };

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { competitors: names.map((name) => ({ name, angle: "Intel unavailable — gateway not configured.", ok: false })) };
    }

    const m = mission as any;
    const qq = q as any;
    const context_line = `Mission: ${m?.name ?? "?"} | Client: ${m?.client_name ?? m?.agency_name ?? "?"} | State: ${m?.state ?? "?"} | Program: ${m?.program_type ?? "?"} | Question ${qq?.question_number ?? ""}: ${qq?.question_text ?? ""}`;

    const results: CompetitorAngle[] = await Promise.all(
      names.map(async (name): Promise<CompetitorAngle> => {
        const prompt = `${context_line}\n\nCompetitor: ${name}.\n\nIn 1–2 sentences, what angle is ${name} most likely to push on THIS specific question, and what is their most exploitable weakness on it? Be specific, no fluff, plain text only.`;
        try {
          const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [{ role: "user", content: prompt }],
              temperature: 0.3,
              max_tokens: 220,
            }),
            signal: AbortSignal.timeout(20_000),
          });
          if (res.status === 429) return { name, angle: "Rate limited — try again shortly.", ok: false };
          if (res.status === 402) return { name, angle: "AI credits exhausted.", ok: false };
          if (!res.ok) return { name, angle: "Intel loading…", ok: false };
          const j = await res.json();
          const text: string = j?.choices?.[0]?.message?.content?.trim() ?? "";
          return { name, angle: text || "No angle available.", ok: !!text };
        } catch {
          return { name, angle: "Intel loading…", ok: false };
        }
      }),
    );

    return { competitors: results };
  });

/* ────────────────────────── UNREAD WHISPERS ────────────────────────── */

const WhispersInput = z.object({
  pairs: z
    .array(
      z.object({
        missionId: z.string().uuid(),
        questionId: z.string().uuid(),
      }),
    )
    .min(1)
    .max(100),
});

export const countUnreadWhispers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => WhispersInput.parse(d))
  .handler(async ({ data, context }): Promise<{ counts: Record<string, number> }> => {
    const { supabase, userId } = context;
    const questionIds = Array.from(new Set(data.pairs.map((p) => p.questionId)));

    // Last viewed per question (for this user)
    const { data: views } = await supabase
      .from("question_views")
      .select("question_id, viewed_at")
      .eq("user_id", userId)
      .in("question_id", questionIds);
    const viewedBy: Record<string, string> = {};
    for (const v of (views ?? []) as Array<{ question_id: string; viewed_at: string }>) {
      const prev = viewedBy[v.question_id];
      if (!prev || new Date(v.viewed_at).getTime() > new Date(prev).getTime()) {
        viewedBy[v.question_id] = v.viewed_at;
      }
    }

    // Pull whisper-like events for these questions
    const { data: events } = await supabase
      .from("mission_assist_events")
      .select("question_id, created_at")
      .in("question_id", questionIds)
      .in("event_type", WHISPER_EVENT_TYPES as unknown as string[]);

    const counts: Record<string, number> = {};
    for (const qid of questionIds) counts[qid] = 0;
    for (const e of (events ?? []) as Array<{ question_id: string; created_at: string }>) {
      const cutoff = viewedBy[e.question_id];
      if (!cutoff || new Date(e.created_at).getTime() > new Date(cutoff).getTime()) {
        counts[e.question_id] = (counts[e.question_id] ?? 0) + 1;
      }
    }
    return { counts };
  });
