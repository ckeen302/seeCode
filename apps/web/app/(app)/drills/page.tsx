import type { Metadata } from "next"

import { PagePlaceholder } from "@/components/shell/PagePlaceholder"

export const metadata: Metadata = { title: "Drills" }

export default function Page() {
  return <PagePlaceholder title="Drills" milestone="M5" />
}
