"use client"

// The walkthrough player (Sections 7.6, 7.7 and 8.6). It traces the reference solution (or,
// given `userCode`, the learner's own code: Trace my code) on the selected input in the
// Pyodide worker, then plays the recorded frames: canvas, narration, timeline with event
// markers, controls, code with the current line, variables, and predict mode.
//
// Keyboard (17.4, while the player has focus): ← / → step, Space plays or pauses, Home / End
// jump to the first or last step, Enter continues after a predict answer.
import { useCallback, useEffect, useId, useMemo, useState, useSyncExternalStore } from "react"
import {
  ChevronFirstIcon,
  ChevronLastIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  StepBackIcon,
  StepForwardIcon,
} from "lucide-react"
import { MotionConfig } from "motion/react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Canvas } from "@/components/viz/Canvas"
import { CodeView } from "@/components/viz/CodeView"
import { PredictBanner } from "@/components/viz/PredictBanner"
import {
  PlayerContext,
  usePlayer,
  usePlayerStore,
  useVizReducedMotion,
} from "@/components/viz/shared"
import { Timeline } from "@/components/viz/Timeline"
import { VariablesPanel } from "@/components/viz/VariablesPanel"
import type { WalkthroughPayload } from "@/lib/api/schemas"
import { isTypingTarget } from "@/lib/keyboard"
import { getRunner } from "@/lib/runner/runner"
import type { Runner, RunnerStatus } from "@/lib/runner/types"
import { cn } from "@/lib/utils"
import { normalizeViz, traceRequest } from "@/lib/viz/config"
import { layoutFrame } from "@/lib/viz/layout"
import { intValue } from "@/lib/viz/snap"
import { describeStep, narrationAt, timelineMarkers, type Marker } from "@/lib/viz/timeline"
import { hashText, TraceCache, traceCache, traceKey } from "@/lib/viz/trace"
import type { Prediction, Trace, VizConfig, WalkthroughInput } from "@/lib/viz/types"
import {
  createPlayerStore,
  intervalMs,
  SPEEDS,
  type PlayerStore,
  type Speed,
} from "@/stores/player"

export interface WalkthroughPlayerProps {
  /** Hint rung 5 / See it run (`WalkthroughPayload`): the reference code, viz config, inputs. */
  payload: WalkthroughPayload
  /** Trace my code (7.7): trace this code instead, with the automatic renderers. */
  userCode?: string
  /** More inputs after the payload's examples, e.g. the learner's custom cases (8.6). */
  extraInputs?: WalkthroughInput[]
  /** Called once per predict point with the learner's first answer (for the attempt). */
  onPrediction?: (prediction: Prediction) => void
  /** Start with predict mode on or off; by default it is on for a problem's first walkthrough. */
  predictDefault?: boolean
  /** Tests pass a fake; the app uses the shared Pyodide runner. */
  runner?: Pick<Runner, "trace">
  className?: string
}

const SEEN_KEY = "seecode:walkthrough:seen:"
const USER_CODE_DEBOUNCE_MS = 600
const CORRECT_PAUSE_MS = 1100

type TraceState =
  { kind: "loading" } | { kind: "ready"; trace: Trace } | { kind: "failed"; message: string }

const caches = new WeakMap<object, TraceCache>()
function cacheFor(runner: object | undefined): TraceCache {
  if (!runner) return traceCache
  let cache = caches.get(runner)
  if (!cache) {
    cache = new TraceCache()
    caches.set(runner, cache)
  }
  return cache
}

function readSeen(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1"
  } catch {
    return false
  }
}

function writeSeen(key: string): void {
  try {
    window.localStorage.setItem(key, "1")
  } catch {
    // Storage unavailable: predict mode will be on again next time.
  }
}

/** A short preview of an input for the selector. */
export function inputPreview(input: WalkthroughInput): string {
  if (input.ops) return `${input.ops.length} calls`
  const text = (input.args ?? []).map((arg) => JSON.stringify(arg)).join(", ")
  return text.length > 36 ? `${text.slice(0, 35)}…` : text
}

