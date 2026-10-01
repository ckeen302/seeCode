// The hint ladder (Section 7.4): six rungs, opened strictly in order.
import type { HintContent, HintOf } from "@/lib/api/schemas"

export const MAX_RUNG = 6
/** From this rung on the plan is revealed and the top bar may name the pattern (7.1, 7.3). */
export const REVEAL_RUNG = 3

export interface RungInfo {
  rung: HintContent["rung"]
  name: string
  /** What the rung gives, shown before it is opened. */
  blurb: string
}

export const RUNGS: readonly RungInfo[] = [
  { rung: 1, name: "Clarify", blurb: "Questions to ask, and a tiny example by hand" },
  { rung: 2, name: "Signals", blurb: "Phrases in the problem that point the way" },
  { rung: 3, name: "Approach", blurb: "The pattern, and why it fits" },
  { rung: 4, name: "Plan", blurb: "The template, filled in for this problem" },
  { rung: 5, name: "Walkthrough", blurb: "Watch the reference solution run" },
  { rung: 6, name: "Solution", blurb: "The code, explained" },
]

export function rungName(rung: number): string {
  return RUNGS.find((info) => info.rung === rung)?.name ?? `Rung ${rung}`
}

/** Rungs open strictly in order: the next one follows the highest open rung. */
export function nextRung(opened: readonly HintContent[]): number | null {
  const highest = opened.reduce((max, hint) => Math.max(max, hint.rung), 0)
  return highest >= MAX_RUNG ? null : highest + 1
}

/** The highest opened rung that counts toward mastery: free rungs (11.6) do not. */
export function countedMaxRung(opened: readonly number[], free: readonly number[]): number {
  return opened.filter((rung) => !free.includes(rung)).reduce((max, rung) => Math.max(max, rung), 0)
}

/** Adds a rung's content, keeping one entry per rung in rung order. */
export function withRung(opened: readonly HintContent[], hint: HintContent): HintContent[] {
  return [...opened.filter((item) => item.rung !== hint.rung), hint].sort((a, b) => a.rung - b.rung)
}

export function findRung<R extends HintContent["rung"]>(
  opened: readonly HintContent[],
  rung: R
): HintOf<R> | undefined {
  return opened.find((hint): hint is HintOf<R> => hint.rung === rung)
}

/** The pattern the opened rungs name (rung 3 or 4), if any. */
export function patternFromRungs(opened: readonly HintContent[]): string | null {
  return findRung(opened, 3)?.patternId ?? findRung(opened, 4)?.patternId ?? null
}
