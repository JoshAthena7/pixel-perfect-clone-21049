import { test, expect, type Request } from "@playwright/test";

/**
 * Lifecycle guard: getMissionOverview must only be called AFTER the user is
 * authenticated. Walks the full pre-/post-login arc in a single page session.
 *
 * Requires TEST_EMAIL / TEST_PASSWORD env vars (see playwright.config.ts).
 */

function decodeServerFnTarget(url: string): { file: string; export: string } | null {
  const match = url.match(/\/_serverFn\/([^/?#]+)/);
  if (!match) return null;
  try {
    const b64 = match[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

const isMissionOverview = (t: { file: string; export: string } | null) =>
  !!t &&
  (t.export?.includes("getMissionOverview") || t.file?.includes("mission.functions"));

test("getMissionOverview fires only after sign-in, never before", async ({ page }) => {
  const email = process.env.TEST_EMAIL;
  const password = process.env.TEST_PASSWORD;
  test.skip(!email || !password, "TEST_EMAIL / TEST_PASSWORD not set");

  const calls: { url: string; phase: "pre-auth" | "post-auth" }[] = [];
  let signedIn = false;

  page.on("request", (req: Request) => {
    const target = decodeServerFnTarget(req.url());
    if (!isMissionOverview(target)) return;
    calls.push({ url: req.url(), phase: signedIn ? "post-auth" : "pre-auth" });
  });

  // 1. Visit the landing page unauthenticated.
  await page.goto("/", { waitUntil: "networkidle" });

  // 2. Attempt the protected Flight Deck unauthenticated — must redirect to
  //    /login without invoking the protected serverFn.
  await page.goto("/flight-deck", { waitUntil: "networkidle" });
  await expect(page).toHaveURL(/\/login$/);

  // Snapshot the pre-auth state before flipping the flag.
  const preAuthCalls = calls.filter((c) => c.phase === "pre-auth");
  expect(
    preAuthCalls,
    "getMissionOverview must NOT be called before sign-in",
  ).toEqual([]);

  // 3. Sign in.
  await page.fill('input#email', email!);
  await page.fill('input#password', password!);
  signedIn = true; // any subsequent serverFn calls count as post-auth
  await page.click('button[type="submit"]');

  // 4. Wait until we land on an authenticated route and the call has fired.
  await page.waitForURL((url) => !/\/login$/.test(url.pathname), { timeout: 15_000 });
  await page.waitForLoadState("networkidle");

  const postAuthCalls = calls.filter((c) => c.phase === "post-auth");
  expect(
    postAuthCalls.length,
    "getMissionOverview must be called at least once after sign-in",
  ).toBeGreaterThan(0);

  // Final invariant: no pre-auth call slipped in during the full flow.
  expect(calls.filter((c) => c.phase === "pre-auth")).toEqual([]);
});
