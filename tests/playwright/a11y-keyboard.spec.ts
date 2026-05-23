import { test, expect } from "@playwright/test"
import { gotoAndWait } from "./helpers"

/**
 * Accessibility / keyboard navigation. The sidebar's NavMain renders 6
 * primary links in DOM order: Dashboard, Images, Vulnerabilities,
 * Repositories, Scheduled Scans, Settings. Tab from the body should reach
 * each in order (interleaved with header/sidebar buttons that come first).
 */
const PRIMARY_NAV = [
  "Dashboard",
  "Images",
  "Vulnerabilities",
  "Repositories",
  "Scheduled Scans",
  "Settings",
]

test.describe("Keyboard accessibility", () => {
  test("Tab navigation reaches each primary sidebar link in DOM order", async ({
    page,
  }) => {
    await gotoAndWait(page, "/")

    // Start by focusing the document body. Then press Tab repeatedly; the
    // active element accumulates link names. We expect to see each sidebar
    // nav item, in order (possibly interleaved with other tabbables like
    // the SidebarTrigger, breadcrumb, header buttons, New Scan).
    await page.evaluate(() => {
      ;(document.body as HTMLElement).focus()
    })

    const seenLinks: string[] = []
    const seenAt: Record<string, number> = {}

    // Press Tab up to 50 times — generous bound to cover header/sidebar +
    // sidebar primary nav.
    for (let i = 0; i < 50; i++) {
      await page.keyboard.press("Tab")
      const focused = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null
        if (!el) return null
        const text = (el.textContent || el.getAttribute("aria-label") || "").trim()
        return { tag: el.tagName, text, role: el.getAttribute("role") || "" }
      })
      if (!focused) continue
      // We only care about anchor-like elements with sidebar link text.
      const match = PRIMARY_NAV.find((name) =>
        new RegExp(`^${name}$`, "i").test(focused.text)
      )
      if (match && seenAt[match] === undefined) {
        seenAt[match] = seenLinks.length
        seenLinks.push(match)
      }
      if (seenLinks.length === PRIMARY_NAV.length) break
    }

    // All six primary nav items should be reachable via Tab.
    for (const name of PRIMARY_NAV) {
      expect(seenAt[name], `Tab did not reach "${name}"`).toBeDefined()
    }

    // Order: assert that the array of seen items matches the expected order.
    expect(seenLinks).toEqual(PRIMARY_NAV)
  })

  test("focused link has a visible focus ring", async ({ page }) => {
    await gotoAndWait(page, "/")
    // Focus the Dashboard link directly to assert a focus ring is rendered.
    const dashboardLink = page.getByRole("link", { name: "Dashboard" }).first()
    await dashboardLink.focus()

    const ring = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null
      if (!el) return null
      const cs = getComputedStyle(el)
      return {
        outline: cs.outline,
        outlineWidth: cs.outlineWidth,
        boxShadow: cs.boxShadow,
        outlineStyle: cs.outlineStyle,
      }
    })

    expect(ring).not.toBeNull()
    if (ring) {
      // Some visible focus indicator (outline or box-shadow) must be set.
      const hasOutline =
        ring.outlineStyle !== "none" && parseFloat(ring.outlineWidth || "0") > 0
      const hasBoxShadow = ring.boxShadow !== "none" && ring.boxShadow !== ""
      expect(
        hasOutline || hasBoxShadow,
        `focused link should have an outline or box-shadow ring; got ${JSON.stringify(ring)}`
      ).toBe(true)
    }
  })
})
