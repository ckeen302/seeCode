"use client"

// LinkedList (PARITY_PLAN 5): nodes as boxes joined by arrows, labeled with the variables
// that hold them (prev, curr, head…). Nodes keep their identity, so relinking animates.
import { memo } from "react"
import { AnimatePresence, motion } from "motion/react"

import type { LinkedListBlock } from "@/lib/viz/layout"
import { BlockTitle, SPRING, plural } from "@/components/viz/shared"

function LinkedListImpl({
  block,
  scope,
  reduced,
}: {
  block: LinkedListBlock
  scope: string
  reduced: boolean
}) {
  const tail = block.cycleTo !== null ? `back to node ${block.cycleTo}` : block.more ? "…" : "None"
  return (
    <figure className="flex min-w-0 flex-col gap-1.5" data-block="linked" data-name={block.name}>
      <figcaption>
        <BlockTitle
          name={block.name}
          caption={`linked list, ${plural(block.nodes.length, "node")}${block.more ? "+" : ""}`}
        />
      </figcaption>
      <ol
        aria-label={`Linked list from ${block.name}: ${block.nodes.map((node) => node.text).join(", then ")}, then ${tail}`}
        className="flex flex-wrap items-end gap-y-3"
      >
        <AnimatePresence initial={false} mode="popLayout">
          {block.nodes.map((node) => (
            <motion.li
              key={node.id}
              layoutId={reduced ? undefined : `${scope}:node:${node.id}`}
              transition={SPRING}
              className="flex items-end"
              aria-label={`${node.text}${node.labels.length ? `, held by ${node.labels.join(" and ")}` : ""}`}
            >
              <div className="flex flex-col items-center gap-0.5">
                <span className="min-h-4 font-mono text-xs font-semibold text-accent">
                  {node.labels.join(", ")}
                </span>
                <span className="flex h-9 min-w-10 max-w-24 items-center justify-center truncate rounded-md border border-border bg-surface-2 px-2 font-mono text-sm">
                  {node.text}
                </span>
              </div>
              <span aria-hidden className="px-1 pb-2 font-mono text-sm text-muted">
                →
              </span>
            </motion.li>
          ))}
        </AnimatePresence>
        <li aria-hidden className="pb-2 font-mono text-xs text-muted">
          {block.cycleTo !== null
            ? `↺ ${block.nodes.find((node) => node.id === block.cycleTo)?.text ?? ""}`
            : tail}
        </li>
      </ol>
    </figure>
  )
}

export const LinkedList = memo(LinkedListImpl)