const noopSubscribe = () => () => {}
function useRunnerStatus(custom: boolean): RunnerStatus | null {
  const runner = custom || typeof window === "undefined" ? null : getRunner()
  return useSyncExternalStore(
    runner?.subscribe ?? noopSubscribe,
    () => runner?.getStatus() ?? null,
    () => null
  )
}

export function WalkthroughPlayer(props: WalkthroughPlayerProps) {
  const { onPrediction } = props
  const [store] = useState<PlayerStore>(() =>
    createPlayerStore({
      predictOn: props.predictDefault ?? false,
      mode: props.userCode !== undefined ? "all" : "key",
    })
  )
  // Each predict point's first answer goes to the attempt (8.6).
  useEffect(() => {
    if (!onPrediction) return
    return store.subscribe((state, before) => {
      if (state.predictions.length > before.predictions.length) {
        onPrediction(state.predictions[state.predictions.length - 1])
      }
    })
  }, [store, onPrediction])
  return (
    <PlayerContext.Provider value={store}>
      <PlayerBody {...props} store={store} />
    </PlayerContext.Provider>
  )
}

function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
  render,
}: {
  label: string
  options: readonly T[]
  value: T
  onChange: (value: T) => void
  render: (value: T) => string
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex h-8 items-center rounded-md border border-border bg-surface-2 p-0.5"
    >
      {options.map((option) => (
        <button
          key={String(option)}
          type="button"
          aria-pressed={option === value}
          onClick={() => onChange(option)}
          className={cn(
            "h-full rounded-[4px] px-2 text-xs font-medium transition-colors",
            option === value ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text"
          )}
        >
          {render(option)}
        </button>
      ))}
    </div>
  )
}

