import { describe, expect, it } from "vitest"

import { normalizeViz } from "@/lib/viz/config"
import {
  frameVariables,
  layoutFrame,
  predictArray,
  type ArrayBlock,
  type Block,
  type GridBlock,
  type SetBlock,
  type LinkedListBlock,
  type MapBlock,
  type SeqBlock,
} from "@/lib/viz/layout"
import type { Frame, Snap } from "@/lib/viz/types"

import { fixture, stepWith } from "./viz-fixtures"

// Layout (Section 8.1 step 3, 8.5): config-driven and automatic mapping, on real traces.

const int = (v: number): Snap => ({ t: "prim", v })
const str = (v: string): Snap => ({ t: "str", v, n: v.length })
const list = (items: Snap[], n = items.length): Snap => ({ t: "list", v: items, n, cls: "list" })

function frame(locals: Record<string, Snap>, extra: Partial<Frame> = {}): Frame {
  return { line: 1, event: "line", func: "f", depth: 1, locals, tags: [], ...extra }
}

interface BlockOf {
  array: ArrayBlock
  grid: GridBlock
  map: MapBlock
  set: SetBlock
  stack: SeqBlock
  queue: SeqBlock
  linked: LinkedListBlock
}

function block<K extends keyof BlockOf>(blocks: Block[], kind: K, name: string): BlockOf[K] {
  const found = blocks.find((candidate) => candidate.kind === kind && candidate.name === name)
  if (!found) throw new Error(`no ${kind} block ${name}`)
  return found as BlockOf[K]
}

function pointers(array: ArrayBlock): string[] {
  return array.cells.flatMap((cell) => cell.pointers.map((mark) => `${mark.label}@${cell.index}`))
}

