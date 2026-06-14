/**
 * IRIS Weekly Academic Sweep.
 *
 * Runs Mondays at 7am ET (12:00 UTC) via pg_cron. Asks Perplexity in
 * `academic` search mode for peer-reviewed evidence on Athena's active
 * specialty populations and program areas, then seeds each result into
 * `oracle_knowledge_base` with cited sources. This is the institutional
 * knowledge layer — it grows every week.
 *
 * Auth (matches iris-daily-monitor):
 *   x-cron-secret: CRON_HOOK_SECRET
 *   apikey:        CRON_HOOK_SECRET   (pg_cron compatibility)
 *   ?token=...     (dev override via DEV_SEED_TOKEN)
 *
 * Fail-soft per topic: a single Perplexity miss never stops the sweep.
 */
import { createFileRoute } from "@tanstack/react-router";
import { askPerplexity } from "@/lib/iris/perplexity.server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-cron-secret",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });

/** Topics seeded weekly. Tuned for Athena's current mission portfolio. */
const TOPICS: { query: string; tags: string[]; program: string }[] = [
  {
    query: "Medicaid managed care behavioral health integration evidence 2024",
    tags: ["behavioral-health", "integration", "evidence-base"],
    program: "Behavioral Health",
  },
  {
    query: "LTSS HCBS Medicaid managed care outcomes research",
    tags: ["LTSS", "HCBS", "outcomes", "evidence-base"],
    program: "LTSS / HCBS",
  },
  {
    query: "D-SNP dual eligible care coordination evidence base",
    tags: ["D-SNP", "duals", "care-coordination", "evidence-base"],
    program: "Dual Eligible",
  },
  {
    query: "Medicaid child welfare foster care coordination outcomes",
    tags: ["child-welfare", "foster-care", "outcomes", "evidence-base"],
    program: "Child Welfare",
  },
  {
    query: "IDD home community based services quality metrics",
    tags: ["IDD", "HCBS", "quality", "evidence-base"],
    program: "IDD",
  },
];

export const Route = createFileRoute("/api/public/hooks/iris-academic-sweep")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),
      POST: async ({ request }) => runSweep(request),
    },
  },
});

async function runSweep(request: Request): Promise<Response> {
  const provided =
    request.headers.get("x-cron-secret") ??
    request.headers.get("apikey") ??
    new URL(request.url).searchParams.get("token");
  const expected = process.env.CRON_HOOK_SECRET ?? process.env.DEV_SEED_TOKEN;
  if (!expected || !provided || provided !== expected) {
    return json({ error: "Unauthorized" }, 401);
  }

  if (!process.env.PERPLEXITY_API_KEY) {
    return json({ error: "PERPLEXITY_API_KEY missing" }, 500);
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const runAt = new Date().toISOString();
  const summary = {
    run_at: runAt,
    topics_checked: 0,
    topics_failed: 0,
    cards_written: 0,
  };

  for (const t of TOPICS) {
    summary.topics_checked += 1;
    try {
      const research = await askPerplexity(t.query, {
        model: "sonar-pro",
        searchMode: "academic",
        recencyFilter: "year",
        system:
          "You are IRIS curating a weekly evidence brief for Athena's Medicaid policy team. Write 6-10 sentences synthesizing peer-reviewed findings. Name authors, journals, and years where possible. Cite inline. No preamble.",
      });

      if (!research?.content) {
        summary.topics_failed += 1;
        console.log("[iris-academic-sweep] no content for topic", t.query);
        continue;
      }

      const sources = (research.citations ?? [])
        .filter((u): u is string => typeof u === "string" && u.startsWith("http"))
        .slice(0, 12);

      const { error } = await supabaseAdmin.from("oracle_knowledge_base").insert({
        mission_id: null,
        core_insight: research.content,
        topic_tags: t.tags,
        applicable_mission_types: [t.program],
        confidence: "high",
        source_summary:
          sources.length > 0
            ? `Perplexity academic sweep · ${sources.length} sources\n${sources.join("\n")}`
            : "Perplexity academic sweep",
        extracted_by: "iris-academic-sweep",
      });

      if (error) {
        console.log("[iris-academic-sweep] insert failed", t.query, error.message);
        summary.topics_failed += 1;
      } else {
        summary.cards_written += 1;
      }
    } catch (e) {
      summary.topics_failed += 1;
      console.log("[iris-academic-sweep] topic threw", t.query, e);
    }
  }

  return json(summary);
}
