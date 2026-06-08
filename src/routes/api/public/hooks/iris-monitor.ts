import { createFileRoute } from "@tanstack/react-router";
import { createHash } from "crypto";

/**
 * IRIS Monitoring Watchlist scanner.
 *
 * Runs on pg_cron (hourly). For every enabled mission_monitoring_source
 * whose frequency window has elapsed:
 *   1. Scrape the URL via Firecrawl (markdown).
 *   2. SHA-256 hash the normalized body.
 *   3. Compare against last_content_hash.
 *      - First scan (no prior hash): record the hash, no signal.
 *      - Hash changed: insert a `signals` row (source_module='monitoring',
 *        signal_type='source_change') so the mission sees movement, then
 *        update hash + last_signal_at.
 *      - Unchanged: just bump last_checked_at.
 *
 * Auth: accepts the Supabase publishable/anon key in the `apikey` header
 * (pg_cron sends it), or a CRON_HOOK_SECRET in `x-cron-secret` for manual
 * curl tests.
 */
export const Route = createFileRoute("/api/public/hooks/iris-monitor")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey");
        const cronSecret = request.headers.get("x-cron-secret");
        const expectedAnon =
          process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
        const expectedCron = process.env.CRON_HOOK_SECRET;
        const authed =
          (expectedAnon && apiKey === expectedAnon) ||
          (expectedCron && cronSecret === expectedCron);
        if (!authed) return new Response("Unauthorized", { status: 401 });

        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );
        const firecrawlKey = process.env.FIRECRAWL_API_KEY;
        const now = new Date();
        const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

        const [dailyDue, weeklyDue] = await Promise.all([
          supabaseAdmin
            .from("mission_monitoring_sources")
            .select("id,mission_id,label,source_type,url,frequency,last_content_hash")
            .eq("enabled", true)
            .eq("frequency", "daily")
            .or(`last_checked_at.is.null,last_checked_at.lt.${dayAgo}`),
          supabaseAdmin
            .from("mission_monitoring_sources")
            .select("id,mission_id,label,source_type,url,frequency,last_content_hash")
            .eq("enabled", true)
            .eq("frequency", "weekly")
            .or(`last_checked_at.is.null,last_checked_at.lt.${weekAgo}`),
        ]);

        const due = [...(dailyDue.data ?? []), ...(weeklyDue.data ?? [])];

        let scraped = 0;
        let changed = 0;
        let stubbed = 0;
        let failed = 0;
        // Cap per run so a backlog can't blow past Firecrawl rate limits or
        // the request timeout. Anything left over picks up next cron tick.
        const MAX_PER_RUN = 40;
        const batch = due.slice(0, MAX_PER_RUN);

        for (const src of batch) {
          const url = (src.url ?? "").trim();
          // No URL → can't fetch. Just bump last_checked_at and move on.
          if (!url || !/^https?:\/\//i.test(url) || !firecrawlKey) {
            await supabaseAdmin
              .from("mission_monitoring_sources")
              .update({ last_checked_at: now.toISOString() })
              .eq("id", src.id);
            stubbed += 1;
            continue;
          }
          try {
            const r = await fetch("https://api.firecrawl.dev/v2/scrape", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${firecrawlKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                url,
                formats: ["markdown"],
                onlyMainContent: true,
              }),
            });
            if (!r.ok) throw new Error(`firecrawl ${r.status}`);
            const json = (await r.json()) as {
              data?: { markdown?: string; metadata?: { title?: string } };
              markdown?: string;
              metadata?: { title?: string };
            };
            const md =
              (json.data?.markdown ?? json.markdown ?? "")
                .replace(/\s+/g, " ")
                .trim();
            const title = json.data?.metadata?.title ?? json.metadata?.title ?? src.label;
            if (!md) throw new Error("empty body");
            const hash = createHash("sha256").update(md).digest("hex");
            const prevHash = src.last_content_hash ?? null;
            const hashChanged = !!prevHash && prevHash !== hash;
            scraped += 1;

            if (hashChanged) {
              changed += 1;
              await supabaseAdmin.from("signals").insert({
                mission_id: src.mission_id,
                source_module: "monitoring",
                signal_type: "source_change",
                signal_title: `Watchlist update: ${src.label}`,
                signal_summary: `${title} changed since last scan. Source type: ${src.source_type}. URL: ${url}`,
                severity: "info",
                confidence: 0.7,
                status: "open",
                tags: ["monitoring", src.source_type],
                created_by_system: true,
              });
              await supabaseAdmin
                .from("mission_monitoring_sources")
                .update({
                  last_checked_at: now.toISOString(),
                  last_content_hash: hash,
                  last_signal_at: now.toISOString(),
                })
                .eq("id", src.id);
            } else {
              await supabaseAdmin
                .from("mission_monitoring_sources")
                .update({
                  last_checked_at: now.toISOString(),
                  last_content_hash: hash,
                })
                .eq("id", src.id);
            }
          } catch (err) {
            failed += 1;
            console.error("iris-monitor scrape failed", { url, err });
            await supabaseAdmin
              .from("mission_monitoring_sources")
              .update({ last_checked_at: now.toISOString() })
              .eq("id", src.id);
          }
        }

        return new Response(
          JSON.stringify({
            ok: true,
            total_due: due.length,
            processed: batch.length,
            scraped,
            changed,
            stubbed,
            failed,
            leftover: Math.max(0, due.length - batch.length),
          }),
          { headers: { "content-type": "application/json" } },
        );
      },
    },
  },
});
