// Layout (Section 8.1 step 3): maps each variable of a frame to a visual block, from the
// problem's viz config (8.4) or, for Trace my code, the automatic rules of 8.5.
import { cellText, intValue, snapText } from "@/lib/viz/snap"
import type { Frame, NodeSnap, PointerColor, Snap, VizConfig } from "@/lib/viz/types"

/** Integer names drawn as pointers automatically (8.5) and their colors (18.1). */
export const AUTO_POINTERS: Readonly<Record<string, PointerColor>> = {
  i: "a",
  l: "a",
  lo: "a",
  left: "a",
  start: "a",
  slow: "a",
  p: "a",
  j: "b",
  r: "b",
  hi: "b",
  right: "b",
  end: "b",
  fast: "b",
  q: "b",
  mid: "c",
  k: "c",
}

export interface PointerMark {
  var: string
  label: string
  color: PointerColor
  index: number
}

export interface Cell {
  /** The cell's index; -1 or the length for a ghost slot (a pointer just outside). */
  index: number
  text: string
  /** The value as Python shows it (for labels). */
  repr: string
  ghost: boolean
  changed: boolean
  dimmed: boolean
  confirmed: boolean
  mid: boolean
  inWindow: boolean
  pointers: PointerMark[]
}

export interface ArrayBlock {
  kind: "array"
  name: string
  primary: boolean
  isString: boolean
  cells: Cell[]
  /** The real length (the tracer keeps at most 64 items). */
  total: number
  window: { start: number; end: number; size: number } | null
  range: { lo: number; hi: number; mid: number | null } | null
  /** Pointer arrows are drawn under this array (keep room for them). */
  arrows: boolean
}

export interface GridBlock {
  kind: "grid"
  name: string
  primary: boolean
  rows: { cells: { text: string; changed: boolean }[]; total: number }[]
  total: number
}

export interface MapRow {
  key: string
  value: string
  changed: boolean
  added: boolean
}

export interface MapBlock {
  kind: "map"
  name: string
  primary: boolean
  cls: string
  rows: MapRow[]
  total: number
}

export interface SetBlock {
  kind: "set"
  name: string
  primary: boolean
  cls: string
  items: { text: string; added: boolean }[]
  total: number
}

export interface SeqItem {
  key: string
  text: string
  changed: boolean
}

export interface SeqBlock {
  kind: "stack" | "queue"
  name: string
  primary: boolean
  items: SeqItem[]
  total: number
}

export interface ListNodeView {
  id: number
  text: string
  /** Variables holding this node. */
  labels: string[]
}

export interface LinkedListBlock {
  kind: "linked"
  name: string
  primary: boolean
  nodes: ListNodeView[]
  /** The id of the node the last one links back to (a cycle), if any. */
  cycleTo: number | null
  /** More nodes follow than are drawn. */
  more: boolean
}

export type Block = ArrayBlock | GridBlock | MapBlock | SetBlock | SeqBlock | LinkedListBlock

export interface ScalarItem {
  name: string
  text: string
  changed: boolean
  /** Its pointer color, when it is drawn as a pointer too. */
  pointer: PointerColor | null
}

export interface Scene {
  blocks: Block[]
  scalars: ScalarItem[]
  /** The returned value, on a return step. */
  ret: string | null
  func: string
  depth: number
  line: number
  event: Frame["event"]
}

export interface LayoutOptions {
  /** Draw a ghost slot after this array's last cell (an index predict may answer there). */
  ghostEnd?: string | null
  /** The traced code: breaks ties between arrays for automatic pointers. */
  code?: string
}

/** Values the panel leaves out: functions and classes are code, not data. */
const CODE_CLASSES = new Set([
  "function",
  "method",
  "builtin_function_or_method",
  "type",
  "module",
  "classmethod",
  "staticmethod",
])

const MAX_LIST_NODES = 24

