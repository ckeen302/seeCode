import AxeBuilder from "@axe-core/playwright"
import type { Page } from "@playwright/test"

import { expect, test } from "./fixtures"

// M2 acceptance (Section 23): the Workspace runs Python in the browser (Pyodide from the
// CDN), guests can solve a problem, and the runner recovers from endless loops.

const CORRECT = `class Solution:
    def isPalindrome(self, s: str) -> bool:
        l, r = 0, len(s) - 1
        while l < r:
            while l < r and not s[l].isalnum():
                l += 1
            while l < r and not s[r].isalnum():
                r -= 1
            if s[l].lower() != s[r].lower():
                return False
            l += 1
            r -= 1
        return True
`

// Forgets to skip punctuation and to ignore case.
const WRONG = `class Solution:
    def isPalindrome(self, s: str) -> bool:
        print("checking", s)
        return s == s[::-1]
`

const SYNTAX_ERROR = `class Solution:
    def isPalindrome(self, s: str) -> bool:
        return s ==
`

const ENDLESS = `class Solution:
    def isPalindrome(self, s: str) -> bool:
        while True: pass
`

// Monaco's global API (the loader puts it on window).
type MonacoGlobal = {
  editor: {
    getModels(): { setValue(value: string): void; getValue(): string }[]
    getEditors(): { getPosition(): { lineNumber: number } | null; hasTextFocus(): boolean }[]
  }
}

async function openWorkspace(page: Page, slug = "valid-palindrome") {
  await page.goto(`/p/${slug}`)
  await expect(page.locator('[data-runner-status="ready"]')).toBeVisible({ timeout: 90_000 })
  await page.waitForFunction(
    () =>
      ((window as unknown as { monaco?: MonacoGlobal }).monaco?.editor.getModels().length ?? 0) > 0
  )
}

async function setCode(page: Page, code: string) {
  await page.evaluate((value) => {
    const monaco = (window as unknown as { monaco: MonacoGlobal }).monaco
    monaco.editor.getModels()[0].setValue(value)
  }, code)
}

async function editorCode(page: Page): Promise<string> {
  return page.evaluate(() =>
    (window as unknown as { monaco: MonacoGlobal }).monaco.editor.getModels()[0].getValue()
  )
}

const summary = (page: Page) => page.getByTestId("tests-summary")
const ALL_PASSED = /^All \d+ cases? passed$/
const run = (page: Page) => page.getByRole("button", { name: "Run", exact: true }).click()
const submit = (page: Page) => page.getByRole("button", { name: "Submit", exact: true }).click()

async function expectNoSeriousA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze()
  const serious = results.violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map((v) => `${v.id}: ${v.nodes.map((node) => node.target.join(" ")).join(", ")}`)
  expect(serious).toEqual([])
}

