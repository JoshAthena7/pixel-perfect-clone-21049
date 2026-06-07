import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* ────────────────────────── types ────────────────────────── */

export type ConsultContextSnapshot = {
  question_number?: string | null;
  question_title?: string | null;
  question_text?: string | null;
  section_name?: string | null;
  point_value?: number | null;
  pens_down_date?: string | null;
  iris_risk_flag?: string | null;
  iris_risk_flag_text?: string | null;
  iris_pre_brief?: Record<string, unknown> | null;
  draft_so_far?: string | null;
  mission_name?: string | null;
  state?: string | null;
  program_type?: string | null;
};

export type ConsultDraft = {
  subject: string;
  body: string;
  suggested_urgency: "urgent" | "standard" | "fyi";
  context: ConsultContextSnapshot;
};

export type ExternalExpert = {
  id: string;
  name: string;
  title: string | null;
  org: string | null;
  email: string | null;
  domain_tags: string[];
  states: string[];
  programs: string[];
  avg_response_hours: number | null;
  notes: string | null;
  score: number;
  reasons: string[];
};

export type ExpertConsultRow = {
  id: string;
  mission_id: string;
  question_id: string | null;
  section_id: string | null;
  requested_by: string;
  expert_user_id: string | null;
  external_expert_id: string | null;
  urgency: "urgent" | "standard" | "fyi";
  ask_subject: string;
  ask_body: string;
  context_snapshot: ConsultContextSnapshot;
  status: "sent" | "acknowledged" | "needs_info" | "reassigned" | "responded" | "closed";
  response_body: string | null;
  response_at: string | null;
  closed_at: string | null;
  resolution_note: string | null;
  created_at: string;
  updated_at: string;
};

/* ────────────────────────── helpers ────────────────────────── */

async function loadContext(
  supabase: any,
  missionId: string,
  questionId: string | null,
): Promise<ConsultContextSnapshot> {
  const ctx: ConsultContextSnapshot = {};
  const { data: mission } = await supabase
    .from("missions")
    .select("name,state,program_type")
    .eq("id", missionId)
    .maybeSingle();
  if (mission) {
    ctx.mission_name = mission.name ?? null;
    ctx.state = mission.state ?? null;
    ctx.program_type = mission.program_type ?? null;
  }

  if (!questionId) return ctx;

  const { data: q } = await supabase
    .from("question_records")
    .select(
      "question_number,title,question_text,point_value,pens_down_date,iris_risk_flag,iris_risk_flag_text,iris_pre_brief,section_number",
    )
    .eq("id", questionId)
    .maybeSingle();

  if (q) {
    ctx.question_number = q.question_number;
    ctx.question_title = q.title;
    ctx.question_text = q.question_text;
    ctx.point_value = q.point_value;
    ctx.pens_down_date = q.pens_down_date;
    ctx.iris_risk_flag = q.iris_risk_flag;
    ctx.iris_risk_flag_text = q.iris_risk_flag_text;
    ctx.iris_pre_brief = q.iris_pre_brief;

    if (q.section_number) {
      const { data: section } = await supabase
        .from("mission_sections")
        .select("title")
        .eq("mission_id", missionId)
        .eq("section_number", q.section_number)
        .maybeSingle();
      ctx.section_name = section?.title ?? q.section_number;
    }
  }

  // Latest draft so the expert can react rather than start cold
  const { data: latest } = await supabase
    .from("question_collaboration")
    .select("body,entry_type,created_at")
    .eq("question_id", questionId)
    .in("entry_type", ["draft", "draft_update", "response_draft"])
    .order("created_at", { ascending: false })
    .limit(1);
  if (latest && latest.length > 0) {
    ctx.draft_so_far = latest[0].body;
  }

  return ctx;
}

function fallbackDraft(ctx: ConsultContextSnapshot): ConsultDraft {
  const qLabel = ctx.question_number ? `Q${ctx.question_number}` : "this question";
  const subject = ctx.question_title
    ? `Phone a Friend · ${qLabel} — ${ctx.question_title}`
    : `Phone a Friend · ${ctx.mission_name ?? "Mission consult"}`;

  const lines: string[] = [];
  lines.push(`I'm working on ${qLabel}${ctx.section_name ? ` in ${ctx.section_name}` : ""} for the ${ctx.mission_name ?? "current"} pursuit and could use your read.`);
  if (ctx.question_text) lines.push(`\n**The ask:**\n${ctx.question_text.slice(0, 600)}`);
  const ctxBits: string[] = [];
  if (ctx.point_value) ctxBits.push(`${ctx.point_value} pts`);
  if (ctx.pens_down_date) ctxBits.push(`pens down ${ctx.pens_down_date}`);
  if (ctxBits.length) lines.push(`\n**PRISIM™ context:** ${ctxBits.join(" · ")}`);
  if (ctx.iris_risk_flag_text) lines.push(`\n**IRIS flag:** ${ctx.iris_risk_flag_text}`);
  if (ctx.draft_so_far) lines.push(`\n**Draft so far (for you to react to):**\n${ctx.draft_so_far.slice(0, 500)}`);
  lines.push(`\n**Specific question for you:** What's the one move that lifts the score on this — angle, evidence, language, or someone else I should talk to?`);

  let urgency: ConsultDraft["suggested_urgency"] = "standard";
  if (ctx.pens_down_date) {
    const days = Math.ceil((new Date(ctx.pens_down_date).getTime() - Date.now()) / 86_400_000);
    if (days <= 3) urgency = "urgent";
    else if (days >= 14) urgency = "fyi";
  }

  return { subject, body: lines.join("\n"), suggested_urgency: urgency, context: ctx };
}

