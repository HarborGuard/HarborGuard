import { test, expect, Page } from "@playwright/test"
import { gotoAndWait, safeClick } from "./helpers"

/**
 * Tests for src/app/repositories/page.tsx.
 *
 * The page can be in one of three states:
 *   - loading  (`useEffect` on mount fetches /api/repositories)
 *   - empty    (data: [] returned)
 *   - populated (data: [{ ... }] returned)
 *
 * Where the loading-state assertion is needed we slow the API response with
 * a `setTimeout` inside `route.fulfill`.
 */

type RepoType = "DOCKERHUB" | "GHCR" | "GITLAB" | "GENERIC" | "NEXUS"

interface FakeRepo {
  id: string
  name: string
  type: RepoType
  protocol?: string
  registryUrl: string
  username?: string
  lastTested?: string
  status: "ACTIVE" | "ERROR" | "UNTESTED"
  repositoryCount?: number
}

const repo = (id: string, type: RepoType, overrides: Partial<FakeRepo> = {}): FakeRepo => ({
  id,
  name: `${type}-repo-${id}`,
  type,
  protocol: type === "GENERIC" ? "https" : undefined,
  registryUrl:
    type === "DOCKERHUB"
      ? "docker.io"
      : type === "GHCR"
      ? "ghcr.io"
      : type === "GITLAB"
      ? "registry.gitlab.com"
      : type === "NEXUS"
      ? "nexus.example.com"
      : "registry.example.com",
  username: "user",
  status: "ACTIVE",
  repositoryCount: 3,
  lastTested: new Date("2026-01-01T00:00:00Z").toISOString(),
  ...overrides,
})

async function mockRepoListAndSync(
  page: Page,
  repos: FakeRepo[],
  options: { listDelayMs?: number } = {}
) {
  await page.route("**/api/repositories", (route) => {
    if (route.request().method() === "GET") {
      const respond = () =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: repos }),
        })
      if (options.listDelayMs) {
        setTimeout(respond, options.listDelayMs)
        return
      }
      return respond()
    }
    return route.fallback()
  })
  await page.route("**/api/repositories/sync", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ statuses: {} }),
      })
    }
    return route.fallback()
  })
}

test.describe("Repositories - existing", () => {
  test.beforeEach(async ({ page }) => {
    await gotoAndWait(page, "/repositories")
  })

  test("page renders an Add Repository action", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: /add repository/i }).first()
    ).toBeVisible()
  })

  test("opens the Add Repository dialog", async ({ page }) => {
    await safeClick(page, page.getByRole("button", { name: /add repository/i }).first())
    await expect(page.getByRole("dialog", { name: /add repository/i })).toBeVisible()
  })
})

test.describe("Repositories - empty state", () => {
  test("empty state shows the GitBranch placeholder + secondary Add Repository CTA", async ({
    page,
  }) => {
    await mockRepoListAndSync(page, [])
    await gotoAndWait(page, "/repositories")

    // Empty state copy
    await expect(page.getByText(/no repositories configured/i)).toBeVisible()
    // Two Add Repository buttons: one in header toolbar, one in empty card
    await expect(page.getByRole("button", { name: /add repository/i })).toHaveCount(2)
  })

  test("Sync All button is disabled when there are no repositories", async ({ page }) => {
    await mockRepoListAndSync(page, [])
    await gotoAndWait(page, "/repositories")

    await expect(page.getByRole("button", { name: /sync all/i })).toBeDisabled()
  })
})

test.describe("Repositories - loading state", () => {
  test('"Loading repositories..." text is visible while the API resolves', async ({ page }) => {
    // Delay the response so we can catch the loading text
    await mockRepoListAndSync(page, [], { listDelayMs: 4000 })
    // We can't use gotoAndWait because that waits for the shell - which
    // happens to render in parallel with the loading text, so it's OK.
    await gotoAndWait(page, "/repositories")
    await expect(page.getByText(/loading repositories/i)).toBeVisible({ timeout: 10_000 })
  })
})