test.describe("Workspace", () => {
  test("a guest solves Valid Palindrome", async ({ page }) => {
    const errors: string[] = []
    page.on("pageerror", (error) => errors.push(error.message))
    await openWorkspace(page)
    await expect(page.getByRole("heading", { level: 1, name: "Valid Palindrome" })).toBeVisible()
    await expect(page).toHaveTitle("Valid Palindrome · SeeCode")
    // The breadcrumb never names the pattern during the attempt.
    const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb" })
    await expect(breadcrumb).toHaveText(/^Problems\s*·\s*Valid Palindrome$/)
    await expect(page.getByRole("link", { name: /Open on LeetCode/ })).toHaveAttribute(
      "target",
      "_blank"
    )

    await setCode(page, CORRECT)
    await run(page)
    await expect(summary(page)).toHaveText(ALL_PASSED)
    await expect(page.getByRole("tab", { name: "Case 1, passed" })).toBeVisible()
    await expect(page.getByRole("tab", { name: /, not quite$/ })).toHaveCount(0)

    await submit(page)
    await expect(summary(page)).toHaveText("Solved.")
    await expect(page.getByRole("heading", { name: "Solved." })).toBeVisible()

    // The attempt is kept in this browser, for guests in seecode:guest:attempts too.
    const attempts = await page.evaluate(() =>
      JSON.parse(window.localStorage.getItem("seecode:guest:attempts") ?? "[]")
    )
    expect(attempts).toEqual([
      expect.objectContaining({ slug: "valid-palindrome", code: CORRECT, solved: true }),
    ])
    await page.reload()
    await expect(page.locator('[data-runner-status="ready"]')).toBeVisible({ timeout: 90_000 })
    await page.waitForFunction(
      () => (window as unknown as { monaco?: MonacoGlobal }).monaco?.editor.getModels().length
    )
    expect(await editorCode(page)).toBe(CORRECT)
    await expect(page.getByRole("heading", { name: "Solved." })).toBeVisible()
    expect(errors).toEqual([])
  })

  test("a wrong solution shows expected next to the actual output", async ({ page }) => {
    await openWorkspace(page)
    await setCode(page, WRONG)
    await run(page)
    await expect(summary(page)).toHaveText("Not quite")
    await expect(page.getByText(/^\d+ of \d+ cases passed\.$/)).toBeVisible()
    // The first case that did not pass opens, with its input, expected value and output.
    const panel = page.getByRole("tabpanel")
    await expect(panel.getByText("Expected", { exact: true })).toBeVisible()
    await expect(panel.getByText("Output", { exact: true })).toBeVisible()
    const [input, expected, output] = await panel.locator("pre").allTextContents()
    expect(input).toMatch(/^s = ".*"$/)
    expect(expected).toBe("true")
    expect(output).toBe("false")
    await expect(panel.getByText(/^checking /)).toBeVisible()
  })

  test("a syntax error shows a traceback that links to the editor line", async ({ page }) => {
    await openWorkspace(page)
    await setCode(page, SYNTAX_ERROR)
    await run(page)
    await expect(summary(page)).toHaveText("Error")
    await expect(page.getByText(/SyntaxError: invalid syntax \(line 3\)/)).toBeVisible()
    await page
      .getByRole("tabpanel")
      .getByRole("button", { name: "Go to line 3 in the editor" })
      .click()
    const position = await page.evaluate(() => {
      const editor = (window as unknown as { monaco: MonacoGlobal }).monaco.editor.getEditors()[0]
      return { line: editor.getPosition()?.lineNumber, focused: editor.hasTextFocus() }
    })
    expect(position).toEqual({ line: 3, focused: true })
  })

  test("an endless loop stops after about 5 s and the next Run works", async ({ page }) => {
    test.setTimeout(120_000)
    await openWorkspace(page)
    await setCode(page, ENDLESS)
    const started = Date.now()
    await run(page)
    await expect(summary(page)).toHaveText("Time limit exceeded", { timeout: 15_000 })
    const elapsed = Date.now() - started
    expect(elapsed).toBeGreaterThanOrEqual(4_900)
    expect(elapsed).toBeLessThan(8_000)
    await expect(page.getByText(/ran for more than 5 seconds/)).toBeVisible()

    await setCode(page, CORRECT)
    await run(page)
    await expect(summary(page)).toHaveText(ALL_PASSED, { timeout: 90_000 })
  })

  test("the first Run after Python is ready finishes within 1 s", async ({ page }) => {
    await openWorkspace(page)
    await setCode(page, CORRECT)
    const started = Date.now()
    await run(page)
    await expect(summary(page)).toHaveText(ALL_PASSED)
    expect(Date.now() - started).toBeLessThan(1_000)
  })

  test("keyboard: ⌘↵ runs from the editor, ⌘⇧↵ submits, ⌘J hides the tests", async ({ page }) => {
    await openWorkspace(page)
    await setCode(page, CORRECT)
    await page.locator(".monaco-editor textarea").first().focus()
    await page.keyboard.press("ControlOrMeta+Enter")
    await expect(summary(page)).toHaveText(ALL_PASSED)
    expect(await editorCode(page)).toBe(CORRECT) // no line inserted by the editor
    await page.keyboard.press("ControlOrMeta+Shift+Enter")
    await expect(summary(page)).toHaveText("Solved.")
    await page.keyboard.press("ControlOrMeta+j")
    await expect(page.getByRole("button", { name: "Show the tests panel" })).toBeVisible()
    await expect(summary(page)).toBeHidden()
    await page.keyboard.press("ControlOrMeta+j")
    await expect(summary(page)).toBeVisible()
  })

  test("custom cases take JSON arguments and show the output", async ({ page }) => {
    await openWorkspace(page)
    await setCode(page, CORRECT)
    await page.getByRole("button", { name: "Add a custom case" }).click()
    const input = page.getByLabel("s =")
    await input.fill("racecar")
    await expect(page.getByText(/Not valid JSON/)).toBeVisible()
    await input.fill('"Never odd or even"')
    await run(page)
    await expect(page.getByRole("tab", { name: "Custom 1, ran" })).toBeVisible()
    await page.getByRole("tab", { name: "Custom 1, ran" }).click()
    await expect(page.getByRole("tabpanel").getByText("Output", { exact: true })).toBeVisible()
    await expect(page.getByRole("tabpanel").locator("pre").first()).toHaveText("true")
  })

  test("has no serious accessibility violations", async ({ page }) => {
    await openWorkspace(page)
    await expectNoSeriousA11yViolations(page)
  })

  test("asks for a larger screen below 900 px", async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 900 })
    await page.goto("/p/valid-palindrome")
    await expect(page.getByRole("heading", { name: "Use a larger screen" })).toBeVisible()
    await expect(page.getByRole("link", { name: "Go to drills" })).toHaveAttribute(
      "href",
      "/drills"
    )
  })

  test("an unknown problem says so", async ({ page }) => {
    await page.goto("/p/no-such-problem")
    await expect(page.getByRole("heading", { name: "Problem not found" })).toBeVisible()
  })

  test("signed-in users run and submit the same way (attempt sync is M3)", async ({ page }) => {
    await page.goto("/login")
    await page.getByRole("button", { name: "New dev user" }).click()
    await expect(page).toHaveURL(/\/today$/)
    await openWorkspace(page)
    await expect(page.getByRole("button", { name: /^Account:/ })).toBeVisible()
    await setCode(page, CORRECT)
    await submit(page)
    await expect(summary(page)).toHaveText("Solved.")
    const saved = await page.evaluate(() => ({
      guest: window.localStorage.getItem("seecode:guest:attempts"),
      attempt: JSON.parse(window.localStorage.getItem("seecode:attempt:valid-palindrome") ?? "{}"),
    }))
    expect(saved.guest).toBeNull()
    expect(saved.attempt).toMatchObject({ code: CORRECT, solved: true })
  })
})

