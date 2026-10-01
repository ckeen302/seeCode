// Review (Sections 6.7, 11.4, 11.5 and 16.2): schemas, the queue hook and answer calls.
import { useQuery } from "@tanstack/react-query"
import { z } from "zod"

import { api } from "@/lib/api/hooks"
import { ProblemCardSchema, ToolkitPromptSchema, type DrillAnswer } from "@/lib/api/drills"
import { useUserId } from "@/lib/api/patterns"
import { PlanGradeSchema, SignalSchema } from "@/lib/api/schemas"

const Timestamp = z.iso.datetime({ offset: true })

export const ReviewCardSchema = z.object({
  itemId: z.string(),
  kind: z.enum(["problem_plan", "toolkit"]),
  /** Reviewed by solving the problem again in the Workspace. */
  resolve: z.boolean(),
  problem: ProblemCardSchema.optional(),
  /** False for a drill-only problem: there is no Workspace page to re-solve it in. */
  hasWorkspace: z.boolean().optional(),
  toolkit: ToolkitPromptSchema.optional(),
})
export type ReviewCard = z.infer<typeof ReviewCardSchema>

export const GradeSchema = z.enum(["again", "hard", "good", "easy"])
export type Grade = z.infer<typeof GradeSchema>

export const ReviewAnswerResultSchema = z.object({
  planGrade: PlanGradeSchema.optional(),
  correct: z.boolean(),
  needsSelfRating: z.boolean(),
  grade: GradeSchema.optional(),
  nextDueAt: Timestamp.optional(),
  signals: z.array(SignalSchema).optional(),
  title: z.string().optional(),
  tool: z.string().optional(),
  example: z.string().optional(),
})
export type ReviewAnswerResult = z.infer<typeof ReviewAnswerResultSchema>

export const ReviewRateResultSchema = z.object({
  grade: z.enum(["hard", "good"]),
  nextDueAt: Timestamp,
})
export type ReviewRateResult = z.infer<typeof ReviewRateResultSchema>

/** Section 6.7: default 10 items per session, at most 20. */
export const REVIEW_SESSION_SIZE = 10

export function reviewQueueKey(userId: string | null) {
  return ["review-queue", userId] as const
}

export function useReviewQueue() {
  const userId = useUserId()
  return useQuery({
    queryKey: reviewQueueKey(userId),
    queryFn: () => api.get("/review/queue", z.array(ReviewCardSchema)),
    enabled: userId !== null,
    // A session works through a snapshot of the queue; answering must not reshuffle it.
    staleTime: Infinity,
    refetchOnMount: "always",
  })
}

export function answerReview(
  itemId: string,
  body: { answer: DrillAnswer; seconds: number }
): Promise<ReviewAnswerResult> {
  return api.post(`/review/${encodeURIComponent(itemId)}/answer`, ReviewAnswerResultSchema, body)
}

export function rateReview(itemId: string, rating: "hard" | "good"): Promise<ReviewRateResult> {
  return api.post(`/review/${encodeURIComponent(itemId)}/rate`, ReviewRateResultSchema, {
    rating,
  })
}

/**
 * The end screen's "3 items tomorrow, 5 next week": next due dates grouped by how far away
 * they are, from `now` in the browser's time zone.
 */
export function summarizeNextDue(dates: readonly string[], now: Date = new Date()): string[] {
  const startOfDay = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const today = startOfDay(now)
  const buckets = new Map<string, number>()
  const order: string[] = []
  const add = (label: string) => {
    if (!buckets.has(label)) order.push(label)
    buckets.set(label, (buckets.get(label) ?? 0) + 1)
  }
  const sorted = [...dates].sort()
  for (const iso of sorted) {
    const days = Math.round((startOfDay(new Date(iso)) - today) / 86_400_000)
    if (days <= 0) add("later today")
    else if (days === 1) add("tomorrow")
    else if (days < 7) add(`in ${days} days`)
    else if (days < 14) add("next week")
    else if (days < 31) add(`in ${Math.round(days / 7)} weeks`)
    else add(`in ${Math.max(1, Math.round(days / 30))} months`)
  }
  return order.map((label) => {
    const count = buckets.get(label) ?? 0
    return `${count} ${count === 1 ? "item" : "items"} ${label}`
  })
}
