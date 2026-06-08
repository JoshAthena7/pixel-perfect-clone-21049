import { createFileRoute } from "@tanstack/react-router";

/**
 * Weekly cron hook: re-runs the advocate web scrub for each active mission,
 * merges any newly-discovered advocacy orgs / CBOs / research partners /
 * funders into mission_client_intel.stakeholders, and writes a Signal when
 * the roster materially changes.
 *
 * Throttled to keep one cron tick bounded; missions that aren't scrubbed
 * this run pick up next week.
 *
 * Auth: accepts the Supabase anon key via `apikey` header (pg_cron sends it)
 * or a manual `x-cron-secret` for curl tests.
 */

const MAX_MISSIONS_PER_RUN = 15;
const RESCRUB_INTERVAL_MS = 6 * 24 * 60 * 60 * 1000; // 6 days (give a little slack on weekly)

type Mission = {
  id: string;
  name: string | null;
  state: string | null;
  state_agency: string | null;
  program_type: string | null;
  status: string | null;
};

type IntelRow = {
  mission_id: string;
  stakeholders: unknown;
  last_advocate_scrub_at: string | null;
};

function authorize(request: Request): boolean {
  const apiKey = request.headers.get("apikey");
  const cronSecret = request.headers.get("x-cron-secret");
  const anon = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (apiKey && anon && apiKey === anon) return true;
  if (cronSecret && process.env.CRON_SECRET && cronSecret === process.env.CRON_SECRET) return true;
  return false;
}

function asStakeholderStrings(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => {
      if (typeof x === "string") return x.trim();
      if (x && typeof x === "object") {
        const obj = x as { name?: unknown; role?: unknown; notes?: unknown };
        const head = [obj.name, obj.role]
          .map((p) => String(p ?? "").trim())
          .filter(Boolean)
          .join(" — ");
        return obj.notes ? `${head} (${String(obj.notes).trim()})` : head;
      }
      return "";
    })
    .filter(Boolean);
}

/**
 * Very lightweight org-name extractor from the web scrub blocks: pulls
 * Title-Case-looking phrases and bullet headers. Not perfect — but the
 * point is to surface *new* advocate names since the last run, not to
 * be a definitive roster (the LLM-driven extraction in the main pipeline
 * still owns that).
 */
