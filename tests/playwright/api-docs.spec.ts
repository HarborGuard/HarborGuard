import { test, expect } from "./helpers"

/**
 * Swagger UI is mounted at /api-docs and fetches the spec from
 * /api/openapi.json. We verify the page renders, that the docs page
 * actually fires the openapi.json request, and that the Swagger UI
 * eventually paints its operation blocks.
 */
test.describe("API documentation page", () => {
  test("renders Swagger UI and fetches openapi.json", async ({ page }) => {
    // Watch for the openapi request — we want to confirm the docs page
    // actually drives the fetch (not just that someone could fetch it).
    const openApiRequest = page.waitForRequest((req) =>
      req.url().includes("/api/openapi.json"),
      { timeout: 20_000 }
    )

    await page.goto("/api-docs", { waitUntil: "domcontentloaded" })

    // The page title (set via the page.tsx layout) is the visible "API
    // Reference" heading. We don't lean on <title> because the swagger UI
    // can override the document title.
    await expect(
      page.getByRole("heading", { name: /API Reference/i })
    ).toBeVisible({ timeout: 20_000 })

    // Swagger UI mounts inside `.swagger-ui-wrapper` (see the page.tsx).
    await expect(page.locator(".swagger-ui-wrapper")).toBeVisible({
      timeout: 20_000,
    })

    // Confirm the openapi.json request fired from the docs page.
    await openApiRequest

    // Swagger UI renders operation panels with class `.opblock`. Wait for
    // at least one to appear — this proves the spec was parsed and the
    // operations list rendered.
    await expect(page.locator(".opblock").first()).toBeVisible({
      timeout: 30_000,
    })
  })
})
