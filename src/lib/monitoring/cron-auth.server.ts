/**
 * Auth for cron-invoked monitoring routes. Accepts the Supabase
 * anon/publishable key in the `apikey` header — the canonical pg_cron
 * pattern used elsewhere in this project. Also honors `x-cron-secret`
 * matching `CRON_HOOK_SECRET` for manual curl/test invocations.
 */
export function authorizeCron(request: Request): Response | null {
  const provided =
    request.headers.get("x-cron-secret") ?? request.headers.get("apikey");
  if (!provided) return new Response("Unauthorized", { status: 401 });

  const anon =
    process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
  const cronSecret = process.env.CRON_HOOK_SECRET ?? "";

  if ((anon && provided === anon) || (cronSecret && provided === cronSecret)) {
    return null;
  }
  return new Response("Unauthorized", { status: 401 });
}
