/**
 * IRIS Quick Intel Console — admin / engagement-lead triage tool.
 *
 * Given a mission and a plain-English question, builds a mission-scoped
 * context bundle (mission basics + win config + top ORACLE signals via
 * hybrid_oracle_search) and asks the AI gateway for a strict bullet-format
 * answer with source references.
 *
 * Server-only. Auth-gated: must be platform admin OR engagement_lead /
 * lead / project_manager on the mission.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { callAI } from "@/lib/ai-model-router.server";
import { generateEmbedding, toPgVector } from "@/lib/embeddings.server";

const PM_ROLES = new Set(["admin", "lead", "engagement_lead", "project_manager"]);

async function assertConsoleAccess(supabase: any, userId: string, missionId: string) {
  const { data: adminRow } = await supabase
    .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (adminRow) return true;
  const { data: memberRow } = await supabase
    .from("mission_team_members").select("mission_role")
    .eq("member_id", userId).eq("mission_id", missionId).maybeSingle();
  const role = (memberRow?.mission_role as string | null) ?? "";
  if (PM_ROLES.has(role)) return true;
  throw new Error("Forbidden: IRIS Quick Intel is admin / engagement-lead only.");
}

/* ────────────────────────── STATUS ────────────────────────── */

const StatusInput = z.object({ missionId: z.string().uuid() });

export const getQuickIntelStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => StatusInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertConsoleAccess(supabase, userId, data.missionId);

    const [missionR, docsR, signalsR, pipelineR, sosR] = await Promise.all([
      supabase.from("missions")
        .select("id,name,state_code,submission_deadline,metadata")
        .eq("id", data.missionId).maybeSingle(),
      supabase.from("mission_documents")
        .select("id", { head: true, count: "exact" })
        .eq("mission_id", data.missionId)
        .eq("processing_status", "processed"),
      supabase.from("oracle_signals")
        .select("id", { head: true, count: "exact" })
        .eq("mission_id", data.missionId)
        .in("status", ["approved", "pushed"]),
      supabase.from("mission_questions")
        .select("status", { count: "exact" })
        .eq("mission_id", data.missionId),
      supabase.from("mission_assist_events")
        .select("id", { head: true, count: "exact" })
        .eq("mission_id", data.missionId)
        .eq("event_type", "sos_raised")
        .gte("created_at", new Date(Date.now() - 4 * 3600_000).toISOString()),
    ]);

    const mission = missionR.data;
    const total = pipelineR.count ?? 0;
    // Cheap aggregate: re-query just the counts we need
    const [{ count: finalizedCount }, { count: unstartedCount }] = await Promise.all([
      supabase.from("mission_questions")
        .select("id", { head: true, count: "exact" })
        .eq("mission_id", data.missionId).eq("status", "ready"),
      supabase.from("mission_questions")
        .select("id", { head: true, count: "exact" })
        .eq("mission_id", data.missionId).in("status", ["not_started", "unstarted", "todo"]),
    ]);

    const deadlineIso = (mission as any)?.submission_deadline ?? null;
    const daysToSubmission = deadlineIso
      ? Math.ceil((new Date(deadlineIso).getTime() - Date.now()) / 86_400_000)
      : null;

    return {
      missionId: data.missionId,
      missionName: mission?.name ?? null,
      shortCode: (mission as any)?.metadata?.short_code ?? null,
      stateCode: (mission as any)?.state_code ?? null,
      daysToSubmission,
      docsProcessed: docsR.count ?? 0,
      oracleSignals: signalsR.count ?? 0,
      totalQuestions: total,
      finalized: finalizedCount ?? 0,
      unstarted: unstartedCount ?? 0,
      sosActive: sosR.count ?? 0,
      lastUpdatedIso: new Date().toISOString(),
    };
  });

/* ────────────────────────── ASK ────────────────────────── */

const AskInput = z.object({
  missionId: z.string().uuid(),
  query: z.string().min(2).max(500),
});

