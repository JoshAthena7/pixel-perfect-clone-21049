/**
 * /api/public/hooks/iris-morning-briefs
 *
 * Daily pg_cron entrypoint. Generates morning briefs for every active mission
 * and writes one admin-targeted row per mission into `atlas_notifications`
 * (type='morning_brief'). Auth: `x-cron-secret` header matching
 * CRON_HOOK_SECRET.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/iris-morning-briefs")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authorizeCron } = await import("@/lib/monitoring/cron-auth.server");
        const unauthorized = authorizeCron(request);
        if (unauthorized) return unauthorized;

        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) {
          return Response.json({ error: "LOVABLE_API_KEY missing" }, { status: 500 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runMorningBriefs } = await import("@/lib/iris-morning-briefs.server");

        try {
          const result = await runMorningBriefs(supabaseAdmin as any, apiKey);
          return Response.json(result);
        } catch (e) {
          console.error("[iris-morning-briefs]", (e as Error).message);
          return Response.json({ error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
