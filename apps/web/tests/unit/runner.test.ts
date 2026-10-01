import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { PyodideRunner, alignResults, type WorkerLike } from "@/lib/runner/runner"
import type {
  RunTestsRequest,
  TraceRequest,
  WorkerRequest,
  WorkerResponse,
} from "@/lib/runner/types"

// Runner (Section 9.1) against a fake worker: message routing, timeouts, restarts, crashes.

class FakeWorker implements WorkerLike {
  static instances: FakeWorker[] = []
  sent: WorkerRequest[] = []
  terminated = false
  private messageListeners: ((event: MessageEvent<WorkerResponse>) => void)[] = []
  private errorListeners: ((event: Event) => void)[] = []

  constructor() {
    FakeWorker.instances.push(this)
  }

  postMessage(message: WorkerRequest) {
    this.sent.push(message)
  }

  terminate() {
    this.terminated = true
  }

  addEventListener(type: "message", listener: (event: MessageEvent<WorkerResponse>) => void): void
  addEventListener(type: "error", listener: (event: Event) => void): void
  addEventListener(
    type: "message" | "error",
    listener: ((event: MessageEvent<WorkerResponse>) => void) | ((event: Event) => void)
  ) {
    if (type === "message") {
      this.messageListeners.push(listener as (event: MessageEvent<WorkerResponse>) => void)
    } else {
      this.errorListeners.push(listener as (event: Event) => void)
    }
  }

  last(type: WorkerRequest["type"]): WorkerRequest {
    const found = this.sent.filter((request) => request.type === type).at(-1)
    if (!found) throw new Error(`no ${type} request`)
    return found
  }

  respond(response: WorkerResponse) {
    for (const listener of this.messageListeners) {
      listener(new MessageEvent("message", { data: response }))
    }
  }

  reply(type: WorkerRequest["type"], data: unknown) {
    this.respond({ id: this.last(type).id, ok: true, data })
  }

  crash(message: string) {
    for (const listener of this.errorListeners) listener(new ErrorEvent("error", { message }))
  }
}

const REQUEST: RunTestsRequest = {
  code: "class Solution: ...",
  entry: "f",
  tests: [
    { id: "a", args: [1], expected: 1, hidden: false },
    { id: "b", args: [2], expected: 2, hidden: true },
  ],
}

function makeRunner(overrides: Partial<ConstructorParameters<typeof PyodideRunner>[0]> = {}) {
  return new PyodideRunner({
    createWorker: () => new FakeWorker(),
    indexURL: "https://cdn.example/pyodide/v1/full/",
    harnessUrl: "http://app.test/py/harness.py",
    tracerUrl: "http://app.test/py/tracer.py",
    ...overrides,
  })
}

/** Lets pending promise callbacks run. */
const settle = () => vi.advanceTimersByTimeAsync(0)

/** The nth worker, once queued work has started it. */
async function worker(index = 0): Promise<FakeWorker> {
  await settle()
  const found = FakeWorker.instances[index]
  if (!found) throw new Error(`worker ${index} was not started`)
  return found
}

beforeEach(() => {
  FakeWorker.instances = []
  vi.useFakeTimers()
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
})

