"use client"

import {
  CircleAlertIcon,
  CircleCheckIcon,
  CircleDotIcon,
  CircleXIcon,
  ClockIcon,
  EyeOffIcon,
  PlusIcon,
  RotateCwIcon,
  Trash2Icon,
} from "lucide-react"
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react"

import { useRunnerStatus } from "@/components/workspace/RunnerStatusBadge"
import { Traceback } from "@/components/workspace/Traceback"
import { Button } from "@/components/ui/button"
import type { ProblemPublic } from "@/lib/api/schemas"
import type { CompareMode, TestResult } from "@/lib/runner/types"
import {
  MAX_CUSTOM_CASES,
  argumentNames,
  argumentText,
  customArgsTooLarge,
  parseCustomArgs,
} from "@/lib/workspace/customCases"
import { goToLine } from "@/lib/workspace/editorBridge"
import { formatMs, formatValueForDisplay } from "@/lib/workspace/format"
import {
  buildCases,
  caseAfterRun,
  firstInterestingCase,
  summarize,
  type CaseView,
  type Summary,
} from "@/lib/workspace/results"
import type { CustomCase } from "@/lib/workspace/storage"
import { cn } from "@/lib/utils"
import { useWorkspace, workspaceStore, type RunFailure } from "@/stores/workspace"

type ProblemTest = ProblemPublic["tests"][number]

// ---------------------------------------------------------------- status

const STATUS_TEXT: Record<TestResult["status"], string> = {
  pass: "Passed",
  fail: "Not quite",
  error: "Error",
  timeout: "Time limit exceeded",
}

/** How a test compares its answer (Section 9.2), when that is not plain equality. */
export const COMPARE_HINTS: Partial<Record<CompareMode, string>> = {
  unordered: "any order",
  unordered_nested: "any order, inside each list too",
  float: "within 10⁻⁶",
  checker: "any valid answer",
}

function CaseStatusIcon({ item }: { item: CaseView }) {
  const result = item.result
  if (!result) return null
  if (item.kind === "custom") {
    return result.status === "error" || result.status === "timeout" ? (
      <CircleAlertIcon aria-hidden className="text-error" />
    ) : (
      <CircleDotIcon aria-hidden className="text-accent" />
    )
  }
  switch (result.status) {
    case "pass":
      return <CircleCheckIcon aria-hidden className="text-good" />
    case "fail":
      return <CircleXIcon aria-hidden className="text-error" />
    case "error":
      return <CircleAlertIcon aria-hidden className="text-error" />
    case "timeout":
      return <ClockIcon aria-hidden className="text-error" />
  }
}

function caseStatusLabel(item: CaseView): string {
  if (!item.result) return "not run yet"
  if (item.kind === "custom") {
    return item.result.status === "error" || item.result.status === "timeout"
      ? STATUS_TEXT[item.result.status].toLowerCase()
      : "ran"
  }
  return STATUS_TEXT[item.result.status].toLowerCase()
}

// ---------------------------------------------------------------- summary

function SummaryLine({ summary, busy }: { summary: Summary; busy: string | null }) {
  const icon = {
    idle: null,
    pass: <CircleCheckIcon aria-hidden className="size-4 text-good" />,
    solved: <CircleCheckIcon aria-hidden className="size-5 text-good" />,
    fail: <CircleXIcon aria-hidden className="size-4 text-error" />,
    error: <CircleAlertIcon aria-hidden className="size-4 text-error" />,
    timeout: <ClockIcon aria-hidden className="size-4 text-error" />,
  }[summary.tone]

  return (
    <div role="status" aria-live="polite" className="flex min-h-7 flex-wrap items-center gap-x-2">
      {busy ? (
        <span className="inline-flex items-center gap-2 text-sm text-muted">
          <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-accent" />
          {busy}
        </span>
      ) : (
        <>
          {icon}
          <span
            data-testid="tests-summary"
            className={cn(
              "font-semibold",
              summary.tone === "solved" ? "text-lg" : "text-sm",
              summary.tone === "idle" && "font-normal text-muted"
            )}
          >
            {summary.title}
          </span>{" "}
          {summary.detail ? (
            <span className="min-w-0 text-sm wrap-anywhere text-muted">
              {summary.detail}
              {summary.line ? (
                <>
                  {" "}
                  <button
                    type="button"
                    className="rounded-sm whitespace-nowrap text-accent underline decoration-dotted underline-offset-2 hover:decoration-solid"
                    onClick={() => goToLine(summary.line as number)}
                  >
                    Show line {summary.line}
                  </button>
                </>
              ) : null}
            </span>
          ) : null}
        </>
      )}
    </div>
  )
}

