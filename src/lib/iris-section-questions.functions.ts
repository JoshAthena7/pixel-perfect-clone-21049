import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { callIris } from "./iris-prompts";
import { questionSetPrompt, refinedBriefPrompt } from "./iris-section-questions-prompts";

function parseJson(raw: string | null): unknown | null {
  if (!raw) return null;
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

/** List section briefs for a mission. */
export const listSectionBriefs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ mission_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("section_briefs")
      .select("*")
      .eq("mission_id", data.mission_id)
      .order("created_at", { ascending: true });
    if (error) return { success: false as const, error: error.message };
    return { success: true as const, briefs: rows ?? [] };
  });

/** Fetch a single section brief. */
export const getSectionBrief = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ section_brief_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("section_briefs")
      .select("*")
      .eq("id", data.section_brief_id)
      .maybeSingle();
    if (error) return { success: false as const, error: error.message };
    if (!row) return { success: false as const, error: "not_found" };
    return { success: true as const, brief: row };
  });

/** Create a new section brief shell. */
export const createSectionBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        mission_id: z.string().uuid(),
        section_id: z.string().uuid().optional(),
        section_name: z.string().min(1).max(255),
        content: z.unknown().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: inserted, error } = await context.supabase
      .from("section_briefs")
      .insert({
        mission_id: data.mission_id,
        section_id: data.section_id ?? null,
        section_name: data.section_name,
        content: (data.content as never) ?? null,
        question_status: "not_started",
        created_by: context.userId,
      })
      .select("*")
      .single();
    if (error) return { success: false as const, error: error.message };
    return { success: true as const, brief: inserted };
  });

/** Autosave writer answers. */
export const saveWriterAnswers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        section_brief_id: z.string().uuid(),
        writer_answers: z.record(z.string(), z.unknown()),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("section_briefs")
      .update({
        writer_answers: data.writer_answers as never,
        question_status: "answering",
      })
      .eq("id", data.section_brief_id);
    if (error) return { success: false as const, error: error.message };
    return { success: true as const, saved_at: new Date().toISOString() };
  });

/** Generate the IRIS Question Set for a section brief. */
export const generateQuestionSet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ section_brief_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: brief, error: briefErr } = await supabase
      .from("section_briefs")
      .select("id, mission_id, section_name, content")
      .eq("id", data.section_brief_id)
      .maybeSingle();
    if (briefErr || !brief) {
      return { success: false as const, error: "brief_not_found" };
    }

    // Require mission_intelligence to exist.
    const { data: intel } = await supabase
      .from("mission_intelligence")
      .select("layer, content")
      .eq("mission_id", brief.mission_id);
    const layers = new Set((intel ?? []).map((r) => r.layer));
    if (!layers.has("mission_brief") || !layers.has("strategic_assessment")) {
      return { success: false as const, error: "missing_mission_intelligence" };
    }

    const system = questionSetPrompt(brief.section_name);
    const userPayload = JSON.stringify({
      section_name: brief.section_name,
      section_writing_brief: brief.content ?? null,
      mission_intelligence: intel ?? [],
    });
    const raw = await callIris(system, userPayload);
    const parsed = parseJson(raw);
    if (!parsed || typeof parsed !== "object") {
      return { success: false as const, error: "malformed_json" };
    }

    const now = new Date().toISOString();
    const { error: updErr } = await supabase
      .from("section_briefs")
      .update({
        question_set: parsed as never,
        question_status: "questions_ready",
        questions_generated_at: now,
      })
      .eq("id", brief.id);
    if (updErr) return { success: false as const, error: updErr.message };

    const qs = parsed as Record<string, unknown>;
    const count = (key: string) => (Array.isArray(qs[key]) ? (qs[key] as unknown[]).length : 0);
    return {
      success: true as const,
      section_brief_id: brief.id,
      question_counts: {
        evaluator: count("evaluator_questions"),
        proof: count("proof_questions"),
        sme: count("sme_questions"),
        gap: count("gap_questions"),
      },
    };
  });

/** Submit answers + generate refined brief. */
export const refineBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        section_brief_id: z.string().uuid(),
        writer_answers: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // If writer_answers passed in, persist + mark submitted first.
    if (data.writer_answers) {
      const { error: saveErr } = await supabase
        .from("section_briefs")
        .update({
          writer_answers: data.writer_answers as never,
          question_status: "answers_submitted",
          answers_submitted_at: new Date().toISOString(),
        })
        .eq("id", data.section_brief_id);
      if (saveErr) return { success: false as const, error: saveErr.message };
    }

    const { data: brief, error: briefErr } = await supabase
      .from("section_briefs")
      .select(
        "id, mission_id, section_name, content, question_set, writer_answers, refined_brief_version",
      )
      .eq("id", data.section_brief_id)
      .maybeSingle();
    if (briefErr || !brief) return { success: false as const, error: "brief_not_found" };

    const system = refinedBriefPrompt(
      brief.section_name,
      brief.content,
      brief.writer_answers ?? data.writer_answers ?? {},
    );
    const userPayload = JSON.stringify({
      question_set: brief.question_set,
      writer_answers: brief.writer_answers ?? data.writer_answers ?? {},
    });
    const raw = await callIris(system, userPayload);
    const parsed = parseJson(raw);
    if (!parsed || typeof parsed !== "object") {
      return { success: false as const, error: "malformed_json" };
    }

    const nextVersion = (brief.refined_brief_version ?? 0) + 1;
    const now = new Date().toISOString();
    const { error: updErr } = await supabase
      .from("section_briefs")
      .update({
        refined_brief: parsed as never,
        refined_brief_version: nextVersion,
        question_status: "refined_brief_ready",
        refined_brief_generated_at: now,
      })
      .eq("id", brief.id);
    if (updErr) return { success: false as const, error: updErr.message };

    return { success: true as const, section_brief_id: brief.id, version: nextVersion };
  });
