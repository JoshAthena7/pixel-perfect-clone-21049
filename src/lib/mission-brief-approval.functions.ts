// Mission Brief approval workflow — read + set brief_status on missions.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type BriefStatus = "draft" | "in_review" | "approved";

export type MissionBriefStatus = {
  brief_status: BriefStatus;
  brief_approved_by: string | null;
  brief_approved_at: string | null;
  brief_version: number;
  approver_name: string | null;
  canApprove: boolean;
};

export const getMissionBriefStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ missionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<MissionBriefStatus> => {
    const { supabase, userId } = context;

    const [missionRes, adminRes, teamRes] = await Promise.all([
      supabase
        .from("missions")
        .select("brief_status,brief_approved_by,brief_approved_at,brief_version")
        .eq("id", data.missionId)
        .maybeSingle(),
      supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
      supabase
        .from("mission_team_members")
        .select("mission_role,member_id")
        .eq("mission_id", data.missionId),
    ]);

    const m = (missionRes.data ?? {}) as {
      brief_status?: BriefStatus | null;
      brief_approved_by?: string | null;
      brief_approved_at?: string | null;
      brief_version?: number | null;
    };

    const isAdmin = !!adminRes.data;
    let isLead = false;
    if (!isAdmin) {
      const leadMemberIds = (teamRes.data ?? [])
        .filter((t: any) => /lead|principal|engagement/i.test(String(t.mission_role ?? "")))
        .map((t: any) => t.member_id);
      if (leadMemberIds.length) {
        const { data: me } = await (supabase as any)
          .from("atlas_team_members")
          .select("id")
          .in("id", leadMemberIds)
          .eq("user_id", userId)
          .maybeSingle();
        isLead = !!me;
      }
    }

    let approverName: string | null = null;
    if (m.brief_approved_by) {
      const { data: p } = await supabase
        .from("profiles")
        .select("full_name,email")
        .eq("id", m.brief_approved_by)
        .maybeSingle();
      approverName = (p as any)?.full_name ?? (p as any)?.email ?? null;
    }

    return {
      brief_status: (m.brief_status ?? "draft") as BriefStatus,
      brief_approved_by: m.brief_approved_by ?? null,
      brief_approved_at: m.brief_approved_at ?? null,
      brief_version: m.brief_version ?? 1,
      approver_name: approverName,
      canApprove: isAdmin || isLead,
    };
  });

export const setMissionBriefStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    missionId: z.string().uuid(),
    action: z.enum(["approve", "unapprove"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Authorize: must be admin OR engagement lead on this mission.
    const [adminRes, teamRes] = await Promise.all([
      supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
      supabase
        .from("mission_team_members")
        .select("mission_role,member_id")
        .eq("mission_id", data.missionId),
    ]);
    const isAdmin = !!adminRes.data;
    let isLead = false;
    if (!isAdmin) {
      const leadMemberIds = (teamRes.data ?? [])
        .filter((t: any) => /lead|principal|engagement/i.test(String(t.mission_role ?? "")))
        .map((t: any) => t.member_id);
      if (leadMemberIds.length) {
        const { data: me } = await (supabase as any)
          .from("atlas_team_members")
          .select("id")
          .in("id", leadMemberIds)
          .eq("user_id", userId)
          .maybeSingle();
        isLead = !!me;
      }
    }
    if (!isAdmin && !isLead) throw new Error("Forbidden");

    if (data.action === "approve") {
      const { error } = await supabase
        .from("missions")
        .update({
          brief_status: "approved",
          brief_approved_by: userId,
          brief_approved_at: new Date().toISOString(),
        })
        .eq("id", data.missionId);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("missions")
        .update({
          brief_status: "draft",
          brief_approved_by: null,
          brief_approved_at: null,
        })
        .eq("id", data.missionId);
      if (error) throw error;
    }
    return { ok: true };
  });
