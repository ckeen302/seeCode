// Main-thread wrapper around the Pyodide worker (Section 9.1).
//
// - One worker, created on first use (the Workspace, or hovering a problem link) and kept
//   alive across problems.
// - Requests (test runs and traces) run one at a time. Tests get 5 s in total per Run/Submit (trace: 4 s). On a
//   timeout the worker is terminated, the tests come back as "timeout", and a fresh
//   worker starts loading at once so the next Run works.
// - A worker that fails (Pyodide could not load, or it crashed) leaves the runner
//   "crashed"; the next call starts a new worker. Failures reject with a RunnerError whose
//   `kind` says which it was, so the Tests panel can say what to do.
import { z } from "zod"

import { env, pyodideIndexUrl } from "@/lib/env"
import { pyodideWorkerSource } from "@/lib/runner/pyodide.worker"
import { parseTrace, timedOutTrace } from "@/lib/viz/trace"
import type {
  Runner,
  RunnerStatus,
  RunTestsRequest,
  TestResult,
  Trace,
  TraceRequest,
  WorkerRequest,
  WorkerResponse,
} from "@/lib/runner/types"

export const TEST_TIMEOUT_MS = 5_000
export const TRACE_TIMEOUT_MS = 4_000
/** Loading Pyodide (about 12 MB, cached after the first visit) may take a while on slow links. */
export const INIT_TIMEOUT_MS = 90_000

/** What the runner needs from a Worker; tests pass a fake. */
export interface WorkerLike {
  postMessage(message: WorkerRequest): void
  terminate(): void
  addEventListener(type: "message", listener: (event: MessageEvent<WorkerResponse>) => void): void
  addEventListener(type: "error", listener: (event: Event) => void): void
}

export interface RunnerOptions {
  createWorker?: () => WorkerLike
  indexURL?: string
  harnessUrl?: string
  tracerUrl?: string
  testTimeoutMs?: number
  traceTimeoutMs?: number
  initTimeoutMs?: number
}

/**
 * Why Python could not run the code: "load" (Pyodide or the harness did not load: the
 * network, most likely), "crash" (the worker died while running it, e.g. out of memory; the
 * next request starts a fresh one) or "internal" (the harness itself failed).
 */
export type RunnerErrorKind = "load" | "crash" | "internal"

export class RunnerError extends Error {
  constructor(
    message: string,
    readonly kind: RunnerErrorKind = "internal"
  ) {
    super(message)
    this.name = "RunnerError"
  }
}

class TimeoutError extends RunnerError {
  constructor() {
    super("Time limit exceeded.")
    this.name = "TimeoutError"
  }
}

const TestResultSchema = z.object({
  id: z.string(),
  status: z.enum(["pass", "fail", "error", "timeout"]),
  got: z.unknown().optional(),
  stdout: z.string().optional(),
  error: z.string().optional(),
  ms: z.number().optional(),
})

/** One result per requested test, in request order, whatever the worker sent back. */
export function alignResults(tests: RunTestsRequest["tests"], data: unknown): TestResult[] {
  const parsed = z.array(TestResultSchema).safeParse(data)
  const byId = new Map<string, TestResult>()
  if (parsed.success) for (const result of parsed.data) byId.set(result.id, result)
  return tests.map(
    (test) =>
      byId.get(test.id) ?? {
        id: test.id,
        status: "error",
        error: "The test harness returned no result for this case.",
      }
  )
}

/** Returned by #request when the run hit its time limit and the worker was replaced. */
const TIMED_OUT = Symbol("timed out")

/** Pyodide's messages once the interpreter is unusable ("fatal error", "fatally failed"). */
const FATAL = /\bfatal(ly)?\b/i

