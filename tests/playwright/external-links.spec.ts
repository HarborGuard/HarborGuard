import { test, expect } from "@playwright/test"
import { gotoAndWait } from "./helpers"

const ROUTES = ["/", "/repositories", "/images", "/library", "/settings"]

test.describe("External link safety", () => {
  test("sidebar harborguard.co link has safe target+rel", async ({ page }) => {
    await gotoAndWait(page, "/")
    const link = page.locator('a[href="https://harborguard.co"]').first()
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute("target", "_blank")
    const rel = (await link.getAttribute("rel")) || ""
    expect(rel).toContain("noopener")
    expect(rel).toContain("noreferrer")
  })

  test("site-header GitHub link has safe target+rel", async ({ page }) => {
    await gotoAndWait(page, "/")
    const link = page.locator('a[href*="github.com/HarborGuard"]').first()
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute("target", "_blank")
    const rel = (await link.getAttribute("rel")) || ""
    expect(rel).toContain("noopener")
    expect(rel).toContain("noreferrer")
  })

  for (const route of ROUTES) {
    test(`${route}: every external link has noopener+noreferrer`, async ({
      page,
    }) => {
      await gotoAndWait(page, route)
      const offenders = await page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll("a[href]"))
        const bad: { href: string; rel: string; target: string }[] = []
        for (const a of anchors as HTMLAnchorElement[]) {
          const href = a.getAttribute("href") || ""
          if (!/^https?:\/\//i.test(href)) continue
          // Same-origin links don't need noopener/noreferrer.
          try {
            const url = new URL(href)
            if (url.origin === window.location.origin) continue
          } catch {
            continue
          }
          const target = a.getAttribute("target") || ""
          const rel = a.getAttribute("rel") || ""
          // Only links opening in a new tab need the rel safety net.
          if (target !== "_blank") continue
          if (!/noopener/.test(rel) || !/noreferrer/.test(rel)) {
            bad.push({ href, rel, target })
          }
        }
        return bad
      })

      expect(
        offenders,
        `${route} has external _blank links missing noopener/noreferrer: ${JSON.stringify(offenders)}`
      ).toEqual([])
    })
  }
})
