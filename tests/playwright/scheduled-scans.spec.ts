import { test, expect } from "@playwright/test"
import { gotoAndWait } from "./helpers"

const makeScan = (overrides: Partial<Record<string, any>> = {}) => ({
  id: "scan-1",
  name: "Nightly Alpine",
  description: "Nightly Alpine baseline scan",
  schedule: "0 2 * * *",
  enabled: true,
  source: "USER",
  imageSelectionMode: "ALL",
  imagePattern: null,
  selectedImages: [],
  scanHistory: [],
  nextRunAt: "2026-05-23T02:00:00.000Z",
  lastRunAt: "2026-05-22T02:00:00.000Z",
  createdAt: "2026-05-01T00:00:00.000Z",
  _count: { selectedImages: 0, scanHistory: 3 },
  ...overrides,
})

const listResponse = (scans: any[]) => ({
  scheduledScans: scans,
  pagination: {
    total: scans.length,
    limit: 25,
    offset: 0,
    hasMore: false,
  },
})

test.describe("Scheduled Scans", () => {
  test("page loads at /scheduled-scans", async ({ page }) => {
    await gotoAndWait(page, "/scheduled-scans")
    await expect(
      page.getByRole("link", { name: "Scheduled Scans" }).first(),
    ).toBeVisible()
    await expect(page).toHaveURL(/\/scheduled-scans$/)
  })
})