const FAILURE_COPY: Record<RunFailure["reason"], { title: string; detail: string }> = {
  load: {
    title: "Python couldn't load.",
    detail: "Check your connection, then try again.",
  },
  crash: {
    title: "Python stopped while running your code.",
    detail: "It may have run out of memory. Try again: Python restarts first.",
  },
  internal: {
    title: "Python couldn't run your code.",
    detail: "Something went wrong inside the test runner. Try again.",
  },
}

function RunFailureNotice({ failure }: { failure: RunFailure }) {
  const copy = FAILURE_COPY[failure.reason]
  const retry = () => {
    const store = workspaceStore.getState()
    void (failure.kind === "submit" ? store.submit() : store.run())
  }
  return (
    <div role="alert" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <CircleAlertIcon aria-hidden className="size-4 shrink-0 text-error" />
      <span className="font-semibold">{copy.title}</span>{" "}
      <span className="text-muted">{copy.detail}</span>{" "}
      <Button size="sm" variant="secondary" className="h-7" onClick={retry}>
        <RotateCwIcon />
        Try again
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------- details

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-medium text-muted">
        {label}
        {hint ? <span className="font-normal"> ({hint})</span> : null}
      </span>
      {children}
    </div>
  )
}

/** Whether an element's content overflows it (so it scrolls). */
function useOverflows(ref: React.RefObject<HTMLElement | null>): boolean {
  const [overflows, setOverflows] = useState(false)
  const check = () => {
    const element = ref.current
    if (!element) return
    setOverflows(
      element.scrollHeight > element.clientHeight + 1 ||
        element.scrollWidth > element.clientWidth + 1
    )
  }
  // After every render (the content may have changed) and whenever the box is resized.
  useLayoutEffect(check)
  useEffect(() => {
    const element = ref.current
    if (!element || typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(() => check())
    observer.observe(element)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `check` reads the ref only
  }, [])
  return overflows
}

/**
 * A value in a box that scrolls past 10 lines. A box that scrolls is a named, focusable
 * region, so keyboard users can scroll it too (Section 18.8).
 */
function ValueBlock({
  children,
  label,
  tone,
}: {
  children: React.ReactNode
  label: string
  tone?: "fail"
}) {
  const ref = useRef<HTMLPreElement>(null)
  const scrolls = useOverflows(ref)
  return (
    <pre
      ref={ref}
      tabIndex={scrolls ? 0 : undefined}
      role={scrolls ? "region" : undefined}
      aria-label={scrolls ? label : undefined}
      className={cn(
        "max-h-40 overflow-auto rounded-md border border-border bg-bg px-3 py-2 font-mono text-sm wrap-anywhere whitespace-pre-wrap",
        tone === "fail" && "border-l-2 border-l-error"
      )}
    >
      {children}
    </pre>
  )
}

/**
 * A JSON value, cut short when it is too long to show (a huge wrong answer). `repr` marks the
 * Python repr of a value JSON cannot hold (nan, an object), shown as is rather than quoted.
 */
function ShownValue({ value, repr = false }: { value: unknown; repr?: boolean }) {
  const { text, truncated } =
    repr && typeof value === "string"
      ? { text: value, truncated: false }
      : formatValueForDisplay(value)
  return (
    <>
      {text}
      {truncated ? <span className="text-muted"> … (too long to show in full)</span> : null}
    </>
  )
}

function InputBlock({ names, args }: { names: string[]; args: unknown[] }) {
  return (
    <ValueBlock label="Input">
      {args.map((arg, index) => (
        <span key={index} className="block">
          <span className="text-muted">{names[index]} = </span>
          <ShownValue value={arg} />
        </span>
      ))}
    </ValueBlock>
  )
}

/** A design call `[name, ...args]` as Python: `MinStack()`, `push(3)`. */
function callText(op: readonly unknown[], first: boolean): string {
  const [name, ...args] = op
  const shown = args.map((arg) => formatValueForDisplay(arg).text).join(", ")
  return `${first ? "" : "."}${String(name)}(${shown})`
}

/**
 * A design problem's test (Section 9.2, docs/PARITY_PLAN.md 4.2): its calls in order, each
 * with the value it should return and, after a run, the value it returned.
 */
function CallsTable({ test, result }: { test: ProblemTest; result: TestResult | null }) {
  const ops = test.ops ?? []
  const expected = Array.isArray(test.expected) ? test.expected : []
  const got = hasOutput(result) && !result.gotRepr && Array.isArray(result.got) ? result.got : null
  return (
    <div className="max-h-64 overflow-auto rounded-md border border-border bg-bg">
      <table className="w-full border-collapse font-mono text-sm">
        <thead className="sticky top-0 bg-surface text-left text-xs font-medium text-muted">
          <tr>
            <th scope="col" className="px-3 py-1.5 font-medium">
              Call
            </th>
            <th scope="col" className="px-3 py-1.5 font-medium">
              Expected
            </th>
            {got ? (
              <th scope="col" className="px-3 py-1.5 font-medium">
                Output
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {ops.map((op, index) => {
            const wrong =
              got !== null && JSON.stringify(got[index]) !== JSON.stringify(expected[index])
            return (
              <tr key={index} className="border-t border-border/60 align-top">
                <td className="px-3 py-1 wrap-anywhere">{callText(op, index === 0)}</td>
                <td className="px-3 py-1 wrap-anywhere">
                  <ShownValue value={expected[index] ?? null} />
                </td>
                {got ? (
                  <td
                    className={cn("px-3 py-1 wrap-anywhere", wrong && "text-error")}
                    aria-label={wrong ? "different from expected" : undefined}
                  >
                    <ShownValue value={got[index] ?? null} />
                  </td>
                ) : null}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** What the code printed: open when there is something, one quiet line when there is not. */
function Stdout({ text }: { text: string | undefined }) {
  if (!text) return <p className="text-xs font-medium text-muted">Stdout: nothing printed</p>
  return (
    <details open className="group">
      <summary className="w-fit cursor-pointer rounded-sm text-xs font-medium text-muted select-none hover:text-text">
        Stdout
      </summary>
      <div className="mt-1">
        <ValueBlock label="Stdout">{text}</ValueBlock>
      </div>
    </details>
  )
}

/** An error's traceback, shown above the input so the line to fix is the first thing seen. */
function ErrorField({ result }: { result: TestResult | null }) {
  if (!result?.error) return null
  // A failed test may carry a reason too (a checker that refused, a result that reuses an
  // input node, an answer too large to compare).
  if (result.status === "fail") {
    return <p className="text-sm wrap-anywhere text-text">{result.error}</p>
  }
  if (result.status !== "error") return null
  return (
    <Field label="Error">
      <Traceback text={result.error} />
    </Field>
  )
}

function TimeoutNote() {
  return (
    <p className="text-sm">
      Stopped after 5 seconds. The code may be stuck in a loop that never ends.
    </p>
  )
}

/** Stdout and timing, under the values. */
function RunDetails({ result }: { result: TestResult }) {
  if (result.status === "timeout") return null
  return (
    <>
      <Stdout text={result.stdout} />
      {result.ms !== undefined ? (
        <p className="text-xs text-muted">Ran in {formatMs(result.ms)}</p>
      ) : null}
    </>
  )
}

/** A result with a returned value to show (not an error or a timeout). */
function hasOutput(result: TestResult | null): result is TestResult {
  return result !== null && (result.status === "pass" || result.status === "fail")
}

function TestCaseDetail({
  item,
  names,
}: {
  item: Extract<CaseView, { kind: "visible" | "hidden" }>
  names: string[]
}) {
  const result = item.result
  const withOutput = hasOutput(result)
  return (
    <div className="flex flex-col gap-3">
      {item.kind === "hidden" ? (
        <p className="text-sm text-muted">
          One of the hidden tests did not pass. Here is its input, so you can find the bug.
        </p>
      ) : null}
      <ErrorField result={result} />
      {item.test.ops ? (
        <Field label="Calls" hint={item.test.compare && COMPARE_HINTS[item.test.compare]}>
          <CallsTable test={item.test} result={result} />
        </Field>
      ) : (
        <>
          <Field label="Input">
            <InputBlock names={names} args={item.test.args ?? []} />
          </Field>
          <ExpectedAndOutput item={item} result={result} withOutput={withOutput} />
        </>
      )}
      {result?.status === "timeout" ? <TimeoutNote /> : null}
      {result ? <RunDetails result={result} /> : null}
    </div>
  )
}

/** Expected and the output side by side when there is room, so they compare at a glance. */
function ExpectedAndOutput({
  item,
  result,
  withOutput,
}: {
  item: Extract<CaseView, { kind: "visible" | "hidden" }>
  result: TestResult | null
  withOutput: boolean
}) {
  return (
    <>
      <div className={cn("grid gap-3", withOutput && "@min-[480px]:grid-cols-2")}>
        <Field label="Expected" hint={item.test.compare && COMPARE_HINTS[item.test.compare]}>
          <ValueBlock label="Expected">
            <ShownValue value={item.test.expected} />
          </ValueBlock>
        </Field>
        {withOutput ? (
          <Field label="Output">
            <ValueBlock label="Output" tone={result?.status === "fail" ? "fail" : undefined}>
              <ShownValue value={result?.got} repr={result?.gotRepr} />
            </ValueBlock>
          </Field>
        ) : null}
      </div>
    </>
  )
}

function CustomCaseDetail({
  item,
  names,
  onRemove,
}: {
  item: Extract<CaseView, { kind: "custom" }>
  names: string[]
  onRemove: () => void
}) {
  const baseId = useId()
  const [texts, setTexts] = useState(() => item.custom.args.map(argumentText))
  const parsed = parseCustomArgs(texts)
  const result = item.result

  function change(index: number, value: string) {
    const next = texts.map((text, i) => (i === index ? value : text))
    setTexts(next)
    const nextParsed = parseCustomArgs(next)
    if (nextParsed.ok) workspaceStore.getState().updateCustomCase(item.id, nextParsed.args)
  }

  return (
    <div className="flex flex-col gap-3">
      <Field label="Input (JSON)">
        <div className="flex flex-col gap-2">
          {names.map((name, index) => {
            const error = parsed.ok ? null : parsed.errors[index]
            const inputId = `${baseId}-${index}`
            return (
              <div key={index} className="flex flex-col gap-1">
                <div className="flex items-start gap-2">
                  <label
                    htmlFor={inputId}
                    className="mt-1.5 min-w-8 shrink-0 font-mono text-sm text-muted"
                  >
                    {name} =
                  </label>
                  <textarea
                    id={inputId}
                    value={texts[index] ?? ""}
                    rows={Math.min(6, Math.max(1, (texts[index] ?? "").split("\n").length))}
                    spellCheck={false}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? `${inputId}-error` : undefined}
                    onChange={(event) => change(index, event.target.value)}
                    className={cn(
                      "min-h-8 w-full resize-y rounded-md border border-border bg-surface-2 px-2 py-1 font-mono text-sm text-text outline-none focus-visible:border-accent",
                      error && "border-error"
                    )}
                  />
                </div>
                {error ? (
                  <p id={`${inputId}-error`} className="pl-10 text-xs text-text">
                    <CircleAlertIcon aria-hidden className="mr-1 inline size-3.5 text-error" />
                    {error}
                  </p>
                ) : null}
              </div>
            )
          })}
          {!parsed.ok && parsed.tooLarge ? (
            <p className="text-xs text-text">
              <CircleAlertIcon aria-hidden className="mr-1 inline size-3.5 text-error" />
              Custom case arguments are limited to 10 KB.
            </p>
          ) : null}
        </div>
      </Field>
      <p className="text-xs text-muted">
        Custom cases show your output only; there is no expected value to compare with yet.
      </p>
      <ErrorField result={result} />
      {hasOutput(result) ? (
        <Field label="Output">
          <ValueBlock label="Output">
            <ShownValue value={result.got} repr={result.gotRepr} />
          </ValueBlock>
        </Field>
      ) : null}
      {result?.status === "timeout" ? <TimeoutNote /> : null}
      {result ? <RunDetails result={result} /> : null}
      <div>
        <Button variant="ghost" size="sm" className="text-muted hover:text-text" onClick={onRemove}>
          <Trash2Icon />
          Remove case
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- panel

const NO_CUSTOM_CASES: CustomCase[] = []

/** Arguments for a new custom case: the selected case's, or the first example's. */
function argsForNewCase(
  selected: CaseView | undefined,
  problem: ProblemPublic,
  names: string[]
): unknown[] {
  const first = problem.tests.find((test) => !test.hidden)?.args ?? names.map(() => null)
  const fromSelected =
    selected?.kind === "custom"
      ? selected.custom.args
      : selected
        ? (selected.test.args ?? first)
        : first
  // A big hidden input may not fit a custom case (10 KB, Section 20): start from an example.
  return customArgsTooLarge(fromSelected) ? first : fromSelected
}

/** Section 7.5: cases with input, expected, output, stdout and status; custom cases. */
export function TestsPanel() {
  const problem = useWorkspace((state) => state.problem)
  const results = useWorkspace((state) => state.results)
  const resultsKind = useWorkspace((state) => state.resultsKind)
  const running = useWorkspace((state) => state.running)
  const runError = useWorkspace((state) => state.runError)
  const customCases = useWorkspace((state) => state.customCases)
  const runnerStatus = useRunnerStatus()

  if (!problem) return null
  return (
    <TestsPanelView
      problem={problem}
      results={results}
      resultsKind={resultsKind}
      running={running}
      runError={runError}
      customCases={customCases}
      pythonLoading={runnerStatus === "loading"}
    />
  )
}

export interface TestsPanelViewProps {
  problem: ProblemPublic
  results: TestResult[] | null
  resultsKind: "run" | "submit" | null
  running: "idle" | "run" | "submit"
  runError: RunFailure | null
  customCases: CustomCase[]
  pythonLoading: boolean
}

export function TestsPanelView({
  problem,
  results,
  resultsKind,
  running,
  runError,
  customCases,
  pythonLoading,
}: TestsPanelViewProps) {
  // Custom cases are argument lists: design problems (lists of calls) have none.
  const design = problem.kind === "design"
  const ownCases = design ? NO_CUSTOM_CASES : customCases
  const cases = useMemo(() => buildCases(problem, results, ownCases), [problem, results, ownCases])
  // Results on mount (e.g. back from another tab) open on their first case that did not pass.
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    results ? firstInterestingCase(cases) : null
  )
  const [shownResults, setShownResults] = useState(results)
  const summary = summarize(problem, results, resultsKind, ownCases)
  const firstArgs = problem.tests.find((test) => !test.hidden)?.args ?? []
  const names = argumentNames(problem.starterCode, problem.entry, firstArgs.length)
  const tablistId = useId()

  // New results: pick the case to show (state adjusted while rendering).
  if (results !== shownResults) {
    setShownResults(results)
    if (results) setSelectedId(caseAfterRun(cases, selectedId, resultsKind))
  }

  const selected = cases.find((item) => item.id === selectedId) ?? cases[0]
  const busy =
    running === "idle"
      ? null
      : pythonLoading
        ? "Loading Python… the first run takes a few seconds."
        : running === "submit"
          ? "Running all tests…"
          : "Running…"

  function addCase() {
    const id = workspaceStore
      .getState()
      .addCustomCase(argsForNewCase(selected, problem, names).map((arg) => structuredClone(arg)))
    if (id) setSelectedId(id)
  }

  function removeCase(id: string) {
    workspaceStore.getState().removeCustomCase(id)
    setSelectedId(null)
  }

  function onTabKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const index = cases.findIndex((item) => item.id === selected?.id)
    const move = { ArrowRight: 1, ArrowLeft: -1 }[event.key]
    let next: number | null =
      move === undefined ? null : (index + move + cases.length) % cases.length
    if (event.key === "Home") next = 0
    if (event.key === "End") next = cases.length - 1
    if (next === null) return
    event.preventDefault()
    setSelectedId(cases[next].id)
    document.getElementById(`${tablistId}-${cases[next].id}`)?.focus()
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto px-4 pt-3 pb-4">
      {runError && running === "idle" ? (
        <RunFailureNotice failure={runError} />
      ) : (
        <SummaryLine summary={summary} busy={busy} />
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <div
          role="tablist"
          aria-label="Test cases"
          className="flex flex-wrap items-center gap-1.5"
          onKeyDown={onTabKeyDown}
        >
          {cases.map((item) => {
            const isSelected = item.id === selected?.id
            return (
              <button
                key={item.id}
                id={`${tablistId}-${item.id}`}
                type="button"
                role="tab"
                aria-selected={isSelected}
                aria-controls={`${tablistId}-panel`}
                tabIndex={isSelected ? 0 : -1}
                aria-label={`${item.label}, ${caseStatusLabel(item)}`}
                onClick={() => setSelectedId(item.id)}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-sm transition-colors [&_svg]:size-3.5",
                  isSelected
                    ? "border-border bg-surface-2 text-text"
                    : "border-transparent text-muted hover:bg-surface-2/50 hover:text-text"
                )}
              >
                {item.kind === "hidden" ? <EyeOffIcon aria-hidden className="text-muted" /> : null}
                <CaseStatusIcon item={item} />
                {item.label}
              </button>
            )
          })}
        </div>
        {design ? null : (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-muted hover:text-text"
            onClick={addCase}
            disabled={customCases.length >= MAX_CUSTOM_CASES}
            aria-label="Add a custom case"
            title={
              customCases.length >= MAX_CUSTOM_CASES
                ? `Up to ${MAX_CUSTOM_CASES} custom cases`
                : "Add a custom case"
            }
          >
            <PlusIcon />
            Case
          </Button>
        )}
      </div>

      {selected ? (
        <div
          id={`${tablistId}-panel`}
          role="tabpanel"
          aria-labelledby={`${tablistId}-${selected.id}`}
          className="min-h-0"
        >
          {selected.kind === "custom" ? (
            <CustomCaseDetail
              key={selected.id}
              item={selected}
              names={argumentNames(problem.starterCode, problem.entry, selected.custom.args.length)}
              onRemove={() => removeCase(selected.id)}
            />
          ) : (
            <TestCaseDetail item={selected} names={names} />
          )}
        </div>
      ) : null}
    </div>
  )
}
