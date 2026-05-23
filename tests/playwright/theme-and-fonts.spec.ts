import { test, expect } from "@playwright/test"
import { gotoAndWait } from "./helpers"

const ROUTES = ["/", "/repositories", "/images", "/library", "/settings"]

test.describe("Theme and fonts", () => {
  for (const route of ROUTES) {
    test(`${route}: html.dark + dark background + visible text`, async ({ page }) => {
      await gotoAndWait(page, route)

      // RootLayout hardcodes className="dark" on <html>.
      await expect(page.locator("html")).toHaveClass(/dark/)

      // Background color resolves to a dark RGB — the body uses
      // bg-background which maps to a near-black hsl in dark mode.
      const bg = await page.evaluate(() =>
        getComputedStyle(document.body).backgroundColor
      )
      // bg is in form "rgb(R, G, B)" or "rgba(R, G, B, A)"
      const m = bg.match(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/)
      expect(m, `body bg should be rgb-ish on ${route}, was ${bg}`).not.toBeNull()
      if (m) {
        const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])]
        // Sum < 384 (each channel < 128 on average) ⇒ dark color.
        expect(r + g + b).toBeLessThan(384)
      }

      // Google Fonts are blocked in helpers.ts — verify fallback fonts
      // render visible text. Pick a stable text node (the sidebar's
      // "harborguard" wordmark) and assert it has non-zero width.
      const wordmark = page.getByRole("link", { name: /harborguard/i }).first()
      await expect(wordmark).toBeVisible()
      const width = await wordmark.evaluate((el) => (el as HTMLElement).offsetWidth)
      expect(width).toBeGreaterThan(0)
    })
  }
})
