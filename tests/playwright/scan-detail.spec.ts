import { test, expect } from "@playwright/test"
import { gotoAndWait } from "./helpers"

/**
 * Scan detail page lives at /images/[name]/[scanId]. It pulls from:
 *   GET /api/scans/[id] — main scan payload (image + metadata + scannerData)
 *   GET /api/scans/[id]/findings — normalized findings (4 tab counts)
 *   GET /api/config/raw-output — whether to expose the Raw view toggle
 *   GET /api/images/name/[name]/cve-classifications — CVE classifications
 *   POST /api/patches/analyze — patch analysis side-card
 *
 * We mock every one of those so the page can render in isolation, deterministically.
 * The dev server has the route `/api/api-keys` that fails to compile (untracked
 * scaffold), but its 500s don't block the scan page from mounting.
 */

const SCAN_ID = "test-scan-12345"
const IMAGE_NAME = "nginx"
const PATH = `/images/${IMAGE_NAME}/${SCAN_ID}`

// Minimal but well-formed scan payload covering all 6 scanner outputs so
// the page can render the Raw scanner tabs (incl. OSV + Dive which are
// conditional on their presence).
const MOCK_SCAN = {
  id: SCAN_ID,
  requestId: SCAN_ID,
  imageId: "img-1",
  startedAt: "2026-05-21T00:00:00.000Z",
  finishedAt: "2026-05-21T00:02:00.000Z",
  status: "SUCCESS",
  reportsDir: null,
  errorMessage: null,
  riskScore: 50,
  source: "registry",
  createdAt: "2026-05-21T00:00:00.000Z",
  updatedAt: "2026-05-21T00:02:00.000Z",
  metadataId: "meta-1",
  tag: "latest",
  image: {
    id: "img-1",
    name: IMAGE_NAME,
    tag: "latest",
    registry: null,
    registryType: "DOCKERHUB",
    dockerImageId: "abc123",
    source: "DOCKERHUB",
    digest: "sha256:abc",
    platform: "linux/amd64",
    sizeBytes: "100000",
    createdAt: "2026-05-21T00:00:00.000Z",
    updatedAt: "2026-05-21T00:00:00.000Z",
    primaryRepositoryId: null,
  },
  metadata: {
    id: "meta-1",
    vulnerabilityCritical: 1,
    vulnerabilityHigh: 2,
    vulnerabilityMedium: 3,
    vulnerabilityLow: 4,
    vulnerabilityInfo: 0,
    aggregatedRiskScore: 50,
    complianceScore: 80,
    complianceGrade: "B",
    scannerVersions: { trivy: "0.5", grype: "0.7", syft: "1.0" },
    s3Prefix: null,
  },
  scannerData: {
    trivy: {
      SchemaVersion: 2,
      ArtifactName: `${IMAGE_NAME}:latest`,
      ArtifactType: "container_image",
      Results: [
        {
          Target: `${IMAGE_NAME}:latest`,
          Class: "os-pkgs",
          Type: "alpine",
          Vulnerabilities: [
            {
              VulnerabilityID: "CVE-2023-0001",
              PkgName: "openssl",
              InstalledVersion: "3.0.0",
              FixedVersion: "3.0.1",
              Severity: "HIGH",
              Title: "Test vuln",
              Description: "A test vulnerability",
              CVSS: { nvd: { V3Score: 7.5 } },
            },
          ],
        },
      ],
    },
    grype: {
      matches: [
        {
          vulnerability: {
            id: "CVE-2023-0002",
            severity: "Medium",
            description: "Another vuln",
            fix: { state: "fixed", versions: ["1.0.1"] },
            cvss: [],
            urls: [],
          },
          artifact: { name: "pkg1", version: "1.0.0", type: "apk", locations: [] },
        },
      ],
      db: {},
    },
    syft: {
      artifacts: [{ id: "pkg1", name: "pkg1", version: "1.0.0", type: "apk" }],
      source: { type: "image" },
      distro: { name: "alpine", version: "3.18" },
      descriptor: { name: "syft" },
      schema: { version: "11" },
    },
    dockle: {
      summary: { fatal: 0, warn: 1, info: 2, pass: 10 },
      details: [{ code: "CIS-DI-0006", title: "Avoid latest tag", level: "WARN", alerts: [] }],
    },
    osv: {
      results: [
        {
          packages: [
            {
              package: { name: "pkg2", ecosystem: "npm", version: "1.0.0" },
              vulnerabilities: [{ id: "GHSA-xxx", summary: "Issue" }],
            },
          ],
        },
      ],
    },
    dive: {
      image: {
        efficiencyScore: 0.95,
        sizeBytes: 100000,
        inefficientBytes: 500,
        inefficientFiles: [],
        duplicateFiles: [],
      },
      layer: [
        {
          id: "layer1",
          index: 0,
          digest: "sha256:layer1",
          sizeBytes: 50000,
          command: "FROM alpine",
        },
      ],
    },
  },
}

