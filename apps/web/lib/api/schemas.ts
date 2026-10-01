// zod schemas mirroring the API (Section 16). Every response is parsed with one of these.
import { z } from "zod"

export const ErrorEnvelopeSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
})

export const HealthSchema = z.object({
  ok: z.boolean(),
  contentVersion: z.string(),
})
export type Health = z.infer<typeof HealthSchema>

/** Timestamps carry a time zone (the API sends UTC with "Z"). */
const Timestamp = z.iso.datetime({ offset: true })

export const ProfileSchema = z.object({
  id: z.uuid(),
  displayName: z.string().nullable(),
  timezone: z.string(),
  settings: z.record(z.string(), z.unknown()),
  createdAt: Timestamp,
})
export type Profile = z.infer<typeof ProfileSchema>

// ---------------------------------------------------------------- content (16.2, 16.3)

export const DifficultySchema = z.enum(["easy", "medium", "hard"])
export type Difficulty = z.infer<typeof DifficultySchema>

/**
 * Complexity values, exactly as `apps/api/app/content/models.py` lists them: Section 16.3's
 * six, then the values added for the NeetCode parity topics (docs/PARITY_PLAN.md 4.4).
 */
export const CONTENT_COMPLEXITIES = [
  "O(1)",
  "O(log n)",
  "O(n)",
  "O(n log n)",
  "O(n²)",
  "O(2ⁿ)",
  "O(√n)",
  "O(n log k)",
  "O(k log n)",
  "O(n·m)",
  "O(V + E)",
  "O(E log V)",
  "O(n³)",
  "O(n·2ⁿ)",
  "O(n!)",
] as const

/** A complexity as content states it, or a Plan card answer ("Not sure" is an answer only). */
export const ComplexitySchema = z.enum([...CONTENT_COMPLEXITIES, "Not sure"])
export type Complexity = z.infer<typeof ComplexitySchema>

export const CompareModeSchema = z.enum([
  "exact",
  "unordered",
  "unordered_nested",
  "float",
  "checker",
])

export const ProblemStatusSchema = z.enum(["new", "attempted", "solved", "mastered"])
export type ProblemStatus = z.infer<typeof ProblemStatusSchema>

/** A function problem's test has `args`; a design problem's has `ops` (its calls, in order). */
export const TestCaseSchema = z.object({
  id: z.string(),
  args: z.array(z.unknown()).optional(),
  ops: z.array(z.array(z.unknown())).optional(),
  expected: z.unknown(),
  hidden: z.boolean(),
  compare: CompareModeSchema.optional(),
})

/** A Workspace problem without its answers (`GET /content/problems/{slug}`). */
export const ProblemPublicSchema = z.object({
  slug: z.string(),
  title: z.string(),
  leetcodeUrl: z.string(),
  difficulty: DifficultySchema,
  order: z.number().int(),
  summary: z.string(),
  examples: z.array(
    z.object({ input: z.string(), output: z.string(), explanation: z.string().optional() })
  ),
  constraints: z.array(z.string()),
  targets: z.object({ time: ComplexitySchema, space: ComplexitySchema }),
  // "design": `entry` is a class and each test is a list of calls (Min Stack, LRU Cache).
  kind: z.enum(["function", "design"]).default("function"),
  entry: z.string(),
  // Typed parameters (linked lists, trees…) and the answer checker, passed to the harness.
  io: z.unknown().optional(),
  starterCode: z.string(),
  checker: z.string().optional(),
  tests: z.array(TestCaseSchema),
  contentVersion: z.string(),
})
export type ProblemPublic = z.infer<typeof ProblemPublicSchema>

/** A row of `GET /content/problems`; `patternId` only once solved (or ?showPatterns=true). */
export const ProblemListItemSchema = z.object({
  slug: z.string(),
  title: z.string(),
  difficulty: DifficultySchema,
  order: z.number().int(),
  patternId: z.string().optional(),
  status: ProblemStatusSchema.nullable(),
  bestRung: z.number().int().nullable(),
  lastAttemptAt: Timestamp.nullable(),
})
export type ProblemListItem = z.infer<typeof ProblemListItemSchema>

export const PatternSummarySchema = z.object({
  id: z.string(),
  family: z.string(),
  name: z.string(),
  idea: z.string(),
  problemCount: z.number().int(),
})
export type PatternSummary = z.infer<typeof PatternSummarySchema>

/** A Plan card "Structures" option (`GET /content/structures`, Section 10.4). */
export const StructureSchema = z.object({ id: z.string(), label: z.string() })
export type Structure = z.infer<typeof StructureSchema>

/** A phrase → Python tool card (`GET /content/toolkit`, Section 10.5). */
export const ToolkitCardSchema = z.object({
  id: z.string(),
  tool: z.string(),
  phrases: z.array(z.string()),
  example: z.string(),
  patterns: z.array(z.string()),
})
export type ToolkitCard = z.infer<typeof ToolkitCardSchema>

// ---------------------------------------------------------------- plan (7.3, 11.1, 16.3)

