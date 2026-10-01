// What the Tests panel shows (Section 7.5), as pure functions of the problem and results.
import type { ProblemPublic } from "@/lib/api/schemas"
import type { TestResult } from "@/lib/runner/types"
import { errorLine, errorSummary } from "@/lib/runner/traceback"
import type { CustomCase } from "@/lib/workspace/storage"

type ProblemTest = ProblemPublic["tests"][number]

export type CaseView =
  | { kind: "visible"; id: string; label: string; test: ProblemTest; result: TestResult | null }
  | { kind: "hidden"; id: string; label: string; test: ProblemTest; result: TestResult }
  | { kind: "custom"; id: string; label: string; custom: CustomCase; result: TestResult | null }

/**
 * Visible tests as "Case 1", "Case 2"...; after a Submit with a hidden failure, only the first
 * failing hidden test ("Hidden case"); then the user's custom cases.
 */
export function buildCases(
  problem: ProblemPublic,
  results: readonly TestResult[] | null,
  customCases: readonly CustomCase[]
): CaseView[] {
  const byId = new Map((results ?? []).map((result) => [result.id, result]))
  const cases: CaseView[] = problem.tests
    .filter((test) => !test.hidden)
    .map((test, index) => ({
      kind: "visible",
      id: test.id,
      label: `Case ${index + 1}`,
      test,
      result: byId.get(test.id) ?? null,
    }))
  const hidden = problem.tests
    .filter((test) => test.hidden)
    .map((test) => ({ test, result: byId.get(test.id) }))
    .find(({ result }) => result !== undefined && result.status !== "pass")
  if (hidden?.result) {
    cases.push({
      kind: "hidden",
      id: hidden.test.id,
      label: "Hidden case",
      test: hidden.test,
      result: hidden.result,
    })
  }
  customCases.forEach((custom, index) => {
    cases.push({
      kind: "custom",
      id: custom.id,
      label: `Custom ${index + 1}`,
      custom,
      result: byId.get(custom.id) ?? null,
    })
  })
  return cases
}

export type SummaryTone = "idle" | "pass" | "solved" | "fail" | "error" | "timeout"

export interface Summary {
  tone: SummaryTone
  title: string
  detail?: string
  /** Editor line of the error, when there is one. */
  line?: number | null
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

/** "Custom 2 raised an error." for custom cases that errored or ran out of time on a Run. */
function customCaseNote(
  results: readonly TestResult[],
  customCases: readonly CustomCase[]
): string | null {
  const byId = new Map(results.map((result) => [result.id, result]))
  const broken = customCases
    .map((custom, index) => ({ label: `Custom ${index + 1}`, result: byId.get(custom.id) }))
    .filter(({ result }) => result?.status === "error" || result?.status === "timeout")
    .map(({ label }) => label)
  if (broken.length === 0) return null
  const names =
    broken.length === 1 ? broken[0] : `${broken.slice(0, -1).join(", ")} and ${broken.at(-1)}`
  return `${names} raised an error.`
}

/** One line on top of the Tests panel: how the last Run or Submit went. */
export function summarize(
  problem: ProblemPublic,
  results: readonly TestResult[] | null,
  kind: "run" | "submit" | null,
  customCases: readonly CustomCase[] = []
): Summary {
  if (!results || !kind) {
    return { tone: "idle", title: "Run your code to check it against the examples." }
  }
  const byId = new Map(results.map((result) => [result.id, result]))
  const tests = problem.tests.filter((test) => kind === "submit" || !test.hidden)
  const own = tests.map((test) => byId.get(test.id)).filter((r): r is TestResult => Boolean(r))
  if (own.length === 0) {
    return { tone: "idle", title: "Run your code to check it against the examples." }
  }

  if (own.some((result) => result.status === "timeout")) {
    return {
      tone: "timeout",
      title: "Time limit exceeded",
      detail:
        "Your code ran for more than 5 seconds. Look for a loop that never ends, or work that grows too fast.",
    }
  }

  // The same error for every test: the code did not load (a syntax error, a missing class).
  const errors = own.filter((result) => result.status === "error")
  if (errors.length === own.length && new Set(errors.map((e) => e.error)).size === 1) {
    const text = errors[0].error ?? ""
    const line = errorLine(text)
    return { tone: "error", title: "Error", detail: errorSummary(text), line }
  }

  const passed = own.filter((result) => result.status === "pass").length
  if (kind === "submit") {
    const hidden = problem.tests.filter((test) => test.hidden)
    const hiddenPassed = hidden.filter((test) => byId.get(test.id)?.status === "pass").length
    if (passed === tests.length) {
      return {
        tone: "solved",
        title: "Solved.",
        detail: `All ${plural(tests.length, "test", "tests")} passed, including ${plural(hidden.length, "hidden one", "hidden ones")}.`,
      }
    }
    return {
      tone: "fail",
      title: "Not quite",
      detail: `${passed} of ${plural(tests.length, "test", "tests")} passed (hidden: ${hiddenPassed} of ${hidden.length}).`,
    }
  }
  const custom = customCaseNote(results, customCases)
  if (passed === tests.length) {
    return {
      tone: "pass",
      title: `All ${plural(tests.length, "case", "cases")} passed`,
      detail: custom
        ? `${custom} Submit to run the hidden tests too.`
        : "Submit to run the hidden tests too.",
    }
  }
  return {
    tone: "fail",
    title: "Not quite",
    detail: `${passed} of ${plural(tests.length, "case", "cases")} passed.${custom ? ` ${custom}` : ""}`,
  }
}

/**
 * The case to show after a run: the first test that did not pass, else the first custom case
 * that raised an error, else the first case.
 */
export function firstInterestingCase(cases: readonly CaseView[]): string | null {
  const failing = cases.find(
    (item) => item.kind !== "custom" && item.result && item.result.status !== "pass"
  )
  const broken = cases.find(
    (item) =>
      item.kind === "custom" &&
      (item.result?.status === "error" || item.result?.status === "timeout")
  )
  return failing?.id ?? broken?.id ?? cases[0]?.id ?? null
}

/**
 * The case to select when new results arrive. A custom case the user is working on stays
 * selected after a Run (they ran it to see its output); otherwise the first interesting one.
 */
export function caseAfterRun(
  cases: readonly CaseView[],
  selectedId: string | null,
  kind: "run" | "submit" | null
): string | null {
  const selected = cases.find((item) => item.id === selectedId)
  if (kind === "run" && selected?.kind === "custom") return selected.id
  return firstInterestingCase(cases)
}