const SYSTEM_PROMPT = `You are IRIS, the intelligence analyst for Athena Strategy Group.
You are briefing an engagement lead in real time — they need fast, specific, actionable bullets.

RULES:
- Respond in this EXACT format and no other:

⚡ [2-4 word answer headline]

- [Bullet 1 — specific finding, 1-2 sentences max]
  ↳ Source: [source name] · [section if known]
- [Bullet 2]
  ↳ Source: [source name] · [section if known]
- [Bullet 3]
  ↳ Source: [source name] · [section if known]

⚠ Watch: [one risk or complication]

- Maximum 5 bullets. No paragraphs. No fluff.
- Every bullet is a specific finding, not a generic observation.
- Every bullet cites a source from the MISSION CONTEXT or ORACLE INTELLIGENCE below — use the source_name field. Do not invent sources.
- If ORACLE has no relevant data for a point, omit that point instead of inventing one.
- End with one "⚠ Watch:" line flagging the most important risk. If nothing is at risk, write "⚠ Watch: No new risks surfaced for this question."
- Total response under 250 words.
- Do not start with "Based on" or "According to" — start with the headline.`;

export const askIrisQuickIntel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AskInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertConsoleAccess(supabase, userId, data.missionId);

    // Mission basics + win config in parallel.
    const [missionR, configR] = await Promise.all([
      supabase.from("missions")
        .select("name,state_code,submission_deadline,metadata")
        .eq("id", data.missionId).maybeSingle(),
      supabase.from("oracle_engagement_config")
        .select("north_star,win_themes,evaluator_lens,central_claim")
        .eq("mission_id", data.missionId).maybeSingle(),
    ]);

    // Top ORACLE signals via hybrid search; fall back to keyword/score order.
    let signals: any[] = [];
    try {
      const embedding = await generateEmbedding(data.query).catch(() => null);
      const { data: sigData } = await supabase.rpc("hybrid_oracle_search", {
        p_mission_id: data.missionId,
        p_query_text: data.query,
        p_query_embedding: embedding ? toPgVector(embedding) : null,
        p_limit: 8,
      });
      signals = Array.isArray(sigData) ? sigData : [];
    } catch (_e) {
      const { data: sigData } = await supabase.from("oracle_signals")
        .select("id,title,what_happened,why_it_matters,recommended_action,category,relevance_score,source_name")
        .eq("mission_id", data.missionId)
        .in("status", ["approved", "pushed", "needs_review"])
        .order("relevance_score", { ascending: false })
        .limit(8);
      signals = sigData ?? [];
    }

    const mission = missionR.data as any;
    const config = configR.data as any;
    const winThemes = Array.isArray(config?.win_themes) ? config.win_themes.slice(0, 3) : [];

    const missionContext = [
      `Mission: ${mission?.name ?? "Unknown"}`,
      `State: ${mission?.state_code ?? "—"}`,
      `Submission: ${mission?.submission_deadline ?? "—"}`,
      `North Star: ${config?.north_star ?? "Not set"}`,
      `Central Claim: ${config?.central_claim ?? "Not set"}`,
      `Win Themes: ${winThemes.map((t: any) => t?.title ?? t).filter(Boolean).join(" | ") || "Not set"}`,
      `Evaluator Lens: ${config?.evaluator_lens ?? "Not set"}`,
    ].join("\n");

    const oracleContext = signals.length
      ? signals.map((s: any, i: number) => {
          const src = s.source_name ?? s.source ?? "ORACLE";
          return `${i + 1}. [${s.category ?? "signal"}] ${s.title} — ${s.what_happened ?? ""} ${s.why_it_matters ? `(Why: ${s.why_it_matters})` : ""} [source_name: ${src}]`;
        }).join("\n")
      : "No ORACLE signals loaded yet for this mission.";

    const userPrompt = [
      `MISSION CONTEXT:\n${missionContext}`,
      ``,
      `ORACLE INTELLIGENCE (top signals):\n${oracleContext}`,
      ``,
      `QUESTION: ${data.query}`,
    ].join("\n");

    const { content, model } = await callAI("chat_response", SYSTEM_PROMPT, userPrompt, {
      maxTokens: 700,
      temperature: 0.3,
    });

    return {
      answer: content,
      model,
      groundedOn: {
        oracleSignals: signals.length,
        winThemes: winThemes.length,
        hasNorthStar: Boolean(config?.north_star),
      },
      generatedAt: new Date().toISOString(),
    };
  });
