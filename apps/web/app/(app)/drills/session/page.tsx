import type { Metadata } from "next"

import { PagePlaceholder } from "@/components/shell/PagePlaceholder"

export const metadata: Metadata = { title: "Drill session" }

export default function Page() {
  return <PagePlaceholder title="Drill session" milestone="M5" />
}
