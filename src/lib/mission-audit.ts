import { supabase } from "@/integrations/supabase/client";

/**
 * Shared utility for writing to mission_audit_log.
 * Fire-and-forget: failures are logged to console only and NEVER surfaced
 * to the user or thrown — audit must never block the originating action.
 */
export async function logAuditEvent(
  missionId: string,
  action: string,
  performedById?: string | null,
  performedByName?: string | null,
  metadata?: Record<string, unknown> | null,
): Promise<void> {
  try {
    let userId = performedById ?? null;
    let userName = performedByName ?? null;

    if (!userId || !userName) {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth.user;
      if (!userId) userId = user?.id ?? null;
      if (!userName && user) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("display_name,email")
          .eq("id", user.id)
          .maybeSingle();
        userName = prof?.display_name ?? prof?.email ?? user.email ?? null;
      }
    }

    const { error } = await supabase.from("mission_audit_log").insert({
      mission_id: missionId,
      action,
      performed_by: userId,
      performed_by_name: userName,
      metadata: (metadata as never) ?? null,
    });
    if (error) console.warn("[mission-audit] insert failed:", error.message);
  } catch (err) {
    console.warn("[mission-audit] unexpected error:", err);
  }
}
