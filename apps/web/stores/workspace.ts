// Workspace store (Section 17.2), M2 subset: the problem, code, results, Run/Submit and
// custom cases. Code and custom cases are saved per problem in localStorage
// (`seecode:attempt:{slug}`, Section 7.9); guests also get an entry in
// `seecode:guest:attempts` (Section 16.2). Everything runs in the browser; the attempt
// sync with the API (plan, hints, submit) arrives in M3.
import { useStore } from "zustand"
import { createStore, type StoreApi } from "zustand/vanilla"

import type { ProblemPublic } from "@/lib/api/schemas"
import { getRunner } from "@/lib/runner/runner"
import type { Runner, TestCase, TestResult } from "@/lib/runner/types"
import { MAX_CUSTOM_CASES, nextCustomCaseId } from "@/lib/workspace/customCases"
import {
  browserStorage,
  readAttempt,
  upsertGuestAttempt,
  writeAttempt,
  type CustomCase,
  type StorageLike,
} from "@/lib/workspace/storage"

export type RunKind = "run" | "submit"
export type BottomTab = "tests" | "walkthrough" | "trace"

export interface WorkspaceState {
  slug: string
  problem: ProblemPublic | null
  code: string
  /** Code changed since it was loaded (the M3 sync clears it after each PATCH). */
  dirty: boolean
  results: TestResult[] | null
  /** What produced `results`. */
  resultsKind: RunKind | null
  /** Set when Python could not run the code at all (e.g. it failed to load). */
  runError: string | null
  running: "idle" | RunKind
  bottomTab: BottomTab
  customCases: CustomCase[]
  solved: boolean
  solvedAt: string | null
  startedAt: string | null
  /** Guests also keep their attempts in `seecode:guest:attempts`. */
  guest: boolean

  open(problem: ProblemPublic): void
  setGuest(guest: boolean): void
  setCode(code: string): void
  setBottomTab(tab: BottomTab): void
  addCustomCase(args: unknown[]): string | null
  updateCustomCase(id: string, args: unknown[]): void
  removeCustomCase(id: string): void
  run(): Promise<void>
  submit(): Promise<void>
  /** Writes pending changes to localStorage now (page hide, leaving the problem). */
  flush(): void
}

export interface WorkspaceDeps {
  runner: () => Pick<Runner, "runTests">
  storage: () => StorageLike | null
  now: () => Date
  /** localStorage writes are coalesced over this many milliseconds. */
  saveDelayMs: number
}

function toTestCase(test: ProblemPublic["tests"][number]): TestCase {
  return {
    id: test.id,
    args: test.args,
    expected: test.expected,
    hidden: test.hidden,
    ...(test.compare ? { compare: test.compare } : {}),
  }
}

