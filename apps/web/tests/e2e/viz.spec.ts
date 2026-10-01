import AxeBuilder from "@axe-core/playwright"
import type { Page } from "@playwright/test"

import { cdnViaNode, expect, serveCdnThroughNode, test } from "./fixtures"

// M4 acceptance (Section 23): walkthroughs traced by Pyodide in the browser, played in the
// public gallery (/viz) by a signed-out visitor.

async function expectNoSeriousA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze()
  const serious = results.violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map((v) => `${v.id}: ${v.nodes.map((node) => node.target.join(" ")).join(", ")}`)
  expect(serious).toEqual([])
}

async function openWalkthrough(page: Page, slug: string) {
  await page.goto(`/viz?p=${slug}`)
  await expect(page.getByRole("heading", { name: "Walkthroughs", level: 1 })).toBeVisible()
  // Pyodide loads from the CDN, then the reference solution is traced.
  await expect(page.getByTestId("viz-canvas")).toBeVisible({ timeout: 90_000 })
}

const player = (page: Page) => page.getByTestId("walkthrough-player")
const narration = (page: Page) => page.getByTestId("narration")

test.describe("walkthroughs (M4)", () => {
  test.describe.configure({ timeout: 150_000 })

  test("Valid Palindrome: pointers, skips, compares, predict mode and the mismatch", async ({
    page,
  }) => {
    await openWalkthrough(page, "valid-palindrome")
    await expect(page.getByRole("link", { name: /Valid Palindrome/ })).toHaveAttribute(
      "aria-current",
      "page"
    )
    // Predict mode is on for the first walkthrough of a problem.
    await expect(page.getByRole("switch", { name: "Predict mode" })).toHaveAttribute(
      "aria-checked",
      "true"
    )
    await player(page).focus()
    await page.keyboard.press("ArrowRight")
    await expect(page.getByTestId("predict-banner")).toContainText("Where will r point next?")
    await expect(narration(page)).toContainText("not a letter or digit, so r steps past it")
    // The cells are buttons while an index question waits.
    await expect(
      page.getByRole("button", { name: "Pick index 0, value 'T', pointer l" })
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Pick index 8, value '!', pointer r" })
    ).toBeVisible()
    await page.getByRole("button", { name: /^Pick index 7,/ }).click()
    await expect(page.getByTestId("predict-feedback")).toHaveAttribute("data-correct", "true")
    // The next question comes on its own after a right answer.
    await expect(page.getByTestId("predict-banner")).toContainText("count as a match", {
      timeout: 5_000,
    })
    await page.getByRole("button", { name: "Yes" }).click()
    await expect(page.getByTestId("predict-feedback")).toHaveAttribute("data-correct", "true")
    await expect(narration(page)).toContainText("Both count, so compare them")
    await expectNoSeriousA11yViolations(page)

    // Example 2 ends on a mismatch, narrated, with its marker on the timeline.
    await page.getByRole("switch", { name: "Predict mode" }).click()
    await player(page)
      .getByLabel("Input", { exact: true })
      .selectOption({ label: 'Example 2: "Top 2 spot"' })
    await expect(page.getByTestId("step-counter")).toHaveText(/^1 \/ \d+$/)
    await player(page).focus()
    await page.keyboard.press("End")
    await expect(narration(page)).toContainText("differ, so s is not a palindrome")
    await expect(page.getByRole("slider", { name: "Step" })).toHaveAttribute(
      "aria-valuetext",
      /^Step (\d+) of \1$/
    )
  })

  test("Binary Search dims the eliminated half and marks mid", async ({ page }) => {
    await openWalkthrough(page, "binary-search")
    await page.getByRole("switch", { name: "Predict mode" }).click()
    await player(page).focus()
    // check, go right, check: the left half is ruled out.
    for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight")
    await expect(narration(page)).toContainText("The middle is")
    const nums = page.getByRole("list", { name: /^nums, 7 items/ })
    await expect(nums.getByRole("listitem", { name: /ruled out/ })).toHaveCount(4)
    await expect(nums.getByRole("listitem", { name: /the middle/ })).toHaveCount(1)
    await expectNoSeriousA11yViolations(page)
  })

  test("plays on its own and respects reduced motion", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" })
    if (cdnViaNode()) await serveCdnThroughNode(context)
    const page = await context.newPage()
    try {
      await openWalkthrough(page, "min-stack")
      await expect(player(page)).toHaveAttribute("data-reduced-motion", "true")
      await page.getByRole("switch", { name: "Predict mode" }).click()
      await page.getByRole("button", { name: "2×" }).click()
      await page.getByTestId("play").click()
      await expect(page.getByRole("list", { name: /^vals, a stack of 3 items/ })).toBeVisible({
        timeout: 15_000,
      })
      await expect(page.getByRole("list", { name: /^mins, a stack of/ })).toBeVisible()
    } finally {
      await context.close()
    }
  })
})
