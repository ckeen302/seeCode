import { describe, expect, it, vi } from "vitest"

import { answerLabel, createPlayerStore, intervalMs, isCorrect } from "@/stores/player"
import type { Trace } from "@/lib/viz/types"

import { fixture, stepWith } from "./viz-fixtures"

// The walkthrough player store (Section 17.3) on Valid Palindrome's "Top spot!" trace.

const { traces, viz } = fixture("valid-palindrome")
const trace = traces[0]
const last = trace.steps.length - 1

function loaded(options: Parameters<typeof createPlayerStore>[0] = {}) {
  const store = createPlayerStore(options)
  store.getState().load(trace, viz)
  return store
}

describe("player store", () => {
  it("loads a trace at its first step with key moments", () => {
    const store = loaded()
    const state = store.getState()
    expect(state.index).toBe(0)
    expect(state.mode).toBe("key")
    expect(state.moments).toEqual(
      trace.steps.flatMap((step, index) => (step.tags.length ? [index] : []))
    )
    expect(state.playing).toBe(false)
  })

  it("steps between key moments, or every line", () => {
    const store = loaded()
    const { moments } = store.getState()
    store.getState().step(1)
    expect(store.getState().index).toBe(moments[0])
    store.getState().step(1)
    expect(store.getState().index).toBe(moments[1])
    expect(store.getState().prevIndex).toBe(moments[0])
    store.getState().step(-1)
    expect(store.getState().index).toBe(moments[0])
    store.getState().step(-1)
    expect(store.getState().index).toBe(0)

    store.getState().setMode("all")
    store.getState().step(1)
    expect(store.getState().index).toBe(1)
  })

  it("seeks, clamps and jumps to the ends", () => {
    const store = loaded()
    store.getState().seek(500)
    expect(store.getState().index).toBe(last)
    store.getState().seek(-3)
    expect(store.getState().index).toBe(0)
    store.getState().last()
    expect(store.getState().index).toBe(last)
    store.getState().first()
    expect(store.getState().index).toBe(0)
  })

  it("plays one step per tick and stops at the end; Play at the end starts over", () => {
    const store = loaded()
    store.getState().play()
    expect(store.getState().playing).toBe(true)
    for (let i = 0; i < 100 && store.getState().playing; i++) store.getState().tick()
    expect(store.getState().index).toBe(last)
    expect(store.getState().playing).toBe(false)
    store.getState().toggle()
    expect(store.getState().index).toBe(0)
    expect(store.getState().playing).toBe(true)
    store.getState().toggle()
    expect(store.getState().playing).toBe(false)
  })

  it("plays at 700 ms / speed", () => {
    expect(intervalMs(1)).toBe(700)
    expect(intervalMs(2)).toBe(350)
    expect(intervalMs(0.5)).toBe(1400)
  })

  it("does not move with ticks while paused", () => {
    const store = loaded()
    store.getState().tick()
    expect(store.getState().index).toBe(0)
  })

  it("treats a trace without tags as every line", () => {
    const plain: Trace = { ...trace, steps: trace.steps.map((step) => ({ ...step, tags: [] })) }
    const store = createPlayerStore()
    store.getState().load(plain, null)
    expect(store.getState().mode).toBe("all")
    store.getState().step(1)
    expect(store.getState().index).toBe(1)
  })
})

