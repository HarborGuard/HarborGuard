import { test, expect } from "@playwright/test"
import { gotoAndWait, safeClick } from "./helpers"

const navTargets: Array<{ name: string; urlPattern: RegExp }> = [
  { name: "Images", urlPattern: /\/images$/ },
  { name: "Vulnerabilities", urlPattern: /\/library$/ },
  { name: "Repositories", urlPattern: /\/repositories$/ },
  { name: "Scheduled Scans", urlPattern: /\/scheduled-scans$/ },
  { name: "Settings", urlPattern: /\/settings$/ },
]

test.describe("Navigation", () => {
  for (const { name, urlPattern } of navTargets) {
    test(`sidebar link "${name}" navigates correctly`, async ({ page }) => {
      await gotoAndWait(page, "/")
      await safeClick(page, page.getByRole("link", { name }).first())
      await expect(page).toHaveURL(urlPattern)
    })
  }

  test("logo link returns to dashboard", async ({ page }) => {
    await gotoAndWait(page, "/settings")
    await safeClick(page, page.getByRole("link", { name: /harborguard/i }).first())
    await expect(page).toHaveURL(/\/$/)
  })
})
