import type { Metadata } from "next"

import { PagePlaceholder } from "@/components/shell/PagePlaceholder"

export const metadata: Metadata = { title: "Review" }

export default function Page() {
  return <PagePlaceholder title="Review" milestone="M5" />
}
