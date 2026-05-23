import { test, expect } from "@playwright/test"
import { gotoAndWait } from "./helpers"

test.describe("Loading / empty / error states", () => {
  test("dashboard shows skeleton while /api/scans is delayed", async ({
    page,
  }) => {
    let firstCall = true
    await page.route("**/api/scans/aggregated*", async (route) => {
      // Delay only the first call so the page renders its loading state.
      if (firstCall) {
        firstCall = false
        await new Promise((r) => setTimeout(r, 1500))
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          scans: [],
          pagination: { total: 0, limit: 50, offset: 0, hasMore: false, completedCount: 0 },
        }),
      })
    })

    await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort())
    await page.goto("/", { waitUntil: "domcontentloaded" })

    // Skeletons render via <div data-slot="skeleton">. The dashboard's
    // loading branch renders many of them.
    await expect(page.locator('[data-slot="skeleton"]').first()).toBeVisible({
      timeout: 5_000,
    })
  })

  test("dashboard handles empty scan list without errors", async ({ page }) => {
    await page.route("**/api/scans/aggregated*", async (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          scans: [],
          pagination: { total: 0, limit: 50, offset: 0, hasMore: false, completedCount: 0 },
        }),
      })
    )

    await gotoAndWait(page, "/")

    // Table appears with the empty-state row.
    await expect(
      page.locator("table").getByText(/no results\./i)
    ).toBeVisible({ timeout: 30_000 })

    // No error banner.
    await expect(page.locator("text=/^Error:/i").first()).toBeHidden()
  })

  test("dashboard surfaces an error when /api/scans returns 500", async ({
    page,
  }) => {
    await page.route("**/api/scans/aggregated*", async (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: "{}" })
    )

    await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort())
    await page.goto("/", { waitUntil: "domcontentloaded" })

    // The page.tsx error branch renders "Error: …" centered.
    await expect(page.getByText(/error:.*failed to fetch scans/i)).toBeVisible({
      timeout: 30_000,
    })
  })

  test("/repositories handles empty list", async ({ page }) => {
    await page.route("**/api/repositories*", async (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [] }),
      })
    )

    await gotoAndWait(page, "/repositories")
    // Add Repository button is always present even when list is empty.
    await expect(
      page.getByRole("button", { name: /add repository/i }).first()
    ).toBeVisible()
  })

  test("/audit-logs handles empty list", async ({ page }) => {
    await page.route("**/api/audit-logs*", async (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          auditLogs: [],
          pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
        }),
      })
    )

    await gotoAndWait(page, "/audit-logs")
    // The audit-log table empty-row text.
    await expect(
      page.locator("table").getByText(/no results\./i)
    ).toBeVisible({ timeout: 30_000 })
  })
})
