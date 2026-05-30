import { supabase } from "@/integrations/supabase/client";

/**
 * Lightweight audit-log helper. Fires-and-forgets — never blocks the calling
 * write path. Errors are swallowed (RLS will reject for non-members anyway).
 *
 * Use for significant war-room events: member changes, SOS lifecycle,
 * risk lifecycle, snapshots, engagement archive, section completion,
 * broadcast pin.
 */
export type ActivityInsert = {
  engagementId: string;
  userId: string | null;
  actorName: string;
  action: string;
  targetTable?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
};

export function logActivity(input: ActivityInsert): void {
  void supabase
    .from("activity_log")
    .insert({
      engagement_id: input.engagementId,
      user_id: input.userId,
      actor_name: input.actorName,
      action: input.action,
      target_table: input.targetTable ?? null,
      target_id: input.targetId ?? null,
      metadata: (input.metadata as never) ?? null,
    })
    .then(() => undefined, () => undefined);
}
