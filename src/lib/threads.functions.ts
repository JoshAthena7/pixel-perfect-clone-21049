import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { withAICircuit } from "@/lib/ai-circuit-breaker";

type ObjectType = "question_record" | "deliverable" | "iris_output" | "milestone";

const objectTypeSchema = z.enum([
  "question_record",
  "deliverable",
  "iris_output",
  "milestone",
]);

/* ─── helpers ─── */

async function resolveMissionId(
  supabase: any,
  objectType: ObjectType,
  objectId: string,
): Promise<string> {
  if (objectType === "question_record") {
    const { data, error } = await supabase
      .from("question_records")
      .select("mission_id")
      .eq("id", objectId)
      .maybeSingle();
    if (error || !data) throw new Error("Question not found");
    return data.mission_id;
  }
  throw new Error(`Threads not yet supported for ${objectType}`);
}

/* ─── getOrCreateThread ─── */

export const getOrCreateThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        objectType: objectTypeSchema,
        objectId: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const missionId = await resolveMissionId(supabase, data.objectType, data.objectId);

    // Try fetch
    const { data: existing } = await supabase
      .from("threads")
      .select("id, mission_id, created_at")
      .eq("object_type", data.objectType)
      .eq("object_id", data.objectId)
      .maybeSingle();

    let thread = existing;
    if (!thread) {
      const { data: created, error } = await supabase
        .from("threads")
        .insert({
          object_type: data.objectType,
          object_id: data.objectId,
          mission_id: missionId,
          created_by: userId,
        })
        .select("id, mission_id, created_at")
        .single();
      if (error) throw new Error(error.message);
      thread = created;
    }

    const { data: resolution } = await supabase
      .from("comment_resolutions")
      .select("resolved_by, resolved_at, reopened_by, reopened_at")
      .eq("thread_id", thread.id)
      .maybeSingle();

    const isResolved =
      !!resolution && !resolution.reopened_at;

    let resolverName: string | null = null;
    if (isResolved && resolution?.resolved_by) {
      const { data: p } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", resolution.resolved_by)
        .maybeSingle();
      resolverName = p?.display_name ?? null;
    }

    return {
      thread,
      isResolved,
      resolvedAt: isResolved ? resolution!.resolved_at : null,
      resolverName,
    };
  });

/* ─── listComments ─── */

export const listComments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ threadId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("comments")
      .select(
        "id, author_id, body, is_iris_reply, is_deleted, created_at, anchor_text, version_tag, is_decision, decision_starred_by, decision_starred_at",
      )
      .eq("thread_id", data.threadId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

    const authorIds = Array.from(new Set((rows ?? []).map((r: any) => r.author_id)));
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url, avatar_color")
      .in("id", authorIds.length ? authorIds : ["00000000-0000-0000-0000-000000000000"]);
    const profileMap = new Map(
      (profiles ?? []).map((p: any) => [p.id, p]),
    );

    const commentIds = (rows ?? []).map((r: any) => r.id);
    const { data: mentionRows } = await supabase
      .from("mentions")
      .select("comment_id, mentioned_user, is_iris")
      .in("comment_id", commentIds.length ? commentIds : ["00000000-0000-0000-0000-000000000000"]);

    const mentionsByComment = new Map<string, any[]>();
    for (const m of mentionRows ?? []) {
      const arr = mentionsByComment.get(m.comment_id) ?? [];
      arr.push(m);
      mentionsByComment.set(m.comment_id, arr);
    }

    return {
      comments: (rows ?? []).map((r: any) => {
        const p = profileMap.get(r.author_id) as any;
        return {
          id: r.id,
          body: r.is_deleted ? "[Comment removed]" : r.body,
          isIrisReply: r.is_iris_reply,
          isDeleted: r.is_deleted,
          createdAt: r.created_at,
          anchorText: r.anchor_text,
          versionTag: r.version_tag,
          isDecision: !!r.is_decision,
          decisionStarredAt: r.decision_starred_at ?? null,
          decisionStarredBy: r.decision_starred_by ?? null,
          author: {
            id: r.author_id,
            displayName: r.is_iris_reply ? "IRIS" : p?.display_name ?? "Unknown",
            avatarUrl: r.is_iris_reply ? null : p?.avatar_url ?? null,
            avatarColor: r.is_iris_reply
              ? "var(--athena-gold, #f59e0b)"
              : p?.avatar_color ?? "#3b7fff",
          },
          mentions: mentionsByComment.get(r.id) ?? [],
        };
      }),
    };
  });

