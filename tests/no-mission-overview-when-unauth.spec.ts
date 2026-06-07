import { test, expect, type Request } from "@playwright/test";

/**
 * Guard: getMissionOverview is a protected server function (requires
 * requireSupabaseAuth). It must NEVER be invoked from an unauthenticated
 * route loader or render path — doing so 401s during SSR/prerender and
 * blanks the page.
 *
 * TanStack serverFn RPCs hit `/_serverFn/<base64>` where the base64 payload
 * encodes `{ file, export }`. We decode every such request made while
 * visiting public routes and assert none target getMissionOverview.
 */

const PUBLIC_ROUTES = [
  // Top-level public routes
  "/",
  "/login",
  "/iris",
  "/debug/gold-entry-fallback",
  "/debug/daily-note-layout",
  "/checkin/test-token-123",
  // Protected routes — visiting unauthenticated must redirect to /login via
  // the _authenticated gate WITHOUT triggering the protected serverFn.
  "/flight-deck",
  "/v1",
  "/v1/vault",
  "/v1/sections",
  "/missions/00000000-0000-0000-0000-000000000000/vault",
  "/missions/00000000-0000-0000-0000-000000000000/team",
];

function decodeServerFnTarget(url: string): { file: string; export: string } | null {
  const match = url.match(/\/_serverFn\/([^/?#]+)/);
  if (!match) return null;
  try {
    // base64url → base64
    const b64 = match[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const json = Buffer.from(padded, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

for (const route of PUBLIC_ROUTES) {
  test(`getMissionOverview is not fetched from ${route}`, async ({ page }) => {
    const offenders: string[] = [];

    page.on("request", (req: Request) => {
      const target = decodeServerFnTarget(req.url());
      if (!target) return;
      if (
        target.export?.includes("getMissionOverview") ||
        target.file?.includes("mission.functions")
      ) {
        offenders.push(`${req.method()} ${target.file} :: ${target.export}`);
      }
    });

    await page.goto(route, { waitUntil: "networkidle" });

    expect(
      offenders,
      `Unauthenticated route ${route} triggered protected mission serverFn call(s)`,
    ).toEqual([]);
  });
}
