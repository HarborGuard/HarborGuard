import { defineConfig } from "@playwright/test"

const isCI = !!process.env.CI

export default defineConfig({
  testDir: "./tests/playwright",
  outputDir: "./tests/outputs/playwright",
  // RootLayout loads Inter + Gowun Batang from fonts.googleapis.com. In CI
  // (and headless runs without internet warm-up) the font fetch can stall
  // for tens of seconds, leaving the page in a layout-shift loop that
  // Playwright's actionability checks treat as "not stable". helpers.ts
  // routes those requests off so the suite isn't bound to network luck.
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  workers: isCI ? 2 : undefined,
  retries: isCI ? 1 : 0,
  forbidOnly: isCI,
  reporter: isCI
    ? [
        ["list"],
        ["github"],
        ["html", { open: "never", outputFolder: "tests/outputs/playwright-html-report" }],
        ["json", { outputFile: "tests/outputs/playwright-report.json" }],
      ]
    : [["list"], ["html", { open: "never", outputFolder: "tests/outputs/playwright-html-report" }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",
    headless: true,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    viewport: { width: 1440, height: 900 },
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    trace: "retain-on-failure",
    // The dashboard wraps every page in `.animate-fade-in`, which keyframes
    // transform over 0.4s. Playwright's actionability checks require the
    // bounding box to be stable for two consecutive frames, so any click
    // during that 400ms window times out. The app honors prefers-reduced-motion,
    // so opt the test browser into reduced motion.
    contextOptions: { reducedMotion: "reduce" },
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
})
