// Backfill route: extract + embed every Vault document that has not been
// processed yet (or that previously failed). Safe to re-run; processes a
// bounded batch per invocation so it can be scheduled by pg_cron.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/backfill-vault-extractions")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
    },
  },
});

async function handle(request: Request) {
  const provided =
    request.headers.get("x-cron-secret") ?? request.headers.get("apikey");
  const expected = process.env.CRON_HOOK_SECRET;
  if (!expected || !provided || provided !== expected) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { extractAndEmbedVaultDoc } = await import("@/lib/vault-extract.server");

  const limit = 20;
  const { data: pending, error } = await supabaseAdmin
    .from("mission_vault_documents")
    .select("id")
    .in("extraction_status", ["pending", "failed"])
    .not("file_path", "is", null)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("[backfill-vault-extractions] query failed", error);
    return new Response(JSON.stringify({ ok: false }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const results: Array<{ id: string; status: string; chunks: number }> = [];
  for (const row of pending ?? []) {
    const r = await extractAndEmbedVaultDoc(supabaseAdmin as any, row.id);
    results.push({ id: row.id, status: r.status, chunks: r.chunks });
  }

  return new Response(
    JSON.stringify({ ok: true, processed: results.length }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}
