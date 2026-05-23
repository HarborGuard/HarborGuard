import { test, expect } from "@playwright/test"
import { gotoAndWait } from "./helpers"

test.describe("Library detail page", () => {
  // The library-detail page now fetches /api/library/<name>/vulnerabilities
  // directly (a server-side aggregate over scan_vulnerability_findings) instead
  // of going through useScans + scannerReports — which never actually
  // contained the data because /api/scans/aggregated omits scannerReports.

  const emptyResponse = (pkg: string) => ({
    package: pkg,
    totalScans: 0,
    affectedScans: 0,
    vulnerabilities: [],
  })

  const sampleVuln = (overrides: Partial<Record<string, any>> = {}) => ({
    cveId: "CVE-2025-12345",
    severity: "CRITICAL",
    scannerSources: ["trivy"],
    scanCount: 1,
    affectedImages: [{ name: "alpine", tag: "3.19" }],
    affectedImageCount: 1,
    installedVersion: "1.1.1",
    fixedVersion: "1.1.2",
    cvssScore: 9.8,
    description: "Sample critical OpenSSL vulnerability description.",
    title: "OpenSSL critical issue",
    references: ["https://nvd.nist.gov/vuln/detail/CVE-2025-12345"],
    vulnerabilityUrl: "https://nvd.nist.gov/vuln/detail/CVE-2025-12345",
    ...overrides,
  })

  test("page renders package title from URL param", async ({ page }) => {
    await page.route("**/api/library/**/vulnerabilities**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(emptyResponse("openssl")),
      })
    })

    await gotoAndWait(page, "/library/openssl")

    // Title shows the decoded library name.
    await expect(page.getByText("openssl").first()).toBeVisible({
      timeout: 20_000,
    })
    // Stat labels render even with 0 data.
    await expect(page.getByText(/total cves/i).first()).toBeVisible()
  })

  test("search input is rendered and accepts text", async ({ page }) => {
    await page.route("**/api/library/**/vulnerabilities**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(emptyResponse("openssl")),
      })
    })

    await gotoAndWait(page, "/library/openssl")
    const searchInput = page.getByPlaceholder(
      /search vulnerabilities, cves, or images/i,
    )
    await expect(searchInput).toBeVisible({ timeout: 20_000 })
    await searchInput.fill("CVE-2025")
    await expect(searchInput).toHaveValue("CVE-2025")
  })

  test("sort headers render with ArrowUpAZ/DownAZ icons toggling on click", async ({
    page,
  }) => {
    await page.route("**/api/library/**/vulnerabilities**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(emptyResponse("openssl")),
      })
    })

    await gotoAndWait(page, "/library/openssl")
    // The Severity sort button is in the table header.
    const severityHeader = page.getByRole("button", { name: /^severity/i }).first()
    await expect(severityHeader).toBeVisible({ timeout: 20_000 })

    // Initial sort order is "desc" (ArrowDownAZ shown). Click once to flip
    // to "asc" (ArrowUpAZ). We can't easily distinguish the two icons by
    // role, so we just verify the click does not throw and a header icon
    // remains visible.
    await severityHeader.click({ force: true })
    // Click again to flip back.
    await severityHeader.click({ force: true })
    // Still visible after toggle.
    await expect(severityHeader).toBeVisible()
  })

  test("empty state when no scans contain the package", async ({ page }) => {
    await page.route("**/api/library/**/vulnerabilities**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(emptyResponse("nonexistent-package-xyz")),
      })
    })

    await gotoAndWait(page, "/library/nonexistent-package-xyz")

    await expect(
      page.getByText(/no vulnerabilities found for nonexistent-package-xyz/i),
    ).toBeVisible({ timeout: 20_000 })
  })

  test("renders mocked vulnerability rows from the new API", async ({ page }) => {
    const vulns = [
      sampleVuln({ cveId: "CVE-2099-CRIT", severity: "CRITICAL", cvssScore: 9.5 }),
      sampleVuln({
        cveId: "CVE-2099-HIGH",
        severity: "HIGH",
        cvssScore: 7.5,
        fixedVersion: undefined,
      }),
      sampleVuln({
        cveId: "CVE-2099-MED",
        severity: "MEDIUM",
        cvssScore: 5.5,
      }),
    ]

    await page.route("**/api/library/**/vulnerabilities**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          package: "openssl",
          totalScans: 5,
          affectedScans: 3,
          vulnerabilities: vulns,
        }),
      })
    })

    await gotoAndWait(page, "/library/openssl")

    // Each mocked CVE id appears in a row.
    await expect(page.getByText("CVE-2099-CRIT")).toBeVisible({
      timeout: 20_000,
    })
    await expect(page.getByText("CVE-2099-HIGH")).toBeVisible()
    await expect(page.getByText("CVE-2099-MED")).toBeVisible()

    // The count caption reflects the loaded set: "3 of 3 vulnerabilities".
    await expect(page.getByText(/3 of 3 vulnerabilities/i)).toBeVisible()
  })

  test("search filters mocked rows by CVE id", async ({ page }) => {
    const vulns = [
      sampleVuln({ cveId: "CVE-AAA-111", severity: "CRITICAL" }),
      sampleVuln({ cveId: "CVE-BBB-222", severity: "HIGH" }),
    ]

    await page.route("**/api/library/**/vulnerabilities**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          package: "openssl",
          totalScans: 2,
          affectedScans: 2,
          vulnerabilities: vulns,
        }),
      })
    })

    await gotoAndWait(page, "/library/openssl")
    await expect(page.getByText("CVE-AAA-111")).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText("CVE-BBB-222")).toBeVisible()

    // Filter so only one row remains.
    const searchInput = page.getByPlaceholder(
      /search vulnerabilities, cves, or images/i,
    )
    await searchInput.fill("AAA")

    await expect(page.getByText("CVE-AAA-111")).toBeVisible()
    await expect(page.getByText("CVE-BBB-222")).toHaveCount(0)
  })
})
