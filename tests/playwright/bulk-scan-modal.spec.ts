import { test, expect } from "@playwright/test"
import { gotoAndWait, safeClick } from "./helpers"

/**
 * The Bulk Scan modal is opened from the small Layers icon button next to
 * the New Scan CTA in the sidebar (NavMain). The trigger has title="Bulk Scan"
 * (no visible text — it's an icon-only button), so we target it by accessible
 * name. The modal has its own DialogTitle "Bulk Image Scanning" which is the
 * stable identifier for the dialog content.
 *
 * On open, the dialog calls useBulkScan which fetches /api/scans/bulk (jobs
 * list) and a scanner-availability endpoint. We mock the jobs endpoint to
 * return an empty list so the Active Jobs tab shows an empty state, then
 * verify the "New Bulk Scan" / "Active Jobs" tab structure renders.
 */

const MODAL = '[data-slot="dialog-content"]:has(h2:text("Bulk Image Scanning"))'

test.describe("Bulk Scan modal", () => {
  test.describe.configure({ mode: "parallel" })

  test.beforeEach(async ({ page }) => {
    // useBulkScan calls /api/scans/bulk on open. Mock to an empty list so
    // the dialog's Active Jobs tab reliably shows the empty state.
    await page.route("**/api/scans/bulk", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true, data: [] }),
        })
      } else {
        await route.continue()
      }
    })
    await gotoAndWait(page, "/")
  })

  test("trigger is reachable from the sidebar", async ({ page }) => {
    // The icon-only trigger has title="Bulk Scan"; Playwright treats the
    // title attribute as the accessible name for buttons without text.
    await expect(
      page.getByRole("button", { name: /bulk scan/i }).first()
    ).toBeVisible()
  })

  test("opens a dialog", async ({ page }) => {
    await safeClick(page, page.getByRole("button", { name: /bulk scan/i }).first())
    const modal = page.locator(MODAL)
    await expect(modal).toBeVisible()
    // DialogTitle "Bulk Image Scanning" pinpoints the bulk modal vs.
    // any other Radix dialog that may also be mounted (e.g. NewScanModal).
    await expect(modal.getByText(/bulk image scanning/i)).toBeVisible()
    await expect(modal).toHaveAttribute("role", "dialog")
  })

  test("New Bulk Scan / Active Jobs tabs render", async ({ page }) => {
    await safeClick(page, page.getByRole("button", { name: /bulk scan/i }).first())
    const modal = page.locator(MODAL)
    await expect(modal).toBeVisible()
    // Both tab triggers are unconditionally present in the TabsList. Use
    // .first() to short-circuit the strict locator check if a stray dialog
    // from a different test fixture leaked into the DOM (Radix retains
    // closed modals during animation).
    await expect(
      modal.getByRole("tab", { name: /new bulk scan/i }).first()
    ).toBeVisible()
    await expect(
      modal.getByRole("tab", { name: /active jobs/i }).first()
    ).toBeVisible()
  })

  test("empty Active Jobs tab renders empty-state when /api/scans/bulk returns []", async ({
    page,
  }) => {
    await safeClick(page, page.getByRole("button", { name: /bulk scan/i }).first())
    const modal = page.locator(MODAL)
    await expect(modal).toBeVisible()
    // The Bulk Scan dialog renders its tabs inside a max-height scrollable
    // container; on a 900px viewport the Active Jobs trigger is hit-testable
    // but Playwright's actionability check may still fail mid-animation.
    // Focus the trigger and press Enter — Radix Tabs respond to keyboard
    // activation and we avoid pointer hit-testing entirely.
    const tab = modal.getByRole("tab", { name: /active jobs/i })
    await tab.focus()
    await page.keyboard.press("Enter")
    // BulkScanJobsList empty-state copy: "No Active Jobs" heading.
    await expect(modal.getByText(/no active jobs/i)).toBeVisible()
  })
})
