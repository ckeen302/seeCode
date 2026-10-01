import { readFile } from "node:fs/promises"

import AxeBuilder from "@axe-core/playwright"
import type { Page } from "@playwright/test"

import { expect, test } from "./fixtures"

// M5 and M6 pages (Sections 6.1-6.9): Today, drills, review, roadmap, pattern pages, stats,
// settings and the landing page, signed in and signed out.

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

function collectErrors(page: Page): string[] {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text())
  })
  return errors
}

/** Answers every card of the recognition session on screen, then opens the results. */
async function finishRecognitionSession(page: Page) {
  const progress = page.getByText(/^\d+ \/ \d+$/).first()
  await expect(progress).toBeVisible()
  const total = Number((await progress.textContent())?.split("/")[1])
  for (let card = 1; card <= total; card++) {
    await expect(page.getByText(`${card} / ${total}`).first()).toBeVisible()
    await page.getByText("Hash map and counting", { exact: true }).first().click()
    await page.keyboard.press("Enter")
    const next = page.getByRole("button", { name: card === total ? /See results/ : /Next card/ })
    await expect(next).toBeFocused()
    await page.keyboard.press("Enter")
  }
}

test.describe("Signed in", () => {
  test("a new user's Today, then a full drill, Today with data, Review and Stats", async ({
    page,
  }) => {
    const errors = collectErrors(page)
    await signInAsNewDevUser(page)

    // M6 acceptance: a brand-new user sees the single "Start with your first pattern" card.
    await expect(
      page.getByRole("heading", { name: /^Start with your first pattern: / })
    ).toBeVisible()
    await expect(page.getByRole("link", { name: /Start drill/ })).toHaveCount(0)
    await expectNoSeriousA11yViolations(page)

    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Drills" })
      .click()
    await expect(page.getByRole("heading", { level: 1, name: "Drills" })).toBeVisible()
    await expectNoSeriousA11yViolations(page)
    await page.getByRole("button", { name: /Start drill/ }).click()
    await expect(page).toHaveURL(/\/drills\/session\?mode=recognition$/)
    await expect(page.getByRole("heading", { name: "Your plan" })).toBeVisible()
    await expectNoSeriousA11yViolations(page)

    await finishRecognitionSession(page)
    await expect(page.getByRole("heading", { name: "Accuracy by field" })).toBeVisible()
    const addMissed = page.getByRole("switch", { name: "Add missed to review" })
    if (await addMissed.isVisible()) await expect(addMissed).toHaveAttribute("aria-checked", "true")
    await expectNoSeriousA11yViolations(page)

    // Today now has data: the roadmap problem, a drill suggestion and this week's drills.
    await page.getByRole("link", { name: /Back to Today/ }).click()
    await expect(page.getByRole("heading", { name: "Two Sum" })).toBeVisible()
    await expect(page.getByRole("link", { name: /Start drill/ })).toBeVisible()
    const week = page.getByRole("region", { name: "This week" })
    await expect(week.getByText("Drill cards")).toBeVisible()
    await expect(week.locator("dd").nth(1)).not.toHaveText("0")
    await expectNoSeriousA11yViolations(page)

    // Missed drill cards are due tomorrow, so nothing is due today.
    await page.goto("/review")
    await expect(page.getByRole("heading", { name: "All caught up" })).toBeVisible()
    await expectNoSeriousA11yViolations(page)

    await page.goto("/stats")
    await expect(page.getByRole("heading", { level: 1, name: "Your progress" })).toBeVisible()
    await expect(page.getByRole("img", { name: /median plan time/ })).toBeVisible()
    await expect(page.getByRole("heading", { name: "By pattern" })).toBeVisible()
    await expectNoSeriousA11yViolations(page)

    expect(errors).toEqual([])
  })

  test("drill feedback and the end screen stay accessible in the light theme", async ({ page }) => {
    await signInAsNewDevUser(page)
    await page.evaluate(() => localStorage.setItem("seecode:theme", "light"))
    await page.goto("/drills/session?mode=recognition")
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light")
    await page.getByText("Hash map and counting", { exact: true }).first().click()
    await page.getByRole("button", { name: /Check plan/ }).click()
    await expect(page.getByRole("button", { name: /Next card/ })).toBeFocused()
    await expectNoSeriousA11yViolations(page)
    await page.getByRole("button", { name: /End session/ }).click()
    await expect(page.getByText(/1 card answered/)).toBeVisible()
    await expectNoSeriousA11yViolations(page)
  })

  test("a toolkit drill takes a typed tool and number keys", async ({ page }) => {
    await signInAsNewDevUser(page)
    await page.goto("/drills/session?mode=toolkit")
    await expect(page.getByText("Which Python tool does this call for?")).toBeVisible()
    await page.getByRole("button", { name: "Show options now" }).click()
    await page.getByText("Which Python tool does this call for?").click()
    await page.keyboard.press("1")
    await expect(page.getByText(/^(Right tool\.|Not quite\.)/)).toBeVisible()
    await expectNoSeriousA11yViolations(page)
  })

  test("roadmap and a pattern page show progress, slots and hidden twists", async ({ page }) => {
    await signInAsNewDevUser(page)
    await page.goto("/roadmap")
    const graph = page.getByTestId("roadmap-graph")
    await expect(
      graph.getByRole("link", { name: /^Hash map and counting: Available/ })
    ).toBeVisible()
    await expect(
      graph.getByRole("link", {
        name: /^Two pointers \(opposite ends\): Locked.*Unlocks after you solve 2 problems in Hash map and counting\./,
      })
    ).toBeVisible()
    await expectNoSeriousA11yViolations(page)

    await graph.getByRole("link", { name: /^Hash map and counting/ }).click()
    await expect(page).toHaveURL(/\/patterns\/hashing$/)
    await expect(
      page.getByRole("heading", { level: 1, name: "Hash map and counting" })
    ).toBeVisible()
    await expect(page.getByText("0 of 3 solved")).toBeVisible()
    await expect(page.getByRole("button", { name: /Pick the map/ })).toBeVisible()
    // M6 acceptance: twists stay hidden until the problem is solved.
    await expect(page.getByText("Solve it to see the twist")).toHaveCount(3)
    await expect(page.getByRole("button", { name: /Show twist/ })).toHaveCount(0)
    await expectNoSeriousA11yViolations(page)
  })

  test("settings save a preference and export the data as JSON", async ({ page }) => {
    await signInAsNewDevUser(page)
    await page.goto("/settings")
    const timer = page.getByRole("switch", { name: "Drill timer" })
    await expect(timer).toHaveAttribute("aria-checked", "true")
    await timer.click()
    await expect(page.getByRole("status")).toHaveText("Saved.")
    await page.reload()
    await expect(page.getByRole("switch", { name: "Drill timer" })).toHaveAttribute(
      "aria-checked",
      "false"
    )
    await expectNoSeriousA11yViolations(page)

    const downloading = page.waitForEvent("download")
    await page.getByRole("button", { name: /Export my data/ }).click()
    const download = await downloading
    expect(download.suggestedFilename()).toMatch(/^seecode-export-\d{4}-\d{2}-\d{2}\.json$/)
    const data = JSON.parse(await readFile((await download.path()) as string, "utf8"))
    expect(data.profile.settings).toMatchObject({ drillTimer: false })

    await page.getByRole("button", { name: /Delete account/ }).click()
    const dialog = page.getByRole("alertdialog")
    await expect(dialog.getByRole("button", { name: "Delete forever" })).toBeDisabled()
    await expectNoSeriousA11yViolations(page)
    await dialog.getByRole("button", { name: "Cancel" }).click()
  })

  test("Today works on a phone without sideways scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 })
    await signInAsNewDevUser(page)
    await expect(
      page.getByRole("heading", { name: /^Start with your first pattern/ })
    ).toBeVisible()
    for (const path of ["/today", "/drills", "/review", "/roadmap", "/patterns/stack"]) {
      await page.goto(path)
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible()
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      )
      expect(overflow, path).toBeLessThanOrEqual(0)
    }
  })
})

