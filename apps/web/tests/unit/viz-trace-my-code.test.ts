import { describe, expect, it } from "vitest"

import { layoutFrame, subscripts, type ArrayBlock } from "@/lib/viz/layout"

import { userFixture, type UserSlug } from "./viz-fixtures"

// M4 acceptance: Trace my code renders any user solution for the 3 M1 problems without a
// config (automatic renderers, 8.5). The traces are real tracer output of solutions written
// differently from the reference ones.

const SLUGS: UserSlug[] = ["two-sum", "valid-palindrome", "binary-search"]

function arrows(slug: UserSlug): Set<string> {
  const { code, traces } = userFixture(slug)
  const seen = new Set<string>()
  for (const trace of traces) {
    expect(trace.error).toBeNull()
    trace.steps.forEach((_, index) => {
      const scene = layoutFrame(trace.steps, index, null, trace.steps[index - 1] ?? null, { code })
      for (const block of scene.blocks) {
        if (block.kind !== "array") continue
        for (const cell of (block as ArrayBlock).cells) {
          for (const mark of cell.pointers) seen.add(`${mark.var}->${block.name}`)
        }
      }
      // Functions (a nested helper) are code, not values.
      expect(scene.scalars.some((item) => item.text.startsWith("<function"))).toBe(false)
    })
  }
  return seen
}

describe("Trace my code", () => {
  it.each(SLUGS)("lays out every step of a learner's %s", (slug) => {
    expect(arrows(slug).size).toBeGreaterThan(0)
  })

  it("points i and j into nums (two-sum, brute force)", () => {
    expect(arrows("two-sum")).toEqual(new Set(["i->nums", "j->nums"]))
  })

  it("points left and right into the list the code indexes (valid-palindrome)", () => {
    // `left` fits both s and cleaned; the code reads cleaned[left].
    expect(arrows("valid-palindrome")).toEqual(new Set(["left->cleaned", "right->cleaned"]))
  })

  it("follows a recursive helper's lo, mid and hi (binary-search)", () => {
    expect(arrows("binary-search")).toEqual(new Set(["lo->nums", "hi->nums", "mid->nums"]))
    const { traces } = userFixture("binary-search")
    expect(Math.max(...traces[0].steps.map((step) => step.depth))).toBeGreaterThan(2)
  })

  it("counts subscripts in the code", () => {
    const counts = subscripts("x = s[l] + s[l + 1] + t[r]\nnums[ i ] += 1\n")
    expect(counts.get("l")).toEqual(new Map([["s", 2]]))
    expect(counts.get("r")).toEqual(new Map([["t", 1]]))
    expect(counts.get("i")).toEqual(new Map([["nums", 1]]))
  })
})
