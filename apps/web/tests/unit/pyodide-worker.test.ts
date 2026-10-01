import { afterEach, describe, expect, it, vi } from "vitest"

import { pyodideWorkerSource } from "@/lib/runner/pyodide.worker"
import type { WorkerRequest, WorkerResponse } from "@/lib/runner/types"

// The worker runs from its own source text (a Blob module), so it must not use imports or
// module variables at runtime. Here it runs the same way: compiled from its source in a
// fresh scope, where any other free variable would throw. Pyodide is a fake.

const INDEX_URL = "https://cdn.example/pyodide/v314.0.7/full/"

interface FakeState {
  options?: unknown
  files: Record<string, string>
  imported: string[]
  traced?: unknown[]
}

function fakePyodideModule(state: FakeState) {
  return {
    async loadPyodide(options: unknown) {
      state.options = options
      return {
        version: "314.0.7",
        runPython() {},
        FS: {
          mkdirTree() {},
          writeFile(path: string, data: string) {
            state.files[path] = data
          },
        },
        pyimport(name: string) {
          state.imported.push(name)
          return {
            run_tests(code: string, _entry: string, testsJson: string, mode: string) {
              if (code.includes("raise")) throw new Error("PythonError: boom")
              const tests = JSON.parse(testsJson) as { id: string; expected: unknown }[]
              return JSON.stringify(
                tests.map((test) => ({ id: test.id, status: "pass", got: test.expected, mode }))
              )
            },
            run_traced(...args: unknown[]) {
              state.traced = args
              return JSON.stringify({ steps: [], result: { t: "prim", v: 7 }, error: null })
            },
          }
        },
      }
    },
  }
}

function startWorker() {
  const listeners: ((event: { data: WorkerRequest }) => void)[] = []
  const posted: WorkerResponse[] = []
  const state: FakeState = { files: {}, imported: [] }
  const scope = {
    postMessage: (message: WorkerResponse) => posted.push(message),
    addEventListener: (_type: string, listener: (event: { data: WorkerRequest }) => void) =>
      listeners.push(listener),
  }
  // Vitest rewrites import() into its own helper (Turbopack leaves it native): provide that
  // helper, and only that, next to `self`.
  const importModule = vi.fn(async (url: string) => {
    void url
    return fakePyodideModule(state)
  })
  const source = pyodideWorkerSource()
  expect(source).toMatch(/import\(|__vite_ssr_dynamic_import__/)
  new Function("self", "__vite_ssr_dynamic_import__", source)(scope, importModule)
  async function send(request: WorkerRequest): Promise<WorkerResponse> {
    listeners.forEach((listener) => listener({ data: request }))
    await vi.waitFor(() => {
      if (!posted.some((message) => message.id === request.id)) throw new Error("no answer yet")
    })
    return posted.find((message) => message.id === request.id) as WorkerResponse
  }
  return { send, state, importModule }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("pyodide worker", () => {
  it("loads Pyodide and the harness, then runs tests", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("def run_tests(): ...", { status: 200 }))
    )
    const worker = startWorker()

    const init = await worker.send({
      id: 1,
      type: "init",
      payload: { indexURL: INDEX_URL, harnessUrl: "http://app.test/py/harness.py" },
    })
    expect(init).toEqual({ id: 1, ok: true, data: { version: "314.0.7" } })
    expect(worker.importModule).toHaveBeenCalledWith(`${INDEX_URL}pyodide.mjs`)
    expect(worker.state.options).toMatchObject({ indexURL: INDEX_URL })
    expect(worker.state.files).toEqual({ "/seecode/seecode_harness.py": "def run_tests(): ..." })
    expect(worker.state.imported).toEqual(["seecode_harness"])
    expect(fetch).toHaveBeenCalledWith("http://app.test/py/harness.py")

    const run = await worker.send({
      id: 2,
      type: "runTests",
      payload: {
        code: "class Solution: ...",
        entry: "f",
        tests: [{ id: "a", args: [], expected: 1, hidden: false }],
      },
    })
    expect(run).toEqual({
      id: 2,
      ok: true,
      data: [{ id: "a", status: "pass", got: 1, mode: "exact" }],
    })
  })

  it("answers errors with the message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 200 }))
    )
    const worker = startWorker()
    await worker.send({
      id: 1,
      type: "init",
      payload: { indexURL: INDEX_URL, harnessUrl: "http://app.test/py/harness.py" },
    })
    const failed = await worker.send({
      id: 2,
      type: "runTests",
      payload: { code: "raise", entry: "f", tests: [] },
    })
    expect(failed).toEqual({ id: 2, ok: false, error: "PythonError: boom" })
    const trace = await worker.send({
      id: 3,
      type: "trace",
      payload: { code: "", entry: "f", args: [] },
    })
    // Started without a tracer URL: tests run, traces say why they cannot.
    expect(trace).toEqual({ id: 3, ok: false, error: "Tracing is not available." })
  })

  it("loads the tracer next to the harness and traces", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => new Response(`# ${url}`, { status: 200 }))
    )
    const worker = startWorker()
    await worker.send({
      id: 1,
      type: "init",
      payload: {
        indexURL: INDEX_URL,
        harnessUrl: "http://app.test/py/harness.py",
        tracerUrl: "http://app.test/py/tracer.py",
      },
    })
    expect(worker.state.files).toEqual({
      "/seecode/seecode_harness.py": "# http://app.test/py/harness.py",
      "/seecode/seecode_tracer.py": "# http://app.test/py/tracer.py",
    })
    expect(worker.state.imported).toEqual(["seecode_harness", "seecode_tracer"])

    const traced = await worker.send({
      id: 2,
      type: "trace",
      payload: { code: "code", entry: "f", args: [[1, 2]], viz: { primary: "nums" } },
    })
    expect(traced).toEqual({
      id: 2,
      ok: true,
      data: { steps: [], result: { t: "prim", v: 7 }, error: null },
    })
    // Missing JSON arguments go as "" (Pyodide turns a JS null into jsnull, not None).
    expect(worker.state.traced).toEqual(["code", "f", '{"args":[[1,2]]}', '{"primary":"nums"}', ""])

    await worker.send({
      id: 3,
      type: "trace",
      payload: { code: "code", entry: "MinStack", ops: [["MinStack"]], spec: { kind: "design" } },
    })
    expect(worker.state.traced).toEqual([
      "code",
      "MinStack",
      '{"ops":[["MinStack"]]}',
      "",
      '{"kind":"design"}',
    ])
  })

  it("still runs tests when the tracer cannot be downloaded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (url: string) => new Response("", { status: url.endsWith("tracer.py") ? 503 : 200 })
      )
    )
    const worker = startWorker()
    const init = await worker.send({
      id: 1,
      type: "init",
      payload: {
        indexURL: INDEX_URL,
        harnessUrl: "http://app.test/py/harness.py",
        tracerUrl: "http://app.test/py/tracer.py",
      },
    })
    expect(init.ok).toBe(true)
    const trace = await worker.send({
      id: 2,
      type: "trace",
      payload: { code: "", entry: "f", args: [] },
    })
    expect(trace).toEqual({ id: 2, ok: false, error: "Could not load the tracer (503)." })
  })

  it("reports a harness that cannot be downloaded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 404 }))
    )
    const worker = startWorker()
    const init = await worker.send({
      id: 1,
      type: "init",
      payload: { indexURL: INDEX_URL, harnessUrl: "http://app.test/py/harness.py" },
    })
    expect(init).toEqual({ id: 1, ok: false, error: "Could not load the test harness (404)." })
  })
})
