import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type HomeMissionAdmin = {
  id: string;
  name: string;
  client_name: string | null;
  status: string;
  submission_deadline: string | null;
  days_to_deadline: number | null;
  intel_completeness: number;
  team_count: number;
  at_risk_count: number;
};

export type HomeAssignment = {
  id: string;
  question_id: string;
  question_number: string | null;
  question_text: string;
  health_status: string | null;
  due_date: string | null;
};

export type HomeMissionWriter = {
  id: string;
  name: string;
  client_name: string | null;
  submission_deadline: string | null;
  days_to_deadline: number | null;
  at_risk_count: number;
  assignments: HomeAssignment[];
};

export type HomeData =
  | {
      role: "admin";
      firstName: string;
      activeMissionsCount: number;
      questionsAtRisk: number;
      soonestDays: number | null;
      missions: HomeMissionAdmin[];
      mostUrgent: { name: string; days: number | null; atRisk: number } | null;
    }
  | {
      role: "writer";
      firstName: string;
      missions: HomeMissionWriter[];
      totalAssignments: number;
      firstAtRiskQuestion: string | null;
    };

function daysTo(date: string | null): number | null {
  if (!date) return null;
  const diff = new Date(date).getTime() - Date.now();
  return Math.ceil(diff / 86_400_000);
}

