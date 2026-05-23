import { test, expect } from "@playwright/test"
import { gotoAndWait } from "./helpers"

/**
 * VersionNotification is mounted inside the SidebarFooter of AppSidebar.
 * It calls useVersionCheck which fetches /api/version. The notification
 * card surfaces text "New Version is available" when hasUpdate is true.
 * The hook delays its first check by 5 seconds — so we need to wait.
 */
test.describe("Version update notification", () => {
  test("shows the sidebar update card when /api/version reports hasUpdate=true", async ({
    page,
  }) => {
    await page.route("**/api/version", async (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          version: {
            current: "0.2b",
            latest: "9.9.9",
            hasUpdate: true,
            lastChecked: new Date().toISOString(),
          },
        }),
      })
    )

    await gotoAndWait(page, "/")
    // The hook delays its first check 5s after mount; wait for it.
    await expect(
      page.getByText(/new version is available/i)
    ).toBeVisible({ timeout: 15_000 })
  })

  test("does NOT show update card when hasUpdate=false", async ({ page }) => {
    await page.route("**/api/version", async (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          version: {
            current: "0.2b",
            latest: "0.2b",
            hasUpdate: false,
            lastChecked: new Date().toISOString(),
          },
        }),
      })
    )

    await gotoAndWait(page, "/")
    // Wait past the 5s delayed check.
    await page.waitForTimeout(8_000)
    await expect(page.getByText(/new version is available/i)).toBeHidden()
  })
})
