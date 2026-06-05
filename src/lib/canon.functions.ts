// Canon CRUD + document-to-Canon extraction server functions.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const CATEGORIES = [
  "Federal Statutes",
  "Federal Regulations",
  "CMS Guidance",
  "Medicaid Authorities",
  "Medicare Authorities",
  "MACPAC / MedPAC",
  "KFF Reference",
  "Athena Playbooks",
  "Athena Methodologies",
  "Writing Standards",
] as const;

const EntrySchema = z.object({
  topic: z.string().trim().min(1).max(200),
  category: z.enum(CATEGORIES),
  citation: z.string().trim().max(200).optional().nullable(),
  content: z.string().trim().min(10).max(4000),
  source_url: z.string().trim().url().max(500).optional().nullable().or(z.literal("")),
  tags: z.array(z.string().trim().min(1).max(40)).max(8).optional(),
  priority: z.number().int().min(1).max(5).optional(),
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

export const createCanonEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => EntrySchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const row = {
      topic: data.topic,
      category: data.category,
      citation: data.citation || null,
      content: data.content,
      source_url: data.source_url ? data.source_url : null,
      tags: data.tags ?? [],
      priority: data.priority ?? 3,
      is_active: true,
      created_by: userId,
    };
    const { data: inserted, error } = await supabase
      .from("intelligence_canon")
      .insert(row)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: inserted.id };
  });

export const createManyCanonEntries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ entries: z.array(EntrySchema).min(1).max(50) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const rows = data.entries.map((e) => ({
      topic: e.topic,
      category: e.category,
      citation: e.citation || null,
      content: e.content,
      source_url: e.source_url ? e.source_url : null,
      tags: e.tags ?? [],
      priority: e.priority ?? 3,
      is_active: true,
      created_by: userId,
    }));
    const { error } = await supabase.from("intelligence_canon").insert(rows);
    if (error) throw new Error(error.message);
    return { inserted: rows.length };
  });

export const extractCanonFromUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        filePath: z.string().min(1).max(500),
        fileName: z.string().min(1).max(255),
        mimeType: z.string().max(200).optional().nullable(),
        sourceUrl: z.string().url().max(500).optional().nullable().or(z.literal("")),
        defaultCategory: z.enum(CATEGORIES).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { extractTextFromCanonUpload, suggestCanonEntriesFromText } = await import(
      "./canon-extract.server"
    );
    const text = await extractTextFromCanonUpload(
      supabase,
      data.filePath,
      data.fileName,
      data.mimeType ?? null,
    );
    if (text.length < 100) throw new Error("Extracted text too short to summarize.");
    const entries = await suggestCanonEntriesFromText(text, {
      sourceUrl: data.sourceUrl || undefined,
      defaultCategory: data.defaultCategory,
    });
    if (entries.length === 0) throw new Error("AI returned no Canon entries from this document.");
    return { entries, textChars: text.length };
  });
