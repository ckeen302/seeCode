import type { Metadata } from "next"
import { Suspense } from "react"

import { DrillSession } from "@/components/drills/DrillSession"
import { LoadingState } from "@/components/today/PageStates"

export const metadata: Metadata = { title: "Drill session" }

// Section 6.6: `?mode=recognition|toolkit&pattern=&size=`. The search params are read on
// the client, so the page needs a Suspense boundary to prerender.
export default function DrillSessionPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading your drill" rows={1} />}>
      <DrillSession />
    </Suspense>
  )
}