// Findings response shape — mirrors what /api/scans/[id]/findings returns.
const MOCK_FINDINGS = {
  scanId: SCAN_ID,
  image: MOCK_SCAN.image,
  status: "SUCCESS",
  startedAt: MOCK_SCAN.startedAt,
  finishedAt: MOCK_SCAN.finishedAt,
  vulnerabilities: {
    total: 2,
    bySeverity: { CRITICAL: 0, HIGH: 1, MEDIUM: 1, LOW: 0, INFO: 0 },
    bySource: [],
    findings: [
      {
        id: "vuln1",
        cveId: "CVE-2023-0001",
        packageName: "openssl",
        installedVersion: "3.0.0",
        fixedVersion: "3.0.1",
        severity: "HIGH",
        cvssScore: 7.5,
        source: "trivy",
        title: "Test vuln",
        description: "A test vulnerability",
      },
    ],
  },
  packages: { total: 1, byType: { apk: 1 }, findings: [] },
  compliance: { total: 1, findings: [] },
  efficiency: { total: 1, findings: [], totalSizeBytes: 100000, totalWastedBytes: 500 },
  summary: { aggregatedRiskScore: 50, complianceGrade: "B" },
  correlations: { multiSource: 0 },
}

async function installMocks(page: import("@playwright/test").Page, opts?: { scan?: any | null }) {
  // GET /api/scans/{id}
  await page.route("**/api/scans/test-scan-12345", async (route) => {
    if (opts?.scan === null) {
      await route.fulfill({ status: 404, contentType: "application/json", body: '{"error":"Scan not found"}' })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(opts?.scan ?? MOCK_SCAN),
    })
  })

  // GET /api/scans/{id}/findings (may have a query string)
  await page.route("**/api/scans/test-scan-12345/findings**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_FINDINGS),
    })
  })

  // GET /api/scans/{id}/cve-classifications
  await page.route("**/api/scans/test-scan-12345/cve-classifications**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
  })

  // GET /api/config/raw-output (toggle gate)
  await page.route("**/api/config/raw-output", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ enabled: true }),
    })
  })

  // GET /api/images/name/{name}/cve-classifications — consolidated endpoint
  await page.route(`**/api/images/name/${IMAGE_NAME}/cve-classifications`, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
  })

  // POST /api/patches/analyze — patch analysis side card; respond with a
  // minimal "no patches available" shape so it doesn't disrupt the page.
  await page.route("**/api/patches/analyze", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ patches: [], summary: { totalVulnerabilities: 0, patchableCount: 0 } }),
    })
  })
}

