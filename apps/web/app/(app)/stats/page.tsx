import type { Metadata } from "next"

import { PagePlaceholder } from "@/components/shell/PagePlaceholder"

export const metadata: Metadata = { title: "Stats" }

export default function Page() {
  return <PagePlaceholder title="Stats" milestone="M6" />
}
