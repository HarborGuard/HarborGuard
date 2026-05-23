import { test, expect } from "@playwright/test"
import { gotoAndWait } from "./helpers"

const routes = [
  { path: "/", label: "Dashboard" },
  { path: "/images", label: "Images" },
  { path: "/library", label: "Vulnerabilities" },
  { path: "/repositories", label: "Repositories" },
  { path: "/scheduled-scans", label: "Scheduled Scans" },
  { path: "/audit-logs", label: "Audit Logs" },
  { path: "/settings", label: "Settings" },
]

test.describe("Smoke", () => {
  test.describe.configure({ mode: "parallel" })

  test("document title is set", async ({ page }) => {
    await page.goto("/")
    await expect(page).toHaveTitle(/harbor\s*guard/i)
  })

  for (const { path, label } of routes) {
    test(`route ${path} renders without crashing`, async ({ page }) => {
      await gotoAndWait(page, path)
      // Sidebar nav link for this destination must be present on every page.
      await expect(page.getByRole("link", { name: label }).first()).toBeVisible()
    })
  }
})
