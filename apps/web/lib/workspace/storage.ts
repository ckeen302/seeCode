// Workspace data kept in the browser (Sections 7.9 and 16.2):
// - `seecode:attempt:{slug}`: code and custom cases of the current attempt, for every user;
//   the M3 attempt sync adds the plan and opened rungs.
// - `seecode:guest:attempts`: a guest's attempts (slug, code, solved, timestamps), which
//   `POST /guest/import` uploads after sign-in (M3).
import { z } from "zod"

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export const GUEST_ATTEMPTS_KEY = "seecode:guest:attempts"
const ATTEMPT_PREFIX = "seecode:attempt:"

export function attemptKey(slug: string): string {
  return `${ATTEMPT_PREFIX}${slug}`
}

export const CustomCaseSchema = z.object({ id: z.string(), args: z.array(z.unknown()) })
export type CustomCase = z.infer<typeof CustomCaseSchema>

export const LocalAttemptSchema = z.object({
  v: z.literal(1),
  code: z.string(),
  customCases: z.array(CustomCaseSchema).catch([]),
  solved: z.boolean().catch(false),
  startedAt: z.string(),
  updatedAt: z.string(),
  solvedAt: z.string().nullable().catch(null),
})
export type LocalAttempt = z.infer<typeof LocalAttemptSchema>

export const GuestAttemptSchema = z.object({
  slug: z.string(),
  code: z.string(),
  solved: z.boolean(),
  startedAt: z.string(),
  updatedAt: z.string(),
  solvedAt: z.string().nullable(),
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

export function readGuestAttempts(storage: StorageLike | null): GuestAttempt[] {
  const raw = readJson(storage, GUEST_ATTEMPTS_KEY)
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item) => {
    const parsed = GuestAttemptSchema.safeParse(item)
    return parsed.success ? [parsed.data] : []
  })
}

/** Adds or replaces the guest attempt for `attempt.slug` (one entry per problem). */
export function upsertGuestAttempt(storage: StorageLike | null, attempt: GuestAttempt): void {
  const others = readGuestAttempts(storage).filter((item) => item.slug !== attempt.slug)
  writeJson(storage, GUEST_ATTEMPTS_KEY, [...others, attempt])
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