function extractOrgsFromScrub(webContext: string): string[] {
  if (!webContext) return [];
  const out = new Set<string>();
  const lines = webContext.split("\n");
  for (const raw of lines) {
    const line = raw.replace(/^[#>\-*\d\.\)\s]+/, "").trim();
    if (line.length < 4 || line.length > 140) continue;
    if (line.startsWith("Query:") || line.startsWith("Source:")) continue;
    // Heuristic: lines that look like org names — capitalized words, may
    // include " - description" or " (acronym)".
    const head = line.split(/[–—\-:|]/)[0].trim();
    if (head.length < 4 || head.length > 80) continue;
    // Drop sentences (too many lowercase words)
    const words = head.split(/\s+/);
    if (words.length < 2 || words.length > 10) continue;
    const caps = words.filter((w) => /^[A-Z]/.test(w)).length;
    if (caps / words.length < 0.55) continue;
    // Drop obvious non-orgs
    if (/\b(the|a|an|this|these|that|those|with|and|for|from|of|to|in|on)\b/i.test(words[0])) continue;
    out.add(head);
  }
  return Array.from(out).slice(0, 40);
}

async function rescrubMission(
  supabaseAdmin: any,
  scrubAdvocatesFromWeb: (mission: Mission, docText: string) => Promise<{
    webContext: string;
    sources: Array<{ url: string; title?: string }>;
  }>,
  mission: Mission,
  intel: IntelRow | null,
): Promise<{ mission_id: string; new_count: number; total: number; skipped?: string }> {
  // No web key → silently skip; the hook will just stamp last_scrub_at so we
  // don't hammer it next run.
  if (!process.env.FIRECRAWL_API_KEY) {
    await supabaseAdmin
      .from("mission_client_intel")
      .upsert(
        {
          mission_id: mission.id,
          last_advocate_scrub_at: new Date().toISOString(),
        } as never,
        { onConflict: "mission_id" },
      );
    return { mission_id: mission.id, new_count: 0, total: 0, skipped: "no firecrawl key" };
  }

  const scrub = await scrubAdvocatesFromWeb(mission, "");
  const discovered = extractOrgsFromScrub(scrub.webContext);

  const existing = asStakeholderStrings(intel?.stakeholders);
  const existingLower = new Set(existing.map((s) => s.toLowerCase()));

  const newOrgs: string[] = [];
  for (const org of discovered) {
    // match against ANY token in existing stakeholder strings, since the
    // strings often look like "ACNJ — statewide child welfare advocacy".
    const orgLower = org.toLowerCase();
    let alreadyKnown = false;
    for (const exist of existingLower) {
      if (exist.includes(orgLower) || orgLower.includes(exist.split(" — ")[0].toLowerCase())) {
        alreadyKnown = true;
        break;
      }
    }
    if (!alreadyKnown) newOrgs.push(org);
  }

  // Merge: append new orgs with a `(web: …)` source URL if we can match one.
  let merged = existing;
  if (newOrgs.length > 0) {
    const newEntries = newOrgs.map((org) => {
      const src = scrub.sources.find((s) =>
        s.title && s.title.toLowerCase().includes(org.toLowerCase()),
      );
      const host = src?.url ? new URL(src.url).hostname.replace(/^www\./, "") : null;
      return host ? `${org} (web: ${host})` : org;
    });
    merged = [...existing, ...newEntries];
  }

  await supabaseAdmin
    .from("mission_client_intel")
    .upsert(
      {
        mission_id: mission.id,
        stakeholders: merged,
        last_advocate_scrub_at: new Date().toISOString(),
      } as never,
      { onConflict: "mission_id" },
    );

  // Raise a Signal when the roster changed
  if (newOrgs.length > 0) {
    await supabaseAdmin.from("signals").insert({
      mission_id: mission.id,
      source_module: "client_intel",
      signal_type: "advocate_roster_change",
      signal_title: `${newOrgs.length} new advocate${newOrgs.length === 1 ? "" : "s"} found in weekly scrub`,
      signal_summary: newOrgs.slice(0, 10).join("\n"),
      severity: newOrgs.length >= 5 ? "medium" : "low",
      status: "new",
      tags: ["advocates", "weekly_scrub"],
      created_by_system: true,
    } as never);
  }

  return {
    mission_id: mission.id,
    new_count: newOrgs.length,
    total: merged.length,
  };
}

export const Route = createFileRoute("/api/public/hooks/iris-rescrub-advocates")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!authorize(request)) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { scrubAdvocatesFromWeb } = await import(
          "@/lib/iris-extractors/client-intel.functions"
        );

        // Active missions, oldest scrub first.
        const cutoff = new Date(Date.now() - RESCRUB_INTERVAL_MS).toISOString();

        const { data: missions, error: mErr } = await supabaseAdmin
          .from("missions")
          .select("id,name,state,state_agency,program_type,status")
          .neq("status", "archived")
          .neq("status", "closed")
          .limit(200);
        if (mErr) {
          return new Response(JSON.stringify({ error: mErr.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const missionIds = (missions ?? []).map((m) => m.id);
        if (missionIds.length === 0) {
          return new Response(JSON.stringify({ ok: true, processed: 0 }), {
            headers: { "Content-Type": "application/json" },
          });
        }

        const { data: intelRows } = await supabaseAdmin
          .from("mission_client_intel")
          .select("mission_id,stakeholders,last_advocate_scrub_at")
          .in("mission_id", missionIds);
        const intelByMission = new Map<string, IntelRow>();
        for (const r of intelRows ?? []) intelByMission.set((r as IntelRow).mission_id, r as IntelRow);

        // Pick missions whose last scrub is older than the interval (or never scrubbed)
        const due = (missions ?? [])
          .filter((m) => {
            const intel = intelByMission.get(m.id);
            if (!intel) return true; // no record yet
            if (!intel.last_advocate_scrub_at) return true;
            return intel.last_advocate_scrub_at < cutoff;
          })
          .sort((a, b) => {
            const aTs = intelByMission.get(a.id)?.last_advocate_scrub_at ?? "";
            const bTs = intelByMission.get(b.id)?.last_advocate_scrub_at ?? "";
            return aTs.localeCompare(bTs);
          })
          .slice(0, MAX_MISSIONS_PER_RUN);

        const results: Array<{ mission_id: string; new_count: number; total: number; skipped?: string }> = [];
        for (const m of due) {
          try {
            const res = await rescrubMission(
              supabaseAdmin,
              scrubAdvocatesFromWeb,
              m as Mission,
              intelByMission.get(m.id) ?? null,
            );
            results.push(res);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            results.push({ mission_id: m.id, new_count: 0, total: 0, skipped: msg });
          }
        }

        return new Response(
          JSON.stringify({
            ok: true,
            considered: missions?.length ?? 0,
            due: due.length,
            processed: results.length,
            results,
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
