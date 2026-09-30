import type { Metadata } from "next"

import { PagePlaceholder } from "@/components/shell/PagePlaceholder"

export const metadata: Metadata = { title: "Settings" }

export default function Page() {
  return <PagePlaceholder title="Settings" milestone="M6" />
}
