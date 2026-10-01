// Signal highlights in the problem panel (Section 7.2, after rung 2 opens). Phrases match the
// way the content validator checks them (docs/DECISIONS.md, rule 4): whole words, ignoring
// case letter by letter, with no letter, digit or underscore touching either end. So
// "sorted array" never lights up inside "unsorted array", where it points the other way.
import type { Signal } from "@/lib/api/schemas"

export interface SignalMatch {
  start: number
  end: number
  signal: Signal
}

export type SignalSegment = { text: string; signal?: undefined } | { text: string; signal: Signal }

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/** JavaScript's `\w` is ASCII-only even with the `u` flag, so letters are spelled out. */
export function signalPattern(phrase: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegExp(phrase)}(?![\\p{L}\\p{N}_])`, "giu")
}

/** Every occurrence of every phrase; where two overlap, the earlier (then longer) one wins. */
export function findSignals(text: string, signals: readonly Signal[]): SignalMatch[] {
  const found: SignalMatch[] = []
  for (const signal of signals) {
    const phrase = signal.phrase.trim()
    if (!phrase) continue
    for (const match of text.matchAll(signalPattern(phrase))) {
      const start = match.index ?? 0
      found.push({ start, end: start + match[0].length, signal })
    }
  }
  found.sort((a, b) => a.start - b.start || b.end - a.end)
  const kept: SignalMatch[] = []
  let end = 0
  for (const match of found) {
    if (match.start >= end) {
      kept.push(match)
      end = match.end
    }
  }
  return kept
}

/** `text` cut into plain runs and signal phrases, in order. */
export function splitBySignals(text: string, signals: readonly Signal[]): SignalSegment[] {
  const segments: SignalSegment[] = []
  let last = 0
  for (const match of findSignals(text, signals)) {
    if (match.start > last) segments.push({ text: text.slice(last, match.start) })
    segments.push({ text: text.slice(match.start, match.end), signal: match.signal })
    last = match.end
  }
  if (last < text.length) segments.push({ text: text.slice(last) })
  return segments
}

/** What a signal points to: a pattern, a toolkit card or a structure. */
export function signalTarget(pointsTo: string): {
  kind: "pattern" | "toolkit" | "structure"
  id: string
} {
  if (pointsTo.startsWith("toolkit:")) return { kind: "toolkit", id: pointsTo.slice(8) }
  if (pointsTo.startsWith("structure:")) return { kind: "structure", id: pointsTo.slice(10) }
  return { kind: "pattern", id: pointsTo }
}
