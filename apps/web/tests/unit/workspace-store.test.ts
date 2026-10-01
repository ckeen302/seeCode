import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { RunnerError } from "@/lib/runner/runner"
import type { RunTestsRequest, TestResult } from "@/lib/runner/types"
import {
  GUEST_ATTEMPTS_KEY,
  attemptKey,
  localStatus,
  readAttempt,
  readGuestAttempts,
  type StorageLike,
} from "@/lib/workspace/storage"
import { allTestsPassed, createWorkspaceStore } from "@/stores/workspace"

import { PALINDROME, TWO_SUM } from "./fixtures"

// Workspace store (Section 17.2, M2 subset) with a fake runner and in-memory storage.

class MemoryStorage implements StorageLike {
  items = new Map<string, string>()
  getItem(key: string) {
    return this.items.get(key) ?? null
  }
  setItem(key: string, value: string) {
    this.items.set(key, value)
  }
  removeItem(key: string) {
    this.items.delete(key)
  }
}

const NOW = new Date("2026-09-30T12:00:00.000Z")

function setup(answer?: (req: RunTestsRequest) => TestResult[] | Promise<TestResult[]>) {
  const storage = new MemoryStorage()
  const runTests = vi.fn(
    async (req: RunTestsRequest) =>
      answer?.(req) ?? req.tests.map((test) => ({ id: test.id, status: "pass" as const }))
  )
  const store = createWorkspaceStore({
    runner: () => ({ runTests }),
    storage: () => storage,
    now: () => NOW,
    saveDelayMs: 300,
  })
  return { store, storage, runTests }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("workspace store", () => {
  it("opens a problem with its starter code", () => {
    const { store } = setup()
    store.getState().open(PALINDROME)
    expect(store.getState()).toMatchObject({
      slug: "valid-palindrome",
      code: PALINDROME.starterCode,
      dirty: false,
      results: null,
      running: "idle",
      bottomTab: "tests",
      customCases: [],
      solved: false,
    })
  })

  it("saves code and custom cases per problem, coalescing writes", () => {
    const { store, storage } = setup()
    store.getState().open(PALINDROME)
    store.getState().setCode("x = 1")
    store.getState().setCode("x = 2")
    expect(store.getState().dirty).toBe(true)
    expect(storage.getItem(attemptKey("valid-palindrome"))).toBeNull()
    vi.advanceTimersByTime(300)
    expect(readAttempt(storage, "valid-palindrome")).toEqual({
      v: 1,
      code: "x = 2",
      customCases: [],
      solved: false,
      startedAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
      solvedAt: null,
    })
    store.getState().addCustomCase(["abc"])
    store.getState().flush()
    expect(readAttempt(storage, "valid-palindrome")?.customCases).toEqual([
      { id: "custom-1", args: ["abc"] },
    ])
  })

  it("resumes saved work when the problem is opened again", () => {
    const { store, storage } = setup()
    store.getState().open(PALINDROME)
    store.getState().setCode("saved code")
    store.getState().addCustomCase(["racecar"])
    store.getState().open(TWO_SUM) // saves the previous problem first
    expect(store.getState().code).toBe(TWO_SUM.starterCode)
    expect(localStatus(storage, "valid-palindrome")).toBe("attempted")

    const again = setup()
    again.storage.items = storage.items
    again.store.getState().open(PALINDROME)
    expect(again.store.getState()).toMatchObject({
      code: "saved code",
      customCases: [{ id: "custom-1", args: ["racecar"] }],
      dirty: false,
    })
  })

  it("opening a problem alone does not start an attempt", () => {
    const { store, storage } = setup()
    store.getState().open(PALINDROME)
    store.getState().setCode(PALINDROME.starterCode)
    store.getState().flush()
    vi.advanceTimersByTime(1000)
    expect(storage.items.size).toBe(0)
  })

  it("Run sends the visible tests and the custom cases", async () => {
    const { store, runTests } = setup()
    store.getState().open(PALINDROME)
    store.getState().setCode("my code")
    store.getState().addCustomCase(["racecar"])
    await store.getState().run()
    expect(runTests).toHaveBeenCalledWith({
      code: "my code",
      entry: "isPalindrome",
      tests: [
        { id: "e1", args: ["Top spot!"], expected: true, hidden: false },
        { id: "e2", args: ["Top 2 spot"], expected: false, hidden: false },
        { id: "custom-1", args: ["racecar"], hidden: false },
      ],
    })
    expect(store.getState()).toMatchObject({ resultsKind: "run", running: "idle", solved: false })
    expect(store.getState().results).toHaveLength(3)
  })

  it("Submit runs every test and marks the problem solved when all pass", async () => {
    const { store, storage, runTests } = setup()
    store.getState().open(TWO_SUM)
    await store.getState().submit()
    const request = runTests.mock.calls[0][0]
    expect(request.tests.map((test) => test.id)).toEqual(["e1", "h1"])
    expect(request.tests[0]).toMatchObject({ compare: "unordered", hidden: false })
    expect(request.tests[1]).toMatchObject({ hidden: true })
    expect(store.getState()).toMatchObject({
      solved: true,
      solvedAt: NOW.toISOString(),
      resultsKind: "submit",
    })
    expect(readAttempt(storage, "two-sum")).toMatchObject({ solved: true })
    expect(localStatus(storage, "two-sum")).toBe("solved")
  })

  it("a failing Submit does not solve, and solved stays solved", async () => {
    let fail = true
    const { store } = setup((req) =>
      req.tests.map((test) => ({ id: test.id, status: fail && test.hidden ? "fail" : "pass" }))
    )
    store.getState().open(PALINDROME)
    await store.getState().submit()
    expect(store.getState().solved).toBe(false)
    fail = false
    await store.getState().submit()
    expect(store.getState().solved).toBe(true)
    fail = true
    await store.getState().submit()
    expect(store.getState().solved).toBe(true)
  })

  it("ignores a second run while one is in progress", async () => {
    let finish: (results: TestResult[]) => void = () => {}
    const { store, runTests } = setup(() => new Promise((resolve) => (finish = resolve)))
    store.getState().open(PALINDROME)
    const first = store.getState().run()
    expect(store.getState().running).toBe("run")
    await store.getState().submit()
    expect(runTests).toHaveBeenCalledTimes(1)
    finish([])
    await first
    expect(store.getState().running).toBe("idle")
  })

  it("drops results that arrive after the user moved to another problem", async () => {
    let finish: (results: TestResult[]) => void = () => {}
    const { store } = setup(() => new Promise((resolve) => (finish = resolve)))
    store.getState().open(PALINDROME)
    const run = store.getState().run()
    store.getState().open(TWO_SUM)
    finish([{ id: "e1", status: "pass" }])
    await run
    expect(store.getState()).toMatchObject({ slug: "two-sum", results: null, running: "idle" })
  })

  it("keeps the runner's error, and which action failed, for the Tests panel", async () => {
    const { store } = setup(() =>
      Promise.reject(new RunnerError("Python took too long to load.", "load"))
    )
    store.getState().open(PALINDROME)
    await store.getState().submit()
    expect(store.getState()).toMatchObject({
      running: "idle",
      runError: { kind: "submit", reason: "load", message: "Python took too long to load." },
      results: null,
    })
    await store.getState().run()
    expect(store.getState().runError).toMatchObject({ kind: "run", reason: "load" })
  })

  it("treats an unexpected error as internal", async () => {
    const { store } = setup(() => Promise.reject(new TypeError("x is undefined")))
    store.getState().open(PALINDROME)
    await store.getState().run()
    expect(store.getState().runError).toEqual({
      kind: "run",
      reason: "internal",
      message: "x is undefined",
    })
  })

  it("switches to the Tests tab when a run starts", async () => {
    const { store } = setup()
    store.getState().open(PALINDROME)
    store.getState().setBottomTab("walkthrough")
    await store.getState().run()
    expect(store.getState().bottomTab).toBe("tests")
  })

  it("keeps guest attempts in seecode:guest:attempts", async () => {
    const { store, storage } = setup()
    store.getState().setGuest(true)
    store.getState().open(PALINDROME)
    store.getState().setCode("guest code")
    await store.getState().submit()
    expect(readGuestAttempts(storage)).toEqual([
      {
        slug: "valid-palindrome",
        code: "guest code",
        solved: true,
        startedAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
        solvedAt: NOW.toISOString(),
      },
    ])
    store.getState().open(TWO_SUM)
    store.getState().setCode("two sum code")
    store.getState().flush()
    expect(readGuestAttempts(storage).map((attempt) => attempt.slug)).toEqual([
      "valid-palindrome",
      "two-sum",
    ])
    expect(JSON.parse(storage.getItem(GUEST_ATTEMPTS_KEY) ?? "[]")).toHaveLength(2)
  })

  it("does not write guest attempts for signed-in users", async () => {
    const { store, storage } = setup()
    store.getState().setGuest(false)
    store.getState().open(PALINDROME)
    store.getState().setCode("mine")
    await store.getState().run()
    expect(readGuestAttempts(storage)).toEqual([])
    expect(readAttempt(storage, "valid-palindrome")?.code).toBe("mine")
  })

  it("edits and removes custom cases, with their results", async () => {
    const { store } = setup()
    store.getState().open(PALINDROME)
    const id = store.getState().addCustomCase(["a"]) as string
    store.getState().updateCustomCase(id, ["b"])
    expect(store.getState().customCases).toEqual([{ id, args: ["b"] }])
    await store.getState().run()
    expect(store.getState().results?.map((result) => result.id)).toContain(id)
    store.getState().removeCustomCase(id)
    expect(store.getState().customCases).toEqual([])
    expect(store.getState().results?.map((result) => result.id)).not.toContain(id)
  })

  it("drops a custom case's output once its input changes", async () => {
    const { store } = setup()
    store.getState().open(PALINDROME)
    const id = store.getState().addCustomCase(["a"]) as string
    await store.getState().run()
    const before = store.getState().results
    store.getState().updateCustomCase(id, ["a"]) // the same input: the output still holds
    expect(store.getState().results).toBe(before)
    store.getState().updateCustomCase(id, ["b"])
    expect(store.getState().results?.map((result) => result.id)).toEqual(["e1", "e2"])
  })

  it("never stores code over 50 KB (Section 20), keeping the last code within it", () => {
    const { store, storage } = setup()
    store.getState().setGuest(true)
    store.getState().open(PALINDROME)
    store.getState().setCode("small = 1")
    store.getState().flush()
    store.getState().setCode(`# ${"é".repeat(26 * 1024)}`) // 52 KB in UTF-8, 26 K characters
    store.getState().addCustomCase(["kept"])
    store.getState().flush()
    expect(readAttempt(storage, "valid-palindrome")).toMatchObject({
      code: "small = 1",
      customCases: [{ id: "custom-1", args: ["kept"] }],
    })
    expect(readGuestAttempts(storage)[0].code).toBe("small = 1")
    store.getState().setCode("small = 2")
    store.getState().flush()
    expect(readAttempt(storage, "valid-palindrome")?.code).toBe("small = 2")
  })

  it("refuses custom case arguments over 10 KB (Section 20)", () => {
    const { store } = setup()
    store.getState().open(PALINDROME)
    const big = ["x".repeat(10 * 1024)]
    expect(store.getState().addCustomCase(big)).toBeNull()
    const id = store.getState().addCustomCase(["a"]) as string
    store.getState().updateCustomCase(id, big)
    expect(store.getState().customCases).toEqual([{ id, args: ["a"] }])
  })

  it("allows at most 10 custom cases", () => {
    const { store } = setup()
    store.getState().open(PALINDROME)
    for (let i = 0; i < 10; i++) expect(store.getState().addCustomCase([String(i)])).not.toBeNull()
    expect(store.getState().addCustomCase(["one too many"])).toBeNull()
  })

  it("ignores unreadable saved data", () => {
    const { store, storage } = setup()
    storage.setItem(attemptKey("valid-palindrome"), "{not json")
    storage.setItem(GUEST_ATTEMPTS_KEY, '[{"slug": 1}]')
    store.getState().open(PALINDROME)
    expect(store.getState().code).toBe(PALINDROME.starterCode)
    expect(readGuestAttempts(storage)).toEqual([])
  })
})

describe("allTestsPassed (Section 16.2)", () => {
  it("needs a passing result for every visible and hidden test", () => {
    const all = PALINDROME.tests.map((test) => ({ id: test.id, status: "pass" as const }))
    expect(allTestsPassed(PALINDROME, all)).toBe(true)
    expect(allTestsPassed(PALINDROME, all.slice(1))).toBe(false)
    expect(allTestsPassed(PALINDROME, [...all.slice(1), { id: "e1", status: "fail" }])).toBe(false)
  })
})
