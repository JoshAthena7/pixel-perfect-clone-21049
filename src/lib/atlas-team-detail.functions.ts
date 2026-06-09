import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Fetches everything the Person Detail Drawer needs in one round trip:
 *   - the member record (full)
 *   - mission history (best-effort; empty if missions/mission_members are not wired)
 *   - active assignments (best-effort)
 *   - admin notes (from member.admin_notes JSONB)
 *   - activity log entries
 */
export const getMemberDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ memberId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;

    // Admin gate
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) throw new Error("Only platform admins can view member details.");

    const { data: member, error: mErr } = await supabase
      .from("atlas_team_members")
      .select("*")
      .eq("id", data.memberId)
      .maybeSingle();
    if (mErr) throw new Error(mErr.message);
    if (!member) throw new Error("Member not found");

    const { data: log } = await supabase
      .from("atlas_activity_log")
      .select("id,action,performed_by,timestamp,metadata")
      .eq("member_id", data.memberId)
      .order("timestamp", { ascending: false })
      .limit(200);

    // Best-effort mission history / assignments: resolve to auth user via email
    let missionHistory: Array<{
      mission_id: string;
      mission_name: string;
      role: string | null;
      status: string | null;
      questions_assigned: number;
      questions_completed: number;
      assigned_at: string | null;
    }> = [];
    let assignments: Array<{
      mission_id: string;
      mission_name: string;
      section: string | null;
      question: string | null;
      due_date: string | null;
      status: string;
    }> = [];

    try {
      if (member.email) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: auths } = await supabaseAdmin.auth.admin.listUsers({
          page: 1,
          perPage: 1000,
        });
        const authUser = auths?.users?.find(
          (u: any) => (u.email ?? "").toLowerCase() === member.email.toLowerCase(),
        );
        if (authUser) {
          const { data: mm } = await supabaseAdmin
            .from("mission_members")
            .select("mission_id,role,created_at,missions(name,status)")
            .eq("user_id", authUser.id);
          missionHistory = (mm ?? [])
            .map((r: any) => ({
              mission_id: r.mission_id,
              mission_name: r.missions?.name ?? "Unknown mission",
              role: r.role ?? null,
              status: r.missions?.status ?? null,
              questions_assigned: 0,
              questions_completed: 0,
              assigned_at: r.created_at ?? null,
            }))
            .sort((a, b) =>
              (b.assigned_at ?? "").localeCompare(a.assigned_at ?? ""),
            );

          // question_assignments doesn't track a generic assignee yet;
          // leave active assignments empty until a per-user assignment model exists.
        }
      }
    } catch {
      // best-effort: leave history empty
    }

    return {
      member,
      missionHistory,
      assignments,
      activityLog: log ?? [],
    };
  });
