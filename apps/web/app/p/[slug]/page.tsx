import type { Metadata } from "next"
import Link from "next/link"

import { Card } from "@/components/ui/card"

export const metadata: Metadata = { title: "Problem" }

// Workspace (Section 7): no sidebar. Built in M2.
export default async function WorkspacePage({ params }: PageProps<"/p/[slug]">) {
  const { slug } = await params
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-12 items-center gap-2 border-b border-border bg-surface px-4 text-sm">
        <Link href="/problems" className="text-muted hover:text-text">
          ◂ Back
        </Link>
        <span className="text-muted">·</span>
        <span>Problems</span>
      </header>
      <main id="main" className="mx-auto w-full max-w-3xl px-4 py-12">
        <Card className="flex flex-col gap-2">
          <h1 className="text-xl font-semibold">Workspace</h1>
          <p className="text-sm text-muted">
            The Workspace for <span className="font-mono text-text">{slug}</span> is built in
            milestone M2.
          </p>
        </Card>
      </main>
    </div>
  )
}
