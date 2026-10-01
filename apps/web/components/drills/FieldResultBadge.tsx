import { CheckIcon, CircleDotDashedIcon, MinusIcon } from "lucide-react"

import type { FieldResult } from "@/lib/api/schemas"
import { cn } from "@/lib/utils"
import { RESULT_LABELS } from "@/lib/workspace/plan"

const STYLES: Record<FieldResult, { Icon: typeof CheckIcon; className: string }> = {
  correct: { Icon: CheckIcon, className: "border-good/60 text-good" },
  close: { Icon: CircleDotDashedIcon, className: "border-close/60 text-close" },
  wrong: { Icon: MinusIcon, className: "border-border text-wrong" },
}

/** Section 18.4: icon + label (check, half circle, dash); the label stays in text color. */
export function FieldResultBadge({
  result,
  className,
}: {
  result: FieldResult
  className?: string
}) {
  const { Icon, className: tone } = STYLES[result]
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs font-medium animate-in duration-200 zoom-in-95",
        tone,
        className
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      <span className="text-text">{RESULT_LABELS[result]}</span>
    </span>
  )
}
