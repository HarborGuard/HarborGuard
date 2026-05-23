import { test, expect, Page } from "@playwright/test"
import { gotoAndWait } from "./helpers"

/**
 * Tests for src/app/images/[name]/page.tsx.
 *
 * The page renders an image detail view with the URL-decoded image name in
 * the H1, plus a historical scans table whose rows are scoped to that image.
 *
 * All tests mock the following endpoints so the page becomes deterministic:
 *   GET /api/images              - source of `images` array
 *   GET /api/scans?imageId=...   - source of `scans` array (per-image)
 *   GET /api/images/name/.../cve-classifications - classification fetch
 */

interface FakeImage {
  id: string
  name: string
  tag: string
  source?: string
  digest?: string
  registry?: string | null
  registryType?: string
  platform?: string
  sizeBytes?: string
  createdAt: string
  updatedAt: string
  primaryRepositoryId?: null
}

interface FakeScan {
  id: string
  requestId: string
  imageId: string
  tag: string
  startedAt: string
  finishedAt?: string
  status: string
  riskScore: number
  source?: string
  metadata?: any
  image: any
  vulnerabilityCount: { total: number; critical: number; high: number; medium: number; low: number }
  dockleGrade?: string
}

function makeImage(overrides: Partial<FakeImage> = {}): FakeImage {
  return {
    id: "img-1",
    name: "library/nginx",
    tag: "latest",
    source: "DOCKERHUB",
    digest: "sha256:" + "a".repeat(64),
    registry: null,
    registryType: "DOCKERHUB",
    platform: "linux/amd64",
    sizeBytes: "12345678",
    createdAt: new Date("2026-01-01T00:00:00Z").toISOString(),
    updatedAt: new Date("2026-01-01T00:00:00Z").toISOString(),
    primaryRepositoryId: null,
    ...overrides,
  }
}

function makeScan(overrides: Partial<FakeScan> & { imageId: string; id?: string }): FakeScan {
  const img = {
    id: overrides.imageId,
    name: "library/nginx",
    tag: "latest",
    source: "DOCKERHUB",
    digest: "sha256:" + "a".repeat(64),
    registry: null,
    registryType: "DOCKERHUB",
    platform: "linux/amd64",
    sizeBytes: "12345678",
  }
  return {
    id: overrides.id || "scan-1",
    requestId: "20260101-000000-aaaaaaaa",
    tag: "latest",
    startedAt: new Date("2026-01-01T00:00:00Z").toISOString(),
    finishedAt: new Date("2026-01-01T00:01:00Z").toISOString(),
    status: "SUCCESS",
    riskScore: 50,
    image: img,
    vulnerabilityCount: { total: 4, critical: 1, high: 1, medium: 1, low: 1 },
    dockleGrade: "B",
    ...overrides,
    imageId: overrides.imageId,
  }
}

async function mockImagesDetail(
  page: Page,
  opts: {
    imageName: string
    images: FakeImage[]
    scans: FakeScan[]
  }
) {
  await page.route("**/api/images?**", (route) => {
    if (route.request().method() !== "GET") return route.fallback()
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        images: opts.images,
        pagination: {
          total: opts.images.length,
          limit: 100,
          offset: 0,
          hasMore: false,
        },
      }),
    })
  })

  // /api/scans?imageId=... is what useDatabase calls per-imageId
  await page.route(/\/api\/scans(\?|$)/, (route) => {
    if (route.request().method() !== "GET") return route.fallback()
    const url = new URL(route.request().url())
    const imageId = url.searchParams.get("imageId")
    const matching = imageId
      ? opts.scans.filter((s) => s.imageId === imageId)
      : opts.scans
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        scans: matching,
        pagination: {
          total: matching.length,
          limit: 100,
          offset: 0,
          hasMore: false,
        },
      }),
    })
  })

  // CVE classification endpoint always returns an empty list
  await page.route("**/cve-classifications**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    })
  )

  // Aggregated scans endpoint is also fetched by AppContext on mount
  await page.route("**/api/scans/aggregated**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        scans: [],
        pagination: { total: 0, limit: 100, offset: 0, hasMore: false, completedCount: 0 },
      }),
    })
  )

  // Vulnerabilities and bulk scans endpoints (loaded by DatabaseProvider)
  await page.route("**/api/vulnerabilities**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ vulnerabilities: [] }),
    })
  )
  await page.route("**/api/scans/bulk**", (route) => {
    if (route.request().method() !== "GET") return route.fallback()
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    })
  })
}

