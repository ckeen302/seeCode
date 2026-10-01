// The walkthrough player (Section 17.3): which step is shown, playback, key moments, and
// predict mode (8.6). One store per player, so several players can live on one page; the
// WalkthroughPlayer component creates its own and owns the playback clock (tick()).
import { createStore, type StoreApi } from "zustand/vanilla"

import { predictArray } from "@/lib/viz/layout"
import { intValue, matchesTypedAnswer, snapText } from "@/lib/viz/snap"
import { keyMoments } from "@/lib/viz/trace"
import type { PredictPoint, Prediction, Snap, Trace, VizConfig } from "@/lib/viz/types"

export type Speed = 0.5 | 1 | 2
export type PlayMode = "key" | "all"

export const SPEEDS: readonly Speed[] = [0.5, 1, 2]
/** Section 17.3: one step every 700 ms at 1×. */
export const BASE_INTERVAL_MS = 700
export const PREDICT_TAG = "predict:"

export function intervalMs(speed: Speed): number {
  return BASE_INTERVAL_MS / speed
}

/** A predict point waiting for the learner's answer at step `step`. */
export interface PendingPredict {
  n: number
  /** The id sent with the attempt's predictions. */
  id: string
  point: PredictPoint
  answer: Snap
  step: number
  /** The array whose cells answer an `index` question. */
  array: string | null
}

export interface PredictFeedback extends PendingPredict {
  correct: boolean
  /** What the learner answered, and as text. */
  value: unknown
  given: string
}

export interface PlayerState {
  trace: Trace | null
  viz: VizConfig | null
  index: number
  /** The step shown before this one (change flashes compare against it). */
  prevIndex: number | null
  playing: boolean
  speed: Speed
  mode: PlayMode
  predictOn: boolean
  pendingPredict: PendingPredict | null
  /** The verdict on the last answer, shown until the learner continues. */
  feedback: PredictFeedback | null
  /** First answer per predict point, in the order given (Section 8.6). */
  predictions: Prediction[]
  /** Predict points answered or skipped for the loaded trace. */
  done: number[]
  /** Steps with tags (key moments). */
  moments: number[]
  /** Playback was on when the predict point paused it. */
  resume: boolean

  load(trace: Trace, viz: VizConfig | null): void
  step(delta: 1 | -1): void
  seek(index: number): void
  first(): void
  last(): void
  toggle(): void
  play(): void
  pause(): void
  /** One playback step; stops at the end. */
  tick(): void
  setSpeed(speed: Speed): void
  setMode(mode: PlayMode): void
  setPredictOn(on: boolean): void
  answerPredict(value: unknown): void
  skipPredict(): void
  /** Leaves the answer's verdict and moves on. */
  continueAfterFeedback(): void
}

export interface PlayerOptions {
  speed?: Speed
  mode?: PlayMode
  predictOn?: boolean
  /** Called once per predict point, with the learner's first answer. */
  onPrediction?: (prediction: Prediction) => void
}

export type PlayerStore = StoreApi<PlayerState>

function lastIndex(state: Pick<PlayerState, "trace">): number {
  return Math.max(0, (state.trace?.steps.length ?? 1) - 1)
}

/** Whether the learner's answer is right (8.4 kinds). */
export function isCorrect(kind: PredictPoint["kind"], answer: Snap, value: unknown): boolean {
  if (kind === "yesno") {
    return answer.t === "prim" && typeof answer.v === "boolean" && Boolean(value) === answer.v
  }
  if (kind === "index") {
    const expected = intValue(answer)
    return expected !== null && Number(value) === expected
  }
  return matchesTypedAnswer(String(value ?? ""), answer)
}

function answerText(kind: PredictPoint["kind"], value: unknown): string {
  if (kind === "yesno") return value ? "Yes" : "No"
  if (kind === "index") return `index ${String(value)}`
  return String(value ?? "")
}

