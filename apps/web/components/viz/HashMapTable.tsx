"use client"

// HashMapTable (Section 8.5): a dict (Counter, defaultdict…) as key → value rows. New keys
// slide in; changed values flash; the class name is the caption.
import { memo } from "react"
import { AnimatePresence, motion } from "motion/react"

import { cn } from "@/lib/utils"
import type { MapBlock } from "@/lib/viz/layout"
import { BlockTitle, FADE, plural } from "@/components/viz/shared"

function HashMapTableImpl({
  block,
  step,
  reduced,
}: {
  block: MapBlock
  step: number
  reduced: boolean
}) {
  const caption = `${block.cls === "dict" ? "" : `${block.cls}, `}${plural(block.total, "key")}`
  const more = block.total - block.rows.length
  return (
    <figure className="flex min-w-0 flex-col gap-1.5" data-block="map" data-name={block.name}>
      <figcaption>
        <BlockTitle name={block.name} caption={caption} />
      </figcaption>
      {block.rows.length === 0 ? (
        <p className="font-mono text-sm text-muted">
          {block.cls === "dict" ? "{}" : `${block.cls}()`} (empty)
        </p>
      ) : (
        <div className="max-h-64 overflow-y-auto rounded-lg border border-border">
          <table className="w-full border-collapse font-mono text-sm">
            <caption className="sr-only">
              {block.name}: {caption}
            </caption>
            <thead className="sr-only">
              <tr>
                <th scope="col">Key</th>
                <th scope="col">Value</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {block.rows.map((row) => (
                  <motion.tr
                    key={row.key}
                    layout={reduced ? false : "position"}
                    initial={reduced ? false : { opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={reduced ? undefined : { opacity: 0 }}
                    transition={FADE}
                    className={cn(
                      "border-b border-border last:border-b-0",
                      row.added && "bg-signal"
                    )}
                  >
                    <th
                      scope="row"
                      className="max-w-40 truncate px-2.5 py-1 text-left font-normal text-text"
                    >
                      {row.key}
                    </th>
                    <td className="w-6 px-0 text-center text-muted" aria-hidden>
                      →
                    </td>
                    <td className="relative max-w-56 truncate px-2.5 py-1 text-text">
                      <span className="sr-only">maps to </span>
                      {row.value}
                      {row.changed ? (
                        <motion.span
                          key={step}
                          aria-hidden
                          className="pointer-events-none absolute inset-0 rounded-sm border-2 border-accent"
                          initial={{ opacity: reduced ? 0.8 : 1 }}
                          animate={{ opacity: reduced ? 0.8 : 0 }}
                          transition={{ duration: 0.3 }}
                        />
                      ) : null}
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
          {more > 0 ? <p className="px-2.5 py-1 text-xs text-muted">+{more} more</p> : null}
        </div>
      )}
    </figure>
  )
}

export const HashMapTable = memo(HashMapTableImpl)