/** What the player shows at a step: the instance's attributes, then the frame's locals. */
export function frameVariables(frame: Frame, viz: VizConfig | null): [string, Snap][] {
  const hidden = new Set(viz?.roles.hidden ?? [])
  const merged = new Map<string, Snap>()
  for (const [name, snap] of Object.entries(frame.self ?? {})) merged.set(name, snap)
  for (const [name, snap] of Object.entries(frame.locals)) {
    merged.delete(name) // a local of the same name wins and keeps its own place
    merged.set(name, snap)
  }
  return [...merged].filter(([name]) => !hidden.has(name))
}

function isFlat(snap: Snap): boolean {
  return snap.t === "prim" || snap.t === "str" || snap.t === "obj" || snap.t === "trunc"
}

function isLinkedNode(snap: Snap): snap is NodeSnap {
  return snap.t === "node" && "next" in snap && !("left" in snap) && !("right" in snap)
}
/** The block a variable gets by its type alone (8.5's automatic mapping). */
/** The block a variable gets by its type alone (8.5). With a config, a string is an array only
 * when the config draws on it; without one (Trace my code), any string of 2+ characters is. */
function autoKind(snap: Snap, wantsArray: boolean, configured: boolean): Block["kind"] | null {
  switch (snap.t) {
    case "str":
      return wantsArray || (!configured && snap.n >= 2) ? "array" : null
    case "list":
      if (snap.v.every(isFlat)) return "array"
      if (snap.v.every((item) => item.t === "list")) return "grid"
      return null
    case "deque":
      return "queue"
    case "dict":
      return "map"
    case "set":
      return "set"
    case "node":
      return isLinkedNode(snap) ? "linked" : null
    default:
      return null
  }
}

function itemsOf(snap: Snap): Snap[] {
  if (snap.t === "list" || snap.t === "deque" || snap.t === "set") return snap.v
  if (snap.t === "str") return Array.from(snap.v).map((char) => ({ t: "str", v: char, n: 1 }))
  return []
}

function lengthOf(snap: Snap): number {
  if (snap.t === "list" || snap.t === "deque" || snap.t === "set" || snap.t === "dict")
    return snap.n
  if (snap.t === "str") return snap.n
  return 0
}

// ---------------------------------------------------------------- queues keep item identity

const queueOffsets = new WeakMap<readonly Frame[], Map<string, number[]>>()

/**
 * How many items each queue variable lost from its front by each step, so a `popleft`
 * slides the queue instead of changing every cell. Worked out once per trace.
 */
function queueOffset(steps: readonly Frame[], index: number, name: string): number {
  let byName = queueOffsets.get(steps)
  if (!byName) {
    byName = new Map()
    queueOffsets.set(steps, byName)
  }
  let offsets = byName.get(name)
  if (!offsets) {
    offsets = []
    let offset = 0
    let last: string[] | null = null
    for (const step of steps) {
      const snap = step.locals[name] ?? step.self?.[name]
      if (snap && (snap.t === "deque" || snap.t === "list")) {
        const items = snap.v.map((item) => snapText(item, 40))
        if (last) offset += frontShift(last, items)
        last = items
      }
      offsets.push(offset)
    }
    byName.set(name, offsets)
  }
  return offsets[index] ?? 0
}

/** The smallest k such that `next` starts with `prev` minus its first k items. */
function frontShift(prev: string[], next: string[]): number {
  for (let k = 0; k <= prev.length; k++) {
    const rest = prev.slice(k)
    if (rest.length <= next.length && rest.every((text, i) => next[i] === text)) return k
  }
  return 0
}

// ---------------------------------------------------------------- the scene

interface Context {
  frame: Frame
  prev: Map<string, Snap>
  viz: VizConfig | null
  steps: readonly Frame[]
  index: number
  options: LayoutOptions
}

function changedText(prev: Snap | undefined, items: Snap[], i: number): boolean {
  if (!prev) return false
  const before = itemsOf(prev)
  if (i >= before.length) return true
  return snapText(before[i], 60) !== snapText(items[i], 60)
}

