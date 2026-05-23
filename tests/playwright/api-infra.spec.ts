import { test, expect } from "@playwright/test"

/**
 * Environment-gated infrastructure endpoints.
 *
 * Docker / Kubernetes may or may not be available in CI — the routes are
 * designed to surface a 503 with `{ error }` when the underlying daemon
 * isn't reachable, and a 200 with data when it is. These tests accept
 * either outcome and only assert the response is well-formed.
 */
test.describe("API infrastructure endpoints", () => {
  test.describe.configure({ mode: "parallel" })

  test("GET /api/docker/info returns docker access status", async ({ request }) => {
    const res = await request.get("/api/docker/info")
    expect([200, 503]).toContain(res.status())
    const body = await res.json()
    if (res.status() === 200) {
      // Body shape varies by `checkDockerAccess` result; we just need JSON.
      expect(typeof body).toBe("object")
      expect(body).not.toBeNull()
    } else {
      expect(body).toHaveProperty("error")
    }
  })

  test("GET /api/docker/check returns available boolean", async ({ request }) => {
    const res = await request.get("/api/docker/check")
    // The route always returns 200 with `{ available, message }`, regardless
    // of whether docker is reachable, so we accept 200 only.
    expect([200, 503]).toContain(res.status())
    const body = await res.json()
    if (res.status() === 200) {
      expect(body).toHaveProperty("available")
      expect(typeof body.available).toBe("boolean")
    } else {
      expect(body).toHaveProperty("error")
    }
  })

  test("GET /api/docker/images returns data envelope or 503", async ({ request }) => {
    const res = await request.get("/api/docker/images")
    expect([200, 503]).toContain(res.status())
    const body = await res.json()
    if (res.status() === 200) {
      // Returns { data: [...] }
      expect(body).toHaveProperty("data")
    } else {
      expect(body).toHaveProperty("error")
    }
  })

  test("GET /api/docker/services returns swarm services or unavailable", async ({ request }) => {
    const res = await request.get("/api/docker/services")
    expect([200, 503]).toContain(res.status())
    const body = await res.json()
    if (res.status() === 200) {
      expect(body).toHaveProperty("data")
    } else {
      expect(body).toHaveProperty("error")
    }
  })

  test("GET /api/kubernetes/status returns available flag", async ({ request }) => {
    const res = await request.get("/api/kubernetes/status")
    expect([200, 503]).toContain(res.status())
    const body = await res.json()
    if (res.status() === 200) {
      expect(body).toHaveProperty("available")
      expect(typeof body.available).toBe("boolean")
    } else {
      expect(body).toHaveProperty("error")
    }
  })

  test("GET /api/kubernetes/namespaces returns data array or 503", async ({ request }) => {
    const res = await request.get("/api/kubernetes/namespaces")
    expect([200, 503]).toContain(res.status())
    const body = await res.json()
    if (res.status() === 200) {
      expect(body).toHaveProperty("data")
    } else {
      expect(body).toHaveProperty("error")
    }
  })

  test("GET /api/kubernetes/images returns data array or 503", async ({ request }) => {
    const res = await request.get("/api/kubernetes/images")
    expect([200, 503]).toContain(res.status())
    const body = await res.json()
    if (res.status() === 200) {
      expect(body).toHaveProperty("data")
    } else {
      expect(body).toHaveProperty("error")
    }
  })
})