test.describe("Repositories - populated grid", () => {
  test("renders one card of each type with a status badge", async ({ page }) => {
    const repos: FakeRepo[] = [
      repo("d1", "DOCKERHUB", { name: "dockerhub-1", status: "ACTIVE" }),
      repo("g1", "GHCR", { name: "ghcr-1", status: "ACTIVE" }),
      repo("l1", "GITLAB", { name: "gitlab-1", status: "ERROR" }),
      repo("x1", "GENERIC", { name: "generic-1", status: "ACTIVE", protocol: "https" }),
      repo("n1", "NEXUS", { name: "nexus-1", status: "UNTESTED" }),
    ]
    await mockRepoListAndSync(page, repos)
    await gotoAndWait(page, "/repositories")

    // Card names
    for (const r of repos) {
      await expect(page.getByText(r.name, { exact: false }).first()).toBeVisible()
    }

    // Status badges - each visible at least once
    await expect(page.getByText(/^active$/i).first()).toBeVisible()
    await expect(page.getByText(/^error$/i).first()).toBeVisible()
    await expect(page.getByText(/^untested$/i).first()).toBeVisible()

    // Sync All becomes enabled with repositories present
    await expect(page.getByRole("button", { name: /sync all/i })).toBeEnabled()
  })

  test("GENERIC repo card prepends protocol:// to displayed URL", async ({ page }) => {
    const repos: FakeRepo[] = [
      repo("x1", "GENERIC", {
        name: "generic-1",
        registryUrl: "registry.example.com",
        protocol: "https",
      }),
    ]
    await mockRepoListAndSync(page, repos)
    await gotoAndWait(page, "/repositories")

    // The card description shows `${protocol}://${registryUrl}` for GENERIC
    await expect(page.getByText("https://registry.example.com")).toBeVisible()
  })

  test("per-card Delete removes the card and intercepts DELETE /api/repositories/:id", async ({
    page,
  }) => {
    const r = repo("del1", "DOCKERHUB", { name: "to-delete" })
    let deleteCalled = false
    await mockRepoListAndSync(page, [r])
    await page.route("**/api/repositories/del1", (route) => {
      if (route.request().method() === "DELETE") {
        deleteCalled = true
        return route.fulfill({ status: 204, body: "" })
      }
      return route.fallback()
    })
    await gotoAndWait(page, "/repositories")

    // Find the card containing "to-delete" and click its delete button (Trash2 icon).
    // The card buttons are: Sync / Test / Delete - delete has no text, only an icon.
    // We scope by the card title.
    const card = page.locator('[data-slot="card"]').filter({ hasText: "to-delete" })
    await expect(card).toBeVisible()

    // Delete button is the third (icon-only) action button
    const actionButtons = card.getByRole("button")
    await safeClick(page, actionButtons.last())

    await expect.poll(() => deleteCalled, { timeout: 5000 }).toBe(true)
    await expect(card).toHaveCount(0)
  })

  test("per-card Sync triggers POST /api/repositories/sync with repositoryId + action", async ({
    page,
  }) => {
    const r = repo("syn1", "DOCKERHUB", { name: "to-sync" })
    let syncBody: any = null
    await mockRepoListAndSync(page, [r])
    await page.route("**/api/repositories/sync", (route) => {
      const req = route.request()
      if (req.method() === "POST") {
        syncBody = req.postDataJSON()
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true }),
        })
      }
      if (req.method() === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ statuses: {} }),
        })
      }
      return route.fallback()
    })
    await gotoAndWait(page, "/repositories")

    const card = page.locator('[data-slot="card"]').filter({ hasText: "to-sync" })
    await safeClick(page, card.getByRole("button", { name: /^sync$/i }))

    await expect.poll(() => syncBody, { timeout: 5000 }).not.toBeNull()
    expect(syncBody).toMatchObject({ repositoryId: "syn1", action: "sync" })
  })

  test("per-card Test → success flips status badge to ACTIVE", async ({ page }) => {
    const r = repo("tst1", "DOCKERHUB", { name: "to-test-ok", status: "UNTESTED" })
    await mockRepoListAndSync(page, [r])
    await page.route("**/api/repositories/tst1/test", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, repositoryCount: 5 }),
      })
    )
    await gotoAndWait(page, "/repositories")

    const card = page.locator('[data-slot="card"]').filter({ hasText: "to-test-ok" })
    // Before clicking, status badge is UNTESTED
    await expect(card.getByText(/untested/i)).toBeVisible()

    await safeClick(page, card.getByRole("button", { name: /^test$/i }))

    // After test success, status badge updates to ACTIVE
    await expect(card.getByText(/^active$/i)).toBeVisible({ timeout: 10_000 })
  })

  test("per-card Test → failure flips status badge to ERROR", async ({ page }) => {
    const r = repo("tst2", "DOCKERHUB", { name: "to-test-fail", status: "UNTESTED" })
    await mockRepoListAndSync(page, [r])
    await page.route("**/api/repositories/tst2/test", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: false, error: "boom" }),
      })
    )
    await gotoAndWait(page, "/repositories")

    const card = page.locator('[data-slot="card"]').filter({ hasText: "to-test-fail" })
    await safeClick(page, card.getByRole("button", { name: /^test$/i }))

    await expect(card.getByText(/^error$/i)).toBeVisible({ timeout: 10_000 })
  })
})
