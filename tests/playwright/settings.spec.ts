import { test, expect } from "@playwright/test"
import { gotoAndWait } from "./helpers"

test.describe("Settings", () => {
  test.beforeEach(async ({ page }) => {
    await gotoAndWait(page, "/settings")
  })

  test("renders cleanup retention fields", async ({ page }) => {
    // Settings page loads values async from /api/settings; the page renders
    // "Loading settings..." until that resolves. Wait for a real number input
    // to appear — that's the first concrete signal the form mounted.
    await expect(page.locator("input[type='number']").first()).toBeVisible({
      timeout: 20_000,
    })
    // Once the form mounted, the "S3 Artifact Cleanup" card title is visible.
    await expect(page.getByText(/cleanup/i).first()).toBeVisible()
  })
})

// Helpers for the "mocked" settings suite below. We re-mock /api/settings on
// every page navigation so the suite is independent of whatever values
// happen to be in the dev database.
const DEFAULT_SETTINGS = {
  cleanupOldScansDays: "30",
  cleanupAuditLogsDays: "45",
  cleanupBulkScansDays: "21",
  cleanupS3Artifacts: "true",
}

async function waitForSettingsForm(page: import("@playwright/test").Page) {
  // Form is rendered once /api/settings resolves and `settings` is set.
  await expect(page.locator("#cleanupOldScansDays")).toBeVisible({
    timeout: 20_000,
  })
}

test.describe("Settings — mocked", () => {
  test("populates inputs from GET /api/settings response", async ({ page }) => {
    await page.route("**/api/settings", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(DEFAULT_SETTINGS),
        })
        return
      }
      await route.continue()
    })

    await gotoAndWait(page, "/settings")
    await waitForSettingsForm(page)

    await expect(page.locator("#cleanupOldScansDays")).toHaveValue("30")
    await expect(page.locator("#cleanupAuditLogsDays")).toHaveValue("45")
    await expect(page.locator("#cleanupBulkScansDays")).toHaveValue("21")
    // S3 switch: button[role="switch"][aria-checked="true"|"false"]
    await expect(page.locator("#cleanupS3Artifacts")).toHaveAttribute(
      "aria-checked",
      "true",
    )
  })

  test("Save button disabled when pristine, enabled after editing", async ({ page }) => {
    await page.route("**/api/settings", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(DEFAULT_SETTINGS),
        })
        return
      }
      await route.continue()
    })

    await gotoAndWait(page, "/settings")
    await waitForSettingsForm(page)

    const saveBtn = page.getByRole("button", { name: /save changes/i })
    await expect(saveBtn).toBeDisabled()

    // Mutate one field
    await page.locator("#cleanupOldScansDays").fill("99")
    await expect(saveBtn).toBeEnabled()
  })

  test("Save round-trip: PUT, toast, dirty resets", async ({ page }) => {
    let putBody: any = null
    await page.route("**/api/settings", async (route) => {
      const method = route.request().method()
      if (method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(DEFAULT_SETTINGS),
        })
        return
      }
      if (method === "PUT") {
        putBody = route.request().postDataJSON()
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ...DEFAULT_SETTINGS,
            cleanupOldScansDays: "60",
          }),
        })
        return
      }
      await route.continue()
    })

    await gotoAndWait(page, "/settings")
    await waitForSettingsForm(page)
    await page.locator("#cleanupOldScansDays").fill("60")

    const saveBtn = page.getByRole("button", { name: /save changes/i })
    await expect(saveBtn).toBeEnabled()

    const putRequest = page.waitForRequest(
      (req) => req.url().includes("/api/settings") && req.method() === "PUT",
    )
    // Use force: true to bypass animate-fade-in jitter.
    await saveBtn.click({ force: true })
    await putRequest

    expect(putBody?.cleanupOldScansDays).toBe(60)

    // Sonner toast renders inside the [data-sonner-toaster] region.
    await expect(page.getByText(/settings saved/i).first()).toBeVisible({
      timeout: 10_000,
    })
    // After a successful save, dirty resets => button goes disabled again.
    await expect(saveBtn).toBeDisabled({ timeout: 10_000 })
  })

  test("S3 toggle sends cleanupS3Artifacts: 'false' (string) on PUT", async ({ page }) => {
    let putBody: any = null
    await page.route("**/api/settings", async (route) => {
      const method = route.request().method()
      if (method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(DEFAULT_SETTINGS),
        })
        return
      }
      if (method === "PUT") {
        putBody = route.request().postDataJSON()
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ...DEFAULT_SETTINGS,
            cleanupS3Artifacts: "false",
          }),
        })
        return
      }
      await route.continue()
    })

    await gotoAndWait(page, "/settings")
    await waitForSettingsForm(page)

    // Toggle the switch off
    const switchEl = page.locator("#cleanupS3Artifacts")
    await expect(switchEl).toHaveAttribute("aria-checked", "true")
    await switchEl.click({ force: true })
    await expect(switchEl).toHaveAttribute("aria-checked", "false")

    const putRequest = page.waitForRequest(
      (req) => req.url().includes("/api/settings") && req.method() === "PUT",
    )
    await page.getByRole("button", { name: /save changes/i }).click({ force: true })
    await putRequest

    expect(putBody?.cleanupS3Artifacts).toBe("false")
  })

  test("Error path: GET /api/settings 500 shows error toast", async ({ page }) => {
    await page.route("**/api/settings", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "boom" }),
        })
        return
      }
      await route.continue()
    })

    await gotoAndWait(page, "/settings")

    await expect(page.getByText(/failed to load settings/i).first()).toBeVisible({
      timeout: 10_000,
    })
  })
})
