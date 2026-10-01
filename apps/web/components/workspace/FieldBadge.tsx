"use client"

import { CircleCheckIcon, CircleMinusIcon, ContrastIcon } from "lucide-react"
import { motion } from "motion/react"

import type { FieldResult } from "@/lib/api/schemas"
import { cn } from "@/lib/utils"
import { RESULT_LABELS } from "@/lib/workspace/plan"

// Section 18.4: the FieldResult badge is an icon plus a label (color is never the only
// signal): a check (correct), a half circle (close), a dash (not quite).
const STYLES: Record<FieldResult, { Icon: typeof CircleCheckIcon; className: string }> = {
  correct: { Icon: CircleCheckIcon, className: "text-good" },
  close: { Icon: ContrastIcon, className: "text-close" },
  wrong: { Icon: CircleMinusIcon, className: "text-wrong" },
}

export function FieldBadge({ result, className }: { result: FieldResult; className?: string }) {
  const { Icon, className: color } = STYLES[result]
  return (
    <motion.span
      // 18.5: a correct field's badge settles in with a 200 ms scale from 0.96.
      initial={result === "correct" ? { scale: 0.96, opacity: 0 } : { opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      data-result={result}
      className={cn("inline-flex items-center gap-1 text-xs font-medium text-text", className)}
    >
      {/* The icon carries the color; the label stays in text color for contrast (18.1). */}
      <Icon aria-hidden className={cn("size-3.5", color)} />
      {RESULT_LABELS[result]}
    </motion.span>
  )
}
