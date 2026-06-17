/**
 * Auth for cron-invoked monitoring routes. Only accepts `x-cron-secret`
 * matching `CRON_HOOK_SECRET`. The Supabase publishable/anon key is NOT
 * accepted — it's embedded in the client bundle and any visitor can
 * extract it from DevTools, which would let them invoke admin-privileged
 * cron operations.
 *
 * pg_cron jobs must send: `x-cron-secret: <CRON_HOOK_SECRET>`.
 */
export function authorizeCron(request: Request): Response | null {
  const provided = request.headers.get("x-cron-secret");
  const cronSecret = process.env.CRON_HOOK_SECRET ?? "";
  if (!provided || !cronSecret || provided !== cronSecret) {
    return new Response("Unauthorized", { status: 401 });
  }
  return null;
}
