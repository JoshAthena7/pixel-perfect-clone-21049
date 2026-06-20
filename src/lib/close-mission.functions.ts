/**
 * Close a mission and trigger lesson extraction.
 *
 * Caller must be the mission owner or an admin. Updates missions.status to
 * 'closed' (and flips debrief_completed if requested), then runs the
 * institutional-memory extraction inline so lessons are available right
 * after the mission is finalized. The DB trigger on missions.status is a
 * safety net for any other code path that updates status without going
 * through this server fn.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({
  missionId: z.string().uuid(),
  status: z.enum(["closed", "submitted", "archived"]).default("closed"),
  markDebriefComplete: z.boolean().optional(),
});

export const closeMission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data, context }) => {
    // Authorize: admin OR mission creator
    const [{ data: isAdmin }, { data: mission }] = await Promise.all([
      context.supabase.rpc("has_role", {
        _user_id: context.userId,
        _role: "admin",
      }),
      context.supabase
        .from("missions")
        .select("id, created_by, status")
        .eq("id", data.missionId)
        .maybeSingle(),
    ]);
    if (!mission) throw new Error("Mission not found");
    const ownerLike =
      (mission as { created_by?: string | null }).created_by === context.userId;
    if (!isAdmin && !ownerLike) {
      throw new Error("Forbidden — admin or mission owner required");
    }

    const patch = {
      status: data.status,
      ...(data.markDebriefComplete ? { debrief_completed: true } : {}),
    };

    const { error: updErr } = await context.supabase
      .from("missions")
      .update(patch)
      .eq("id", data.missionId);
    if (updErr) throw new Error(`Failed to close mission: ${updErr.message}`);

    // Run extraction inline using the service-role helper. Failures here
    // should not roll back the close — log and continue.
    let extraction: { extracted: number; reason?: string } = { extracted: 0 };
    try {
      const { runLessonExtraction } = await import("@/lib/lessons-core.server");
      extraction = await runLessonExtraction(data.missionId);
    } catch (err) {
      console.warn("[closeMission] lesson extraction failed", err);
      extraction = { extracted: 0, reason: "extraction error" };
    }

    return {
      missionId: data.missionId,
      status: data.status,
      lessonsExtracted: extraction.extracted,
      extractionNote: extraction.reason,
    };
  });
