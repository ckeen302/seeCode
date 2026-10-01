"use client"

// The visualization canvas (Section 8.6): every block of the current step, the primary one
// first and largest. Arrays and linked lists span the width; tables, sets, stacks and
// queues flow side by side.
import { memo } from "react"
import { LayoutGroup } from "motion/react"

import type { Block, Scene } from "@/lib/viz/layout"
import { ArrayStrip, type PickProps } from "@/components/viz/ArrayStrip"
import { GridView } from "@/components/viz/GridView"
import { HashMapTable } from "@/components/viz/HashMapTable"
import { LinkedList } from "@/components/viz/LinkedList"
import { SetChips } from "@/components/viz/SetChips"
import { QueueStrip, StackColumn } from "@/components/viz/StackColumn"

interface CanvasProps {
  scene: Scene
  step: number
  scope: string
  reduced: boolean
  /** An index predict point: the array whose cells become buttons. */
  pick?: (PickProps & { array: string }) | null
}

function BlockView({
  block,
  step,
  scope,
  reduced,
  pick,
}: {
  block: Block
  step: number
  scope: string
  reduced: boolean
  pick?: PickProps
}) {
  switch (block.kind) {
    case "array":
      return <ArrayStrip block={block} step={step} scope={scope} reduced={reduced} pick={pick} />
    case "grid":
      return <GridView block={block} />
    case "map":
      return <HashMapTable block={block} step={step} reduced={reduced} />
    case "set":
      return <SetChips block={block} reduced={reduced} />
    case "stack":
      return <StackColumn block={block} reduced={reduced} />
    case "queue":
      return <QueueStrip block={block} reduced={reduced} />
    case "linked":
      return <LinkedList block={block} scope={scope} reduced={reduced} />
  }
}

const WIDE = new Set<Block["kind"]>(["array", "linked", "grid"])

function CanvasImpl({ scene, step, scope, reduced, pick }: CanvasProps) {
  const wide = scene.blocks.filter((block) => WIDE.has(block.kind))
  const side = scene.blocks.filter((block) => !WIDE.has(block.kind))
  // A primary stack or table (min-stack) leads, next to its siblings.
  const sideFirst = side.some((block) => block.primary)
  if (scene.blocks.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted">
        Nothing to draw at this step yet. The values are in the variables panel.
      </p>
    )
  }
  const wideBlocks = wide.map((block) => (
    <BlockView
      key={`${block.kind}:${block.name}`}
      block={block}
      step={step}
      scope={scope}
      reduced={reduced}
      pick={pick && block.kind === "array" && block.name === pick.array ? pick : undefined}
    />
  ))
  const sideRow = side.length ? (
    <div key="side" className="flex flex-wrap items-start gap-x-8 gap-y-5">
      {side.map((block) => (
        <BlockView
          key={`${block.kind}:${block.name}`}
          block={block}
          step={step}
          scope={scope}
          reduced={reduced}
        />
      ))}
    </div>
  ) : null
  return (
    <LayoutGroup id={scope}>
      <div className="flex flex-col gap-5">
        {sideFirst ? sideRow : null}
        {wideBlocks}
        {sideFirst ? null : sideRow}
      </div>
    </LayoutGroup>
  )
}

export const Canvas = memo(CanvasImpl)
