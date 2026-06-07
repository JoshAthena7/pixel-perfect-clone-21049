import { test, expect, type Request } from "@playwright/test";

/**
 * Full auth lifecycle guard for getMissionOverview:
 *   1. Sign in → mission overview fetched (post-auth).
 *   2. Sign out → redirect away from protected routes.
 *   3. Navigate the public surface again → mission overview must NEVER
 *      fire while signed out.
 *
 * Requires TEST_EMAIL / TEST_PASSWORD env vars (see playwright.config.ts).
 */

function decodeServerFnTarget(url: string): { file: string; export: string } | null {
  const m = url.match(/\/_serverFn\/([^/?#]+)/);
  if (!m) return null;
  try {
    const b64 = m[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

const isMissionOverview = (t: { file: string; export: string } | null) =>
  !!t &&
  (t.export?.includes("getMissionOverview") || t.file?.includes("mission.functions"));

test("getMissionOverview stops firing after sign-out", async ({ page }) => {
  const email = process.env.TEST_EMAIL;
  const password = process.env.TEST_PASSWORD;
  test.skip(!email || !password, "TEST_EMAIL / TEST_PASSWORD not set");

  type Phase = "pre-auth" | "post-auth" | "post-logout";
  let phase: Phase = "pre-auth";
  const calls: { phase: Phase; url: string }[] = [];

  page.on("request", (req: Request) => {
    const target = decodeServerFnTarget(req.url());
    if (!isMissionOverview(target)) return;
    calls.push({ phase, url: req.url() });
  });

  // ── 1. Sign in ────────────────────────────────────────────────────────
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.fill("input#email", email!);
  await page.fill("input#password", password!);
  phase = "post-auth";
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !/\/login$/.test(u.pathname), { timeout: 15_000 });
  await page.waitForLoadState("networkidle");

  expect(
    calls.filter((c) => c.phase === "pre-auth"),
    "no pre-auth getMissionOverview calls",
  ).toEqual([]);
  expect(
    calls.filter((c) => c.phase === "post-auth").length,
    "getMissionOverview should fire after sign-in",
  ).toBeGreaterThan(0);

  // ── 2. Sign out ───────────────────────────────────────────────────────
  // Header sign-out button is rendered by v2 AppShell with aria-label="Sign out".
  await page.getByRole("button", { name: /sign out/i }).first().click();
  await page.waitForURL(/\/(login|auth)$/, { timeout: 15_000 });
  await page.waitForLoadState("networkidle");

  // Flip the phase AFTER the sign-out network settles so any trailing
  // post-auth refetch isn't misattributed.
  phase = "post-logout";

  // ── 3. Re-walk public + protected fallbacks while signed out ─────────
  const ROUTES = [
    "/",
    "/login",
    "/iris",
    "/flight-deck",
    "/v1",
    "/v1/vault",
    "/missions/00000000-0000-0000-0000-000000000000/vault",
  ];
  for (const r of ROUTES) {
    await page.goto(r, { waitUntil: "networkidle" });
  }

  const postLogout = calls.filter((c) => c.phase === "post-logout");
  expect(
    postLogout,
    `getMissionOverview must NEVER fire while signed out, got:\n${postLogout
      .map((c) => `  - ${c.url}`)
      .join("\n")}`,
  ).toEqual([]);
});
