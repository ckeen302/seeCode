import type { Metadata } from "next"

import { StatsView } from "@/components/stats/StatsView"

export const metadata: Metadata = { title: "Stats" }

// Section 6.8: your progress.
export default function StatsPage() {
  return <StatsView />
}