/** What the user planned. `pattern` is a pattern id, "brute_force" or "not_sure". */
export const PlanCardSchema = z.object({
  pattern: z.string().nullable(),
  structures: z.array(z.string()),
  time: ComplexitySchema.nullable(),
  space: ComplexitySchema.nullable(),
  twist: z.string(),
})
export type PlanCard = z.infer<typeof PlanCardSchema>

export const FieldResultSchema = z.enum(["correct", "close", "wrong"])
export type FieldResult = z.infer<typeof FieldResultSchema>

const FieldGradeSchema = z.object({ result: FieldResultSchema, nudge: z.string().optional() })

/** The optimal approach, shown read-only in the Plan card once revealed. */
export const PlanRevealSchema = z.object({
  patternId: z.string(),
  structures: z.array(z.string()),
  time: ComplexitySchema,
  space: ComplexitySchema,
  twist: z.string(),
})
export type PlanReveal = z.infer<typeof PlanRevealSchema>

export const PlanGradeSchema = z.object({
  approachId: z.string(),
  score: z.number(),
  correct: z.boolean(),
  fields: z.object({
    pattern: FieldGradeSchema,
    structures: FieldGradeSchema.extend({
      // Sent only once the plan is revealed, or when nothing is missing.
      missing: z.array(z.string()).optional(),
      extra: z.array(z.string()).optional(),
    }),
    time: FieldGradeSchema,
    space: FieldGradeSchema,
    twist: z.object({
      result: FieldResultSchema,
      feedback: z.string().optional(),
      source: z.enum(["keywords", "ai"]),
    }),
  }),
  note: z.string().optional(),
  reveal: PlanRevealSchema.nullable(),
})
export type PlanGrade = z.infer<typeof PlanGradeSchema>
export type PlanField = keyof PlanGrade["fields"]

export const PlanCheckResultSchema = z.object({
  grade: PlanGradeSchema,
  checksLeft: z.number().int().min(0).max(3),
})
export type PlanCheckResult = z.infer<typeof PlanCheckResultSchema>

export const GuestPlanResultSchema = z.object({ grade: PlanGradeSchema })

// ---------------------------------------------------------------- hints (7.4, 16.3)

export const SignalSchema = z.object({
  phrase: z.string(),
  meaning: z.string(),
  pointsTo: z.string(),
})
export type Signal = z.infer<typeof SignalSchema>

// The viz config (Section 8.4). The API fills in every key; the walkthrough player (M4) reads
// it. Objects are loose so keys added by later content (docs/PARITY_PLAN.md) pass through.
const PointerSchema = z.looseObject({
  var: z.string(),
  into: z.string(),
  label: z.string(),
  color: z.enum(["a", "b", "c", "d"]),
})
const VizEventSchema = z.looseObject({
  id: z.string(),
  at: z.string(),
  when: z.string().nullish(),
  label: z.string(),
  say: z.string().nullish(),
})
const PredictSchema = z.looseObject({
  atEvent: z.string(),
  occurrence: z.number().int(),
  ask: z.string(),
  var: z.string().nullish(),
  kind: z.enum(["index", "yesno", "value"]),
  answerWhen: z.string().nullish(),
})
export const VizConfigSchema = z.looseObject({
  primary: z.string(),
  pointers: z.array(PointerSchema).default([]),
  window: z
    .looseObject({
      into: z.string(),
      start: z.string(),
      end: z.string(),
      inclusive: z.boolean().default(true),
    })
    .nullish(),
  range: z
    .looseObject({ into: z.string(), lo: z.string(), hi: z.string(), mid: z.string().nullish() })
    .nullish(),
  roles: z
    .looseObject({
      stack: z.array(z.string()).default([]),
      queue: z.array(z.string()).default([]),
      hidden: z.array(z.string()).default([]),
    })
    .default({ stack: [], queue: [], hidden: [] }),
  confirmed: z.looseObject({ into: z.string(), outside: z.array(z.string()) }).nullish(),
  events: z.array(VizEventSchema).default([]),
  predict: z.array(PredictSchema).default([]),
})
export type VizConfig = z.infer<typeof VizConfigSchema>

/** One input to trace: a visible test's `args`, or a design problem's calls (`ops`). */
export const WalkthroughInputSchema = z.object({
  label: z.string(),
  args: z.array(z.unknown()).optional(),
  ops: z.array(z.array(z.unknown())).optional(),
})
export type WalkthroughInput = z.infer<typeof WalkthroughInputSchema>

/** Hint rung 5, and See it run after solving (`GET /problems/{slug}/walkthrough`). */
export const WalkthroughPayloadSchema = z.object({
  code: z.string(),
  kind: z.enum(["function", "design"]).default("function"),
  entry: z.string(),
  io: z.unknown().optional(),
  viz: VizConfigSchema,
  inputs: z.array(WalkthroughInputSchema),
})
export type WalkthroughPayload = z.infer<typeof WalkthroughPayloadSchema>

export const SlotTextSchema = z.object({ id: z.string(), label: z.string(), text: z.string() })

