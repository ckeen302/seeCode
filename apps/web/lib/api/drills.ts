// Drills (Sections 6.6, 11.7, 16.2 and 16.3): schemas and endpoint calls.
import { z } from "zod"

import { api } from "@/lib/api/hooks"
import { ComplexitySchema, PlanGradeSchema, SignalSchema, type PlanCard } from "@/lib/api/schemas"

const Timestamp = z.iso.datetime({ offset: true })

export const DrillModeSchema = z.enum(["recognition", "toolkit"])
export type DrillMode = z.infer<typeof DrillModeSchema>

export const DRILL_SIZES = [10, 20, 30] as const
export type DrillSize = (typeof DRILL_SIZES)[number]

/** A problem statement without its title (recognition cards and plan reviews). */
export const ProblemCardSchema = z.object({
  slug: z.string(),
  summary: z.string(),
  examples: z.array(
    z.object({ input: z.string(), output: z.string(), explanation: z.string().optional() })
  ),
  constraints: z.array(z.string()),
  targets: z.object({ time: ComplexitySchema, space: ComplexitySchema }),
})
export type ProblemCard = z.infer<typeof ProblemCardSchema>

export const RecognitionCardSchema = ProblemCardSchema.extend({
  id: z.string(),
  mode: z.literal("recognition"),
})
export type RecognitionCard = z.infer<typeof RecognitionCardSchema>

export const ToolkitPromptSchema = z.object({
  toolkitId: z.string(),
  phrase: z.string(),
  options: z.array(z.string()),
})
export type ToolkitPrompt = z.infer<typeof ToolkitPromptSchema>

export const ToolkitDrillCardSchema = ToolkitPromptSchema.extend({
  id: z.string(),
  mode: z.literal("toolkit"),
})
export type ToolkitDrillCard = z.infer<typeof ToolkitDrillCardSchema>

export const DrillCardSchema = z.discriminatedUnion("mode", [
  RecognitionCardSchema,
  ToolkitDrillCardSchema,
])
export type DrillCard = z.infer<typeof DrillCardSchema>

export const DrillSessionViewSchema = z.object({
  sessionId: z.string(),
  cards: z.array(DrillCardSchema),
})
export type DrillSessionView = z.infer<typeof DrillSessionViewSchema>

/** Recognition: planGrade (reveal filled), signals, title. Toolkit: tool and example. */
export const DrillFeedbackSchema = z.object({
  correct: z.boolean(),
  planGrade: PlanGradeSchema.optional(),
  signals: z.array(SignalSchema).optional(),
  title: z.string().optional(),
  tool: z.string().optional(),
  example: z.string().optional(),
})
export type DrillFeedback = z.infer<typeof DrillFeedbackSchema>

const TallySchema = z.object({ correct: z.number().int(), total: z.number().int() })

export const DrillSummarySchema = z.object({
  sessionId: z.string(),
  mode: DrillModeSchema,
  size: z.number().int(),
  answered: z.number().int(),
  correct: z.number().int(),
  accuracy: z.number().nullable(),
  medianSeconds: z.number().nullable(),
  overtime: z.number().int(),
  fields: z
    .object({
      pattern: TallySchema,
      structures: TallySchema,
      time: TallySchema,
      space: TallySchema,
      twist: TallySchema,
    })
    .nullable(),
  patterns: z.array(
    z.object({
      patternId: z.string(),
      patternName: z.string(),
      answered: z.number().int(),
      correct: z.number().int(),
    })
  ),
  missed: z.array(
    z.object({
      cardId: z.string(),
      slug: z.string().optional(),
      title: z.string().optional(),
      patternId: z.string().optional(),
      toolkitId: z.string().optional(),
      phrase: z.string().optional(),
      tool: z.string().optional(),
      inReview: z.boolean(),
    })
  ),
  addMissedToReview: z.boolean(),
  startedAt: Timestamp,
  finishedAt: Timestamp,
})
export type DrillSummary = z.infer<typeof DrillSummarySchema>

export interface DrillSessionRequest {
  mode: DrillMode
  patternFilter?: string | null
  size: number
}

export type DrillAnswer = PlanCard | { tool: string }

export function startDrillSession(body: DrillSessionRequest): Promise<DrillSessionView> {
  return api.post("/drills/sessions", DrillSessionViewSchema, {
    mode: body.mode,
    size: body.size,
    ...(body.patternFilter ? { patternFilter: body.patternFilter } : {}),
  })
}

export function answerDrillCard(
  sessionId: string,
  body: { cardId: string; answer: DrillAnswer; seconds: number; overtime: boolean }
): Promise<DrillFeedback> {
  return api.post(
    `/drills/sessions/${encodeURIComponent(sessionId)}/answers`,
    DrillFeedbackSchema,
    body
  )
}

/** Finishing again is allowed; `addMissedToReview` applies the end screen's toggle. */
export function finishDrillSession(
  sessionId: string,
  addMissedToReview?: boolean
): Promise<DrillSummary> {
  return api.post(
    `/drills/sessions/${encodeURIComponent(sessionId)}/finish`,
    DrillSummarySchema,
    addMissedToReview === undefined ? undefined : { addMissedToReview }
  )
}

/** Reads `/drills/session` search params, falling back to the defaults of Section 6.6. */
export function parseDrillParams(params: {
  get(name: string): string | null
}): DrillSessionRequest {
  const mode = params.get("mode") === "toolkit" ? "toolkit" : "recognition"
  const rawSize = Number(params.get("size"))
  const size = (DRILL_SIZES as readonly number[]).includes(rawSize) ? rawSize : 10
  const pattern = params.get("pattern")?.trim() || null
  return { mode, size, patternFilter: pattern }
}

export function drillSessionHref(request: DrillSessionRequest): string {
  const search = new URLSearchParams({ mode: request.mode })
  if (request.patternFilter) search.set("pattern", request.patternFilter)
  if (request.size !== 10) search.set("size", String(request.size))
  return `/drills/session?${search.toString()}`
}
