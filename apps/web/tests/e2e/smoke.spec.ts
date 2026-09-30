import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Page } from "@playwright/test"

// M0 smoke test: health, landing, route gating, dev sign-in, /me, shell, ⌘K, theme.

const API = "http://localhost:8000/api/v1"
const PALETTE_INPUT = "Search problems and patterns…"

async function expectNoSeriousA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze()
  const serious = results.violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map((v) => `${v.id}: ${v.nodes.map((node) => node.target.join(" ")).join(", ")}`)
  expect(serious).toEqual([])
}

async function signInAsNewDevUser(page: Page) {
  await page.goto("/login")
  await page.getByRole("button", { name: "New dev user" }).click()
  await expect(page).toHaveURL(/\/today$/)
}

test("API health is ok and reports the content version", async ({ request }) => {
  const response = await request.get(`${API}/health`)
  expect(response.ok()).toBe(true)
  const body = await response.json()
  expect(body.ok).toBe(true)
  expect(response.headers()["x-content-version"]).toBe(body.contentVersion)
})

test("landing page", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Learn to see the approach, not memorize the answer."
  )
  await expect(page.getByRole("link", { name: "Try a problem" })).toHaveAttribute(
    "href",
    "/p/valid-palindrome"
  )
  await expectNoSeriousA11yViolations(page)
})

test("signed-out browsing of public pages is error-free", async ({ page }) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text())
  })
  await page.goto("/roadmap")
  await expect(page.getByRole("heading", { name: "Roadmap" })).toBeVisible()
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible()
  await page.waitForLoadState("networkidle")
  expect(errors).toEqual([])
})

test("private pages send signed-out visitors to sign in", async ({ page }) => {
  await page.goto("/today")
  await expect(page).toHaveURL(/\/login\?next=%2Ftoday$/)
  await expect(page.getByRole("heading", { name: "Sign in to SeeCode" })).toBeVisible()
  await expectNoSeriousA11yViolations(page)
})

test("dev sign-in reaches Today with the profile from /me", async ({ page }) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text())
  })

  await signInAsNewDevUser(page)
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    /^Good (morning|afternoon|evening), Dev$/
  )
  const nav = page.getByRole("navigation", { name: "Main" })
  await expect(nav.getByRole("link", { name: "Today" })).toHaveAttribute("aria-current", "page")
  await expectNoSeriousA11yViolations(page)

  await page.keyboard.press("ControlOrMeta+k")
  await expect(page.getByPlaceholder(PALETTE_INPUT)).toBeFocused()
  await expect(page.getByText("No results yet.")).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(page.getByPlaceholder(PALETTE_INPUT)).toBeHidden()

  await page.goto("/")
  await expect(page).toHaveURL(/\/today$/)

  await page.getByRole("button", { name: /^Account:/ }).click()
  await page.getByRole("button", { name: "Sign out" }).click()
  await expect(page).toHaveURL(/localhost:3000\/$/)
  await page.goto("/today")
  await expect(page).toHaveURL(/\/login\?next=%2Ftoday$/)

  expect(errors).toEqual([])
})

test("theme choice survives a reload and stays accessible", async ({ page }) => {
  await signInAsNewDevUser(page)
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark")
  await page.getByRole("button", { name: /^Theme: Dark/ }).click()
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light")
  await page.reload()
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light")
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  await expectNoSeriousA11yViolations(page)
})
