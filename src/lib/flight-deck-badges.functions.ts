import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Lightweight unread-count helpers for the Flight Deck assist bar badges.
 * The "last viewed" timestamp is stored client-side in localStorage; the
 * server only counts rows newer than the supplied cutoff.
 */

const ThreadInput = z.object({
  questionId: z.string().uuid(),
  since: z.string(),
});

export const countUnreadThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ThreadInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { count } = await supabase
      .from("thread_messages")
      .select("id", { head: true, count: "exact" })
      .eq("question_id", data.questionId)
      .gt("created_at", data.since)
      .neq("sender_id", userId);
    return { count: count ?? 0 };
  });

const PulseInput = z.object({
  missionId: z.string().uuid(),
  since: z.string(),
});

export const countUnreadPulse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => PulseInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { count } = await supabase
      .from("team_updates" as any)
      .select("id", { head: true, count: "exact" })
      .eq("mission_id", data.missionId)
      .gt("created_at", data.since)
      .neq("sender_id", userId);
    return { count: count ?? 0 };
  });
