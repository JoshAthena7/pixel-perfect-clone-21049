/**
 * Thread (per-question collaboration) server functions.
 * IRIS observes, participates, and queries Oracle behind the scenes.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const PostInput = z.object({
  missionId: z.string().uuid(),
  questionId: z.string().uuid(),
  body: z.string().min(1).max(8000),
  messageType: z.enum(["regular", "decision"]).default("regular"),
  mentions: z.array(z.string().uuid()).max(20).default([]),
});

export const listThreadMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ questionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("thread_messages")
      .select("*")
      .eq("question_id", data.questionId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { messages: rows ?? [] };
  });

export const listMissionTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ missionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows } = await supabase
      .from("mission_team_members")
      .select("member_id, mission_role, atlas_team_members!inner(id, first_name, last_name, email, avatar_url)")
      .eq("mission_id", data.missionId);
    const members = (rows ?? []).map((r: any) => {
      const m = r.atlas_team_members;
      const name = [m?.first_name, m?.last_name].filter(Boolean).join(" ") || m?.email || "Member";
      return {
        id: m?.id as string,
        name,
        email: m?.email as string | null,
        avatar_url: m?.avatar_url as string | null,
        role: r.mission_role as string | null,
      };
    });
    return { members };
  });

export const postThreadMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => PostInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Resolve sender display name
    const { data: prof } = await supabase
      .from("profiles")
      .select("display_name, email")
      .eq("id", userId)
      .maybeSingle();
    const senderName =
      (prof as any)?.display_name || (prof as any)?.email?.split("@")[0] || "Member";

    const { data: inserted, error } = await supabase
      .from("thread_messages")
      .insert({
        mission_id: data.missionId,
        question_id: data.questionId,
        sender_id: userId,
        sender_name: senderName,
        message_body: data.body,
        message_type: data.messageType,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    // @mention notifications
    if (data.mentions.length > 0) {
      try {
        const rows = data.mentions.map((mid) => ({
          recipient_role: "specific_user",
          recipient_id: mid,
          type: "thread_mention",
          message: `${senderName} mentioned you in a Thread`,
          metadata: {
            mission_id: data.missionId,
            question_id: data.questionId,
            thread_message_id: (inserted as any).id,
          },
        }));
        await supabase.from("atlas_notifications").insert(rows);
      } catch {
        /* notification failures are non-fatal */
      }
    }

    // Decision: fixed IRIS acknowledgement, skip AI call.
    if (data.messageType === "decision") {
      await supabase.from("thread_messages").insert({
        mission_id: data.missionId,
        question_id: data.questionId,
        sender_id: null,
        sender_name: "IRIS",
        message_type: "iris",
        message_body:
          "Decision recorded. I have noted this in the question context — it will inform my guidance for this section going forward.",
      });
      // Best-effort: recompute Line of Sight so this decision can surface
      // in connected sections and trigger conflict detection. Non-blocking.
      try {
        const { buildLineOfSightInternal } = await import("@/lib/iris-line-of-sight.server");
        void buildLineOfSightInternal(data.missionId).catch((e: unknown) =>
          console.error("[thread] line-of-sight recompute failed", e),
        );
      } catch (e) {
        console.error("[thread] line-of-sight import failed", e);
      }
      // Fire-and-forget: decision is a final-ish event — extract intelligence.
      void triggerThreadExtraction({
        missionId: data.missionId,
        questionId: data.questionId,
      }).catch((e: unknown) => console.error("[thread] iris extraction failed", e));
      return { ok: true, message: inserted };
    }

    // Regular message → IRIS analysis (best-effort; failures swallowed)
    try {
      await runIrisAnalysis(supabase, {
        missionId: data.missionId,
        questionId: data.questionId,
        body: data.body,
      });
    } catch (e) {
      console.error("[thread] IRIS analysis failed", e);
    }

    // Cross-reference search — fire-and-forget. Only triggers for question-like
    // messages so IRIS does not flood the Thread on every status update.
    const looksLikeQuestion =
      data.body.includes("?") || (data.body.trim().length > 0 && data.body.trim().length < 150);
    if (looksLikeQuestion) {
      void runCrossReferenceSearch({
        missionId: data.missionId,
        questionId: data.questionId,
        body: data.body,
      }).catch((e: unknown) => console.error("[thread] cross-reference search failed", e));
    }

    // If the question is in a final/complete state, run thread intelligence
    // extraction in the background.
    try {
      const { data: qstate } = await supabase
        .from("mission_questions")
        .select("status, iris_extracted")
        .eq("id", data.questionId)
        .maybeSingle();
      const status = (qstate as { status: string | null } | null)?.status;
      const already = (qstate as { iris_extracted: boolean | null } | null)?.iris_extracted;
      if (
        !already &&
        (status === "complete" || status === "submitted" || status === "final")
      ) {
        void triggerThreadExtraction({
          missionId: data.missionId,
          questionId: data.questionId,
        }).catch((e: unknown) => console.error("[thread] iris extraction failed", e));
        void triggerKnowledgeExtraction({
          missionId: data.missionId,
          questionId: data.questionId,
        }).catch((e: unknown) => console.error("[thread] knowledge extraction failed", e));
      }
    } catch (e) {
      console.error("[thread] extraction-trigger check failed", e);
    }

    return { ok: true, message: inserted };
  });

