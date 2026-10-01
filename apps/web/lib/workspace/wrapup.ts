// Copy for the wrap-up panel (Section 7.8) and the attempt's end states. Plain, short and
// never judgmental (18.7); only a solve gets an exclamation-free "Solved."
import type { Outcome } from "@/lib/api/schemas"
import { rungName } from "@/lib/workspace/ladder"

const DAY_MS = 24 * 60 * 60 * 1000

/** "45 s", "12 min", "1 h 5 min". */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  if (total < 60) return `${total} s`
  const minutes = Math.round(total / 60)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`
}

/** Which hints the attempt used: "No hints" or "Up to rung 3, Approach". */
export function hintsUsed(maxRung: number): string {
  if (maxRung <= 0) return "No hints"
  return `Up to rung ${maxRung}, ${rungName(maxRung)}`
}

/** Section 7.8's review line, in whole days from `now` (at least 1). */
export function reviewLine(nextReviewAt: string, now: Date): string {
  const due = new Date(nextReviewAt).getTime()
  const days = Math.max(1, Math.round((due - now.getTime()) / DAY_MS))
  return `We'll bring this back for review in ${days} ${days === 1 ? "day" : "days"}.`
}

/** A one-line reading of the outcome (Section 11.2). */
export const OUTCOME_COPY: Record<Outcome, string> = {
  solved_clean: "Solved on your own. That's the kind of solve that sticks.",
  solved_with_help: "Solved with a few hints. A review soon will make it yours.",
  solved_with_solution: "Solved after reading the solution. It comes back for review soon.",
  gave_up: "Attempt ended. It comes back for review soon, so you can try it fresh.",
  abandoned: "This attempt was replaced by a newer one.",
}
