import type { Metadata } from "next"

import { PatternPage } from "@/components/patterns/PatternPage"
import { serverApiUrl } from "@/lib/api/server"

/** The pattern's name for the tab, or null when the API does not answer quickly. */
async function fetchPatternName(patternId: string): Promise<string | null> {
  const base = serverApiUrl()
  if (!base) return null
  try {
    const response = await fetch(`${base}/content/patterns`, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(2000),
    })
    if (!response.ok) return null
    const patterns = (await response.json()) as { id?: unknown; name?: unknown }[]
    const match = Array.isArray(patterns) ? patterns.find((p) => p.id === patternId) : undefined
    return typeof match?.name === "string" ? match.name : null
  } catch {
    return null
  }
}

export async function generateMetadata({
  params,
}: PageProps<"/patterns/[patternId]">): Promise<Metadata> {
  const { patternId } = await params
  return { title: (await fetchPatternName(patternId)) ?? "Pattern" }
}

// Pattern page (Section 6.4). Public; twists appear only for problems the user solved.
export default async function Page({ params }: PageProps<"/patterns/[patternId]">) {
  const { patternId } = await params
  return <PatternPage patternId={patternId} />
}