function arrayBlock(
  name: string,
  snap: Snap,
  ctx: Context,
  vars: Map<string, Snap>,
  primary: boolean
): ArrayBlock {
  const items = itemsOf(snap)
  const prev = ctx.prev.get(name)
  const prevComparable = prev && prev.t === snap.t ? prev : undefined
  const cells: Cell[] = items.map((item, index) => ({
    index,
    text: cellText(item),
    repr: snapText(item, 40),
    ghost: false,
    changed: changedText(prevComparable, items, index),
    dimmed: false,
    confirmed: false,
    mid: false,
    inWindow: false,
    pointers: [],
  }))
  const total = lengthOf(snap)
  const block: ArrayBlock = {
    kind: "array",
    name,
    primary,
    isString: snap.t === "str",
    cells,
    total,
    window: null,
    range: null,
    arrows: false,
  }
  const viz = ctx.viz
  const int = (variable: string | null | undefined) =>
    variable ? intValue(vars.get(variable)) : null
  const marks: PointerMark[] = []
  const addMark = (variable: string, label: string, color: PointerColor) => {
    const value = int(variable)
    if (value === null || marks.some((mark) => mark.var === variable)) return
    marks.push({ var: variable, label, color, index: value })
  }
  if (viz) {
    for (const pointer of viz.pointers) {
      if (pointer.into === name) addMark(pointer.var, pointer.label, pointer.color)
    }
    const range = viz.range
    if (range?.into === name) {
      const lo = int(range.lo)
      const hi = int(range.hi)
      const mid = int(range.mid)
      if (lo !== null && hi !== null) {
        block.range = { lo, hi, mid }
        for (const cell of cells) {
          cell.dimmed = cell.index < lo || cell.index > hi
          cell.mid = mid !== null && cell.index === mid && lo <= hi
        }
      }
      addMark(range.lo, range.lo, "a")
      addMark(range.hi, range.hi, "b")
      if (range.mid) addMark(range.mid, range.mid, "c")
    }
    const window = viz.window
    if (window?.into === name) {
      const start = int(window.start)
      const endValue = int(window.end)
      if (start !== null && endValue !== null) {
        const end = window.inclusive ? endValue : endValue - 1
        if (end >= start) {
          block.window = { start, end, size: end - start + 1 }
          for (const cell of cells) cell.inWindow = cell.index >= start && cell.index <= end
        }
      }
    }
    const confirmed = viz.confirmed
    if (confirmed?.into === name && confirmed.outside.length > 0) {
      const bounds = confirmed.outside.map(int)
      if (bounds.every((value) => value !== null)) {
        const lo = Math.min(...(bounds as number[]))
        const hi = Math.max(...(bounds as number[]))
        for (const cell of cells) cell.confirmed = cell.index < lo || cell.index > hi
      }
    }
  }
  for (const mark of autoMarks(name, vars, ctx)) addMark(mark.var, mark.label, mark.color)
  // Pointers just outside the array get a ghost slot, so the arrow still has a place.
  const before = marks.some((mark) => mark.index === -1)
  const after =
    marks.some((mark) => mark.index === items.length && items.length === total) ||
    (ctx.options.ghostEnd === name && items.length === total)
  const ghost = (index: number): Cell => ({
    index,
    text: "",
    repr: "",
    ghost: true,
    changed: false,
    dimmed: block.range ? index < block.range.lo || index > block.range.hi : false,
    confirmed: false,
    mid: false,
    inWindow: false,
    pointers: [],
  })
  if (before) cells.unshift(ghost(-1))
  if (after) cells.push(ghost(items.length))
  for (const mark of marks) {
    const cell = cells.find((candidate) => candidate.index === mark.index)
    if (cell) cell.pointers.push(mark)
  }
  // Room for arrows whenever the config points into this array, so they appear without a jump.
  block.arrows =
    marks.length > 0 ||
    Boolean(viz?.pointers.some((pointer) => pointer.into === name) || viz?.range?.into === name)
  return block
}

