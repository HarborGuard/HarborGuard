import { test, expect } from "@playwright/test"
import { gotoAndWait } from "./helpers"

const sampleLog = (overrides: Partial<Record<string, any>> = {}) => ({
  id: "log-1",
  eventType: "scan_start",
  category: "action",
  userIp: "10.0.0.1",
  userAgent: "Mozilla/5.0",
  userId: null,
  resource: "/scans",
  action: "CREATE",
  details: { foo: "bar" },
  metadata: { url: "/scans", method: "POST" },
  timestamp: "2026-05-22T16:36:55.547Z",
  ...overrides,
})

const auditResponse = (logs: any[], total = logs.length) => ({
  auditLogs: logs,
  pagination: {
    page: 1,
    limit: 20,
    total,
    totalPages: Math.max(1, Math.ceil(total / 20)),
  },
})

test.describe("Audit Logs", () => {
  test("page loads without runtime error", async ({ page }) => {
    await gotoAndWait(page, "/audit-logs")
    // Either the filters card or a table heading should be visible — both
    // are rendered before /api/audit-logs resolves.
    await expect(page.getByText(/audit logs?/i).first()).toBeVisible({
      timeout: 20_000,
    })
  })
})

test.describe("Audit Logs — filters and table", () => {
  test.beforeEach(async ({ page }) => {
    // Default response: a single seeded entry. Individual tests can re-route.
    await page.route("**/api/audit-logs**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(auditResponse([sampleLog()])),
      })
    })
  })

  test("renders filter card with event-type select", async ({ page }) => {
    await gotoAndWait(page, "/audit-logs")

    // Filter card title is "Filter Audit Logs"
    await expect(page.getByText(/filter audit logs/i).first()).toBeVisible({
      timeout: 20_000,
    })
    // The Event Type label sits next to a Radix Select trigger; the trigger
    // shows "All event types" as the default value/placeholder.
    await expect(page.getByText(/event type/i).first()).toBeVisible()
    await expect(
      page.locator("button[role='combobox']").first(),
    ).toBeVisible()
  })

  test("selecting event-type fires refetch with eventType= query", async ({ page }) => {
    await gotoAndWait(page, "/audit-logs")
    await expect(page.getByText(/filter audit logs/i).first()).toBeVisible({
      timeout: 20_000,
    })

    const refetch = page.waitForRequest(
      (req) =>
        req.url().includes("/api/audit-logs") &&
        req.url().includes("eventType=scan_start"),
    )

    // Open the event-type Select trigger (the one labelled "All event types").
    const trigger = page.locator("button[role='combobox']").first()
    await trigger.click({ force: true })
    // Pick "Scan Start" exactly — "Bulk Scan Start" is also an option.
    await page
      .getByRole("option", { name: "Scan Start", exact: true })
      .click({ force: true })

    await refetch
  })

  test("selecting category fires refetch with category= query", async ({ page }) => {
    await gotoAndWait(page, "/audit-logs")
    await expect(page.getByText(/filter audit logs/i).first()).toBeVisible({
      timeout: 20_000,
    })
    // Wait for the initial fetch to land so we don't race the subsequent
    // change-triggered refetch against the mount-time fetch.
    await page.waitForResponse(
      (resp) => resp.url().includes("/api/audit-logs") && resp.ok(),
      { timeout: 20_000 },
    )

    const refetch = page.waitForRequest(
      (req) =>
        req.url().includes("/api/audit-logs") &&
        req.url().includes("category=security"),
    )

    const categoryTrigger = page.locator("button[role='combobox']").nth(1)
    await categoryTrigger.click({ force: true })
    await page.getByRole("option", { name: "Security" }).click({ force: true })

    await refetch
  })

  test("typing in search input passes search= query", async ({ page }) => {
    await gotoAndWait(page, "/audit-logs")
    await expect(page.getByText(/filter audit logs/i).first()).toBeVisible({
      timeout: 20_000,
    })
    // The initial /api/audit-logs response usually completes before we
    // reach this assertion, so a waitForResponse here would block
    // forever. The filter-card visibility is signal enough; wait for the
    // input to be ready, then set up the refetch watcher and trigger it.
    await expect(page.locator("#search")).toBeVisible({ timeout: 10_000 })

    const refetch = page.waitForRequest(
      (req) =>
        req.url().includes("/api/audit-logs") && req.url().includes("search="),
      { timeout: 15_000 },
    )

    await page.locator("#search").fill("hello")
    await refetch
  })

  test("date picker passes ISO startDate= / endDate= params", async ({ page }) => {
    await gotoAndWait(page, "/audit-logs")
    await expect(page.getByText(/filter audit logs/i).first()).toBeVisible({
      timeout: 20_000,
    })

    const refetch = page.waitForRequest(
      (req) =>
        req.url().includes("/api/audit-logs") &&
        req.url().includes("startDate="),
    )

    // Open the Start Date popover (button labelled "Pick a date" near the
    // Start Date label) — it's the first such button on the page.
    await page.getByRole("button", { name: /pick a date/i }).first().click({ force: true })
    // Pick any day visible on the popover calendar. We grab "15" which exists
    // every month and click. Radix-Day buttons are role="gridcell" but
    // react-day-picker exposes them as role="button" with the day number.
    const dayBtn = page
      .locator("[role='dialog'], [role='listbox'], .rdp-day")
      .locator("button:not([disabled])")
      .filter({ hasText: /^15$/ })
      .first()
    await dayBtn.click({ force: true })

    await refetch
  })

  test("Clear Filters removes filter params from next request", async ({ page }) => {
    await gotoAndWait(page, "/audit-logs")
    await expect(page.getByText(/filter audit logs/i).first()).toBeVisible({
      timeout: 20_000,
    })

    // Set a filter so the button appears. Listen for the search refetch
    // BEFORE typing so we don't miss it.
    const searchRequest = page.waitForRequest((req) =>
      req.url().includes("/api/audit-logs") && req.url().includes("search="),
    )
    await page.locator("#search").fill("seed")
    await searchRequest

    const clearRefetch = page.waitForRequest(
      (req) => {
        const url = req.url()
        return (
          url.includes("/api/audit-logs") &&
          !url.includes("search=") &&
          !url.includes("eventType=") &&
          !url.includes("category=")
        )
      },
    )

    await page.getByRole("button", { name: /clear filters/i }).click({ force: true })
    await clearRefetch
  })

  test("pagination next triggers refetch with page= param", async ({ page }) => {
    // Need a >1 totalPages dataset for the next/prev buttons to be enabled.
    await page.unroute("**/api/audit-logs**")
    await page.route("**/api/audit-logs**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          auditLogs: [sampleLog()],
          pagination: { page: 1, limit: 20, total: 100, totalPages: 5 },
        }),
      })
    })

    await gotoAndWait(page, "/audit-logs")
    await expect(page.getByText(/filter audit logs/i).first()).toBeVisible({
      timeout: 20_000,
    })

    // Wait for the initial fetch to settle so totalPages is rendered.
    await expect(page.getByText(/page 1 of 5/i).first()).toBeVisible({
      timeout: 10_000,
    })

    const refetch = page.waitForRequest(
      (req) => req.url().includes("/api/audit-logs") && req.url().includes("page=2"),
    )
    // Pagination toolbar: 4 icon-only buttons (first, prev, next, last).
    // They live in a cluster `div.flex.items-center.gap-1`. Click the third
    // one (index 2) — that's the "next page" ChevronRight.
    const paginationCluster = page
      .locator("div.flex.items-center.gap-1")
      .filter({ has: page.locator("button") })
      .last()
    await paginationCluster.locator("button").nth(2).click({ force: true })

    await refetch
  })

  test("row click opens details dialog with formatted JSON", async ({ page }) => {
    await gotoAndWait(page, "/audit-logs")
    await expect(page.getByText(/filter audit logs/i).first()).toBeVisible({
      timeout: 20_000,
    })
    // Wait for table data to render — the seeded log's resource "/scans"
    // appears in a row cell.
    await expect(page.getByText("/scans").first()).toBeVisible({ timeout: 10_000 })

    // Row actions render a "View Details" button per row.
    await page.getByRole("button", { name: /view details/i }).first().click({ force: true })

    // Dialog has role=dialog with title "Audit Log Details"
    await expect(page.getByRole("dialog")).toBeVisible()
    await expect(page.getByText(/audit log details/i).first()).toBeVisible()
    // The JSON pre block contains the seeded "foo": "bar"
    await expect(page.getByText(/"foo"/).first()).toBeVisible()
  })

  test("empty state when API returns []", async ({ page }) => {
    await page.unroute("**/api/audit-logs**")
    await page.route("**/api/audit-logs**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(auditResponse([], 0)),
      })
    })

    await gotoAndWait(page, "/audit-logs")
    await expect(page.getByText(/filter audit logs/i).first()).toBeVisible({
      timeout: 20_000,
    })
    // UnifiedTable renders "No results." (or similar). Match common phrasing.
    await expect(
      page.getByText(/no results|no data|no entries|no audit/i).first(),
    ).toBeVisible({ timeout: 10_000 })
  })
})
