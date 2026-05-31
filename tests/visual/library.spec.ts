import { test, expect, type Page } from "@playwright/test";

const EMAIL = process.env.TEST_EMAIL;
const PASSWORD = process.env.TEST_PASSWORD;

async function signIn(page: Page) {
  if (!EMAIL || !PASSWORD) {
    throw new Error(
      "TEST_EMAIL and TEST_PASSWORD must be set in the environment to run auth-gated visual tests.",
    );
  }
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(EMAIL);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  // Wait until we leave /login.
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
}

test.describe("Visual regression: /library", () => {
  test("matches baseline screenshot", async ({ page }) => {
    await signIn(page);
    await page.goto("/library");

    // Wait for the page to settle: network idle + fonts loaded.
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => document.fonts.ready);

    // Compare against tests/visual/library.spec.ts-snapshots/library-chromium-linux.png
    // (Playwright auto-generates the baseline on first run, or you can drop your
    //  reference image at that path before running.)
    await expect(page).toHaveScreenshot("library.png", { fullPage: true });
  });
});