/** Pointers 8.5 draws without a config: well-known names that index exactly one array. */
function autoMarks(name: string, vars: Map<string, Snap>, ctx: Context): PointerMark[] {
  if (ctx.viz) return []
  const arrays = [...vars].filter(
    ([, snap]) => snap.t === "str" || (snap.t === "list" && snap.v.every(isFlat))
  )
  const out: PointerMark[] = []
  for (const [variable, color] of Object.entries(AUTO_POINTERS)) {
    const value = intValue(vars.get(variable))
    if (value === null) continue
    // The array the code indexes with this variable (`cleaned[left]`), if one clearly is:
    // the arrow stays on it, even one past its end, rather than hopping between arrays.
    const counts = ctx.options.code ? subscripts(ctx.options.code).get(variable) : undefined
    const ranked = arrays
      .map(([array, snap]) => ({ array, snap, count: counts?.get(array) ?? 0 }))
      .sort((a, b) => b.count - a.count)
    const preferred =
      ranked.length && ranked[0].count > 0 && ranked[0].count > (ranked[1]?.count ?? 0)
        ? ranked[0]
        : null
    let target: string | null = null
    if (preferred) {
      if (value >= -1 && value <= lengthOf(preferred.snap)) target = preferred.array
    } else {
      const fits = arrays.filter(([, snap]) => value >= 0 && value < lengthOf(snap))
      if (fits.length === 1) target = fits[0][0]
    }
    if (target === name) out.push({ var: variable, label: variable, color, index: value })
  }
  return out
}

const subscriptMemo = new Map<string, Map<string, Map<string, number>>>()
const SUBSCRIPT = /\b([A-Za-z_]\w*)\s*\[\s*([A-Za-z_]\w*)\s*[\]+\-]/g

/** How often the code indexes each array with each variable: `nums[i]`, `s[l + 1]`. */
export function subscripts(code: string): Map<string, Map<string, number>> {
  let found = subscriptMemo.get(code)
  if (found) return found
  found = new Map()
  for (const match of code.matchAll(SUBSCRIPT)) {
    const [, array, index] = match
    const counts = found.get(index) ?? new Map<string, number>()
    counts.set(array, (counts.get(array) ?? 0) + 1)
    found.set(index, counts)
  }
  if (subscriptMemo.size > 20) subscriptMemo.clear()
  subscriptMemo.set(code, found)
  return found
}

function gridBlock(name: string, snap: Snap, ctx: Context, primary: boolean): GridBlock {
  const rows = itemsOf(snap)
  const prevRows = ctx.prev.get(name)
  const before = prevRows ? itemsOf(prevRows) : null
  return {
    kind: "grid",
    name,
    primary,
    total: lengthOf(snap),
    rows: rows.map((row, r) => {
      const cells = itemsOf(row)
      const old = before?.[r] ? itemsOf(before[r]) : null
      return {
        total: lengthOf(row),
        cells: cells.map((cell, c) => ({
          text: cellText(cell),
          changed:
            before !== null && (!old || !old[c] || snapText(old[c], 40) !== snapText(cell, 40)),
        })),
      }
    }),
  }
}

function mapBlock(name: string, snap: Snap, ctx: Context, primary: boolean): MapBlock {
  const prev = ctx.prev.get(name)
  const before = new Map<string, string>()
  if (prev?.t === "dict") {
    for (const [key, value] of prev.v) before.set(snapText(key, 40), snapText(value, 60))
  }
  const pairs = snap.t === "dict" ? snap.v : []
  return {
    kind: "map",
    name,
    primary,
    cls: snap.t === "dict" ? snap.cls : "dict",
    total: lengthOf(snap),
    rows: pairs.map(([key, value]) => {
      const keyText = snapText(key, 40)
      const valueText = snapText(value, 60)
      const old = before.get(keyText)
      return {
        key: keyText,
        value: valueText,
        added: prev !== undefined && old === undefined,
        changed: old !== undefined && old !== valueText,
      }
    }),
  }
}

