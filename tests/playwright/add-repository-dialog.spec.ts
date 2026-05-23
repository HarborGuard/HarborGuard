import { test, expect, Page } from "@playwright/test"
import { gotoAndWait, safeClick } from "./helpers"

/**
 * Tests for src/components/dialogs/add-repository-dialog.tsx and the
 * sub-components RegistryTypeSelector + RegistryConfigForm. The dialog
 * has 3 steps (select → configure → test) and 8 registry types with
 * type-conditional fields, so the surface area is large.
 *
 * Selector strategy:
 * - We use `getByRole("dialog", { name: /add repository/i })` instead of
 *   the unnamed `getByRole("dialog")` because the dev server's
 *   Next.js Build Error overlay also renders with role="dialog", which
 *   otherwise triggers strict-mode violations.
 * - Registry-type cards are clicked via `clickTypeCard()` which uses
 *   DOM-level click to dodge the dialog's tall stacked-card layout
 *   (cards near the bottom overflow the 900px viewport even though they
 *   are in the layout tree).
 */

const dialogByName = (page: Page) =>
  page.getByRole("dialog", { name: /add repository/i })

/**
 * Under reduced motion, globals.css forces closed Radix Presence consumers
 * (dialog-content, dialog-overlay, etc) to `display: none`, which Radix
 * Presence treats as its unmount fast-path. So a "closed" dialog may
 * either flip to data-state="closed" *or* be removed from the DOM entirely.
 * Accept either outcome.
 */
async function expectDialogClosed(page: Page) {
  const content = page.locator('[data-slot="dialog-content"]')
  await expect
    .poll(
      async () => {
        const count = await content.count()
        if (count === 0) return "gone"
        return await content.first().getAttribute("data-state")
      },
      { timeout: 10_000 }
    )
    .toMatch(/closed|gone/)
}

async function expectDialogOpen(page: Page) {
  await expect(dialogByName(page)).toBeVisible({ timeout: 20_000 })
  await expect(
    page.locator('[data-slot="dialog-content"]').first()
  ).toHaveAttribute("data-state", "open", { timeout: 10_000 })
}

async function mockRepositoriesEmpty(page: Page) {
  await page.route("**/api/repositories", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [] }),
      })
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

async function clickTypeCard(page: Page, title: string) {
  // Cards are inside a vertically-stacked list that overflows the viewport;
  // bypass Playwright's actionability checks (including viewport visibility)
  // by clicking the corresponding Card element directly through the DOM.
  const ok = await page.evaluate((cardTitle) => {
    const cards = document.querySelectorAll('[data-slot="card"]')
    for (const card of Array.from(cards)) {
      const title = card.querySelector('[data-slot="card-title"]')?.textContent?.trim()
      if (title === cardTitle) {
        ;(card as HTMLElement).click()
        return true
      }
    }
    return false
  }, title)
  expect(ok, `card titled "${title}" should exist`).toBe(true)
}

async function openDialog(page: Page) {
  await mockRepositoriesEmpty(page)
  await gotoAndWait(page, "/repositories")
  await safeClick(page, page.getByRole("button", { name: /add repository/i }).first())
  await expectDialogOpen(page)
}

async function openDialogOn(page: Page, type: string) {
  await openDialog(page)
  await clickTypeCard(page, type)
  // After type selection, the dialog should advance to the configure step.
  // Use the id-based locator to avoid ambiguity with NEXUS's
  // "Repository Name (optional)" and GCR's "Repository Name *" labels.
  await expect(page.locator('[id="name"]')).toBeVisible({ timeout: 15_000 })
}

/**
 * Locator for the Cancel button rendered inside the Add Repository dialog
 * footer. Scoping to the dialog avoids accidentally matching the
 * Radix-rendered hidden "Close" button or any toast-dismiss control.
 */
const dialogCancel = (page: Page) =>
  dialogByName(page).getByRole("button", { name: /^cancel$/i })

