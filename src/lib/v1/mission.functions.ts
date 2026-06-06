import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { NJ_CSOC_MISSION_ID } from "./mission";

/** One-shot fetch powering /v1/command. */
export const getMissionOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const id = NJ_CSOC_MISSION_ID;

    const [
      { data: mission },
      { data: themes },
      { data: sections },
      { data: clarifications },
      { data: myMembership },
    ] = await Promise.all([
      supabase
        .from("missions")
        .select(
          "id,name,client,state_agency,program_type,submission_date,status,health,contract_value,qa_deadline,pens_down_date",
        )
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("win_themes")
        .select("id,title,description,question_ids")
        .eq("mission_id", id)
        .eq("status", "active"),
      supabase
        .from("mission_sections")
        .select(
          "id,number,title,assigned_user_id,internal_due_date,studio_status,studio_progress_pct,iris_alignment_pct,iris_flagged,iris_flag_reason",
        )
        .eq("mission_id", id),
      supabase
        .from("client_clarifications")
        .select("id,number,question,status,submitted_at,answered_at")
        .eq("mission_id", id)
        .order("number"),
      supabase
        .from("mission_members")
        .select("role,display_name")
        .eq("mission_id", id)
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    return {
      mission,
      themes: themes ?? [],
      sections: sections ?? [],
      clarifications: clarifications ?? [],
      myRole: myMembership?.role ?? null,
      myName: myMembership?.display_name ?? null,
    };
  });

/** Sections tracker. */
export const listSections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: sections } = await supabase
      .from("mission_sections")
      .select(
        "id,number,title,assigned_user_id,internal_due_date,studio_status,studio_progress_pct,iris_alignment_pct,iris_flagged,iris_flag_reason",
      )
      .eq("mission_id", NJ_CSOC_MISSION_ID)
      .order("number");

    const userIds = Array.from(
      new Set((sections ?? []).map((s) => s.assigned_user_id).filter(Boolean) as string[]),
    );
    const { data: profiles } = userIds.length
      ? await supabase
          .from("profiles")
          .select("id,display_name,avatar_color")
          .in("id", userIds)
      : { data: [] as any[] };

    const byId = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    return (sections ?? []).map((s) => ({
      ...s,
      assignee: s.assigned_user_id ? byId.get(s.assigned_user_id) ?? null : null,
    }));
  });

export const listMySections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: sections } = await supabase
      .from("mission_sections")
      .select(
        "id,number,title,internal_due_date,studio_status,studio_progress_pct,iris_alignment_pct,iris_flagged,iris_flag_reason",
      )
      .eq("mission_id", NJ_CSOC_MISSION_ID)
      .eq("assigned_user_id", userId)
      .order("number");
    return sections ?? [];
  });

export const getSection = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ sectionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: section } = await supabase
      .from("mission_sections")
      .select("*")
      .eq("id", data.sectionId)
      .eq("mission_id", NJ_CSOC_MISSION_ID)
      .maybeSingle();
    if (!section) throw new Error("Section not found");

    let assignee = null;
    if (section.assigned_user_id) {
      const { data: p } = await supabase
        .from("profiles")
        .select("id,display_name,avatar_color")
        .eq("id", section.assigned_user_id)
        .maybeSingle();
      assignee = p;
    }

    const { data: themes } = await supabase
      .from("win_themes")
      .select("id,title")
      .eq("mission_id", NJ_CSOC_MISSION_ID)
      .eq("status", "active");

    return { section, assignee, themes: themes ?? [] };
  });

export const updateSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        sectionId: z.string().uuid(),
        body: z.string().max(200000).optional(),
        studio_status: z.string().max(40).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.body !== undefined) patch.body = data.body;
    if (data.studio_status !== undefined) {
      patch.studio_status = data.studio_status;
      patch.studio_updated_at = new Date().toISOString();
    }
    const { error } = await supabase
      .from("mission_sections")
      .update(patch)
      .eq("id", data.sectionId)
      .eq("mission_id", NJ_CSOC_MISSION_ID);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listVault = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data } = await supabase
      .from("mission_vault_documents")
      .select("id,title,description,doc_type,category,uploaded_by_name,created_at,file_path,external_url")
      .eq("mission_id", NJ_CSOC_MISSION_ID)
      .order("created_at", { ascending: false });
    return data ?? [];
  });

export const listIntel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data } = await supabase
      .from("market_intelligence")
      .select("id,title,summary,source,category,published_at,url")
      .or(`mission_id.eq.${NJ_CSOC_MISSION_ID},matched_mission_ids.cs.{${NJ_CSOC_MISSION_ID}}`)
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(40);
    return data ?? [];
  });