test.describe("Image Detail Page", () => {
  test("renders header with the URL-decoded image name", async ({ page }) => {
    const imageName = "library/nginx"
    const image = makeImage({ id: "img-1", name: imageName })
    const scan = makeScan({ imageId: "img-1" })
    await mockImagesDetail(page, { imageName, images: [image], scans: [scan] })

    // URL-encode the slash so we exercise the decode path
    await gotoAndWait(page, `/images/${encodeURIComponent(imageName)}`)

    // The H1 should contain the decoded name. We give it a generous wait since
    // the page goes through loading → data → render.
    await expect(page.getByRole("heading", { level: 1, name: imageName })).toBeVisible({
      timeout: 20_000,
    })
  })

  test("URL-encoded library%2Fnginx decodes correctly in header", async ({ page }) => {
    const imageName = "library/nginx"
    const image = makeImage({ id: "img-2", name: imageName })
    const scan = makeScan({ imageId: "img-2" })
    await mockImagesDetail(page, { imageName, images: [image], scans: [scan] })

    // Hard-code the encoded path (library%2Fnginx) rather than using
    // encodeURIComponent so we lock the URL form.
    await gotoAndWait(page, "/images/library%2Fnginx")

    await expect(page.getByRole("heading", { level: 1, name: imageName })).toBeVisible({
      timeout: 20_000,
    })
    // URL itself should still be encoded
    await expect(page).toHaveURL(/library%2Fnginx/)
  })

  test("missing image renders graceful Image Not Found state (no crash)", async ({ page }) => {
    const imageName = "does-not-exist"
    await mockImagesDetail(page, { imageName, images: [], scans: [] })

    await gotoAndWait(page, `/images/${encodeURIComponent(imageName)}`)

    // The error/empty card title is "Image Not Found"
    await expect(page.getByText(/image not found/i).first()).toBeVisible({ timeout: 20_000 })
    // Sanity: not the dashboard
    await expect(page).toHaveURL(/\/images\/does-not-exist/)
  })

  test("scan history table renders with mocked scans", async ({ page }) => {
    const imageName = "library/nginx"
    const image = makeImage({ id: "img-3", name: imageName })
    const scans = [
      makeScan({ id: "scan-a", imageId: "img-3", tag: "1.25" }),
      makeScan({ id: "scan-b", imageId: "img-3", tag: "1.26" }),
    ]
    await mockImagesDetail(page, { imageName, images: [image], scans })

    await gotoAndWait(page, `/images/${encodeURIComponent(imageName)}`)

    // The "All Scans Across Tags" card section
    await expect(page.getByText(/all scans across tags/i).first()).toBeVisible({
      timeout: 20_000,
    })

    // Both tag-version cells should be rendered. The version column shows
    // "library/nginx:1.25" and "library/nginx:1.26".
    await expect(page.getByText(`${imageName}:1.25`).first()).toBeVisible()
    await expect(page.getByText(`${imageName}:1.26`).first()).toBeVisible()
  })

  test("Export dialog opens via row context menu Export action", async ({ page }) => {
    const imageName = "library/nginx"
    const image = makeImage({ id: "img-4", name: imageName })
    const scan = makeScan({ id: "scan-x", imageId: "img-4", tag: "1.27" })
    await mockImagesDetail(page, { imageName, images: [image], scans: [scan] })

    // The export dialog also reads /api/repositories (and others)
    await page.route("**/api/repositories", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [] }),
      })
    )

    await gotoAndWait(page, `/images/${encodeURIComponent(imageName)}`)

    // Wait for the scan row to be in the DOM
    const versionCell = page.getByText(`${imageName}:1.27`).first()
    await expect(versionCell).toBeVisible({ timeout: 20_000 })

    // Right-click on the row to bring up the context menu
    await versionCell.click({ button: "right", force: true })

    // The context menu items include "Download Reports", "Export Image", and "Delete Scan".
    // Match by visible text since they're radix ContextMenuItems with role="menuitem".
    const exportItem = page.getByRole("menuitem", { name: /export image/i })
    await expect(exportItem).toBeVisible({ timeout: 10_000 })
    await exportItem.click({ force: true })

    // The export dialog title is "Export Image" - assert one is visible.
    // The ExportImageDialogEnhanced has a heading "Export Image" at level 2.
    await expect(page.getByRole("heading", { name: /export image/i })).toBeVisible({
      timeout: 10_000,
    })
  })
})
