// Workspace store (Section 17.2): the problem, code, results, Run/Submit, custom cases, and
// the attempt: Plan card, hint ladder, wrap-up.
//
// Signed-in users work on an API attempt (Section 16.2): `attach` takes the AttemptView from
// `POST /attempts` (resume or create), and changes are synced with `PATCH /attempts/{id}` every
// 10 s while there are any, and on page hide (Section 7.9). Plan checks, hint rungs, Submit
// and Give up go to the API too. Guests get the same coach through the guest endpoints and
// keep everything in localStorage (`seecode:attempt:{slug}`, `seecode:guest:attempts`).
import { useStore } from "zustand"
import { createStore, type StoreApi } from "zustand/vanilla"

import { createAttemptApi, type AttemptApi, type AttemptPatch } from "@/lib/api/attempts"
import { ApiError } from "@/lib/api/client"
import { api as apiClient } from "@/lib/api/hooks"
import type {
  AttemptStatus,
  AttemptView,
  Fading,
  HintContent,
  Outcome,
  PlanCard,
  PlanGrade,
  ProblemPublic,
  RelatedProblem,
  WalkthroughPayload,
} from "@/lib/api/schemas"
import { RunnerError, getRunner, type RunnerErrorKind } from "@/lib/runner/runner"
import type { Runner, TestCase, TestResult } from "@/lib/runner/types"
import { toast } from "@/lib/toast"
import { MAX_CUSTOM_CASES, customArgsTooLarge, nextCustomCaseId } from "@/lib/workspace/customCases"
import {
  REVEAL_RUNG,
  countedMaxRung,
  findRung,
  nextRung,
  patternFromRungs,
  withRung,
} from "@/lib/workspace/ladder"
import { codeTooLarge } from "@/lib/workspace/limits"
import {
  EMPTY_PLAN,
  MAX_PLAN_CHECKS,
  MAX_STRUCTURES,
  MAX_TWIST_CHARS,
  canCheckPlan,
  planForRequest,
} from "@/lib/workspace/plan"
import {
  browserStorage,
  readAttempt,
  removeAttempt,
  upsertGuestAttempt,
  writeAttempt,
  type CustomCase,
  type GuestWrapUp,
  type StorageLike,
} from "@/lib/workspace/storage"

export type RunKind = "run" | "submit"
export type BottomTab = "tests" | "walkthrough" | "trace"

/** Python could not run the code at all: which action failed, and why. */
export interface RunFailure {
  kind: RunKind
  reason: RunnerErrorKind
  message: string
}

/** The wrap-up panel (Section 7.8): the API's WrapUp, or one rebuilt for a guest. */
export interface WrapUpView {
  guest: boolean
  outcome: Outcome | null
  patternId: string | null
  /** Null for guests: the panel looks the name up. */
  patternName: string | null
  twist: string | null
  maxRung: number
  planRightFirstTime: boolean
  timeSeconds: number
  related: RelatedProblem[]
  /** When the problem comes back for review; null for guests (no reviews). */
  nextReviewAt: string | null
  nextProblemSlug: string | null
}

export interface WorkspaceState {
  slug: string
  problem: ProblemPublic | null
  code: string
  /** Changes not saved to the API yet (signed in), or code changed since it was loaded. */
  dirty: boolean
  /** Bumped when the code is replaced from outside the editor (resume, start over). */
  codeRevision: number
  results: TestResult[] | null
  /** What produced `results`. */
  resultsKind: RunKind | null
  /** Set when Python could not run the code at all (e.g. it failed to load). */
  runError: RunFailure | null
  running: "idle" | RunKind
  bottomTab: BottomTab
  /** Bumped to move focus to the bottom panel (rung 5 and See it run open the Walkthrough). */
  bottomFocus: number
  customCases: CustomCase[]
  /** This attempt was solved (every test passed on Submit). */
  solved: boolean
  solvedAt: string | null
  startedAt: string | null
  /** Guests keep their attempts in localStorage; null until sign-in state is known. */
  mode: "guest" | "user" | null
  guest: boolean

  // ---- the attempt (Sections 7.3, 7.4, 7.8, 17.2)
  /** The signed-in attempt; null in guest mode and until `POST /attempts` answers. */
  attemptId: string | null
  /** "loading" until the attempt is known; "error" if it could not be loaded. */
  coach: "loading" | "ready" | "error"
  attemptStatus: AttemptStatus
  outcome: Outcome | null
  plan: PlanCard
  /** The plan behind `planGrade` (badges apply while a field still holds it). */
  checkedPlan: PlanCard | null
  planGrade: PlanGrade | null
  checksLeft: number
  checking: boolean
  planError: string | null
  /** A guest's first check was correct (signed-in users get it in the WrapUp). */
  planFirstCorrect: boolean | null
  openedRungs: HintContent[]
  maxRung: number
  openingRung: number | null
  hintError: string | null
  fading: Fading
  plannedFirst: boolean
  planSkipped: boolean
  /** Runs and submits of this attempt. */
  runs: number
  activeSeconds: number
  /** The one-time "Planning first helps it stick" tip is showing. */
  runTip: boolean
  runTipSeen: boolean
  wrapUp: WrapUpView | null
  wrapUpOpen: boolean
  /** Saving a passing Submit to the API. */
  submitting: boolean
  submitError: string | null
  ending: boolean
  restarting: boolean
  /** A calm note about the attempt (e.g. it ended in another tab). */
  notice: string | null
  walkthrough: WalkthroughPayload | null
  walkthroughLoading: boolean
  walkthroughError: string | null

