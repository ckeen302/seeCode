import type { Metadata } from "next"

import { DrillPicker } from "@/components/drills/DrillPicker"

export const metadata: Metadata = { title: "Drills" }

// Section 6.6: the drill picker.
export default function DrillsPage() {
  return <DrillPicker />
}
