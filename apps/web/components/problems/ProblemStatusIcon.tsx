import { CircleCheckBigIcon, CircleCheckIcon, CircleDashedIcon, CircleIcon } from "lucide-react"

import type { ProblemStatus } from "@/lib/api/schemas"
import { cn } from "@/lib/utils"

export const STATUS_LABELS: Record<ProblemStatus, string> = {
  new: "Not started",
  attempted: "Attempted",
  solved: "Solved",
  mastered: "Mastered",
}

const ICONS = {
  new: { Icon: CircleIcon, className: "text-muted" },
  attempted: { Icon: CircleDashedIcon, className: "text-close" },
  solved: { Icon: CircleCheckIcon, className: "text-good" },
  mastered: { Icon: CircleCheckBigIcon, className: "text-accent" },
} as const

const RANK: Record<ProblemStatus, number> = { new: 0, attempted: 1, solved: 2, mastered: 3 }

/** The further of two statuses (the API's and what this browser saw). */
export function furtherStatus(
  a: ProblemStatus | null | undefined,
  b: ProblemStatus | null | undefined
): ProblemStatus {
  const [x, y] = [a ?? "new", b ?? "new"]
  return RANK[x] >= RANK[y] ? x : y
}

/** A status icon with its label for screen readers (color is never the only signal). */
export function ProblemStatusIcon({
  status,
  className,
}: {
  status: ProblemStatus
  className?: string
}) {
  const { Icon, className: color } = ICONS[status]
  return (
    <span className={cn("inline-flex", className)} title={STATUS_LABELS[status]}>
      <Icon aria-hidden className={cn("size-4", color)} />
      <span className="sr-only">{STATUS_LABELS[status]}</span>
    </span>
  )
}
