// Line of Sight — intelligence bridge across mission questions.
//
// Design rule: ATLAS NEVER stores or analyzes draft content. Writing happens
// in the client's writing environment (Word/SharePoint/Loopio/etc.). This
// module connects writers through (a) Thread DECISIONS, (b) Oracle
// intelligence, and (c) strategic alignment — never through draft text.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DECISION_TYPES = ["decision", "iris_decision"] as const;

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
type AIIntelRel = {
  question_id: string;
  relevant_feed_item_ids: string[];
  iris_note: string;
};

async function callAI(system: string, user: string): Promise<string> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("IRIS is not configured.");
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
  if (r.status === 402) throw new Error("Workspace is out of AI credits.");
  if (r.status === 429) throw new Error("IRIS is rate limited. Try again shortly.");
  if (!r.ok) throw new Error(`IRIS gateway returned ${r.status}.`);
  const j = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return j.choices?.[0]?.message?.content?.trim() ?? "";
}

/* ===================================================================
 * buildLineOfSight — recompute connections, conflicts, and intel
 * relevance for a mission. Called after BLAST OFF and after any
 * Thread decision message is captured.
 * ================================================================ */
export const buildLineOfSight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ missionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Authorize: any team member of this mission, or admin.
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) {
      const { data: isMember } = await supabase.rpc("is_mission_team_member", {
        _mission_id: data.missionId, _user_id: userId,
      });
      if (!isMember) throw new Error("Forbidden: not a member of this mission.");
    }

    const missionId = data.missionId;

    // Duplicate-run guard: skip if a full-mission scan ran in the last 5 minutes.
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: recent } = await supabase
      .from("question_connections")
      .select("id")
      .eq("mission_id", missionId)
      .gte("created_at", fiveMinAgo)
      .limit(1);
    if (recent && recent.length > 0) {
      console.log(`[buildLineOfSight] already ran recently for mission ${missionId} — skipping`);
      return { connections: 0, conflicts: 0, updatedQuestions: 0, skipped: true };
    }

    // ---- Mission + sections ----
    const { data: mission } = await supabase
      .from("missions")
      .select("id, name")
      .eq("id", missionId)
      .maybeSingle();
    if (!mission) throw new Error("Mission not found.");

    const { data: sections } = await supabase
      .from("mission_sections")
      .select("id, name")
      .eq("mission_id", missionId);
    const sectionName = new Map<string, string>(
      (sections ?? []).map((s) => [s.id as string, (s.name as string) ?? "Section"]),
    );

    const { data: questions } = await supabase
      .from("mission_questions")
      .select("id, section_id, question_number, question_text")
      .eq("mission_id", missionId);
    const qs = questions ?? [];
    if (qs.length < 2) return { connections: 0, conflicts: 0, updatedQuestions: 0 };

    // ---- Win strategy (optional) ----
    const { data: strategy } = await supabase
      .from("mission_win_strategy")
      .select("win_themes, north_star_message, central_claim")
      .eq("mission_id", missionId)
      .maybeSingle();

    // ---- Decision-type Thread messages (the ONLY writer content IRIS reads) ----
    const { data: decisions } = await supabase
      .from("thread_messages")
      .select("id, question_id, message_body, message_type, created_at")
      .eq("mission_id", missionId)
      .in("message_type", DECISION_TYPES as unknown as string[])
      .order("created_at", { ascending: false })
      .limit(200);

    // ---- Top Oracle intel ----
    const { data: feed } = await supabase
      .from("intelligence_feed_items")
      .select("id, headline, category, iris_assessment, iris_relevance_score")
      .eq("mission_id", missionId)
      .eq("is_dismissed", false)
      .order("iris_relevance_score", { ascending: false })
      .limit(10);

    // ---- Prompt ----
    const validIds = new Set(qs.map((q) => q.id as string));
    const validFeedIds = new Set((feed ?? []).map((f) => f.id as string));

    const system =
      "You are IRIS. Analyze RFP question text, team-captured decisions, and IRIS intelligence to: " +
      "(1) identify question pairs that are thematically connected and should reinforce each other, " +
      "(2) flag genuine conflicts between decisions captured in different questions' Threads (numbers that disagree, framings that contradict, commitments that diverge), " +
      "(3) map specific IRIS intelligence items to specific questions where they are directly relevant. " +
      "You are analyzing question text and decisions ONLY — never any draft response/content. " +
      "Return STRICT JSON: " +
      '{"connections":[{"question_id_a":"uuid","question_id_b":"uuid","connection_type":"related_theme|win_theme_alignment|shared_oracle_intel|decision_conflict","iris_rationale":"<=300 chars","confidence":"high|medium|low"}],' +
      '"conflicts":[{"question_id_a":"uuid","question_id_b":"uuid","conflict_description":"<=400 chars","detected_from":"<=300 chars","severity":"high|medium"}],' +
      '"question_intel_relevance":[{"question_id":"uuid","relevant_feed_item_ids":["uuid"],"iris_note":"<=150 chars"}]}. ' +
      "Use ONLY the ids provided. Skip if uncertain. Maximum 15 connections, 8 conflicts.";

    const userMsg = JSON.stringify({
      mission: { name: mission.name },
      win_themes: strategy?.win_themes ?? null,
      north_star: strategy?.north_star_message ?? null,
      central_claim: strategy?.central_claim ?? null,
      questions: qs.map((q) => ({
        id: q.id,
        section: sectionName.get(q.section_id as string) ?? null,
        number: q.question_number,
        text: ((q.question_text as string) ?? "").slice(0, 800),
      })),
      decisions: (decisions ?? []).map((d) => ({
        question_id: d.question_id,
        section: sectionName.get(
          qs.find((q) => q.id === d.question_id)?.section_id as string,
        ) ?? null,
        decision_text: ((d.message_body as string) ?? "").slice(0, 600),
        at: d.created_at,
      })),
      oracle_intel: (feed ?? []).map((f) => ({
        id: f.id,
        headline: f.headline,
        category: f.category,
        assessment: ((f.iris_assessment as string) ?? "").slice(0, 280),
      })),
    });

    let parsed: { connections?: AIConnection[]; conflicts?: AIConflict[]; question_intel_relevance?: AIIntelRel[] } = {};
    try {
      const raw = await callAI(system, userMsg);
      parsed = JSON.parse(raw);
    } catch (e) {
      console.error("[buildLineOfSight] AI failure:", e);
      return { connections: 0, conflicts: 0, updatedQuestions: 0 };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // ---- Connections (upsert; unique on a,b,type) ----
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
      const { error } = await supabaseAdmin
        .from("question_connections")
        .upsert(connRows, { onConflict: "question_id_a,question_id_b,connection_type", ignoreDuplicates: false });
      if (!error) connectionsWritten = connRows.length;
      else console.error("[buildLineOfSight] connection upsert:", error.message);
    }

    // ---- Conflicts (only insert if no matching unresolved one already exists) ----
    let conflictsWritten = 0;
    const conflictsIn = (parsed.conflicts ?? [])
      .filter((c) => c && validIds.has(c.question_id_a) && validIds.has(c.question_id_b) && c.question_id_a !== c.question_id_b)
      .slice(0, 8);
    if (conflictsIn.length) {
      const { data: existing } = await supabaseAdmin
        .from("conflict_flags")
        .select("question_id_a, question_id_b")
        .eq("mission_id", missionId)
        .eq("resolved", false);
      const existingSet = new Set(
        (existing ?? []).map((e) => [e.question_id_a, e.question_id_b].sort().join("|")),
      );
      const fresh = conflictsIn.filter((c) => !existingSet.has([c.question_id_a, c.question_id_b].sort().join("|")));
      if (fresh.length) {
        const { error } = await supabaseAdmin.from("conflict_flags").insert(
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
        else console.error("[buildLineOfSight] conflict insert:", error.message);
      }
    }

    // ---- Per-question intel relevance ----
    let updatedQuestions = 0;
    for (const rel of parsed.question_intel_relevance ?? []) {
      if (!rel || !validIds.has(rel.question_id)) continue;
      const ids = (rel.relevant_feed_item_ids ?? []).filter((id) => validFeedIds.has(id)).slice(0, 5);
      const { error } = await supabaseAdmin
        .from("mission_questions")
        .update({
          relevant_feed_item_ids: ids,
          iris_intel_note: (rel.iris_note ?? "").slice(0, 150) || null,
        })
        .eq("id", rel.question_id);
      if (!error) updatedQuestions++;
    }

    return { connections: connectionsWritten, conflicts: conflictsWritten, updatedQuestions };
  });

