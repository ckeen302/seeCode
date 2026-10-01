"use client"

// ArrayStrip (Section 8.5): a list of primitives or a string as 40×40 cells with their index,
// pointer arrows under them, and the WindowBracket and SearchRange overlays. Cells wrap to
// rows of floor(width / 44). Pointer arrows glide between cells (shared layout ids).
import { memo } from "react"
import { motion } from "motion/react"

import { cn } from "@/lib/utils"
import type { ArrayBlock, Cell, PointerMark } from "@/lib/viz/layout"
import { BlockTitle, FLASH_MS, POINTER_TEXT, SPRING, plural } from "@/components/viz/shared"

export interface PickProps {
  /** Called with the picked index (an `index` predict point). */
  onPick: (index: number) => void
  /** The right answer, once the learner answered wrong. */
  answer?: number | null
  /** The learner's pick, once answered. */
  picked?: number | null
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("")
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
}

export function cellLabel(block: ArrayBlock, cell: Cell): string {
  const parts: string[] = []
  if (cell.ghost) {
    parts.push(cell.index < 0 ? "before the start" : `index ${cell.index}, past the end`)
  } else {
    parts.push(`index ${cell.index}, value ${block.isString ? cell.repr : cell.text}`)
  }
  if (cell.pointers.length) {
    const names = joinNames(cell.pointers.map((mark) => mark.label))
    parts.push(`${cell.pointers.length > 1 ? "pointers" : "pointer"} ${names}`)
  }
  if (cell.mid) parts.push("the middle")
  if (cell.dimmed) parts.push("ruled out")
  if (cell.confirmed) parts.push("confirmed")
  if (cell.inWindow) parts.push("in the window")
  if (cell.changed) parts.push("just changed")
  return parts.join(", ")
}

function Arrow({ mark, scope, reduced }: { mark: PointerMark; scope: string; reduced: boolean }) {
  return (
    <motion.div
      layoutId={reduced ? undefined : `${scope}:${mark.var}`}
      transition={SPRING}
      className={cn("flex flex-col items-center leading-none", POINTER_TEXT[mark.color])}
      data-pointer={mark.var}
    >
      <svg aria-hidden viewBox="0 0 10 8" className="h-2 w-2.5 fill-current">
        <path d="M5 0 10 8H0Z" />
      </svg>
      <span className="mt-0.5 font-mono text-xs font-semibold">{mark.label}</span>
    </motion.div>
  )
}

interface CellProps {
  block: ArrayBlock
  cell: Cell
  step: number
  scope: string
  reduced: boolean
  compact: boolean
  pick?: PickProps
  windowLabel: string | null
}

