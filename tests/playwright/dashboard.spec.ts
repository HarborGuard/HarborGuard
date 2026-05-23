import { test, expect } from "@playwright/test"
import { gotoAndWait } from "./helpers"

test.describe("Dashboard", () => {
  test.describe.configure({ mode: "parallel" })

  test.beforeEach(async ({ page }) => {
    await gotoAndWait(page, "/")
  })

  test("section cards render", async ({ page }) => {
    // Card descriptions are emitted as plain text inside CardHeader.
    // Match the four headline metrics that section-cards.tsx renders.
    await expect(page.getByText(/total images scanned/i).first()).toBeVisible()
    await expect(page.getByText(/average risk score/i).first()).toBeVisible()
  })

  test("vulnerability analysis chart card renders", async ({ page }) => {
    // The scatterplot card title is "Image Vulnerability Analysis" (post-load)
    // or "Vulnerability Analysis" (loading state). Match either.
    await expect(
      page.getByText(/(image )?vulnerability analysis/i).first()
    ).toBeVisible({ timeout: 30_000 })
  })

  test("sidebar shows all primary nav items", async ({ page }) => {
    for (const item of [
      "Dashboard",
      "Images",
      "Vulnerabilities",
      "Repositories",
      "Scheduled Scans",
      "Settings",
    ]) {
      await expect(page.getByRole("link", { name: item }).first()).toBeVisible()
    }
  })
})