function PlayerBody({
  payload,
  userCode,
  extraInputs,
  predictDefault,
  runner,
  className,
  store,
}: WalkthroughPlayerProps & { store: PlayerStore }) {
  const traceMine = userCode !== undefined
  const scope = useId()
  const reduced = useVizReducedMotion()
  const viz = useMemo(() => normalizeViz(payload.viz), [payload.viz])
  const inputs = useMemo(
    () => [...payload.inputs, ...(extraInputs ?? [])],
    [payload.inputs, extraInputs]
  )
  const [inputIndex, setInputIndex] = useState(0)
  const selected = inputs[Math.min(inputIndex, inputs.length - 1)]
  const runnerStatus = useRunnerStatus(runner !== undefined)

  // Trace my code follows the editor, a moment after typing stops.
  const [settledCode, setSettledCode] = useState(userCode ?? "")
  useEffect(() => {
    if (userCode === undefined) return
    const timer = setTimeout(() => setSettledCode(userCode), USER_CODE_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [userCode])
  const code = traceMine ? settledCode : payload.code

  // Predict mode starts on for the first walkthrough of a problem (7.6).
  useEffect(() => {
    if (traceMine || viz.predict.length === 0) return
    const key = SEEN_KEY + hashText(payload.code)
    if (predictDefault === undefined && !readSeen(key)) store.getState().setPredictOn(true)
    writeSeen(key)
  }, [payload.code, predictDefault, store, traceMine, viz.predict.length])

  // The trace of the selected input; a result belongs to the request key it answered, so a
  // new input, new code or a retry reads as loading until its own answer arrives.
  const [result, setResult] = useState<{ key: string; state: TraceState } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const playerViz: VizConfig | null = traceMine ? null : viz
  const request = useMemo(
    () => (selected ? traceRequest(code, payload, selected, playerViz) : null),
    [code, payload, selected, playerViz]
  )
  const requestKey = request ? `${traceKey(request)}#${attempt}` : ""
  useEffect(() => {
    if (!request) return
    let cancelled = false
    const active = runner ?? getRunner()
    cacheFor(runner)
      .get(request, (req) => active.trace(req))
      .then(
        (trace) => {
          if (cancelled) return
          // The memo answers an equal request with the same trace: keep the current step
          // when a parent re-renders with an equal payload.
          if (store.getState().trace !== trace) store.getState().load(trace, playerViz)
          setResult({ key: requestKey, state: { kind: "ready", trace } })
        },
        (error: unknown) => {
          if (cancelled) return
          const message = error instanceof Error ? error.message : String(error)
          setResult({ key: requestKey, state: { kind: "failed", message } })
        }
      )
    return () => {
      cancelled = true
    }
  }, [request, requestKey, playerViz, runner, store])
  const state: TraceState = result && result.key === requestKey ? result.state : { kind: "loading" }

  // Playback clock: one step every 700 ms / speed (17.3).
  const playing = usePlayer((s) => s.playing)
  const speed = usePlayer((s) => s.speed)
  const index = usePlayer((s) => s.index)
  useEffect(() => {
    if (!playing) return
    const timer = setTimeout(() => store.getState().tick(), intervalMs(speed))
    return () => clearTimeout(timer)
  }, [playing, speed, index, store])

  // A right answer moves on by itself after a moment.
  const feedback = usePlayer((s) => s.feedback)
  useEffect(() => {
    if (!feedback?.correct) return
    const timer = setTimeout(() => store.getState().continueAfterFeedback(), CORRECT_PAUSE_MS)
    return () => clearTimeout(timer)
  }, [feedback, store])

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return
      const target = event.target as HTMLElement
      const onButton = target.closest("button, [role=slider], input[type=range], a")
      const player = store.getState()
      switch (event.key) {
        case "ArrowRight":
          if (target instanceof HTMLInputElement) return // the slider moves itself
          player.step(1)
          break
        case "ArrowLeft":
          if (target instanceof HTMLInputElement) return
          player.step(-1)
          break
        case " ":
          if (onButton) return // a focused button clicks itself
          player.toggle()
          break
        case "Home":
          player.first()
          break
        case "End":
          player.last()
          break
        case "Enter":
          if (onButton || !player.feedback) return
          player.continueAfterFeedback()
          break
        default:
          return
      }
      event.preventDefault()
    },
    [store]
  )

  return (
    <MotionConfig reducedMotion={reduced ? "always" : "never"}>
      <section
        aria-label={traceMine ? "Trace my code" : "Walkthrough"}
        className={cn("@container flex min-w-0 flex-col gap-3", className)}
        onKeyDown={onKeyDown}
        data-testid="walkthrough-player"
      >
        <Toolbar
          inputs={inputs}
          inputIndex={Math.min(inputIndex, inputs.length - 1)}
          onInput={setInputIndex}
          traceMine={traceMine}
          hasPredict={!traceMine && viz.predict.length > 0}
        />
        {state.kind === "loading" ? (
          <div className="flex flex-col gap-3" role="status" data-testid="walkthrough-loading">
            <div className="flex min-h-40 flex-col justify-center gap-3 rounded-lg border border-border bg-bg p-4">
              <div className="flex gap-1">
                {Array.from({ length: 8 }, (_, i) => (
                  <Skeleton key={i} className="size-10" />
                ))}
              </div>
              <Skeleton className="h-4 w-24" />
            </div>
            <p className="text-sm text-muted">
              {runnerStatus === "loading"
                ? "Loading Python (the first time takes a few seconds)…"
                : "Running the code step by step…"}
            </p>
          </div>
        ) : state.kind === "failed" ? (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-3 rounded-lg border border-error/50 bg-bg p-4 text-sm"
          >
            <span className="min-w-0 flex-1 text-text">
              Could not trace the code: {state.message}
            </span>
            <Button size="sm" variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
              <RotateCcwIcon /> Try again
            </Button>
          </div>
        ) : (
          <Stage
            trace={state.trace}
            viz={playerViz}
            code={code}
            scope={scope}
            reduced={reduced}
            traceMine={traceMine}
          />
        )}
      </section>
    </MotionConfig>
  )
}

