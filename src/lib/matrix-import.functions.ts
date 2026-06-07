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
  volume: z.string().trim().max(120).optional().nullable(),
  assigned_writer_name: z.string().trim().max(120).optional().nullable(),
  assigned_sme_name: z.string().trim().max(120).optional().nullable(),
  strategic_owner_name: z.string().trim().max(120).optional().nullable(),
  support_sme_names: z.array(z.string().trim().min(1).max(120)).max(10).optional().nullable(),
  page_limit: z.number().int().min(1).max(999).optional().nullable(),
  evaluation_weight: z.number().min(0).max(1000).optional().nullable(),
  pens_down_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  scoring_criteria: z.string().trim().max(2000).optional().nullable(),
  import_notes: z.string().trim().max(4000).optional().nullable(),
});

const MatrixSchema = z.object({
  missionId: z.string().uuid(),
  questions: z.array(QuestionSchema).min(1).max(500),
  replace: z.boolean().default(true),
});

const MappingTargetSchema = z.enum([
  "skip",
  "question_number",
  "title",
  "question_text",
  "section_number",
  "parent_number",
  "volume",
  "assigned_writer_name",
  "assigned_sme_name",
  "strategic_owner_name",
  "support_sme_names",
  "page_limit",
  "evaluation_weight",
  "pens_down_date",
  "scoring_criteria",
  "import_notes",
]);

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

// ───────────────────────────────────────────────────────────────────────────
// Spreadsheet preview (Step 2/3: header detection + field-mapping guess).
// ───────────────────────────────────────────────────────────────────────────

export const previewMissionMatrixSpreadsheet = createServerFn({ method: "POST" })
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

    const { previewSpreadsheet } = await import("./matrix-extract.server");
    const preview = await previewSpreadsheet(
      supabase,
      data.filePath,
      data.fileName,
      data.mimeType ?? null,
    );
    return preview;
  });

export const applyMissionMatrixMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        missionId: z.string().uuid(),
        filePath: z.string().min(1).max(500),
        fileName: z.string().min(1).max(255),
        mimeType: z.string().max(200).optional().nullable(),
        mapping: z.record(z.string(), MappingTargetSchema),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    await assertMissionAccess(supabase, data.missionId);

    const { applySpreadsheetMapping } = await import("./matrix-extract.server");
    const questions = await applySpreadsheetMapping(
      supabase,
      data.filePath,
      data.fileName,
      data.mimeType ?? null,
      data.mapping,
    );

    // Collect unique people for the review screen (writer/sme/owner roles).
    const peopleMap = new Map<string, { name: string; role: "writer" | "sme" | "owner" }>();
    const add = (name: string | undefined, role: "writer" | "sme" | "owner") => {
      const n = (name ?? "").trim();
      if (!n) return;
      const key = `${n.toLowerCase()}|${role}`;
      if (!peopleMap.has(key)) peopleMap.set(key, { name: n, role });
    };
    for (const q of questions) {
      add(q.assigned_writer_name, "writer");
      add(q.assigned_sme_name, "sme");
      add(q.strategic_owner_name, "owner");
      (q.support_sme_names ?? []).forEach((n) => add(n, "sme"));
    }
    return {
      questions,
      people: Array.from(peopleMap.values()),
      notes: `Mapped ${questions.length} rows from spreadsheet using your column choices.`,
    };
  });

// ───────────────────────────────────────────────────────────────────────────
// AI-extraction path (used for PDF/DOCX, or as a fallback for spreadsheets).
// ───────────────────────────────────────────────────────────────────────────

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

// ───────────────────────────────────────────────────────────────────────────
// Commit: REPLACE-mode insert into question_records as source of truth.
// ───────────────────────────────────────────────────────────────────────────