function setBlock(name: string, snap: Snap, ctx: Context, primary: boolean): SetBlock {
  const prev = ctx.prev.get(name)
  const before = new Set(prev?.t === "set" ? prev.v.map((item) => snapText(item, 40)) : [])
  return {
    kind: "set",
    name,
    primary,
    cls: snap.t === "set" ? (snap.cls ?? "set") : "set",
    total: lengthOf(snap),
    items: itemsOf(snap).map((item) => {
      const text = snapText(item, 40)
      return { text, added: prev !== undefined && !before.has(text) }
    }),
  }
}

function seqBlock(
  kind: "stack" | "queue",
  name: string,
  snap: Snap,
  ctx: Context,
  primary: boolean
): SeqBlock {
  const items = itemsOf(snap)
  const prev = ctx.prev.get(name)
  const offset = kind === "queue" ? queueOffset(ctx.steps, ctx.index, name) : 0
  const prevOffset =
    kind === "queue" && ctx.index > 0 ? queueOffset(ctx.steps, ctx.index - 1, name) : 0
  const before = prev ? itemsOf(prev) : null
  return {
    kind,
    name,
    primary,
    total: lengthOf(snap),
    items: items.map((item, i) => {
      const text = cellText(item)
      const oldIndex = i + offset - prevOffset
      const old = before?.[oldIndex]
      return {
        key: `${kind}-${i + offset}`,
        text,
        changed: before !== null && (!old || cellText(old) !== text),
      }
    }),
  }
}

/** Linked lists: one block per chain, labeled with every variable that holds one of its nodes. */
function linkedBlocks(
  holders: [string, NodeSnap][],
  frame: Frame,
  primaryName: string | null
): LinkedListBlock[] {
  const table = frame.nodes ?? {}
  const chainOf = (start: NodeSnap) => {
    const ids: number[] = []
    const seen = new Set<number>()
    let cycleTo: number | null = null
    let more = false
    let current: number | null | undefined = start.id
    while (current != null) {
      if (seen.has(current)) {
        cycleTo = current
        break
      }
      if (ids.length >= MAX_LIST_NODES) {
        more = true
        break
      }
      seen.add(current)
      ids.push(current)
      current = table[String(current)]?.next ?? (current === start.id ? start.next : null)
    }
    return { ids, cycleTo, more }
  }
  const chains = holders.map(([name, node]) => ({ name, node, ...chainOf(node) }))
  // A chain that starts inside another variable's chain is drawn as part of that one.
  const roots = chains.filter(
    (chain) =>
      !chains.some(
        (other) =>
          other !== chain &&
          other.ids.includes(chain.node.id) &&
          (other.node.id !== chain.node.id || chains.indexOf(other) < chains.indexOf(chain))
      )
  )
  return roots.map((root) => {
    const labels = new Map<number, string[]>()
    for (const [name, node] of holders) {
      if (root.ids.includes(node.id)) labels.set(node.id, [...(labels.get(node.id) ?? []), name])
    }
    const nodes = root.ids.map((id) => {
      const node = table[String(id)] ?? (id === root.node.id ? root.node : null)
      return { id, text: node ? cellText(node.val) : "?", labels: labels.get(id) ?? [] }
    })
    const names = holders.filter(([, node]) => root.ids.includes(node.id)).map(([name]) => name)
    return {
      kind: "linked" as const,
      name: names.join(", "),
      primary: primaryName !== null && names.includes(primaryName),
      nodes,
      cycleTo: root.cycleTo,
      more: root.more,
    }
  })
}

/**
 * The scene of step `index`: blocks for the canvas (the primary first) and the variables
 * panel's scalars. `prev` is the step shown before (for change flashes), or null.
 */