test.describe("Add Repository Dialog - Step 1 (Type Selector)", () => {
  test.beforeEach(async ({ page }) => {
    await openDialog(page)
  })

  test("renders all 8 registry type cards", async ({ page }) => {
    const expected = [
      "Docker Hub",
      "GitHub Container Registry",
      "GitLab Container Registry",
      "Gitea / Forgejo",
      "Generic Registry",
      "Sonatype Nexus3",
      "Azure Container Registry",
      "Google Artifact Registry",
    ]
    // Use locator count + a DOM-level read so we don't depend on which cards
    // are inside the viewport.
    const titles: string[] = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-slot="card-title"]')).map(
        (el) => (el.textContent || "").trim()
      )
    )
    for (const label of expected) {
      expect(titles, `${label} should be in the type selector`).toContain(label)
    }
  })

  test("Cancel closes the dialog", async ({ page }) => {
    // With 8 source cards in the type selector + header + footer, the
    // dialog is ~1000px tall — the Cancel button falls below the 900px
    // viewport in CI. Playwright's `force: true` doesn't disable the
    // in-viewport check, and scrolling inside a `fixed`-positioned
    // dialog doesn't bring the button into view either. Dispatch the
    // click event directly: it triggers the same onClick handler React
    // wires to the button regardless of layout position.
    const cancel = dialogCancel(page)
    await expect(cancel).toBeAttached({ timeout: 20_000 })
    await cancel.dispatchEvent("click")
    // Radix keeps the dialog mounted with data-state="closed" when
    // reducedMotion is reduced; assert the state flip rather than visibility.
    await expectDialogClosed(page)
  })
})

test.describe("Add Repository Dialog - DOCKERHUB type", () => {
  test("selecting Docker Hub prefills registryUrl + name and advances to configure", async ({
    page,
  }) => {
    await openDialogOn(page, "Docker Hub")

    await expect(page.getByLabel("Repository Name")).toHaveValue("Docker Hub")
    // Type label is "Docker Hub Username" for DOCKERHUB
    await expect(page.getByLabel("Docker Hub Username")).toBeVisible()
    // No protocol selector for dockerhub
    await expect(dialogByName(page).locator("button[role='combobox']")).toHaveCount(0)
    // No protocol-driven registryUrl input
    await expect(dialogByName(page).locator('[id="registryUrl"]')).toHaveCount(0)
  })

  test("Next button advances to test step (test+add buttons present)", async ({ page }) => {
    await openDialogOn(page, "Docker Hub")
    await safeClick(page, dialogByName(page).getByRole("button", { name: /^next$/i }))
    await expect(
      dialogByName(page).getByRole("button", { name: /test connection/i })
    ).toBeVisible()
    await expect(
      dialogByName(page).getByRole("button", { name: /^add repository$/i })
    ).toBeVisible()
  })

  test("Back returns from configure to select step", async ({ page }) => {
    await openDialogOn(page, "Docker Hub")
    await safeClick(page, dialogByName(page).getByRole("button", { name: /^back$/i }))
    // We should see the type-selector again
    const titles: string[] = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-slot="card-title"]')).map(
        (el) => (el.textContent || "").trim()
      )
    )
    expect(titles).toContain("GitHub Container Registry")
  })

  test("Cancel + reopen resets the dialog to select step", async ({ page }) => {
    await openDialogOn(page, "Docker Hub")
    // Type into name field so we can confirm it's wiped
    await page.locator('[id="name"]').fill("CHANGED")
    await safeClick(page, dialogCancel(page))
    await expectDialogClosed(page)

    // Radix keeps the dialog mounted with data-state="closed" when
    // reducedMotion is reduced, so the Radix-managed overlay still
    // covers the Add Repository button. Reopen via DOM-level click to
    // bypass the overlay's pointer-event interception.
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button")).find(
        (b) => b.textContent?.trim().toLowerCase().includes("add repository")
      )
      ;(btn as HTMLElement | undefined)?.click()
    })
    await expectDialogOpen(page)

    // We should be back on select step - cards visible (via DOM)
    const titles: string[] = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-slot="card-title"]')).map(
        (el) => (el.textContent || "").trim()
      )
    )
    expect(titles).toContain("Docker Hub")
    expect(titles).toContain("Azure Container Registry")
  })
})

test.describe("Add Repository Dialog - GHCR type", () => {
  test("GHCR shows Organization (optional) field and no protocol selector", async ({ page }) => {
    await openDialogOn(page, "GitHub Container Registry")

    await expect(page.getByLabel("Repository Name")).toBeVisible()
    await expect(page.getByLabel("Organization (optional)")).toBeVisible()
    await expect(page.getByLabel("GitHub Username")).toBeVisible()
    // Protocol selector should NOT be there
    await expect(dialogByName(page).locator("button[role='combobox']")).toHaveCount(0)
    // No TLS checkbox
    await expect(page.getByLabel("Skip TLS Verification")).toHaveCount(0)
  })
})

