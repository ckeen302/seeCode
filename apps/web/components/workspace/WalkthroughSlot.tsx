"use client"

import { WalkthroughPlayer } from "@/components/viz/WalkthroughPlayer"
import type { WalkthroughInput, WalkthroughPayload } from "@/lib/api/schemas"
import { cn } from "@/lib/utils"
import type { Prediction } from "@/lib/viz/types"

// The walkthrough of hint rung 5 and of "See it run" after a solve (Sections 7.6 and 8.6), in
// the bottom panel's Walkthrough tab: the player on the reference solution, with the
// learner's custom cases after the examples. Each predict point's first answer goes to
// `onPrediction` (the Workspace records it with the attempt).

export interface WalkthroughSlotProps {
  payload: WalkthroughPayload
  /** The learner's custom cases (8.6: the input selector lists them after the examples). */
  extraInputs?: WalkthroughInput[]
  onPrediction?: (prediction: Prediction) => void
  className?: string
}

export function WalkthroughSlot({
  payload,
  extraInputs,
  onPrediction,
  className,
}: WalkthroughSlotProps) {
  return (
    <WalkthroughPlayer
      payload={payload}
      extraInputs={extraInputs}
      onPrediction={onPrediction}
      className={cn("min-h-full", className)}
    />
  )
}
