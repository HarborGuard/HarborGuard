import { test, expect } from "@playwright/test"
import { gotoAndWait } from "./helpers"

test.describe("Not found", () => {
  test("unknown route returns the app's 404 view", async ({ page }) => {
    const res = await page.goto("/this-route-does-not-exist")
    expect(res?.status()).toBe(404)
    // The app sets a custom not-found.tsx — at minimum the page should still
    // render shell chrome (sidebar wordmark) since the not-found is inside
    // the same RootLayout.
    await expect(page.getByRole("link", { name: /harborguard/i }).first()).toBeVisible()
  })

  test("/404 renders the custom NotFound page copy", async ({ page }) => {
    // src/app/not-found.tsx redirects to /404, which renders the actual
    // NotFoundPage card. Hit /404 directly so the assertions don't depend
    // on the redirect path.
    await gotoAndWait(page, "/404")

    // Card title from src/app/404/page.tsx.
    await expect(page.getByText(/404 - page not found/i)).toBeVisible()
    // Card description.
    await expect(
      page.getByText(/the page you're looking for doesn't exist/i)
    ).toBeVisible()
    // Body copy paragraph.
    await expect(
      page.getByText(/sailed into uncharted waters/i)
    ).toBeVisible()
  })

  test("Go Home action navigates back to the dashboard", async ({ page }) => {
    await gotoAndWait(page, "/404")

    // The "Go Home" button uses router.push("/").
    const goHome = page.getByRole("button", { name: /go home/i })
    await expect(goHome).toBeVisible()
    await goHome.click({ force: true })

    await expect(page).toHaveURL(/\/$/, { timeout: 10_000 })
  })

  test("the not-found page links/buttons trace back to '/' somewhere", async ({
    page,
  }) => {
    await gotoAndWait(page, "/404")

    // The page should have at least one path back to "/" — either via an
    // anchor or a router.push("/")-bound button. Check both.
    const hasHomeAnchor = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a[href="/"]')).length > 0
    )
    const hasHomeButton = await page.evaluate(() =>
      Array.from(document.querySelectorAll("button")).some((b) =>
        /go home/i.test(b.textContent || "")
      )
    )
    expect(hasHomeAnchor || hasHomeButton).toBe(true)
  })
})
