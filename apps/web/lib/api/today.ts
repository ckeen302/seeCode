// Today (Sections 6.2, 11.8 and 16.3): schema and query hook.
import { useQuery } from "@tanstack/react-query"
import { z } from "zod"

import { api } from "@/lib/api/hooks"
import { DifficultySchema } from "@/lib/api/schemas"
import { useUserId } from "@/lib/api/patterns"

const Timestamp = z.iso.datetime({ offset: true })

export const TodayViewSchema = z.object({
  greetingName: z.string(),
  streak: z.number().int(),
  reviewsDue: z.number().int(),
  reviewPatterns: z.array(z.string()),
  continue: z
    .object({
      slug: z.string(),
      title: z.string(),
      difficulty: DifficultySchema,
      /** Null for an unsolved problem in progress (its pattern would spoil recognition). */
      patternId: z.string().nullable(),
      inProgress: z.boolean(),
      lastActiveAt: Timestamp.nullable(),
    })
    .nullable(),
  drill: z
    .object({ patternId: z.string(), patternName: z.string(), reason: z.string() })
    .nullable(),
  week: z.object({
    solved: z.number().int(),
    drills: z.number().int(),
    reviews: z.number().int(),
    medianPlanSeconds: z.number().nullable(),
  }),
  /** Only for a brand-new user: the single "Start with your first pattern" card. */
  start: z.object({ patternId: z.string(), patternName: z.string() }).nullable(),
})
export type TodayData = z.infer<typeof TodayViewSchema>

export function todayKey(userId: string | null) {
  return ["today", userId] as const
}

export function useToday() {
  const userId = useUserId()
  return useQuery({
    queryKey: todayKey(userId),
    queryFn: () => api.get("/today", TodayViewSchema),
    enabled: userId !== null,
  })
}

/** The Review badge in the sidebar: due items for a signed-in user, else undefined. */
export function useReviewsDue(): number | undefined {
  const today = useToday()
  return today.data?.reviewsDue
}
