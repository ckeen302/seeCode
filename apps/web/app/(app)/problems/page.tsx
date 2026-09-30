import type { Metadata } from "next"

import { PagePlaceholder } from "@/components/shell/PagePlaceholder"

export const metadata: Metadata = { title: "Problems" }

export default function Page() {
  return <PagePlaceholder title="Problems" milestone="M6" />
}
