// Workspace data kept in the browser (Sections 7.9 and 16.2):
// - `seecode:attempt:{slug}`: the current attempt of a problem, for every user: code, custom
//   cases and the Plan card as typed. A signed-in user's entry names its attempt and whether
//   its code has changes the API has not received yet; a guest's entry (no attempt id) also
//   holds the coach state (plan checks, opened rungs, wrap-up), which the API keeps for
//   signed-in users.
// - `seecode:guest:attempts`: a guest's attempts in the `GuestAttempt` shape that
//   `POST /guest/import` takes after sign-in.
import { z } from "zod"

import {
  HintContentSchema,
  PlanCardSchema,
  PlanGradeSchema,
  RelatedProblemSchema,
} from "@/lib/api/schemas"

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export const GUEST_ATTEMPTS_KEY = "seecode:guest:attempts"
const ATTEMPT_PREFIX = "seecode:attempt:"
/** `POST /guest/import` takes at most 50 attempts. */
export const MAX_GUEST_ATTEMPTS = 50

export function attemptKey(slug: string): string {
  return `${ATTEMPT_PREFIX}${slug}`
}

export const CustomCaseSchema = z.object({ id: z.string(), args: z.array(z.unknown()) })
export type CustomCase = z.infer<typeof CustomCaseSchema>

/** The wrap-up a guest saw after solving (rebuilt from this browser's data). */
export const GuestWrapUpSchema = z.object({
  patternId: z.string().nullable(),
  twist: z.string().nullable(),
  maxRung: z.number().int(),
  planRightFirstTime: z.boolean(),
  timeSeconds: z.number(),
  related: z.array(RelatedProblemSchema).catch([]),
})
export type GuestWrapUp = z.infer<typeof GuestWrapUpSchema>

/** A guest's coach state for one attempt (the API keeps it for signed-in users). */
export const GuestCoachSchema = z.object({
  /** The plan behind `planGrade`. */
  checkedPlan: PlanCardSchema.nullable(),
  planGrade: PlanGradeSchema.nullable(),
  planChecks: z.number().int().min(0).max(3),
  planFirstCorrect: z.boolean().nullable(),
  /** Opened hint rungs, in order (guests open them strictly in order too). */
  rungs: z.array(HintContentSchema),
  plannedFirst: z.boolean(),
  planSkipped: z.boolean(),
  runs: z.number().int().min(0),
  activeSeconds: z.number().min(0),
  wrapUp: GuestWrapUpSchema.nullable(),
})
export type GuestCoach = z.infer<typeof GuestCoachSchema>

export const LocalAttemptSchema = z.object({
  v: z.literal(1),
  code: z.string(),
  customCases: z.array(CustomCaseSchema).catch([]),
  solved: z.boolean().catch(false),
  startedAt: z.string(),
  updatedAt: z.string(),
  solvedAt: z.string().nullable().catch(null),
  // M3. Entries written before have none of these, and parse with the defaults.
  /** The signed-in attempt this entry belongs to; null for a guest's work. */
  attemptId: z.string().nullable().catch(null),
  /** The code has changes the API has not received yet. */
  pending: z.boolean().catch(false),
  /** The Plan card as typed, checked or not. */
  plan: PlanCardSchema.nullable().catch(null),
  /** The "Planning first helps it stick" tip was shown in this attempt. */
  runTipSeen: z.boolean().catch(false),
  coach: GuestCoachSchema.nullable().catch(null),
})
export type LocalAttempt = z.infer<typeof LocalAttemptSchema>

/**
 * A guest's attempt as `POST /guest/import` takes it. Only `slug` and `startedAt` are
 * required by the API; M2 entries (slug, code, solved, timestamps) parse with defaults.
 */
export const GuestAttemptSchema = z.object({
  slug: z.string(),
  code: z.string(),
  solved: z.boolean(),
  startedAt: z.string(),
  updatedAt: z.string().optional(),
  solvedAt: z.string().nullable().optional(),
  /** Rungs 1 to maxRung were opened. */
  maxRung: z.number().int().min(0).max(6).catch(0),
  /** The last plan checked. */
  plan: PlanCardSchema.nullable().optional().catch(undefined),
  planChecks: z.number().int().min(0).max(3).catch(0),
  activeSeconds: z.number().int().min(0).catch(0),
  plannedFirst: z.boolean().catch(false),
  planSkipped: z.boolean().catch(false),
})
export type GuestAttempt = z.infer<typeof GuestAttemptSchema>

/** localStorage, or null where it is unavailable (server, blocked storage). */
export function browserStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage
  } catch {
    return null
  }
}

function readJson(storage: StorageLike | null, key: string): unknown {
  if (!storage) return null
  try {
    const raw = storage.getItem(key)
    return raw === null ? null : JSON.parse(raw)
  } catch {
    return null
  }
}

function writeJson(storage: StorageLike | null, key: string, value: unknown): void {
  try {
    storage?.setItem(key, JSON.stringify(value))
  } catch {
    // Full or blocked storage: the work stays in memory for this page.
  }
}

export function readAttempt(storage: StorageLike | null, slug: string): LocalAttempt | null {
  const parsed = LocalAttemptSchema.safeParse(readJson(storage, attemptKey(slug)))
  return parsed.success ? parsed.data : null
}

export function writeAttempt(storage: StorageLike | null, slug: string, attempt: LocalAttempt) {
  writeJson(storage, attemptKey(slug), attempt)
}

export function removeAttempt(storage: StorageLike | null, slug: string): void {
  try {
    storage?.removeItem(attemptKey(slug))
  } catch {
    // Blocked storage: nothing was kept anyway.
  }
}

export function readGuestAttempts(storage: StorageLike | null): GuestAttempt[] {
  const raw = readJson(storage, GUEST_ATTEMPTS_KEY)
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item) => {
    const parsed = GuestAttemptSchema.safeParse(item)
    return parsed.success ? [parsed.data] : []
  })
}

const sameAttempt = (a: GuestAttempt, b: Pick<GuestAttempt, "slug" | "startedAt">) =>
  a.slug === b.slug && a.startedAt === b.startedAt

/**
 * Adds or replaces a guest attempt. An attempt is its problem plus `startedAt` (the API's
 * import key), so a solved attempt stays listed after the guest starts the problem over.
 */
export function upsertGuestAttempt(storage: StorageLike | null, attempt: GuestAttempt): void {
  const others = readGuestAttempts(storage).filter((item) => !sameAttempt(item, attempt))
  writeJson(storage, GUEST_ATTEMPTS_KEY, [...others, attempt].slice(-MAX_GUEST_ATTEMPTS))
}

/** Removes the given attempts (after `POST /guest/import` took them); keeps any others. */
export function removeGuestAttempts(
  storage: StorageLike | null,
  attempts: readonly Pick<GuestAttempt, "slug" | "startedAt">[]
): void {
  const left = readGuestAttempts(storage).filter(
    (item) => !attempts.some((sent) => sameAttempt(item, sent))
  )
  if (left.length > 0) writeJson(storage, GUEST_ATTEMPTS_KEY, left)
  else {
    try {
      storage?.removeItem(GUEST_ATTEMPTS_KEY)
    } catch {
      // Blocked storage.
    }
  }
}

/** What this browser knows about a problem: attempted, solved, or nothing yet. */
export function localStatus(
  storage: StorageLike | null,
  slug: string
): "attempted" | "solved" | null {
  const attempt = readAttempt(storage, slug)
  if (!attempt) return null
  return attempt.solved ? "solved" : "attempted"
}