  open(problem: ProblemPublic): void
  setGuest(guest: boolean): void
  /** Takes the signed-in attempt from `POST /attempts` (resume or create). */
  attach(view: AttemptView): void
  /** Signed in: `POST /attempts` for the open problem (resume or create), then `attach`. */
  loadAttempt(): Promise<void>
  attemptFailed(): void
  setCode(code: string): void
  setBottomTab(tab: BottomTab): void
  addCustomCase(args: unknown[]): string | null
  updateCustomCase(id: string, args: unknown[]): void
  removeCustomCase(id: string): void
  run(): Promise<void>
  submit(): Promise<void>
  retrySubmit(): Promise<void>
  setPlan(patch: Partial<PlanCard>): void
  checkPlan(): Promise<void>
  openRung(rung: number): Promise<void>
  openNextRung(): Promise<void>
  /** "Skip" on the plan-first tip: records planSkipped. */
  skipPlanTip(): void
  dismissRunTip(): void
  addActiveSeconds(seconds: number): void
  /** Sends pending changes to the API now (signed in). */
  sync(options?: { keepalive?: boolean }): Promise<void>
  /** Give up: ends the attempt as not solved. */
  end(): Promise<boolean>
  /** Start over: a new attempt (the old one is abandoned). */
  restart(): Promise<boolean>
  /** See it run: the walkthrough of a solved problem (or rung 5's), in the bottom panel. */
  showWalkthrough(): Promise<void>
  setWrapUpOpen(open: boolean): void
  /** Writes pending changes now (page hide, leaving the problem). */
  flush(): void
}

export interface WorkspaceDeps {
  runner: () => Pick<Runner, "runTests">
  storage: () => StorageLike | null
  now: () => Date
  /** localStorage writes are coalesced over this many milliseconds. */
  saveDelayMs: number
  api: () => AttemptApi
  /** Section 7.9: pending changes go to the API this long after the first one. */
  syncDelayMs: number
  /** Sync and network news (toasts). */
  notify: (title: string, description?: string) => void
}

/** Active time alone is sent once this much has gathered (other changes send it sooner). */
export const ACTIVE_SYNC_SECONDS = 60
/** Section 7.9: every 10 s while there are changes. */
export const SYNC_DELAY_MS = 10_000
const MAX_ACTIVE_DELTA = 24 * 60 * 60
const MAX_RUNS_DELTA = 1000
/** Browsers refuse keepalive requests over 64 KB. */
const MAX_KEEPALIVE_BYTES = 60_000

function toTestCase(test: ProblemPublic["tests"][number]): TestCase {
  return {
    id: test.id,
    ...(test.ops ? { ops: test.ops } : { args: test.args ?? [] }),
    expected: test.expected,
    hidden: test.hidden,
    ...(test.compare ? { compare: test.compare } : {}),
  }
}

/** `results` without the one for `id`; the same array when there is none (the Tests panel
 * picks a case to show whenever `results` changes). */
function withoutResult(results: TestResult[] | null, id: string): TestResult[] | null {
  if (!results?.some((result) => result.id === id)) return results
  return results.filter((result) => result.id !== id)
}

/** Section 16.2: every visible and hidden test id has a result with status pass. */
export function allTestsPassed(problem: ProblemPublic, results: readonly TestResult[]): boolean {
  const passed = new Set(results.filter((r) => r.status === "pass").map((r) => r.id))
  return problem.tests.length > 0 && problem.tests.every((test) => passed.has(test.id))
}

function runFailure(kind: RunKind, error: unknown): RunFailure {
  return {
    kind,
    reason: error instanceof RunnerError ? error.kind : "internal",
    message: error instanceof Error ? error.message : String(error),
  }
}

const MAX_KEPT_VALUE_CHARS = 4000
const MAX_KEPT_ERROR_CHARS = 8000

/**
 * Results as the API stores them (Section 20 caps request bodies): a huge output or stdout
 * is cut down, so a wrong answer with a million items cannot block every later sync.
 */
export function compactResults(results: readonly TestResult[]): TestResult[] {
  return results.map((result) => {
    const kept: TestResult = { id: result.id, status: result.status }
    if (result.got !== undefined) {
      let size = Number.POSITIVE_INFINITY
      try {
        size = JSON.stringify(result.got)?.length ?? 0
      } catch {
        // Not JSON: left out.
      }
      if (size <= MAX_KEPT_VALUE_CHARS) kept.got = result.got
    }
    if (result.stdout) {
      kept.stdout =
        result.stdout.length > MAX_KEPT_VALUE_CHARS
          ? `${result.stdout.slice(0, MAX_KEPT_VALUE_CHARS)}\n…`
          : result.stdout
    }
    if (result.error) {
      kept.error =
        result.error.length > MAX_KEPT_ERROR_CHARS
          ? `…\n${result.error.slice(-MAX_KEPT_ERROR_CHARS)}`
          : result.error
    }
    if (result.ms !== undefined) kept.ms = result.ms
    return kept
  })
}

/** A stored result back in the runner's shape (the API keeps nulls). */
function fromStored(result: NonNullable<AttemptView["lastResults"]>[number]): TestResult {
  const restored: TestResult = { id: result.id, status: result.status }
  if (result.got !== undefined) restored.got = result.got
  if (result.stdout != null) restored.stdout = result.stdout
  if (result.error != null) restored.error = result.error
  if (result.ms != null) restored.ms = result.ms
  return restored
}

/** A calm, short message for an API error (Section 18.7). */
export function attemptErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "plan_checks_exhausted":
        return "You've used all 3 plan checks for this attempt."
      case "rung_order":
      case "validation_error":
        return error.message
      case "conflict":
        return "This attempt has ended. Start over to keep going."
      case "rate_limited":
        return "That was a lot of requests at once. Wait a moment, then try again."
      case "not_found":
        return "This attempt is no longer available. Reload the page to start again."
      case "unauthorized":
        return "Your session ended. Sign in again to keep saving."
      case "forbidden":
        return error.message
    }
    if (error.status >= 500) return "SeeCode's server had a problem. Try again in a moment."
  }
  return "Couldn't reach SeeCode. Check your connection, then try again."
}

const NO_FADING: Fading = { givenPattern: null, freeRungs: [] }

/** An attempt nobody worked on yet: the starter code, no plan, runs or hints. */
function untouched(view: AttemptView, problem: ProblemPublic): boolean {
  return (
    view.code === problem.starterCode &&
    view.runs === 0 &&
    view.plan === null &&
    view.lastResults === null &&
    view.checksLeft === MAX_PLAN_CHECKS &&
    view.maxRung === 0
  )
}

