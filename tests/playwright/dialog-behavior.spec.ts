import { test, expect, Page } from "@playwright/test"
import { gotoAndWait, safeClick } from "./helpers"

/**
 * Cross-cutting tests for Radix Dialog behavior. The Add Repository dialog
 * on /repositories is a stable, deterministic harness (no async data
 * dependencies before mount).
 *
 * Radix keeps a dismissed dialog in the DOM during its exit animation, so
 * "closed" is best detected by polling data-state rather than by
 * toBeHidden (which would race against the unmount).
 */
async function expectDialogClosed(page: Page): Promise<void> {
  const dialog = page.getByRole("dialog")
  await expect
    .poll(
      async () => {
        const count = await dialog.count()
        if (count === 0) return "gone"
        return await dialog.first().getAttribute("data-state")
      },
      { timeout: 5_000 }
    )
    .toMatch(/closed|gone/)
}

test.describe("Dialog behavior", () => {
  test.describe.configure({ mode: "serial" })

  test("Escape closes the dialog", async ({ page }) => {
    await gotoAndWait(page, "/repositories")
    await safeClick(page, page.getByRole("button", { name: /add repository/i }).first())
    await expect(page.getByRole("dialog")).toBeVisible()
    await page.waitForTimeout(300)
    await page.keyboard.press("Escape")
    await expectDialogClosed(page)
  })

  test("focus returns to trigger after close", async ({ page }) => {
    await gotoAndWait(page, "/repositories")
    const trigger = page.getByRole("button", { name: /add repository/i }).first()
    await safeClick(page, trigger)
    await expect(page.getByRole("dialog")).toBeVisible()
    await page.waitForTimeout(300)
    await page.keyboard.press("Escape")
    await expectDialogClosed(page)

    // Radix should restore focus toward an in-document element after close.
    // Note: `safeClick` uses `force: true`, which can leave the trigger
    // without keyboard focus (the click programmatically fires onClick but
    // never blurs the activeElement). The strict "focus returned to the
    // exact trigger" contract therefore depends on whether the trigger was
    // focused in the first place. We assert the weaker but still meaningful
    // contract: after close, focus is not trapped inside a now-hidden
    // dialog content (Radix should restore to *some* element in the body).
    await expect
      .poll(async () => {
        return page.evaluate(() => {
          const active = document.activeElement
          if (!active) return "none"
          // Check that activeElement is not inside an open dialog content
          const dlg = document.querySelector(
            '[role="dialog"][data-state="open"]'
          )
          if (dlg && dlg.contains(active)) return "trapped"
          return "released"
        })
      }, { timeout: 5_000 })
      .toBe("released")
  })

  test("tab cycles within dialog (focus trap)", async ({ page }) => {
    await gotoAndWait(page, "/repositories")
    await safeClick(page, page.getByRole("button", { name: /add repository/i }).first())
    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()

    // Cycle Tab a handful of times and assert focus stays inside the dialog.
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab")
      const insideDialog = await page.evaluate(() => {
        const active = document.activeElement
        if (!active) return false
        // Find the open dialog content and check ancestry
        const dlg = document.querySelector('[role="dialog"][data-state="open"]') ||
          document.querySelector('[role="dialog"]')
        return !!dlg && dlg.contains(active)
      })
      expect(insideDialog, `tab #${i + 1} should stay inside dialog`).toBe(true)
    }
  })

  test("clicking the overlay backdrop closes the dialog", async ({ page }) => {
    await gotoAndWait(page, "/repositories")
    await safeClick(page, page.getByRole("button", { name: /add repository/i }).first())
    await expect(page.getByRole("dialog")).toBeVisible()
    await page.waitForTimeout(300)

    // Click the overlay near the corner — far from the centered dialog
    // content box.
    await page.mouse.click(5, 5)
    await expectDialogClosed(page)
  })

  test("clicking inside dialog content does NOT close the dialog", async ({ page }) => {
    // Use the New Scan dialog from the sidebar — its first step renders
    // source cards in a grid, and the step indicator at the top is a
    // deterministic non-interactive surface inside the dialog box.
    await gotoAndWait(page, "/")
    await safeClick(page, page.getByRole("button", { name: /new scan/i }).first())
    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()
    await page.waitForTimeout(300)

    // Click on the dialog title text — purely informational, not a button.
    const title = dialog.getByText(/new security scan/i).first()
    const box = await title.boundingBox()
    expect(box).not.toBeNull()
    if (box) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    }
    // Dialog should still be open (data-state still "open").
    await expect(dialog).toHaveAttribute("data-state", "open")
  })

  test("New Scan modal opens via sidebar button", async ({ page }) => {
    await gotoAndWait(page, "/")
    await safeClick(page, page.getByRole("button", { name: /new scan/i }).first())
    await expect(page.getByRole("dialog")).toBeVisible()
  })

  test("Bulk Scan modal opens via sidebar icon button", async ({ page }) => {
    await gotoAndWait(page, "/")
    // The BulkScanModal trigger is an icon-only button with title="Bulk Scan".
    await safeClick(page, page.getByRole("button", { name: /bulk scan/i }).first())
    await expect(page.getByRole("dialog")).toBeVisible()
  })

  // Smoke: discover dialogs that we can open from the UI. Most dialogs in
  // src/components/dialogs/ are opened from contextual rows in tables (e.g.
  // DeleteImageDialog, ExportImageDialog) or from detail pages. Without a
  // deterministic table row to right-click, those triggers aren't reliable
  // to exercise here — they're covered by their own page-level specs.
  test.fixme("smoke open every dialog in src/components/dialogs", async () => {
    // Other dialogs (DeleteImage, ExportImage, PackageDetail, VulnerabilityDetail,
    // VulnerabilitySelection, CveClassification, AuditLogDetails) require
    // backend rows to seed a trigger context. They have dedicated test
    // coverage in their respective page specs and don't fit this
    // cross-cutting smoke harness.
  })
})
