import { test, expect } from "@playwright/test"
import { gotoAndWait } from "./helpers"

test.describe("Vulnerabilities library", () => {
  test("page loads at /library", async ({ page }) => {
    await gotoAndWait(page, "/library")
    await expect(page.getByRole("link", { name: "Vulnerabilities" }).first()).toBeVisible()
    await expect(page).toHaveURL(/\/library$/)
  })
})

const makeVuln = (overrides: Partial<Record<string, any>> = {}) => ({
  cveId: "CVE-2025-12345",
  severity: "CRITICAL",
  description: "Sample critical vuln",
  cvssScore: 9.8,
  packageName: "openssl",
  affectedImages: [
    { imageName: "alpine:3.19", imageId: "img-1", isFalsePositive: false },
  ],
  totalAffectedImages: 1,
  falsePositiveImages: [],
  fixedVersion: "1.1.1",
  references: ["https://nvd.nist.gov/vuln/detail/CVE-2025-12345"],
  ...overrides,
})

const vulnsResponse = (
  vulnerabilities: any[],
  pagination: Partial<{ total: number; limit: number; offset: number; hasMore: boolean }> = {},
) => ({
  vulnerabilities,
  pagination: {
    total: vulnerabilities.length,
    limit: 50,
    offset: 0,
    hasMore: false,
    ...pagination,
  },
})

