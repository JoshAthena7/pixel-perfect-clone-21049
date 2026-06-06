import { test, expect, type ConsoleMessage } from "@playwright/test";

/**
 * Verifies the SSR fallback debug page renders cleanly:
 *   1. HTTP 200.
 *   2. "All cases passed" banner is present (so every simulated failure mode
 *      returned a safe component, not a crash).
 *   3. No React hydration warnings, no "Switched to client rendering"
 *      messages, and no uncaught page errors.
 */
test("debug/gold-entry-fallback renders without hydration warnings", async ({ page }) => {
  const consoleProblems: string[] = [];
  const pageErrors: string[] = [];

  const isHydrationProblem = (text: string) =>
    /hydration|hydrating|did not match|switched to client rendering|Minified React error #(418|419|422|423|425)/i.test(
      text,
    );

  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() === "error" || msg.type() === "warning") {
      const text = msg.text();
      if (isHydrationProblem(text)) consoleProblems.push(`[${msg.type()}] ${text}`);
    }
  });

  page.on("pageerror", (err) => {
    pageErrors.push(err.message);
  });

  const response = await page.goto("/debug/gold-entry-fallback", {
    waitUntil: "networkidle",
  });

  expect(response, "navigation response").not.toBeNull();
  expect(response!.status(), "HTTP status").toBe(200);

  // The page mounts the success banner during render — present in both SSR
  // HTML and after hydration.
  await expect(page.getByTestId("overall-status")).toContainText("All cases passed");

  // After mount the same banner flips from "ssr render" to "hydrated".
  // If hydration silently failed this text would never appear.
  await expect(page.getByTestId("overall-status")).toContainText("hydrated");

  expect(consoleProblems, "hydration-related console output").toEqual([]);
  expect(pageErrors, "uncaught page errors").toEqual([]);
});