export function layoutFrame(
  steps: readonly Frame[],
  index: number,
  viz: VizConfig | null,
  prev: Frame | null,
  options: LayoutOptions = {}
): Scene {
  const frame = steps[index]
  const variables = frameVariables(frame, viz)
  const vars = new Map(variables)
  const ctx: Context = {
    frame,
    prev: new Map(prev ? frameVariables(prev, viz) : []),
    viz,
    steps,
    index,
    options,
  }
  // Variables the config draws as arrays (pointer targets), whatever their length.
  const arrayTargets = new Set<string>()
  if (viz) {
    if (viz.primary) arrayTargets.add(viz.primary)
    for (const pointer of viz.pointers) arrayTargets.add(pointer.into)
    if (viz.window) arrayTargets.add(viz.window.into)
    if (viz.range) arrayTargets.add(viz.range.into)
    if (viz.confirmed) arrayTargets.add(viz.confirmed.into)
  }
  const stacks = new Set(viz?.roles.stack ?? [])
  const queues = new Set(viz?.roles.queue ?? [])
  const primaryName = viz?.primary && vars.has(viz.primary) ? viz.primary : null
  const ordered = primaryName
    ? [
        ...variables.filter(([name]) => name === primaryName),
        ...variables.filter(([name]) => name !== primaryName),
      ]
    : variables

  const blocks: Block[] = []
  const scalars: ScalarItem[] = []
  const linked: [string, NodeSnap][] = []
  const pointerColors = new Map<string, PointerColor>()
  for (const [name, snap] of ordered) {
    const primary = name === primaryName
    const isSeq = snap.t === "list" || snap.t === "deque" || snap.t === "str"
    let kind: Block["kind"] | null
    if (stacks.has(name) && isSeq) kind = "stack"
    else if (queues.has(name) && isSeq) kind = "queue"
    else kind = autoKind(snap, arrayTargets.has(name) || primary, viz !== null)
    if (kind === "array" && snap.t === "list" && !snap.v.every(isFlat)) kind = null
    switch (kind) {
      case "array": {
        const block = arrayBlock(name, snap, ctx, vars, primary)
        for (const cell of block.cells) {
          for (const mark of cell.pointers) pointerColors.set(mark.var, mark.color)
        }
        blocks.push(block)
        break
      }
      case "grid":
        blocks.push(gridBlock(name, snap, ctx, primary))
        break
      case "map":
        blocks.push(mapBlock(name, snap, ctx, primary))
        break
      case "set":
        blocks.push(setBlock(name, snap, ctx, primary))
        break
      case "stack":
      case "queue":
        blocks.push(seqBlock(kind, name, snap, ctx, primary))
        break
      case "linked":
        linked.push([name, snap as NodeSnap])
        break
      default: {
        if (snap.t === "obj" && CODE_CLASSES.has(snap.cls)) break
        const before = ctx.prev.get(name)
        const text = snapText(snap)
        scalars.push({
          name,
          text,
          changed: prev !== null && (before === undefined || snapText(before) !== text),
          pointer: null,
        })
      }
    }
  }
  if (linked.length > 0) {
    const lists = linkedBlocks(linked, frame, primaryName)
    blocks.unshift(...lists.filter((block) => block.primary))
    blocks.push(...lists.filter((block) => !block.primary))
  }
  for (const scalar of scalars) scalar.pointer = pointerColors.get(scalar.name) ?? null
  return {
    blocks,
    scalars,
    ret: frame.event === "return" && frame.ret ? snapText(frame.ret) : null,
    func: frame.func,
    depth: frame.depth,
    line: frame.line,
    event: frame.event,
  }
}

/** The array a predict point's cells belong to: its variable's pointer target, else primary. */
export function predictArray(viz: VizConfig, variable: string | null | undefined): string {
  if (variable) {
    const pointer = viz.pointers.find((candidate) => candidate.var === variable)
    if (pointer) return pointer.into
    const range = viz.range
    if (range && [range.lo, range.hi, range.mid].includes(variable)) return range.into
    const window = viz.window
    if (window && [window.start, window.end].includes(variable)) return window.into
    if (viz.confirmed?.outside.includes(variable)) return viz.confirmed.into
  }
  return viz.primary
}