async function triggerThreadExtraction(args: { missionId: string; questionId: string }) {
  const { extractThreadIntelligence } = await import(
    "@/lib/iris-extract-thread-intelligence.functions"
  );
  await extractThreadIntelligence({
    data: { mission_id: args.missionId, question_id: args.questionId },
  });
}

/** Called when the panel opens. Posts an IRIS check-in if the thread has been
 * inactive for 24+ hours and the question is flagged at-risk. */
export const maybePostInactivityCheckIn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ missionId: z.string().uuid(), questionId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: q } = await supabase
      .from("mission_questions")
      .select("health_status, due_date, question_number")
      .eq("id", data.questionId)
      .maybeSingle();
    if (!q || (q as any).health_status !== "at_risk") return { posted: false };

    const { data: last } = await supabase
      .from("thread_messages")
      .select("created_at, sender_name")
      .eq("question_id", data.questionId)
      .order("created_at", { ascending: false })
      .limit(1);
    const lastRow = (last ?? [])[0] as any;
    if (lastRow) {
      const ageMs = Date.now() - new Date(lastRow.created_at).getTime();
      if (ageMs < 24 * 3600 * 1000) return { posted: false };
      if (lastRow.sender_name === "IRIS") return { posted: false };
    } else {
      // No messages yet — no one to nudge.
      return { posted: false };
    }

    const days = (q as any).due_date
      ? Math.max(0, Math.ceil((new Date((q as any).due_date).getTime() - Date.now()) / 86_400_000))
      : null;
    const dueText = days != null ? `${days} day${days === 1 ? "" : "s"} to submission.` : "";
    await supabase.from("thread_messages").insert({
      mission_id: data.missionId,
      question_id: data.questionId,
      sender_id: null,
      sender_name: "IRIS",
      message_type: "iris",
      message_body: `This question has been inactive for 24 hours and is flagged at risk. ${dueText} What needs to happen today to move this forward?`.trim(),
    });
    return { posted: true };
  });

/**
 * Posts a one-time IRIS "Win Theme Alignment" orientation message in the
 * Thread feed if (a) win_theme_alignment connections exist for this question
 * and (b) no win_theme_alignment message has been posted before. Idempotent.
 */
