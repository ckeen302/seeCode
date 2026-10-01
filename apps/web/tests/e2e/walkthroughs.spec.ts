import AxeBuilder from "@axe-core/playwright"
import type { Page } from "@playwright/test"

import { expect, test } from "./fixtures"

// The walkthrough player across the app: Trace my code in the Workspace (7.7), a pattern
// page's demo (6.4), the sidebar's Walkthroughs link and /viz's preselection, and the
// Settings → Code editor preferences reaching the Workspace editor (6.9).

type MonacoGlobal = {
  editor: {
    getModels(): { setValue(value: string): void; getValue(): string }[]
    getEditors(): { getOption(id: number): unknown }[]
    EditorOption: { fontSize: number; accessibilitySupport: number }
  }
}

const LEARNER_PALINDROME = `class Solution:
    def isPalindrome(self, s: str) -> bool:
        left, right = 0, len(s) - 1
        while left < right:
            if not s[left].isalnum():
                left += 1
            elif not s[right].isalnum():
                right -= 1
            elif s[left].lower() != s[right].lower():
                return False
            else:
                left += 1
                right -= 1
        return True
`

async function expectNoSeriousA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze()
  const serious = results.violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map((v) => `${v.id}: ${v.nodes.map((node) => node.target.join(" ")).join(", ")}`)
  expect(serious).toEqual([])
}

async function openWorkspace(page: Page, slug: string) {
  await page.goto(`/p/${slug}`)
  await expect(page.locator('[data-runner-status="ready"]')).toBeVisible({ timeout: 90_000 })
  await page.waitForFunction(
    () =>
      ((window as unknown as { monaco?: MonacoGlobal }).monaco?.editor.getModels().length ?? 0) > 0
  )
}

async function setCode(page: Page, code: string) {
  await page.evaluate((value) => {
    ;(window as unknown as { monaco: MonacoGlobal }).monaco.editor.getModels()[0].setValue(value)
  }, code)
}

async function signInAsNewDevUser(page: Page) {
  await page.goto("/login")
  await page.getByRole("button", { name: "New dev user" }).click()
  await expect(page).toHaveURL(/\/today$/)
}

test.describe("walkthrough player in the app", () => {
  test.describe.configure({ timeout: 150_000 })

  test("Trace my code traces the learner's own Valid Palindrome before any hint", async ({
    page,
  }) => {
    await openWorkspace(page, "valid-palindrome")
    await setCode(page, LEARNER_PALINDROME)
    await page.getByRole("tab", { name: /Trace/ }).click()
    const player = page.getByRole("region", { name: "Trace my code" })
    await expect(player.getByTestId("viz-canvas")).toBeVisible({ timeout: 60_000 })
    // The learner's code, not the reference solution, with its own variable names.
    await expect(player).toContainText("left, right = 0, len(s) - 1")
    await expect(player.getByRole("switch", { name: "Predict mode" })).toHaveCount(0)
    await player.focus()
    await page.keyboard.press("ArrowRight")
    await page.keyboard.press("ArrowRight")
    await expect(player.getByTestId("narration")).toContainText("is about to run")
    await expect(
      player.getByRole("listitem", { name: "index 0, value 'T', pointer left" })
    ).toBeVisible()
    await expect(
      player.getByRole("listitem", { name: "index 8, value '!', pointer right" })
    ).toBeVisible()
    await page.keyboard.press("End")
    await expect(player.getByTestId("narration")).toContainText("isPalindrome() returns from line")

    // It follows the editor: a bug shows up as the error it raises.
    await setCode(page, LEARNER_PALINDROME.replace("left, right = 0, len(s) - 1", "left = 0"))
    await expect(player.getByTestId("trace-error")).toContainText(
      "Error on line 4: UnboundLocalError",
      {
        timeout: 30_000,
      }
    )
    // No hint was opened to get here.
    await expect(page.getByRole("region", { name: /^Rung \d/ })).toHaveCount(0)
    await expectNoSeriousA11yViolations(page)
  })

  test("a pattern page plays its demo inline", async ({ page }) => {
    await page.goto("/patterns/two_pointers_opposite")
    await expect(
      page.getByRole("heading", { level: 1, name: "Two pointers (opposite ends)" })
    ).toBeVisible()
    await page.getByRole("button", { name: "Watch it run" }).click()
    const player = page.getByTestId("walkthrough-player")
    await expect(player.getByTestId("viz-canvas")).toBeVisible({ timeout: 90_000 })
    await expect(player).toBeFocused()
    // It plays on its own, one step at a time.
    await expect(player.getByTestId("step-counter")).not.toHaveText(/^1 \//, { timeout: 10_000 })
    await expect(player.getByRole("listitem", { name: /pointer l/ })).toBeVisible()
    await player.getByRole("button", { name: "Pause" }).click()
    await expect(player.getByRole("button", { name: /^Play/ })).toBeVisible()
    await expectNoSeriousA11yViolations(page)
  })

  test("the sidebar links to Walkthroughs, and /viz preselects a problem or pattern", async ({
    page,
  }) => {
    await page.goto("/problems")
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Walkthroughs" })
      .click()
    await expect(page).toHaveURL(/\/viz$/)
    await expect(page.getByRole("heading", { name: "Walkthroughs", level: 1 })).toBeVisible()
    await expect(
      page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Walkthroughs" })
    ).toHaveAttribute("aria-current", "page")

    await page.goto("/viz?problem=binary-search")
    await expect(page.getByRole("heading", { name: "Binary Search", level: 2 })).toBeVisible()

    await page.goto("/viz?pattern=binary_search")
    await expect(
      page.getByRole("heading", { name: "Binary search: the template at work", level: 2 })
    ).toBeVisible()
    await expect(page.getByTestId("viz-canvas")).toBeVisible({ timeout: 90_000 })
  })

  test("the editor font size and screen-reader mode from Settings reach the editor", async ({
    page,
  }) => {
    await signInAsNewDevUser(page)
    await page.goto("/settings")
    const saved = () =>
      page.waitForResponse((r) => r.url().endsWith("/me") && r.request().method() === "PATCH")
    let saving = saved()
    await page.getByText("18 px", { exact: true }).click()
    await saving
    saving = saved()
    await page
      .getByRole("group", { name: "Screen reader mode" })
      .getByText("On", { exact: true })
      .click()
    await saving
    await expect(page.getByRole("status")).toHaveText("Saved.")

    await openWorkspace(page, "two-sum")
    await expect(page.getByTestId("code-editor")).toHaveAttribute("data-font-size", "18")
    const options = await page.evaluate(() => {
      const monaco = (window as unknown as { monaco: MonacoGlobal }).monaco
      const editor = monaco.editor.getEditors()[0]
      return {
        fontSize: editor.getOption(monaco.editor.EditorOption.fontSize),
        accessibility: editor.getOption(monaco.editor.EditorOption.accessibilitySupport),
      }
    })
    // Monaco stores accessibilitySupport as an enum: 2 is "enabled" (on).
    expect(options).toEqual({ fontSize: 18, accessibility: 2 })
    await expect(page.locator(".monaco-editor .view-line").first()).toHaveCSS("font-size", "18px")
  })
})