/* ===================================================================
 * getLineOfSight — fetch all Line of Sight payload for a question:
 *   - decisions from connected questions (message_type=decision only)
 *   - oracle intel specifically relevant to this question
 *   - unresolved conflicts touching this question
 * ================================================================ */
export const getLineOfSight = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ missionId: z.string().uuid(), questionId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // RLS will scope: only team members or admin can read.
    const { data: thisQ } = await supabase
      .from("mission_questions")
      .select("id, section_id, relevant_feed_item_ids, iris_intel_note")
      .eq("id", data.questionId)
      .maybeSingle();

    const { data: conns } = await supabase
      .from("question_connections")
      .select("id, question_id_a, question_id_b, connection_type, iris_rationale, confidence")
      .eq("mission_id", data.missionId)
      .or(`question_id_a.eq.${data.questionId},question_id_b.eq.${data.questionId}`);

    const otherIds = Array.from(
      new Set(
        (conns ?? []).map((c) =>
          c.question_id_a === data.questionId ? (c.question_id_b as string) : (c.question_id_a as string),
        ),
      ),
    );

    type OtherQ = { id: string; section_id: string | null; question_number: string | null };
    let otherQs: OtherQ[] = [];
    let sectionLabels = new Map<string, string>();
    let decisionsByQ = new Map<string, Array<{ id: string; body: string; created_at: string }>>();

    if (otherIds.length) {
      const { data: qs } = await supabase
        .from("mission_questions")
        .select("id, section_id, question_number")
        .in("id", otherIds);
      otherQs = (qs ?? []) as OtherQ[];

      const secIds = Array.from(new Set(otherQs.map((q) => q.section_id).filter(Boolean) as string[]));
      if (secIds.length) {
        const { data: secs } = await supabase
          .from("mission_sections")
          .select("id, name")
          .in("id", secIds);
        sectionLabels = new Map((secs ?? []).map((s) => [s.id as string, (s.name as string) ?? "Section"]));
      }

      const { data: dec } = await supabase
        .from("thread_messages")
        .select("id, question_id, message_body, created_at")
        .eq("mission_id", data.missionId)
        .in("question_id", otherIds)
        .in("message_type", DECISION_TYPES as unknown as string[])
        .order("created_at", { ascending: false })
        .limit(40);
      for (const d of dec ?? []) {
        const k = d.question_id as string;
        const arr = decisionsByQ.get(k) ?? [];
        if (arr.length < 2) {
          arr.push({ id: d.id as string, body: (d.message_body as string) ?? "", created_at: d.created_at as string });
          decisionsByQ.set(k, arr);
        }
      }
    }

    // Oracle intel for this question
    const feedIds = Array.isArray(thisQ?.relevant_feed_item_ids)
      ? (thisQ!.relevant_feed_item_ids as string[])
      : [];
    let intel: Array<{ id: string; headline: string; category: string; iris_assessment: string | null; source_url: string | null }> = [];
    if (feedIds.length) {
      const { data: items } = await supabase
        .from("intelligence_feed_items")
        .select("id, headline, category, iris_assessment, source_url")
        .in("id", feedIds);
      intel = (items ?? []) as typeof intel;
    }

    // Unresolved conflicts touching this question
    const { data: confs } = await supabase
      .from("conflict_flags")
      .select("id, question_id_a, question_id_b, conflict_description, detected_from, severity, created_at")
      .eq("mission_id", data.missionId)
      .eq("resolved", false)
      .or(`question_id_a.eq.${data.questionId},question_id_b.eq.${data.questionId}`)
      .order("created_at", { ascending: false });

    const otherQById = new Map(otherQs.map((q) => [q.id, q] as const));
    const connectionsPayload = (conns ?? []).map((c) => {
      const otherId = c.question_id_a === data.questionId ? (c.question_id_b as string) : (c.question_id_a as string);
      const otherQ = otherQById.get(otherId);
      return {
        id: c.id as string,
        other_question_id: otherId,
        other_question_number: otherQ?.question_number ?? null,
        other_section_name: otherQ?.section_id ? sectionLabels.get(otherQ.section_id) ?? null : null,
        connection_type: c.connection_type as string,
        iris_rationale: c.iris_rationale as string | null,
        confidence: c.confidence as string,
        decisions: decisionsByQ.get(otherId) ?? [],
      };
    });

    return {
      iris_intel_note: thisQ?.iris_intel_note ?? null,
      connections: connectionsPayload,
      intel,
      conflicts: (confs ?? []).map((c) => ({
        id: c.id as string,
        question_id_a: c.question_id_a as string,
        question_id_b: c.question_id_b as string,
        conflict_description: c.conflict_description as string,
        detected_from: c.detected_from as string | null,
        severity: c.severity as string,
        created_at: c.created_at as string,
      })),
    };
  });