/* ─── searchUsers (mention picker) ─── */

export const searchUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ q: z.string().max(100) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const q = data.q.trim();
    let query = supabase
      .from("profiles")
      .select("id, display_name, avatar_url, avatar_color, availability_status")
      .order("display_name", { ascending: true })
      .limit(8);
    if (q.length > 0) {
      query = query.ilike("display_name", `%${q}%`);
    }
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return { users: rows ?? [] };
  });

/* ─── postComment (+ optional IRIS reply) ─── */

async function callIrisReply(opts: {
  questionId: string;
  missionId: string;
  body: string;
}): Promise<string> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return "_IRIS isn't configured. The built-in AI key is missing._";

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const [{ data: q }, { data: m }, { data: dna }] = await Promise.all([
    supabaseAdmin
      .from("question_records")
      .select("question_number, title, question_text, guidance")
      .eq("id", opts.questionId)
      .maybeSingle(),
    supabaseAdmin
      .from("missions")
      .select("name, client, state, submission_date, description")
      .eq("id", opts.missionId)
      .maybeSingle(),
    supabaseAdmin
      .from("mission_intelligence_dna")
      .select("dna")
      .eq("mission_id", opts.missionId)
      .eq("is_current", true)
      .maybeSingle(),
  ]);

  const dnaSummary = dna?.dna ? JSON.stringify(dna.dna).slice(0, 4000) : "(no DNA on file yet)";

  const sys = `You are IRIS, Athena Strategy Group's embedded intelligence analyst. A teammate just @-mentioned you inside an internal thread on a specific writing assignment. Answer their question directly and concisely (3-5 sentences). Cite mission specifics where helpful. No filler, no "Here is" preamble. If you do not have a confident answer, say so plainly.

MISSION
${m?.name ?? "(unknown)"} · Client: ${m?.client ?? "—"} · State: ${m?.state ?? "—"} · Due: ${m?.submission_date ?? "—"}

ASSIGNMENT
${q?.question_number ?? ""} — ${q?.title ?? ""}
Prompt: ${q?.question_text ?? ""}
Leadership guidance: ${q?.guidance ?? "(none)"}

MISSION DNA
${dnaSummary}`;

  try {
    const res = await withAICircuit(async () => {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: sys },
            { role: "user", content: opts.body },
          ],
        }),
        signal: AbortSignal.timeout(25_000),
      });
      if (r.status >= 500) throw new Error(`AI gateway ${r.status}`);
      return r;
    });
    if (res.status === 402) return "_IRIS needs workspace AI credits before it can answer._";
    if (res.status === 429) return "_IRIS is rate limited right now. Try again in a minute._";
    if (!res.ok) return `_IRIS gateway returned ${res.status}._`;
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return json.choices?.[0]?.message?.content?.trim() || "_IRIS returned an empty answer._";
  } catch (e: any) {
    return `IRIS couldn't respond — try @-mentioning a teammate. (${e?.message ?? "error"})`;
  }
}

export const postComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        threadId: z.string().uuid(),
        body: z.string().min(1).max(4000),
        mentionUserIds: z.array(z.string().uuid()).max(20).optional(),
        mentionsIris: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Insert the user's comment via their own RLS-respecting client
    const { data: inserted, error: insertErr } = await supabase
      .from("comments")
      .insert({
        thread_id: data.threadId,
        author_id: userId,
        body: data.body,
        is_iris_reply: false,
      })
      .select("id, thread_id")
      .single();
    if (insertErr) throw new Error(insertErr.message);

    // Mentions
    const mentionRows: any[] = [];
    for (const uid of data.mentionUserIds ?? []) {
      mentionRows.push({
        comment_id: inserted.id,
        mentioned_user: uid,
        is_iris: false,
      });
    }
    if (data.mentionsIris) {
      mentionRows.push({
        comment_id: inserted.id,
        mentioned_user: null,
        is_iris: true,
      });
    }
    if (mentionRows.length) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("mentions").insert(mentionRows);
    }

    // IRIS reply (if @IRIS)
    if (data.mentionsIris) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      // We need the underlying object to query mission DNA
      const { data: thread } = await supabaseAdmin
        .from("threads")
        .select("object_type, object_id, mission_id")
        .eq("id", data.threadId)
        .maybeSingle();

      if (thread && thread.object_type === "question_record") {
        const answer = await callIrisReply({
          questionId: thread.object_id,
          missionId: thread.mission_id,
          body: data.body,
        });

        await supabaseAdmin.from("comments").insert({
          thread_id: data.threadId,
          author_id: userId, // initiator, surfaced as IRIS in UI
          body: answer,
          is_iris_reply: true,
        });

        await supabaseAdmin.from("olympus_audit_log").insert({
          action_type: "iris_thread_query",
          action_summary: `@IRIS query on thread ${data.threadId}`,
          user_id: userId,
          mission_id: thread.mission_id,
          target_table: "threads",
          target_id: data.threadId,
          metadata: {
            question_id: thread.object_id,
            prompt: data.body.slice(0, 500),
          },
        });
      }
    }

    return { ok: true, commentId: inserted.id };
  });

