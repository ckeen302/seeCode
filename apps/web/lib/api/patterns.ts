// Roadmap and pattern pages (Sections 6.3, 6.4 and 16.2): schemas and query hooks.
import { queryOptions, useQuery } from "@tanstack/react-query"
import { z } from "zod"

import { api } from "@/lib/api/hooks"
import {
  DifficultySchema,
  ProblemStatusSchema,
  ToolkitCardSchema,
  VizConfigSchema,
} from "@/lib/api/schemas"
import { useAuth } from "@/lib/auth/session"

export const PatternStateSchema = z.enum(["locked", "available", "in_progress", "mastered"])
export type PatternState = z.infer<typeof PatternStateSchema>

export const PatternProgressSchema = z.object({
  solved: z.number().int(),
  mastered: z.number().int(),
})
export type PatternProgress = z.infer<typeof PatternProgressSchema>

export const RoadmapNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  family: z.string(),
  x: z.number().int(),
  y: z.number().int(),
  prereqs: z.array(z.string()),
  problemCount: z.number().int(),
  state: PatternStateSchema,
  /** Null when signed out (every pattern is then "available"). */
  progress: PatternProgressSchema.nullable(),
})
export type RoadmapNode = z.infer<typeof RoadmapNodeSchema>

export const RoadmapViewSchema = z.object({
  patterns: z.array(RoadmapNodeSchema),
  unlockRule: z.object({ solvedInPrereq: z.number().int() }),
})
export type RoadmapView = z.infer<typeof RoadmapViewSchema>

export const PatternProblemSchema = z.object({
  slug: z.string(),
  title: z.string(),
  difficulty: DifficultySchema,
  order: z.number().int(),
  status: ProblemStatusSchema.nullable(),
  /** The optimal twist, sent only once the user solved the problem. */
  twist: z.string().optional(),
})
export type PatternProblem = z.infer<typeof PatternProblemSchema>

export const PatternViewSchema = z.object({
  id: z.string(),
  family: z.string(),
  name: z.string(),
  idea: z.string(),
  explanation: z.string(),
  signals: z.array(z.object({ phrase: z.string(), meaning: z.string() })),
  template: z.string(),
  slots: z.array(z.object({ id: z.string(), label: z.string(), prompt: z.string() })),
  variations: z.array(z.object({ name: z.string(), line: z.string() })),
  mistakes: z.array(z.string()),
  demo: z.looseObject({
    code: z.string(),
    entry: z.string(),
    args: z.array(z.unknown()),
    viz: VizConfigSchema,
  }),
  toolkit: z.array(z.string()),
  toolkitCards: z.array(ToolkitCardSchema),
  problemCount: z.number().int(),
  state: PatternStateSchema,
  progress: PatternProgressSchema.nullable(),
  problems: z.array(PatternProblemSchema),
})
export type PatternView = z.infer<typeof PatternViewSchema>

/** The signed-in user's id, or null (signed out or still loading). */
export function useUserId(): string | null {
  const auth = useAuth()
  return auth.status === "signed_in" ? auth.user.id : null
}

/** Per-user answers depend on who asks, so the user is part of every key. */
export function roadmapQuery(userId: string | null) {
  return queryOptions({
    queryKey: ["roadmap", userId],
    queryFn: () => api.get("/content/roadmap", RoadmapViewSchema),
  })
}

export function patternQuery(patternId: string, userId: string | null) {
  return queryOptions({
    queryKey: ["pattern", patternId, userId],
    queryFn: () => api.get(`/content/patterns/${encodeURIComponent(patternId)}`, PatternViewSchema),
  })
}

/** Waits for the auth state, so a signed-in visitor never sees signed-out progress first. */
export function useRoadmap() {
  const auth = useAuth()
  const userId = auth.status === "signed_in" ? auth.user.id : null
  return useQuery({ ...roadmapQuery(userId), enabled: auth.status !== "loading" })
}

export function usePattern(patternId: string) {
  const auth = useAuth()
  const userId = auth.status === "signed_in" ? auth.user.id : null
  return useQuery({ ...patternQuery(patternId, userId), enabled: auth.status !== "loading" })
}

export const STATE_LABELS: Record<PatternState, string> = {
  locked: "Locked",
  available: "Available",
  in_progress: "In progress",
  mastered: "Mastered",
}
