import { test, expect } from "@playwright/test"
import { gotoAndWait } from "./helpers"

const makeRun = (overrides: Partial<Record<string, any>> = {}) => ({
  id: "run-1",
  scheduledScanId: "sched-1",
  executionId: "exec-12345678",
  startedAt: "2026-05-21T22:00:00.000Z",
  completedAt: "2026-05-21T22:05:00.000Z",
  status: "COMPLETED",
  totalImages: 5,
  scannedImages: 5,
  failedImages: 0,
  errorMessage: null,
  triggerSource: "CRON",
  triggeredBy: null,
  auditInfo: { detail: "ran-fine" },
  scheduledScan: {
    id: "sched-1",
    name: "Nightly Alpine",
    description: null,
    imageSelectionMode: "ALL",
  },
  scanResults: [
    {
      id: "sr-1",
      status: "SUCCESS",
      scanId: "scan-1",
      imageName: "alpine",
      imageTag: "3.19",
    },
  ],
  vulnerabilityStats: { critical: 3, high: 7, medium: 12, low: 1 },
  scanStats: { success: 5, failed: 0, pending: 0 },
  _count: { scanResults: 5 },
  ...overrides,
})

test.describe("Scheduled Scans History", () => {
  test("URL ?search=foo is parsed and seeds the table search", async ({ page }) => {
    // Empty history so the search field is initialised but no rows render.
    await page.route("**/api/scheduled-scans/history**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          history: [],
          pagination: { total: 0, limit: 100, offset: 0, hasMore: false },
        }),
      })
    })

    await gotoAndWait(page, "/scheduled-scans/history?search=foo")
    await expect(page).toHaveURL(/\/scheduled-scans\/history\?search=foo/)

    // The page heading is rendered post-load.
    await expect(
      page.getByRole("heading", { name: /scheduled scan history/i }).first(),
    ).toBeVisible({ timeout: 20_000 })

    // UnifiedTable's search box is the only generic search input on screen.
    // initialGlobalFilter prefills it with "foo".
    await expect(page.getByPlaceholder(/SEARCH\.\.\./i)).toHaveValue("foo")
  })

  test("a COMPLETED run with vulnerabilityStats renders severity badges", async ({
    page,
  }) => {
    const run = makeRun()
    await page.route("**/api/scheduled-scans/history**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          history: [run],
          pagination: { total: 1, limit: 100, offset: 0, hasMore: false },
        }),
      })
    })

    await gotoAndWait(page, "/scheduled-scans/history")
    await expect(
      page.getByRole("heading", { name: /scheduled scan history/i }).first(),
    ).toBeVisible({ timeout: 20_000 })

    // The schedule name appears in a cell.
    await expect(page.getByText("Nightly Alpine").first()).toBeVisible({
      timeout: 10_000,
    })
    // Vulnerability badges: "3 Critical", "7 High", "12 Medium".
    await expect(page.getByText(/3 critical/i).first()).toBeVisible()
    await expect(page.getByText(/7 high/i).first()).toBeVisible()
    await expect(page.getByText(/12 medium/i).first()).toBeVisible()
    // Status badge shows COMPLETED.
    await expect(page.getByText(/COMPLETED/).first()).toBeVisible()
  })

  test("Error path: GET /api/scheduled-scans/history 500 shows error toast", async ({
    page,
  }) => {
    await page.route("**/api/scheduled-scans/history**", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "boom" }),
      })
    })

    await gotoAndWait(page, "/scheduled-scans/history")

    await expect(
      page.getByText(/failed to load scan history/i).first(),
    ).toBeVisible({ timeout: 10_000 })
  })

  test("Audit info modal opens via row action when data has auditInfo", async ({
    page,
  }) => {
    const run = makeRun({ auditInfo: { ran: "ok", trace: "abc123" } })
    await page.route("**/api/scheduled-scans/history**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          history: [run],
          pagination: { total: 1, limit: 100, offset: 0, hasMore: false },
        }),
      })
    })

    await gotoAndWait(page, "/scheduled-scans/history")
    await expect(page.getByText("Nightly Alpine").first()).toBeVisible({
      timeout: 20_000,
    })

    // The "View Audit Info" action is in the context menu (right-click).
    const row = page
      .locator("tr", { has: page.getByText("Nightly Alpine") })
      .first()
    await row.click({ force: true, button: "right" })

    await page
      .getByRole("menuitem", { name: /view audit info/i })
      .click({ force: true })

    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/audit information/i).first()).toBeVisible()
    // The auditInfo JSON appears in a <pre> block.
    await expect(page.getByText(/"trace"/).first()).toBeVisible()
  })
})
