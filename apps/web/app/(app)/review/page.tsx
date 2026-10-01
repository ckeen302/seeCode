import type { Metadata } from "next"

import { ReviewSession } from "@/components/review/ReviewSession"

export const metadata: Metadata = { title: "Review" }

// Section 6.7: the review session.
export default function ReviewPage() {
  return <ReviewSession />
}