describe("runner", () => {
  it("starts one worker lazily and sends the Pyodide and harness locations", async () => {
    const runner = makeRunner()
    expect(FakeWorker.instances).toHaveLength(0)
    const ready = runner.ready()
    runner.ready()
    expect(FakeWorker.instances).toHaveLength(1)
    const w = FakeWorker.instances[0]
    expect(w.sent).toEqual([
      {
        id: expect.any(Number),
        type: "init",
        payload: {
          indexURL: "https://cdn.example/pyodide/v1/full/",
          harnessUrl: "http://app.test/py/harness.py",
          tracerUrl: "http://app.test/py/tracer.py",
        },
      },
    ])
    expect(runner.status).toBe("loading")
    w.reply("init", { version: "314.0.7" })
    await ready
    expect(runner.status).toBe("ready")
  })

  it("routes each answer to its request by id and ignores unknown ids", async () => {
    const runner = makeRunner()
    const statuses: string[] = []
    runner.subscribe(() => statuses.push(runner.status))
    const done = runner.runTests(REQUEST)
    const w = await worker()
    w.reply("init", {})
    await settle()
    expect(runner.status).toBe("busy")
    const run = w.last("runTests")
    expect(run.payload).toEqual(REQUEST)
    w.respond({ id: run.id + 100, ok: true, data: [] }) // not ours: ignored
    w.respond({
      id: run.id,
      ok: true,
      data: [
        { id: "b", status: "fail", got: 3 },
        { id: "a", status: "pass", got: 1, stdout: "", ms: 0.2 },
      ],
    })
    await expect(done).resolves.toEqual([
      { id: "a", status: "pass", got: 1, stdout: "", ms: 0.2 },
      { id: "b", status: "fail", got: 3 },
    ])
    expect(runner.status).toBe("ready")
    expect(statuses).toEqual(["ready", "busy", "ready"])
  })

  it("rejects with the worker's error message", async () => {
    const runner = makeRunner()
    const done = runner.runTests(REQUEST)
    const w = await worker()
    w.reply("init", {})
    await settle()
    w.respond({ id: w.last("runTests").id, ok: false, error: "boom" })
    await expect(done).rejects.toThrow("boom")
    await expect(done).rejects.toMatchObject({ name: "RunnerError", kind: "internal" })
    expect(runner.status).toBe("ready")
  })

  it("stops an endless run after 5 s, marks tests as timeout and starts a fresh worker", async () => {
    const runner = makeRunner()
    const first = runner.runTests(REQUEST)
    const stuck = await worker()
    stuck.reply("init", {})
    await settle()
    const stuckRun = stuck.last("runTests")

    await vi.advanceTimersByTimeAsync(4_999)
    expect(stuck.terminated).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await expect(first).resolves.toEqual([
      { id: "a", status: "timeout" },
      { id: "b", status: "timeout" },
    ])
    expect(stuck.terminated).toBe(true)
    expect(FakeWorker.instances).toHaveLength(2)
    expect(runner.status).toBe("loading")

    // A late answer from the terminated worker changes nothing.
    stuck.respond({ id: stuckRun.id, ok: true, data: [{ id: "a", status: "pass" }] })

    // The next Run works on the fresh worker.
    const fresh = FakeWorker.instances[1]
    const second = runner.runTests(REQUEST)
    await settle()
    fresh.reply("init", {})
    await settle()
    fresh.reply("runTests", [
      { id: "a", status: "pass" },
      { id: "b", status: "pass" },
    ])
    await expect(second).resolves.toEqual([
      { id: "a", status: "pass" },
      { id: "b", status: "pass" },
    ])
    expect(runner.status).toBe("ready")
  })

  it("restarts Python after a fatal Pyodide error", async () => {
    const runner = makeRunner()
    const done = runner.runTests(REQUEST)
    const w = await worker()
    w.reply("init", {})
    await settle()
    w.respond({
      id: w.last("runTests").id,
      ok: false,
      error: "Pyodide has suffered a fatal error. Please report this to the Pyodide maintainers.",
    })
    await expect(done).rejects.toMatchObject({
      kind: "crash",
      message: expect.stringMatching(/fatal error/),
    })
    expect(w.terminated).toBe(true)
    expect(FakeWorker.instances).toHaveLength(2)
    expect(runner.status).toBe("loading")
  })

  it("runs requests one at a time", async () => {
    const runner = makeRunner()
    const one = runner.runTests(REQUEST)
    const two = runner.runTests({ ...REQUEST, tests: [REQUEST.tests[0]] })
    const w = await worker()
    w.reply("init", {})
    await settle()
    expect(w.sent.filter((request) => request.type === "runTests")).toHaveLength(1)
    w.reply("runTests", [])
    await one
    await settle()
    expect(w.sent.filter((request) => request.type === "runTests")).toHaveLength(2)
    w.reply("runTests", [{ id: "a", status: "pass" }])
    await expect(two).resolves.toEqual([{ id: "a", status: "pass" }])
  })

  it("reports a crash, fails the pending run, and restarts on the next call", async () => {
    const runner = makeRunner()
    const done = runner.runTests(REQUEST)
    // The worker died while loading: the run fails as a load failure (the network, mostly).
    const assertion = expect(done).rejects.toMatchObject({
      kind: "load",
      message: "Pyodide failed to load",
    })
    const w = await worker()
    w.crash("Pyodide failed to load")
    await assertion
    expect(runner.status).toBe("crashed")
    expect(w.terminated).toBe(true)

    const ready = runner.ready()
    expect(FakeWorker.instances).toHaveLength(2)
    FakeWorker.instances[1].reply("init", {})
    await ready
    expect(runner.status).toBe("ready")
  })

  it("gives up on a worker that takes too long to load", async () => {
    const runner = makeRunner({ initTimeoutMs: 1_000 })
    const ready = runner.ready()
    const assertion = expect(ready).rejects.toMatchObject({
      kind: "load",
      message: "Python took too long to load.",
    })
    await vi.advanceTimersByTimeAsync(1_000)
    await assertion
    expect(runner.status).toBe("crashed")
  })

  it("reports a worker that dies during a run as a crash, then starts a new one", async () => {
    const runner = makeRunner()
    const done = runner.runTests(REQUEST)
    const w = await worker()
    w.reply("init", {})
    await settle()
    const assertion = expect(done).rejects.toMatchObject({ kind: "crash" })
    w.crash("Uncaught RangeError: Maximum call stack size exceeded")
    await assertion
    expect(runner.status).toBe("crashed")
    expect(w.terminated).toBe(true)

    const again = runner.runTests(REQUEST)
    await settle()
    expect(FakeWorker.instances).toHaveLength(2)
    const fresh = FakeWorker.instances[1]
    fresh.reply("init", {})
    await settle()
    fresh.reply("runTests", [
      { id: "a", status: "pass" },
      { id: "b", status: "pass" },
    ])
    await expect(again).resolves.toHaveLength(2)
    expect(runner.status).toBe("ready")
  })

  const TRACE_REQUEST: TraceRequest = {
    code: "class Solution: ...",
    entry: "f",
    args: [[1, 2]],
    viz: { primary: "nums" },
  }
  const TRACE = {
    steps: [{ line: 3, event: "line", func: "f", depth: 1, locals: {}, tags: [] }],
    result: { t: "prim", v: 1 },
    error: null,
    errorLine: null,
    truncated: false,
    stdout: "",
  }

  it("traces through the worker (Section 8.2)", async () => {
    const runner = makeRunner()
    const traced = runner.trace(TRACE_REQUEST)
    const w = await worker()
    w.reply("init", {})
    await settle()
    expect(w.last("trace")).toMatchObject({ type: "trace", payload: TRACE_REQUEST })
    expect(runner.status).toBe("busy")
    w.reply("trace", TRACE)
    await expect(traced).resolves.toEqual(TRACE)
    expect(runner.status).toBe("ready")
  })

  it("rejects a malformed trace", async () => {
    const runner = makeRunner()
    const traced = runner.trace(TRACE_REQUEST)
    const w = await worker()
    w.reply("init", {})
    await settle()
    w.reply("trace", { steps: "nope" })
    await expect(traced).rejects.toThrow("The tracer returned something unexpected.")
  })

  it("gives a trace 4 s, then answers with a time-limit trace and restarts Python", async () => {
    const runner = makeRunner()
    const traced = runner.trace(TRACE_REQUEST)
    const stuck = await worker()
    stuck.reply("init", {})
    await settle()
    await vi.advanceTimersByTimeAsync(3_999)
    expect(stuck.terminated).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    const trace = await traced
    expect(trace.steps).toEqual([])
    expect(trace.error).toBe("Time limit exceeded: tracing took longer than 4 s.")
    expect(stuck.terminated).toBe(true)
    expect(FakeWorker.instances).toHaveLength(2)
  })

  it("runs traces and test runs one at a time", async () => {
    const runner = makeRunner()
    const traced = runner.trace(TRACE_REQUEST)
    const tests = runner.runTests(REQUEST)
    const w = await worker()
    w.reply("init", {})
    await settle()
    expect(w.sent.map((request) => request.type)).toEqual(["init", "trace"])
    w.reply("trace", TRACE)
    await traced
    await settle()
    expect(w.sent.map((request) => request.type)).toEqual(["init", "trace", "runTests"])
    w.reply("runTests", [])
    await tests
  })

  it("answers an empty run without starting Python", async () => {
    await expect(makeRunner().runTests({ ...REQUEST, tests: [] })).resolves.toEqual([])
    expect(FakeWorker.instances).toHaveLength(0)
  })
})

describe("alignResults", () => {
  it("keeps request order and fills in missing or malformed results", () => {
    expect(alignResults(REQUEST.tests, [{ id: "b", status: "pass" }])).toEqual([
      { id: "a", status: "error", error: "The test harness returned no result for this case." },
      { id: "b", status: "pass" },
    ])
    expect(alignResults(REQUEST.tests, "nonsense").map((result) => result.status)).toEqual([
      "error",
      "error",
    ])
  })
})
