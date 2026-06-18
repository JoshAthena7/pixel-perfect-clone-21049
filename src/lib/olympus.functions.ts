/**
 * Olympus server functions — admin-only data for the ORACLE command surface.
 *
 *   - getOlympusTaxonomy(): full taxonomy tree + signal counts per node
 *   - listOlympusSignals(): paginated signals filtered by status / node
 *   - listOlympusSources(): registry rows for the sources tab
 *   - addOlympusSource(): insert into source registry
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertAdmin(context: { supabase: { rpc: Function }; userId: string }) {
  const { data, error } = await (context.supabase as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: boolean | null; error: unknown }>;
  }).rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (error) throw new Error("role check failed");
  if (!data) throw new Error("Forbidden — admin role required");
}

export const getOlympusTaxonomy = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: nodes }, { data: signals }] = await Promise.all([
      supabaseAdmin
        .from("oracle_taxonomy")
        .select("id, parent_id, domain, node_name, node_code, depth, is_leaf")
        .order("domain", { ascending: true })
        .order("depth", { ascending: true })
        .order("node_code", { ascending: true }),
      supabaseAdmin
        .from("oracle_signals")
        .select("taxonomy_node_ids, status")
        .in("status", ["needs_review", "approved", "pushed"]),
    ]);

    const counts = new Map<string, number>();
    for (const sig of signals ?? []) {
      const ids = (sig as { taxonomy_node_ids: string[] }).taxonomy_node_ids ?? [];
      for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
    }

    return {
      nodes: (nodes ?? []).map((n) => ({
        ...(n as Record<string, unknown>),
        count: counts.get((n as { id: string }).id) ?? 0,
      })),
    };
  });

const ListSignalsInput = z.object({
  missionId: z.string().uuid().nullable().optional(),
  status: z.enum(["all", "needs_review", "approved", "pushed", "dismissed", "errors"]).default("needs_review"),
  taxonomyNodeId: z.string().uuid().nullable().optional(),
  limit: z.number().int().min(1).max(200).default(50),
});

export const listOlympusSignals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ListSignalsInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let q = supabaseAdmin
      .from("oracle_signals")
      .select(
        "id, title, summary, source_name, category, subcategory, urgency, relevance_score, oracle_score, status, taxonomy_node_ids, topic_tags, published_at, created_at, metadata, ingestion_source",
      )
      .order("relevance_score", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(data.limit);

    if (data.status === "errors") {
      q = q.eq("status", "error");
    } else if (data.status !== "all") {
      q = q.eq("status", data.status);
    }
    if (data.taxonomyNodeId) {
      q = q.contains("taxonomy_node_ids", [data.taxonomyNodeId]);
    }
    // mission-scoped signals OR platform/state tier
    if (data.missionId) {
      q = q.or(`mission_id.eq.${data.missionId},mission_id.is.null`);
    }

    const { data: rows, error } = await q;
    if (error) throw error;

    // Also fetch status counts for the header bar
    const { data: countRows } = await supabaseAdmin
      .from("oracle_signals")
      .select("status")
      .limit(5000);
    const counts: Record<string, number> = {
      needs_review: 0, approved: 0, pushed: 0, dismissed: 0, error: 0,
    };
    for (const r of countRows ?? []) {
      const s = (r as { status: string }).status;
      if (s in counts) counts[s] += 1;
    }

    return { signals: rows ?? [], counts };
  });

export const listOlympusSources = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("oracle_source_registry")
      .select("id, source_name, source_url, tier, state_code, status, last_checked_at, error_count, error_message, check_frequency_hours, default_category, default_subcategory, source_type")
      .order("tier", { ascending: true })
      .order("source_name", { ascending: true });
    if (error) throw error;
    return { sources: data ?? [] };
  });

const AddSourceInput = z.object({
  source_name: z.string().min(1),
  source_url: z.string().url(),
  feed_url: z.string().url().optional().nullable(),
  source_type: z.string().default("html_scrape"),
  default_category: z.string(),
  default_subcategory: z.string(),
  check_frequency_hours: z.number().int().min(1).max(168).default(4),
  tier: z.enum(["platform", "state", "mission"]),
  state_code: z.string().length(2).optional().nullable(),
});

export const addOlympusSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AddSourceInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabaseAdmin.from("oracle_source_registry").insert(data as any);
    if (error) throw error;
    return { ok: true };
  });