function Toolbar({
  inputs,
  inputIndex,
  onInput,
  traceMine,
  hasPredict,
}: {
  inputs: WalkthroughInput[]
  inputIndex: number
  onInput: (index: number) => void
  traceMine: boolean
  hasPredict: boolean
}) {
  const store = usePlayerStore()
  const speed = usePlayer((s) => s.speed)
  const mode = usePlayer((s) => s.mode)
  const predictOn = usePlayer((s) => s.predictOn)
  const hasMoments = usePlayer((s) => s.moments.length > 0)
  const selectId = useId()
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="flex min-w-0 items-center gap-2">
        <label htmlFor={selectId} className="text-xs font-medium text-muted">
          Input
        </label>
        <select
          id={selectId}
          value={inputIndex}
          onChange={(event) => onInput(Number(event.currentTarget.value))}
          className="h-8 max-w-64 min-w-0 truncate rounded-md border border-border bg-surface-2 px-2 text-sm text-text"
        >
          {inputs.map((input, i) => (
            <option key={i} value={i}>
              {input.label}: {inputPreview(input)}
            </option>
          ))}
        </select>
      </div>
      {hasMoments ? (
        <Segmented
          label="Playback"
          options={["key", "all"] as const}
          value={mode}
          onChange={(value) => store.getState().setMode(value)}
          render={(value) => (value === "key" ? "Key moments" : "Every line")}
        />
      ) : null}
      {hasPredict && !traceMine ? (
        <button
          type="button"
          role="switch"
          aria-checked={predictOn}
          onClick={() => store.getState().setPredictOn(!predictOn)}
          className="inline-flex h-8 items-center gap-2 rounded-md px-2 text-xs font-medium text-muted hover:text-text"
        >
          <span
            aria-hidden
            className={cn(
              "relative inline-block h-4 w-7 shrink-0 rounded-full transition-colors",
              predictOn ? "bg-accent" : "bg-border"
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 left-0 size-3 rounded-full transition-transform",
                predictOn ? "translate-x-3.5 bg-on-accent" : "translate-x-0.5 bg-muted"
              )}
            />
          </span>
          Predict mode
        </button>
      ) : null}
      <div className="ml-auto">
        <Segmented<Speed>
          label="Speed"
          options={SPEEDS}
          value={speed}
          onChange={(value) => store.getState().setSpeed(value)}
          render={(value) => `${value}×`}
        />
      </div>
    </div>
  )
}

function Controls({ total, markers }: { total: number; markers: Marker[] }) {
  const store = usePlayerStore()
  const index = usePlayer((s) => s.index)
  const playing = usePlayer((s) => s.playing)
  const blocked = usePlayer((s) => s.pendingPredict !== null)
  const atEnd = index >= total - 1
  const marker = markers.find((candidate) => candidate.index === index)
  const valueText = `Step ${index + 1} of ${total}${marker ? `: ${marker.label}` : ""}`
  const seek = useCallback((value: number) => store.getState().seek(value), [store])
  return (
    <div className="flex items-center gap-1">
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="First step"
        className="hidden @min-[560px]:inline-flex"
        onClick={() => store.getState().first()}
        disabled={index === 0}
      >
        <ChevronFirstIcon />
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="Previous step"
        onClick={() => store.getState().step(-1)}
        disabled={index === 0}
      >
        <StepBackIcon />
      </Button>
      <Button
        size="icon-sm"
        variant="secondary"
        aria-label={playing ? "Pause" : atEnd ? "Play again" : "Play"}
        onClick={() => store.getState().toggle()}
        disabled={blocked}
        data-testid="play"
      >
        {playing ? <PauseIcon /> : atEnd ? <RotateCcwIcon /> : <PlayIcon />}
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="Next step"
        onClick={() => store.getState().step(1)}
        disabled={atEnd || blocked}
        data-testid="next-step"
      >
        <StepForwardIcon />
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="Last step"
        className="hidden @min-[560px]:inline-flex"
        onClick={() => store.getState().last()}
        disabled={atEnd}
      >
        <ChevronLastIcon />
      </Button>
      <Timeline total={total} index={index} markers={markers} onSeek={seek} valueText={valueText} />
      <span
        className="shrink-0 font-mono text-xs text-muted tabular-nums"
        data-testid="step-counter"
      >
        {index + 1} / {total}
      </span>
    </div>
  )
}

