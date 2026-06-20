/**
 * Mission-closed webhook.
 *
 * Fired by the missions DB trigger when status transitions to a terminal
 * state (closed/submitted/archived) or debrief_completed flips to true.
 * Verifies the apikey header matches the Supabase anon key (only callers
 * that already know the project key can invoke this) and then runs the
 * lesson extractor for the given mission.
 *
 * This is the safety-net path. The primary path is `closeMission` server
 * fn which runs extraction inline.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.object({ missionId: z.string().uuid() });

export const Route = createFileRoute("/api/public/hooks/mission-closed")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!expected || apiKey !== expected) {
          return new Response(
            JSON.stringify({ error: "unauthorized" }),
            { status: 401, headers: { "Content-Type": "application/json" } },
          );
        }

        let payload: unknown;
        try {
          payload = await request.json();
        } catch {
          return new Response(
            JSON.stringify({ error: "invalid json" }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }

        const parsed = Body.safeParse(payload);
        if (!parsed.success) {
          return new Response(
            JSON.stringify({ error: "invalid body", issues: parsed.error.issues }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }

        try {
          const { runLessonExtraction } = await import(
            "@/lib/lessons-core.server"
          );
          const result = await runLessonExtraction(parsed.data.missionId);
          return Response.json({ ok: true, ...result });
        } catch (err) {
          console.error("[mission-closed webhook] extraction failed", err);
          return new Response(
            JSON.stringify({ error: "extraction failed" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
