// Runner types (Sections 8.3 and 9). Shared by the main thread and the Pyodide worker.

export type CompareMode = "exact" | "unordered" | "unordered_nested" | "float" | "checker"

/**
 * One test for the harness. Custom cases (7.5) leave out `expected`. A function problem's
 * test has `args`; a design problem's has `ops`, its calls `[name, ...args]` in order.
 */
export interface TestCase {
  id: string
  args?: unknown[]
  ops?: unknown[][]
  expected?: unknown
  hidden: boolean
  compare?: CompareMode
}

export type TestStatus = "pass" | "fail" | "error" | "timeout"

export interface TestResult {
  id: string
  status: TestStatus
  got?: unknown
  /** `got` is the Python repr of a value JSON cannot hold (nan, an object…), not a string. */
  gotRepr?: boolean
  stdout?: string
  error?: string
  ms?: number
}

/** How the harness runs a problem: its `kind`, `io` and `checker` (harness.py's spec_json). */
export interface ProblemSpec {
  kind?: "function" | "design"
  io?: unknown
  checker?: string | null
}

export interface RunTestsRequest {
  code: string
  entry: string
  tests: TestCase[]
  compare?: CompareMode
  spec?: ProblemSpec
}

export interface TraceRequest {
  code: string
  entry: string
  args: unknown[]
  viz?: unknown
}

/** Section 8.3. The tracer arrives in M4; the type is here so the Runner interface is complete. */
export interface Trace {
  steps: unknown[]
  result: unknown
  error: string | null
  truncated: boolean
}

export type RunnerStatus = "loading" | "ready" | "busy" | "crashed"

export interface Runner {
  ready(): Promise<void>
  runTests(req: RunTestsRequest): Promise<TestResult[]>
  trace(req: TraceRequest): Promise<Trace>
  readonly status: RunnerStatus
}

// ---------------------------------------------------------------- worker messages (9.1)

export interface InitPayload {
  /** Pyodide's CDN folder, ending in "/". */
  indexURL: string
  /** Absolute URL of public/py/harness.py. */
  harnessUrl: string
}

export type WorkerRequest =
  | { id: number; type: "init"; payload: InitPayload }
  | { id: number; type: "runTests"; payload: RunTestsRequest }
  | { id: number; type: "trace"; payload: TraceRequest }

export type WorkerResponse =
  { id: number; ok: true; data: unknown } | { id: number; ok: false; error: string }
