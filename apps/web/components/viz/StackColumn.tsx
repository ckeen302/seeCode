"use client"

// StackColumn and QueueStrip (Section 8.5): a stack drawn vertically with its top at the top,
// a queue horizontally with its front at the left. Pushes, pops and dequeues animate.
import { memo } from "react"
import { AnimatePresence, motion } from "motion/react"

import { cn } from "@/lib/utils"
import type { SeqBlock } from "@/lib/viz/layout"
import { BlockTitle, SPRING, plural } from "@/components/viz/shared"

function Item({
  text,
  changed,
  reduced,
  enter,
  edge,
}: {
  text: string
  changed: boolean
  reduced: boolean
  enter: { x?: number; y?: number }
  edge: string | null
}) {
  return (
    <motion.li
      layout={reduced ? false : "position"}
      initial={reduced ? false : { opacity: 0, ...enter }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      exit={reduced ? undefined : { opacity: 0, ...enter }}
      transition={SPRING}
      className="flex items-center gap-2"
    >
      <span
        className={cn(
          "flex h-8 min-w-12 max-w-32 items-center justify-center truncate rounded-md border bg-surface-2 px-2 font-mono text-sm",
          changed ? "border-accent" : "border-border"
        )}
      >
        {text}
      </span>
      {edge ? <span className="text-xs text-muted">{edge}</span> : null}
    </motion.li>
  )
}

function StackColumnImpl({ block, reduced }: { block: SeqBlock; reduced: boolean }) {
  const more = block.total - block.items.length
  // Top first: the last item of the list.
  const items = [...block.items].reverse()
  return (
    <figure className="flex min-w-0 flex-col gap-1.5" data-block="stack" data-name={block.name}>
      <figcaption>
        <BlockTitle name={block.name} caption={`stack, ${plural(block.total, "item")}`} />
      </figcaption>
      {block.total === 0 ? (
        <p className="font-mono text-sm text-muted">[] (empty)</p>
      ) : (
        <ol
          aria-label={`${block.name}, a stack of ${plural(block.total, "item")}, top first`}
          className="flex flex-col gap-1 border-b-2 border-border pb-1"
        >
          <AnimatePresence initial={false} mode="popLayout">
            {items.map((item, i) => (
              <Item
                key={item.key}
                text={item.text}
                changed={item.changed}
                reduced={reduced}
                enter={{ y: -14 }}
                edge={i === 0 ? "top" : null}
              />
            ))}
          </AnimatePresence>
          {more > 0 ? <li className="text-xs text-muted">+{more} more below</li> : null}
        </ol>
      )}
    </figure>
  )
}

export const StackColumn = memo(StackColumnImpl)

function QueueStripImpl({ block, reduced }: { block: SeqBlock; reduced: boolean }) {
  const more = block.total - block.items.length
  return (
    <figure className="flex min-w-0 flex-col gap-1.5" data-block="queue" data-name={block.name}>
      <figcaption>
        <BlockTitle
          name={block.name}
          caption={`queue, ${plural(block.total, "item")}, front at left`}
        />
      </figcaption>
      {block.total === 0 ? (
        <p className="font-mono text-sm text-muted">empty</p>
      ) : (
        <ol
          aria-label={`${block.name}, a queue of ${plural(block.total, "item")}, front first`}
          className="flex flex-wrap items-center gap-1"
        >
          <AnimatePresence initial={false} mode="popLayout">
            {block.items.map((item) => (
              <Item
                key={item.key}
                text={item.text}
                changed={item.changed}
                reduced={reduced}
                enter={{ x: 14 }}
                edge={null}
              />
            ))}
          </AnimatePresence>
          {more > 0 ? <li className="text-xs text-muted">+{more} more</li> : null}
        </ol>
      )}
    </figure>
  )
}

export const QueueStrip = memo(QueueStripImpl)
