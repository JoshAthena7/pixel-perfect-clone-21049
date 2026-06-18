import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CATEGORY_VALUES = [
  "waivers_authorities",
  "state_plan_amendments",
  "managed_care_landscape",
  "quality_strategy",
  "directed_payments",
  "core_set_performance",
  "legislative_budget",
  "rate_setting",
  "eligibility_enrollment",
  "workforce_network",
  "demographics_health",
  "litigation_compliance",
] as const;

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin only");
}

// List packs + counts per category for the grid view.
export const listStateIntelPacks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: packs, error: packErr } = await supabase
      .from("state_intel_packs")
      .select("state_code,state_name,notes,last_reviewed_at,updated_at");
    if (packErr) throw new Error(packErr.message);

    const { data: docs, error: docErr } = await supabase
      .from("state_intel_documents")
      .select("state_code,category,is_current");
    if (docErr) throw new Error(docErr.message);

    const completeness: Record<string, Set<string>> = {};
    for (const d of docs ?? []) {
      if (!d.is_current) continue;
      if (!completeness[d.state_code]) completeness[d.state_code] = new Set();
      completeness[d.state_code].add(d.category);
    }

    return (packs ?? []).map((p) => ({
      ...p,
      categories_filled: completeness[p.state_code]?.size ?? 0,
    }));
  });

export const getStateIntelPack = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { stateCode: string }) =>
    z.object({ stateCode: z.string().length(2).max(3) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: pack, error: pErr } = await supabase
      .from("state_intel_packs")
      .select("*")
      .eq("state_code", data.stateCode)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!pack) return { pack: null, documents: [], missions: [] };

    const { data: docs, error: dErr } = await supabase
      .from("state_intel_documents")
      .select("*")
      .eq("state_code", data.stateCode)
      .order("uploaded_at", { ascending: false });
    if (dErr) throw new Error(dErr.message);

    // Find missions in this state (best-effort: filter by state column)
    const { data: missions } = await supabase
      .from("missions")
      .select("id,name,status,state")
      .eq("state", data.stateCode);

    return { pack, documents: docs ?? [], missions: missions ?? [] };
  });

export const createStateIntelPack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { stateCode: string; stateName: string }) =>
    z.object({ stateCode: z.string().min(2).max(3), stateName: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("state_intel_packs").insert({
      state_code: data.stateCode,
      state_name: data.stateName,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const markStatePackReviewed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { stateCode: string; notes?: string }) =>
    z.object({ stateCode: z.string(), notes: z.string().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("state_intel_packs")
      .update({
        last_reviewed_at: new Date().toISOString(),
        last_reviewed_by: context.userId,
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
      })
      .eq("state_code", data.stateCode);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const recordStateIntelDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    stateCode: string;
    category: string;
    title: string;
    description?: string;
    storagePath: string;
    fileSize?: number;
    mimeType?: string;
    effectiveDate?: string;
  }) =>
    z.object({
      stateCode: z.string(),
      category: z.enum(CATEGORY_VALUES),
      title: z.string().min(1),
      description: z.string().optional(),
      storagePath: z.string().min(1),
      fileSize: z.number().optional(),
      mimeType: z.string().optional(),
      effectiveDate: z.string().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("state_intel_documents")
      .insert({
        state_code: data.stateCode,
        category: data.category,
        title: data.title,
        description: data.description,
        storage_path: data.storagePath,
        file_size: data.fileSize,
        mime_type: data.mimeType,
        effective_date: data.effectiveDate || null,
        uploaded_by: context.userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const archiveStateIntelDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("state_intel_documents")
      .update({ is_current: false })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteStateIntelDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; storagePath: string }) =>
    z.object({ id: z.string().uuid(), storagePath: z.string() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    // Remove storage file (best-effort) then DB row.
    await context.supabase.storage.from("state-intel").remove([data.storagePath]);
    const { error } = await context.supabase
      .from("state_intel_documents")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getStateIntelDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { storagePath: string }) =>
    z.object({ storagePath: z.string() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: signed, error } = await context.supabase.storage
      .from("state-intel")
      .createSignedUrl(data.storagePath, 60 * 10);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });
