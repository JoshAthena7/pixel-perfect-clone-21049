import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { callIris } from "./iris-prompts";
import { interviewPlanPrompt, interviewDebriefPrompt } from "./iris-interview-prompts";

function parseJson(raw: string | null): unknown | null {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

function truncate(s: string | null | undefined, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

/** List interview flight plans for a mission, with debrief counts. */
export const listInterviewPlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ mission_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: plans, error } = await context.supabase
      .from("interview_flight_plans")
      .select("*")
      .eq("mission_id", data.mission_id)
      .order("created_at", { ascending: false });
    if (error) return { success: false as const, error: error.message };
    return { success: true as const, plans: plans ?? [] };
  });

/** Fetch a single plan + its most recent debrief. */
export const getInterviewPlan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ interview_flight_plan_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: plan, error } = await context.supabase
      .from("interview_flight_plans")
      .select("*")
      .eq("id", data.interview_flight_plan_id)
      .maybeSingle();
    if (error) return { success: false as const, error: error.message };
    if (!plan) return { success: false as const, error: "not_found" };

    const { data: debrief } = await context.supabase
      .from("interview_debriefs")
      .select("*")
      .eq("interview_flight_plan_id", data.interview_flight_plan_id)
      .order("analyzed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return { success: true as const, plan, debrief: debrief ?? null };
  });

/** Create a new plan shell. */
export const createInterviewPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        mission_id: z.string().uuid(),
        section_brief_id: z.string().uuid().optional().nullable(),
        sme_name: z.string().min(1).max(255),
        sme_role: z.string().min(1).max(255),
        sme_organization: z.string().max(255).optional().nullable(),
        sme_type: z.enum(["internal", "client_sme", "subject_expert"]),
        assigned_to: z.string().uuid().optional().nullable(),
        scheduled_at: z.string().optional().nullable(),
        additional_context: z.string().max(4000).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("interview_flight_plans")
      .insert({
        mission_id: data.mission_id,
        section_brief_id: data.section_brief_id ?? null,
        sme_name: data.sme_name,
        sme_role: data.sme_role,
        sme_organization: data.sme_organization ?? null,
        sme_type: data.sme_type,
        assigned_to: data.assigned_to ?? null,
        scheduled_at: data.scheduled_at ?? null,
        additional_context: data.additional_context ?? null,
        status: "draft",
        created_by: context.userId,
      })
      .select("*")
      .single();
    if (error) return { success: false as const, error: error.message };
    return { success: true as const, plan: row };
  });

/** Update lightweight fields (assignment, schedule, status). */
export const updateInterviewPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        interview_flight_plan_id: z.string().uuid(),
        status: z.string().optional(),
        scheduled_at: z.string().nullable().optional(),
        assigned_to: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {};
    if (data.status !== undefined) patch.status = data.status;
    if (data.scheduled_at !== undefined) patch.scheduled_at = data.scheduled_at;
    if (data.assigned_to !== undefined) patch.assigned_to = data.assigned_to;
    if (data.status === "complete") patch.completed_at = new Date().toISOString();
    const { error } = await context.supabase
      .from("interview_flight_plans")
      .update(patch as never)
      .eq("id", data.interview_flight_plan_id);
    if (error) return { success: false as const, error: error.message };
    return { success: true as const };
  });

/** Delete a plan. */
export const deleteInterviewPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ interview_flight_plan_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("interview_flight_plans")
      .delete()
      .eq("id", data.interview_flight_plan_id);
    if (error) return { success: false as const, error: error.message };
    return { success: true as const };
  });

