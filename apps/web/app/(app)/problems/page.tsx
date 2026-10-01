import type { Metadata } from "next"

import { ProblemsList } from "@/components/problems/ProblemsList"

export const metadata: Metadata = { title: "Problems" }

// Section 6.5 (basic until M6 adds filters). Public: guests can open and solve problems.
export default function ProblemsPage() {
  return <ProblemsList />
}
