// Server-only helper: recompute Line of Sight in-process.
// Same logic as the `buildLineOfSight` server fn handler, but callable
// directly from another server-fn handler (e.g. after a Thread decision).
import type { SupabaseClient } from "@supabase/supabase-js";

const DECISION_TYPES = ["decision", "iris_decision"];

type AIConnection = {
  question_id_a: string;
  question_id_b: string;
  connection_type: "related_theme" | "win_theme_alignment" | "shared_oracle_intel" | "decision_conflict";
  iris_rationale: string;
  confidence: "high" | "medium" | "low";
};
type AIConflict = {
  question_id_a: string;
  question_id_b: string;
  conflict_description: string;
  detected_from: string;
  severity: "high" | "medium";
};
type AIIntelRel = { question_id: string; relevant_feed_item_ids: string[]; iris_note: string };

async function callAI(apiKey: string, system: string, user: string): Promise<string> {
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!r.ok) throw new Error(`gateway ${r.status}`);
  const j = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return j.choices?.[0]?.message?.content?.trim() ?? "";
}

export async function buildLineOfSightInternal(missionId: string): Promise<{ connections: number; conflicts: number; updatedQuestions: number }> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    console.warn("[line-of-sight] LOVABLE_API_KEY missing; skipping recompute");
    return { connections: 0, conflicts: 0, updatedQuestions: 0 };
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const sb = supabaseAdmin as unknown as SupabaseClient;

  const { data: mission } = await sb.from("missions").select("id, name").eq("id", missionId).maybeSingle();
  if (!mission) return { connections: 0, conflicts: 0, updatedQuestions: 0 };

  const { data: sections } = await sb.from("mission_sections").select("id, name").eq("mission_id", missionId);
  const sectionName = new Map<string, string>(
    (sections ?? []).map((s: { id: string; name: string | null }) => [s.id, s.name ?? "Section"]),
  );

  const { data: questions } = await sb
    .from("mission_questions")
    .select("id, section_id, question_number, question_text")
    .eq("mission_id", missionId);
  const qs = (questions ?? []) as Array<{ id: string; section_id: string | null; question_number: string | null; question_text: string | null }>;
  if (qs.length < 2) return { connections: 0, conflicts: 0, updatedQuestions: 0 };

  const { data: strategy } = await sb
    .from("mission_win_strategy")
    .select("win_themes, north_star_message, central_claim")
    .eq("mission_id", missionId)
    .maybeSingle();

  const { data: decisions } = await sb
    .from("thread_messages")
    .select("id, question_id, message_body, message_type, created_at")
    .eq("mission_id", missionId)
    .in("message_type", DECISION_TYPES)
    .order("created_at", { ascending: false })
    .limit(200);

  const { data: feed } = await sb
    .from("intelligence_feed_items")
    .select("id, headline, category, iris_assessment, iris_relevance_score")
    .eq("mission_id", missionId)
    .eq("is_dismissed", false)
    .order("iris_relevance_score", { ascending: false })
    .limit(10);

  const validIds = new Set(qs.map((q) => q.id));
  const validFeedIds = new Set(((feed ?? []) as Array<{ id: string }>).map((f) => f.id));

  const system =
    "You are IRIS. Analyze RFP question text, team-captured decisions, and IRIS intelligence to: " +
    "(1) identify question pairs that are thematically connected, " +
    "(2) flag genuine conflicts between decisions captured in different questions' Threads, " +
    "(3) map specific IRIS intelligence items to specific questions. " +
    "You are analyzing question text and decisions ONLY — never draft content. " +
    'Return STRICT JSON: {"connections":[...],"conflicts":[...],"question_intel_relevance":[...]}. ' +
    "Use only ids provided. Max 15 connections, 8 conflicts.";

  const userMsg = JSON.stringify({
    mission: { name: mission.name },
    win_themes: strategy?.win_themes ?? null,
    north_star: strategy?.north_star_message ?? null,
    central_claim: strategy?.central_claim ?? null,
    questions: qs.map((q) => ({
      id: q.id,
      section: q.section_id ? sectionName.get(q.section_id) ?? null : null,
      number: q.question_number,
      text: (q.question_text ?? "").slice(0, 800),
    })),
    decisions: ((decisions ?? []) as Array<{ question_id: string; message_body: string | null; created_at: string }>).map((d) => ({
      question_id: d.question_id,
      decision_text: (d.message_body ?? "").slice(0, 600),
      at: d.created_at,
    })),
    oracle_intel: ((feed ?? []) as Array<{ id: string; headline: string; category: string; iris_assessment: string | null }>).map((f) => ({
      id: f.id,
      headline: f.headline,
      category: f.category,
      assessment: (f.iris_assessment ?? "").slice(0, 280),
    })),
  });

  let parsed: { connections?: AIConnection[]; conflicts?: AIConflict[]; question_intel_relevance?: AIIntelRel[] } = {};
  try {
    parsed = JSON.parse(await callAI(apiKey, system, userMsg));
  } catch (e) {
    console.error("[line-of-sight] AI failure:", e);
    return { connections: 0, conflicts: 0, updatedQuestions: 0 };
  }

  const connRows = (parsed.connections ?? [])
    .filter((c) => c && validIds.has(c.question_id_a) && validIds.has(c.question_id_b) && c.question_id_a !== c.question_id_b)
    .slice(0, 15)
    .map((c) => ({
      mission_id: missionId,
      question_id_a: c.question_id_a,
      question_id_b: c.question_id_b,
      connection_type: c.connection_type,
      iris_rationale: (c.iris_rationale ?? "").slice(0, 300),
      confidence: c.confidence ?? "medium",
    }));
  let connectionsWritten = 0;
  if (connRows.length) {
    const { error } = await sb
      .from("question_connections")
      .upsert(connRows, { onConflict: "question_id_a,question_id_b,connection_type", ignoreDuplicates: false });
    if (!error) connectionsWritten = connRows.length;
  }

  let conflictsWritten = 0;
  const conflictsIn = (parsed.conflicts ?? [])
    .filter((c) => c && validIds.has(c.question_id_a) && validIds.has(c.question_id_b) && c.question_id_a !== c.question_id_b)
    .slice(0, 8);
  if (conflictsIn.length) {
    const { data: existing } = await sb
      .from("conflict_flags")
      .select("question_id_a, question_id_b")
      .eq("mission_id", missionId)
      .eq("resolved", false);
    const existingSet = new Set(
      ((existing ?? []) as Array<{ question_id_a: string; question_id_b: string }>).map((e) => [e.question_id_a, e.question_id_b].sort().join("|")),
    );
    const fresh = conflictsIn.filter((c) => !existingSet.has([c.question_id_a, c.question_id_b].sort().join("|")));
    if (fresh.length) {
      const { error } = await sb.from("conflict_flags").insert(
        fresh.map((c) => ({
          mission_id: missionId,
          question_id_a: c.question_id_a,
          question_id_b: c.question_id_b,
          conflict_description: c.conflict_description.slice(0, 2000),
          detected_from: (c.detected_from ?? "").slice(0, 1000),
          severity: c.severity ?? "medium",
        })),
      );
      if (!error) conflictsWritten = fresh.length;
    }
  }

  let updatedQuestions = 0;
  for (const rel of parsed.question_intel_relevance ?? []) {
    if (!rel || !validIds.has(rel.question_id)) continue;
    const ids = (rel.relevant_feed_item_ids ?? []).filter((id) => validFeedIds.has(id)).slice(0, 5);
    const { error } = await sb
      .from("mission_questions")
      .update({ relevant_feed_item_ids: ids, iris_intel_note: (rel.iris_note ?? "").slice(0, 150) || null })
      .eq("id", rel.question_id);
    if (!error) updatedQuestions++;
  }

  return { connections: connectionsWritten, conflicts: conflictsWritten, updatedQuestions };
}