/* ─── resolve / reopen ─── */

export const resolveThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ threadId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("comment_resolutions")
      .upsert(
        {
          thread_id: data.threadId,
          resolved_by: userId,
          resolved_at: new Date().toISOString(),
          reopened_by: null,
          reopened_at: null,
        },
        { onConflict: "thread_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reopenThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ threadId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("comment_resolutions")
      .update({
        reopened_by: userId,
        reopened_at: new Date().toISOString(),
      })
      .eq("thread_id", data.threadId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ─── ack the first-use modal ─── */

export const ackThreadsInternalNotice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("profiles")
      .update({ has_acked_threads_internal_at: new Date().toISOString() })
      .eq("id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getThreadsInternalAckState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("profiles")
      .select("has_acked_threads_internal_at")
      .eq("id", userId)
      .maybeSingle();
    return { acked: !!data?.has_acked_threads_internal_at };
  });

/* ─── listMissionThreads — all active threads scoped to a mission ─── */

export const listMissionThreads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ missionId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: threads, error } = await supabase
      .from("threads")
      .select("id, object_type, object_id, mission_id, created_at")
      .eq("mission_id", data.missionId)
      .eq("object_type", "question_record");
    if (error) throw new Error(error.message);

    const threadIds = (threads ?? []).map((t: any) => t.id);
    if (!threadIds.length) return { threads: [] as any[] };

    // Resolutions
    const { data: resRows } = await supabase
      .from("comment_resolutions")
      .select("thread_id, resolved_at, reopened_at")
      .in("thread_id", threadIds);
    const resMap = new Map<string, { resolvedAt: string | null; reopenedAt: string | null }>();
    for (const r of resRows ?? []) {
      resMap.set(r.thread_id, { resolvedAt: r.resolved_at, reopenedAt: r.reopened_at });
    }

    // Last comment per thread + counts
    const { data: commentRows } = await supabase
      .from("comments")
      .select("id, thread_id, body, created_at, is_iris_reply, is_deleted, author_id")
      .in("thread_id", threadIds)
      .order("created_at", { ascending: false });

    type CommentRow = {
      id: string;
      thread_id: string;
      body: string;
      created_at: string;
      is_iris_reply: boolean;
      is_deleted: boolean;
      author_id: string;
    };

    const byThread = new Map<string, CommentRow[]>();
    for (const c of (commentRows ?? []) as CommentRow[]) {
      const arr = byThread.get(c.thread_id) ?? [];
      arr.push(c);
      byThread.set(c.thread_id, arr);
    }

    // Mentions to derive "Needs Decision" hint
    const allCommentIds = (commentRows ?? []).map((c: any) => c.id);
    const { data: mentionRows } = await supabase
      .from("mentions")
      .select("comment_id, is_iris")
      .in("comment_id", allCommentIds.length ? allCommentIds : ["00000000-0000-0000-0000-000000000000"]);
    const mentionedComments = new Set((mentionRows ?? []).map((m: any) => m.comment_id));

    // Question records
    const questionIds = Array.from(new Set((threads ?? []).map((t: any) => t.object_id)));
    const { data: qrows } = await supabase
      .from("question_records")
      .select("id, question_number, title, point_value, pens_down_date, assigned_writer_id, status")
      .in("id", questionIds);
    const qMap = new Map((qrows ?? []).map((q: any) => [q.id, q]));

    // Writer names
    const writerIds = Array.from(
      new Set((qrows ?? []).map((q: any) => q.assigned_writer_id).filter(Boolean)),
    );
    const { data: writers } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", writerIds.length ? writerIds : ["00000000-0000-0000-0000-000000000000"]);
    const writerMap = new Map((writers ?? []).map((w: any) => [w.id, w.display_name]));

    const out = (threads ?? []).map((t: any) => {
      const comments = byThread.get(t.id) ?? [];
      const last = comments[0];
      const q = qMap.get(t.object_id) as any;
      const resolved = resMap.get(t.id);
      const isResolved = !!resolved && !!resolved.resolvedAt && !resolved.reopenedAt;

      // Needs Decision: open AND last comment was a mention (or IRIS reply) awaiting human response
      const needsDecision =
        !isResolved &&
        !!last &&
        (mentionedComments.has(last.id) || last.is_iris_reply);

      return {
        threadId: t.id,
        objectType: t.object_type,
        objectId: t.object_id,
        questionNumber: q?.question_number ?? "—",
        questionTitle: q?.title ?? "Untitled",
        pointValue: q?.point_value ?? null,
        pensDownDate: q?.pens_down_date ?? null,
        assignedOwner: q?.assigned_writer_id
          ? writerMap.get(q.assigned_writer_id) ?? null
          : null,
        status: isResolved ? "resolved" : needsDecision ? "needs_decision" : "open",
        lastActivityAt: last?.created_at ?? t.created_at,
        lastMessagePreview: last
          ? last.is_deleted
            ? "[message removed]"
            : (last.is_iris_reply ? "IRIS: " : "") + last.body.slice(0, 140)
          : "No messages yet",
        commentCount: comments.length,
      };
    });

    out.sort(
      (a, b) =>
        new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime(),
    );

    return { threads: out };
  });

