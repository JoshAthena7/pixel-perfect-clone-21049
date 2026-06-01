import { supabase } from "@/integrations/supabase/client";

/**
 * Olympus audit log helper. Records admin / lead actions taken in Olympus
 * (and other privileged surfaces) into the `olympus_audit_log` table.
 *
 * Failures are logged but never thrown — audit must never break the
 * originating action.
 */
export type AuditInput = {
  action_type: string;
  action_summary: string;
  mission_id?: string | null;
  target_table?: string | null;
  target_id?: string | null;
  metadata?: Record<string, unknown> | null;
};

export async function logOlympusAction(input: AuditInput): Promise<void> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;
    if (!user) {
      console.warn("[audit] no user, skipping");
      return;
    }
    let userName: string | null = null;
    const { data: prof } = await supabase
      .from("profiles")
      .select("display_name,email")
      .eq("id", user.id)
      .maybeSingle();
    userName = prof?.display_name ?? prof?.email ?? user.email ?? null;

    const { error } = await supabase.from("olympus_audit_log").insert({
      user_id: user.id,
      user_name: userName,
      mission_id: input.mission_id ?? null,
      action_type: input.action_type,
      action_summary: input.action_summary,
      target_table: input.target_table ?? null,
      target_id: input.target_id ?? null,
      metadata: (input.metadata as never) ?? null,
    });
    if (error) console.warn("[audit] insert failed", error.message);
  } catch (err) {
    console.warn("[audit] unexpected error", err);
  }
}
