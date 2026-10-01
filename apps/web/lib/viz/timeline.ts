// Timeline markers and narration (Section 8.6), worked out once per trace.
import type { Frame, Trace, VizConfig } from "@/lib/viz/types"

export const PREDICT_PREFIX = "predict:"

export interface Marker {
  index: number
  /** The event id shown at this step (the first one that fired). */
  id: string
  label: string
  /** Mismatch and return moments use accent-2 (8.6). */
  tone: "event" | "end"
  /** A predict point is asked here. */
  predict: boolean
}

const END_WORDS = /\b(mismatch|return|returns|not found|missing|differ|invalid|done)\b/i

function returnsHere(steps: readonly Frame[], index: number): boolean {
  const step = steps[index]
  const next = steps[index + 1]
  return (
    next !== undefined &&
    next.event === "return" &&
    next.line === step.line &&
    next.depth === step.depth &&
    step.depth <= 1
  )
}

/** One marker per tagged step, labeled from the viz config. */
export function timelineMarkers(trace: Trace, viz: VizConfig | null): Marker[] {
  const labels = new Map(viz?.events.map((event) => [event.id, event.label]) ?? [])
  const out: Marker[] = []
  trace.steps.forEach((step, index) => {
    const events = step.tags.filter((tag) => !tag.startsWith(PREDICT_PREFIX))
    const predict = step.tags.some((tag) => tag.startsWith(PREDICT_PREFIX))
    if (events.length === 0 && !predict) return
    const id = events[0] ?? "predict"
    const label = labels.get(id) ?? (events[0] ? id : "predict")
    const tone =
      END_WORDS.test(label) || END_WORDS.test(id) || returnsHere(trace.steps, index)
        ? "end"
        : "event"
    out.push({ index, id, label, tone, predict })
  })
  return out
}

export interface Narration {
  text: string
  /** The text is an earlier step's narration (shown faded). */
  stale: boolean
}

/**
 * The narration of step `index`: its own `say`, else the last one before it (faded, so the
 * text does not flicker on every line), else null.
 */
export function narrationAt(steps: readonly Frame[], index: number): Narration | null {
  for (let i = Math.min(index, steps.length - 1); i >= 0; i--) {
    const say = steps[i].say
    if (say) return { text: say, stale: i !== index }
  }
  return null
}

/** A plain description of a step, for traces without narration (Trace my code). */
export function describeStep(step: Frame, code: string): string {
  const source = code.split("\n")[step.line - 1]?.trim() ?? ""
  const shown = source.replace(/\s*#\s*viz:[A-Za-z0-9_]+\s*$/, "")
  if (step.event === "return") return `${step.func}() returns from line ${step.line}`
  return shown ? `Line ${step.line} is about to run: ${shown}` : `Line ${step.line} is about to run`
}
