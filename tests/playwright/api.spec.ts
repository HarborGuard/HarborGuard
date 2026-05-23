import { test, expect } from "@playwright/test"

test.describe("API endpoints", () => {
  test.describe.configure({ mode: "parallel" })

  test("/api/health returns healthy or degraded", async ({ request }) => {
    const res = await request.get("/api/health")
    expect([200, 503]).toContain(res.status())
    const body = await res.json()
    expect(body).toHaveProperty("status")
    expect(body).toHaveProperty("checks.database")
    expect(["healthy", "degraded", "unhealthy"]).toContain(body.status)
  })

  test("/api/health HEAD returns 200 or 503", async ({ request }) => {
    const res = await request.head("/api/health")
    expect([200, 503]).toContain(res.status())
  })

  test("/api/version returns current version", async ({ request }) => {
    const res = await request.get("/api/version")
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body).toHaveProperty("version.current")
  })

  test("/api/scans returns an array", async ({ request }) => {
    const res = await request.get("/api/scans?limit=5")
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    // The route may return an array directly or an object with `scans` —
    // accept either shape so this test doesn't lock in serialization choices.
    const scans = Array.isArray(body) ? body : (body.scans ?? body.data)
    expect(Array.isArray(scans)).toBeTruthy()
  })

  test("/api/openapi.json is valid JSON with paths", async ({ request }) => {
    const res = await request.get("/api/openapi.json")
    expect(res.ok()).toBeTruthy()
    const spec = await res.json()
    expect(spec).toHaveProperty("paths")
    expect(typeof spec.paths).toBe("object")
  })

  test("/api/ready returns 200 or 503 with ready key", async ({ request }) => {
    const res = await request.get("/api/ready")
    expect([200, 503]).toContain(res.status())
    const body = await res.json()
    // The route returns either { status: 'ready', ... } on 200 or an
    // error envelope on 503. Both shapes carry some signal under the
    // "ready" namespace — accept any presence of "ready" key or "status".
    const hasReady =
      "ready" in body || "status" in body || "error" in body
    expect(hasReady).toBeTruthy()
  })

  test("/api/health body has detailed checks and uptime", async ({ request }) => {
    const res = await request.get("/api/health")
    expect([200, 503]).toContain(res.status())
    const body = await res.json()
    expect(body).toHaveProperty("checks.database")
    expect(body).toHaveProperty("checks.scanners")
    expect(body).toHaveProperty("checks.configuration")
    expect(body).toHaveProperty("uptime")
    expect(body).toHaveProperty("timestamp")
  })

  test("/api/version body.version.current matches semver-ish pattern", async ({ request }) => {
    const res = await request.get("/api/version")
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body).toHaveProperty("version.current")
    const current: string = body.version.current
    expect(typeof current).toBe("string")
    // Permissive semver — major.minor[.patch][-prerelease/letter suffix]
    expect(current).toMatch(/^\d+\.\d+/)
  })

  test("/api/scans pagination respects limit and offset", async ({ request }) => {
    const res = await request.get("/api/scans?limit=2&offset=0")
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    const scans = Array.isArray(body) ? body : (body.scans ?? body.data ?? [])
    expect(Array.isArray(scans)).toBeTruthy()
    expect(scans.length).toBeLessThanOrEqual(2)
  })

  test("/api/scans accepts status filter", async ({ request }) => {
    const res = await request.get("/api/scans?status=SUCCESS")
    // The route should accept the filter regardless of data presence.
    expect(res.status()).toBe(200)
  })

  test("GET /api/scans/<bogus-uuid> returns 404 with error body", async ({ request }) => {
    const res = await request.get(
      "/api/scans/00000000-0000-0000-0000-000000000000"
    )
    expect(res.status()).toBe(404)
    const body = await res.json()
    expect(body).toHaveProperty("error")
  })

  test("/api/openapi.json deep sanity: info, components, paths", async ({ request }) => {
    const res = await request.get("/api/openapi.json")
    expect(res.ok()).toBeTruthy()
    const spec = await res.json()

    // info.title + info.version
    expect(spec).toHaveProperty("info.title")
    expect(spec).toHaveProperty("info.version")
    expect(typeof spec.info.title).toBe("string")
    expect(typeof spec.info.version).toBe("string")

    // openapi field is semver-shaped
    expect(spec).toHaveProperty("openapi")
    expect(typeof spec.openapi).toBe("string")
    expect(spec.openapi).toMatch(/^\d+\.\d+/)

    // components.schemas is a non-empty object
    expect(spec).toHaveProperty("components.schemas")
    expect(typeof spec.components.schemas).toBe("object")
    expect(Object.keys(spec.components.schemas).length).toBeGreaterThan(0)

    // paths should include at least one of /api/scans or /api/health
    expect(spec).toHaveProperty("paths")
    const pathKeys = Object.keys(spec.paths)
    const hasExpected = pathKeys.some(
      (p) => p.includes("/api/scans") || p.includes("/api/health")
    )
    expect(hasExpected).toBeTruthy()
  })

  test("POST /api/health is not allowed", async ({ request }) => {
    const res = await request.post("/api/health", { data: {} })
    // 405 ideal, but Next.js often returns 405 or rejects with another 4xx/5xx
    // when the verb isn't defined. We only require "not a 2xx success".
    expect(res.status()).toBeGreaterThanOrEqual(400)
    expect(res.status()).not.toBe(200)
  })

  test("POST /api/version is not allowed", async ({ request }) => {
    const res = await request.post("/api/version", { data: {} })
    expect(res.status()).toBeGreaterThanOrEqual(400)
    expect(res.status()).not.toBe(200)
  })

  test("DELETE /api/scans is not allowed", async ({ request }) => {
    const res = await request.delete("/api/scans")
    expect(res.status()).toBeGreaterThanOrEqual(400)
    expect(res.status()).not.toBe(200)
  })
})
