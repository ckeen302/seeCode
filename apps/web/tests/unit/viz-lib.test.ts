import { describe, expect, it, vi } from "vitest"

import { normalizeViz, runSpec, traceRequest } from "@/lib/viz/config"
import { describeStep, narrationAt, timelineMarkers } from "@/lib/viz/timeline"
import {
  hashText,
  keyMoments,
  parseTrace,
  timedOutTrace,
  TraceCache,
  traceKey,
} from "@/lib/viz/trace"
import type { Trace } from "@/lib/viz/types"

import { fixture, stepWith } from "./viz-fixtures"

describe("parseTrace", () => {
  it("accepts tracer output and rejects anything else", () => {
    const { traces } = fixture("two-sum")
    expect(parseTrace(traces[0])).toEqual(traces[0])
    expect(() => parseTrace({ steps: [{ line: "x" }] })).toThrow("unexpected")
    expect(() => parseTrace(null)).toThrow("unexpected")
  })

  it("describes a time-out", () => {
    expect(timedOutTrace(4000)).toMatchObject({
      steps: [],
      error: "Time limit exceeded: tracing took longer than 4 s.",
    })
  })
})

describe("TraceCache", () => {
  const trace = fixture("two-sum").traces[0]
  const req = { code: "class Solution: ...", entry: "f", args: [[1, 2], 3] }

  it("memoizes per code and input", async () => {
    const cache = new TraceCache()
    const run = vi.fn(async () => trace)
    expect(await cache.get(req, run)).toBe(trace)
    expect(await cache.get({ ...req }, run)).toBe(trace)
    expect(run).toHaveBeenCalledTimes(1)
    await cache.get({ ...req, args: [[1, 2], 4] }, run)
    await cache.get({ ...req, code: req.code + " " }, run)
    expect(run).toHaveBeenCalledTimes(3)
  })

  it("forgets failures and time-outs, and evicts the oldest", async () => {
    const cache = new TraceCache(2)
    const failing = vi.fn(async () => {
      throw new Error("boom")
    })
    await expect(cache.get(req, failing)).rejects.toThrow("boom")
    expect(cache.size).toBe(0)
    await cache.get(req, async () => timedOutTrace(4000))
    expect(cache.size).toBe(0)
    for (const n of [1, 2, 3]) await cache.get({ ...req, args: [n] }, async () => trace)
    expect(cache.size).toBe(2)
  })

  it("keys on everything that changes a trace", () => {
    const base = traceKey(req)
    expect(traceKey({ ...req })).toBe(base)
    expect(traceKey({ ...req, entry: "g" })).not.toBe(base)
    expect(traceKey({ ...req, viz: { primary: "x" } })).not.toBe(base)
    expect(traceKey({ ...req, spec: { kind: "design" } })).not.toBe(base)
    expect(hashText("abc")).toMatch(/^[0-9a-f]{8}$/)
  })
})

describe("timeline", () => {
  const { traces, viz } = fixture("valid-palindrome")

  it("puts a labeled marker on every tagged step; return moments use accent-2", () => {
    const trace = traces[1] // "Top 2 spot": ends on a mismatch
    const markers = timelineMarkers(trace, viz)
    expect(markers.map((marker) => marker.index)).toEqual(keyMoments(trace.steps))
    const first = timelineMarkers(traces[0], viz)
    const skip = first.find((marker) => marker.id === "skip_r")
    expect(skip).toMatchObject({ label: "skip", tone: "event", predict: true })
    expect(first.at(-1)).toMatchObject({ id: "done", label: "return", tone: "end" })
    const mismatch = markers.find((marker) => marker.id === "mismatch")
    expect(mismatch).toMatchObject({ label: "mismatch", tone: "end" })
  })

  it("shows each step's narration, or the last one faded", () => {
    const trace = traces[0]
    const at = stepWith(trace, "skip_r")
    expect(narrationAt(trace.steps, 0)).toBeNull()
    expect(narrationAt(trace.steps, at)).toEqual({ text: trace.steps[at].say, stale: false })
    expect(narrationAt(trace.steps, at + 1)).toEqual({ text: trace.steps[at].say, stale: true })
  })

  it("describes a step without narration", () => {
    const code = fixture("valid-palindrome").payload.code
    const trace = traces[0]
    const at = stepWith(trace, "skip_r")
    expect(describeStep(trace.steps[at], code)).toBe("Line 8 is about to run: r -= 1")
    const ret = trace.steps[trace.steps.length - 1]
    expect(describeStep(ret, code)).toBe("isPalindrome() returns from line 14")
  })
})

describe("viz config", () => {
  it("fills in every key", () => {
    expect(normalizeViz({ primary: "s" })).toEqual({
      primary: "s",
      pointers: [],
      window: null,
      range: null,
      roles: { stack: [], queue: [], hidden: [] },
      confirmed: null,
      events: [],
      predict: [],
    })
    const viz = normalizeViz({
      primary: "s",
      pointers: [{ var: "l", into: "s" }, { var: "r", into: "s", color: "z" }, { into: "s" }],
      range: { into: "s", lo: "lo", hi: "hi" },
      events: [{ id: "a", at: "a" }],
      predict: [
        { atEvent: "a", kind: "nope" },
        { atEvent: "a", kind: "yesno", ask: "?" },
      ],
    })
    expect(viz.pointers).toEqual([
      { var: "l", into: "s", label: "l", color: "a" },
      { var: "r", into: "s", label: "r", color: "b" },
    ])
    expect(viz.range).toEqual({ into: "s", lo: "lo", hi: "hi", mid: null })
    expect(viz.events[0]).toMatchObject({ id: "a", label: "a", say: null })
    expect(viz.predict).toHaveLength(1)
  })

  it("builds trace requests for function and design problems", () => {
    const viz = normalizeViz({ primary: "s" })
    expect(runSpec({ kind: "function", io: undefined })).toBeUndefined()
    expect(
      traceRequest("code", { entry: "f", kind: "function" }, { label: "E", args: [1] }, viz)
    ).toEqual({
      code: "code",
      entry: "f",
      args: [1],
      viz,
    })
    const ops = [["MinStack"], ["push", 1]]
    expect(
      traceRequest("code", { entry: "MinStack", kind: "design" }, { label: "E", ops }, null)
    ).toEqual({
      code: "code",
      entry: "MinStack",
      ops,
      spec: { kind: "design", io: null },
    })
    const io = { params: [{ name: "head", type: "list_node" }] }
    expect(runSpec({ kind: "function", io })).toEqual({ kind: "function", io })
  })
})

describe("keyMoments", () => {
  it("lists tagged steps", () => {
    const steps = [
      { tags: [] },
      { tags: ["a"] },
      { tags: [] },
      { tags: ["predict:0", "b"] },
    ] as unknown as Trace["steps"]
    expect(keyMoments(steps)).toEqual([1, 3])
  })
})