export const maybePostWinThemeAlignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ missionId: z.string().uuid(), questionId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // Condition 2 first (cheaper): idempotency guard.
    const { data: prior } = await supabase
      .from("thread_messages")
      .select("id")
      .eq("question_id", data.questionId)
      .eq("message_type", "win_theme_alignment")
      .limit(1);
    if (prior && prior.length > 0) return { posted: false, reason: "already_posted" };

    // Condition 1: win_theme_alignment connections for this question.
    const { data: conns } = await supabase
      .from("question_connections")
      .select("question_id_a, question_id_b, iris_rationale")
      .eq("mission_id", data.missionId)
      .eq("connection_type", "win_theme_alignment")
      .or(`question_id_a.eq.${data.questionId},question_id_b.eq.${data.questionId}`);
    const connRows = (conns ?? []) as Array<{ question_id_a: string; question_id_b: string; iris_rationale: string | null }>;
    if (connRows.length === 0) return { posted: false, reason: "no_connections" };

    const otherIds = Array.from(
      new Set(
        connRows.map((c) => (c.question_id_a === data.questionId ? c.question_id_b : c.question_id_a)),
      ),
    );

    // Lookup other question section names / numbers.
    const { data: otherQs } = await supabase
      .from("mission_questions")
      .select("id, section_id, question_number, mission_sections(name)")
      .in("id", otherIds);
    type OQ = { id: string; section_id: string | null; question_number: string | null; mission_sections: { name: string | null } | null };
    const oqRows = (otherQs ?? []) as unknown as OQ[];
    const labelById = new Map<string, { label: string; rationale: string | null }>();
    for (const oq of oqRows) {
      const sectionLabel = oq.mission_sections?.name ?? (oq.question_number ? `Q${oq.question_number}` : "Section");
      const conn = connRows.find(
        (c) => c.question_id_a === oq.id || c.question_id_b === oq.id,
      );
      labelById.set(oq.id, { label: sectionLabel, rationale: conn?.iris_rationale ?? null });
    }

    // Win theme names (best-effort).
    const { data: strategy } = await supabase
      .from("mission_win_strategy")
      .select("win_themes")
      .eq("mission_id", data.missionId)
      .maybeSingle();
    const wt = (strategy as { win_themes: unknown } | null)?.win_themes;
    let themeNames: string[] = [];
    if (Array.isArray(wt)) {
      themeNames = wt
        .map((t) => (typeof t === "string" ? t : (t as { name?: string; theme?: string })?.name || (t as { theme?: string })?.theme || ""))
        .filter(Boolean)
        .slice(0, 3);
    }
    const themeText = themeNames.length ? themeNames.join(", ") : "this mission's Win Themes";

    const visible = oqRows.slice(0, 3);
    const overflow = oqRows.length - visible.length;
    const sectionList = visible.map((q) => labelById.get(q.id)?.label ?? "Section").join(", ");
    const bullets = visible
      .map((q) => {
        const entry = labelById.get(q.id);
        return `• ${entry?.label ?? "Section"} — ${entry?.rationale ?? "Shared win theme."}`;
      })
      .join("\n");
    const overflowLine = overflow > 0 ? `\n…and ${overflow} more section${overflow === 1 ? "" : "s"}. View all in Line of Sight.` : "";

    const body =
      `Win Theme Alignment — This section connects to ${themeText}. ${oqRows.length} other section${oqRows.length === 1 ? "" : "s"} on this mission ${oqRows.length === 1 ? "is" : "are"} carrying the same theme: ${sectionList}. ` +
      `Before writing, check their Threads to see how the team is framing this theme. Consistency across sections strengthens the whole proposal. Each section's approach is shown below.\n\n` +
      `${bullets}${overflowLine}`;

    const metadata = {
      connected_questions: oqRows.map((q) => ({
        question_id: q.id,
        label: labelById.get(q.id)?.label ?? "Section",
        rationale: labelById.get(q.id)?.rationale ?? null,
      })),
      themes: themeNames,
    };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("thread_messages").insert({
      mission_id: data.missionId,
      question_id: data.questionId,
      sender_id: null,
      sender_name: "IRIS",
      message_type: "win_theme_alignment",
      message_body: body,
      metadata,
    });
    if (error) {
      console.error("[maybePostWinThemeAlignment] insert failed:", error.message);
      return { posted: false, reason: "insert_failed" };
    }
    return { posted: true };
  });

// ──────────────────────────────────────────────────────────────────────────
// IRIS analysis (server-only helper, called from postThreadMessage handler)
// ──────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sup = any;

