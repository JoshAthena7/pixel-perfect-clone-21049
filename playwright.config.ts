import { defineConfig, devices } from "@playwright/test";

/**
 * Visual regression config.
 * BASE_URL defaults to the dev preview; override for CI / published URL.
 * TEST_EMAIL / TEST_PASSWORD are required for routes behind auth.
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  expect: {
    // Strict pixel comparison — fails on any diff above the tiny default threshold.
    toHaveScreenshot: {
      maxDiffPixelRatio: 0,
      animations: "disabled",
      caret: "hide",
    },
  },
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:8080",
    trace: "retain-on-failure",
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
  ],
});
