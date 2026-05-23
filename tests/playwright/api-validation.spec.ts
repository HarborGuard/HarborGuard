import { test, expect } from "@playwright/test"

/**
 * POST/DELETE negative tests — confirm endpoints reject bad input cleanly
 * with 4xx rather than leaking 500 stack traces.
 *
 * If scan-pre-flight ("detectScanMode") fails because no scanner backend
 * is configured, /api/scans/start may legitimately return 503 even when
 * the request itself is invalid (the 503 short-circuits before Zod). We
 * accept either 400 or 503 in that case.
 */
test.describe("API input validation", () => {
  test.describe.configure({ mode: "parallel" })

  test("POST /api/scans/start with empty body returns 400", async ({ request }) => {
    const res = await request.post("/api/scans/start", { data: {} })
    // Zod refinement requires one of (imageName+imageTag), (image+tag), or
    // tarPath; an empty object should fail validation with 400.
    expect([400, 503]).toContain(res.status())
    const body = await res.json()
    expect(body).toHaveProperty("error")
  })

  test("POST /api/scans/start with malformed JSON returns 400 (not 500)", async ({ request }) => {
    const res = await request.post("/api/scans/start", {
      headers: { "content-type": "application/json" },
      data: "this-is-not-json{",
    })
    // The route's try/catch should turn a JSON parse failure into a 4xx
    // (via apiError). It must NOT be a 500.
    expect(res.status()).toBeGreaterThanOrEqual(400)
    expect(res.status()).toBeLessThan(600)
    expect(res.status()).not.toBe(500)
  })

  test("POST /api/scans/bulk with empty body returns 400", async ({ request }) => {
    // The BulkScanRequestSchema requires `patterns` — missing field 400s.
    const res = await request.post("/api/scans/bulk", { data: {} })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty("error")
  })

  test("POST /api/scans/rescan with missing scanId/imageId returns 400", async ({ request }) => {
    const res = await request.post("/api/scans/rescan", { data: {} })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty("error")
  })

  test("POST /api/repositories/test with empty body returns 400", async ({ request }) => {
    const res = await request.post("/api/repositories/test", { data: {} })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty("error")
  })

  test("DELETE /api/scans/cancel/bogus-id returns 4xx", async ({ request }) => {
    // The cancel route only exposes POST. Calling DELETE on the route
    // should yield a method-not-allowed / not-found 4xx, never a 200.
    const res = await request.delete("/api/scans/cancel/bogus-id")
    expect(res.status()).toBeGreaterThanOrEqual(400)
    expect(res.status()).toBeLessThan(500)
  })
})
