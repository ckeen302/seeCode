// Roadmap geometry (Section 6.3): grid positions (x = column, y = row) to pixels, edges as
// curves from a prerequisite's right side to its dependent's left side.
import type { PatternState, RoadmapNode } from "@/lib/api/patterns"

export const NODE_W = 240
export const NODE_H = 88
export const COL_GAP = 64
export const ROW_GAP = 28
export const PAD = 16

export interface PlacedNode {
  node: RoadmapNode
  left: number
  top: number
}

export interface PlacedEdge {
  id: string
  from: string
  to: string
  d: string
  /** The prerequisite is done (enough solves), so this path is open. */
  met: boolean
}

export interface RoadmapLayout {
  width: number
  height: number
  nodes: PlacedNode[]
  edges: PlacedEdge[]
}

export function prereqMet(node: RoadmapNode | undefined, solvedInPrereq: number): boolean {
  if (!node?.progress) return false
  return node.progress.solved >= Math.min(solvedInPrereq, node.problemCount || solvedInPrereq)
}

export function layoutRoadmap(
  nodes: readonly RoadmapNode[],
  solvedInPrereq: number
): RoadmapLayout {
  if (nodes.length === 0) return { width: 0, height: 0, nodes: [], edges: [] }
  // Compact the grid: only columns and rows in use take space.
  const xs = [...new Set(nodes.map((n) => n.x))].sort((a, b) => a - b)
  const ys = [...new Set(nodes.map((n) => n.y))].sort((a, b) => a - b)
  const col = new Map(xs.map((x, i) => [x, i]))
  const row = new Map(ys.map((y, i) => [y, i]))
  const placed = nodes.map((node) => ({
    node,
    left: PAD + (col.get(node.x) ?? 0) * (NODE_W + COL_GAP),
    top: PAD + (row.get(node.y) ?? 0) * (NODE_H + ROW_GAP),
  }))
  const byId = new Map(placed.map((p) => [p.node.id, p]))
  const edges: PlacedEdge[] = []
  for (const target of placed) {
    for (const prereqId of target.node.prereqs) {
      const source = byId.get(prereqId)
      if (!source) continue
      const x1 = source.left + NODE_W
      const y1 = source.top + NODE_H / 2
      const x2 = target.left
      const y2 = target.top + NODE_H / 2
      const bend = Math.max(24, (x2 - x1) / 2)
      edges.push({
        id: `${prereqId}->${target.node.id}`,
        from: prereqId,
        to: target.node.id,
        d: `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`,
        met: prereqMet(source.node, solvedInPrereq),
      })
    }
  }
  return {
    width: PAD * 2 + xs.length * NODE_W + (xs.length - 1) * COL_GAP,
    height: PAD * 2 + ys.length * NODE_H + (ys.length - 1) * ROW_GAP,
    nodes: placed,
    edges,
  }
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ""
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
}

/** "Unlocks after you solve 2 problems in Hash map and counting." (locked nodes only). */
export function lockReason(
  node: RoadmapNode,
  nodes: readonly RoadmapNode[],
  solvedInPrereq: number
): string | null {
  if (node.state !== "locked") return null
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const missing = node.prereqs
    .map((id) => byId.get(id))
    .filter((prereq): prereq is RoadmapNode => !!prereq && !prereqMet(prereq, solvedInPrereq))
  const names = missing.length ? missing.map((p) => p.name) : node.prereqs
  const count = solvedInPrereq === 1 ? "1 problem" : `${solvedInPrereq} problems`
  return `Unlocks after you solve ${count} in ${joinNames(names)}.`
}

/** The pattern to work on next: in progress first, then the first available, by position. */
export function nextPattern(nodes: readonly RoadmapNode[]): RoadmapNode | null {
  const ordered = [...nodes].sort((a, b) => a.x - b.x || a.y - b.y)
  const pick = (state: PatternState) => ordered.find((n) => n.state === state)
  return pick("in_progress") ?? pick("available") ?? null
}
