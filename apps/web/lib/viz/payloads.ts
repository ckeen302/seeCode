// Walkthrough payloads the app builds itself (Sections 6.4, 7.6 and 7.7): the inputs of a
// problem's visible tests and custom cases, Trace my code's payload (no reference solution,
// no viz config: the automatic renderers draw the learner's code), and a pattern's demo.
import type {
  ProblemPublic,
  VizConfig,
  WalkthroughInput,
  WalkthroughPayload,
} from "@/lib/api/schemas"
import type { CustomCase } from "@/lib/workspace/storage"

/** A viz config with nothing in it: Trace my code ignores it (8.5's automatic mapping). */
export const EMPTY_VIZ: VizConfig = {
  primary: "",
  pointers: [],
  window: null,
  range: null,
  roles: { stack: [], queue: [], hidden: [] },
  confirmed: null,
  events: [],
  predict: [],
}

/** The visible tests in order, as "Example 1", "Example 2"… (the walkthrough's labels). */
export function visibleInputs(problem: Pick<ProblemPublic, "tests">): WalkthroughInput[] {
  return problem.tests
    .filter((test) => !test.hidden)
    .map((test, index) => ({
      label: `Example ${index + 1}`,
      ...(test.ops ? { ops: test.ops } : { args: test.args ?? [] }),
    }))
}

/** The learner's custom cases as extra inputs ("Custom 1"…); design problems have none. */
export function customInputs(
  problem: Pick<ProblemPublic, "kind">,
  cases: readonly CustomCase[]
): WalkthroughInput[] {
  if (problem.kind === "design") return []
  return cases.map((custom, index) => ({ label: `Custom ${index + 1}`, args: custom.args }))
}

/**
 * Trace my code (7.7): everything the player needs to trace the learner's code, built from
 * the public problem alone. `code` stays empty: the player traces `userCode` instead, so no
 * reference solution is ever fetched or shown.
 */
export function traceMinePayload(
  problem: Pick<ProblemPublic, "kind" | "entry" | "io" | "tests">
): WalkthroughPayload {
  return {
    code: "",
    kind: problem.kind,
    entry: problem.entry,
    io: problem.io,
    viz: EMPTY_VIZ,
    inputs: visibleInputs(problem),
  }
}

/** A pattern's `demo` (Section 10.2): its own code, one input, and its viz config. */
export interface PatternDemo {
  code: string
  entry: string
  args: unknown[]
  viz: VizConfig
}

export function demoPayload(demo: PatternDemo): WalkthroughPayload {
  return {
    code: demo.code,
    kind: "function",
    entry: demo.entry,
    viz: demo.viz,
    inputs: [{ label: "Demo", args: demo.args }],
  }
}