function Stage({
  trace,
  viz,
  code,
  scope,
  reduced,
  traceMine,
}: {
  trace: Trace
  viz: VizConfig | null
  code: string
  scope: string
  reduced: boolean
  traceMine: boolean
}) {
  const store = usePlayerStore()
  const steps = trace.steps
  const rawIndex = usePlayer((s) => s.index)
  const prevIndex = usePlayer((s) => s.prevIndex)
  const pending = usePlayer((s) => s.pendingPredict)
  const feedback = usePlayer((s) => s.feedback)
  const markers = useMemo(() => timelineMarkers(trace, viz), [trace, viz])
  const index = Math.min(rawIndex, Math.max(0, steps.length - 1))
  const question = pending ?? feedback
  const ghostEnd = question?.point.kind === "index" ? question.array : null
  const prev =
    prevIndex !== null && prevIndex < steps.length && prevIndex !== index ? steps[prevIndex] : null
  const scene = useMemo(
    () => (steps.length ? layoutFrame(steps, index, viz, prev, { ghostEnd }) : null),
    [steps, index, viz, prev, ghostEnd]
  )
  const onPick = useCallback((value: number) => store.getState().answerPredict(value), [store])
  const pick = useMemo(() => {
    if (pending?.point.kind === "index" && pending.array) return { array: pending.array, onPick }
    if (feedback?.point.kind === "index" && feedback.array) {
      return {
        array: feedback.array,
        onPick,
        picked: Number(feedback.given),
        answer: intValue(feedback.answer),
      }
    }
    return null
  }, [pending, feedback, onPick])

  const error = trace.error ? (
    <p
      role="status"
      className="rounded-lg border border-error/50 bg-bg px-3 py-2 text-sm text-text"
      data-testid="trace-error"
    >
      <span className="font-medium text-error">Error</span>
      {trace.errorLine ? ` on line ${trace.errorLine}` : ""}:{" "}
      <span className="font-mono">{trace.error}</span>
    </p>
  ) : null

  if (!scene) {
    return (
      <>
        {error ?? (
          <p className="text-sm text-muted">The code finished without running a line of its own.</p>
        )}
        <CodeView code={code} line={null} event={null} errorLine={trace.errorLine} />
      </>
    )
  }
  const frame = steps[index]
  const narration = traceMine
    ? { text: describeStep(frame, code), stale: false }
    : (narrationAt(steps, index) ?? { text: describeStep(frame, code), stale: true })

  return (
    <>
      <div
        className="relative flex min-h-40 flex-col gap-3 overflow-x-auto rounded-lg border border-border bg-bg p-4"
        data-testid="viz-canvas"
      >
        {question ? (
          <div className="sticky top-0 left-0 z-10">
            <PredictBanner
              pending={pending}
              feedback={feedback}
              onAnswer={(value) => store.getState().answerPredict(value)}
              onSkip={() => store.getState().skipPredict()}
              onContinue={() => store.getState().continueAfterFeedback()}
            />
          </div>
        ) : null}
        <Canvas scene={scene} step={index} scope={scope} reduced={reduced} pick={pick} />
      </div>
      <p
        aria-live="polite"
        aria-atomic="true"
        className={cn(
          "min-h-6 text-base transition-opacity duration-150",
          narration.stale ? "text-muted opacity-70" : "text-text"
        )}
        data-testid="narration"
      >
        {narration.text}
      </p>
      <Controls total={steps.length} markers={markers} />
      {trace.truncated ? (
        <p className="text-xs text-muted">
          Showing the first {steps.length.toLocaleString("en-US")} steps.
        </p>
      ) : null}
      {error}
      <div className="grid gap-4 @min-[720px]:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <CodeView code={code} line={frame.line} event={frame.event} errorLine={trace.errorLine} />
        <VariablesPanel scene={scene} step={index} />
      </div>
    </>
  )
}