/* ===================================================================
 * resolveConflict — admin marks a conflict as resolved. Posts an IRIS
 * note into both connected questions' Threads.
 * ================================================================ */
export const resolveConflict = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ conflictId: z.string().uuid(), topic: z.string().max(200).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden: admin role required.");

    const { data: conflict, error: cErr } = await supabase
      .from("conflict_flags")
      .select("id, mission_id, question_id_a, question_id_b, resolved")
      .eq("id", data.conflictId)
      .maybeSingle();
    if (cErr || !conflict) throw new Error("Conflict not found.");
    if (conflict.resolved) return { ok: true, alreadyResolved: true };

    const { error: uErr } = await supabase
      .from("conflict_flags")
      .update({ resolved: true, resolved_at: new Date().toISOString(), resolved_by: userId })
      .eq("id", data.conflictId);
    if (uErr) throw new Error(uErr.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const topic = data.topic?.trim() || "this topic";
    const body = `The decision conflict on ${topic} has been resolved. Proceed with the aligned approach.`;
    await supabaseAdmin.from("thread_messages").insert([
      {
        mission_id: conflict.mission_id,
        question_id: conflict.question_id_a,
        sender_id: userId,
        sender_name: "IRIS",
        message_body: body,
        message_type: "iris",
      },
      {
        mission_id: conflict.mission_id,
        question_id: conflict.question_id_b,
        sender_id: userId,
        sender_name: "IRIS",
        message_body: body,
        message_type: "iris",
      },
    ]);

    return { ok: true, alreadyResolved: false };
  });
