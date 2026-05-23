import { test, expect } from "@playwright/test"
import { gotoAndWait, safeClick } from "./helpers"

/**
 * The Playwright context already opts into reducedMotion: "reduce" (set
 * in playwright.config.ts). Assert that the test browser honors it and
 * that components honor `prefers-reduced-motion`.
 */
test.describe("Reduced motion", () => {
  test("test browser reports prefers-reduced-motion=reduce", async ({
    page,
  }) => {
    await gotoAndWait(page, "/")
    const matches = await page.evaluate(
      () => window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
    expect(matches).toBe(true)
  })

  test("opening a Radix dialog completes near-instantly under reduced motion", async ({
    page,
  }) => {
    await gotoAndWait(page, "/repositories")
    const trigger = page.getByRole("button", { name: /add repository/i }).first()
    const dialog = page.getByRole("dialog")

    const t0 = Date.now()
    await safeClick(page, trigger)
    await expect(dialog).toHaveAttribute("data-state", "open", { timeout: 5_000 })
    const elapsed = Date.now() - t0

    // Under reduced motion, Radix should snap to open within ~200ms. We
    // allow a generous 2000ms for CI overhead but anything well above that
    // points to an animation still playing or an actionability hang.
    expect(elapsed).toBeLessThan(2_000)
  })

  test("sidebar toggle flips data-state quickly", async ({ page }) => {
    await gotoAndWait(page, "/")
    const sidebar = page.locator('[data-slot="sidebar"]').first()
    await expect(sidebar).toHaveAttribute("data-state", "expanded")

    const triggerBtn = page.locator('[data-sidebar="trigger"]').first()
    const t0 = Date.now()
    await safeClick(page, triggerBtn)
    await expect(sidebar).toHaveAttribute("data-state", "collapsed", {
      timeout: 2_000,
    })
    const elapsed = Date.now() - t0
    // The flip itself is React-state driven, not CSS animation, so this
    // should be near-instant even without reduced motion. But the test
    // codifies the contract that toggling does not stall on animation.
    expect(elapsed).toBeLessThan(1_500)
  })
})
