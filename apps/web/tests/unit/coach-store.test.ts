import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "@/lib/api/client"
import type { RunTestsRequest, TestResult } from "@/lib/runner/types"
import { EMPTY_PLAN } from "@/lib/workspace/plan"
import { attemptKey, readAttempt, readGuestAttempts } from "@/lib/workspace/storage"
import { createWorkspaceStore, isPlanRevealed } from "@/stores/workspace"

import {
  ATTEMPT_ID,
  HINTS,
  MemoryStorage,
  REVEAL,
  WALKTHROUGH,
  WRAP_UP,
  attemptView,
  fakeApi,
  grade,
} from "./coach-fixtures"
import { PALINDROME } from "./fixtures"

// The Workspace store's coach (Sections 7.3, 7.4, 7.8, 7.9, 11.6, 16.2): attempts, plan
// checks, hint rungs, sync, submit, wrap-up and guest mode, with a fake API and runner.

const NOW = new Date("2026-09-30T12:00:00.000Z")
const SYNC_MS = 10_000

type Answer = (req: RunTestsRequest) => TestResult[]
const allPass: Answer = (req) => req.tests.map((test) => ({ id: test.id, status: "pass" }))
const allFail: Answer = (req) =>
  req.tests.map((test) => ({ id: test.id, status: "fail", got: false }))

function setup({
  mode = "user" as "user" | "guest",
  api = fakeApi(),
  answer = allPass,
  storage = new MemoryStorage(),
} = {}) {
  const runTests = vi.fn(async (req: RunTestsRequest) => answer(req))
  const notify = vi.fn()
  const store = createWorkspaceStore({
    runner: () => ({ runTests }),
    storage: () => storage,
    now: () => NOW,
    saveDelayMs: 300,
    api: () => api,
    syncDelayMs: SYNC_MS,
    notify,
  })
  store.getState().setGuest(mode === "guest")
  store.getState().open(PALINDROME)
  return { store, api, storage, runTests, notify }
}

