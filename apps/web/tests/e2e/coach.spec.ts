import AxeBuilder from "@axe-core/playwright"
import type { Page } from "@playwright/test"

import { expect, test } from "./fixtures"

// M3 acceptance (Section 23): the Plan card, the hint ladder, the wrap-up, resuming an
// attempt, and guest progress imported after sign-in.

const API = "http://localhost:8000/api/v1"

const TWO_SUM = `class Solution:
    def twoSum(self, nums: list[int], target: int) -> list[int]:
        seen = {}
        for i, x in enumerate(nums):
            if target - x in seen:
                return [seen[target - x], i]
            seen[x] = i
        return []
`

const PALINDROME = `class Solution:
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

type MonacoGlobal = {
  editor: { getModels(): { setValue(value: string): void; getValue(): string }[] }
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

async function editorCode(page: Page): Promise<string> {
  return page.evaluate(() =>
    (window as unknown as { monaco: MonacoGlobal }).monaco.editor.getModels()[0].getValue()
  )
}

async function signInAsNewDevUser(page: Page): Promise<string> {
  await page.goto("/login")
  await page.getByRole("button", { name: "New dev user" }).click()
  await expect(page).toHaveURL(/\/today$/)
  const cookie = (await page.context().cookies()).find((c) => c.name === "seecode-dev-user")
  expect(cookie).toBeDefined()
  return decodeURIComponent(cookie!.value)
}

async function expectNoSeriousA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze()
  const serious = results.violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map((v) => `${v.id}: ${v.nodes.map((node) => node.target.join(" ")).join(", ")}`)
  expect(serious).toEqual([])
}

const coach = (page: Page) => page.getByRole("complementary", { name: "Coach" })
const planCard = (page: Page) => coach(page).getByRole("region", { name: "Plan" })
const field = (page: Page, name: string) => planCard(page).locator(`[data-field="${name}"]`)

async function pick(page: Page, label: "Time" | "Space", value: string) {
  await planCard(page).getByRole("combobox", { name: label }).click()
  await page.getByRole("option", { name: value, exact: true }).click()
}

test.describe("Coach", () => {
  test("a signed-in user plans, reloads, solves and sees the wrap-up", async ({ page }) => {
    test.setTimeout(150_000)
    const errors: string[] = []
    page.on("pageerror", (error) => errors.push(error.message))
    await signInAsNewDevUser(page)
    await openWorkspace(page, "two-sum")

    // First problem of its pattern (11.6): the pattern is given, rungs 1 and 2 are open
    // and free, and the signals are marked in the problem.
    await expect(field(page, "pattern")).toContainText("Given")
    await expect(field(page, "pattern")).toContainText("Hash map and counting")
    await expect(coach(page).getByRole("region", { name: "Rung 1, Clarify" })).toBeVisible()
    await expect(coach(page).getByRole("region", { name: "Rung 2, Signals" })).toBeVisible()
    await expect(
      page.getByRole("region", { name: "Problem" }).locator("mark").first()
    ).toBeVisible()
    await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toHaveText(
      /^Problems\s*·\s*Two Sum$/
    )

    // The plan: space is off on purpose; ⌘↵ in the card checks it.
    await planCard(page).getByRole("button", { name: "Hash map (dict)" }).click()
    await pick(page, "Time", "O(n)")
    await pick(page, "Space", "O(1)")
    const twist = planCard(page).getByRole("textbox", { name: "Twist" })
    await twist.fill("look up the complement of each number in a dict")
    await twist.press("ControlOrMeta+Enter")
    await expect(field(page, "pattern")).toContainText("Correct")
    await expect(field(page, "time")).toContainText("Correct")
    await expect(field(page, "space")).toContainText("Not quite")
    await expect(field(page, "space")).toContainText("Check the space target in the problem.")
    await expect(page.getByTestId("plan-checks-left")).toHaveText("2 checks left")
    // ⌘↵ in the card checked the plan; it ran no code.
    await expect(page.getByRole("tab", { name: "Case 1, not run yet" })).toBeVisible()

    // Everything comes back after a reload (7.9).
    await setCode(page, `${TWO_SUM}# keep me\n`)
    await page.reload()
    await expect(page.locator('[data-runner-status="ready"]')).toBeVisible({ timeout: 90_000 })
    await page.waitForFunction(
      () => (window as unknown as { monaco?: MonacoGlobal }).monaco?.editor.getModels().length
    )
    expect(await editorCode(page)).toBe(`${TWO_SUM}# keep me\n`)
    await expect(field(page, "space")).toContainText("Not quite")
    await expect(page.getByTestId("plan-checks-left")).toHaveText("2 checks left")
    await expect(coach(page).getByRole("region", { name: "Rung 2, Signals" })).toBeVisible()

    // A clean solve: no counted hints.
    await page.getByRole("button", { name: "Submit", exact: true }).click()
    const wrapUp = page.getByRole("region", { name: "Solved." })
    await expect(wrapUp).toBeVisible()
    await expect(wrapUp).toContainText("Solved on your own.")
    await expect(wrapUp).toContainText("No hints")
    await expect(wrapUp.getByRole("region", { name: "What to remember" })).toContainText(
      "Hash map and counting +"
    )
    await expect(wrapUp).toContainText("We'll bring this back for review in 3 days.")
    await expect(wrapUp.getByRole("link", { name: /^Next: Valid Anagram/ })).toHaveAttribute(
      "href",
      "/p/valid-anagram"
    )
    await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toHaveText(
      /^Problems\s*·\s*Hash map and counting\s*·\s*Two Sum$/
    )
    await expectNoSeriousA11yViolations(page)

    // See it run: the walkthrough tab shows what it will run.
    await wrapUp.getByRole("button", { name: "See it run" }).click()
    await expect(page.getByRole("region", { name: "Step-through walkthrough" })).toBeVisible()
    await expect(page.getByRole("tab", { name: "Walkthrough" })).toBeFocused()
    expect(errors).toEqual([])
  })

  test("hints open in order after a confirm; the third check reveals the plan", async ({
    page,
  }) => {
    test.setTimeout(150_000)
    await signInAsNewDevUser(page)
    await openWorkspace(page, "group-anagrams")
    await expect(field(page, "pattern")).not.toContainText("Given")

    // Only the next rung opens, and only after a confirm (no modal).
    await expect(coach(page).getByRole("button", { name: /^Open Rung 2/ })).toHaveCount(0)
    await coach(page).getByRole("button", { name: "Open Rung 1, Clarify" }).click()
    const confirm = coach(page).getByRole("group", { name: "Confirm opening Clarify" })
    await expect(confirm.getByRole("button", { name: "Open clarify" })).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(coach(page).getByRole("region", { name: "Rung 1, Clarify" })).toBeVisible()
    // ⌘⇧H asks for the next rung; Enter opens it. Signals light up in the problem.
    await page.keyboard.press("ControlOrMeta+Shift+H")
    await page.keyboard.press("Enter")
    await expect(coach(page).getByRole("region", { name: "Rung 2, Signals" })).toBeVisible()
    await expect(
      page.getByRole("region", { name: "Problem" }).locator("mark").first()
    ).toBeVisible()

    // Three checks, then the reference plan.
    await page.keyboard.press("ControlOrMeta+Shift+P")
    await expect(planCard(page).getByRole("button", { name: /^Pattern/ })).toBeFocused()
    await page.keyboard.press("Enter")
    await page.getByRole("combobox", { name: "Filter patterns" }).fill("stack")
    await page.keyboard.press("Enter")
    await pick(page, "Time", "O(n²)")
    const check = planCard(page).getByRole("button", { name: /^Check plan/ })
    await check.click()
    await expect(page.getByTestId("plan-checks-left")).toHaveText("2 checks left")
    await check.click()
    await expect(page.getByTestId("plan-checks-left")).toHaveText("1 check left")
    await check.click()
    const reference = planCard(page).getByRole("region", { name: "Reference plan" })
    await expect(reference).toContainText("Hash map and counting")
    await expect(reference).toContainText("Shown after your third check.")
    await expect(page.getByTestId("plan-checks-left")).toHaveText("Revealed")
    await expect(check).toHaveCount(0)
    // Opened rungs, signal marks, feedback and the reference plan, all accessible.
    await expectNoSeriousA11yViolations(page)

    // Opened rungs survive a reload; then End attempt.
    await page.reload()
    await expect(coach(page).getByRole("region", { name: "Rung 2, Signals" })).toBeVisible({
      timeout: 60_000,
    })
    await expect(planCard(page).getByRole("region", { name: "Reference plan" })).toBeVisible()
    await coach(page).getByRole("button", { name: "Attempt options" }).click()
    await page.getByRole("menuitem", { name: "End attempt" }).click()
    await page
      .getByRole("alertdialog", { name: "End this attempt?" })
      .getByRole("button", { name: "End attempt" })
      .click()
    await expect(coach(page)).toContainText("Attempt ended.")
    await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toHaveText(
      /Hash map and counting/
    )
  })

  test("a guest plans, takes a hint and solves; sign-in saves the progress", async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000)
    await openWorkspace(page, "valid-palindrome")
    await expect(coach(page).getByRole("region", { name: "Save your progress" })).toBeVisible()

    // The first Run before a plan check suggests planning first.
    await page.getByRole("button", { name: "Run", exact: true }).click()
    const tip = coach(page).getByText("Planning first helps it stick. Check your plan?")
    await expect(tip).toBeVisible()
    await coach(page).getByRole("button", { name: "Skip" }).click()
    await expect(tip).toHaveCount(0)

    await planCard(page)
      .getByRole("button", { name: /^Pattern/ })
      .click()
    await page.getByRole("option", { name: "Two pointers (opposite ends)" }).click()
    await planCard(page).getByRole("button", { name: "Array / string" }).click()
    await pick(page, "Time", "O(n)")
    await pick(page, "Space", "O(1)")
    await planCard(page)
      .getByRole("textbox", { name: "Twist" })
      .fill("skip anything that is not alphanumeric and compare in lower case")
    await planCard(page)
      .getByRole("button", { name: /^Check plan/ })
      .click()
    await expect(planCard(page).getByRole("status")).toHaveText(
      "Your plan is on track. Time to code it."
    )

    await coach(page).getByRole("button", { name: "Open Rung 1, Clarify" }).click()
    await coach(page).getByRole("button", { name: "Open clarify" }).click()
    await expect(coach(page).getByRole("region", { name: "Rung 1, Clarify" })).toBeVisible()

    await setCode(page, PALINDROME)
    await page.getByRole("button", { name: "Submit", exact: true }).click()
    const wrapUp = page.getByRole("region", { name: "Solved." })
    await expect(wrapUp).toBeVisible()
    await expect(wrapUp).toContainText("Up to rung 1, Clarify")
    await expect(wrapUp).toContainText("Right first time")
    await expect(wrapUp.getByRole("region", { name: "What to remember" })).toContainText(
      "Two pointers (opposite ends) +"
    )
    await expect(wrapUp.getByRole("link", { name: /Save progress/ })).toBeVisible()
    await expectNoSeriousA11yViolations(page)

    // Sign in: the guest attempt goes to the new account (journey 4.1).
    const userId = await signInAsNewDevUser(page)
    await expect(page.getByText("Saved your progress", { exact: true })).toBeVisible()
    expect(
      await page.evaluate(() => window.localStorage.getItem("seecode:guest:attempts"))
    ).toBeNull()
    const problems = (await (
      await request.get(`${API}/content/problems`, { headers: { "X-Dev-User": userId } })
    ).json()) as { slug: string; status: string | null; bestRung: number | null }[]
    expect(problems.find((problem) => problem.slug === "valid-palindrome")).toMatchObject({
      status: "solved",
      bestRung: 1,
    })
  })
})
