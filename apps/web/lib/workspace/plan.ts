// The Plan card's vocabulary (Section 7.3) and small pure helpers around it.
import type {
  Complexity,
  FieldResult,
  PatternSummary,
  PlanCard,
  PlanField,
  PlanGrade,
  PlanReveal,
} from "@/lib/api/schemas"

export const MAX_PLAN_CHECKS = 3
export const MAX_STRUCTURES = 4
export const MAX_TWIST_CHARS = 140

export const NOT_SURE: Complexity = "Not sure"
export const BRUTE_FORCE = "brute_force"
export const NOT_SURE_PATTERN = "not_sure"

/** Time answers: Section 7.3's list first, the rarer values under "More" (by growth). */
export const COMMON_TIME = [
  "O(1)",
  "O(log n)",
  "O(n)",
  "O(n log n)",
  "O(n²)",
  "O(2ⁿ)",
] as const satisfies readonly Complexity[]
export const MORE_TIME = [
  "O(√n)",
  "O(k log n)",
  "O(n log k)",
  "O(n·m)",
  "O(V + E)",
  "O(E log V)",
  "O(n³)",
  "O(n·2ⁿ)",
  "O(n!)",
] as const satisfies readonly Complexity[]

/**
 * Space answers: Section 7.3's list, plus O(n·m) under "More". O(k) would fit here too, but
 * it is not a complexity the API accepts (apps/api/app/content/models.py), so it is left out.
 */
export const COMMON_SPACE = [
  "O(1)",
  "O(log n)",
  "O(n)",
  "O(n²)",
] as const satisfies readonly Complexity[]
export const MORE_SPACE = ["O(n·m)"] as const satisfies readonly Complexity[]

export const EMPTY_PLAN: PlanCard = {
  pattern: null,
  structures: [],
  time: null,
  space: null,
  twist: "",
}

export const PLAN_FIELDS: readonly PlanField[] = ["pattern", "structures", "time", "space", "twist"]

export const FIELD_LABELS: Record<PlanField, string> = {
  pattern: "Pattern",
  structures: "Structures",
  time: "Time",
  space: "Space",
  twist: "Twist",
}

/** Section 18.7: "Not quite" instead of "Wrong". */
export const RESULT_LABELS: Record<FieldResult, string> = {
  correct: "Correct",
  close: "Close",
  wrong: "Not quite",
}

/** Check plan needs a pattern and at least one complexity (7.3); the API refuses less. */
export function canCheckPlan(plan: PlanCard): boolean {
  return plan.pattern !== null && (plan.time !== null || plan.space !== null)
}

/** The plan as the API takes it: a trimmed twist, at most 4 distinct structures. */
export function planForRequest(plan: PlanCard): PlanCard {
  return {
    pattern: plan.pattern,
    structures: [...new Set(plan.structures)].slice(0, MAX_STRUCTURES),
    time: plan.time,
    space: plan.space,
    twist: plan.twist.trim().slice(0, MAX_TWIST_CHARS),
  }
}

function fieldValue(plan: PlanCard, field: PlanField): string {
  if (field === "structures") return [...plan.structures].sort().join(",")
  if (field === "twist") return plan.twist.trim().replace(/\s+/g, " ")
  return plan[field] ?? ""
}

/** Whether a field still holds what was checked (its badge then still applies). */
export function sameField(a: PlanCard, b: PlanCard, field: PlanField): boolean {
  return fieldValue(a, field) === fieldValue(b, field)
}

export function samePlan(a: PlanCard, b: PlanCard): boolean {
  return PLAN_FIELDS.every((field) => sameField(a, b, field))
}

/** The plan to reveal: the grade's (third check, or rung 3 open) or rung 3's own. */
export function revealedPlan(
  grade: PlanGrade | null,
  rung3Reveal: PlanReveal | null | undefined
): PlanReveal | null {
  return grade?.reveal ?? rung3Reveal ?? null
}

/** Pattern answers: the patterns in roadmap order, then "Brute force" and "Not sure". */
export function patternOptions(
  patterns: readonly PatternSummary[]
): { id: string; name: string; family: string | null }[] {
  return [
    ...patterns.map((pattern) => ({ id: pattern.id, name: pattern.name, family: pattern.family })),
    { id: BRUTE_FORCE, name: "Brute force", family: null },
    { id: NOT_SURE_PATTERN, name: "Not sure", family: null },
  ]
}

/** A pattern answer's name ("Brute force", "Not sure", or the pattern's own). */
export function patternName(
  id: string | null | undefined,
  patterns: readonly PatternSummary[] | undefined
): string | null {
  if (!id) return null
  if (id === BRUTE_FORCE) return "Brute force"
  if (id === NOT_SURE_PATTERN) return "Not sure"
  return patterns?.find((pattern) => pattern.id === id)?.name ?? null
}

// Section 18.4: pattern chips carry a 6 px dot in their family's color; signal highlights
// (7.2) use the same colors. The pointer palette gives four distinct, theme-aware hues.
const FAMILY_COLORS: Record<string, string> = {
  two_pointers: "var(--ptr-a)",
  binary_search: "var(--ptr-b)",
  hashing: "var(--ptr-c)",
  stack: "var(--ptr-d)",
}
const SPARE_COLORS = ["var(--accent)", "var(--accent-2)", "var(--good)", "var(--ptr-d)"]

/** The color of a pattern family; unknown families (later topics) get a stable spare hue. */
export function familyColor(family: string | null | undefined): string {
  if (!family) return "var(--muted)"
  const known = FAMILY_COLORS[family]
  if (known) return known
  let hash = 0
  for (const char of family) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return SPARE_COLORS[hash % SPARE_COLORS.length]
}
