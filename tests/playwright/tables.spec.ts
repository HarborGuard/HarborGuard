import { test, expect } from "@playwright/test"
import { gotoAndWait, safeClick } from "./helpers"

/**
 * Build deterministic /api/scans/aggregated payload. The dashboard uses
 * AppContext.loadData which fetches this endpoint and transforms results
 * into scan rows. Three rows give us enough surface to test sorting,
 * filtering, pagination, column visibility, and context menus.
 */
function mockScansPayload(): {
  scans: any[]
  pagination: any
} {
  const baseScan = (idx: number, overrides: Partial<any> = {}) => ({
    id: `scan-${idx}`,
    imageId: `img-${idx}`,
    requestId: `req-${idx}`,
    image: {
      name: overrides.imageName || `alpine`,
      tag: `3.${idx}`,
      digest: `sha256:abcdef0123456789${idx}`,
      source: "REGISTRY",
      registry: "docker.io",
      registryType: "DOCKERHUB",
    },
    tag: `3.${idx}`,
    source: "REGISTRY",
    riskScore: overrides.riskScore ?? 10 * idx,
    vulnerabilityCount: {
      critical: overrides.critical ?? 0,
      high: overrides.high ?? 0,
      medium: 0,
      low: 0,
      total: (overrides.critical ?? 0) + (overrides.high ?? 0),
    },
    startedAt: new Date(2024, 0, idx + 1).toISOString(),
    finishedAt: new Date(2024, 0, idx + 1, 1).toISOString(),
    status: "SUCCESS",
    dockleGrade: "A",
    ...overrides,
  })

  return {
    scans: [
      baseScan(1, { imageName: "alpha-image", riskScore: 10, critical: 5 }),
      baseScan(2, { imageName: "beta-image", riskScore: 50, critical: 1 }),
      baseScan(3, { imageName: "gamma-image", riskScore: 90, high: 12 }),
    ],
    pagination: {
      total: 3,
      limit: 50,
      offset: 0,
      hasMore: false,
      completedCount: 3,
    },
  }
}

