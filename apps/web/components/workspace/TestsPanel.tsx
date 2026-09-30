"use client"

import {
  CircleAlertIcon,
  CircleCheckIcon,
  CircleDotIcon,
  CircleXIcon,
  ClockIcon,
  EyeOffIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"
import { useId, useMemo, useState } from "react"

import { useRunnerStatus } from "@/components/workspace/RunnerStatusBadge"
import { Traceback } from "@/components/workspace/Traceback"
import { Button } from "@/components/ui/button"
import type { ProblemPublic } from "@/lib/api/schemas"
import type { TestResult } from "@/lib/runner/types"
import {
  MAX_CUSTOM_CASES,
  argumentNames,
  argumentText,
  parseCustomArgs,
} from "@/lib/workspace/customCases"
import { goToLine } from "@/lib/workspace/editorBridge"
import { formatMs, formatValue } from "@/lib/workspace/format"
import {
  buildCases,
  firstInterestingCase,
  summarize,
  type CaseView,
  type Summary,
} from "@/lib/workspace/results"
import type { CustomCase } from "@/lib/workspace/storage"
import { cn } from "@/lib/utils"
import { useWorkspace, workspaceStore } from "@/stores/workspace"

// ---------------------------------------------------------------- status

const STATUS_TEXT: Record<TestResult["status"], string> = {
  pass: "Passed",
  fail: "Not quite",
  error: "Error",
  timeout: "Time limit exceeded",
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
          </span>
          {summary.detail ? (
            <span className="text-sm text-muted">
              {summary.detail}
              {summary.line ? (
                <>
                  {" "}
                  <button
                    type="button"
                    className="rounded-sm text-accent underline decoration-dotted underline-offset-2 hover:decoration-solid"
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

// ---------------------------------------------------------------- details

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
    </div>
  )
}

function ValueBlock({ children, tone }: { children: React.ReactNode; tone?: "fail" }) {
  return (
    <pre
      className={cn(
        "max-h-40 overflow-auto rounded-md border border-border bg-bg px-3 py-2 font-mono text-sm break-all whitespace-pre-wrap",
        tone === "fail" && "border-l-2 border-l-error"
      )}
    >
      {children}
    </pre>
  )
}

function InputBlock({ names, args }: { names: string[]; args: unknown[] }) {
  return (
    <ValueBlock>
      {args.map((arg, index) => (
        <span key={index} className="block">
          <span className="text-muted">{names[index]} = </span>
          {formatValue(arg)}
        </span>
      ))}
    </ValueBlock>
  )
}

function Stdout({ text }: { text: string | undefined }) {
  const hasOutput = Boolean(text)
  return (
    <details open={hasOutput} className="group">
      <summary className="w-fit cursor-pointer rounded-sm text-xs font-medium text-muted select-none hover:text-text">
        Stdout{hasOutput ? "" : " (nothing printed)"}
      </summary>
      {hasOutput ? (
        <div className="mt-1">
          <ValueBlock>{text}</ValueBlock>
        </div>
      ) : null}
    </details>
  )
}

/** An error's traceback, shown above the input so the line to fix is the first thing seen. */
function ErrorField({ result }: { result: TestResult | null }) {
  if (result?.status !== "error" || !result.error) return null
  return (
    <Field label="Error">
      <Traceback text={result.error} />
    </Field>
  )
}

function ResultFields({ result, showExpected }: { result: TestResult; showExpected: boolean }) {
  if (result.status === "timeout") {
    return (
      <p className="text-sm">
        Stopped after 5 seconds. The code may be stuck in a loop that never ends.
      </p>
    )
  }
  return (
    <>
      {result.status === "error" ? null : (
        <Field label="Output">
          <ValueBlock tone={showExpected && result.status === "fail" ? "fail" : undefined}>
            {formatValue(result.got)}
          </ValueBlock>
        </Field>
      )}
      <Stdout text={result.stdout} />
      {result.ms !== undefined ? (
        <p className="text-xs text-muted">Ran in {formatMs(result.ms)}</p>
      ) : null}
    </>
  )
}

function TestCaseDetail({
  item,
  names,
}: {
  item: Extract<CaseView, { kind: "visible" | "hidden" }>
  names: string[]
}) {
  return (
    <div className="flex flex-col gap-3">
      {item.kind === "hidden" ? (
        <p className="text-sm text-muted">
          One of the hidden tests did not pass. Here is its input, so you can find the bug.
        </p>
      ) : null}
      <ErrorField result={item.result} />
      <Field label="Input">
        <InputBlock names={names} args={item.test.args} />
      </Field>
      <Field label="Expected">
        <ValueBlock>{formatValue(item.test.expected)}</ValueBlock>
      </Field>
      {item.result ? <ResultFields result={item.result} showExpected /> : null}
    </div>
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

  function change(index: number, value: string) {
    const next = texts.map((text, i) => (i === index ? value : text))
    setTexts(next)
    const result = parseCustomArgs(next)
    if (result.ok) workspaceStore.getState().updateCustomCase(item.id, result.args)
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
      <ErrorField result={item.result} />
      {item.result ? <ResultFields result={item.result} showExpected={false} /> : null}
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

function argsForNewCase(
  selected: CaseView | undefined,
  problem: ProblemPublic,
  names: string[]
): unknown[] {
  if (selected?.kind === "custom") return selected.custom.args
  if (selected) return selected.test.args
  const first = problem.tests.find((test) => !test.hidden)
  return first?.args ?? names.map(() => null)
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
  runError: string | null
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
  const cases = useMemo(
    () => buildCases(problem, results, customCases),
    [problem, results, customCases]
  )
  // Results on mount (e.g. back from another tab) open on their first case that did not pass.
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    results ? firstInterestingCase(cases) : null
  )
  const [shownResults, setShownResults] = useState(results)
  const summary = summarize(problem, results, resultsKind)
  const firstArgs = problem.tests.find((test) => !test.hidden)?.args ?? []
  const names = argumentNames(problem.starterCode, problem.entry, firstArgs.length)
  const tablistId = useId()

  // New results: show the first case that did not pass (state adjusted while rendering).
  if (results !== shownResults) {
    setShownResults(results)
    if (results) setSelectedId(firstInterestingCase(cases))
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
        <div role="alert" className="flex flex-wrap items-center gap-2 text-sm">
          <CircleAlertIcon aria-hidden className="size-4 text-error" />
          <span className="font-semibold">Python couldn&apos;t run your code.</span>
          <span className="text-muted">Check your connection, then try again.</span>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void workspaceStore.getState().run()}
          >
            Try again
          </Button>
        </div>
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
                    : "border-transparent text-muted hover:bg-surface-2 hover:text-text"
                )}
              >
                {item.kind === "hidden" ? <EyeOffIcon aria-hidden className="text-muted" /> : null}
                <CaseStatusIcon item={item} />
                {item.label}
              </button>
            )
          })}
        </div>
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
