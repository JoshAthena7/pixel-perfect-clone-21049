import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const RANGES = ["24h", "48h", "7d", "all"] as const;
export type ActivityRange = (typeof RANGES)[number];

const Input = z.object({
  missionId: z.string().uuid(),
  range: z.enum(RANGES).default("48h"),
});

export type ActivityStream =
  | "thread"
  | "phone_a_friend"
  | "score_me"
  | "mission_pulse"
  | "sos"
  | "conflict";

export type ActivityItem = {
  id: string;
  stream: ActivityStream;
  created_at: string;
  actor: string | null;
  question_id: string | null;
  question_number: string | null;
  question_text: string | null;
  summary: string;
  detail: string;
  // stream-specific
  message_type?: string | null;
  severity?: string | null;
  score?: number | null;
  the_one_fix?: string | null;
  status?: string | null;
  update_type?: string | null;
  resolved?: boolean;
  emerging_risk?: boolean;
  // conflict-specific
  conflict_id?: string;
  conflict_description?: string;
  detected_from?: string | null;
  question_id_a?: string;
  question_id_b?: string;
  section_a_label?: string | null;
  section_b_label?: string | null;
};


export type AttentionRail = {
  staleQuestions: Array<{ id: string; question_number: string | null; question_text: string | null; due_date: string | null; health_status: string }>;
  unresolvedSos: Array<{ id: string; sender_name: string; severity: string | null; body: string; created_at: string }>;
  awaitingExpert: Array<{ id: string; sender_name: string; question_number: string | null; question_id: string | null; created_at: string }>;
  negativeScoreTrends: Array<{ question_id: string; question_number: string | null; question_text: string | null; delta: number }>;
};

function sinceISO(range: ActivityRange): string | null {
  if (range === "all") return null;
  const now = Date.now();
  const ms = range === "24h" ? 86400e3 : range === "48h" ? 2 * 86400e3 : 7 * 86400e3;
  return new Date(now - ms).toISOString();
}

async function assertAdminOrLead(supabase: any, userId: string, missionId: string) {
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (isAdmin) return true;
  const { data: isLead } = await supabase.rpc("has_mission_role", {
    _mission_id: missionId,
    _user_id: userId,
    _roles: ["admin", "lead"],
  });
  if (isLead) return true;
  throw new Error("Forbidden");
}

