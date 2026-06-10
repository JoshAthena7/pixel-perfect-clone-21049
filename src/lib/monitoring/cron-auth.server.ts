/**
 * Auth helper for cron-invoked monitoring routes. Accepts the `CRON_HOOK_SECRET`
 * via `x-cron-secret` or `apikey` header (matches existing iris-monitor pattern).
 */
export function authorizeCron(request: Request): Response | null {
  const provided =
    request.headers.get("x-cron-secret") ?? request.headers.get("apikey");
  const expected = process.env.CRON_HOOK_SECRET;
  if (!expected || !provided || provided !== expected) {
    return new Response("Unauthorized", { status: 401 });
  }
  return null;
}
