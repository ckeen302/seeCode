import type { Metadata } from "next"

import { Workspace } from "@/components/workspace/Workspace"
import { fetchProblemTitle } from "@/lib/api/server"

// The tab shows the problem's title. Metadata streams, so the API never delays the page.
export async function generateMetadata({ params }: PageProps<"/p/[slug]">): Promise<Metadata> {
  const { slug } = await params
  return { title: (await fetchProblemTitle(slug)) ?? "Problem" }
}

// Workspace (Section 7): no sidebar. Public, so guests can solve problems (Section 5).
export default async function WorkspacePage({ params }: PageProps<"/p/[slug]">) {
  const { slug } = await params
  return <Workspace slug={slug} />
}
