import { test, expect } from "@playwright/test"
import { gotoAndWait, safeClick } from "./helpers"

/**
 * The New Scan modal is triggered from the sidebar's "New Scan" button
 * (NavMain renders <NewScanModal><button>New Scan</button></NewScanModal>).
 *
 * The modal is a 3-step wizard:
 *   1. Source — grid of source cards (Docker Hub, GitHub, Custom Registry, …)
 *   2. Image — the selected source's tab (DockerHubTab, GitHubTab, …)
 *   3. Scan — review and Start Scan
 *
 * Local Docker / Docker Swarm sources only render when dockerInfo.hasAccess
 * is true, so they're conditional and we only assert on the unconditional ones.
 *
 * Selector note: the dev server sometimes shows the Next.js dev error overlay
 * which also matches role=dialog. We pin our queries to [data-slot="dialog-content"]
 * which is the data-attribute Radix's DialogContent emits.
 */

// Identify the modal via its aria-labelledby relationship to the
// "New Security Scan" title. There are several Radix dialogs mounted in
// the layout (CveClassificationDialog, VulnerabilityDetailsModal) which
// would also match a plain [data-slot="dialog-content"] selector, so we
// scope to the one whose heading we're testing.
const MODAL = '[data-slot="dialog-content"]:has(h2:text("New Security Scan"))'

test.describe("New Scan modal", () => {
  test.describe.configure({ mode: "parallel" })

  test.beforeEach(async ({ page }) => {
    await gotoAndWait(page, "/")
  })

  test("opens from the sidebar New Scan button", async ({ page }) => {
    await safeClick(page, page.getByRole("button", { name: /new scan/i }).first())
    const modal = page.locator(MODAL)
    await expect(modal).toBeVisible()
    // DialogTitle "New Security Scan" is the unique identifier.
    await expect(modal.getByText(/new security scan/i)).toBeVisible()
    // role=dialog is set by Radix on DialogContent
    await expect(modal).toHaveAttribute("role", "dialog")
  })

  test("step indicator starts on step 1 (Source)", async ({ page }) => {
    await safeClick(page, page.getByRole("button", { name: /new scan/i }).first())
    const modal = page.locator(MODAL)
    await expect(modal).toBeVisible()
    // Step labels are rendered as plain text in the StepIndicator. All three
    // are always in the DOM; the active one is styled differently. We assert
    // the wizard header is structurally present.
    await expect(modal.getByText(/^source$/i).first()).toBeVisible()
    await expect(modal.getByText(/^image$/i).first()).toBeVisible()
    await expect(modal.getByText(/^scan$/i).first()).toBeVisible()
    // Subtitle for step 1
    await expect(modal.getByText(/choose where to scan from/i)).toBeVisible()
  })

  test("advances to step 2 (Image) on source selection", async ({ page }) => {
    await safeClick(page, page.getByRole("button", { name: /new scan/i }).first())
    const modal = page.locator(MODAL)
    await expect(modal).toBeVisible()
    // Pick Docker Hub — always present regardless of docker daemon state.
    await safeClick(page, modal.getByRole("button", { name: /docker hub/i }).first())
    // Step 2 subtitle: "Select an image from Docker Hub"
    await expect(modal.getByText(/select an image from/i)).toBeVisible()
    // Back button only appears past step 1
    await expect(modal.getByRole("button", { name: /^back$/i })).toBeVisible()
  })

  test("registry source cards are all present", async ({ page }) => {
    await safeClick(page, page.getByRole("button", { name: /new scan/i }).first())
    const modal = page.locator(MODAL)
    await expect(modal).toBeVisible()
    // These four registry sources are unconditional in the source grid.
    await expect(modal.getByRole("button", { name: /docker hub/i })).toBeVisible()
    await expect(modal.getByRole("button", { name: /github/i })).toBeVisible()
    await expect(modal.getByRole("button", { name: /custom registry/i })).toBeVisible()
    await expect(modal.getByRole("button", { name: /kubernetes/i })).toBeVisible()
    // "Private Registry" is rendered but `available: false` when no repos are
    // configured — its <button> is disabled, so use getByText (role/name
    // selectors filter out disabled by default).
    await expect(modal.getByText(/private registry/i)).toBeVisible()
    // Local Docker / Docker Swarm only render when dockerInfo.hasAccess is
    // true. The container these specs run against may or may not have docker
    // socket access, so we don't assert on them.
  })

  test("Back button returns to step 1", async ({ page }) => {
    await safeClick(page, page.getByRole("button", { name: /new scan/i }).first())
    const modal = page.locator(MODAL)
    await safeClick(page, modal.getByRole("button", { name: /docker hub/i }).first())
    await expect(modal.getByText(/select an image from/i)).toBeVisible()
    await safeClick(page, modal.getByRole("button", { name: /^back$/i }))
    await expect(modal.getByText(/choose where to scan from/i)).toBeVisible()
  })

  test("Cancel button dismisses the dialog", async ({ page }) => {
    await safeClick(page, page.getByRole("button", { name: /new scan/i }).first())
    const modal = page.locator(MODAL)
    await expect(modal).toBeVisible()
    await safeClick(page, modal.getByRole("button", { name: /^cancel$/i }))
    // Radix keeps the content node in the DOM during close animation, so
    // toBeHidden() can race the data-state="closed" frame. Assert on the
    // Radix data-state attribute, which flips to "closed" synchronously.
    // After the reduced-motion globals.css fix, Radix Presence fully
    // unmounts the dialog (display:none triggers the fast-path). The
    // element may either still be in DOM with data-state="closed" or be
    // removed — accept either.
    await expect
      .poll(async () => {
        const count = await modal.count()
        if (count === 0) return "gone"
        return await modal.getAttribute("data-state")
      }, { timeout: 10_000 })
      .toMatch(/closed|gone/)
  })

  test("Escape dismisses the dialog", async ({ page }) => {
    await safeClick(page, page.getByRole("button", { name: /new scan/i }).first())
    const modal = page.locator(MODAL)
    await expect(modal).toBeVisible()
    await page.keyboard.press("Escape")
    // After the reduced-motion globals.css fix, Radix Presence fully
    // unmounts the dialog (display:none triggers the fast-path). The
    // element may either still be in DOM with data-state="closed" or be
    // removed — accept either.
    await expect
      .poll(async () => {
        const count = await modal.count()
        if (count === 0) return "gone"
        return await modal.getAttribute("data-state")
      }, { timeout: 10_000 })
      .toMatch(/closed|gone/)
  })

  test("outside click dismisses the dialog", async ({ page }) => {
    await safeClick(page, page.getByRole("button", { name: /new scan/i }).first())
    const modal = page.locator(MODAL)
    await expect(modal).toBeVisible()
    // Radix dismisses on pointerdown outside its content. The overlay
    // ([data-slot=dialog-overlay]) covers the viewport, but Playwright's
    // visibility heuristic treats aria-hidden=true as not visible, so we
    // bypass it by sending pointer events at a viewport coordinate that
    // is over the overlay but outside the centered modal box.
    await page.mouse.move(10, 10)
    await page.mouse.down()
    await page.mouse.up()
    // After the reduced-motion globals.css fix, Radix Presence fully
    // unmounts the dialog (display:none triggers the fast-path). The
    // element may either still be in DOM with data-state="closed" or be
    // removed — accept either.
    await expect
      .poll(async () => {
        const count = await modal.count()
        if (count === 0) return "gone"
        return await modal.getAttribute("data-state")
      }, { timeout: 10_000 })
      .toMatch(/closed|gone/)
  })
})