test.describe("Add Repository Dialog - GENERIC type", () => {
  test("Generic shows HTTPS/HTTP protocol selector + Skip TLS Verification", async ({ page }) => {
    await openDialogOn(page, "Generic Registry")

    await expect(dialogByName(page).locator('[id="registryUrl"]')).toBeVisible()
    const protocolTrigger = dialogByName(page).locator("button[role='combobox']").first()
    await expect(protocolTrigger).toContainText(/HTTPS/i)
    await expect(page.getByLabel("Skip TLS Verification")).toBeVisible()
  })

  test("Switching protocol to HTTP hides Skip TLS Verification", async ({ page }) => {
    await openDialogOn(page, "Generic Registry")

    const protocolTrigger = dialogByName(page).locator("button[role='combobox']").first()
    await safeClick(page, protocolTrigger)
    // Select HTTP option from the open Radix Select listbox
    await safeClick(page, page.getByRole("option", { name: /^http$/i }))
    // After switching to HTTP, TLS-skip checkbox vanishes
    await expect(page.getByLabel("Skip TLS Verification")).toHaveCount(0)
  })

  test("Pasting http:// URL flips protocol to HTTP and strips prefix", async ({ page }) => {
    await openDialogOn(page, "Generic Registry")
    const urlInput = dialogByName(page).locator('[id="registryUrl"]')
    await urlInput.fill("http://my-registry.example.com:5000")

    await expect(urlInput).toHaveValue("my-registry.example.com:5000")

    const protocolTrigger = dialogByName(page).locator("button[role='combobox']").first()
    // It will switch to HTTP, which can match both HTTPS and HTTP via /^HTTP$/
    await expect(protocolTrigger).toHaveText(/^HTTP$/i)
  })

  test("Pasting https:// URL strips prefix while keeping HTTPS", async ({ page }) => {
    await openDialogOn(page, "Generic Registry")
    const urlInput = dialogByName(page).locator('[id="registryUrl"]')
    await urlInput.fill("https://my-registry.example.com")

    await expect(urlInput).toHaveValue("my-registry.example.com")

    const protocolTrigger = dialogByName(page).locator("button[role='combobox']").first()
    await expect(protocolTrigger).toContainText(/HTTPS/i)
  })
})

test.describe("Add Repository Dialog - GITLAB type", () => {
  test("GitLab shows protocol selector + Registry Port + JWT Auth URL + Group ID", async ({
    page,
  }) => {
    await openDialogOn(page, "GitLab Container Registry")

    await expect(dialogByName(page).locator('[id="registryUrl"]')).toBeVisible()
    await expect(dialogByName(page).locator('[id="registryPort"]')).toBeVisible()
    await expect(dialogByName(page).locator('[id="authUrl"]')).toBeVisible()
    await expect(dialogByName(page).locator('[id="groupId"]')).toBeVisible()
    // Skip TLS visible at default HTTPS
    await expect(page.getByLabel("Skip TLS Verification")).toBeVisible()
  })
})

test.describe("Add Repository Dialog - GITEA type", () => {
  test("Gitea shows protocol selector + Skip TLS and Package Owner", async ({ page }) => {
    await openDialogOn(page, "Gitea / Forgejo")

    await expect(dialogByName(page).locator('[id="registryUrl"]')).toBeVisible()
    await expect(page.getByLabel("Skip TLS Verification")).toBeVisible()
    // Package Owner uses id="organization"
    await expect(dialogByName(page).locator('[id="organization"]')).toBeVisible()
  })
})

test.describe("Add Repository Dialog - NEXUS type", () => {
  test("Nexus shows Repository Name + Docker Registry Port + protocol + TLS", async ({ page }) => {
    await openDialogOn(page, "Sonatype Nexus3")

    await expect(dialogByName(page).locator('[id="registryUrl"]')).toBeVisible()
    await expect(dialogByName(page).locator('[id="organization"]')).toBeVisible()
    await expect(dialogByName(page).locator('[id="registryPort"]')).toBeVisible()
    await expect(page.getByLabel("Skip TLS Verification")).toBeVisible()
  })
})