/** Section 16.2: every visible and hidden test id has a result with status pass. */
export function allTestsPassed(problem: ProblemPublic, results: readonly TestResult[]): boolean {
  const passed = new Set(results.filter((r) => r.status === "pass").map((r) => r.id))
  return problem.tests.length > 0 && problem.tests.every((test) => passed.has(test.id))
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function createWorkspaceStore(deps: Partial<WorkspaceDeps> = {}): StoreApi<WorkspaceState> {
  const runner = deps.runner ?? getRunner
  const storage = deps.storage ?? browserStorage
  const now = deps.now ?? (() => new Date())
  const saveDelayMs = deps.saveDelayMs ?? 300

  let saveTimer: ReturnType<typeof setTimeout> | null = null
  // Bumped whenever a problem is opened, so a run that finishes after the user moved on
  // cannot write its results into the wrong problem.
  let session = 0

  return createStore<WorkspaceState>()((set, get) => {
    function save(): void {
      if (saveTimer) clearTimeout(saveTimer)
      saveTimer = null
      const state = get()
      if (!state.slug || !state.startedAt) return
      const updatedAt = now().toISOString()
      writeAttempt(storage(), state.slug, {
        v: 1,
        code: state.code,
        customCases: state.customCases,
        solved: state.solved,
        startedAt: state.startedAt,
        updatedAt,
        solvedAt: state.solvedAt,
      })
      if (state.guest) {
        upsertGuestAttempt(storage(), {
          slug: state.slug,
          code: state.code,
          solved: state.solved,
          startedAt: state.startedAt,
          updatedAt,
          solvedAt: state.solvedAt,
        })
      }
    }

    function scheduleSave(): void {
      if (saveTimer) clearTimeout(saveTimer)
      saveTimer = setTimeout(save, saveDelayMs)
    }

    /** The attempt starts with the first edit, run or custom case. */
    function touch(): void {
      if (!get().startedAt) set({ startedAt: now().toISOString() })
      scheduleSave()
    }

    async function execute(kind: RunKind, tests: TestCase[]): Promise<void> {
      const { problem, running, code } = get()
      if (!problem || running !== "idle") return
      const mine = session
      set({ running: kind, runError: null })
      touch()
      try {
        const results = await runner().runTests({ code, entry: problem.entry, tests })
        if (mine !== session) return
        const solvedNow = kind === "submit" && allTestsPassed(problem, results)
        set((state) => ({
          results,
          resultsKind: kind,
          running: "idle",
          solved: state.solved || solvedNow,
          solvedAt: state.solvedAt ?? (solvedNow ? now().toISOString() : null),
        }))
        save()
      } catch (error) {
        if (mine !== session) return
        set({ running: "idle", runError: describeError(error) })
      }
    }

    return {
      slug: "",
      problem: null,
      code: "",
      dirty: false,
      results: null,
      resultsKind: null,
      runError: null,
      running: "idle",
      bottomTab: "tests",
      customCases: [],
      solved: false,
      solvedAt: null,
      startedAt: null,
      guest: false,

      open(problem) {
        const state = get()
        if (state.slug === problem.slug && state.problem) {
          set({ problem })
          return
        }
        if (saveTimer) save() // the previous problem's pending changes
        session++
        const saved = readAttempt(storage(), problem.slug)
        set({
          slug: problem.slug,
          problem,
          code: saved?.code ?? problem.starterCode,
          dirty: false,
          results: null,
          resultsKind: null,
          runError: null,
          running: "idle",
          bottomTab: "tests",
          customCases: saved?.customCases ?? [],
          solved: saved?.solved ?? false,
          solvedAt: saved?.solvedAt ?? null,
          startedAt: saved?.startedAt ?? null,
        })
      },

      setGuest(guest) {
        if (get().guest !== guest) set({ guest })
      },

      setCode(code) {
        if (code === get().code) return
        set({ code, dirty: true })
        touch()
      },

      setBottomTab(tab) {
        set({ bottomTab: tab })
      },

      addCustomCase(args) {
        const { customCases } = get()
        if (customCases.length >= MAX_CUSTOM_CASES) return null
        const id = nextCustomCaseId(customCases)
        set({ customCases: [...customCases, { id, args }] })
        touch()
        return id
      },

      updateCustomCase(id, args) {
        set((state) => ({
          customCases: state.customCases.map((item) => (item.id === id ? { id, args } : item)),
        }))
        touch()
      },

      removeCustomCase(id) {
        set((state) => ({
          customCases: state.customCases.filter((item) => item.id !== id),
          results: state.results?.filter((result) => result.id !== id) ?? null,
        }))
        touch()
      },

      async run() {
        const { problem, customCases } = get()
        if (!problem) return
        const visible = problem.tests.filter((test) => !test.hidden).map(toTestCase)
        const custom = customCases.map((item) => ({ id: item.id, args: item.args, hidden: false }))
        await execute("run", [...visible, ...custom])
      },

      async submit() {
        const { problem } = get()
        if (!problem) return
        await execute("submit", problem.tests.map(toTestCase))
      },

      flush() {
        if (saveTimer) save()
      },
    }
  })
}

/** The Workspace's store: one problem open at a time. */
export const workspaceStore = createWorkspaceStore()

export function useWorkspace<T>(selector: (state: WorkspaceState) => T): T {
  return useStore(workspaceStore, selector)
}