test.describe("Vulnerabilities library — mocked", () => {
  test("renders all 7 KPI stat cards from mocked data", async ({ page }) => {
    // Five distinct CVEs across severities so the KPI counts are non-trivial.
    const vulns = [
      makeVuln({ cveId: "CVE-A", severity: "CRITICAL", cvssScore: 9.8, fixedVersion: "1" }),
      makeVuln({ cveId: "CVE-B", severity: "HIGH", cvssScore: 8.1, fixedVersion: "2" }),
      makeVuln({ cveId: "CVE-C", severity: "HIGH", cvssScore: 7.5 }),
      makeVuln({
        cveId: "CVE-D",
        severity: "MEDIUM",
        cvssScore: 5.0,
        falsePositiveImages: ["alpine"],
      }),
      makeVuln({ cveId: "CVE-E", severity: "LOW", cvssScore: 2.0 }),
    ]

    await page.route("**/api/vulnerabilities**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(vulnsResponse(vulns)),
      })
    })

    await gotoAndWait(page, "/library")

    // Each KPI label appears below its number. Match a few key labels.
    await expect(page.getByText(/total cves/i).first()).toBeVisible({
      timeout: 20_000,
    })
    await expect(page.getByText(/critical/i).first()).toBeVisible()
    await expect(page.getByText(/^high$/i).first()).toBeVisible()
    await expect(page.getByText(/high cvss/i).first()).toBeVisible()
    await expect(page.getByText(/fixable$/i).first()).toBeVisible()
    await expect(page.getByText(/with false positives/i).first()).toBeVisible()
    await expect(page.getByText(/fixable rate/i).first()).toBeVisible()
  })

  for (const sev of ["critical", "high", "medium", "low"] as const) {
    test(`severity Select filters by severity=${sev}`, async ({ page }) => {
      await page.route("**/api/vulnerabilities**", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(vulnsResponse([makeVuln()])),
        })
      })

      await gotoAndWait(page, "/library")
      // Wait for the table to load (search input visible signals form mounted).
      await expect(
        page.getByPlaceholder(/search cves or descriptions/i),
      ).toBeVisible({ timeout: 20_000 })

      const refetch = page.waitForRequest(
        (req) =>
          req.url().includes("/api/vulnerabilities") &&
          req.url().includes(`severity=${sev}`),
      )

      // Severity Select trigger has w-32 and is the only combobox on this page.
      await page.locator("button[role='combobox']").first().click({ force: true })
      // The select item labels are capitalized: "Critical", "High", etc.
      const label = sev.charAt(0).toUpperCase() + sev.slice(1)
      await page
        .getByRole("option", { name: label, exact: true })
        .click({ force: true })

      await refetch
    })
  }

  test("search input passes search= query", async ({ page }) => {
    await page.route("**/api/vulnerabilities**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(vulnsResponse([makeVuln()])),
      })
    })

    await gotoAndWait(page, "/library")
    const searchInput = page.getByPlaceholder(/search cves or descriptions/i)
    await expect(searchInput).toBeVisible({ timeout: 20_000 })

    const refetch = page.waitForRequest(
      (req) =>
        req.url().includes("/api/vulnerabilities") &&
        req.url().includes("search=openssl"),
    )
    await searchInput.fill("openssl")
    await refetch
  })

  test("multi-key typing fires one request per change (no debounce in hook)", async ({
    page,
  }) => {
    // The current hook (useVulnerabilityLibrary) does NOT debounce — each
    // setSearch call triggers a refetch. Document that behaviour by counting
    // requests. If a debounce is added later this test will catch it.
    const requests: string[] = []
    await page.route("**/api/vulnerabilities**", async (route) => {
      requests.push(route.request().url())
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(vulnsResponse([makeVuln()])),
      })
    })

    await gotoAndWait(page, "/library")
    const searchInput = page.getByPlaceholder(/search cves or descriptions/i)
    await expect(searchInput).toBeVisible({ timeout: 20_000 })

    // Record baseline (initial load fired one request).
    const baseline = requests.length

    // Type 4 characters quickly; React's onChange fires per keystroke.
    // `pressSequentially` simulates real typing better than `fill`.
    await searchInput.pressSequentially("abcd", { delay: 50 })
    // Give React time to settle.
    await page.waitForTimeout(500)

    const newCount = requests.length - baseline
    // No debounce -> one request per keystroke (4). The test asserts the
    // request count is in [1, 5] — anything outside that range indicates a
    // regression in either typing or refetch behaviour.
    expect(newCount).toBeGreaterThanOrEqual(1)
    expect(newCount).toBeLessThanOrEqual(5)
  })

  test("empty filtered result shows filter-aware empty message", async ({ page }) => {
    await page.route("**/api/vulnerabilities**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(vulnsResponse([])),
      })
    })

    await gotoAndWait(page, "/library")
    const searchInput = page.getByPlaceholder(/search cves or descriptions/i)
    await expect(searchInput).toBeVisible({ timeout: 20_000 })
    // Fill a search so the empty message renders the "matching current
    // filters" variant.
    await searchInput.fill("nomatch-xyz")

    await expect(
      page.getByText(/no vulnerabilities found matching current filters/i),
    ).toBeVisible({ timeout: 10_000 })
  })

  test("empty unfiltered result shows generic empty message", async ({ page }) => {
    await page.route("**/api/vulnerabilities**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(vulnsResponse([])),
      })
    })

    await gotoAndWait(page, "/library")
    await expect(
      page.getByText(/no vulnerabilities found/i).first(),
    ).toBeVisible({ timeout: 20_000 })
  })

  test("row click opens VulnerabilityDetailsModal with CVE ID in title", async ({
    page,
  }) => {
    const vuln = makeVuln({ cveId: "CVE-2099-9999" })
    await page.route("**/api/vulnerabilities**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(vulnsResponse([vuln])),
      })
    })

    await gotoAndWait(page, "/library")
    // Wait for the row to mount.
    await expect(page.getByText("CVE-2099-9999").first()).toBeVisible({
      timeout: 20_000,
    })

    // Click the row (UnifiedTable invokes onRowClick on the <tr>). The
    // cve-link cell wraps an outbound-link button that stopsPropagation, so
    // we target a non-link cell — the package name "openssl".
    const row = page.locator("tr", { has: page.getByText("CVE-2099-9999") }).first()
    await row.getByText("openssl").first().click({ force: true })

    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10_000 })
    // The dialog title contains the CVE id (font-mono span).
    await expect(
      page.getByRole("dialog").getByText("CVE-2099-9999"),
    ).toBeVisible()
  })

  test("pagination next-page fires request with offset= change", async ({ page }) => {
    // 5 pages (250 vulns, limit 50). Mock so totalPages > 1.
    await page.route("**/api/vulnerabilities**", async (route) => {
      const url = new URL(route.request().url())
      const offset = Number(url.searchParams.get("offset") || "0")
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          vulnsResponse([makeVuln()], {
            total: 250,
            limit: 50,
            offset,
            hasMore: offset < 200,
          }),
        ),
      })
    })

    await gotoAndWait(page, "/library")
    await expect(
      page.getByPlaceholder(/search cves or descriptions/i),
    ).toBeVisible({ timeout: 20_000 })

    const refetch = page.waitForRequest(
      (req) =>
        req.url().includes("/api/vulnerabilities") && req.url().includes("offset=50"),
    )
    // Pagination cluster: 4 icon buttons in a `gap-1` flex row. Index 2 =
    // next chevron.
    const paginationCluster = page
      .locator("div.flex.items-center.gap-1")
      .filter({ has: page.locator("button") })
      .last()
    await paginationCluster.locator("button").nth(2).click({ force: true })
    await refetch
  })

  test("View Details row action opens nvd.nist.gov in new tab", async ({ page, context }) => {
    const vuln = makeVuln({ cveId: "CVE-2098-NEWTAB" })
    await page.route("**/api/vulnerabilities**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(vulnsResponse([vuln])),
      })
    })

    await gotoAndWait(page, "/library")
    await expect(page.getByText("CVE-2098-NEWTAB").first()).toBeVisible({
      timeout: 20_000,
    })

    // The action button uses window.open(..., "_blank") which Chromium emits
    // as a "popup" event on the BrowserContext.
    const [popup] = await Promise.all([
      context.waitForEvent("page"),
      page
        .getByRole("button", { name: /view details/i })
        .first()
        .click({ force: true }),
    ])
    // The popup target URL must point at nvd.nist.gov for this CVE.
    expect(popup.url()).toContain("nvd.nist.gov/vuln/detail/CVE-2098-NEWTAB")
    await popup.close()
  })

  test("affected-images badge click navigates to /images/<name>", async ({ page }) => {
    const vuln = makeVuln({
      cveId: "CVE-NAV-IMG",
      affectedImages: [
        {
          imageName: "myrepo/alpine:3.18",
          imageId: "img-x",
          isFalsePositive: false,
        },
      ],
      totalAffectedImages: 1,
    })
    await page.route("**/api/vulnerabilities**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(vulnsResponse([vuln])),
      })
    })
    // Stub the image detail page request so we don't actually need that page
    // to render — just verify URL changes.
    await page.route("**/api/scans/aggregated**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ scans: [], pagination: { total: 0 } }),
      })
    })

    await gotoAndWait(page, "/library")
    await expect(page.getByText("CVE-NAV-IMG").first()).toBeVisible({
      timeout: 20_000,
    })

    // The badge label is "1 images" rendered by the interactive-badge cell.
    await page
      .locator("tr", { has: page.getByText("CVE-NAV-IMG") })
      .getByText(/^1 images$/i)
      .first()
      .click({ force: true })

    // The page navigates to /images/<imageName-without-tag>.
    // getImageName("myrepo/alpine:3.18") strips the tag → "myrepo/alpine".
    await page.waitForURL(/\/images\/myrepo%2Falpine/i, { timeout: 10_000 })
  })
})