interface Pending {
  worker: WorkerLike
  resolve: (data: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout> | null
}

let workerUrl: string | null = null

/**
 * A module worker running pyodide.worker.ts. Pyodide refuses classic workers, which is what
 * Turbopack makes of `new Worker(new URL(...))`, so the worker starts from a Blob URL of the
 * self-contained worker function (Section 20's CSP allows `worker-src blob:`).
 */
function defaultCreateWorker(): WorkerLike {
  workerUrl ??= URL.createObjectURL(new Blob([pyodideWorkerSource()], { type: "text/javascript" }))
  return new Worker(workerUrl, { type: "module", name: "seecode-python" }) as WorkerLike
}

export class PyodideRunner implements Runner {
  #status: RunnerStatus = "loading"
  #worker: WorkerLike | null = null
  #readyPromise: Promise<void> | null = null
  #pending = new Map<number, Pending>()
  #nextId = 1
  #queue: Promise<unknown> = Promise.resolve()
  #listeners = new Set<() => void>()
  readonly #options: Required<Omit<RunnerOptions, "createWorker" | "harnessUrl" | "tracerUrl">> & {
    createWorker: () => WorkerLike
    harnessUrl: string | undefined
    tracerUrl: string | undefined
  }

  constructor(options: RunnerOptions = {}) {
    this.#options = {
      createWorker: options.createWorker ?? defaultCreateWorker,
      indexURL: options.indexURL ?? pyodideIndexUrl(env.pyodideVersion),
      harnessUrl: options.harnessUrl,
      tracerUrl: options.tracerUrl,
      testTimeoutMs: options.testTimeoutMs ?? TEST_TIMEOUT_MS,
      traceTimeoutMs: options.traceTimeoutMs ?? TRACE_TIMEOUT_MS,
      initTimeoutMs: options.initTimeoutMs ?? INIT_TIMEOUT_MS,
    }
  }

  get status(): RunnerStatus {
    return this.#status
  }

  /** For useSyncExternalStore. */
  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  getStatus = (): RunnerStatus => this.#status

  /** Starts the worker if needed; resolves once Python and the harness are loaded. */
  ready(): Promise<void> {
    if (!this.#readyPromise || this.#status === "crashed") this.#start()
    return this.#readyPromise as Promise<void>
  }

  runTests(req: RunTestsRequest): Promise<TestResult[]> {
    return this.#enqueue(async () => {
      if (req.tests.length === 0) return []
      const data = await this.#request("runTests", req, this.#options.testTimeoutMs)
      if (data === TIMED_OUT) return req.tests.map((test) => ({ id: test.id, status: "timeout" }))
      return alignResults(req.tests, data)
    })
  }

  /**
   * Traces one input (Section 8.2). A trace that hits its 4 s limit comes back as a Trace
   * with an `error` (the worker is replaced, as for tests); the tracer's own step limit
   * ends endless loops long before that.
   */
  trace(req: TraceRequest): Promise<Trace> {
    return this.#enqueue(async () => {
      const data = await this.#request("trace", req, this.#options.traceTimeoutMs)
      if (data === TIMED_OUT) return timedOutTrace(this.#options.traceTimeoutMs)
      return parseTrace(data)
    })
  }

  // ------------------------------------------------------------------ internals

  #setStatus(status: RunnerStatus): void {
    if (this.#status === status) return
    this.#status = status
    this.#listeners.forEach((listener) => listener())
  }

  #enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.#queue.then(task, task)
    this.#queue = run.catch(() => undefined)
    return run
  }

  /** Sends one request once the worker is ready. Resolves TIMED_OUT after a restart. */
  async #request(
    type: "runTests" | "trace",
    payload: WorkerRequest["payload"],
    timeoutMs: number
  ): Promise<unknown> {
    await this.ready()
    const worker = this.#worker
    // It can die between loading and this request (an error event in between).
    if (!worker) throw new RunnerError("Python stopped before the run started.", "crash")
    this.#setStatus("busy")
    try {
      return await this.#send(worker, type, payload, timeoutMs)
    } catch (error) {
      if (error instanceof TimeoutError) {
        // The code is still running (an endless loop, most likely): kill it and warm up a
        // fresh worker right away so the next Run works.
        this.#start()
        return TIMED_OUT
      }
      if (error instanceof RunnerError && error.kind === "internal" && FATAL.test(error.message)) {
        // Pyodide cannot recover from a fatal error (e.g. out of memory): start over.
        console.warn(`Python stopped: ${error.message}`)
        this.#start()
        throw new RunnerError(error.message, "crash")
      }
      throw error
    } finally {
      if (this.#worker === worker && this.#status === "busy") this.#setStatus("ready")
    }
  }

  #start(): void {
    this.#stopWorker(new RunnerError("Python restarted.", "crash"))
    const worker = this.#options.createWorker()
    this.#worker = worker
    this.#setStatus("loading")
    worker.addEventListener("message", (event) => this.#onMessage(worker, event.data))
    worker.addEventListener("error", (event) => {
      const message = event instanceof ErrorEvent && event.message ? event.message : null
      this.#crash(worker, message ?? "Python stopped unexpectedly.")
    })
    const harnessUrl =
      this.#options.harnessUrl ?? new URL("/py/harness.py", window.location.origin).toString()
    const tracerUrl =
      this.#options.tracerUrl ?? new URL("/py/tracer.py", window.location.origin).toString()
    const ready = this.#send(
      worker,
      "init",
      { indexURL: this.#options.indexURL, harnessUrl, tracerUrl },
      this.#options.initTimeoutMs
    ).then(
      () => {
        if (this.#worker === worker) this.#setStatus("ready")
      },
      (error: Error) => {
        this.#crash(worker, error.message)
        throw new RunnerError(error.message, "load")
      }
    )
    ready.catch(() => undefined) // a warm-up nobody awaits must not report an unhandled rejection
    this.#readyPromise = ready
  }

  #send(
    worker: WorkerLike,
    type: WorkerRequest["type"],
    payload: WorkerRequest["payload"],
    timeoutMs: number
  ): Promise<unknown> {
    const id = this.#nextId++
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id)
        reject(
          type === "init" ? new RunnerError("Python took too long to load.") : new TimeoutError()
        )
      }, timeoutMs)
      this.#pending.set(id, { worker, resolve, reject, timer })
      worker.postMessage({ id, type, payload } as WorkerRequest)
    })
  }

  #onMessage(worker: WorkerLike, message: WorkerResponse): void {
    const pending = this.#pending.get(message?.id)
    // Answers from a terminated worker, or for requests that already timed out, are dropped.
    if (!pending || pending.worker !== worker) return
    this.#pending.delete(message.id)
    if (pending.timer) clearTimeout(pending.timer)
    if (message.ok) pending.resolve(message.data)
    else pending.reject(new RunnerError(message.error))
  }

  #crash(worker: WorkerLike, message: string): void {
    if (this.#worker !== worker) return
    console.warn(`Python stopped: ${message}`)
    this.#stopWorker(new RunnerError(message, "crash"))
    this.#setStatus("crashed")
  }

  /** Terminates the current worker and fails its pending requests. */
  #stopWorker(reason: Error): void {
    const worker = this.#worker
    if (!worker) return
    this.#worker = null
    worker.terminate()
    for (const [id, pending] of this.#pending) {
      if (pending.worker !== worker) continue
      this.#pending.delete(id)
      if (pending.timer) clearTimeout(pending.timer)
      pending.reject(reason)
    }
  }
}

let sharedRunner: PyodideRunner | null = null

/** The app-wide runner: one worker, kept alive across problems (Section 9.1). */
export function getRunner(): PyodideRunner {
  sharedRunner ??= new PyodideRunner()
  return sharedRunner
}

/** Starts loading Python in the background (e.g. on hover of a problem link). */
export function warmUpRunner(): void {
  if (typeof window === "undefined" || typeof Worker === "undefined") return
  void getRunner()
    .ready()
    .catch(() => undefined)
}
