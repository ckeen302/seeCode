// Real tracer output for a few walkthroughs (tests/unit/fixtures/viz-traces.json, written by
// apps/api/tests/test_tracer_content.py, which also fails when it goes stale).
import data from "./fixtures/viz-traces.json"

import type { WalkthroughPayload } from "@/lib/api/schemas"
import { normalizeViz } from "@/lib/viz/config"
import type { Trace, VizConfig } from "@/lib/viz/types"

export type FixtureSlug =
  | "valid-palindrome"
  | "binary-search"
  | "min-stack"
  | "two-sum"
  | "daily-temperatures"
  | "group-anagrams"

interface Fixture {
  payload: WalkthroughPayload
  traces: Trace[]
}

const fixtures = data as unknown as Record<FixtureSlug, Fixture>

export function fixture(slug: FixtureSlug): Fixture & { viz: VizConfig } {
  const found = fixtures[slug]
  return { ...found, viz: normalizeViz(found.payload.viz) }
}

/** The index of the first step with this tag. */
export function stepWith(trace: Trace, tag: string, occurrence = 1): number {
  let seen = 0
  const index = trace.steps.findIndex((step) => step.tags.includes(tag) && ++seen === occurrence)
  if (index < 0) throw new Error(`no step tagged ${tag}`)
  return index
}