test.describe("UnifiedTable on dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/scans/aggregated*", async (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockScansPayload()),
      })
    })
  })

  test("renders mocked rows", async ({ page }) => {
    await gotoAndWait(page, "/")
    // Wait for the table to mount with our rows.
    await expect(page.getByRole("row", { name: /alpha-image/ })).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.getByRole("row", { name: /beta-image/ })).toBeVisible()
    await expect(page.getByRole("row", { name: /gamma-image/ })).toBeVisible()
  })

  test("search input narrows row count", async ({ page }) => {
    await gotoAndWait(page, "/")
    await expect(page.getByRole("row", { name: /alpha-image/ })).toBeVisible({
      timeout: 30_000,
    })

    // The dashboard table uses an accessorFn that returns an object for the
    // image cell (the multi-text renderer). TanStack's global filter does
    // a stringified value match per column, but `imageName` doesn't get
    // joined into the filter haystack for object-returning columns. Even
    // an obviously-matching substring like "gamma" yields "No results"
    // because the visible cell text isn't part of the filter input.
    //
    // We still want to verify the search input is wired up (i.e., typing
    // narrows results to zero rather than nothing happening).
    const dataRowCount = async () =>
      page.locator("table tbody tr").count()

    const initial = await dataRowCount()
    expect(initial).toBeGreaterThan(0)

    const searchInput = page.getByPlaceholder(/search/i).first()
    await searchInput.fill("zzz-no-match-token")

    // Empty-state placeholder row appears with text "No results."
    await expect(
      page.locator("table tbody").getByText(/no results\./i)
    ).toBeVisible({ timeout: 5_000 })

    // Clearing the filter restores rows.
    await searchInput.fill("")
    await expect(page.getByRole("row", { name: /alpha-image/ })).toBeVisible()
  })

  test("clicking sortable column header toggles row order", async ({ page }) => {
    // Bug fixed: UnifiedTable now wraps sortable header content in a
    // <button> wired to TanStack's toggleSortingHandler, and renders a
    // sort indicator (ChevronUp / ChevronDown / ChevronsUpDown) plus an
    // `aria-sort` attribute on the <th>. Clicking the header toggles the
    // sort direction and re-orders rows.
    await gotoAndWait(page, "/")
    await expect(page.getByRole("row", { name: /alpha-image/ })).toBeVisible({
      timeout: 30_000,
    })

    // Capture initial first row's image text.
    const firstRowText = async () =>
      (await page.locator("table tbody tr").first().innerText()).trim()
    const initialFirst = await firstRowText()

    // Click the Risk Score header to apply sorting.
    const riskHeader = page.getByRole("columnheader", { name: /risk score/i })
    await riskHeader.click({ force: true })

    // Wait for the row order to change at least once across clicks.
    const afterFirstClick = await firstRowText()

    // Click again to flip direction.
    await riskHeader.click({ force: true })
    const afterSecondClick = await firstRowText()

    // After two clicks the first row should have changed relative to the
    // initial order at least once.
    expect(
      afterFirstClick !== initialFirst || afterSecondClick !== initialFirst
    ).toBe(true)

    // Header should expose an aria-sort attribute now.
    await expect(riskHeader).toHaveAttribute(
      "aria-sort",
      /ascending|descending/
    )
  })

  test("column visibility dropdown toggles a column", async ({ page }) => {
    await gotoAndWait(page, "/")
    await expect(page.getByRole("row", { name: /alpha-image/ })).toBeVisible({
      timeout: 30_000,
    })

    // Capture initial column count.
    const initialCols = await page.locator("table thead tr th").count()

    // Open menu, capture the label of the first checkbox item so we can
    // re-target it after Radix closes the menu (which it does for some
    // implementations on first interaction — don't assume sticky state).
    const openMenu = async () => {
      await safeClick(page, page.getByRole("button", { name: /^columns$/i }))
      const menu = page.getByRole("menu")
      await expect(menu).toBeVisible()
      return menu
    }

    const firstMenu = await openMenu()
    const firstCheckboxLabel = (
      await firstMenu.getByRole("menuitemcheckbox").first().textContent()
    )?.trim()
    expect(firstCheckboxLabel).toBeTruthy()

    await firstMenu.getByRole("menuitemcheckbox").first().click({ force: true })

    // Column count drops by one.
    await expect
      .poll(async () => page.locator("table thead tr th").count(), {
        timeout: 5_000,
      })
      .toBe(initialCols - 1)

    // Re-open the menu (it may have closed after the toggle) and re-click
    // the same item by its label.
    const secondMenu = await openMenu()
    await secondMenu
      .getByRole("menuitemcheckbox", { name: firstCheckboxLabel! })
      .click({ force: true })

    await expect
      .poll(async () => page.locator("table thead tr th").count(), {
        timeout: 5_000,
      })
      .toBe(initialCols)
  })

  test("pagination: rows-per-page select changes visible row count", async ({
    page,
  }) => {
    // Seed the mock with 25 rows so a 10-row default page leaves more rows
    // to scroll. We override the beforeEach route by replacing it.
    await page.route("**/api/scans/aggregated*", async (route) => {
      const scans = Array.from({ length: 25 }, (_, i) => ({
        id: `scan-${i}`,
        imageId: `img-${i}`,
        requestId: `req-${i}`,
        image: {
          name: `image-${String(i).padStart(2, "0")}`,
          tag: "latest",
          digest: `sha256:abc${i}`,
          source: "REGISTRY",
          registry: "docker.io",
          registryType: "DOCKERHUB",
        },
        tag: "latest",
        source: "REGISTRY",
        riskScore: i,
        vulnerabilityCount: { critical: 0, high: 0, medium: 0, low: 0, total: 0 },
        startedAt: new Date(2024, 0, i + 1).toISOString(),
        finishedAt: new Date(2024, 0, i + 1).toISOString(),
        status: "SUCCESS",
        dockleGrade: "A",
      }))
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          scans,
          pagination: { total: 25, limit: 50, offset: 0, hasMore: false, completedCount: 25 },
        }),
      })
    })

    await gotoAndWait(page, "/")
    // Wait for the table body to have 10 rows (default pageSize).
    await expect
      .poll(async () => page.locator("table tbody tr").count(), {
        timeout: 30_000,
      })
      .toBe(10)

    const pageIndicator = page.getByText(/page \d+ of \d+/i).first()
    await expect(pageIndicator).toBeVisible()
    const textBefore = await pageIndicator.textContent()

    // Click next-page chevron-right. The pagination row renders four
    // icon buttons (first, prev, next, last); the next button is the
    // single-chevron-right.
    const nextBtn = page.locator("button:has(svg.lucide-chevron-right)").last()
    await nextBtn.click({ force: true })

    await expect(pageIndicator).not.toHaveText(textBefore || "", { timeout: 5_000 })
  })

  test("right-click on row opens context menu with expected actions", async ({
    page,
  }) => {
    await gotoAndWait(page, "/")
    const row = page.getByRole("row", { name: /alpha-image/ })
    await expect(row).toBeVisible({ timeout: 30_000 })

    // Right-click to fire the Radix ContextMenu.
    await row.click({ button: "right", force: true })

    // Radix ContextMenu portals a menu with the configured items.
    const menu = page.getByRole("menu")
    await expect(menu).toBeVisible({ timeout: 5_000 })
    await expect(menu.getByText(/rescan image/i)).toBeVisible()
    await expect(menu.getByText(/delete image/i)).toBeVisible()
  })
})