function guestWrapUpView(wrap: GuestWrapUp): WrapUpView {
  return {
    guest: true,
    outcome: null,
    patternId: wrap.patternId,
    patternName: null,
    twist: wrap.twist,
    maxRung: wrap.maxRung,
    planRightFirstTime: wrap.planRightFirstTime,
    timeSeconds: wrap.timeSeconds,
    related: wrap.related,
    nextReviewAt: null,
    nextProblemSlug: null,
  }
}

/** The coach state of a new attempt, before anything is known about it. */
function freshCoach(): Pick<
  WorkspaceState,
  | "attemptId"
  | "attemptStatus"
  | "outcome"
  | "plan"
  | "checkedPlan"
  | "planGrade"
  | "checksLeft"
  | "checking"
  | "planError"
  | "planFirstCorrect"
  | "openedRungs"
  | "maxRung"
  | "openingRung"
  | "hintError"
  | "fading"
  | "plannedFirst"
  | "planSkipped"
  | "runs"
  | "activeSeconds"
  | "runTip"
  | "runTipSeen"
  | "wrapUp"
  | "wrapUpOpen"
  | "submitting"
  | "submitError"
  | "ending"
  | "restarting"
  | "notice"
  | "walkthrough"
  | "walkthroughLoading"
  | "walkthroughError"
> {
  return {
    attemptId: null,
    attemptStatus: "active",
    outcome: null,
    plan: EMPTY_PLAN,
    checkedPlan: null,
    planGrade: null,
    checksLeft: MAX_PLAN_CHECKS,
    checking: false,
    planError: null,
    planFirstCorrect: null,
    openedRungs: [],
    maxRung: 0,
    openingRung: null,
    hintError: null,
    fading: NO_FADING,
    plannedFirst: false,
    planSkipped: false,
    runs: 0,
    activeSeconds: 0,
    runTip: false,
    runTipSeen: false,
    wrapUp: null,
    wrapUpOpen: false,
    submitting: false,
    submitError: null,
    ending: false,
    restarting: false,
    notice: null,
    walkthrough: null,
    walkthroughLoading: false,
    walkthroughError: null,
  }
}

/** Whether the Plan card shows the reference plan (third check, or rung 3 open): read-only. */
export function isPlanRevealed(state: Pick<WorkspaceState, "planGrade" | "openedRungs">): boolean {
  return (
    Boolean(state.planGrade?.reveal) || state.openedRungs.some((hint) => hint.rung >= REVEAL_RUNG)
  )
}

/** The attempt ended with a passing Submit. */
export function isSolvedAttempt(state: Pick<WorkspaceState, "solved" | "outcome">): boolean {
  return state.solved || (state.outcome?.startsWith("solved") ?? false)
}

interface Pending {
  code: boolean
  runs: number
  activeSeconds: number
  results: boolean
  planSkipped: boolean
}

const NOTHING_PENDING: Pending = {
  code: false,
  runs: 0,
  activeSeconds: 0,
  results: false,
  planSkipped: false,
}