async function signedIn(options: Parameters<typeof setup>[0] = {}) {
  const ctx = setup(options)
  await ctx.store.getState().loadAttempt()
  return ctx
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("loading the attempt (16.2)", () => {
  it("resumes or creates the attempt with POST /attempts, once", async () => {
    const { store, api } = setup()
    expect(store.getState().coach).toBe("loading")
    await Promise.all([store.getState().loadAttempt(), store.getState().loadAttempt()])
    expect(api.start).toHaveBeenCalledTimes(1)
    expect(api.start).toHaveBeenCalledWith("valid-palindrome")
    expect(store.getState()).toMatchObject({
      coach: "ready",
      attemptId: ATTEMPT_ID,
      attemptStatus: "active",
      plan: EMPTY_PLAN,
      checksLeft: 3,
    })
  })

  it("shows an error that a retry clears", async () => {
    const api = fakeApi({ start: vi.fn().mockRejectedValueOnce(new TypeError("offline")) })
    const { store } = setup({ api })
    await store.getState().loadAttempt()
    expect(store.getState().coach).toBe("error")
    api.start.mockResolvedValueOnce(attemptView())
    await store.getState().loadAttempt()
    expect(store.getState().coach).toBe("ready")
  })

  it("never loads an attempt for a guest", async () => {
    const { store, api } = setup({ mode: "guest" })
    await store.getState().loadAttempt()
    expect(api.start).not.toHaveBeenCalled()
    expect(store.getState().coach).toBe("ready")
  })

  it("restores the plan, grade, opened rungs and results of an attempt (7.9)", async () => {
    const plan = { ...EMPTY_PLAN, pattern: "hashing", time: "O(n)" as const }
    const api = fakeApi({
      start: vi.fn(async () =>
        attemptView({
          code: "x = 1",
          plan,
          planGrade: grade({ correct: false }),
          checksLeft: 2,
          openedRungs: [HINTS[2], HINTS[1]],
          maxRung: 2,
          runs: 3,
          lastResults: [{ id: "h1", status: "fail", got: false, stdout: null }],
        })
      ),
    })
    const { store } = await signedIn({ api })
    const state = store.getState()
    expect(state.code).toBe("x = 1")
    expect(state.plan).toEqual(plan)
    expect(state.checkedPlan).toEqual(plan)
    expect(state.openedRungs.map((hint) => hint.rung)).toEqual([1, 2])
    expect(state.maxRung).toBe(2)
    expect(state.results).toEqual([{ id: "h1", status: "fail", got: false }])
    expect(state.resultsKind).toBe("submit") // a hidden test's result
  })

  it("keeps this browser's newer code when the last sync never arrived", async () => {
    const storage = new MemoryStorage()
    const offline = fakeApi({ patch: vi.fn().mockRejectedValue(new TypeError("offline")) })
    const first = await signedIn({ storage, api: offline })
    first.store.getState().setCode("typed offline")
    first.store.getState().flush() // writes localStorage; the PATCH fails
    await vi.advanceTimersByTimeAsync(0)
    expect(readAttempt(storage, PALINDROME.slug)).toMatchObject({
      attemptId: ATTEMPT_ID,
      pending: true,
    })

    const again = await signedIn({ storage })
    expect(again.store.getState().code).toBe("typed offline")
    await vi.advanceTimersByTimeAsync(SYNC_MS)
    expect(again.api.patch).toHaveBeenCalledWith(
      ATTEMPT_ID,
      expect.objectContaining({ code: "typed offline" }),
      undefined
    )
  })

  it("fades support on the first problem of a pattern (11.6)", async () => {
    const api = fakeApi({
      start: vi.fn(async () =>
        attemptView({
          fading: { givenPattern: "two_pointers_opposite", freeRungs: [1, 2] },
          openedRungs: [HINTS[1], HINTS[2]],
          maxRung: 0,
        })
      ),
    })
    const { store } = await signedIn({ api })
    expect(store.getState().plan.pattern).toBe("two_pointers_opposite")
    // The given pattern stays.
    store.getState().setPlan({ pattern: "hashing", time: "O(n)" })
    expect(store.getState().plan).toMatchObject({ pattern: "two_pointers_opposite", time: "O(n)" })
    // Free rungs do not count toward maxRung; rung 3 does.
    expect(store.getState().maxRung).toBe(0)
    await store.getState().openRung(3)
    expect(store.getState().maxRung).toBe(3)
  })
})

describe("Plan card (7.3)", () => {
  it("needs a pattern and a complexity before it asks the API", async () => {
    const { store, api } = await signedIn()
    store.getState().setPlan({ pattern: "two_pointers_opposite" })
    await store.getState().checkPlan()
    expect(api.checkPlan).not.toHaveBeenCalled()
    expect(store.getState().planError).toBe("Pick a pattern and a time or space target first.")
  })

  it("keeps at most 4 distinct structures and a 140-character twist", async () => {
    const { store } = await signedIn()
    store.getState().setPlan({ structures: ["a", "b", "a", "c", "d", "e"], twist: "x".repeat(200) })
    expect(store.getState().plan.structures).toEqual(["a", "b", "c", "d"])
    expect(store.getState().plan.twist).toHaveLength(140)
  })

  it("syncs pending runs first, then checks the plan and keeps the grade", async () => {
    const { store, api } = await signedIn()
    await store.getState().run()
    store.getState().setPlan({
      pattern: "two_pointers_opposite",
      structures: ["array"],
      time: "O(n)",
      space: "O(n)",
      twist: "  skip punctuation  ",
    })
    await store.getState().checkPlan()
    expect(api.patch).toHaveBeenCalledWith(
      ATTEMPT_ID,
      expect.objectContaining({ runsDelta: 1 }),
      undefined
    )
    expect(api.patch.mock.invocationCallOrder[0]).toBeLessThan(
      api.checkPlan.mock.invocationCallOrder[0]
    )
    expect(api.checkPlan).toHaveBeenCalledWith(ATTEMPT_ID, {
      pattern: "two_pointers_opposite",
      structures: ["array"],
      time: "O(n)",
      space: "O(n)",
      twist: "skip punctuation",
    })
    expect(store.getState()).toMatchObject({
      checksLeft: 2,
      checking: false,
      planGrade: grade(),
      plannedFirst: false, // a Run came first
    })
  })

  it("marks a plan checked before any Run as planned first", async () => {
    const { store } = await signedIn()
    store.getState().setPlan({ pattern: "hashing", time: "O(n)" })
    await store.getState().checkPlan()
    expect(store.getState().plannedFirst).toBe(true)
  })

  it("reveals the reference plan after the third check and locks the card", async () => {
    const api = fakeApi({
      checkPlan: vi.fn(async () => ({
        grade: grade({ correct: false, reveal: { ...REVEAL, structures: ["array"] } }),
        checksLeft: 0,
      })),
    })
    const { store } = await signedIn({ api })
    store.getState().setPlan({ pattern: "hashing", time: "O(n)" })
    await store.getState().checkPlan()
    expect(isPlanRevealed(store.getState())).toBe(true)
    store.getState().setPlan({ pattern: "stack" })
    expect(store.getState().plan.pattern).toBe("hashing")
    await store.getState().checkPlan()
    expect(api.checkPlan).toHaveBeenCalledTimes(1)
  })

  it("says so when every check is used", async () => {
    const api = fakeApi({
      checkPlan: vi
        .fn()
        .mockRejectedValue(new ApiError(409, "plan_checks_exhausted", "All 3 plan checks used.")),
    })
    const { store } = await signedIn({ api })
    store.getState().setPlan({ pattern: "hashing", time: "O(n)" })
    await store.getState().checkPlan()
    expect(store.getState()).toMatchObject({
      checksLeft: 0,
      planError: "You've used all 3 plan checks for this attempt.",
    })
  })

  it("grades a guest's plan with the guest endpoint and counts the checks", async () => {
    const api = fakeApi({
      guestCheckPlan: vi.fn(async () => ({ grade: grade({ correct: true }) })),
    })
    const { store } = setup({ mode: "guest", api })
    await store.getState().openRung(1)
    store.getState().setPlan({ pattern: "two_pointers_opposite", space: "O(1)" })
    await store.getState().checkPlan()
    await store.getState().checkPlan()
    expect(api.guestCheckPlan).toHaveBeenNthCalledWith(1, PALINDROME.slug, expect.any(Object), 1, 1)
    expect(api.guestCheckPlan).toHaveBeenNthCalledWith(2, PALINDROME.slug, expect.any(Object), 2, 1)
    expect(store.getState()).toMatchObject({ checksLeft: 1, planFirstCorrect: true })
  })
})

describe("hint ladder (7.4)", () => {
  it("opens rungs strictly in order", async () => {
    const { store, api } = await signedIn()
    await store.getState().openRung(2)
    expect(api.openRung).not.toHaveBeenCalled()
    await store.getState().openRung(1)
    await store.getState().openNextRung()
    expect(api.openRung.mock.calls.map((call) => call[1])).toEqual([1, 2])
    expect(store.getState().openedRungs.map((hint) => hint.rung)).toEqual([1, 2])
    expect(store.getState().maxRung).toBe(2)
  })

  it("reveals the plan from rung 3 and hides the plan-first tip", async () => {
    const api = fakeApi({
      start: vi.fn(async () => attemptView({ openedRungs: [HINTS[1], HINTS[2]], maxRung: 2 })),
    })
    const { store } = await signedIn({ api })
    await store.getState().run()
    expect(store.getState().runTip).toBe(true)
    await store.getState().openRung(3)
    expect(isPlanRevealed(store.getState())).toBe(true)
    expect(store.getState().runTip).toBe(false)
  })

  it("rung 5 opens the walkthrough in the bottom panel", async () => {
    const opened = [1, 2, 3, 4].map((rung) => HINTS[rung as 1])
    const api = fakeApi({ start: vi.fn(async () => attemptView({ openedRungs: opened })) })
    const { store } = await signedIn({ api })
    const focus = store.getState().bottomFocus
    await store.getState().openRung(5)
    expect(store.getState()).toMatchObject({
      walkthrough: WALKTHROUGH,
      bottomTab: "walkthrough",
      bottomFocus: focus + 1,
    })
  })

  it("takes the API's rungs when another tab opened one", async () => {
    const api = fakeApi({
      openRung: vi.fn().mockRejectedValue(new ApiError(409, "rung_order", "Open rung 2 first.")),
      get: vi.fn(async () => attemptView({ openedRungs: [HINTS[1]], maxRung: 1 })),
    })
    const { store } = await signedIn({ api })
    await store.getState().openRung(1)
    expect(store.getState().openedRungs).toEqual([HINTS[1]])
    expect(store.getState().hintError).toBeNull()
  })

  it("keeps a calm message when a rung cannot load", async () => {
    const api = fakeApi({ openRung: vi.fn().mockRejectedValue(new TypeError("offline")) })
    const { store } = await signedIn({ api })
    await store.getState().openRung(1)
    expect(store.getState()).toMatchObject({
      openingRung: null,
      hintError: "Couldn't reach SeeCode. Check your connection, then try again.",
    })
  })
})

describe("sync (7.9)", () => {
  it("sends code, runs and results 10 s after the first change, then reads Saved", async () => {
    const { store, api } = await signedIn()
    store.getState().setCode("x = 1")
    await store.getState().run()
    store.getState().dismissRunTip()
    expect(store.getState().dirty).toBe(true)
    await vi.advanceTimersByTimeAsync(SYNC_MS - 1)
    expect(api.patch).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(api.patch).toHaveBeenCalledTimes(1)
    expect(api.patch).toHaveBeenCalledWith(
      ATTEMPT_ID,
      {
        code: "x = 1",
        runsDelta: 1,
        lastResults: [
          { id: "e1", status: "pass" },
          { id: "e2", status: "pass" },
        ],
      },
      undefined
    )
    expect(store.getState().dirty).toBe(false)
  })

  it("sends active time alone only once a minute has gathered", async () => {
    const { store, api } = await signedIn()
    store.getState().addActiveSeconds(59)
    await vi.advanceTimersByTimeAsync(SYNC_MS * 2)
    expect(api.patch).not.toHaveBeenCalled()
    store.getState().addActiveSeconds(1)
    await vi.advanceTimersByTimeAsync(SYNC_MS)
    expect(api.patch).toHaveBeenCalledWith(ATTEMPT_ID, { activeSecondsDelta: 60 }, undefined)
  })

  it("flushes with a keepalive request when the page hides", async () => {
    const { store, api } = await signedIn()
    store.getState().setCode("leaving")
    store.getState().flush()
    await vi.advanceTimersByTimeAsync(0)
    expect(api.patch).toHaveBeenCalledWith(ATTEMPT_ID, { code: "leaving" }, { keepalive: true })
  })

  it("keeps work and says so once when a sync fails, then tries again", async () => {
    const patch = vi.fn().mockRejectedValue(new TypeError("offline"))
    const api = fakeApi({ patch })
    const { store, notify } = await signedIn({ api })
    store.getState().setCode("x = 1")
    await vi.advanceTimersByTimeAsync(SYNC_MS)
    await vi.advanceTimersByTimeAsync(SYNC_MS)
    expect(api.patch).toHaveBeenCalledTimes(2)
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith(
      "Couldn't save to your account",
      "Your work is kept in this browser. SeeCode will try again shortly."
    )
    patch.mockResolvedValue({ ok: true, updatedAt: "2026-09-30T12:00:00Z" })
    await vi.advanceTimersByTimeAsync(SYNC_MS)
    expect(api.patch).toHaveBeenLastCalledWith(ATTEMPT_ID, { code: "x = 1" }, undefined)
    expect(store.getState().dirty).toBe(false)
  })

  it("stops when the attempt ended in another tab", async () => {
    const api = fakeApi({
      patch: vi.fn().mockRejectedValue(new ApiError(409, "conflict", "ended")),
      get: vi.fn(async () => attemptView({ status: "finished", outcome: "gave_up" })),
    })
    const { store } = await signedIn({ api })
    store.getState().setCode("x = 1")
    await vi.advanceTimersByTimeAsync(SYNC_MS)
    expect(store.getState()).toMatchObject({
      attemptStatus: "finished",
      outcome: "gave_up",
      notice: "This attempt ended in another tab or window. Start over to keep going.",
    })
    await vi.advanceTimersByTimeAsync(SYNC_MS * 3)
    expect(api.patch).toHaveBeenCalledTimes(1)
  })
})

describe("plan-first tip (7.3)", () => {
  it("shows once on the first Run before a check; Skip records it", async () => {
    const { store, api } = await signedIn()
    await store.getState().run()
    expect(store.getState().runTip).toBe(true)
    store.getState().skipPlanTip()
    expect(store.getState()).toMatchObject({ runTip: false, planSkipped: true })
    await store.getState().run()
    expect(store.getState().runTip).toBe(false)
    await vi.advanceTimersByTimeAsync(SYNC_MS)
    expect(api.patch).toHaveBeenCalledWith(
      ATTEMPT_ID,
      expect.objectContaining({ planSkipped: true, runsDelta: 2 }),
      undefined
    )
  })

  it("does not show after a plan check", async () => {
    const { store } = await signedIn()
    store.getState().setPlan({ pattern: "hashing", time: "O(n)" })
    await store.getState().checkPlan()
    await store.getState().run()
    expect(store.getState().runTip).toBe(false)
  })
})

describe("Submit and the wrap-up (7.8)", () => {
  it("a passing Submit ends the attempt with the API's wrap-up", async () => {
    const { store, api } = await signedIn()
    await store.getState().submit()
    await vi.advanceTimersByTimeAsync(0)
    expect(api.submit).toHaveBeenCalledWith(
      ATTEMPT_ID,
      PALINDROME.starterCode,
      expect.arrayContaining([{ id: "h1", status: "pass" }])
    )
    expect(store.getState()).toMatchObject({
      attemptStatus: "finished",
      outcome: "solved_clean",
      solved: true,
      wrapUpOpen: true,
      wrapUp: { guest: false, outcome: "solved_clean", ...WRAP_UP },
    })
    // A finished attempt syncs nothing more.
    store.getState().setCode("after")
    await vi.advanceTimersByTimeAsync(SYNC_MS)
    expect(api.patch).not.toHaveBeenCalledWith(ATTEMPT_ID, expect.anything(), undefined)
  })

  it("a failing Submit stores its results and keeps the attempt active", async () => {
    const api = fakeApi({ submit: vi.fn(async () => ({ passed: false })) })
    const { store } = await signedIn({ api, answer: allFail })
    await store.getState().submit()
    await vi.advanceTimersByTimeAsync(0)
    expect(api.submit).toHaveBeenCalled()
    expect(store.getState()).toMatchObject({ attemptStatus: "active", solved: false, wrapUp: null })
  })

  it("offers Try again when the solve could not be saved", async () => {
    const api = fakeApi({
      submit: vi
        .fn(async () => ({ passed: true, outcome: "solved_clean" as const, wrapUp: WRAP_UP }))
        .mockRejectedValueOnce(new TypeError("offline")),
    })
    const { store } = await signedIn({ api })
    await store.getState().submit()
    await vi.advanceTimersByTimeAsync(0)
    expect(store.getState().submitError).toBe(
      "Your solve isn't saved to your account yet. Check your connection, then try again."
    )
    await store.getState().retrySubmit()
    expect(api.submit).toHaveBeenCalledTimes(2)
    expect(store.getState()).toMatchObject({ submitError: null, wrapUpOpen: true })
  })

  it("sends a Submit made before the attempt arrived once it does", async () => {
    const { store, api } = setup()
    await store.getState().submit()
    expect(api.submit).not.toHaveBeenCalled()
    await store.getState().loadAttempt()
    await vi.advanceTimersByTimeAsync(0)
    expect(api.submit).toHaveBeenCalledTimes(1)
    expect(store.getState().wrapUpOpen).toBe(true)
  })

  it("See it run loads the walkthrough of a solved problem", async () => {
    const { store, api } = await signedIn()
    await store.getState().submit()
    await vi.advanceTimersByTimeAsync(0)
    await store.getState().showWalkthrough()
    expect(api.walkthrough).toHaveBeenCalledWith(PALINDROME.slug)
    expect(store.getState()).toMatchObject({ walkthrough: WALKTHROUGH, bottomTab: "walkthrough" })
  })
})

describe("End attempt and Start over (7.9)", () => {
  it("End attempt records gave_up", async () => {
    const { store, api } = await signedIn()
    store.getState().setCode("unsent")
    expect(await store.getState().end()).toBe(true)
    expect(api.patch).toHaveBeenCalledWith(ATTEMPT_ID, { code: "unsent" }, undefined)
    expect(api.end).toHaveBeenCalledWith(ATTEMPT_ID)
    expect(store.getState()).toMatchObject({ attemptStatus: "finished", outcome: "gave_up" })
  })

  it("Start over applies the new attempt and drops a run still going", async () => {
    let finish: (results: TestResult[]) => void = () => {}
    const { store, api, runTests } = await signedIn()
    runTests.mockImplementationOnce(
      () =>
        new Promise<TestResult[]>((resolve) => {
          finish = resolve
        })
    )
    store.getState().setCode("old")
    const running = store.getState().run()
    expect(store.getState().running).toBe("run")
    expect(await store.getState().restart()).toBe(true)
    expect(api.restart).toHaveBeenCalledWith(ATTEMPT_ID)
    expect(store.getState()).toMatchObject({
      attemptId: "7b1e0000-0000-4000-8000-000000000002",
      code: PALINDROME.starterCode,
      running: "idle",
      results: null,
      openedRungs: [],
    })
    finish([{ id: "e1", status: "pass" }])
    await running
    expect(store.getState().results).toBeNull()
  })

  it("a guest's Start over keeps the old attempt for import", async () => {
    const { store, storage } = setup({ mode: "guest" })
    store.getState().setCode("first try")
    store.getState().flush()
    await store.getState().restart()
    expect(store.getState().code).toBe(PALINDROME.starterCode)
    expect(storage.getItem(attemptKey(PALINDROME.slug))).toBeNull()
    expect(readGuestAttempts(storage)).toEqual([
      expect.objectContaining({ code: "first try", solved: false }),
    ])
  })
})

describe("guest mode (16.2)", () => {
  it("rebuilds the wrap-up from this browser, then names the pattern with rung 3", async () => {
    const { store, api } = setup({ mode: "guest" })
    store.getState().setPlan({ pattern: "two_pointers_opposite", time: "O(n)" })
    await store.getState().checkPlan()
    store.getState().addActiveSeconds(42)
    await store.getState().submit()
    await vi.advanceTimersByTimeAsync(0)
    expect(api.guestHint).toHaveBeenCalledWith(PALINDROME.slug, 3)
    expect(store.getState()).toMatchObject({
      attemptStatus: "finished",
      wrapUpOpen: true,
      wrapUp: {
        guest: true,
        patternId: REVEAL.patternId,
        twist: REVEAL.twist,
        planRightFirstTime: true,
        timeSeconds: 42,
        nextReviewAt: null,
      },
    })
  })

  it("keeps the plan, checks and rungs in this browser across reloads", async () => {
    const storage = new MemoryStorage()
    const first = setup({ mode: "guest", storage })
    await first.store.getState().openRung(1)
    first.store.getState().setPlan({ pattern: "hashing", time: "O(n)" })
    await first.store.getState().checkPlan()
    first.store.getState().flush()

    const again = setup({ mode: "guest", storage })
    expect(again.store.getState()).toMatchObject({
      plan: expect.objectContaining({ pattern: "hashing" }),
      checksLeft: 2,
      planGrade: grade(),
      openedRungs: [HINTS[1]],
      maxRung: 1,
    })
    expect(readGuestAttempts(storage)[0]).toMatchObject({
      slug: PALINDROME.slug,
      maxRung: 1,
      planChecks: 1,
      plan: expect.objectContaining({ pattern: "hashing" }),
    })
  })

  it("a guest never sees a signed-in user's code from this browser", async () => {
    const storage = new MemoryStorage()
    const user = await signedIn({ storage })
    user.store.getState().setCode("secret")
    user.store.getState().flush()
    const guest = setup({ mode: "guest", storage })
    expect(guest.store.getState().code).toBe(PALINDROME.starterCode)
  })
})