async function runIrisAnalysis(
  supabase: Sup,
  args: { missionId: string; questionId: string; body: string },
) {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return;

  // Gather minimal mission context
  const [missionRes, qRes, strategyRes, intelRes, stakesRes] = await Promise.all([
    supabase.from("missions").select("name").eq("id", args.missionId).maybeSingle(),
    supabase
      .from("mission_questions")
      .select("question_number, question_text, section_id")
      .eq("id", args.questionId)
      .maybeSingle(),
    supabase
      .from("mission_win_strategy")
      .select("win_themes, north_star_message, central_claim")
      .eq("mission_id", args.missionId)
      .maybeSingle(),
    supabase
      .from("intelligence_feed_items")
      .select("headline, iris_assessment, source_name, source_url, iris_relevance_score")
      .eq("mission_id", args.missionId)
      .order("iris_relevance_score", { ascending: false })
      .limit(3),
    supabase
      .from("stakeholder_profiles")
      .select("name, title, public_priorities, known_concerns")
      .eq("mission_id", args.missionId)
      .limit(2),
  ]);

  const mission = (missionRes as any)?.data;
  const q = (qRes as any)?.data;
  const strategy = (strategyRes as any)?.data;
  const intel = ((intelRes as any)?.data ?? []) as any[];
  const stakes = ((stakesRes as any)?.data ?? []) as any[];

  let sectionName = "";
  if (q?.section_id) {
    const { data: sec } = await supabase
      .from("mission_sections")
      .select("name")
      .eq("id", q.section_id)
      .maybeSingle();
    sectionName = (sec as any)?.name ?? "";
  }

  const winThemes = Array.isArray(strategy?.win_themes)
    ? strategy.win_themes
        .map((t: any) => (typeof t === "string" ? t : t?.title ?? t?.theme ?? ""))
        .filter(Boolean)
        .slice(0, 4)
        .join("; ")
    : "";

  const system =
    "You are IRIS. A proposal writer just posted a message in a question Thread. " +
    "Default to should_respond=false. Only respond when you can cite a specific piece of mission intelligence, " +
    "stakeholder fact, or compliance requirement that materially changes how the writer should approach this message. " +
    "Do NOT respond to acknowledgments, social chatter, generic questions, brainstorming, or anything you cannot " +
    "ground in the IRIS Memory context below. Thread is a human collaboration space — you are an occasional intelligent " +
    "contributor, not a chatbot. When in doubt, stay silent.";

  const user = [
    `Mission: ${mission?.name ?? "(unknown)"}.`,
    `Question: ${q?.question_number ? `${q.question_number} ` : ""}${q?.question_text ?? ""}`.trim() + ".",
    `Section: ${sectionName || "(none)"}.`,
    `Win themes: ${winThemes || "(none)"}.`,
    `North star: ${strategy?.north_star_message ?? "(none)"}.`,
    `New message: ${args.body}`,
    `Recent IRIS intelligence:`,
    intel.length
      ? intel
          .map(
            (i) =>
              `- [${i.iris_relevance_score ?? "?"}] ${i.headline} — ${i.iris_assessment ?? ""} (${i.source_name ?? ""})`,
          )
          .join("\n")
      : "(none)",
    `Stakeholder context:`,
    stakes.length
      ? stakes
          .map(
            (s) =>
              `- ${s.name}${s.title ? `, ${s.title}` : ""}: priorities=${s.public_priorities ?? "?"}; concerns=${s.known_concerns ?? "?"}`,
          )
          .join("\n")
      : "(none)",
    "",
    "Respond only if you have something specific and useful.",
    `Return JSON: { "should_respond": boolean, "response": string (max 200 chars), "iris_action": null | "recommend_expert" | "surface_intelligence" | "flag_conflict", "topic": string (short, only if recommend_expert or surface_intelligence) }`,
  ].join("\n");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      response_format: { type: "json_object" },
      max_tokens: 400,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) return;
  const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = j.choices?.[0]?.message?.content ?? "";
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) return;
  let parsed: {
    should_respond?: boolean;
    response?: string;
    iris_action?: "recommend_expert" | "surface_intelligence" | "flag_conflict" | null;
    topic?: string;
  };
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return;
  }
  if (!parsed.should_respond || !parsed.response) return;

  const action = parsed.iris_action ?? null;
  let body = parsed.response.slice(0, 240);

  if (action === "recommend_expert") {
    const topic = parsed.topic || "this topic";
    body = `This discussion might benefit from expertise in ${topic}. Want me to find the right person from the Athena Collective?`;
  } else if (action === "surface_intelligence") {
    const top = intel[0];
    if (top) {
      body = `IRIS has relevant intelligence on this topic: ${top.headline}${top.iris_assessment ? ` — ${top.iris_assessment}` : ""}. View full item →`;
    }
  } else if (action === "flag_conflict") {
    body = `I noticed potential conflicting guidance on this point. ${parsed.response}. Check with leadership before proceeding.`;
  }

  const { data: irisMsg } = await supabase
    .from("thread_messages")
    .insert({
      mission_id: args.missionId,
      question_id: args.questionId,
      sender_id: null,
      sender_name: "IRIS",
      message_type: "iris",
      message_body: body,
      iris_action: action,
      metadata: {
        topic: parsed.topic ?? null,
        oracle_item_id: action === "surface_intelligence" ? (intel[0] as any)?.id ?? null : null,
      },
    })
    .select("id")
    .single();

  if (action === "surface_intelligence") {
    try {
      await supabase.from("oracle_thread_queries").insert({
        mission_id: args.missionId,
        question_id: args.questionId,
        thread_message_id: (irisMsg as any)?.id ?? null,
        query_topic: parsed.topic || args.body.slice(0, 120),
        oracle_items_returned: intel.slice(0, 3),
      });
    } catch {
      /* non-fatal */
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Cross-reference search: when a writer asks a question, look for relevant
// decisions made in other sections' Threads and surface the best one.
// ──────────────────────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "i","the","a","an","is","are","we","our","this","that","what","does","has",
  "have","do","can","should","would","will","be","been","of","to","in","on",
  "for","with","and","or","but","if","at","by","from","as","it","its","my",
  "me","you","your","they","them","their","not","no","so","than","then","here",
  "there","just","also","about","into","over","any","some","when","where",
  "how","why","who","which","was","were","could","might","may","much",
]);