export function createWorkspaceStore(deps: Partial<WorkspaceDeps> = {}): StoreApi<WorkspaceState> {
  const runner = deps.runner ?? getRunner
  const storage = deps.storage ?? browserStorage
  const now = deps.now ?? (() => new Date())
  const saveDelayMs = deps.saveDelayMs ?? 300
  const syncDelayMs = deps.syncDelayMs ?? SYNC_DELAY_MS
  const notify =
    deps.notify ?? ((title, description) => toast(title, { description, tone: "error" }))
  let attemptApi: AttemptApi | null = null
  const api = (): AttemptApi => {
    if (deps.api) return deps.api()
    attemptApi ??= createAttemptApi(apiClient)
    return attemptApi
  }

  let saveTimer: ReturnType<typeof setTimeout> | null = null
  let syncTimer: ReturnType<typeof setTimeout> | null = null
  let syncing: Promise<void> | null = null
  let syncFailed = false
  // Bumped whenever a problem is opened or an attempt replaced, so an answer that arrives
  // after the user moved on cannot write into the wrong problem or attempt.
  let session = 0
  // The latest code within the 50 KB limit (Section 20): only that is stored, so a guest
  // import never carries code the API refuses. The editor warns while the code is over.
  let storableCode = ""
  let pending: Pending = { ...NOTHING_PENDING }
  // The user typed before the signed-in attempt arrived: their code wins over the API's.
  let editedBeforeAttach = false
  // A Submit the API has not taken yet (offline, or made before the attempt arrived):
  // "Try again" sends it again, and `attach` sends one that waited for the attempt.
  let unsentSubmit: { code: string; results: TestResult[]; session: number } | null = null
  // The session whose `POST /attempts` is in flight (React may run effects twice).
  let loadingSession: number | null = null

  return createStore<WorkspaceState>()((set, get) => {
    // ------------------------------------------------------------ localStorage

    function save(): void {
      if (saveTimer) clearTimeout(saveTimer)
      saveTimer = null
      const state = get()
      if (!state.slug || !state.startedAt) return
      const updatedAt = now().toISOString()
      if (!codeTooLarge(state.code)) storableCode = state.code
      const guest = state.mode === "guest"
      const planChecks = MAX_PLAN_CHECKS - state.checksLeft
      const guestWrap: GuestWrapUp | null =
        guest && state.wrapUp
          ? {
              patternId: state.wrapUp.patternId,
              twist: state.wrapUp.twist,
              maxRung: state.wrapUp.maxRung,
              planRightFirstTime: state.wrapUp.planRightFirstTime,
              timeSeconds: state.wrapUp.timeSeconds,
              related: state.wrapUp.related,
            }
          : null
      writeAttempt(storage(), state.slug, {
        v: 1,
        code: storableCode,
        customCases: state.customCases,
        solved: state.solved,
        startedAt: state.startedAt,
        updatedAt,
        solvedAt: state.solvedAt,
        attemptId: state.attemptId,
        pending: state.mode === "user" && pending.code,
        plan: state.plan === EMPTY_PLAN ? null : state.plan,
        runTipSeen: state.runTipSeen,
        coach: guest
          ? {
              checkedPlan: state.checkedPlan,
              planGrade: state.planGrade,
              planChecks,
              planFirstCorrect: state.planFirstCorrect,
              rungs: state.openedRungs,
              plannedFirst: state.plannedFirst,
              planSkipped: state.planSkipped,
              runs: state.runs,
              activeSeconds: state.activeSeconds,
              wrapUp: guestWrap,
            }
          : null,
      })
      if (guest) {
        upsertGuestAttempt(storage(), {
          slug: state.slug,
          code: storableCode,
          solved: state.solved,
          startedAt: state.startedAt,
          updatedAt,
          solvedAt: state.solvedAt,
          maxRung: state.maxRung,
          ...(state.checkedPlan ? { plan: state.checkedPlan } : {}),
          planChecks,
          activeSeconds: Math.floor(state.activeSeconds),
          plannedFirst: state.plannedFirst,
          planSkipped: state.planSkipped,
        })
      }
    }

    function scheduleSave(): void {
      if (saveTimer) clearTimeout(saveTimer)
      saveTimer = setTimeout(save, saveDelayMs)
    }

    /** The attempt starts with the first edit, run, plan change or custom case. */
    function touch(): void {
      if (!get().startedAt) set({ startedAt: now().toISOString() })
      scheduleSave()
    }

    // ------------------------------------------------------------ API sync (7.9)

    function canSync(): boolean {
      const state = get()
      return state.mode === "user" && state.attemptId !== null && state.attemptStatus === "active"
    }

    function hasPending(minActiveSeconds = 1): boolean {
      return (
        pending.code ||
        pending.runs > 0 ||
        pending.results ||
        pending.planSkipped ||
        pending.activeSeconds >= minActiveSeconds
      )
    }

    function stopSync(): void {
      if (syncTimer) clearTimeout(syncTimer)
      syncTimer = null
    }

    function scheduleSync(): void {
      if (!canSync()) return
      if (!hasPending(ACTIVE_SYNC_SECONDS)) return
      set({ dirty: true })
      if (syncTimer) return
      syncTimer = setTimeout(() => {
        syncTimer = null
        void get().sync()
      }, syncDelayMs)
    }

    function patchBody(keepalive: boolean): AttemptPatch | null {
      const state = get()
      const body: AttemptPatch = {}
      if (pending.code) {
        if (codeTooLarge(state.code))
          pending.code = false // the editor asks to shorten it
        else body.code = state.code
      }
      if (pending.activeSeconds > 0) {
        body.activeSecondsDelta = Math.min(Math.floor(pending.activeSeconds), MAX_ACTIVE_DELTA)
      }
      if (pending.runs > 0) body.runsDelta = Math.min(pending.runs, MAX_RUNS_DELTA)
      if (pending.results && state.results) body.lastResults = compactResults(state.results)
      if (pending.planSkipped) body.planSkipped = true
      if (keepalive && JSON.stringify(body).length > MAX_KEEPALIVE_BYTES) {
        // The results can wait for the next visit; the code is also kept in this browser.
        delete body.lastResults
        if (JSON.stringify(body).length > MAX_KEEPALIVE_BYTES) delete body.code
      }
      if (body.activeSecondsDelta === 0) delete body.activeSecondsDelta
      return Object.keys(body).length > 0 ? body : null
    }

    async function syncOnce(keepalive: boolean): Promise<void> {
      const state = get()
      if (!canSync() || !state.attemptId) return
      const body = patchBody(keepalive)
      if (!body) return
      const attemptId = state.attemptId
      const mine = session
      const sent: Pending = {
        code: "code" in body,
        runs: body.runsDelta ?? 0,
        activeSeconds: body.activeSecondsDelta ?? 0,
        results: "lastResults" in body,
        planSkipped: body.planSkipped === true,
      }
      // Changes made while the request is out stay pending; these are taken.
      pending = {
        code: pending.code && !sent.code,
        runs: pending.runs - sent.runs,
        activeSeconds: pending.activeSeconds - sent.activeSeconds,
        results: pending.results && !sent.results,
        planSkipped: pending.planSkipped && !sent.planSkipped,
      }
      try {
        await api().patch(attemptId, body, keepalive ? { keepalive: true } : undefined)
        if (mine !== session) return
        syncFailed = false
        set({ dirty: hasPending() })
        save() // the stored code is no longer pending
      } catch (error) {
        if (mine !== session) return
        pending = {
          code: pending.code || sent.code,
          runs: pending.runs + sent.runs,
          activeSeconds: pending.activeSeconds + sent.activeSeconds,
          results: pending.results || sent.results,
          planSkipped: pending.planSkipped || sent.planSkipped,
        }
        if (error instanceof ApiError && (error.code === "conflict" || error.status === 404)) {
          await attemptEndedElsewhere(attemptId)
          return
        }
        if (error instanceof ApiError && error.code === "validation_error") {
          // Something in the body is refused (e.g. results too large): drop them, keep the rest.
          pending.results = false
        }
        if (!syncFailed) {
          syncFailed = true
          notify(
            "Couldn't save to your account",
            "Your work is kept in this browser. SeeCode will try again shortly."
          )
        }
      }
    }

    /** The API says the attempt is over (another tab ended it, or Start over replaced it). */
    async function attemptEndedElsewhere(attemptId: string): Promise<void> {
      const mine = session
      stopSync()
      pending = { ...NOTHING_PENDING }
      let status: AttemptStatus = "finished"
      let outcome: Outcome | null = null
      try {
        const view = await api().get(attemptId)
        status = view.status
        outcome = view.outcome
      } catch {
        // Unknown: it is not active, which is all that matters here.
      }
      if (mine !== session) return
      if (status === "active") return // a blip: nothing ended
      set({
        attemptStatus: status,
        outcome,
        dirty: false,
        runTip: false,
        notice:
          status === "abandoned"
            ? "This attempt was replaced in another tab or window. Reload to continue there."
            : "This attempt ended in another tab or window. Start over to keep going.",
      })
    }

    // ------------------------------------------------------------ attempt state

    /** A guest's coach state from this browser (entries of signed-in attempts are skipped). */
    function restoreGuest(): void {
      const state = get()
      if (!state.problem) return
      const saved = readAttempt(storage(), state.slug)
      const local = saved && saved.attemptId === null ? saved : null
      const coach = local?.coach ?? null
      const rungs = coach?.rungs ?? []
      const fromOtherUser = saved !== null && saved.attemptId !== null
      set({
        ...freshCoach(),
        coach: "ready",
        attemptStatus: local?.solved ? "finished" : "active",
        plan: local?.plan ?? EMPTY_PLAN,
        checkedPlan: coach?.checkedPlan ?? null,
        planGrade: coach?.planGrade ?? null,
        checksLeft: MAX_PLAN_CHECKS - (coach?.planChecks ?? 0),
        planFirstCorrect: coach?.planFirstCorrect ?? null,
        openedRungs: rungs,
        maxRung: countedMaxRung(
          rungs.map((hint) => hint.rung),
          []
        ),
        plannedFirst: coach?.plannedFirst ?? false,
        planSkipped: coach?.planSkipped ?? false,
        runs: coach?.runs ?? 0,
        activeSeconds: coach?.activeSeconds ?? 0,
        runTipSeen: local?.runTipSeen ?? false,
        wrapUp: local?.solved && coach?.wrapUp ? guestWrapUpView(coach.wrapUp) : null,
        wrapUpOpen: Boolean(local?.solved && coach?.wrapUp),
        walkthrough: findRung(rungs, 5)?.walkthrough ?? null,
        // A signed-in user's work stays theirs: a guest starts from the starter code.
        ...(fromOtherUser
          ? {
              code: state.problem.starterCode,
              codeRevision: state.codeRevision + 1,
              customCases: [],
              results: null,
              resultsKind: null,
              solved: false,
              solvedAt: null,
              startedAt: null,
            }
          : {}),
      })
      if (fromOtherUser) storableCode = state.problem.starterCode
    }

    /** Applies an API attempt. `fresh`: a new attempt (Start over), nothing local carries over. */
    function applyView(view: AttemptView, fresh: boolean): void {
      const state = get()
      const problem = state.problem
      if (!problem) return
      const saved = fresh ? null : readAttempt(storage(), state.slug)
      const same = saved?.attemptId === view.id
      let code = view.code
      let codePending = false
      let plan = view.plan ?? EMPTY_PLAN
      if (same && saved) {
        // This browser's copy is newer when the last sync did not reach the API.
        if (saved.pending && saved.code !== view.code) {
          code = saved.code
          codePending = true
        }
        if (saved.plan) plan = saved.plan
      } else if (saved && saved.attemptId === null && !saved.solved && untouched(view, problem)) {
        // Work from before sign-in (or before attempts were synced) that the API never got.
        if (saved.code !== view.code) {
          code = saved.code
          codePending = true
        }
        if (saved.plan) plan = saved.plan
      }
      if (editedBeforeAttach && !fresh) {
        code = state.code
        codePending = code !== view.code
      }
      if (view.fading.givenPattern && plan.pattern === null) {
        plan = { ...plan, pattern: view.fading.givenPattern }
      }
      editedBeforeAttach = false
      const restored = view.lastResults?.map(fromStored) ?? null
      const hiddenIds = new Set(problem.tests.filter((test) => test.hidden).map((test) => test.id))
      const keepResults = !fresh && state.results !== null
      const rungs = [...view.openedRungs].sort((a, b) => a.rung - b.rung)
      if (codePending) pending.code = true
      if (!codeTooLarge(code)) storableCode = code
      set({
        ...freshCoach(),
        coach: "ready",
        attemptId: view.id,
        attemptStatus: view.status,
        outcome: view.outcome,
        code,
        codeRevision: code !== state.code ? state.codeRevision + 1 : state.codeRevision,
        plan,
        checkedPlan: view.planGrade ? view.plan : null,
        planGrade: view.planGrade,
        checksLeft: view.checksLeft,
        openedRungs: rungs,
        maxRung: view.maxRung,
        fading: view.fading,
        plannedFirst: view.plannedFirst,
        planSkipped: view.planSkipped,
        runs: view.runs,
        activeSeconds: view.activeSeconds,
        runTipSeen: same && saved ? saved.runTipSeen : false,
        walkthrough: findRung(rungs, 5)?.walkthrough ?? null,
        results: keepResults ? state.results : restored,
        resultsKind: keepResults
          ? state.resultsKind
          : restored
            ? restored.some((result) => hiddenIds.has(result.id))
              ? "submit"
              : "run"
            : null,
        solved: view.status === "finished" && (view.outcome?.startsWith("solved") ?? false),
        solvedAt: null,
        startedAt: view.startedAt,
        dirty: hasPending(),
        ...(fresh ? { customCases: state.customCases, runError: null } : {}),
      })
      save()
      scheduleSync()
    }

    // ------------------------------------------------------------ Run and Submit

    /** Section 7.3: the first Run (or Submit) before any plan check shows a one-time tip. */
    function maybeShowRunTip(): void {
      const state = get()
      if (state.coach !== "ready" || state.attemptStatus !== "active") return
      if (state.runTipSeen || state.planSkipped || state.planGrade) return
      if (state.checksLeft < MAX_PLAN_CHECKS || isPlanRevealed(state)) return
      set({ runTip: true, runTipSeen: true })
      touch()
    }

    async function execute(kind: RunKind, tests: TestCase[]): Promise<void> {
      const { problem, running, code } = get()
      if (!problem || running !== "idle") return
      const mine = session
      maybeShowRunTip()
      // The results show in the Tests tab (the Workspace also expands a collapsed panel).
      set({ running: kind, runError: null, bottomTab: "tests" })
      touch()
      try {
        const spec = {
          kind: problem.kind,
          io: problem.io ?? null,
          checker: problem.checker ?? null,
        }
        const results = await runner().runTests({ code, entry: problem.entry, tests, spec })
        if (mine !== session) return
        const solvedNow = kind === "submit" && allTestsPassed(problem, results)
        const active = get().attemptStatus === "active"
        set((state) => ({
          results,
          resultsKind: kind,
          running: "idle",
          runs: state.runs + 1,
          solved: state.solved || (solvedNow && active),
          solvedAt: state.solvedAt ?? (solvedNow && active ? now().toISOString() : null),
        }))
        const state = get()
        if (state.mode === "user") {
          if (kind === "run") pending.runs += 1
          pending.results = true
          if (kind === "submit" && state.attemptStatus === "active") {
            void reportSubmit(code, results, mine)
          } else scheduleSync()
        } else if (state.mode === "guest" && solvedNow && active) {
          finishGuest()
        }
        save()
      } catch (error) {
        if (mine !== session) return
        set({ running: "idle", runError: runFailure(kind, error) })
      }
    }

    /** Sends a Submit's results to the API; a pass ends the attempt with its wrap-up. */
    async function reportSubmit(code: string, results: TestResult[], mine: number): Promise<void> {
      const state = get()
      if (!state.attemptId) {
        // Submitted before the attempt arrived: `attach` sends it.
        if (state.mode === "user") unsentSubmit = { code, results, session: mine }
        return
      }
      if (state.submitting) return
      const attemptId = state.attemptId
      unsentSubmit = { code, results, session: mine }
      // The submit carries these results; the sync before it need not.
      pending.results = false
      set({ submitting: true, submitError: null })
      try {
        await get().sync() // runs and active time first
        if (mine !== session) return
        const answer = await api().submit(attemptId, code, compactResults(results))
        if (mine !== session) return
        unsentSubmit = null
        if (answer.passed && answer.wrapUp) {
          stopSync()
          pending = { ...NOTHING_PENDING }
          set({
            submitting: false,
            attemptStatus: "finished",
            outcome: answer.outcome ?? null,
            solved: true,
            dirty: false,
            runTip: false,
            wrapUp: { guest: false, outcome: answer.outcome ?? null, ...answer.wrapUp },
            wrapUpOpen: true,
          })
        } else {
          set({ submitting: false, solved: false, solvedAt: null })
          scheduleSync()
        }
        save()
      } catch (error) {
        if (mine !== session) return
        if (error instanceof ApiError && error.code === "conflict") {
          unsentSubmit = null
          set({ submitting: false })
          await attemptEndedElsewhere(attemptId)
          return
        }
        pending.results = true
        set({
          submitting: false,
          submitError:
            error instanceof ApiError && error.status < 500
              ? attemptErrorMessage(error)
              : "Your solve isn't saved to your account yet. Check your connection, then try again.",
        })
      }
    }

    /** A guest's passing Submit: the wrap-up comes from this browser's data. */
    function finishGuest(): void {
      const state = get()
      const rung3 = findRung(state.openedRungs, 3)
      const reveal = state.planGrade?.reveal ?? rung3?.reveal ?? null
      const wrap: GuestWrapUp = {
        patternId: patternFromRungs(state.openedRungs) ?? reveal?.patternId ?? null,
        twist: reveal?.twist ?? null,
        maxRung: state.maxRung,
        planRightFirstTime: state.planFirstCorrect === true,
        timeSeconds: Math.round(state.activeSeconds),
        related: [],
      }
      set({
        attemptStatus: "finished",
        runTip: false,
        wrapUp: guestWrapUpView(wrap),
        wrapUpOpen: true,
      })
      if (wrap.patternId && wrap.twist) return
      // Rung 3 names the pattern and carries the optimal twist; after a solve it is no hint.
      const mine = session
      const slug = state.slug
      api()
        .guestHint(slug, 3)
        .then((hint) => {
          const current = get().wrapUp
          if (mine !== session || hint.rung !== 3 || !current) return
          set({
            wrapUp: { ...current, patternId: hint.patternId, twist: hint.reveal.twist },
          })
          save()
        })
        .catch(() => {
          // The wrap-up shows without the pattern card.
        })
    }

    function nextGuestCheck(state: WorkspaceState): number {
      return MAX_PLAN_CHECKS - state.checksLeft + 1
    }

    return {
      slug: "",
      problem: null,
      code: "",
      dirty: false,
      codeRevision: 0,
      results: null,
      resultsKind: null,
      runError: null,
      running: "idle",
      bottomTab: "tests",
      bottomFocus: 0,
      customCases: [],
      solved: false,
      solvedAt: null,
      startedAt: null,
      mode: null,
      guest: false,
      coach: "loading",
      ...freshCoach(),

      open(problem) {
        const state = get()
        if (state.slug === problem.slug && state.problem) {
          set({ problem })
          return
        }
        // The previous problem's pending changes.
        if (saveTimer) save()
        if (canSync() && hasPending()) void get().sync()
        stopSync()
        session++
        pending = { ...NOTHING_PENDING }
        syncFailed = false
        editedBeforeAttach = false
        unsentSubmit = null
        const saved = readAttempt(storage(), problem.slug)
        // A guest never sees code from a signed-in user's attempt.
        const usable = saved && !(state.mode === "guest" && saved.attemptId !== null) ? saved : null
        storableCode = usable?.code ?? problem.starterCode
        set({
          ...freshCoach(),
          coach: "loading",
          slug: problem.slug,
          problem,
          code: usable?.code ?? problem.starterCode,
          codeRevision: state.codeRevision + 1,
          dirty: false,
          results: null,
          resultsKind: null,
          runError: null,
          running: "idle",
          bottomTab: "tests",
          customCases: usable?.customCases ?? [],
          solved: usable?.solved ?? false,
          solvedAt: usable?.solvedAt ?? null,
          startedAt: usable?.startedAt ?? null,
        })
        if (get().mode === "guest") restoreGuest()
      },

      setGuest(guest) {
        const mode = guest ? "guest" : "user"
        if (get().mode === mode) return
        set({ mode, guest })
        if (guest && get().problem) restoreGuest()
        else if (!guest) set({ ...freshCoach(), coach: "loading" })
      },

      attach(view) {
        const state = get()
        if (!state.problem || view.slug !== state.slug || state.mode !== "user") return
        if (state.attemptId === view.id && state.coach === "ready") return
        applyView(view, false)
        const waiting = unsentSubmit
        if (waiting && waiting.session === session && get().attemptStatus === "active") {
          void reportSubmit(waiting.code, waiting.results, session)
        }
      },

      async loadAttempt() {
        const state = get()
        if (state.mode !== "user" || !state.problem) return
        if (state.coach === "ready" || loadingSession === session) return
        const mine = session
        loadingSession = mine
        if (state.coach === "error") set({ coach: "loading" })
        try {
          const view = await api().start(state.slug)
          if (mine !== session) return
          get().attach(view)
        } catch {
          if (mine !== session) return
          get().attemptFailed()
        } finally {
          if (loadingSession === mine) loadingSession = null
        }
      },

      attemptFailed() {
        if (get().coach === "loading") set({ coach: "error" })
      },

      setCode(code) {
        if (code === get().code) return
        const state = get()
        if (state.mode !== "guest" && state.coach !== "ready") editedBeforeAttach = true
        set({ code, dirty: true })
        pending.code = true
        touch()
        scheduleSync()
      },

      setBottomTab(tab) {
        set({ bottomTab: tab })
      },

      addCustomCase(args) {
        const { customCases } = get()
        if (customCases.length >= MAX_CUSTOM_CASES || customArgsTooLarge(args)) return null
        const id = nextCustomCaseId(customCases)
        set({ customCases: [...customCases, { id, args }] })
        touch()
        return id
      },

      updateCustomCase(id, args) {
        const current = get().customCases.find((item) => item.id === id)
        if (!current || customArgsTooLarge(args)) return
        if (JSON.stringify(current.args) === JSON.stringify(args)) return
        set((state) => ({
          customCases: state.customCases.map((item) => (item.id === id ? { id, args } : item)),
          // The case's last output belongs to its old input.
          results: withoutResult(state.results, id),
        }))
        touch()
      },

      removeCustomCase(id) {
        set((state) => ({
          customCases: state.customCases.filter((item) => item.id !== id),
          results: withoutResult(state.results, id),
        }))
        touch()
      },

      async run() {
        const { problem, customCases } = get()
        if (!problem) return
        const visible = problem.tests.filter((test) => !test.hidden).map(toTestCase)
        // Custom cases are argument lists, so design problems (lists of calls) have none.
        const custom =
          problem.kind === "design"
            ? []
            : customCases.map((item) => ({ id: item.id, args: item.args, hidden: false }))
        await execute("run", [...visible, ...custom])
      },

      async submit() {
        const { problem } = get()
        if (!problem) return
        await execute("submit", problem.tests.map(toTestCase))
      },

      async retrySubmit() {
        if (!unsentSubmit || unsentSubmit.session !== session) return
        await reportSubmit(unsentSubmit.code, unsentSubmit.results, session)
      },

      setPlan(patch) {
        const state = get()
        if (state.attemptStatus !== "active" || isPlanRevealed(state)) return
        const next: PlanCard = { ...state.plan, ...patch }
        // A pattern given by fading (11.6) stays.
        if (state.fading.givenPattern) next.pattern = state.fading.givenPattern
        next.structures = [...new Set(next.structures)].slice(0, MAX_STRUCTURES)
        next.twist = next.twist.slice(0, MAX_TWIST_CHARS)
        set({ plan: next, planError: null })
        touch()
      },

      async checkPlan() {
        const state = get()
        if (!state.problem || state.checking || state.coach !== "ready") return
        if (state.attemptStatus !== "active" || isPlanRevealed(state)) return
        if (state.checksLeft <= 0) {
          set({ planError: "You've used all 3 plan checks for this attempt." })
          return
        }
        if (!canCheckPlan(state.plan)) {
          set({ planError: "Pick a pattern and a time or space target first." })
          return
        }
        const plan = planForRequest(state.plan)
        const mine = session
        set({ checking: true, planError: null, runTip: false })
        try {
          if (state.mode === "user" && state.attemptId) {
            // Runs first: a plan checked before the first Run marks the attempt planned first.
            await get().sync()
            if (mine !== session) return
            const result = await api().checkPlan(state.attemptId, plan)
            if (mine !== session) return
            set((current) => ({
              checking: false,
              planGrade: result.grade,
              checkedPlan: plan,
              checksLeft: result.checksLeft,
              plannedFirst: current.plannedFirst || current.runs === 0,
            }))
          } else {
            const checkNumber = nextGuestCheck(state)
            const openedRung = state.openedRungs.reduce((max, hint) => Math.max(max, hint.rung), 0)
            const { grade } = await api().guestCheckPlan(state.slug, plan, checkNumber, openedRung)
            if (mine !== session) return
            set((current) => ({
              checking: false,
              planGrade: grade,
              checkedPlan: plan,
              checksLeft: Math.max(0, MAX_PLAN_CHECKS - checkNumber),
              planFirstCorrect: checkNumber === 1 ? grade.correct : current.planFirstCorrect,
              plannedFirst: current.plannedFirst || current.runs === 0,
            }))
          }
          touch()
        } catch (error) {
          if (mine !== session) return
          set({ checking: false, planError: attemptErrorMessage(error) })
          if (error instanceof ApiError && error.code === "plan_checks_exhausted") {
            set({ checksLeft: 0 })
          }
          if (error instanceof ApiError && error.code === "conflict" && state.attemptId) {
            await attemptEndedElsewhere(state.attemptId)
          }
        }
      },

      async openRung(rung) {
        const state = get()
        if (!state.problem || state.coach !== "ready" || state.openingRung !== null) return
        if (state.openedRungs.some((hint) => hint.rung === rung)) return
        // Strictly in order (7.4); an ended attempt opens no new rungs.
        if (rung !== nextRung(state.openedRungs) || state.attemptStatus !== "active") return
        const mine = session
        set({ openingRung: rung, hintError: null })
        try {
          const hint =
            state.mode === "user" && state.attemptId
              ? await api().openRung(state.attemptId, rung)
              : await api().guestHint(state.slug, rung)
          if (mine !== session) return
          const openedRungs = withRung(get().openedRungs, hint)
          set((current) => ({
            openingRung: null,
            openedRungs,
            maxRung: Math.max(
              current.maxRung,
              countedMaxRung(
                openedRungs.map((item) => item.rung),
                current.fading.freeRungs
              )
            ),
            runTip: hint.rung >= REVEAL_RUNG ? false : current.runTip,
          }))
          if (hint.rung === 5) {
            // Section 7.4: rung 5 opens the Walkthrough tab and focuses the bottom panel.
            set((current) => ({
              walkthrough: hint.walkthrough,
              bottomTab: "walkthrough",
              bottomFocus: current.bottomFocus + 1,
            }))
          }
          touch()
        } catch (error) {
          if (mine !== session) return
          set({ openingRung: null, hintError: attemptErrorMessage(error) })
          if (!(error instanceof ApiError) || !state.attemptId) return
          if (error.code === "conflict") await attemptEndedElsewhere(state.attemptId)
          if (error.code === "rung_order") {
            // Another tab opened rungs: take the API's list.
            try {
              const view = await api().get(state.attemptId)
              if (mine !== session) return
              set({
                openedRungs: [...view.openedRungs].sort((a, b) => a.rung - b.rung),
                maxRung: view.maxRung,
                hintError: null,
              })
            } catch {
              // The message stays.
            }
          }
        }
      },

      async openNextRung() {
        const next = nextRung(get().openedRungs)
        if (next !== null) await get().openRung(next)
      },

      skipPlanTip() {
        set({ runTip: false, planSkipped: true })
        if (get().mode === "user") {
          pending.planSkipped = true
          scheduleSync()
        }
        touch()
      },

      dismissRunTip() {
        if (get().runTip) set({ runTip: false })
      },

      addActiveSeconds(seconds) {
        const state = get()
        if (!state.problem || seconds <= 0) return
        if (state.coach !== "ready" || state.attemptStatus !== "active") return
        set({ activeSeconds: state.activeSeconds + seconds })
        if (state.mode === "user") {
          pending.activeSeconds += seconds
          scheduleSync()
        } else if (state.startedAt) scheduleSave()
      },

      async sync({ keepalive = false } = {}) {
        stopSync()
        // One request at a time; whatever gathered meanwhile goes right after.
        while (syncing) await syncing
        if (!canSync()) return
        if (!hasPending()) {
          set({ dirty: false })
          return
        }
        syncing = syncOnce(keepalive)
        try {
          await syncing
        } finally {
          syncing = null
        }
        if (syncFailed && canSync()) {
          // Try again later; offline work stays in this browser meanwhile.
          syncTimer = setTimeout(() => {
            syncTimer = null
            void get().sync()
          }, syncDelayMs)
        } else scheduleSync()
      },

      async end() {
        const state = get()
        if (state.mode !== "user" || !state.attemptId || state.attemptStatus !== "active") {
          return false
        }
        const attemptId = state.attemptId
        const mine = session
        set({ ending: true, notice: null })
        try {
          await get().sync()
          const { outcome } = await api().end(attemptId)
          if (mine !== session) return false
          stopSync()
          pending = { ...NOTHING_PENDING }
          set({ ending: false, attemptStatus: "finished", outcome, dirty: false, runTip: false })
          save()
          return true
        } catch (error) {
          if (mine !== session) return false
          set({ ending: false })
          if (error instanceof ApiError && error.code === "conflict") {
            await attemptEndedElsewhere(attemptId)
          } else notify("Couldn't end the attempt", attemptErrorMessage(error))
          return false
        }
      },

      async restart() {
        const state = get()
        if (!state.problem) return false
        if (state.mode === "guest") {
          session++
          stopSync()
          pending = { ...NOTHING_PENDING }
          storableCode = state.problem.starterCode
          removeAttempt(storage(), state.slug)
          set({
            ...freshCoach(),
            coach: "ready",
            code: state.problem.starterCode,
            codeRevision: state.codeRevision + 1,
            dirty: false,
            results: null,
            resultsKind: null,
            runError: null,
            // A run still going belongs to the old attempt: its results are dropped.
            running: "idle",
            solved: false,
            solvedAt: null,
            startedAt: null,
          })
          return true
        }
        if (!state.attemptId) return false
        const mine = session
        set({ restarting: true })
        try {
          const view = await api().restart(state.attemptId)
          if (mine !== session) return false
          session++
          stopSync()
          pending = { ...NOTHING_PENDING }
          syncFailed = false
          unsentSubmit = null
          editedBeforeAttach = false
          set({
            results: null,
            resultsKind: null,
            running: "idle",
            solved: false,
            solvedAt: null,
          })
          applyView(view, true)
          return true
        } catch (error) {
          if (mine !== session) return false
          set({ restarting: false })
          notify("Couldn't start over", attemptErrorMessage(error))
          return false
        }
      },

      async showWalkthrough() {
        const state = get()
        set((current) => ({ bottomTab: "walkthrough", bottomFocus: current.bottomFocus + 1 }))
        if (state.walkthrough || state.walkthroughLoading || !state.problem) return
        const mine = session
        set({ walkthroughLoading: true, walkthroughError: null })
        try {
          const payload =
            state.mode === "user"
              ? await api().walkthrough(state.slug)
              : await api()
                  .guestHint(state.slug, 5)
                  .then((hint) => (hint.rung === 5 ? hint.walkthrough : null))
          if (mine !== session) return
          set({ walkthrough: payload, walkthroughLoading: false })
        } catch (error) {
          if (mine !== session) return
          set({ walkthroughLoading: false, walkthroughError: attemptErrorMessage(error) })
        }
      },

      setWrapUpOpen(open) {
        if (get().wrapUp) set({ wrapUpOpen: open })
      },

      flush() {
        if (saveTimer) save()
        if (canSync() && hasPending()) void get().sync({ keepalive: true })
      },
    }
  })
}

/** The Workspace's store: one problem open at a time. */
export const workspaceStore = createWorkspaceStore()

export function useWorkspace<T>(selector: (state: WorkspaceState) => T): T {
  return useStore(workspaceStore, selector)
}
