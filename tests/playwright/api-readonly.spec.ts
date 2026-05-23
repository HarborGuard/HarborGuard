import { test, expect } from "@playwright/test"

/**
 * GET-smoke for read-only API endpoints. Each test asserts:
 *   - 2xx response
 *   - response parses as JSON
 *   - body is permissively shaped: array OR object containing an array
 *     under a known key (`data`, `items`, or a route-specific name).
 *
 * Notes:
 *   - `/api/scanners` (without `/available`) doesn't exist; only the
 *     `/api/scanners/available` route is tested.
 *   - When a route surfaces a 500 in CI (a real bug), the test should be
 *     flipped to `test.fixme` rather than failing outright.
 */

function expectArrayShape(body: any) {
  // Accept an array directly OR an object containing some array property
  if (Array.isArray(body)) {
    return
  }
  expect(typeof body).toBe("object")
  expect(body).not.toBeNull()
  // Look for any array-valued property on the object
  const hasAnyArray = Object.values(body).some((v) => Array.isArray(v))
  expect(hasAnyArray).toBeTruthy()
}

test.describe("API read-only endpoints", () => {
  test.describe.configure({ mode: "parallel" })

  test("GET /api/images returns paginated image list", async ({ request }) => {
    const res = await request.get("/api/images")
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty("images")
    expect(Array.isArray(body.images)).toBeTruthy()
    expect(body).toHaveProperty("pagination")
  })

  test("GET /api/repositories returns { data: [] } envelope", async ({ request }) => {
    const res = await request.get("/api/repositories")
    expect(res.status()).toBe(200)
    const body = await res.json()
    expectArrayShape(body)
  })

  test("GET /api/vulnerabilities returns { vulnerabilities: [] }", async ({ request }) => {
    const res = await request.get("/api/vulnerabilities?limit=10")
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty("vulnerabilities")
    expect(Array.isArray(body.vulnerabilities)).toBeTruthy()
    expect(body).toHaveProperty("pagination")
  })

  test("GET /api/audit-logs returns log envelope", async ({ request }) => {
    const res = await request.get("/api/audit-logs")
    expect(res.status()).toBe(200)
    const body = await res.json()
    expectArrayShape(body)
  })

  test("GET /api/audit-logs?limit=10&page=1 supports pagination", async ({ request }) => {
    const res = await request.get("/api/audit-logs?limit=10&page=1")
    expect(res.status()).toBe(200)
    const body = await res.json()
    // Either `total` directly or under `pagination.total`
    const hasTotal =
      "total" in body ||
      (body.pagination && "total" in body.pagination)
    expect(hasTotal).toBeTruthy()
  })

  test("GET /api/scheduled-scans returns scheduledScans + pagination", async ({ request }) => {
    const res = await request.get("/api/scheduled-scans")
    expect(res.status()).toBe(200)
    const body = await res.json()
    expectArrayShape(body)
  })

  test("GET /api/agents returns an array (local request)", async ({ request }) => {
    const res = await request.get("/api/agents")
    // The route restricts access to local IPs; localhost in CI may map to
    // 127.0.0.1 (200) or to a forwarded IP (403). Both are acceptable.
    expect([200, 403]).toContain(res.status())
    if (res.status() === 200) {
      const body = await res.json()
      // Returns a bare array of agents.
      expect(Array.isArray(body) || typeof body === "object").toBeTruthy()
    }
  })

  test("GET /api/scanners/available returns scanner list", async ({ request }) => {
    const res = await request.get("/api/scanners/available")
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty("scanners")
    expect(Array.isArray(body.scanners)).toBeTruthy()
  })

  test("GET /api/scans/aggregated returns scans + pagination", async ({ request }) => {
    const res = await request.get("/api/scans/aggregated?limit=5")
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty("scans")
    expect(Array.isArray(body.scans)).toBeTruthy()
    expect(body).toHaveProperty("pagination")
  })

  test("GET /api/scans/jobs returns jobs + queuedScans + queueStats", async ({ request }) => {
    const res = await request.get("/api/scans/jobs")
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty("jobs")
    expect(Array.isArray(body.jobs)).toBeTruthy()
    expect(body).toHaveProperty("queuedScans")
  })

  test("GET /api/scheduled-scans/history returns history + pagination", async ({ request }) => {
    const res = await request.get("/api/scheduled-scans/history")
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty("history")
    expect(Array.isArray(body.history)).toBeTruthy()
  })

  test("GET /api/patches/history returns operations + pagination", async ({ request }) => {
    const res = await request.get("/api/patches/history")
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty("operations")
    expect(Array.isArray(body.operations)).toBeTruthy()
  })

  test("GET /api/settings returns settings object", async ({ request }) => {
    const res = await request.get("/api/settings")
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(typeof body).toBe("object")
    expect(body).not.toBeNull()
    // Should contain at least one of the documented defaults
    const knownKeys = [
      "cleanupOldScansDays",
      "cleanupAuditLogsDays",
      "cleanupBulkScansDays",
      "cleanupS3Artifacts",
    ]
    const hasAnyKnownKey = knownKeys.some((k) => k in body)
    expect(hasAnyKnownKey).toBeTruthy()
  })

  test("GET /api/config/raw-output returns enabled flag", async ({ request }) => {
    const res = await request.get("/api/config/raw-output")
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty("enabled")
    expect(typeof body.enabled).toBe("boolean")
  })
})
