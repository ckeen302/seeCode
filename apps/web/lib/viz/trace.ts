// Traces from the worker (Section 8.2): a light shape check, the time-limit trace, and the
// in-memory memo per (code, input) that Section 8.7 asks for.
import { z } from "zod"

import type { Trace, TraceRequest } from "@/lib/runner/types"
import type { Frame, Snap } from "@/lib/viz/types"

// Only the outer shape is checked: snapshots are written by our own tracer, and a deep parse
// of 3,000 frames would cost more than the trace itself.
const FrameShape = z.looseObject({
  line: z.number(),
  event: z.enum(["line", "return"]),
  func: z.string(),
  depth: z.number(),
  locals: z.record(z.string(), z.unknown()),
  tags: z.array(z.string()),
})
const TraceShape = z.looseObject({
  steps: z.array(FrameShape),
  result: z.unknown(),
  error: z.string().nullable(),
  truncated: z.boolean(),
})

/** The worker's answer as a Trace; anything else is an internal error. */
export function parseTrace(data: unknown): Trace {
  const parsed = TraceShape.safeParse(data)
  if (!parsed.success) throw new Error("The tracer returned something unexpected.")
  return parsed.data as unknown as Trace
}

export const NONE: Snap = { t: "prim", v: null }

/** What a trace that hit the runner's time limit shows. */
export function timedOutTrace(ms: number): Trace {
  return {
    steps: [],
    result: NONE,
    error: `Time limit exceeded: tracing took longer than ${ms / 1000} s.`,
    errorLine: null,
    truncated: false,
  }
}

/** A short stable hash (FNV-1a, 32 bit) of a string, as hex. */
export function hashText(text: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, "0")
}

/** The memo key of a trace request: everything that can change the trace. */
export function traceKey(req: TraceRequest): string {
  const { code, entry, args, ops, viz, spec } = req
  const rest = JSON.stringify([entry, args ?? null, ops ?? null, viz ?? null, spec ?? null])
  return `${hashText(code)}:${code.length}:${hashText(rest)}:${rest.length}`
}

/** A small LRU of finished traces (Section 8.7: memoized per code and input). */
export class TraceCache {
  #entries = new Map<string, Promise<Trace>>()

  constructor(readonly limit = 40) {}

  get size(): number {
    return this.#entries.size
  }

  /** The cached trace for `req`, or a new one from `run`. A failed run is not kept. */
  get(req: TraceRequest, run: (req: TraceRequest) => Promise<Trace>): Promise<Trace> {
    const key = traceKey(req)
    const found = this.#entries.get(key)
    if (found) {
      this.#entries.delete(key)
      this.#entries.set(key, found)
      return found
    }
    const promise = run(req)
    this.#entries.set(key, promise)
    promise.then(
      (trace) => {
        // A time-out may pass next time (a cold worker); do not keep it.
        if (trace.steps.length === 0 && trace.error?.startsWith("Time limit")) {
          this.#entries.delete(key)
        }
      },
      () => this.#entries.delete(key)
    )
    while (this.#entries.size > this.limit) {
      const oldest = this.#entries.keys().next().value as string
      this.#entries.delete(oldest)
    }
    return promise
  }

  clear(): void {
    this.#entries.clear()
  }
}

/** The app-wide memo. */
export const traceCache = new TraceCache()

/** Steps that a key-moments playback stops at (frames with tags), always with the last. */
export function keyMoments(steps: readonly Frame[]): number[] {
  const out: number[] = []
  steps.forEach((step, index) => {
    if (step.tags.length > 0) out.push(index)
  })
  return out
}