export const ClarifyHintSchema = z.object({ rung: z.literal(1), clarify: z.string() })
export const SignalsHintSchema = z.object({
  rung: z.literal(2),
  signals: z.array(SignalSchema),
  constraintReading: z.string(),
})
export const ApproachHintSchema = z.object({
  rung: z.literal(3),
  patternId: z.string(),
  approach: z.string(),
  whyNot: z.string(),
  // The optimal plan: from rung 3 on the Plan card shows it (docs/DECISIONS.md).
  reveal: PlanRevealSchema,
})
export const PlanHintSchema = z.object({
  rung: z.literal(4),
  patternId: z.string(),
  slots: z.array(SlotTextSchema),
})
export const WalkthroughHintSchema = z.object({
  rung: z.literal(5),
  walkthrough: WalkthroughPayloadSchema,
})
export const SolutionHintSchema = z.object({
  rung: z.literal(6),
  code: z.string(),
  explanation: z.string(),
  toolkit: z.array(ToolkitCardSchema),
})

/** The content of one hint rung (sent only once that rung is open). */
export const HintContentSchema = z.discriminatedUnion("rung", [
  ClarifyHintSchema,
  SignalsHintSchema,
  ApproachHintSchema,
  PlanHintSchema,
  WalkthroughHintSchema,
  SolutionHintSchema,
])
export type HintContent = z.infer<typeof HintContentSchema>
export type HintOf<R extends HintContent["rung"]> = Extract<HintContent, { rung: R }>

// ---------------------------------------------------------------- attempts (16.2, 16.3)

export const AttemptStatusSchema = z.enum(["active", "finished", "abandoned"])
export type AttemptStatus = z.infer<typeof AttemptStatusSchema>

export const OutcomeSchema = z.enum([
  "solved_clean",
  "solved_with_help",
  "solved_with_solution",
  "gave_up",
  "abandoned",
])
export type Outcome = z.infer<typeof OutcomeSchema>

/** A harness result as the API stored it (exactly as the browser sent it). */
export const TestResultSchema = z.object({
  id: z.string(),
  status: z.enum(["pass", "fail", "error", "timeout"]),
  got: z.unknown().optional(),
  stdout: z.string().nullish(),
  error: z.string().nullish(),
  ms: z.number().nullish(),
})

export const FadingSchema = z.object({
  givenPattern: z.string().nullable(),
  freeRungs: z.array(z.number().int()),
})
export type Fading = z.infer<typeof FadingSchema>

/** `POST /attempts` (resume or create), `GET /attempts/{id}`, `POST .../restart`. */
export const AttemptViewSchema = z.object({
  id: z.string().min(1),
  slug: z.string(),
  status: AttemptStatusSchema,
  code: z.string(),
  plan: PlanCardSchema.nullable(),
  planGrade: PlanGradeSchema.nullable(),
  checksLeft: z.number().int(),
  maxRung: z.number().int(),
  openedRungs: z.array(HintContentSchema),
  fading: FadingSchema,
  lastResults: z.array(TestResultSchema).nullable(),
  activeSeconds: z.number().int(),
  outcome: OutcomeSchema.nullable(),
  // Beyond 16.3 (docs/DECISIONS.md): what resuming needs.
  runs: z.number().int(),
  plannedFirst: z.boolean(),
  planSkipped: z.boolean(),
  startedAt: Timestamp,
  updatedAt: Timestamp,
})
export type AttemptView = z.infer<typeof AttemptViewSchema>

export const PatchResultSchema = z.object({ ok: z.literal(true), updatedAt: Timestamp })

export const RelatedProblemSchema = z.object({
  slug: z.string(),
  title: z.string(),
  relation: z.string(),
  status: ProblemStatusSchema,
})
export type RelatedProblem = z.infer<typeof RelatedProblemSchema>

/** The wrap-up after a passing Submit (Section 7.8). */
export const WrapUpSchema = z.object({
  patternId: z.string(),
  patternName: z.string(),
  twist: z.string(),
  maxRung: z.number().int(),
  planRightFirstTime: z.boolean(),
  timeSeconds: z.number().int(),
  related: z.array(RelatedProblemSchema),
  nextReviewAt: Timestamp,
  nextProblemSlug: z.string().nullable(),
})
export type WrapUp = z.infer<typeof WrapUpSchema>

export const SubmitResultSchema = z.object({
  passed: z.boolean(),
  outcome: OutcomeSchema.optional(),
  wrapUp: WrapUpSchema.optional(),
})
export type SubmitResult = z.infer<typeof SubmitResultSchema>

export const EndResultSchema = z.object({ outcome: OutcomeSchema })

export const OkSchema = z.object({ ok: z.literal(true) })

// ---------------------------------------------------------------- guest mode, notes

export const GuestImportResultSchema = z.object({ imported: z.number().int() })

/** `GET`/`PUT /problems/{slug}/notes`; `updatedAt` is null until the first save. */
export const NoteViewSchema = z.object({ body: z.string(), updatedAt: Timestamp.nullable() })
export type NoteView = z.infer<typeof NoteViewSchema>
