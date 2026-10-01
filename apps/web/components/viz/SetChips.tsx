"use client"

// SetChips (Section 8.5): a set as chips in sorted order; new chips pop in.
import { memo } from "react"
import { AnimatePresence, motion } from "motion/react"

import { cn } from "@/lib/utils"
import type { SetBlock } from "@/lib/viz/layout"
import { BlockTitle, SPRING, plural } from "@/components/viz/shared"

function SetChipsImpl({ block, reduced }: { block: SetBlock; reduced: boolean }) {
  const caption = `${block.cls === "set" ? "" : `${block.cls}, `}${plural(block.total, "item")}`
  const more = block.total - block.items.length
  return (
    <figure className="flex min-w-0 flex-col gap-1.5" data-block="set" data-name={block.name}>
      <figcaption>
        <BlockTitle name={block.name} caption={caption} />
      </figcaption>
      {block.items.length === 0 ? (
        <p className="font-mono text-sm text-muted">{block.cls}() (empty)</p>
      ) : (
        <ul aria-label={`${block.name}, ${caption}`} className="flex flex-wrap gap-1.5">
          <AnimatePresence initial={false}>
            {block.items.map((item) => (
              <motion.li
                key={item.text}
                layout={reduced ? false : "position"}
                initial={reduced ? false : { scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={reduced ? undefined : { scale: 0.6, opacity: 0 }}
                transition={SPRING}
                className={cn(
                  "inline-flex h-6 items-center rounded-full border border-border bg-surface-2 px-2.5 font-mono text-sm",
                  item.added && "border-accent"
                )}
              >
                {item.text}
                {item.added ? <span className="sr-only"> (new)</span> : null}
              </motion.li>
            ))}
          </AnimatePresence>
          {more > 0 ? <li className="self-center text-xs text-muted">+{more} more</li> : null}
        </ul>
      )}
    </figure>
  )
}

export const SetChips = memo(SetChipsImpl)
