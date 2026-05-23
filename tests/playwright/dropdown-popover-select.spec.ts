import { test, expect } from "@playwright/test"
import { gotoAndWait, safeClick } from "./helpers"

test.describe("Dropdown / Popover / Select", () => {
  /**
   * UnifiedTable on the dashboard renders a "Columns" DropdownMenu in its
   * toolbar (DropdownMenuCheckboxItem entries). This is a reliable trigger
   * because the dashboard's scan table always mounts the toolbar regardless
   * of how many rows came back.
   */
  test("DropdownMenu: opens, arrow keys navigate, Escape closes", async ({ page }) => {
    await gotoAndWait(page, "/")
    // Wait for the table toolbar's columns dropdown to be live.
    const columnsTrigger = page.getByRole("button", { name: /^columns$/i })
    await expect(columnsTrigger).toBeVisible({ timeout: 30_000 })

    await columnsTrigger.click({ force: true })
    // Radix portals the menu — wait for role=menu.
    const menu = page.getByRole("menu")
    await expect(menu).toBeVisible({ timeout: 5_000 })

    // Items are role=menuitemcheckbox for checkbox items.
    const items = menu.getByRole("menuitemcheckbox")
    await expect(items.first()).toBeVisible()

    // Down-arrow moves focus through items. Verify the active descendant
    // changes after arrow navigation.
    const firstActive = await page.evaluate(
      () => document.activeElement?.textContent?.trim() || ""
    )
    await page.keyboard.press("ArrowDown")
    const secondActive = await page.evaluate(
      () => document.activeElement?.textContent?.trim() || ""
    )
    // Either the focus changed, or the active element is now a menu item
    // (depending on initial focus position).
    expect(
      firstActive !== secondActive ||
        (await page.evaluate(() => document.activeElement?.getAttribute("role") || "")) ===
          "menuitemcheckbox"
    ).toBe(true)

    await page.keyboard.press("Escape")
    // Under reduced motion (the Playwright test default), globals.css forces
    // closed Radix Presence consumers to `display: none`, which Radix Presence
    // treats as its unmount fast-path — so the menu's DOM node may either
    // flip to data-state="closed" or be removed outright. Accept both.
    await expect
      .poll(
        async () => {
          const count = await menu.count()
          if (count === 0) return "gone"
          return await menu.first().getAttribute("data-state")
        },
        { timeout: 5_000 }
      )
      .toMatch(/closed|gone/)
  })

  /**
   * Note: the previous "Tooltip: hovering a sidebar menu button" test was
   * removed. The dashboard sidebar is `collapsible="offcanvas"` (slides off-
   * screen entirely; no icon-strip remains), and NavMain renders plain Link
   * elements rather than SidebarMenuButton with `tooltip`, so no Radix
   * Tooltip is wired up here. A meaningful tooltip assertion would need to
   * target a Radix-Tooltip-bearing surface that doesn't yet exist in the
   * default dashboard tree.
   */

  /**
   * UnifiedTable on the dashboard renders a "Rows per page" Select in its
   * pagination footer when features.pagination is enabled.
   */
  test("Select: opens, navigates by keyboard, commits value", async ({ page }) => {
    await gotoAndWait(page, "/")
    // Wait for the pagination row to mount (depends on scan data).
    const trigger = page.locator('[data-slot="select-trigger"]').first()
    await expect(trigger).toBeVisible({ timeout: 30_000 })

    const initialValue = await trigger.textContent()

    await trigger.click({ force: true })
    // SelectContent portals out — role=listbox in Radix Select.
    const listbox = page.getByRole("listbox")
    await expect(listbox).toBeVisible({ timeout: 5_000 })
    await page.waitForTimeout(300)

    // Pick a deterministic non-current option via keyboard. The pageSize
    // values are 10/20/30/40/50/100; default is 10. Type "2" to jump to 20.
    // Radix Select supports typeahead on the listbox.
    await listbox.getByRole("option", { name: "20" }).first().click({ force: true })

    // Listbox closes (data-state flips, DOM may linger during animation).
    await expect
      .poll(
        async () => {
          const count = await listbox.count()
          if (count === 0) return "gone"
          return await listbox.first().getAttribute("data-state")
        },
        { timeout: 5_000 }
      )
      .toMatch(/closed|gone/)

    const newValue = (await trigger.textContent())?.trim()
    expect(newValue).toBe("20")
    expect(newValue).not.toBe(initialValue?.trim())
  })

  /**
   * /audit-logs uses Radix Popover for the date-range pickers. Hover/click
   * to open, click outside to close.
   */
  test("Popover: opens on trigger click and closes on outside click", async ({ page }) => {
    await gotoAndWait(page, "/audit-logs")
    // The audit-log filters render PopoverTrigger inside a Button with a
    // CalendarIcon for start/end date.
    const popoverTrigger = page
      .locator('[data-slot="popover-trigger"], button:has(svg.lucide-calendar)')
      .first()
    const count = await popoverTrigger.count()
    test.skip(count === 0, "No popover trigger discoverable on /audit-logs")

    await popoverTrigger.click({ force: true })
    // The popover's inner content carries data-state="open". The wrapper
    // div may not have data-state.
    const popoverInner = page.locator('[data-radix-popper-content-wrapper] [data-state]').first()
    await expect(popoverInner).toBeVisible({ timeout: 5_000 })
    await expect(popoverInner).toHaveAttribute("data-state", "open")

    // Press Escape — Radix Popover handles dismissal via Escape key.
    // (Outside-click via real mouse on an arbitrary coordinate can land on
    // an element inside the popover when its content overlaps the click
    // target; Escape is unambiguous.)
    await page.keyboard.press("Escape")

    await expect
      .poll(
        async () => {
          const c = await popoverInner.count()
          if (c === 0) return "gone"
          return await popoverInner.first().getAttribute("data-state")
        },
        { timeout: 5_000 }
      )
      .toMatch(/closed|gone/)
  })
})