function ArrayCell({ block, cell, step, scope, reduced, compact, pick, windowLabel }: CellProps) {
  const window = block.window
  const startsWindow = window !== null && cell.index === window.start
  const endsWindow = window !== null && cell.index === window.end
  const isAnswer = pick?.answer != null && pick.answer === cell.index
  const isPicked = pick?.picked != null && pick.picked === cell.index
  const size = compact ? "h-8 min-w-8 text-sm" : "h-10 min-w-10 text-base"
  const box = cn(
    "relative flex max-w-24 items-center justify-center rounded-md border px-1 font-mono transition-[opacity,background-color,border-color] duration-150",
    size,
    cell.ghost ? "border-dashed border-border text-muted" : "border-border bg-surface-2 text-text",
    cell.confirmed && "bg-confirmed",
    cell.dimmed && "opacity-35",
    cell.mid && "ring-2 ring-ptr-c ring-offset-1 ring-offset-surface",
    cell.changed && "border-accent",
    isAnswer && "border-good ring-2 ring-good",
    isPicked && !isAnswer && "border-wrong ring-2 ring-wrong"
  )
  const content = (
    <>
      {/* A space would be an empty-looking cell: show it as ␣. */}
      {block.isString && cell.text === " " ? (
        <span className="text-muted">␣</span>
      ) : (
        <span className="truncate">{cell.text}</span>
      )}
      {cell.changed && !reduced ? (
        <motion.span
          key={step}
          aria-hidden
          className="pointer-events-none absolute -inset-px rounded-md border-2 border-accent"
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: FLASH_MS / 1000, ease: "easeOut" }}
        />
      ) : null}
    </>
  )
  const label = cellLabel(block, cell)
  return (
    <div
      role="listitem"
      aria-label={pick ? undefined : label}
      className="relative flex flex-col items-center px-0.5"
      data-index={cell.index}
    >
      {cell.inWindow ? (
        <span
          aria-hidden
          className={cn(
            "absolute -top-1 bg-window",
            compact ? "h-10" : "h-12",
            startsWindow ? "left-0 rounded-l-lg" : "-left-px",
            endsWindow ? "right-0 rounded-r-lg" : "-right-px"
          )}
        />
      ) : null}
      {startsWindow && windowLabel ? (
        <span className="absolute -top-5 left-0.5 font-mono text-xs whitespace-nowrap text-accent">
          {windowLabel}
        </span>
      ) : null}
      {pick ? (
        <button
          type="button"
          className={cn(box, "cursor-pointer hover:border-accent focus-visible:border-accent")}
          aria-label={`Pick ${label}`}
          onClick={() => pick.onPick(cell.index)}
          disabled={pick.picked != null}
        >
          {content}
        </button>
      ) : (
        <div className={box}>{content}</div>
      )}
      <span
        aria-hidden
        className={cn("mt-0.5 font-mono text-xs text-muted", cell.dimmed && "opacity-35")}
      >
        {cell.ghost ? (cell.index < 0 ? "-1" : cell.index) : cell.index}
      </span>
      <div
        aria-hidden
        className={cn("flex flex-col items-center gap-0.5", block.arrows && "min-h-7")}
      >
        {cell.pointers.map((mark) => (
          <Arrow key={mark.var} mark={mark} scope={scope} reduced={reduced} />
        ))}
      </div>
    </div>
  )
}

interface ArrayStripProps {
  block: ArrayBlock
  /** The step shown (restarts change flashes). */
  step: number
  /** Unique per player: pointer arrows of different players never share a layout id. */
  scope: string
  reduced: boolean
  pick?: PickProps
}

function ArrayStripImpl({ block, step, scope, reduced, pick }: ArrayStripProps) {
  const compact = !block.primary
  const real = block.cells.filter((cell) => !cell.ghost).length
  const more = block.total - real
  const caption = block.isString
    ? plural(block.total, "character")
    : `${plural(block.total, "item")}${block.range ? `, searching ${block.range.lo}..${block.range.hi}` : ""}`
  const windowLabel = block.window ? `window = ${block.window.size}` : null
  const pointers = block.cells.flatMap((cell) => cell.pointers)
  return (
    <figure className="flex min-w-0 flex-col gap-1.5" data-block="array" data-name={block.name}>
      <figcaption>
        <BlockTitle name={block.name} caption={caption} />
      </figcaption>
      {pointers.length ? (
        <p className="sr-only">
          {pointers.map((mark) => `${mark.label} = ${mark.index}`).join(", ")}
          {block.window ? `, ${windowLabel}` : ""}
        </p>
      ) : null}
      {block.total === 0 && block.cells.length === 0 ? (
        <p className="font-mono text-sm text-muted">{block.isString ? "''" : "[]"} (empty)</p>
      ) : (
        <div
          role="list"
          aria-label={`${block.name}, ${caption}`}
          className={cn("flex flex-wrap items-start gap-y-2", block.window && "pt-5")}
        >
          {block.cells.map((cell) => (
            <ArrayCell
              key={cell.index}
              block={block}
              cell={cell}
              step={step}
              scope={`${scope}:${block.name}`}
              reduced={reduced}
              compact={compact}
              pick={cell.index >= 0 ? pick : undefined}
              windowLabel={windowLabel}
            />
          ))}
          {more > 0 ? (
            <span className="self-center px-2 font-mono text-xs text-muted">+{more} more</span>
          ) : null}
        </div>
      )}
    </figure>
  )
}

export const ArrayStrip = memo(ArrayStripImpl)

/** For tests and labels: the pointer chips of a block, as `l=0`. */
export function pointerSummary(block: ArrayBlock): string[] {
  return block.cells.flatMap((cell) => cell.pointers.map((mark) => `${mark.label}=${mark.index}`))
}
