// Stats (Sections 6.8 and 16.2): schema and query hook.
import { useQuery } from "@tanstack/react-query"
import { z } from "zod"

import { api } from "@/lib/api/hooks"
import { PatternStateSchema, useUserId } from "@/lib/api/patterns"

export const StatsViewSchema = z.object({
  streak: z.number().int(),
  longestStreak: z.number().int(),
  totals: z.object({
    solved: z.number().int(),
    mastered: z.number().int(),
    problems: z.number().int(),
    drills: z.number().int(),
    reviews: z.number().int(),
    activeDays: z.number().int(),
  }),
  patterns: z.array(
    z.object({
      patternId: z.string(),
      patternName: z.string(),
      state: PatternStateSchema,
      solved: z.number().int(),
      mastered: z.number().int(),
      total: z.number().int(),
      medianFirstRung: z.number().nullable(),
      drillAccuracy: z.number().nullable(),
      drillAnswers: z.number().int(),
    })
  ),
  weeks: z.array(
    z.object({
      weekStart: z.iso.date(),
      activeDays: z.number().int(),
      solved: z.number().int(),
      drills: z.number().int(),
      reviews: z.number().int(),
      remembered: z.number().int(),
      medianPlanSeconds: z.number().nullable(),
      /** Seven counts: first attempts that finished with max rung 0 through 6. */
      firstAttemptRungs: z.array(z.number().int()),
    })
  ),
  commonMisses: z.array(
    z.object({
      kind: z.enum(["structure", "time", "space"]),
      id: z.string(),
      label: z.string(),
      count: z.number().int(),
    })
  ),
  reviewRetention: z.object({
    reviews: z.number().int(),
    remembered: z.number().int(),
    rate: z.number().nullable(),
  }),
})
export type StatsData = z.infer<typeof StatsViewSchema>
export type WeekRow = StatsData["weeks"][number]

export function useStats() {
  const userId = useUserId()
  return useQuery({
    queryKey: ["stats", userId],
    queryFn: () => api.get("/stats", StatsViewSchema),
    enabled: userId !== null,
  })
}
