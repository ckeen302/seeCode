import { cn } from "@/lib/utils"
import type { Difficulty } from "@/lib/api/schemas"

const LABELS: Record<Difficulty, string> = { easy: "Easy", medium: "Medium", hard: "Hard" }
// The dot carries the level; the label is always there, so color is never the only signal.
const DOTS: Record<Difficulty, string> = {
  easy: "bg-good",
  medium: "bg-close",
  hard: "bg-accent-2",
}

/** Section 18.4 chip: a 24 px pill. */
export function DifficultyChip({
  difficulty,
  className,
}: {
  difficulty: Difficulty
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-border px-2.5 text-xs font-medium text-text",
        className
      )}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", DOTS[difficulty])} />
      {LABELS[difficulty]}
    </span>
  )
}
