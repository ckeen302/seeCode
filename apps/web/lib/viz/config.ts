// The walkthrough payload as the player uses it: the API's viz config with every key filled
// in (Section 8.4), the inputs to trace, and how to run them.
import type { WalkthroughPayload as ApiWalkthroughPayload } from "@/lib/api/schemas"
import type { ProblemSpec, TraceRequest } from "@/lib/runner/types"
import type {
  PointerColor,
  PredictPoint,
  VizConfig,
  VizEvent,
  VizPointer,
  WalkthroughInput,
} from "@/lib/viz/types"

/** What the player accepts: the API payload (zod's type), or the same shape built by hand. */
export type WalkthroughSource = ApiWalkthroughPayload

const COLORS: readonly PointerColor[] = ["a", "b", "c", "d"]

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : []
}

function text(value: unknown): string | null {
  return typeof value === "string" && value ? value : null
}

/** A viz config with every key present (the API already sends them; hand-made ones may not). */
export function normalizeViz(raw: unknown): VizConfig {
  const data = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const pointers: VizPointer[] = []
  for (const item of Array.isArray(data.pointers) ? data.pointers : []) {
    const p = item as Record<string, unknown>
    const name = text(p?.var)
    const into = text(p?.into)
    if (!name || !into) continue
    const color = COLORS.includes(p.color as PointerColor)
      ? (p.color as PointerColor)
      : COLORS[pointers.length % COLORS.length]
    pointers.push({ var: name, into, label: text(p.label) ?? name, color })
  }
  const window = data.window as Record<string, unknown> | null | undefined
  const range = data.range as Record<string, unknown> | null | undefined
  const roles = (data.roles ?? {}) as Record<string, unknown>
  const confirmed = data.confirmed as Record<string, unknown> | null | undefined
  const events: VizEvent[] = []
  for (const item of Array.isArray(data.events) ? data.events : []) {
    const e = item as Record<string, unknown>
    const id = text(e?.id)
    if (!id) continue
    events.push({
      id,
      at: text(e.at) ?? "",
      when: text(e.when),
      label: text(e.label) ?? id,
      say: text(e.say),
    })
  }
  const predict: PredictPoint[] = []
  for (const item of Array.isArray(data.predict) ? data.predict : []) {
    const p = item as Record<string, unknown>
    const kind = p?.kind
    if (kind !== "index" && kind !== "yesno" && kind !== "value") continue
    predict.push({
      atEvent: text(p.atEvent) ?? "",
      occurrence: typeof p.occurrence === "number" ? p.occurrence : 1,
      ask: text(p.ask) ?? "What happens next?",
      var: text(p.var),
      kind,
      answerWhen: text(p.answerWhen),
    })
  }
  return {
    primary: text(data.primary) ?? "",
    pointers,
    window:
      window && text(window.into) && text(window.start) && text(window.end)
        ? {
            into: window.into as string,
            start: window.start as string,
            end: window.end as string,
            inclusive: window.inclusive !== false,
          }
        : null,
    range:
      range && text(range.into) && text(range.lo) && text(range.hi)
        ? {
            into: range.into as string,
            lo: range.lo as string,
            hi: range.hi as string,
            mid: text(range.mid),
          }
        : null,
    roles: {
      stack: strings(roles.stack),
      queue: strings(roles.queue),
      hidden: strings(roles.hidden),
    },
    confirmed:
      confirmed && text(confirmed.into)
        ? { into: confirmed.into as string, outside: strings(confirmed.outside) }
        : null,
    events,
    predict,
  }
}

/** How the harness runs the payload's inputs (its spec_json). */
export function runSpec(payload: Pick<WalkthroughSource, "kind" | "io">): ProblemSpec | undefined {
  const kind = payload.kind ?? "function"
  if (kind === "function" && payload.io == null) return undefined
  return { kind, io: payload.io ?? null }
}

/** The trace request of one input; `viz` is left out for Trace my code. */
export function traceRequest(
  code: string,
  payload: Pick<WalkthroughSource, "kind" | "io" | "entry">,
  input: WalkthroughInput,
  viz: VizConfig | null
): TraceRequest {
  const req: TraceRequest = { code, entry: payload.entry }
  if (input.ops) req.ops = input.ops
  else req.args = input.args ?? []
  if (viz) req.viz = viz
  const spec = runSpec(payload)
  if (spec) req.spec = spec
  return req
}

/** The event with this id (for timeline labels). */
export function eventById(viz: VizConfig | null, id: string): VizEvent | undefined {
  return viz?.events.find((event) => event.id === id)
}