test.describe("Signed out", () => {
  test("the landing page sells the product with a live demo", async ({ page }) => {
    await page.goto("/")
    const demo = page.getByRole("region", { name: "Live walkthrough of Valid Palindrome" })
    await expect(demo).toBeVisible()
    await expect(page.getByRole("heading", { name: "Pattern + twist" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Plan, then hints" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Review that sticks" })).toBeVisible()
    const pause = demo.getByRole("button", { name: "Pause" })
    if (await pause.isVisible()) {
      await pause.click()
      await expect(demo.getByRole("button", { name: "Play" })).toBeVisible()
    }
    await demo.getByRole("button", { name: "Next step" }).click()
    await expect(page.getByRole("link", { name: /Hash map and counting/ })).toBeVisible()
    await expectNoSeriousA11yViolations(page)
  })

  test("public pages are useful without an account", async ({ page }) => {
    const errors = collectErrors(page)
    await page.goto("/roadmap")
    await expect(page.getByText(/Sign in to track progress/)).toBeVisible()
    await expect(
      page.getByTestId("roadmap-graph").getByRole("link", { name: /^Stack: Available/ })
    ).toBeVisible()
    await expectNoSeriousA11yViolations(page)

    await page.goto("/patterns/two_pointers_opposite")
    await expect(
      page.getByRole("heading", { level: 1, name: "Two pointers (opposite ends)" })
    ).toBeVisible()
    await expect(page.getByRole("link", { name: /^Start/ })).toHaveAttribute("href", /^\/p\//)
    await expectNoSeriousA11yViolations(page)

    await page.goto("/problems")
    await page.getByLabel("Search", { exact: true }).fill("palin")
    await expect(page.getByRole("main").getByRole("link")).toHaveText(["Valid Palindrome"])
    await page.getByRole("button", { name: "Show patterns" }).click()
    await expect(page.getByLabel("Pattern", { exact: true })).toBeVisible()
    await expect(page.getByRole("table").getByText("Two pointers (opposite ends)")).toBeVisible()
    await expectNoSeriousA11yViolations(page)

    await page.goto("/about")
    await expect(page.getByRole("heading", { name: "The learning science" })).toBeVisible()
    await expectNoSeriousA11yViolations(page)

    await page.goto("/stats")
    await expect(page).toHaveURL(/\/login\?next=%2Fstats$/)
    expect(errors).toEqual([])
  })
})