export const getMissionActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdminOrLead(context.supabase, context.userId, data.missionId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = sinceISO(data.range);

    // Question lookup map for context
    const { data: questions } = await supabaseAdmin
      .from("mission_questions")
      .select("id,question_number,question_text,due_date,health_status")
      .eq("mission_id", data.missionId);
    const qMap = new Map<string, { id: string; question_number: string | null; question_text: string | null; due_date: string | null; health_status: string }>();
    (questions ?? []).forEach((q: any) => qMap.set(q.id, q));

    const filterSince = (q: any) => (since ? q.gte("created_at", since) : q);

    const [threadRes, consultRes, scoreRes, pulseRes, sosRes, conflictRes] = await Promise.all([
      filterSince(
        supabaseAdmin
          .from("thread_messages")
          .select("id,question_id,sender_name,message_body,message_type,created_at")
          .eq("mission_id", data.missionId)
          .order("created_at", { ascending: false })
          .limit(200),
      ),
      filterSince(
        supabaseAdmin
          .from("expert_consults")
          .select("id,question_id,ask_subject,ask_body,status,response_at,created_at,requested_by")
          .eq("mission_id", data.missionId)
          .order("created_at", { ascending: false })
          .limit(100),
      ),
      filterSince(
        supabaseAdmin
          .from("score_me_history")
          .select("id,question_id,score,full_analysis,created_at,scored_by")
          .eq("mission_id", data.missionId)
          .order("created_at", { ascending: false })
          .limit(100),
      ),
      filterSince(
        supabaseAdmin
          .from("team_updates")
          .select("id,question_id,sender_name,update_type,body,severity,created_at,resolved,metadata")
          .eq("mission_id", data.missionId)
          .not("update_type", "in", "(sos,sos_acknowledgment)")
          .order("created_at", { ascending: false })
          .limit(150),
      ),
      filterSince(
        supabaseAdmin
          .from("team_updates")
          .select("id,question_id,sender_name,update_type,body,severity,created_at,resolved,metadata")
          .eq("mission_id", data.missionId)
          .in("update_type", ["sos", "sos_acknowledgment"])
          .order("created_at", { ascending: false })
          .limit(100),
      ),
      filterSince(
        supabaseAdmin
          .from("conflict_flags")
          .select("id,conflict_description,detected_from,severity,resolved,created_at,question_id_a,question_id_b")
          .eq("mission_id", data.missionId)
          .eq("resolved", false)
          .order("created_at", { ascending: false })
          .limit(100),
      ),
    ]);

    // Resolve requester display names for expert_consults
    const requesterIds = Array.from(
      new Set((consultRes.data ?? []).map((r: any) => r.requested_by).filter(Boolean)),
    ) as string[];
    const scorerIds = Array.from(
      new Set((scoreRes.data ?? []).map((r: any) => r.scored_by).filter(Boolean)),
    ) as string[];
    const ids = Array.from(new Set([...requesterIds, ...scorerIds]));
    const profileMap = new Map<string, string>();
    if (ids.length) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id,display_name,email")
        .in("id", ids);
      (profs ?? []).forEach((p: any) =>
        profileMap.set(p.id, p.display_name || p.email || "Team member"),
      );
    }


    const items: ActivityItem[] = [];

    (threadRes.data ?? []).forEach((r: any) => {
      const q = r.question_id ? qMap.get(r.question_id) : null;
      const body = (r.message_body ?? "").toString();
      const head =
        r.message_type === "decision"
          ? `${r.sender_name} captured a decision`
          : r.message_type === "iris"
            ? "IRIS contributed to Thread"
            : `${r.sender_name} posted in Thread`;
      items.push({
        id: `thread:${r.id}`,
        stream: "thread",
        created_at: r.created_at,
        actor: r.sender_name,
        question_id: r.question_id,
        question_number: q?.question_number ?? null,
        question_text: q?.question_text ?? null,
        summary: `${head}: ${body.slice(0, 80)}${body.length > 80 ? "…" : ""}`,
        detail: body,
        message_type: r.message_type,
      });
    });

    (consultRes.data ?? []).forEach((r: any) => {
      const q = r.question_id ? qMap.get(r.question_id) : null;
      const actor = profileMap.get(r.requested_by) ?? "Team member";
      const subject = (r.ask_subject ?? "").toString();
      items.push({
        id: `phone:${r.id}`,
        stream: "phone_a_friend",
        created_at: r.created_at,
        actor,
        question_id: r.question_id,
        question_number: q?.question_number ?? null,
        question_text: q?.question_text ?? null,
        summary: `${actor} requested expertise: ${subject.slice(0, 60)}${subject.length > 60 ? "…" : ""}`,
        detail: r.ask_body ?? "",
        status: r.status,
      });
    });

    (scoreRes.data ?? []).forEach((r: any) => {
      const q = r.question_id ? qMap.get(r.question_id) : null;
      const actor = profileMap.get(r.scored_by) ?? "Writer";
      const fa = (r.full_analysis ?? {}) as any;
      const oneFix: string =
        fa.the_one_fix ?? fa.one_fix ?? fa.top_fix ?? fa.recommendation ?? "";
      const scoreNum = Number(r.score);
      items.push({
        id: `score:${r.id}`,
        stream: "score_me",
        created_at: r.created_at,
        actor,
        question_id: r.question_id,
        question_number: q?.question_number ?? null,
        question_text: q?.question_text ?? null,
        summary: `${actor} scored their response — ${scoreNum.toFixed(1)}/10. One fix: ${oneFix.slice(0, 80)}${oneFix.length > 80 ? "…" : ""}`,
        detail: oneFix || "No coaching fix recorded.",
        score: scoreNum,
        the_one_fix: oneFix,
      });
    });

    (pulseRes.data ?? []).forEach((r: any) => {
      const q = r.question_id ? qMap.get(r.question_id) : null;
      const body = (r.body ?? "").toString();
      const isIris = r.sender_name === "IRIS";
      const emerging = r.update_type === "emerging_risk" || r.update_type === "oracle_finding";
      const head = emerging
        ? `IRIS flagged ${r.update_type === "emerging_risk" ? "an emerging risk" : "an Oracle finding"}`
        : isIris
          ? "IRIS distributed an update"
          : `${r.sender_name} sent a ${r.update_type} signal`;
      items.push({
        id: `pulse:${r.id}`,
        stream: "mission_pulse",
        created_at: r.created_at,
        actor: r.sender_name,
        question_id: r.question_id,
        question_number: q?.question_number ?? null,
        question_text: q?.question_text ?? null,
        summary: `${head}: ${body.slice(0, 80)}${body.length > 80 ? "…" : ""}`,
        detail: body,
        update_type: r.update_type,
        emerging_risk: emerging,
      });
    });

    (sosRes.data ?? []).forEach((r: any) => {
      const q = r.question_id ? qMap.get(r.question_id) : null;
      const body = (r.body ?? "").toString();
      const isAck = r.update_type === "sos_acknowledgment";
      const summary = isAck
        ? "IRIS acknowledged SOS and routed to leadership."
        : `${r.sender_name} raised SOS (${(r.severity ?? "watch").toUpperCase()}): ${body.slice(0, 80)}${body.length > 80 ? "…" : ""}`;
      items.push({
        id: `sos:${r.id}`,
        stream: "sos",
        created_at: r.created_at,
        actor: r.sender_name,
        question_id: r.question_id,
        question_number: q?.question_number ?? null,
        question_text: q?.question_text ?? null,
        summary,
        detail: body,
        severity: r.severity,
        update_type: r.update_type,
        resolved: r.resolved,
      });
    });

    (conflictRes.data ?? []).forEach((r: any) => {
      const desc = (r.conflict_description ?? "").toString();
      const qa = r.question_id_a ? qMap.get(r.question_id_a) : null;
      const qb = r.question_id_b ? qMap.get(r.question_id_b) : null;
      const labelFor = (q: any) =>
        q
          ? `Q${q.question_number ?? "—"}${q.question_text ? ` — ${String(q.question_text).slice(0, 40)}` : ""}`
          : null;
      items.push({
        id: `conflict:${r.id}`,
        stream: "conflict",
        created_at: r.created_at,
        actor: "IRIS",
        question_id: r.question_id_a ?? null,
        question_number: qa?.question_number ?? null,
        question_text: qa?.question_text ?? null,
        summary: `IRIS detected a decision conflict: ${desc.slice(0, 80)}${desc.length > 80 ? "…" : ""}`,
        detail: desc,
        severity: r.severity,
        conflict_id: r.id,
        conflict_description: desc,
        detected_from: r.detected_from ?? null,
        question_id_a: r.question_id_a,
        question_id_b: r.question_id_b,
        section_a_label: labelFor(qa),
        section_b_label: labelFor(qb),
      });
    });

    items.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));


    // Attention rail
    const now = Date.now();
    const cutoff48 = new Date(now - 48 * 3600e3);
    const cutoff7d = new Date(now + 7 * 86400e3);

    // last thread activity per question (mission-wide, no since filter)
    const { data: lastThreadRows } = await supabaseAdmin
      .from("thread_messages")
      .select("question_id,created_at")
      .eq("mission_id", data.missionId)
      .order("created_at", { ascending: false })
      .limit(500);
    const lastByQ = new Map<string, string>();
    (lastThreadRows ?? []).forEach((r: any) => {
      if (!lastByQ.has(r.question_id)) lastByQ.set(r.question_id, r.created_at);
    });

    const staleQuestions = (questions ?? [])
      .filter((q: any) => {
        const last = lastByQ.get(q.id);
        const stale = !last || new Date(last) < cutoff48;
        const dueSoon = q.due_date && new Date(q.due_date) <= cutoff7d;
        const atRisk = q.health_status === "at_risk";
        const active = q.status !== "complete" && q.status !== "withdrawn";
        return active && stale && (dueSoon || atRisk);
      })
      .slice(0, 12);

    const unresolvedSos = (sosRes.data ?? [])
      .filter((r: any) => r.update_type === "sos" && !r.resolved)
      .map((r: any) => ({
        id: r.id,
        sender_name: r.sender_name,
        severity: r.severity,
        body: r.body,
        created_at: r.created_at,
      }));

    const fourHrsAgo = new Date(now - 4 * 3600e3);
    const awaitingExpert = (consultRes.data ?? [])
      .filter(
        (r: any) =>
          !r.response_at &&
          (r.status === "sent" || r.status === "acknowledged" || r.status === "needs_info") &&
          new Date(r.created_at) < fourHrsAgo,
      )
      .map((r: any) => {
        const q = r.question_id ? qMap.get(r.question_id) : null;
        return {
          id: r.id,
          sender_name: profileMap.get(r.requested_by) ?? "Team member",
          question_number: q?.question_number ?? null,
          question_id: r.question_id,
          created_at: r.created_at,
        };
      });

    // Score trends — last 7d
    const sevenDaysAgo = new Date(now - 7 * 86400e3).toISOString();
    const { data: scoreTrendRows } = await supabaseAdmin
      .from("score_me_history")
      .select("question_id,score,created_at")
      .eq("mission_id", data.missionId)
      .gte("created_at", sevenDaysAgo)
      .order("created_at", { ascending: false });
    const byQ = new Map<string, Array<{ score: number; created_at: string }>>();
    (scoreTrendRows ?? []).forEach((r: any) => {
      const arr = byQ.get(r.question_id) ?? [];
      arr.push({ score: Number(r.score), created_at: r.created_at });
      byQ.set(r.question_id, arr);
    });
    const negativeScoreTrends: AttentionRail["negativeScoreTrends"] = [];
    byQ.forEach((arr, qid) => {
      if (arr.length < 2) return;
      const latest = arr[0].score;
      const prev = arr[1].score;
      const delta = latest - prev;
      if (delta < 0) {
        const q = qMap.get(qid);
        negativeScoreTrends.push({
          question_id: qid,
          question_number: q?.question_number ?? null,
          question_text: q?.question_text ?? null,
          delta,
        });
      }
    });
    negativeScoreTrends.sort((a, b) => a.delta - b.delta);

    const rail: AttentionRail = {
      staleQuestions,
      unresolvedSos,
      awaitingExpert,
      negativeScoreTrends,
    };

    const counts = {
      thread: (threadRes.data ?? []).length,
      phone_a_friend: (consultRes.data ?? []).length,
      score_me: (scoreRes.data ?? []).length,
      mission_pulse: (pulseRes.data ?? []).length,
      sos: (sosRes.data ?? []).filter((r: any) => r.update_type === "sos").length,
      conflict: (conflictRes.data ?? []).length,
    };


    return { items, rail, counts, range: data.range };
  });

