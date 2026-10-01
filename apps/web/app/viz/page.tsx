import type { Metadata } from "next"
import { Suspense } from "react"

import { Skeleton } from "@/components/ui/skeleton"
import { WalkthroughGallery } from "@/components/viz/WalkthroughGallery"

export const metadata: Metadata = {
  title: "Walkthroughs",
  description: "Every problem's solution, running step by step on real input.",
}

// Public: signed-out visitors can play every walkthrough (docs/DECISIONS.md, M4).
export default function WalkthroughsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <WalkthroughGallery />
    </Suspense>
  )
}
