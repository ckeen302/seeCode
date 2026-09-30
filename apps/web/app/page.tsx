import Link from "next/link"

import { Button } from "@/components/ui/button"

// Landing (Section 6.1). The demo strip and feature blocks arrive in M6.
export default function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-4 min-[640px]:px-8">
        <Link href="/" className="text-base font-semibold tracking-tight">
          SeeCode
        </Link>
        <nav aria-label="Site" className="flex items-center gap-1 text-sm">
          <Link href="/roadmap" className="rounded-md px-3 py-2 text-muted hover:text-text">
            Roadmap
          </Link>
          <Link href="/problems" className="rounded-md px-3 py-2 text-muted hover:text-text">
            Problems
          </Link>
          <Link href="/about" className="rounded-md px-3 py-2 text-muted hover:text-text">
            About
          </Link>
          <Button asChild variant="secondary" size="sm" className="ml-2">
            <Link href="/login">Sign in</Link>
          </Button>
        </nav>
      </header>

      <main
        id="main"
        className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-6 px-4 py-16 min-[640px]:px-8"
      >
        <h1 className="max-w-2xl text-3xl font-semibold tracking-tight">
          Learn to see the approach, not memorize the answer.
        </h1>
        <p className="max-w-xl text-lg text-muted">Plan it, visualize it, remember it. Free.</p>
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/p/valid-palindrome">Try a problem</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </main>

      <footer className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-6 text-sm text-muted min-[640px]:px-8">
        <Link href="/about" className="hover:text-text">
          About
        </Link>
        <span>Your code runs in your browser.</span>
      </footer>
    </div>
  )
}
