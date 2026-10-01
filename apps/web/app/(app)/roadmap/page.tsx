import type { Metadata } from "next"

import { RoadmapView } from "@/components/roadmap/RoadmapView"

export const metadata: Metadata = { title: "Roadmap" }

// Section 6.3. Public: signed-out visitors see every pattern as available.
export default function RoadmapPage() {
  return <RoadmapView />
}