test.describe("Add Repository Dialog - ACR type", () => {
  test("ACR strips .azurecr.io suffix on input", async ({ page }) => {
    await openDialogOn(page, "Azure Container Registry")

    const urlInput = dialogByName(page).locator('[id="registryUrl"]')
    await urlInput.fill("myreg.azurecr.io")
    // Display value should have the suffix stripped
    await expect(urlInput).toHaveValue("myreg")

    // No protocol selector for ACR
    await expect(dialogByName(page).locator("button[role='combobox']")).toHaveCount(0)
  })

  test("ACR plain name stays unchanged", async ({ page }) => {
    await openDialogOn(page, "Azure Container Registry")
    const urlInput = dialogByName(page).locator('[id="registryUrl"]')
    await urlInput.fill("plainname")
    await expect(urlInput).toHaveValue("plainname")
  })
})

test.describe("Add Repository Dialog - GCR type", () => {
  test("GCR shows Project ID + Location select + Repository Name + Service Account Key", async ({
    page,
  }) => {
    await openDialogOn(page, "Google Artifact Registry")

    await expect(dialogByName(page).locator('[id="garProjectId"]')).toBeVisible()
    await expect(dialogByName(page).locator('[id="garLocation"]')).toBeVisible()
    await expect(dialogByName(page).locator('[id="garRepositoryName"]')).toBeVisible()
    await expect(dialogByName(page).locator('[id="garServiceAccountKey"]')).toBeVisible()
  })

  test("GCR has no username/password inputs", async ({ page }) => {
    await openDialogOn(page, "Google Artifact Registry")

    // The standard Username + Password inputs are NOT rendered for GCR
    await expect(dialogByName(page).locator('[id="username"]')).toHaveCount(0)
    await expect(dialogByName(page).locator('[id="password"]')).toHaveCount(0)
  })
})

test.describe("Add Repository Dialog - Test Connection / Add Repository flow", () => {
  test("Test Connection button disabled until required fields present (DOCKERHUB)", async ({
    page,
  }) => {
    await openDialogOn(page, "Docker Hub")

    await safeClick(page, dialogByName(page).getByRole("button", { name: /^next$/i }))
    const testBtn = dialogByName(page).getByRole("button", { name: /test connection/i })
    await expect(testBtn).toBeDisabled()

    // Back to configure, fill username/password
    await safeClick(page, dialogByName(page).getByRole("button", { name: /^back$/i }))
    await page.getByLabel("Docker Hub Username").fill("myuser")
    await page.getByLabel("Personal Access Token").fill("mytoken")
    await safeClick(page, dialogByName(page).getByRole("button", { name: /^next$/i }))

    await expect(dialogByName(page).getByRole("button", { name: /test connection/i })).toBeEnabled()
  })

  test("Add Repository button disabled until test succeeds and POSTs with uppercase type + testResult", async ({
    page,
  }) => {
    await openDialogOn(page, "Docker Hub")

    // Fill credentials so Test Connection becomes enabled
    await page.getByLabel("Docker Hub Username").fill("user1")
    await page.getByLabel("Personal Access Token").fill("token1")

    // Mock /api/repositories/test to succeed
    await page.route("**/api/repositories/test", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, repositoryCount: 7 }),
      })
    )

    // Intercept the POST /api/repositories
    let capturedBody: any = null
    await page.route("**/api/repositories", (route) => {
      const req = route.request()
      if (req.method() === "POST") {
        capturedBody = req.postDataJSON()
        return route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ id: "repo-1" }),
        })
      }
      if (req.method() === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: [] }),
        })
      }
      return route.fallback()
    })

    // Advance to test step
    await safeClick(page, dialogByName(page).getByRole("button", { name: /^next$/i }))

    // Add Repository is disabled before testing
    await expect(
      dialogByName(page).getByRole("button", { name: /^add repository$/i })
    ).toBeDisabled()

    // Trigger Test Connection
    await safeClick(page, dialogByName(page).getByRole("button", { name: /test connection/i }))

    // Wait for success
    await expect(page.getByText(/found 7 repositories/i).first()).toBeVisible({ timeout: 10_000 })
    await expect(
      dialogByName(page).getByRole("button", { name: /^add repository$/i })
    ).toBeEnabled()

    // Click Add Repository and verify the request body
    await safeClick(page, dialogByName(page).getByRole("button", { name: /^add repository$/i }))

    // Wait for the POST to be observed
    await expect.poll(() => capturedBody, { timeout: 10_000 }).not.toBeNull()
    expect(capturedBody).toMatchObject({
      type: "DOCKERHUB",
      testResult: {
        success: true,
        repositoryCount: 7,
      },
    })
  })
})