test.describe("Scheduled Scans — mocked", () => {
  test("'New Schedule' button opens create dialog with form fields visible", async ({ page }) => {
    await page.route("**/api/scheduled-scans**", async (route) => {
      // Don't intercept history endpoint.
      if (route.request().url().includes("/scheduled-scans/history")) {
        await route.continue()
        return
      }
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(listResponse([])),
        })
        return
      }
      await route.continue()
    })
    // ScheduleScanForm fetches /api/images for the image picker.
    await page.route("**/api/images**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          images: [],
          pagination: { total: 0, limit: 100, offset: 0, hasMore: false },
        }),
      })
    })

    await gotoAndWait(page, "/scheduled-scans")
    await page
      .getByRole("button", { name: /new schedule/i })
      .click({ force: true })

    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10_000 })
    await expect(
      page.getByText(/create scheduled scan/i).first(),
    ).toBeVisible()
    // Name + schedule inputs are in the form.
    await expect(page.locator("#name")).toBeVisible()
    await expect(page.locator("#schedule")).toBeVisible()
  })

  test("Cancel closes the dialog without firing POST", async ({ page }) => {
    let postFired = false
    await page.route("**/api/scheduled-scans**", async (route) => {
      if (route.request().url().includes("/scheduled-scans/history")) {
        await route.continue()
        return
      }
      const method = route.request().method()
      if (method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(listResponse([])),
        })
        return
      }
      if (method === "POST") {
        postFired = true
      }
      await route.continue()
    })
    await page.route("**/api/images**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          images: [],
          pagination: { total: 0, limit: 100, offset: 0, hasMore: false },
        }),
      })
    })

    await gotoAndWait(page, "/scheduled-scans")
    await page.getByRole("button", { name: /new schedule/i }).click({ force: true })
    await expect(page.getByRole("dialog")).toBeVisible()

    await page.getByRole("button", { name: /^cancel$/i }).click({ force: true })
    // After the reduced-motion globals.css fix, the dialog now unmounts
    // cleanly on close. Accept either data-state="closed" or DOM-removed.
    const dialog = page.getByRole("dialog")
    await expect
      .poll(async () => {
        const count = await dialog.count()
        if (count === 0) return "gone"
        return await dialog.getAttribute("data-state")
      }, { timeout: 10_000 })
      .toMatch(/closed|gone/)
    expect(postFired).toBe(false)
  })

  test("Submit fills minimal valid form, POSTs, asserts toast + dialog closes", async ({ page }) => {
    let postBody: any = null
    await page.route("**/api/scheduled-scans**", async (route) => {
      if (route.request().url().includes("/scheduled-scans/history")) {
        await route.continue()
        return
      }
      const method = route.request().method()
      if (method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(listResponse([])),
        })
        return
      }
      if (method === "POST") {
        postBody = route.request().postDataJSON()
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(makeScan()),
        })
        return
      }
      await route.continue()
    })
    await page.route("**/api/images**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          images: [],
          pagination: { total: 0, limit: 100, offset: 0, hasMore: false },
        }),
      })
    })

    await gotoAndWait(page, "/scheduled-scans")
    await page.getByRole("button", { name: /new schedule/i }).click({ force: true })
    await expect(page.getByRole("dialog")).toBeVisible()

    // Minimal valid form: name + ALL image selection mode.
    await page.locator("#name").fill("CI Test Schedule")
    // The default mode is SPECIFIC which requires images. Switch to ALL.
    await page.locator("#selectionMode").click({ force: true })
    await page.getByRole("option", { name: /^all images$/i }).click({ force: true })

    const postRequest = page.waitForRequest(
      (req) =>
        req.url().endsWith("/api/scheduled-scans") && req.method() === "POST",
    )
    await page
      .getByRole("button", { name: /create schedule/i })
      .click({ force: true })
    await postRequest

    expect(postBody?.name).toBe("CI Test Schedule")
    expect(postBody?.imageSelectionMode).toBe("ALL")

    await expect(
      page.getByText(/scheduled scan created successfully/i).first(),
    ).toBeVisible({ timeout: 10_000 })
    // Dialog unmounts after success (state goes back to no editing scan).
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 10_000 })
  })

  test("Edit pencil opens prefilled dialog", async ({ page }) => {
    const scan = makeScan({ name: "Prefilled Edit" })
    await page.route("**/api/scheduled-scans**", async (route) => {
      if (route.request().url().includes("/scheduled-scans/history")) {
        await route.continue()
        return
      }
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(listResponse([scan])),
        })
        return
      }
      await route.continue()
    })
    await page.route("**/api/images**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          images: [],
          pagination: { total: 0, limit: 100, offset: 0, hasMore: false },
        }),
      })
    })

    await gotoAndWait(page, "/scheduled-scans")
    // Wait for the row to render.
    await expect(page.getByText("Prefilled Edit").first()).toBeVisible({
      timeout: 20_000,
    })

    // The actions column has 4 ghost icon buttons per row: Play, History,
    // Pencil, Trash. We target the Pencil by its position inside the row.
    const row = page.locator("tr", { has: page.getByText("Prefilled Edit") }).first()
    // Within the row's action cluster, find buttons. The Pencil is the 3rd
    // button (index 2).
    await row.locator("button").nth(2).click({ force: true })

    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/edit scheduled scan/i).first()).toBeVisible()
    await expect(page.locator("#name")).toHaveValue("Prefilled Edit")
  })

  test("Delete button calls DELETE /api/scheduled-scans/{id}", async ({ page }) => {
    const scan = makeScan({ id: "del-id-1", name: "ToDelete" })
    let deleteHit = false
    await page.route("**/api/scheduled-scans**", async (route) => {
      const url = route.request().url()
      if (url.includes("/scheduled-scans/history")) {
        await route.continue()
        return
      }
      const method = route.request().method()
      if (method === "GET" && url.endsWith("/api/scheduled-scans")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(listResponse([scan])),
        })
        return
      }
      if (method === "DELETE" && url.endsWith("/api/scheduled-scans/del-id-1")) {
        deleteHit = true
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true }),
        })
        return
      }
      await route.continue()
    })
    await page.route("**/api/images**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          images: [],
          pagination: { total: 0, limit: 100, offset: 0, hasMore: false },
        }),
      })
    })

    await gotoAndWait(page, "/scheduled-scans")
    await expect(page.getByText("ToDelete").first()).toBeVisible({
      timeout: 20_000,
    })

    const deleteRequest = page.waitForRequest(
      (req) =>
        req.url().endsWith("/api/scheduled-scans/del-id-1") &&
        req.method() === "DELETE",
    )

    // Trash icon is the 4th action button (index 3).
    const row = page.locator("tr", { has: page.getByText("ToDelete") }).first()
    await row.locator("button").nth(3).click({ force: true })

    await deleteRequest
    expect(deleteHit).toBe(true)
  })

  test("Enable/disable row toggle PUTs {enabled: false}", async ({ page }) => {
    const scan = makeScan({ id: "toggle-id", name: "ToggleMe", enabled: true })
    let putBody: any = null
    await page.route("**/api/scheduled-scans**", async (route) => {
      const url = route.request().url()
      if (url.includes("/scheduled-scans/history")) {
        await route.continue()
        return
      }
      const method = route.request().method()
      if (method === "GET" && url.endsWith("/api/scheduled-scans")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(listResponse([scan])),
        })
        return
      }
      if (method === "PUT" && url.endsWith("/api/scheduled-scans/toggle-id")) {
        putBody = route.request().postDataJSON()
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ...scan, enabled: false }),
        })
        return
      }
      await route.continue()
    })
    await page.route("**/api/images**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          images: [],
          pagination: { total: 0, limit: 100, offset: 0, hasMore: false },
        }),
      })
    })

    await gotoAndWait(page, "/scheduled-scans")
    await expect(page.getByText("ToggleMe").first()).toBeVisible({
      timeout: 20_000,
    })

    // The enable/disable toggle is in the context menu (right-click) under
    // "Disable". Open the context menu via right-click on the row.
    const row = page.locator("tr", { has: page.getByText("ToggleMe") }).first()
    await row.click({ force: true, button: "right" })

    const putRequest = page.waitForRequest(
      (req) =>
        req.url().endsWith("/api/scheduled-scans/toggle-id") &&
        req.method() === "PUT",
    )
    // The context menu shows "Disable" (because enabled: true).
    await page
      .getByRole("menuitem", { name: /^disable$/i })
      .click({ force: true })
    await putRequest

    expect(putBody?.enabled).toBe(false)
  })

  test("Execute-now button POSTs /{id}/execute", async ({ page }) => {
    const scan = makeScan({ id: "exec-id", name: "ExecuteMe" })
    let executeHit = false
    await page.route("**/api/scheduled-scans**", async (route) => {
      const url = route.request().url()
      if (url.includes("/scheduled-scans/history")) {
        await route.continue()
        return
      }
      const method = route.request().method()
      if (method === "GET" && url.endsWith("/api/scheduled-scans")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(listResponse([scan])),
        })
        return
      }
      if (method === "POST" && url.endsWith("/api/scheduled-scans/exec-id/execute")) {
        executeHit = true
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ message: "started" }),
        })
        return
      }
      await route.continue()
    })
    await page.route("**/api/images**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          images: [],
          pagination: { total: 0, limit: 100, offset: 0, hasMore: false },
        }),
      })
    })

    await gotoAndWait(page, "/scheduled-scans")
    await expect(page.getByText("ExecuteMe").first()).toBeVisible({
      timeout: 20_000,
    })

    const executeRequest = page.waitForRequest(
      (req) =>
        req.url().endsWith("/api/scheduled-scans/exec-id/execute") &&
        req.method() === "POST",
    )
    // Play icon is the 1st action button (index 0).
    const row = page.locator("tr", { has: page.getByText("ExecuteMe") }).first()
    await row.locator("button").nth(0).click({ force: true })
    await executeRequest

    expect(executeHit).toBe(true)
  })

  test("History icon navigates to /scheduled-scans/history?search=<encoded name>", async ({
    page,
  }) => {
    const scan = makeScan({ id: "hist-id", name: "My Special Scan" })
    await page.route("**/api/scheduled-scans**", async (route) => {
      const url = route.request().url()
      if (url.includes("/scheduled-scans/history")) {
        await route.continue()
        return
      }
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(listResponse([scan])),
        })
        return
      }
      await route.continue()
    })
    await page.route("**/api/images**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          images: [],
          pagination: { total: 0, limit: 100, offset: 0, hasMore: false },
        }),
      })
    })
    // Stub history endpoint so navigation lands on a renderable page.
    await page.route("**/api/scheduled-scans/history**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          history: [],
          pagination: { total: 0, limit: 100, offset: 0, hasMore: false },
        }),
      })
    })

    await gotoAndWait(page, "/scheduled-scans")
    await expect(page.getByText("My Special Scan").first()).toBeVisible({
      timeout: 20_000,
    })

    // History icon is the 2nd action button (index 1).
    const row = page.locator("tr", { has: page.getByText("My Special Scan") }).first()
    await row.locator("button").nth(1).click({ force: true })

    await page.waitForURL(
      /\/scheduled-scans\/history\?search=My(\+|%20)Special(\+|%20)Scan/i,
      { timeout: 10_000 },
    )
  })

  test("Empty state when list is []", async ({ page }) => {
    await page.route("**/api/scheduled-scans**", async (route) => {
      if (route.request().url().includes("/scheduled-scans/history")) {
        await route.continue()
        return
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(listResponse([])),
      })
    })

    await gotoAndWait(page, "/scheduled-scans")

    // Page heading visible, table renders default "No results." style empty.
    await expect(
      page.getByRole("heading", { name: /scheduled scans/i }).first(),
    ).toBeVisible({ timeout: 20_000 })
    await expect(
      page.getByText(/no results|no data|no entries|no scheduled scans/i).first(),
    ).toBeVisible({ timeout: 10_000 })
  })
})