test.describe("Problems list and search", () => {
  test("lists every problem in order and opens the Workspace", async ({ page }) => {
    await page.goto("/problems")
    await expect(page.getByRole("heading", { level: 1, name: "Problems" })).toBeVisible()
    const links = page.getByRole("main").getByRole("link")
    await expect(links.first()).toHaveText("Two Sum")
    // Roadmap order (Section 24.2): Two Sum is 1, Valid Palindrome 4, Binary Search 13.
    const titles = await links.allTextContents()
    expect(titles.indexOf("Two Sum")).toBe(0)
    expect(titles.indexOf("Two Sum")).toBeLessThan(titles.indexOf("Valid Palindrome"))
    expect(titles.indexOf("Valid Palindrome")).toBeLessThan(titles.indexOf("Binary Search"))
    await expect(page.getByText("Not started").first()).toBeAttached()
    await expectNoSeriousA11yViolations(page)

    await page.getByRole("link", { name: "Valid Palindrome", exact: true }).click()
    await expect(page).toHaveURL(/\/p\/valid-palindrome$/)
    await expect(page.getByRole("heading", { level: 1, name: "Valid Palindrome" })).toBeVisible()
  })

  test("hovering a problem link starts Python in the background", async ({ page }) => {
    await page.goto("/problems")
    const link = page.getByRole("link", { name: "Two Sum", exact: true })
    await expect(link).toBeVisible()
    expect(page.workers()).toHaveLength(0)
    await link.hover()
    await expect.poll(() => page.workers().length).toBeGreaterThan(0)
  })

  test("⌘K finds a problem by name and opens it", async ({ page }) => {
    await page.goto("/problems")
    await expect(page.getByRole("heading", { level: 1, name: "Problems" })).toBeVisible()
    await page.keyboard.press("ControlOrMeta+k")
    const input = page.getByPlaceholder("Search problems and patterns…")
    await expect(input).toBeFocused()
    await expect(page.getByRole("option", { name: /^Two Sum(?! II)/ })).toBeVisible()
    await expect(page.getByRole("option", { name: /Hash map and counting/ })).toBeVisible()
    await input.fill("palindrome")
    await expect(page.getByRole("option").first()).toHaveText(/Valid Palindrome/)
    await expect(page.getByRole("option", { name: /Two Sum/ })).toHaveCount(0)
    await page.keyboard.press("Enter")
    await expect(page).toHaveURL(/\/p\/valid-palindrome$/)
  })
})