export function createPlayerStore(options: PlayerOptions = {}): PlayerStore {
  return createStore<PlayerState>()((set, get) => {
    /** The predict point asked at step `index`, if the learner should answer it now. */
    function predictAt(index: number): PendingPredict | null {
      const { trace, viz, predictOn, done } = get()
      if (!predictOn || !trace || !viz) return null
      const frame = trace.steps[index]
      for (const tag of frame?.tags ?? []) {
        if (!tag.startsWith(PREDICT_TAG)) continue
        const n = Number(tag.slice(PREDICT_TAG.length))
        const point = viz.predict[n]
        const answer = frame.predictAnswers?.[String(n)]
        if (!point || !answer || done.includes(n)) continue
        return {
          n,
          id: tag,
          point,
          answer,
          step: index,
          array: point.kind === "index" ? predictArray(viz, point.var) : null,
        }
      }
      return null
    }

    function arrive(target: number): void {
      const state = get()
      const pending = predictAt(target)
      set({
        index: target,
        prevIndex: state.index,
        pendingPredict: pending,
        feedback: null,
        playing: pending ? false : state.playing,
        resume: pending ? state.playing : state.resume,
      })
    }

    function nextTarget(state: PlayerState): number {
      const end = lastIndex(state)
      if (state.mode === "all") return Math.min(end, state.index + 1)
      return state.moments.find((moment) => moment > state.index) ?? end
    }

    function prevTarget(state: PlayerState): number {
      if (state.mode === "all") return Math.max(0, state.index - 1)
      const before = state.moments.filter((moment) => moment < state.index)
      return before.length ? before[before.length - 1] : 0
    }

    return {
      trace: null,
      viz: null,
      index: 0,
      prevIndex: null,
      playing: false,
      speed: options.speed ?? 1,
      mode: options.mode ?? "key",
      predictOn: options.predictOn ?? false,
      pendingPredict: null,
      feedback: null,
      predictions: [],
      done: [],
      moments: [],
      resume: false,

      load(trace, viz) {
        const moments = keyMoments(trace.steps)
        // Without key moments (Trace my code), every line is a step.
        const mode = moments.length === 0 ? "all" : get().mode
        set({
          trace,
          viz,
          index: 0,
          prevIndex: null,
          playing: false,
          pendingPredict: null,
          feedback: null,
          done: [],
          moments,
          mode,
          resume: false,
        })
        const pending = predictAt(0)
        if (pending) set({ pendingPredict: pending })
      },

      step(delta) {
        const state = get()
        if (!state.trace) return
        if (delta === -1) {
          set({
            pendingPredict: null,
            feedback: null,
            playing: false,
            index: prevTarget(state),
            prevIndex: state.index,
          })
          return
        }
        if (state.pendingPredict) return // answer or skip first
        if (state.feedback) {
          get().continueAfterFeedback()
          return
        }
        const target = nextTarget(state)
        if (target === state.index) {
          set({ playing: false })
          return
        }
        arrive(target)
      },

      seek(index) {
        const state = get()
        if (!state.trace) return
        const target = Math.max(0, Math.min(lastIndex(state), Math.round(index)))
        set({ index: target, prevIndex: state.index, pendingPredict: null, feedback: null })
      },

      first() {
        get().seek(0)
      },

      last() {
        set({ playing: false })
        get().seek(lastIndex(get()))
      },

      toggle() {
        if (get().playing) get().pause()
        else get().play()
      },

      play() {
        const state = get()
        if (!state.trace || state.pendingPredict) return
        if (state.feedback) {
          set({ resume: true })
          get().continueAfterFeedback()
          return
        }
        if (state.index >= lastIndex(state)) {
          // Play from the start again.
          set({ index: 0, prevIndex: state.index, done: state.done })
        }
        set({ playing: true })
      },

      pause() {
        set({ playing: false, resume: false })
      },

      tick() {
        const state = get()
        if (!state.playing) return
        get().step(1)
        if (get().index >= lastIndex(get())) set({ playing: false })
      },

      setSpeed(speed) {
        set({ speed })
      },

      setMode(mode) {
        set({ mode })
      },

      setPredictOn(on) {
        set({ predictOn: on })
        if (!on) set({ pendingPredict: null })
        else if (!get().pendingPredict && !get().feedback) {
          const pending = predictAt(get().index)
          if (pending) set({ pendingPredict: pending, playing: false })
        }
      },

      answerPredict(value) {
        const pending = get().pendingPredict
        if (!pending) return
        const correct = isCorrect(pending.point.kind, pending.answer, value)
        const known = get().predictions.some((prediction) => prediction.id === pending.id)
        const prediction = { id: pending.id, correct }
        set((state) => ({
          pendingPredict: null,
          feedback: { ...pending, correct, value, given: answerText(pending.point.kind, value) },
          done: [...state.done, pending.n],
          predictions: known ? state.predictions : [...state.predictions, prediction],
        }))
        if (!known) options.onPrediction?.(prediction)
      },

      skipPredict() {
        const pending = get().pendingPredict
        if (!pending) return
        const resume = get().resume
        set((state) => ({
          pendingPredict: null,
          done: [...state.done, pending.n],
          playing: resume,
          resume: false,
        }))
      },

      continueAfterFeedback() {
        const state = get()
        if (!state.feedback) return
        const resume = state.resume
        set({ feedback: null, resume: false })
        const target = nextTarget(get())
        if (target !== get().index) arrive(target)
        if (resume && !get().pendingPredict) set({ playing: true })
      },
    }
  })
}

/** The answer of a predict point, as the feedback line shows it. */
export function answerLabel(pending: PendingPredict): string {
  const { answer, point } = pending
  if (point.kind === "yesno") return answer.t === "prim" && answer.v ? "Yes" : "No"
  if (point.kind === "index") return `index ${snapText(answer)}`
  return snapText(answer)
}
