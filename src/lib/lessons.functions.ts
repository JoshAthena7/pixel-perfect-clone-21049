/**
 * Mission-close lesson extractor (admin server fn entry point).
 *
 * Reads scoring + feedback + win-theme data for a mission, asks the
 * Lovable AI gateway to extract a reusable pattern, embeds the pattern,
 * and writes a row into atlas_institutional_memory.
 *
 * Core logic lives in lessons-core.server.ts so it can be shared with the
 * closeMission server fn and the mission-closed webhook.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({ missionId: z.string().uuid() });

export const extractMissionLessons = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden — admin role required");

    const { runLessonExtraction } = await import("@/lib/lessons-core.server");
    return runLessonExtraction(data.missionId);
  });