export const commitMissionMatrix = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => MatrixSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    await assertMissionAccess(supabase, data.missionId);

    // 1. Resolve names → profiles where possible.
    const allNames = new Set<string>();
    for (const q of data.questions) {
      if (q.assigned_writer_name) allNames.add(q.assigned_writer_name.toLowerCase());
      if (q.assigned_sme_name) allNames.add(q.assigned_sme_name.toLowerCase());
      if (q.strategic_owner_name) allNames.add(q.strategic_owner_name.toLowerCase());
      for (const n of q.support_sme_names ?? []) allNames.add(n.toLowerCase());
    }

    const profileMap = new Map<string, string>(); // lower(name|email) -> profile id
    if (allNames.size > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, email");
      for (const p of (profiles as any[]) ?? []) {
        const candidates = [p.display_name, p.email].filter(Boolean).map((s) => String(s).toLowerCase());
        for (const c of candidates) {
          if (allNames.has(c) && !profileMap.has(c)) profileMap.set(c, p.id);
        }
      }
    }

    // 2. Placeholder writer_identities for names with no profile.
    const placeholderNames = new Set<string>();
    for (const q of data.questions) {
      const candidates = [
        q.assigned_writer_name,
        q.assigned_sme_name,
        q.strategic_owner_name,
        ...(q.support_sme_names ?? []),
      ];
      for (const c of candidates) {
        if (c && !profileMap.has(c.toLowerCase())) placeholderNames.add(c);
      }
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

    // 3. REPLACE: delete existing questions for this mission.
    let removed = 0;
    if (data.replace) {
      const { count, error: delErr } = await supabase
        .from("question_records")
        .delete({ count: "exact" })
        .eq("mission_id", data.missionId);
      if (delErr) throw new Error(`Failed to clear existing questions: ${delErr.message}`);
      removed = count ?? 0;
    }

    // 4. Insert rows: parents first, then children (to wire parent_question_id).
    const numberToId = new Map<string, string>();
    const tops = data.questions.filter((q) => !q.parent_number);
    const children = data.questions.filter((q) => !!q.parent_number);

    const resolveId = (name?: string | null): string | null =>
      name ? profileMap.get(name.toLowerCase()) ?? null : null;
    const resolveIds = (names?: string[] | null): string[] => {
      if (!names) return [];
      const out: string[] = [];
      for (const n of names) {
        const id = resolveId(n);
        if (id && !out.includes(id)) out.push(id);
      }
      return out;
    };

    function toRow(q: z.infer<typeof QuestionSchema>, sortOrder: number, parentId?: string | null) {
      return {
        mission_id: data.missionId,
        question_number: q.question_number,
        title: q.title,
        question_text: q.question_text ?? q.title,
        section_number: q.section_number ?? null,
        parent_question_id: parentId ?? null,
        assigned_writer_id: resolveId(q.assigned_writer_name),
        assigned_sme_id: resolveId(q.assigned_sme_name),
        strategic_owner_id: resolveId(q.strategic_owner_name),
        support_sme_ids: resolveIds(q.support_sme_names),
        page_limit: q.page_limit ?? null,
        evaluation_weight: q.evaluation_weight ?? null,
        pens_down_date: q.pens_down_date ?? null,
        scoring_criteria: q.scoring_criteria ?? null,
        import_notes: q.import_notes ?? null,
        // Spec defaults
        status: "not_started",
        sme_meeting_status: "not_scheduled",
        health: "yellow", // will be recalculated by trigger
        sort_order: sortOrder,
      };
    }

    if (tops.length > 0) {
      const rows = tops.map((q, i) => toRow(q, i * 10));
      const { data: inserted, error } = await supabase
        .from("question_records")
        .insert(rows)
        .select("id, question_number");
      if (error) throw new Error(`Insert parents failed: ${error.message}`);
      for (const r of (inserted as any[]) ?? []) numberToId.set(r.question_number, r.id);
    }

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

    // 6. Generate IRIS staffing summary.
    let staffingSummary: any = null;
    try {
      const { computeAndStoreStaffingSummary } = await import("./mission-staffing.server");
      staffingSummary = await computeAndStoreStaffingSummary(supabase, data.missionId, userId);
    } catch (e: any) {
      // Non-fatal — log but don't block the commit.
      console.warn("[commitMissionMatrix] staffing summary failed", e?.message ?? e);
    }

    return {
      inserted: data.questions.length,
      removed,
      placeholdersCreated,
      matchedProfiles: profileMap.size,
      staffingSummary,
    };
  });
