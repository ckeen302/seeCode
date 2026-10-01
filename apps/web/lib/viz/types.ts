// Visualization types (Sections 8.3 and 8.4, PARITY_PLAN 4.5). The tracer
// (public/py/tracer.py) produces Trace; the viz config comes from the problem's content.

/** A JSON-safe description of a Python value (8.3), as tracer.py's snap() writes it. */
export type Snap =
  | { t: "prim"; v: number | boolean | null; /** a float (4.0 is not 4) */ f?: boolean }
  | { t: "str"; v: string; n: number }
  | { t: "list"; v: Snap[]; n: number; cls: string }
  | { t: "deque"; v: Snap[]; n: number }
  | { t: "dict"; v: [Snap, Snap][]; n: number; cls: string }
  | { t: "set"; v: Snap[]; n: number; cls?: string }
  | { t: "obj"; v: string; cls: string }
  | NodeSnap
  | { t: "trunc" }

/**
 * A node object (ListNode, TreeNode, Node) with its identity: the same `id` for the same
 * object across a trace. Links hold node ids; `null` is no node. Each frame lists every node
 * reachable from its locals once, in `Frame.nodes`.
 */
export interface NodeSnap {
  t: "node"
  id: number
  cls: string
  val: Snap
  next?: number | null
  left?: number | null
  right?: number | null
  random?: number | null
  neighbors?: number[]
}

export type FrameEvent = "line" | "return"

/** One step: the state just before `line` runs ("line"), or a function returning `ret`. */
export interface Frame {
  line: number
  event: FrameEvent
  func: string
  depth: number
  locals: Record<string, Snap>
  /** Viz event ids that fired here, plus "predict:<n>" for predict point n. */
  tags: string[]
  say?: string
  ret?: Snap
  /** Instance attributes of `self`, for methods of the code's own class. */
  self?: Record<string, Snap>
  /** Every node reachable from this frame's values, by id. */
  nodes?: Record<string, NodeSnap>
  nodesTruncated?: boolean
  /** Answers of the predict points asked at this step, by point index. */
  predictAnswers?: Record<string, Snap>
}

export interface Trace {
  steps: Frame[]
  result: Snap
  error: string | null
  /** The line of the user's code the error points at. */
  errorLine?: number | null
  truncated: boolean
  /** What the code printed (first 4,000 characters). */
  stdout?: string
}

// ---------------------------------------------------------------- the viz config (8.4)

export type PointerColor = "a" | "b" | "c" | "d"

export interface VizPointer {
  var: string
  into: string
  label: string
  color: PointerColor
}

export interface VizWindow {
  into: string
  start: string
  end: string
  inclusive: boolean
}

export interface VizRange {
  into: string
  lo: string
  hi: string
  mid: string | null
}

export interface VizRoles {
  stack: string[]
  queue: string[]
  hidden: string[]
}

export interface VizConfirmed {
  into: string
  outside: string[]
}

export interface VizEvent {
  id: string
  at: string
  when?: string | null
  label: string
  say?: string | null
}

export type PredictKind = "index" | "yesno" | "value"

export interface PredictPoint {
  atEvent: string
  occurrence: number
  ask: string
  var?: string | null
  kind: PredictKind
  answerWhen?: string | null
}

/** A problem's viz config with every key filled in (as the API sends it). */
export interface VizConfig {
  primary: string
  pointers: VizPointer[]
  window: VizWindow | null
  range: VizRange | null
  roles: VizRoles
  confirmed: VizConfirmed | null
  events: VizEvent[]
  predict: PredictPoint[]
}

// ---------------------------------------------------------------- what gets traced

export type IoType =
  "json" | "list_node" | "list_node[]" | "tree_node" | "tree_node[]" | "random_list" | "graph_node"

export interface IoSpec {
  params: { name: string; type: IoType }[]
  returns?: IoType
  inPlace?: string | null
}

export type ProblemKind = "function" | "design"

/** The harness's description of a problem (its spec_json): how inputs are run. */
export interface RunSpec {
  kind?: ProblemKind
  io?: IoSpec | null
  checker?: string | null
}

/** One input to trace: a function problem's arguments, or a design problem's calls. */
export interface WalkthroughInput {
  label: string
  args?: unknown[]
  ops?: unknown[][]
}

/** `WalkthroughPayload` of hint rung 5 (Section 16.3): the reference solution, with its
 * `# viz:` markers, its viz config and the inputs to trace (the visible tests). */
export interface WalkthroughPayload {
  code: string
  kind?: ProblemKind
  entry: string
  io?: IoSpec | null
  viz: VizConfig
  inputs: WalkthroughInput[]
}

/** A recorded predict-mode answer (Section 8.6), as `POST /attempts/{id}/predictions` takes it. */
export interface Prediction {
  id: string
  correct: boolean
}