describe("config-driven layout", () => {
  it("draws Valid Palindrome's string with l and r pointers and the confirmed ends", () => {
    const { traces, viz } = fixture("valid-palindrome")
    const trace = traces[0]
    const start = stepWith(trace, "skip_r")
    const scene = layoutFrame(trace.steps, start, viz, null)
    const s = scene.blocks[0] as ArrayBlock
    expect(s).toMatchObject({ kind: "array", name: "s", primary: true, isString: true, total: 9 })
    expect(s.cells.map((cell) => cell.text).join("")).toBe("Top spot!")
    expect(pointers(s)).toEqual(["l@0", "r@8"])
    expect(s.cells[0].pointers[0]).toMatchObject({ var: "l", color: "a" })
    expect(s.cells.some((cell) => cell.confirmed)).toBe(false)
    expect(scene.scalars.map((item) => [item.name, item.text, item.pointer])).toEqual([
      ["l", "0", "a"],
      ["r", "8", "b"],
    ])

    // After the first match, the outer cells are confirmed.
    const later = stepWith(trace, "compare", 2)
    const after = layoutFrame(trace.steps, later, viz, trace.steps[later - 1])
      .blocks[0] as ArrayBlock
    const l = after.cells.find((cell) => cell.pointers.some((mark) => mark.var === "l"))!.index
    const r = after.cells.find((cell) => cell.pointers.some((mark) => mark.var === "r"))!.index
    for (const cell of after.cells) {
      expect(cell.confirmed).toBe(cell.index < l || cell.index > r)
    }
  })

  it("dims Binary Search's eliminated half and marks mid", () => {
    const { traces, viz } = fixture("binary-search")
    const trace = traces[0]
    const index = stepWith(trace, "go_left")
    const nums = layoutFrame(trace.steps, index, viz, null).blocks[0] as ArrayBlock
    expect(nums.range).toEqual({ lo: 4, hi: 6, mid: 5 })
    expect(nums.cells.filter((cell) => cell.dimmed).map((cell) => cell.index)).toEqual([0, 1, 2, 3])
    expect(nums.cells.filter((cell) => cell.mid).map((cell) => cell.index)).toEqual([5])
    expect(pointers(nums)).toEqual(["lo@4", "mid@5", "hi@6"])
    expect(nums.cells[5].pointers[0].color).toBe("c")
    expect(nums.arrows).toBe(true)
  })

  it("draws Min Stack's two stacks from the instance's attributes", () => {
    const { traces, viz } = fixture("min-stack")
    const trace = traces[0]
    const index = stepWith(trace, "min")
    const scene = layoutFrame(trace.steps, index, viz, null)
    // getMin() has only `mins` as a local; vals comes from self.
    expect(Object.keys(trace.steps[index].locals)).toEqual(["mins"])
    const vals = block(scene.blocks, "stack", "vals")
    const mins = block(scene.blocks, "stack", "mins")
    expect(vals.primary).toBe(true)
    expect(scene.blocks[0]).toBe(vals)
    expect(vals.items.map((item) => item.text)).toEqual(["3", "5", "2"])
    expect(mins.items.map((item) => item.text)).toEqual(["3", "3", "2"])
    expect(scene.func).toBe("getMin")
  })

  it("draws a hash map with added keys and keeps other strings as plain values", () => {
    const { traces, viz } = fixture("group-anagrams")
    const trace = traces[0]
    const index = stepWith(trace, "add", 2)
    const scene = layoutFrame(trace.steps, index, viz, trace.steps[index - 1])
    const groups = block(scene.blocks, "map", "groups") as MapBlock
    expect(groups.cls).toBe("defaultdict")
    expect(groups.rows.map((row) => row.key)).toEqual(["'enot'"])
    expect(scene.scalars.map((item) => item.name).sort()).toEqual(["key", "word"])
    expect(block(scene.blocks, "array", "strs").primary).toBe(true)

    // The add line runs: 'act' is a new key at the next step.
    const added = layoutFrame(trace.steps, index + 1, viz, trace.steps[index])
    const rows = block(added.blocks, "map", "groups").rows
    expect(rows.find((row) => row.key === "'act'")).toMatchObject({ added: true })
  })

  it("marks changed array cells against the step shown before", () => {
    const { traces, viz } = fixture("daily-temperatures")
    const trace = traces[0]
    const text = (i: number) => JSON.stringify(trace.steps[i].locals.answer)
    // The first step where an answer slot has been filled in.
    const index = trace.steps.findIndex((_, i) => i > 1 && text(i) !== text(i - 1))
    const answer = (scene: ReturnType<typeof layoutFrame>) => block(scene.blocks, "array", "answer")
    const first = layoutFrame(trace.steps, index, viz, null)
    expect(answer(first).cells.some((cell) => cell.changed)).toBe(false)
    const after = layoutFrame(trace.steps, index, viz, trace.steps[index - 1])
    expect(answer(after).cells.filter((cell) => cell.changed)).toHaveLength(1)
    expect(block(after.blocks, "stack", "stack").kind).toBe("stack")
  })

  it("hides roles.hidden and adds a ghost slot for an index answer past the end", () => {
    const viz = normalizeViz({
      primary: "nums",
      pointers: [{ var: "i", into: "nums", label: "i", color: "a" }],
      roles: { hidden: ["secret"] },
    })
    const steps = [frame({ nums: list([int(1), int(2)]), i: int(2), secret: int(9) })]
    const scene = layoutFrame(steps, 0, viz, null, { ghostEnd: "nums" })
    const nums = scene.blocks[0] as ArrayBlock
    expect(nums.cells.map((cell) => [cell.index, cell.ghost])).toEqual([
      [0, false],
      [1, false],
      [2, true],
    ])
    expect(nums.cells[2].pointers.map((mark) => mark.var)).toEqual(["i"])
    expect(scene.scalars.map((item) => item.name)).toEqual(["i"])
  })

  it("keeps a window as a bracket over start..end", () => {
    const viz = normalizeViz({
      primary: "s",
      window: { into: "s", start: "l", end: "r", inclusive: true },
    })
    const steps = [frame({ s: str("abcde"), l: int(1), r: int(3) })]
    const s = layoutFrame(steps, 0, viz, null).blocks[0] as ArrayBlock
    expect(s.window).toEqual({ start: 1, end: 3, size: 3 })
    expect(s.cells.filter((cell) => cell.inWindow).map((cell) => cell.index)).toEqual([1, 2, 3])
    const exclusive = normalizeViz({
      primary: "s",
      window: { into: "s", start: "l", end: "r", inclusive: false },
    })
    expect((layoutFrame(steps, 0, exclusive, null).blocks[0] as ArrayBlock).window?.size).toBe(2)
  })
})