export const getActivitySynthesis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdminOrLead(context.supabase, context.userId, data.missionId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = sinceISO(data.range);

    const filterSince = (q: any) => (since ? q.gte("created_at", since) : q);
    const [threadC, consultC, scoreC, pulseC, sosC, mission, questions, conflictsC] = await Promise.all([
      filterSince(supabaseAdmin.from("thread_messages").select("id,question_id", { count: "exact", head: false }).eq("mission_id", data.missionId)),
      filterSince(supabaseAdmin.from("expert_consults").select("id", { count: "exact", head: true }).eq("mission_id", data.missionId)),
      filterSince(supabaseAdmin.from("score_me_history").select("score", { count: "exact" }).eq("mission_id", data.missionId)),
      filterSince(supabaseAdmin.from("team_updates").select("id", { count: "exact", head: true }).eq("mission_id", data.missionId).not("update_type", "in", "(sos,sos_acknowledgment)")),
      filterSince(supabaseAdmin.from("team_updates").select("id", { count: "exact", head: true }).eq("mission_id", data.missionId).eq("update_type", "sos")),
      supabaseAdmin.from("missions").select("name").eq("id", data.missionId).maybeSingle(),
      supabaseAdmin.from("mission_questions").select("id,question_number,status").eq("mission_id", data.missionId),
      supabaseAdmin
        .from("conflict_flags")
        .select("conflict_description,created_at")
        .eq("mission_id", data.missionId)
        .eq("resolved", false)
        .order("created_at", { ascending: false }),
    ]);


    const threadRows = (threadC.data ?? []) as Array<{ question_id: string }>;
    const threadCount = threadRows.length;
    const questionsTouched = new Set(threadRows.map((r) => r.question_id)).size;
    const scoreRows = (scoreC.data ?? []) as Array<{ score: number }>;
    const avgScore = scoreRows.length
      ? scoreRows.reduce((s, r) => s + Number(r.score), 0) / scoreRows.length
      : null;

    // Stale questions list
    const { data: lastThreadRows } = await supabaseAdmin
      .from("thread_messages")
      .select("question_id,created_at")
      .eq("mission_id", data.missionId)
      .order("created_at", { ascending: false })
      .limit(500);
    const lastByQ = new Map<string, string>();
    (lastThreadRows ?? []).forEach((r: any) => {
      if (!lastByQ.has(r.question_id)) lastByQ.set(r.question_id, r.created_at);
    });
    const cutoff48 = new Date(Date.now() - 48 * 3600e3);
    const stale = ((questions.data ?? []) as any[])
      .filter((q) => q.status !== "complete" && q.status !== "withdrawn")
      .filter((q) => {
        const l = lastByQ.get(q.id);
        return !l || new Date(l) < cutoff48;
      })
      .map((q) => q.question_number)
      .filter(Boolean)
      .slice(0, 8);

    const conflictRows = (conflictsC.data ?? []) as Array<{ conflict_description: string }>;
    const unresolvedConflicts = conflictRows.length;
    const mostRecentConflict = conflictRows[0]?.conflict_description ?? "none";

    const facts = {
      mission_name: mission.data?.name ?? "this mission",
      window: data.range,
      thread_count: threadCount,
      questions_touched_in_thread: questionsTouched,
      score_me_sessions: scoreRows.length,
      average_score_me: avgScore !== null ? Number(avgScore.toFixed(1)) : null,
      mission_pulse_signals: pulseC.count ?? 0,
      phone_a_friend_requests: consultC.count ?? 0,
      sos_events: sosC.count ?? 0,
      stale_questions_48h: stale,
      unresolved_conflicts: unresolvedConflicts,
      most_recent_conflict: mostRecentConflict,
    };


    const apiKey = process.env.LOVABLE_API_KEY;
    let synthesis = defaultSynthesis(facts);
    if (apiKey) {
      try {
        const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Lovable-API-Key": apiKey,
            "X-Lovable-AIG-SDK": "raw",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              {
                role: "system",
                content:
                  "You are IRIS. Summarize mission activity for the Engagement Lead in one paragraph. Be specific. Name the questions with no activity. Call out score trends. Flag anything that needs attention. Maximum 120 words. Direct and specific — no fluff.",
              },
              {
                role: "user",
                content: `Activity facts for ${facts.mission_name} in the last ${facts.window}:\n${JSON.stringify(facts, null, 2)}\n\nUnresolved conflicts detected by IRIS: ${facts.unresolved_conflicts}. Most recent: ${facts.most_recent_conflict}.`,
              },
            ],
          }),
        });
        if (res.ok) {
          const j = await res.json();
          const txt = j.choices?.[0]?.message?.content;
          if (typeof txt === "string" && txt.trim()) synthesis = txt.trim();
        }
      } catch (e) {
        console.error("[mission-activity] synthesis AI call failed", e);
      }
    }

    return { synthesis, facts };
  });