export const getHomeData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<HomeData> => {
    const { supabase, userId } = context;

    // First name from profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name,email")
      .eq("id", userId)
      .maybeSingle();
    const display = profile?.display_name || profile?.email || "";
    const firstName = (display.trim().split(/\s+/)[0] || "there").replace(/@.*/, "");

    // Admin check
    const { data: adminRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    const { data: platformAdminRow } = await supabase
      .from("profiles")
      .select("is_platform_admin")
      .eq("id", userId)
      .maybeSingle();
    const isAdmin = !!adminRow || platformAdminRow?.is_platform_admin === true;

    // Resolve atlas member id (by email)
    let memberId: string | null = null;
    if (profile?.email) {
      const { data: atm } = await supabase
        .from("atlas_team_members")
        .select("id,atlas_role")
        .ilike("email", profile.email)
        .maybeSingle();
      memberId = (atm?.id as string) ?? null;
    }

    // Determine role: admin > engagement_lead (via mission_team_members) > writer/sme
    let role: "admin" | "writer" = "admin";
    if (!isAdmin) {
      const { data: rolesRows } = memberId
        ? await supabase
            .from("mission_team_members")
            .select("mission_role")
            .eq("member_id", memberId)
        : { data: [] };
      const rolesSet = new Set((rolesRows ?? []).map((r: any) => (r.mission_role ?? "").toLowerCase()));
      const isLead = [...rolesSet].some((r) => /lead|admin|principal|engagement/.test(r));
      role = isLead ? "admin" : "writer";
    }

    if (role === "admin") {
      // Fetch active missions where user is member (admins see all)
      let missionIds: string[] | null = null;
      if (!isAdmin && memberId) {
        const { data: memberRows } = await supabase
          .from("mission_team_members")
          .select("mission_id")
          .eq("member_id", memberId);
        missionIds = (memberRows ?? []).map((r: any) => r.mission_id);
        if (missionIds.length === 0) missionIds = ["00000000-0000-0000-0000-000000000000"];
      }

      let q = supabase
        .from("missions")
        .select(
          "id,name,client_name,status,submission_deadline,intelligence_graph_completeness," +
            "mission_team_members(count),mission_questions(id,health_status)",
        )
        .eq("status", "active")
        .order("submission_deadline", { ascending: true, nullsFirst: false });
      if (missionIds) q = q.in("id", missionIds);
      const { data: missionsData } = await q;

      const missions: HomeMissionAdmin[] = (missionsData ?? []).map((m: any) => {
        const qs = Array.isArray(m.mission_questions) ? m.mission_questions : [];
        const atRisk = qs.filter((x: any) => x.health_status === "at_risk").length;
        return {
          id: m.id,
          name: m.name,
          client_name: m.client_name ?? null,
          status: m.status,
          submission_deadline: m.submission_deadline ?? null,
          days_to_deadline: daysTo(m.submission_deadline),
          intel_completeness:
            typeof m.intelligence_graph_completeness === "number"
              ? m.intelligence_graph_completeness
              : 0,
          team_count: m.mission_team_members?.[0]?.count ?? 0,
          at_risk_count: atRisk,
        };
      });

      const soonestDays = missions
        .map((m) => m.days_to_deadline)
        .filter((d): d is number => typeof d === "number")
        .reduce<number | null>((min, d) => (min === null ? d : Math.min(min, d)), null);

      const questionsAtRisk = missions.reduce((s, m) => s + m.at_risk_count, 0);

      const mostUrgent =
        missions.length > 0
          ? {
              name: missions[0].name,
              days: missions[0].days_to_deadline,
              atRisk: missions[0].at_risk_count,
            }
          : null;

      return {
        role: "admin",
        firstName,
        activeMissionsCount: missions.length,
        questionsAtRisk,
        soonestDays,
        missions,
        mostUrgent,
      };
    }

    // Writer view
    const missions: HomeMissionWriter[] = [];
    let firstAtRiskQuestion: string | null = null;
    let totalAssignments = 0;
    if (memberId) {
      const { data: asgs } = await supabase
        .from("mission_assignments")
        .select("id,mission_id,question_id,due_date")
        .eq("assigned_writer_id", memberId);
      const asgList = asgs ?? [];
      totalAssignments = asgList.length;
      if (asgList.length > 0) {
        const qids = asgList.map((a: any) => a.question_id).filter(Boolean);
        const mids = Array.from(new Set(asgList.map((a: any) => a.mission_id).filter(Boolean)));

        const [questionsRes, missionsRes] = await Promise.all([
          supabase
            .from("mission_questions")
            .select("id,question_number,question_text,health_status,due_date,mission_id")
            .in("id", qids),
          supabase
            .from("missions")
            .select("id,name,client_name,submission_deadline")
            .in("id", mids),
        ]);

        const qById = new Map<string, any>(
          (questionsRes.data ?? []).map((q: any) => [q.id, q]),
        );

        for (const m of missionsRes.data ?? []) {
          const myAsgs = asgList.filter((a: any) => a.mission_id === m.id);
          const assignments: HomeAssignment[] = myAsgs
            .map((a: any) => {
              const q = qById.get(a.question_id);
              if (!q) return null;
              return {
                id: a.id,
                question_id: a.question_id,
                question_number: q.question_number ?? null,
                question_text: q.question_text ?? "",
                health_status: q.health_status ?? "not_started",
                due_date: a.due_date ?? q.due_date ?? null,
              } as HomeAssignment;
            })
            .filter(Boolean) as HomeAssignment[];

          assignments.sort((a, b) => {
            const aRisk = a.health_status === "at_risk" ? 0 : 1;
            const bRisk = b.health_status === "at_risk" ? 0 : 1;
            if (aRisk !== bRisk) return aRisk - bRisk;
            return String(a.question_number ?? "").localeCompare(
              String(b.question_number ?? ""),
              undefined,
              { numeric: true },
            );
          });

          const atRisk = assignments.filter((x) => x.health_status === "at_risk").length;
          if (atRisk > 0 && !firstAtRiskQuestion) {
            const f = assignments.find((x) => x.health_status === "at_risk");
            if (f) firstAtRiskQuestion = `${f.question_number ?? ""} ${f.question_text}`.trim();
          }

          missions.push({
            id: (m as any).id,
            name: (m as any).name,
            client_name: (m as any).client_name ?? null,
            submission_deadline: (m as any).submission_deadline ?? null,
            days_to_deadline: daysTo((m as any).submission_deadline),
            at_risk_count: atRisk,
            assignments,
          });
        }

        missions.sort((a, b) => {
          const ad = a.days_to_deadline ?? 9999;
          const bd = b.days_to_deadline ?? 9999;
          return ad - bd;
        });
      }
    }

    return {
      role: "writer",
      firstName,
      missions,
      totalAssignments,
      firstAtRiskQuestion,
    };
  });
