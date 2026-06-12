import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHash } from "crypto";

const Input = z.object({ token: z.string().min(8).max(512) });

export type WelcomeInvitePayload = {
  valid: boolean;
  reason?: "invalid" | "expired" | "used";
  email?: string;
  displayName?: string | null;
  role?: string | null;
  hasAccount?: boolean;
  mission?: {
    id: string;
    name: string;
    clientName: string | null;
    submissionDeadline: string | null;
    daysToSubmission: number | null;
    atRiskCount: number;
    teamCount: number;
  } | null;
  assignment?: {
    questionId: string;
    questionNumber: string | null;
    sectionName: string | null;
    dueDate: string | null;
    health: string | null;
  } | null;
};

export const lookupWelcomeInvite = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }): Promise<WelcomeInvitePayload> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const tokenHash = createHash("sha256").update(data.token).digest("hex");

    const { data: tok } = await supabaseAdmin
      .from("atlas_invite_tokens")
      .select("id, invite_id, expires_at, used_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (!tok) return { valid: false, reason: "invalid" };
    if (tok.used_at) return { valid: false, reason: "used" };
    if (new Date(tok.expires_at).getTime() < Date.now())
      return { valid: false, reason: "expired" };

    const { data: invite } = await supabaseAdmin
      .from("atlas_invites")
      .select("email, display_name, role, role_hint, mission_id, accepted_user_id")
      .eq("id", tok.invite_id)
      .maybeSingle();

    if (!invite) return { valid: false, reason: "invalid" };

    const role = (invite.role || invite.role_hint || "writer") as string;
    const result: WelcomeInvitePayload = {
      valid: true,
      email: invite.email,
      displayName: invite.display_name,
      role,
      hasAccount: !!invite.accepted_user_id,
      mission: null,
      assignment: null,
    };

    if (invite.mission_id) {
      const { data: m } = await supabaseAdmin
        .from("missions")
        .select("id, name, client_name, submission_deadline")
        .eq("id", invite.mission_id)
        .maybeSingle();

      if (m) {
        const days = m.submission_deadline
          ? Math.ceil(
              (new Date(m.submission_deadline).getTime() - Date.now()) /
                (1000 * 60 * 60 * 24),
            )
          : null;

        const [{ count: atRisk }, { count: team }] = await Promise.all([
          supabaseAdmin
            .from("mission_questions")
            .select("id", { count: "exact", head: true })
            .eq("mission_id", m.id)
            .eq("health_status", "at_risk"),
          supabaseAdmin
            .from("mission_team_members")
            .select("id", { count: "exact", head: true })
            .eq("mission_id", m.id),
        ]);

        result.mission = {
          id: m.id,
          name: m.name,
          clientName: m.client_name,
          submissionDeadline: m.submission_deadline,
          daysToSubmission: days,
          atRiskCount: atRisk ?? 0,
          teamCount: team ?? 0,
        };

        // Writer/SME: most urgent assignment for this invitee (if account exists)
        if (
          (role === "writer" || role === "sme") &&
          invite.accepted_user_id
        ) {
          const { data: asn } = await supabaseAdmin
            .from("mission_assignments")
            .select("question_id, due_date")
            .eq("mission_id", m.id)
            .eq("assignee_user_id", invite.accepted_user_id)
            .order("due_date", { ascending: true, nullsFirst: false })
            .limit(1)
            .maybeSingle();
          if (asn?.question_id) {
            const { data: q } = await supabaseAdmin
              .from("mission_questions")
              .select("id, question_number, section_name, health_status")
              .eq("id", asn.question_id)
              .maybeSingle();
            if (q) {
              result.assignment = {
                questionId: q.id,
                questionNumber: q.question_number,
                sectionName: q.section_name,
                dueDate: asn.due_date,
                health: q.health_status,
              };
            }
          }
        }
      }
    }

    return result;
  });
