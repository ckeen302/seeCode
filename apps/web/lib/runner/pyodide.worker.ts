// The Pyodide worker (Section 9.1). It loads the pinned Pyodide release from jsDelivr and
// public/py/harness.py and tracer.py, then answers typed requests: { id, type, payload } ->
// { id, ok, data | error }. The main thread (runner.ts) owns every timeout: an endless
// loop here is stopped by terminating the worker, never from inside it.
//
// Pyodide only runs in module workers, and Turbopack bundles `new Worker(new URL(...))` as a
// classic worker. So runner.ts starts a module worker from this function's source text
// (a Blob URL). The function must therefore be self-contained: it may use globals, but no
// imports or module-level variables at runtime (type imports are fine; they are erased).
// tests/unit/pyodide-worker.test.ts runs it in a clean scope to check exactly that.
import type {
  InitPayload,
  RunTestsRequest,
  TraceRequest,
  WorkerRequest,
  WorkerResponse,
} from "@/lib/runner/types"

/** What the worker needs from its global scope. */
export interface WorkerScope {
  postMessage(message: WorkerResponse): void
  addEventListener(type: "message", listener: (event: MessageEvent<WorkerRequest>) => void): void
}

export function pyodideWorkerMain(scope: WorkerScope): void {
  // The small part of the Pyodide API used here.
  interface HarnessModule {
    run_tests(
      code: string,
      entry: string,
      testsJson: string,
      mode: string,
      specJson: string | null
    ): unknown
  }
  interface TracerModule {
    run_traced(
      code: string,
      entry: string,
      inputJson: string,
      vizJson: string | null,
      specJson: string | null
    ): unknown
  }
  interface PyodideApi {
    version: string
    runPython(code: string): unknown
    pyimport(name: string): HarnessModule & TracerModule
    FS: { mkdirTree(path: string): void; writeFile(path: string, data: string): void }
  }
  interface PyodideModule {
    loadPyodide(options: {
      indexURL: string
      stdin?: () => string | null
      stdout?: (text: string) => void
      stderr?: (text: string) => void
    }): Promise<PyodideApi>
  }

  const harnessDir = "/seecode"
  const harnessModule = "seecode_harness"
  // tracer.py imports the harness by this name.
  const tracerModule = "seecode_tracer"
  let harness: HarnessModule | null = null
  let tracer: TracerModule | null = null
  // Why the tracer did not load; tests still run without it.
  let tracerProblem: string | null = null

  function trace({ code, entry, args, ops, viz, spec }: TraceRequest): unknown {
    if (!tracer) throw new Error(tracerProblem ?? "Python is not ready yet.")
    const input = ops ? { ops } : { args: args ?? [] }
    const json = tracer.run_traced(
      code,
      entry,
      JSON.stringify(input),
      // Pyodide hands JS null to Python as jsnull, not None: send "" for "none".
      viz ? JSON.stringify(viz) : "",
      spec ? JSON.stringify(spec) : ""
    )
    return JSON.parse(String(json))
  }

  function runTests({ code, entry, tests, compare, spec }: RunTestsRequest): unknown {
    if (!harness) throw new Error("Python is not ready yet.")
    const json = harness.run_tests(
      code,
      entry,
      JSON.stringify(tests),
      compare ?? "exact",
      spec ? JSON.stringify(spec) : null
    )
    return JSON.parse(String(json))
  }

  async function init({
    indexURL,
    harnessUrl,
    tracerUrl,
  }: InitPayload): Promise<{ version: string }> {
    const tracerSource: Promise<string | null> = tracerUrl
      ? fetch(tracerUrl).then(
          (response) => {
            if (response.ok) return response.text()
            tracerProblem = `Could not load the tracer (${response.status}).`
            return null
          },
          () => {
            tracerProblem = "Could not load the tracer."
            return null
          }
        )
      : Promise.resolve(null)
    const [pyodideModule, harnessSource] = await Promise.all([
      // Loaded at runtime from the CDN, never bundled.
      import(/* webpackIgnore: true */ `${indexURL}pyodide.mjs`) as Promise<PyodideModule>,
      fetch(harnessUrl).then((response) => {
        if (!response.ok) throw new Error(`Could not load the test harness (${response.status}).`)
        return response.text()
      }),
    ])
    const pyodide = await pyodideModule.loadPyodide({
      indexURL,
      // input() reads end-of-file instead of blocking; start-up chatter stays out of the console.
      stdin: () => null,
      stdout: () => {},
      stderr: (text) => console.warn(text),
    })
    pyodide.FS.mkdirTree(harnessDir)
    pyodide.FS.writeFile(`${harnessDir}/${harnessModule}.py`, harnessSource)
    pyodide.runPython(`import sys\nsys.path.insert(0, ${JSON.stringify(harnessDir)})`)
    harness = pyodide.pyimport(harnessModule)
    const tracerText = await tracerSource
    if (tracerText !== null) {
      pyodide.FS.writeFile(`${harnessDir}/${tracerModule}.py`, tracerText)
      tracer = pyodide.pyimport(tracerModule)
    } else {
      tracerProblem ??= "Tracing is not available."
    }
    // Warm-up run: imports and compiles what a real run touches, so the first Run is fast.
    runTests({
      code: "class Solution:\n    def f(self):\n        return 1\n",
      entry: "f",
      tests: [{ id: "warmup", args: [], expected: 1, hidden: false }],
    })
    return { version: pyodide.version }
  }

  async function handle(request: WorkerRequest): Promise<unknown> {
    switch (request.type) {
      case "init":
        return init(request.payload)
      case "runTests":
        return runTests(request.payload)
      case "trace":
        return trace(request.payload)
      default:
        throw new Error("Unknown request.")
    }
  }

  scope.addEventListener("message", (event) => {
    const request = event.data
    handle(request).then(
      (data) => scope.postMessage({ id: request.id, ok: true, data }),
      (error: unknown) =>
        scope.postMessage({
          id: request.id,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        })
    )
  })
}

/** The module a worker runs: pyodideWorkerMain applied to the worker's global scope. */
export function pyodideWorkerSource(): string {
  return `(${pyodideWorkerMain.toString()})(self);\n`
}
