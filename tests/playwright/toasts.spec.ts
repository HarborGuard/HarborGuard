import { test, expect } from "@playwright/test"
import { gotoAndWait, safeClick } from "./helpers"

test.describe("Toasts (sonner)", () => {
  test("Toaster mounts in the DOM", async ({ page }) => {
    await gotoAndWait(page, "/")
    // Sonner's Toaster (next/sonner) renders a region for screen readers
    // immediately on mount. The data-sonner-toaster ol is created lazily
    // when a toast is rendered, but the wrapping section[aria-label] is
    // always present.
    await expect(
      page.getByRole("region", { name: /notifications/i })
    ).toHaveCount(1, { timeout: 10_000 })
  })

  test("Failing /api/settings PUT surfaces an error toast", async ({ page }) => {
    // Force the settings save endpoint to return 500 so the page emits a
    // toast.error. The GET still loads normally so the page renders.
    await page.route("**/api/settings", async (route) => {
      if (route.request().method() === "PUT") {
        return route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Server boom" }),
        })
      }
      return route.continue()
    })

    await gotoAndWait(page, "/settings")
    // Wait for the cleanupOldScansDays input to mount.
    const input = page.locator("#cleanupOldScansDays")
    await expect(input).toBeVisible({ timeout: 20_000 })

    // Make the form dirty (any value change). Then click Save Changes.
    await input.fill("99")
    await safeClick(page, page.getByRole("button", { name: /save changes/i }))

    // Sonner renders toast text inside [data-sonner-toaster]. Match the
    // mocked error message.
    await expect(
      page.locator("[data-sonner-toaster]").getByText(/server boom/i).first()
    ).toBeVisible({ timeout: 10_000 })
  })

  test("Toast can be dismissed (auto-close or manual)", async ({ page }) => {
    await page.route("**/api/settings", async (route) => {
      if (route.request().method() === "PUT") {
        return route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Dismiss me" }),
        })
      }
      return route.continue()
    })

    await gotoAndWait(page, "/settings")
    const input = page.locator("#cleanupOldScansDays")
    await expect(input).toBeVisible({ timeout: 20_000 })
    await input.fill("88")
    await safeClick(page, page.getByRole("button", { name: /save changes/i }))

    const toast = page
      .locator("[data-sonner-toaster]")
      .getByText(/dismiss me/i)
      .first()
    await expect(toast).toBeVisible({ timeout: 10_000 })

    // Sonner's default duration is 4000ms. Wait up to 10s for the toast
    // to auto-dismiss. The container element may stick around (sonner
    // animates), so assert on the text being gone.
    await expect(toast).toBeHidden({ timeout: 12_000 })
  })
})