const ResolveInput = z.object({ updateId: z.string().uuid(), missionId: z.string().uuid() });

export const resolveSos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ResolveInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("team_updates")
      .update({ resolved: true, resolved_at: new Date().toISOString() } as never)
      .eq("id", data.updateId)
      .eq("mission_id", data.missionId);
    if (error) throw error;
    return { ok: true };
  });

function defaultSynthesis(f: any): string {
  const parts: string[] = [];
  parts.push(
    `In the last ${f.window}: ${f.thread_count} Thread messages across ${f.questions_touched_in_thread} questions.`,
  );
  if (f.score_me_sessions > 0) {
    parts.push(
      `${f.score_me_sessions} Score Me sessions${f.average_score_me !== null ? ` — average coaching score ${f.average_score_me}` : ""}.`,
    );
  } else {
    parts.push("No Score Me sessions.");
  }
  parts.push(
    `${f.mission_pulse_signals} Mission Pulse signals. ${f.sos_events} SOS events. ${f.phone_a_friend_requests} expertise requests.`,
  );
  if (f.stale_questions_48h.length) {
    parts.push(
      `Questions with no activity in 48 hours: ${f.stale_questions_48h.join(", ")}.`,
    );
  } else {
    parts.push("All active questions have had recent activity.");
  }
  return parts.join(" ");
}