async function generateDraftWithIris(ctx: ConsultContextSnapshot): Promise<ConsultDraft | null> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return null;
  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              "You are IRIS, drafting a Phone-a-Friend expert consult ask. Return STRICT JSON with keys: subject (string, max 90 chars), body (markdown, 120-220 words), suggested_urgency ('urgent'|'standard'|'fyi'). The body MUST contain these sections in order: a one-sentence what & why, PRISIM context (point weight, due date, IRIS flags), the draft so far if any (otherwise omit), and ONE precise question for the expert — never 'please help'. Reference the actual mission, state, and program. Do not greet, do not sign off.",
          },
          {
            role: "user",
            content: JSON.stringify(ctx),
          },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!r.ok) return null;
    const json = await r.json();
    const text = json?.choices?.[0]?.message?.content?.trim();
    if (!text) return null;
    const parsed = JSON.parse(text);
    if (typeof parsed?.subject !== "string" || typeof parsed?.body !== "string") return null;
    const urgency: ConsultDraft["suggested_urgency"] =
      parsed.suggested_urgency === "urgent" || parsed.suggested_urgency === "fyi"
        ? parsed.suggested_urgency
        : "standard";
    return {
      subject: parsed.subject.slice(0, 120),
      body: parsed.body,
      suggested_urgency: urgency,
      context: ctx,
    };
  } catch (e) {
    console.warn("IRIS consult draft failed", e);
    return null;
  }
}

/* ────────────────────────── buildConsultDraft ────────────────────────── */

const BuildDraftInput = z.object({
  missionId: z.string().uuid(),
  questionId: z.string().uuid().nullable().optional(),
});

export const buildConsultDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => BuildDraftInput.parse(input))
  .handler(async ({ data, context }): Promise<ConsultDraft> => {
    const ctx = await loadContext(context.supabase, data.missionId, data.questionId ?? null);
    const iris = await generateDraftWithIris(ctx);
    return iris ?? fallbackDraft(ctx);
  });

/* ────────────────────────── matchExternalExperts ────────────────────────── */

const MatchExternalInput = z.object({
  missionId: z.string().uuid(),
  questionId: z.string().uuid().nullable().optional(),
});

function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s/&-]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 3),
  );
}

export const matchExternalExperts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => MatchExternalInput.parse(input))
  .handler(async ({ data, context }): Promise<ExternalExpert[]> => {
    const { supabase } = context;
    const ctx = await loadContext(supabase, data.missionId, data.questionId ?? null);
    const { data: directory = [] } = await supabase
      .from("expert_directory")
      .select("id,name,title,org,email,domain_tags,states,programs,avg_response_hours,notes,active")
      .eq("active", true);

    if (!directory || directory.length === 0) return [];

    const qText = `${ctx.question_title ?? ""} ${ctx.question_text ?? ""}`;
    const qTokens = tokens(qText);
    const stateUpper = String(ctx.state ?? "").toUpperCase();
    const programLower = String(ctx.program_type ?? "").toLowerCase();

    const scored: ExternalExpert[] = (directory as any[]).map((e) => {
      const reasons: string[] = [];
      let score = 0;
      const tags: string[] = e.domain_tags ?? [];
      const tagTokens = tokens(tags.join(" "));
      let hits = 0;
      for (const t of qTokens) if (tagTokens.has(t)) hits++;
      if (hits > 0) {
        score += Math.min(1, hits / 3) * 0.6;
        const matched = tags.filter((t: string) => qText.toLowerCase().includes(t.toLowerCase())).slice(0, 2);
        if (matched.length) reasons.push(`tagged ${matched.join(" & ")}`);
      }
      if (stateUpper && (e.states ?? []).some((s: string) => s.toUpperCase() === stateUpper)) {
        score += 0.2;
        reasons.push(`worked in ${ctx.state}`);
      }
      if (programLower && (e.programs ?? []).some((p: string) => p.toLowerCase().includes(programLower))) {
        score += 0.2;
        reasons.push(`${ctx.program_type} background`);
      }
      return {
        id: e.id,
        name: e.name,
        title: e.title,
        org: e.org,
        email: e.email,
        domain_tags: tags,
        states: e.states ?? [],
        programs: e.programs ?? [],
        avg_response_hours: e.avg_response_hours,
        notes: e.notes,
        score,
        reasons,
      };
    });

    return scored.filter((s) => s.score > 0 || qTokens.size === 0).sort((a, b) => b.score - a.score).slice(0, 8);
  });

/* ────────────────────────── sendConsult ────────────────────────── */

