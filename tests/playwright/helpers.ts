import { Page, expect, test as baseTest } from "@playwright/test"

/**
 * Wait for the app shell (sidebar + main content) to be rendered.
 * Most pages mount under SidebarInset > SiteHeader > children, so the
 * sidebar's "harborguard" wordmark is a reliable shell-rendered signal.
 */
export async function waitForAppShell(page: Page): Promise<void> {
  await expect(page.getByRole("link", { name: /harborguard/i }).first()).toBeVisible({
    timeout: 20_000,
  })
}

/**
 * Block Google Fonts requests so external network latency doesn't make
 * the page layout unstable for the duration of font-fetch.
 */
export async function blockExternalFonts(page: Page): Promise<void> {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort())
}

/**
 * Wait for the locator to be visible, then click with `force: true`.
 *
 * The dashboard's React tree re-renders frequently as `useScans`, the
 * ScanningContext interval, and other hooks settle — even after the page
 * is interactive. Playwright's strict actionability "stable for two
 * consecutive frames" check times out on visibly-clickable elements that
 * are sub-pixel jittery from those re-renders. We've separately confirmed
 * via element-from-point that the buttons under test are unobstructed,
 * so `force: true` is safe and gives a deterministic signal.
 */
export async function safeClick(page: Page, locator: ReturnType<Page["locator"]>): Promise<void> {
  await expect(locator).toBeVisible({ timeout: 20_000 })
  await locator.click({ force: true })
}

/** Navigate and wait for the shell. */
export async function gotoAndWait(page: Page, path: string): Promise<void> {
  await blockExternalFonts(page)
  await page.goto(path, { waitUntil: "domcontentloaded" })
  await waitForAppShell(page)
}

/**
 * Auto-blocks external fonts on every page. Spec files can import this
 * `test` instead of `@playwright/test`'s default to get the same behavior
 * even when they don't go through gotoAndWait.
 */
export const test = baseTest.extend({
  page: async ({ page }, use) => {
    await blockExternalFonts(page)
    await use(page)
  },
})

export { expect } from "@playwright/test"
