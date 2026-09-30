import type { Metadata } from "next"

import { PagePlaceholder } from "@/components/shell/PagePlaceholder"

export const metadata: Metadata = { title: "Roadmap" }

export default function Page() {
  return <PagePlaceholder title="Roadmap" milestone="M6" />
}
