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

export const ProfileSchema = z.object({
  id: z.uuid(),
  displayName: z.string().nullable(),
  timezone: z.string(),
  settings: z.record(z.string(), z.unknown()),
  createdAt: z.iso.datetime({ offset: true }),
})
export type Profile = z.infer<typeof ProfileSchema>

// ---------------------------------------------------------------- content (16.2, 16.3)

export const DifficultySchema = z.enum(["easy", "medium", "hard"])
export type Difficulty = z.infer<typeof DifficultySchema>

export const ComplexitySchema = z.enum([
  "O(1)",
  "O(log n)",
  "O(n)",
  "O(n log n)",
  "O(n²)",
  "O(2ⁿ)",
  "Not sure",
])
export type Complexity = z.infer<typeof ComplexitySchema>

export const CompareModeSchema = z.enum(["exact", "unordered", "unordered_nested", "float"])

export const ProblemStatusSchema = z.enum(["new", "attempted", "solved", "mastered"])
export type ProblemStatus = z.infer<typeof ProblemStatusSchema>

export const TestCaseSchema = z.object({
  id: z.string(),
  args: z.array(z.unknown()),
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
  entry: z.string(),
  starterCode: z.string(),
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
  lastAttemptAt: z.iso.datetime({ offset: true }).nullable(),
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
