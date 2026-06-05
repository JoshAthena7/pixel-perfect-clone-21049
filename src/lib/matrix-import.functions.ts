// Server functions for the "Upload Matrix → Source of Truth" workflow.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const QuestionSchema = z.object({
  question_number: z.string().trim().min(1).max(30),
  title: z.string().trim().min(1).max(280),
  question_text: z.string().trim().max(8000).optional().nullable(),
  section_number: z.string().trim().max(30).optional().nullable(),
  parent_number: z.string().trim().max(30).optional().nullable(),
  assigned_writer_name: z.string().trim().max(120).optional().nullable(),
  assigned_sme_name: z.string().trim().max(120).optional().nullable(),
  page_limit: z.number().int().min(1).max(999).optional().nullable(),
  evaluation_weight: z.number().min(0).max(1000).optional().nullable(),
  pens_down_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  scoring_criteria: z.string().trim().max(2000).optional().nullable(),
});

const MatrixSchema = z.object({
  missionId: z.string().uuid(),
  questions: z.array(QuestionSchema).min(1).max(500),
  replace: z.boolean().default(true),
});

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Admin role required.");
}

async function assertMissionAccess(supabase: any, missionId: string) {
  const { data, error } = await supabase
    .from("missions")
    .select("id")
    .eq("id", missionId)
    .maybeSingle();
  if (error || !data) throw new Error("Mission not found or not accessible.");
}

export const extractMissionMatrixFromUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        missionId: z.string().uuid(),
        filePath: z.string().min(1).max(500),
        fileName: z.string().min(1).max(255),
        mimeType: z.string().max(200).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    await assertMissionAccess(supabase, data.missionId);

    const { extractTextFromMatrixUpload, extractMatrixFromText } = await import(
      "./matrix-extract.server"
    );

    const text = await extractTextFromMatrixUpload(
      supabase,
      data.filePath,
      data.fileName,
      data.mimeType ?? null,
    );
    if (text.length < 50) throw new Error("Extracted file is too short to parse.");

    const matrix = await extractMatrixFromText(text);
    if (matrix.questions.length === 0)
      throw new Error("No questions were detected in this file.");

    return { ...matrix, textChars: text.length };
  });

/**
 * Commit a reviewed matrix as the mission's source-of-truth.
 * - REPLACE mode: wipes existing question_records for the mission, then inserts new ones.
 * - Creates placeholder writer_identities for SME names not already in the workspace.
 */
export const commitMissionMatrix = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => MatrixSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    await assertMissionAccess(supabase, data.missionId);

    // 1. Resolve names → profiles where possible (writers/SMEs that are real users in the mission).
    const allNames = new Set<string>();
    for (const q of data.questions) {
      if (q.assigned_writer_name) allNames.add(q.assigned_writer_name.toLowerCase());
      if (q.assigned_sme_name) allNames.add(q.assigned_sme_name.toLowerCase());
    }

    const profileMap = new Map<string, string>(); // lower(name) -> profile id
    if (allNames.size > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email");
      for (const p of (profiles as any[]) ?? []) {
        const candidates = [p.full_name, p.email].filter(Boolean).map((s) => String(s).toLowerCase());
        for (const c of candidates) {
          if (allNames.has(c) && !profileMap.has(c)) profileMap.set(c, p.id);
        }
      }
    }

    // 2. Placeholder writer_identities for names with no matching profile.
    const placeholderNames = new Set<string>();
    for (const q of data.questions) {
      const wn = q.assigned_writer_name?.toLowerCase();
      const sn = q.assigned_sme_name?.toLowerCase();
      if (wn && !profileMap.has(wn)) placeholderNames.add(q.assigned_writer_name!);
      if (sn && !profileMap.has(sn)) placeholderNames.add(q.assigned_sme_name!);
    }
    let placeholdersCreated = 0;
    if (placeholderNames.size > 0) {
      const namesArr = Array.from(placeholderNames);
      const { data: existing } = await supabase
        .from("writer_identities")
        .select("id, display_name")
        .in("display_name", namesArr);
      const existingSet = new Set(((existing as any[]) ?? []).map((r) => r.display_name));
      const toInsert = namesArr
        .filter((n) => !existingSet.has(n))
        .map((n) => ({
          display_name: n,
          metadata: { source: "matrix_upload", mission_id: data.missionId },
        }));
      if (toInsert.length > 0) {
        const { error: wiErr } = await supabase.from("writer_identities").insert(toInsert);
        if (wiErr) throw new Error(`writer_identities insert failed: ${wiErr.message}`);
        placeholdersCreated = toInsert.length;
      }
    }

    // 3. REPLACE: delete existing questions for the mission.
    let removed = 0;
    if (data.replace) {
      const { count, error: delErr } = await supabase
        .from("question_records")
        .delete({ count: "exact" })
        .eq("mission_id", data.missionId);
      if (delErr) throw new Error(`Failed to clear existing questions: ${delErr.message}`);
      removed = count ?? 0;
    }

    // 4. Insert new rows in two passes (parents first, then children, to wire parent_question_id).
    const numberToId = new Map<string, string>();

    const tops = data.questions.filter((q) => !q.parent_number);
    const children = data.questions.filter((q) => !!q.parent_number);

    function toRow(q: z.infer<typeof QuestionSchema>, sortOrder: number, parentId?: string | null) {
      const wKey = q.assigned_writer_name?.toLowerCase();
      const sKey = q.assigned_sme_name?.toLowerCase();
      return {
        mission_id: data.missionId,
        question_number: q.question_number,
        title: q.title,
        question_text: q.question_text ?? q.title,
        section_number: q.section_number ?? null,
        parent_question_id: parentId ?? null,
        assigned_writer_id: wKey ? profileMap.get(wKey) ?? null : null,
        assigned_sme_id: sKey ? profileMap.get(sKey) ?? null : null,
        page_limit: q.page_limit ?? null,
        evaluation_weight: q.evaluation_weight ?? null,
        pens_down_date: q.pens_down_date ?? null,
        scoring_criteria: q.scoring_criteria ?? null,
        status: "not_started",
        health: "yellow",
        sort_order: sortOrder,
      };
    }

    // Insert parents.
    if (tops.length > 0) {
      const rows = tops.map((q, i) => toRow(q, i * 10));
      const { data: inserted, error } = await supabase
        .from("question_records")
        .insert(rows)
        .select("id, question_number");
      if (error) throw new Error(`Insert parents failed: ${error.message}`);
      for (const r of (inserted as any[]) ?? []) numberToId.set(r.question_number, r.id);
    }

    // Insert children, wiring parent IDs.
    if (children.length > 0) {
      const rows = children.map((q, i) => {
        const parentId = q.parent_number ? numberToId.get(q.parent_number) ?? null : null;
        return toRow(q, 10_000 + i, parentId);
      });
      const { data: inserted, error } = await supabase
        .from("question_records")
        .insert(rows)
        .select("id, question_number");
      if (error) throw new Error(`Insert children failed: ${error.message}`);
      for (const r of (inserted as any[]) ?? []) numberToId.set(r.question_number, r.id);
    }

    // 5. Bump mission counters.
    await supabase
      .from("missions")
      .update({ question_count: data.questions.length, rfp_parsed: true })
      .eq("id", data.missionId);

    return {
      inserted: data.questions.length,
      removed,
      placeholdersCreated,
      matchedProfiles: profileMap.size,
    };
  });