/* ─── toggleDecisionStar — star/unstar a comment as a Decision ─── */

export const toggleDecisionStar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        commentId: z.string().uuid(),
        star: z.boolean(),
        note: z.string().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("comments")
      .update(
        data.star
          ? {
              is_decision: true,
              decision_starred_by: userId,
              decision_starred_at: new Date().toISOString(),
              decision_note: data.note ?? null,
            }
          : {
              is_decision: false,
              decision_starred_by: null,
              decision_starred_at: null,
              decision_note: null,
            },
      )
      .eq("id", data.commentId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ─── listMissionDecisions — Decisions log for Mission Vault ─── */

export const listMissionDecisions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ missionId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: threads } = await supabase
      .from("threads")
      .select("id, object_id")
      .eq("mission_id", data.missionId)
      .eq("object_type", "question_record");
    const threadIds = (threads ?? []).map((t: any) => t.id);
    if (!threadIds.length) return { decisions: [] as any[] };

    const { data: rows } = await supabase
      .from("comments")
      .select(
        "id, thread_id, author_id, body, created_at, decision_starred_at, decision_starred_by",
      )
      .in("thread_id", threadIds)
      .eq("is_decision", true)
      .order("decision_starred_at", { ascending: false });

    const threadToQ = new Map((threads ?? []).map((t: any) => [t.id, t.object_id]));
    const questionIds = Array.from(new Set((rows ?? []).map((r: any) => threadToQ.get(r.thread_id)).filter(Boolean)));
    const { data: qs } = await supabase
      .from("question_records")
      .select("id, question_number, title")
      .in("id", questionIds.length ? questionIds : ["00000000-0000-0000-0000-000000000000"]);
    const qMap = new Map((qs ?? []).map((q: any) => [q.id, q]));

    const userIds = Array.from(
      new Set((rows ?? []).flatMap((r: any) => [r.author_id, r.decision_starred_by]).filter(Boolean)),
    );
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
    const pMap = new Map((profs ?? []).map((p: any) => [p.id, p.display_name]));

    return {
      decisions: (rows ?? []).map((r: any) => {
        const qid = threadToQ.get(r.thread_id);
        const q = qid ? (qMap.get(qid) as any) : null;
        return {
          commentId: r.id,
          threadId: r.thread_id,
          questionId: qid,
          questionNumber: q?.question_number ?? "—",
          questionTitle: q?.title ?? "Untitled",
          body: r.body,
          author: pMap.get(r.author_id) ?? "Unknown",
          starredBy: r.decision_starred_by ? pMap.get(r.decision_starred_by) ?? null : null,
          starredAt: r.decision_starred_at,
          createdAt: r.created_at,
        };
      }),
    };
  });