describe("predict mode", () => {
  it("pauses at a predict point and grades an index answer", () => {
    const onPrediction = vi.fn()
    const store = loaded({ predictOn: true })
    store.subscribe((state, before) => {
      if (state.predictions.length > before.predictions.length)
        onPrediction(state.predictions.at(-1))
    })
    store.getState().play()
    store.getState().tick()
    const at = stepWith(trace, "skip_r")
    const pending = store.getState().pendingPredict
    expect(store.getState().index).toBe(at)
    expect(store.getState().playing).toBe(false)
    expect(pending).toMatchObject({ n: 0, id: "predict:0", array: "s", step: at })
    expect(pending?.point.kind).toBe("index")
    expect(pending?.answer).toEqual({ t: "prim", v: 7 })

    // Blocked until answered.
    store.getState().step(1)
    store.getState().play()
    expect(store.getState().index).toBe(at)
    expect(store.getState().playing).toBe(false)

    store.getState().answerPredict(7)
    expect(store.getState().feedback).toMatchObject({ correct: true, given: "index 7" })
    expect(store.getState().predictions).toEqual([{ id: "predict:0", correct: true }])
    expect(onPrediction).toHaveBeenCalledWith({ id: "predict:0", correct: true })

    // Continuing moves on and resumes playback, then stops at the next point.
    store.getState().continueAfterFeedback()
    const compare = stepWith(trace, "compare")
    expect(store.getState().index).toBe(compare)
    expect(store.getState().pendingPredict).toMatchObject({ n: 1, answer: { t: "prim", v: true } })
    expect(store.getState().playing).toBe(false)
    store.getState().answerPredict(false)
    expect(store.getState().feedback).toMatchObject({ correct: false, given: "No" })
    expect(answerLabel(store.getState().feedback!)).toBe("Yes")
    expect(store.getState().predictions).toEqual([
      { id: "predict:0", correct: true },
      { id: "predict:1", correct: false },
    ])
  })

  it("keeps only the first answer of each point", () => {
    const store = loaded({ predictOn: true })
    store.getState().step(1)
    store.getState().answerPredict(3)
    expect(store.getState().predictions).toEqual([{ id: "predict:0", correct: false }])
    store.getState().load(trace, viz)
    store.getState().step(1)
    store.getState().answerPredict(7)
    expect(store.getState().feedback?.correct).toBe(true)
    expect(store.getState().predictions).toEqual([{ id: "predict:0", correct: false }])
  })

  it("skips a point and resumes playback", () => {
    const store = loaded({ predictOn: true })
    store.getState().play()
    store.getState().tick()
    expect(store.getState().pendingPredict).not.toBeNull()
    store.getState().skipPredict()
    expect(store.getState().pendingPredict).toBeNull()
    expect(store.getState().playing).toBe(true)
    expect(store.getState().predictions).toEqual([])
    // A skipped point is not asked again on the way back and forth.
    store.getState().step(-1)
    store.getState().step(1)
    expect(store.getState().pendingPredict).toBeNull()
  })

  it("asks nothing with predict mode off, and asks when it is turned on at a point", () => {
    const store = loaded()
    store.getState().step(1)
    expect(store.getState().pendingPredict).toBeNull()
    store.getState().setPredictOn(true)
    expect(store.getState().pendingPredict?.n).toBe(0)
    store.getState().setPredictOn(false)
    expect(store.getState().pendingPredict).toBeNull()
  })

  it("does not ask when scrubbing over a point", () => {
    const store = loaded({ predictOn: true })
    store.getState().seek(stepWith(trace, "skip_r"))
    expect(store.getState().pendingPredict).toBeNull()
  })

  it("grades each kind", () => {
    expect(isCorrect("yesno", { t: "prim", v: true }, true)).toBe(true)
    expect(isCorrect("yesno", { t: "prim", v: true }, false)).toBe(false)
    expect(isCorrect("index", { t: "prim", v: 4 }, 4)).toBe(true)
    expect(isCorrect("index", { t: "prim", v: 4 }, "4")).toBe(true)
    expect(isCorrect("index", { t: "prim", v: 4 }, 5)).toBe(false)
    expect(isCorrect("value", { t: "prim", v: 12 }, " 12 ")).toBe(true)
    expect(isCorrect("value", { t: "str", v: "aet", n: 3 }, "'aet'")).toBe(true)
    expect(isCorrect("value", { t: "str", v: "aet", n: 3 }, "tea")).toBe(false)
  })
})
