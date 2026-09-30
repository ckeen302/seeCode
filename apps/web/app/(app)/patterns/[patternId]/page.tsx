import type { Metadata } from "next"

import { PagePlaceholder } from "@/components/shell/PagePlaceholder"

export const metadata: Metadata = { title: "Pattern" }

export default async function PatternPage({ params }: PageProps<"/patterns/[patternId]">) {
  const { patternId } = await params
  return (
    <PagePlaceholder title="Pattern" milestone="M6">
      <p className="font-mono text-sm text-muted">{patternId}</p>
    </PagePlaceholder>
  )
}