describe("automatic layout (Trace my code)", () => {
  it("maps values by type and draws well-known index names as pointers", () => {
    const steps = [
      frame({
        nums: list([int(4), int(5), int(6)]),
        word: str("hey"),
        c: str("x"),
        i: int(1),
        count: { t: "dict", v: [[str("a"), int(2)]], n: 1, cls: "Counter" },
        seen: { t: "set", v: [int(1)], n: 1 },
        grid: list([list([int(1), int(2)]), list([int(3), int(4)])]),
        q: { t: "deque", v: [int(7)], n: 1 },
        total: int(10),
      }),
    ]
    const scene = layoutFrame(steps, 0, null, null)
    expect(scene.blocks.map((b) => `${b.kind}:${b.name}`)).toEqual([
      "array:nums",
      "array:word",
      "map:count",
      "set:seen",
      "grid:grid",
      "queue:q",
    ])
    // i (1) indexes both nums and word: ambiguous, so no arrow.
    expect(pointers(block(scene.blocks, "array", "nums"))).toEqual([])
    expect(scene.scalars.map((item) => item.name)).toEqual(["c", "i", "total"])

    const single = layoutFrame(
      [frame({ nums: list([int(4), int(5), int(6)]), j: int(2) })],
      0,
      null,
      null
    )
    expect(pointers(single.blocks[0] as ArrayBlock)).toEqual(["j@2"])
  })

  it("draws linked lists once, labeled with every variable that holds a node", () => {
    const node = (id: number, val: number, next: number | null) => ({
      t: "node" as const,
      id,
      cls: "ListNode",
      val: int(val),
      next,
    })
    const nodes = {
      "1": node(1, 1, 2),
      "2": node(2, 2, 3),
      "3": node(3, 3, null),
      "4": node(4, 9, 4),
    }
    const steps = [
      frame({ head: node(1, 1, 2), curr: node(2, 2, 3), loop: node(4, 9, 4) }, { nodes }),
    ]
    const lists = layoutFrame(steps, 0, null, null).blocks as LinkedListBlock[]
    expect(lists).toHaveLength(2)
    expect(lists[0].nodes.map((n) => [n.text, n.labels])).toEqual([
      ["1", ["head"]],
      ["2", ["curr"]],
      ["3", []],
    ])
    expect(lists[0].cycleTo).toBeNull()
    expect(lists[1].cycleTo).toBe(4)
  })

  it("slides a queue: dequeued items keep their keys", () => {
    const q = (...items: number[]): Snap => ({ t: "deque", v: items.map(int), n: items.length })
    const steps = [frame({ q: q(1, 2, 3) }), frame({ q: q(2, 3, 4) })]
    const first = layoutFrame(steps, 0, null, null).blocks[0] as SeqBlock
    const second = layoutFrame(steps, 1, null, steps[0]).blocks[0] as SeqBlock
    const keyOf = (seq: SeqBlock, text: string) => seq.items.find((item) => item.text === text)?.key
    expect(keyOf(second, "2")).toBe(keyOf(first, "2"))
    expect(keyOf(second, "3")).toBe(keyOf(first, "3"))
    expect(second.items.map((item) => item.changed)).toEqual([false, false, true])
  })

  it("puts the instance's attributes first and lets locals win", () => {
    const step = frame({ vals: list([int(1)]) }, { self: { vals: list([]), size: int(1) } })
    expect(frameVariables(step, null).map(([name]) => name)).toEqual(["size", "vals"])
    expect(frameVariables(step, null)[1][1]).toEqual(list([int(1)]))
  })

  it("reports a returned value", () => {
    const steps = [frame({}, { event: "return", ret: int(3) })]
    expect(layoutFrame(steps, 0, null, null).ret).toBe("3")
  })
})

describe("predictArray", () => {
  it("finds the array a predicted variable points into", () => {
    const viz = normalizeViz({
      primary: "s",
      pointers: [{ var: "r", into: "t", label: "r", color: "b" }],
      range: { into: "nums", lo: "lo", hi: "hi", mid: "mid" },
      window: { into: "w", start: "a", end: "b" },
    })
    expect(predictArray(viz, "r")).toBe("t")
    expect(predictArray(viz, "lo")).toBe("nums")
    expect(predictArray(viz, "b")).toBe("w")
    expect(predictArray(viz, "zzz")).toBe("s")
    expect(predictArray(viz, null)).toBe("s")
  })
})