function extractKeywords(body: string): string[] {
  const tokens = body
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP_WORDS.has(w));
  const unique = Array.from(new Set(tokens));
  return unique.sort((a, b) => b.length - a.length).slice(0, 5);
}

async function runCrossReferenceSearch(args: {
  missionId: string;
  questionId: string;
  body: string;
}): Promise<void> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return;

  const keywords = extractKeywords(args.body);
  if (keywords.length === 0) return;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Duplicate-guard prefetch: existing cross_reference messages on this Thread.
  const { data: existingXrefs } = await supabaseAdmin
    .from("thread_messages")
    .select("metadata")
    .eq("question_id", args.questionId)
    .eq("message_type", "cross_reference");
  const alreadyReferencedQuestionIds = new Set<string>();
  for (const r of (existingXrefs ?? []) as Array<{ metadata: Record<string, unknown> | null }>) {
    const oqid = r.metadata?.["original_question_id"];
    if (typeof oqid === "string") alreadyReferencedQuestionIds.add(oqid);
  }

  // Search for decision messages from OTHER questions, last 30 days, matching any keyword.
  const sinceISO = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const orFilter = keywords.map((k) => `message_body.ilike.%${k}%`).join(",");
  const { data: candidates } = await supabaseAdmin
    .from("thread_messages")
    .select("id, question_id, message_body, created_at")
    .eq("mission_id", args.missionId)
    .neq("question_id", args.questionId)
    .eq("message_type", "decision")
    .gte("created_at", sinceISO)
    .or(orFilter)
    .order("created_at", { ascending: false })
    .limit(3);

  const candRows = ((candidates ?? []) as Array<{ id: string; question_id: string; message_body: string; created_at: string }>)
    .filter((c) => !alreadyReferencedQuestionIds.has(c.question_id));
  if (candRows.length === 0) return;

  const otherQIds = Array.from(new Set(candRows.map((c) => c.question_id)));
  const [{ data: otherQs }, { data: currentQ }] = await Promise.all([
    supabaseAdmin
      .from("mission_questions")
      .select("id, question_number, mission_sections(name)")
      .in("id", otherQIds),
    supabaseAdmin
      .from("mission_questions")
      .select("question_text, mission_sections(name)")
      .eq("id", args.questionId)
      .maybeSingle(),
  ]);
  type QRow = { id: string; question_number: string | null; mission_sections: { name: string | null } | null };
  const qById = new Map<string, QRow>(((otherQs ?? []) as unknown as QRow[]).map((q) => [q.id, q]));
  const sectionLabelFor = (qid: string): string => {
    const q = qById.get(qid);
    return q?.mission_sections?.name ?? (q?.question_number ? `Q${q.question_number}` : "Section");
  };
  const currentSection = (currentQ as { mission_sections?: { name?: string | null } | null } | null)?.mission_sections?.name ?? "";
  const currentQuestionText = (currentQ as { question_text?: string | null } | null)?.question_text ?? "";

  const system =
    "You are IRIS. A proposal writer asked a question in their Thread. You found decisions from other sections' Threads that may be relevant. " +
    "Determine if any of these decisions are genuinely relevant to the writer's question — not superficially similar, but actually useful. " +
    "If yes return the single most relevant one. If none are genuinely relevant return null. " +
    "Be conservative — only surface something if it would materially help the writer.";
  const userMsg = JSON.stringify({
    writer_question: args.body.slice(0, 800),
    current_question_context: {
      question_text: currentQuestionText.slice(0, 400),
      section_name: currentSection,
    },
    candidate_decisions: candRows.map((c) => ({
      question_id: c.question_id,
      section_name: sectionLabelFor(c.question_id),
      message_body: c.message_body.slice(0, 600),
      created_at: c.created_at,
    })),
    instructions:
      'Return JSON: { "should_surface": boolean, "best_match": { "question_id": "uuid", "section_name": "string", "decision_text": "string", "why_relevant": "string max 100 chars" } | null }',
  });

  let parsed: {
    should_surface?: boolean;
    best_match?: {
      question_id?: string;
      section_name?: string;
      decision_text?: string;
      why_relevant?: string;
    } | null;
  } = {};
  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        response_format: { type: "json_object" },
        max_tokens: 400,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userMsg },
        ],
      }),
    });
    if (!r.ok) return;
    const j = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = j.choices?.[0]?.message?.content ?? "";
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return;
    parsed = JSON.parse(match[0]);
  } catch (e) {
    console.error("[cross-reference] AI failure", e);
    return;
  }

  if (!parsed.should_surface || !parsed.best_match) return;
  const bm = parsed.best_match;
  if (!bm.question_id || !otherQIds.includes(bm.question_id)) return;
  if (alreadyReferencedQuestionIds.has(bm.question_id)) return;

  const sourceRow = candRows.find((c) => c.question_id === bm.question_id);
  if (!sourceRow) return;

  const sectionName = bm.section_name || sectionLabelFor(bm.question_id);
  const decisionText = (bm.decision_text || sourceRow.message_body).slice(0, 1200);
  const whyRelevant = (bm.why_relevant ?? "").slice(0, 120);
  const formattedDate = new Date(sourceRow.created_at).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const body = `The team made a relevant decision in ${sectionName}'s Thread on ${formattedDate}. Here is what was decided:`;

  const metadata = {
    original_question_id: bm.question_id,
    section_name: sectionName,
    decision_text: decisionText,
    why_relevant: whyRelevant,
    original_created_at: sourceRow.created_at,
  };

  const { error } = await supabaseAdmin.from("thread_messages").insert({
    mission_id: args.missionId,
    question_id: args.questionId,
    sender_id: null,
    sender_name: "IRIS",
    message_type: "cross_reference",
    message_body: body,
    metadata,
  });
  if (error) console.error("[cross-reference] insert failed:", error.message);
}