/** Generate the Interview Flight Plan™ via IRIS. */
export const generateInterviewPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ interview_flight_plan_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: plan, error: pErr } = await context.supabase
      .from("interview_flight_plans")
      .select("*")
      .eq("id", data.interview_flight_plan_id)
      .maybeSingle();
    if (pErr || !plan) return { success: false as const, error: pErr?.message ?? "not_found" };

    // Section context (optional).
    let sectionContext = "This is a standalone interview — not tied to a specific proposal section.";
    if (plan.section_brief_id) {
      const { data: sb } = await context.supabase
        .from("section_briefs")
        .select("section_name, content, question_set, refined_brief")
        .eq("id", plan.section_brief_id)
        .maybeSingle();
      if (sb) {
        sectionContext = `Section: ${sb.section_name}\nBrief: ${truncate(JSON.stringify(sb.content), 2000)}\nRefined brief: ${truncate(JSON.stringify(sb.refined_brief), 2000)}`;
      }
    }

    // Mission intelligence (most recent of each layer).
    const { data: intels } = await context.supabase
      .from("mission_intelligence")
      .select("layer, content, created_at")
      .eq("mission_id", plan.mission_id)
      .order("created_at", { ascending: false });

    const missionBrief = intels?.find((r) => r.layer === "mission_brief")?.content ?? null;
    const strategic = intels?.find((r) => r.layer === "strategic_assessment")?.content ?? null;

    // Compliance requirements (best-effort relevance).
    const { data: reqs } = await context.supabase
      .from("compliance_requirements")
      .select("id, requirement_text, plain_language, severity")
      .eq("mission_id", plan.mission_id)
      .limit(40);

    const relevantReqs =
      (reqs ?? [])
        .map((r) => `- [${r.id}] (${r.severity}) ${truncate(r.plain_language ?? r.requirement_text, 240)}`)
        .join("\n") || "No outstanding requirements indexed for this mission.";

    const prompt = interviewPlanPrompt({
      sme_name: plan.sme_name,
      sme_role: plan.sme_role,
      sme_organization: plan.sme_organization,
      sme_type: plan.sme_type,
      section_context: sectionContext,
      mission_brief_summary: truncate(JSON.stringify(missionBrief), 3000) || "No mission brief generated yet.",
      strategic_highlights: truncate(JSON.stringify(strategic), 3000) || "No strategic assessment generated yet.",
      relevant_requirements: relevantReqs,
      additional_context: plan.additional_context,
    });

    const raw = await callIris(
      "You are IRIS. Return only valid JSON matching the schema. No markdown, no preamble.",
      prompt,
    );
    const parsed = parseJson(raw);
    if (!parsed) return { success: false as const, error: "iris_invalid_json" };

    const { error: uErr } = await context.supabase
      .from("interview_flight_plans")
      .update({
        content: parsed as never,
        status: "plan_ready",
        generated_at: new Date().toISOString(),
      })
      .eq("id", plan.id);
    if (uErr) return { success: false as const, error: uErr.message };

    return { success: true as const, interview_flight_plan_id: plan.id };
  });

/** Run an IRIS debrief from pasted notes. Raw notes are NEVER persisted. */
export const runInterviewDebrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        interview_flight_plan_id: z.string().uuid(),
        raw_notes: z.string().min(200).max(50000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: plan, error: pErr } = await context.supabase
      .from("interview_flight_plans")
      .select("id, content, mission_id, section_brief_id")
      .eq("id", data.interview_flight_plan_id)
      .maybeSingle();
    if (pErr || !plan) return { success: false as const, error: pErr?.message ?? "not_found" };
    if (!plan.content) return { success: false as const, error: "plan_not_generated" };

    const prompt = interviewDebriefPrompt({
      interview_plan_json: truncate(JSON.stringify(plan.content), 12000),
      raw_notes: data.raw_notes,
    });

    const raw = await callIris(
      "You are IRIS. Return only valid JSON matching the schema. Raw notes are not stored. No markdown, no preamble.",
      prompt,
    );
    const parsed = parseJson(raw) as Record<string, unknown> | null;
    if (!parsed) return { success: false as const, error: "iris_invalid_json" };

    const stories = (parsed.stories_found ?? []) as unknown[];
    const gaps = (parsed.gaps_remaining ?? []) as unknown[];
    const risks = (parsed.risk_signals ?? []) as unknown[];
    const followup = (parsed.recommended_followup ?? []) as unknown[];

    const { error: iErr } = await context.supabase.from("interview_debriefs").insert({
      interview_flight_plan_id: plan.id,
      iris_analysis: parsed as never,
      stories_extracted: stories as never,
      gaps_remaining: gaps as never,
      risk_signals: risks as never,
      recommended_followup: followup as never,
      analyzed_at: new Date().toISOString(),
    });
    if (iErr) return { success: false as const, error: iErr.message };

    await context.supabase
      .from("interview_flight_plans")
      .update({ status: "debriefed", completed_at: new Date().toISOString() })
      .eq("id", plan.id);

    return {
      success: true as const,
      stories_found: stories.length,
      requirements_updated: ((parsed.requirements_addressed ?? []) as unknown[]).length,
      gaps_remaining: gaps.length,
      risk_signals: risks.length,
    };
  });

/** Add a story from a debrief into the linked section_brief's writer_answers. */
export const addStoryToSectionBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        section_brief_id: z.string().uuid(),
        story_id: z.string().min(1).max(64),
        story_text: z.string().min(1).max(8000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: sb, error } = await context.supabase
      .from("section_briefs")
      .select("writer_answers")
      .eq("id", data.section_brief_id)
      .maybeSingle();
    if (error || !sb) return { success: false as const, error: error?.message ?? "not_found" };
    const answers = ((sb.writer_answers ?? {}) as Record<string, string>) || {};
    const key = `INTERVIEW_${data.story_id}`;
    answers[key] = data.story_text;
    const { error: uErr } = await context.supabase
      .from("section_briefs")
      .update({ writer_answers: answers as never })
      .eq("id", data.section_brief_id);
    if (uErr) return { success: false as const, error: uErr.message };
    return { success: true as const };
  });