const SendConsultInput = z.object({
  missionId: z.string().uuid(),
  questionId: z.string().uuid().nullable().optional(),
  expertUserId: z.string().uuid().nullable().optional(),
  externalExpertId: z.string().uuid().nullable().optional(),
  urgency: z.enum(["urgent", "standard", "fyi"]),
  askSubject: z.string().min(1).max(200),
  askBody: z.string().min(1).max(8000),
  contextSnapshot: z.record(z.any()).optional(),
});

export const sendConsult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SendConsultInput.parse(input))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { supabase, userId } = context;

    if (!data.expertUserId && !data.externalExpertId) {
      throw new Error("Pick an internal teammate or an external expert.");
    }

    const { data: row, error } = await supabase
      .from("expert_consults")
      .insert({
        mission_id: data.missionId,
        question_id: data.questionId ?? null,
        requested_by: userId,
        expert_user_id: data.expertUserId ?? null,
        external_expert_id: data.externalExpertId ?? null,
        urgency: data.urgency,
        ask_subject: data.askSubject,
        ask_body: data.askBody,
        context_snapshot: data.contextSnapshot ?? {},
        status: "sent",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    // Cross-post to question thread so the consult is visible in the reconciliation row
    if (data.questionId) {
      await supabase.from("question_collaboration").insert({
        question_id: data.questionId,
        mission_id: data.missionId,
        author_id: userId,
        entry_type: "phone_a_friend",
        body: `Phone-a-Friend request sent: ${data.askSubject}`,
      });
    }

    // Surface on Air Traffic Control via signals stream
    await supabase.from("signals").insert({
      mission_id: data.missionId,
      signal_type: "expert_consult",
      signal_title: data.askSubject,
      signal_summary: `Phone-a-Friend request · urgency ${data.urgency}`,
      severity: data.urgency === "urgent" ? "high" : "medium",
      status: "active",
    });

    return { id: row.id };
  });

/* ────────────────────────── listMissionConsults ────────────────────────── */

const ListInput = z.object({ missionId: z.string().uuid() });

export const listMissionConsults = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ListInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("expert_consults")
      .select("*")
      .eq("mission_id", data.missionId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (rows ?? []) as ExpertConsultRow[];
  });

/* ────────────────────────── listMyInbox ────────────────────────── */

export const listMyInbox = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(
  async ({ context }) => {
    const { data: rows, error } = await context.supabase
      .from("expert_consults")
      .select("*")
      .eq("expert_user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (rows ?? []) as ExpertConsultRow[];
  },
);

export const inboxUnreadCount = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(
  async ({ context }) => {
    const { count } = await context.supabase
      .from("expert_consults")
      .select("id", { count: "exact", head: true })
      .eq("expert_user_id", context.userId)
      .in("status", ["sent", "acknowledged", "needs_info"]);
    return { count: count ?? 0 };
  },
);

/* ────────────────────────── consult lifecycle ────────────────────────── */

const ConsultActionInput = z.object({
  consultId: z.string().uuid(),
  note: z.string().max(4000).optional(),
});

export const ackConsult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ConsultActionInput.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("expert_consults")
      .update({ status: "acknowledged" })
      .eq("id", data.consultId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const requestMoreInfo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ConsultActionInput.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("expert_consults")
      .update({ status: "needs_info", resolution_note: data.note ?? null })
      .eq("id", data.consultId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const ReassignInput = z.object({
  consultId: z.string().uuid(),
  newExpertUserId: z.string().uuid().nullable().optional(),
  newExternalExpertId: z.string().uuid().nullable().optional(),
  note: z.string().max(2000).optional(),
});

export const reassignConsult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ReassignInput.parse(input))
  .handler(async ({ data, context }) => {
    if (!data.newExpertUserId && !data.newExternalExpertId) {
      throw new Error("Suggest who should take this instead.");
    }
    const { error } = await context.supabase
      .from("expert_consults")
      .update({
        status: "reassigned",
        expert_user_id: data.newExpertUserId ?? null,
        external_expert_id: data.newExternalExpertId ?? null,
        resolution_note: data.note ?? null,
      })
      .eq("id", data.consultId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const RespondInput = z.object({
  consultId: z.string().uuid(),
  body: z.string().min(1).max(16000),
});

export const respondToConsult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => RespondInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("expert_consults")
      .update({
        status: "responded",
        response_body: data.body,
        response_at: new Date().toISOString(),
      })
      .eq("id", data.consultId)
      .select("mission_id,question_id,ask_subject")
      .single();
    if (error) throw new Error(error.message);

    // Attach response to the question thread (lands in reconciliation row)
    if (row?.question_id) {
      await supabase.from("question_collaboration").insert({
        question_id: row.question_id,
        mission_id: row.mission_id,
        author_id: userId,
        entry_type: "expert_response",
        body: `Expert response — ${row.ask_subject}\n\n${data.body}`,
      });
    }

    return { ok: true };
  });

export const closeConsult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ConsultActionInput.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("expert_consults")
      .update({
        status: "closed",
        closed_at: new Date().toISOString(),
        resolution_note: data.note ?? null,
      })
      .eq("id", data.consultId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
