import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron entry point for IRIS Wave 3 monitoring. Polls all enabled monitoring
 * sources, updates last_checked_at. Source-specific adapters (SAM.gov,
 * Federal Register, state portals) are stubbed — real adapters are a
 * follow-up.
 *
 * Schedule with pg_cron daily; weekly sources only fire when 7+ days have
 * passed since their last check.
 */
export const Route = createFileRoute("/api/public/hooks/iris-monitor")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provided =
          request.headers.get("x-cron-secret") ?? request.headers.get("apikey");
        const expected = process.env.CRON_HOOK_SECRET;
        if (!expected || !provided || provided !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const now = new Date();
        const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

        const { data: dailyDue } = await supabaseAdmin
          .from("mission_monitoring_sources")
          .select("id,mission_id,label,source_type,url,frequency")
          .eq("enabled", true)
          .eq("frequency", "daily")
          .or(`last_checked_at.is.null,last_checked_at.lt.${dayAgo}`);

        const { data: weeklyDue } = await supabaseAdmin
          .from("mission_monitoring_sources")
          .select("id,mission_id,label,source_type,url,frequency")
          .eq("enabled", true)
          .eq("frequency", "weekly")
          .or(`last_checked_at.is.null,last_checked_at.lt.${weekAgo}`);

        const due = [...(dailyDue ?? []), ...(weeklyDue ?? [])];
        let checked = 0;
        for (const src of due) {
          // Stub: real adapters would fetch + diff. Mark as checked.
          await supabaseAdmin.from("mission_monitoring_sources")
            .update({ last_checked_at: now.toISOString() })
            .eq("id", src.id);
          checked++;
        }

        return new Response(JSON.stringify({ ok: true, checked, total: due.length }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
