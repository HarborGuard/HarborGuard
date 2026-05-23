import { test, expect } from "@playwright/test"
import { gotoAndWait } from "./helpers"

/**
 * Tests for GlobalScanMonitor (mounted globally via app/layout.tsx).
 *
 * The component renders a custom floating toast (ScanToast) in the bottom-right
 * when there are running OR queued jobs. Clicking the toast opens a Radix
 * dialog ("Scan Activity") that contains the detailed ScanProgressBarDetailed
 * view per running job plus a Cancel (X icon) button that POSTs to
 * /api/scans/cancel/<requestId>.
 *
 * Data source: ScanningContext.refreshJobs() calls GET /api/scans/jobs and
 * expects `{ jobs: [...], queuedScans: [...] }`. The context derives
 * runningJobs (status === "RUNNING") from `jobs`.
 *
 * The polling interval is 30s, so a per-test page.route() install before
 * navigation is enough to intercept all fetches.
 */

test.describe("Scan monitor", () => {
  test.describe.configure({ mode: "parallel" })

  test("with no running jobs, no scan-monitor toast appears", async ({ page }) => {
    await page.route("**/api/scans/jobs", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ jobs: [], queuedScans: [] }),
      })
    })
    await gotoAndWait(page, "/")
    // Give the polling interval and SSE setup a moment to settle.
    await page.waitForTimeout(500)
    // ScanToast renders inside `.fixed.bottom-4.right-4` and its accessible
    // name is "<N> Scan(s) Running - Click to view details". When there are
    // zero jobs, the toast container is not rendered at all.
    await expect(
      page.getByRole("button", { name: /click to view details/i })
    ).toHaveCount(0)
    // Also: no copy like "Running" or "Queued" from the toast.
    await expect(page.getByText(/click to view$/i)).toHaveCount(0)
  })

  test("with a running job, the monitor toast appears", async ({ page }) => {
    await page.route("**/api/scans/jobs", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          jobs: [
            {
              requestId: "req-running-1",
              scanId: "scan-1",
              imageId: "img-1",
              imageName: "nginx:latest",
              status: "RUNNING",
              progress: 42,
              step: "Scanning packages",
              startTime: new Date().toISOString(),
              lastUpdate: new Date().toISOString(),
            },
          ],
          queuedScans: [],
        }),
      })
    })
    // Block the SSE connection that ScanningContext opens for each running
    // job (it would otherwise hang the page on the dev server). The SSEClient
    // hits /api/scans/events/<requestId>.
    await page.route("**/api/scans/events/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: "",
      })
    })
    await gotoAndWait(page, "/")
    // Toast should appear with the running-scan accessible name (e.g.,
    // "1 Scan Running - Click to view details").
    const toast = page.getByRole("button", { name: /scan.*running.*click to view/i })
    await expect(toast.first()).toBeVisible({ timeout: 10_000 })
  })

  test("clicking the toast opens the detailed scan activity dialog", async ({ page }) => {
    await page.route("**/api/scans/jobs", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          jobs: [
            {
              requestId: "req-running-2",
              scanId: "scan-2",
              imageId: "img-2",
              imageName: "redis:7",
              status: "RUNNING",
              progress: 50,
              step: "Analyzing",
              startTime: new Date().toISOString(),
              lastUpdate: new Date().toISOString(),
            },
          ],
          queuedScans: [],
        }),
      })
    })
    await page.route("**/api/scans/events/**", async (route) => {
      await route.fulfill({ status: 200, contentType: "text/event-stream", body: "" })
    })

    await gotoAndWait(page, "/")
    const toast = page.getByRole("button", { name: /scan.*running.*click to view/i }).first()
    await expect(toast).toBeVisible({ timeout: 10_000 })
    await toast.click({ force: true })

    // The "Scan Activity" dialog (DialogTitle) opens.
    const dialog = page.locator(
      '[data-slot="dialog-content"]:has(h2:text("Scan Activity"))'
    )
    await expect(dialog).toBeVisible()
    // The running job card shows the image name + Running summary chip.
    await expect(dialog.getByText(/redis:7/i)).toBeVisible()
    // ScanProgressBarDetailed (Progress component) is rendered inside the
    // running-job card. We can't easily assert on the progress value, but
    // the "Running" status chip from the running-jobs section header is
    // visible.
    await expect(dialog.getByText(/running scans/i)).toBeVisible()
  })

  test("cancel button POSTs to /api/scans/cancel/<requestId>", async ({ page }) => {
    const REQ_ID = "req-running-3"

    await page.route("**/api/scans/jobs", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          jobs: [
            {
              requestId: REQ_ID,
              scanId: "scan-3",
              imageId: "img-3",
              imageName: "alpine:latest",
              status: "RUNNING",
              progress: 25,
              step: "Pulling image",
              startTime: new Date().toISOString(),
              lastUpdate: new Date().toISOString(),
            },
          ],
          queuedScans: [],
        }),
      })
    })
    await page.route("**/api/scans/events/**", async (route) => {
      await route.fulfill({ status: 200, contentType: "text/event-stream", body: "" })
    })

    // Capture the cancel request — what we're actually verifying.
    let cancelHit = false
    await page.route(`**/api/scans/cancel/${REQ_ID}`, async (route) => {
      if (route.request().method() === "POST") {
        cancelHit = true
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: '{"success":true}',
      })
    })

    await gotoAndWait(page, "/")
    const toast = page.getByRole("button", { name: /scan.*running.*click to view/i }).first()
    await expect(toast).toBeVisible({ timeout: 10_000 })
    await toast.click({ force: true })

    const dialog = page.locator(
      '[data-slot="dialog-content"]:has(h2:text("Scan Activity"))'
    )
    await expect(dialog).toBeVisible()

    // The cancel button is an icon-only button (X icon) with title="Cancel scan".
    // Match it inside the dialog and click.
    const cancelBtn = dialog.getByRole("button", { name: /cancel scan/i }).first()
    await expect(cancelBtn).toBeVisible()
    await cancelBtn.click({ force: true })

    // Allow the fetch to issue and our intercept to flip the flag.
    await expect.poll(() => cancelHit, { timeout: 10_000 }).toBe(true)
  })
})