test.describe("Scan detail page", () => {
  test.describe.configure({ mode: "parallel" })

  test("renders page given mocked scan data", async ({ page }) => {
    await installMocks(page)
    await gotoAndWait(page, PATH)
    // Page heading + breadcrumb
    await expect(page.getByRole("heading", { name: /scan results/i })).toBeVisible()
    // Subtitle contains the image name + partial scan ID
    await expect(page.getByText(new RegExp(IMAGE_NAME, "i")).first()).toBeVisible()
  })

  test("Normalized vs Raw toggle switches view", async ({ page }) => {
    await installMocks(page)
    await gotoAndWait(page, PATH)

    // The toggle only appears when /api/config/raw-output returns enabled=true
    // (which our mock does). It renders two buttons: "Normalized View" + "Raw Scanner Output".
    const normalizedBtn = page.getByRole("button", { name: /normalized view/i }).first()
    const rawBtn = page.getByRole("button", { name: /raw scanner output/i }).first()
    await expect(normalizedBtn).toBeVisible()
    await expect(rawBtn).toBeVisible()

    // Default is normalized — the findings tabs (Vulnerabilities/Packages/...)
    // should be rendered. Switch to raw.
    await rawBtn.click({ force: true })

    // Raw view exposes scanner-specific tabs; "Trivy" appears as a tab in RawScannerTabs.
    await expect(page.getByRole("tab", { name: /^trivy$/i }).first()).toBeVisible()

    // Switch back to normalized.
    await normalizedBtn.click({ force: true })
    // Normalized view exposes Vulnerabilities tab with a parenthetical count.
    await expect(page.getByRole("tab", { name: /vulnerabilities/i }).first()).toBeVisible()
  })

  test("all 6 raw scanner tabs render", async ({ page }) => {
    await installMocks(page)
    await gotoAndWait(page, PATH)

    // Flip to Raw view.
    await page.getByRole("button", { name: /raw scanner output/i }).first().click({ force: true })

    // Tabs from RawScannerTabs:
    //   Trivy, Grype, Syft, Dockle, OSV (conditional on osvResults),
    //   Layers (conditional on dive layers). Our mock provides all 6.
    await expect(page.getByRole("tab", { name: /^trivy$/i }).first()).toBeVisible()
    await expect(page.getByRole("tab", { name: /^grype$/i }).first()).toBeVisible()
    await expect(page.getByRole("tab", { name: /^syft$/i }).first()).toBeVisible()
    await expect(page.getByRole("tab", { name: /^dockle$/i }).first()).toBeVisible()
    await expect(page.getByRole("tab", { name: /^osv$/i }).first()).toBeVisible()
    // Dive tab is labelled "Layers (N)" — match the leading word.
    await expect(page.getByRole("tab", { name: /^layers/i }).first()).toBeVisible()
  })

  test("normalized findings tabs render (Vulnerabilities/Packages/Compliance/Efficiency)", async ({
    page,
  }) => {
    await installMocks(page)
    await gotoAndWait(page, PATH)

    // ScanDetailsNormalized renders the 4-tab TabsList. Each tab's accessible
    // name has the form "Vulnerabilities (N)" etc.
    await expect(page.getByRole("tab", { name: /vulnerabilities/i }).first()).toBeVisible()
    await expect(page.getByRole("tab", { name: /packages/i }).first()).toBeVisible()
    await expect(page.getByRole("tab", { name: /compliance/i }).first()).toBeVisible()
    await expect(page.getByRole("tab", { name: /efficiency/i }).first()).toBeVisible()
  })

  test("missing scanId renders graceful error state, not a white screen", async ({ page }) => {
    // Mock /api/scans/{id} as 404; the page should render an error Card with
    // "Scan Not Found" copy and a "Go Back to Image" button.
    await installMocks(page, { scan: null })
    await gotoAndWait(page, PATH)

    // The error card heading uses the CardTitle "Scan Not Found".
    await expect(page.getByText(/scan not found/i).first()).toBeVisible()
    // And there's a "Go Back to Image" CTA, which proves the page rendered
    // its error fallback rather than crashing the route.
    await expect(page.getByRole("link", { name: /go back to image/i }).first()).toBeVisible()
  })
})
