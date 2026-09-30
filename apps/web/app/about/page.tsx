import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = { title: "About the method" }

// About (Section 5). The full explanation of pattern + twist arrives in M6.
export default function AboutPage() {
  return (
    <main id="main" className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-12">
      <Link href="/" className="text-sm text-muted hover:text-text">
        ◂ SeeCode
      </Link>
      <h1 className="text-3xl font-semibold tracking-tight">About the method</h1>
      <p className="text-muted">
        SeeCode teaches every problem as a known pattern plus one twist: plan first, pull hints in
        layers, see the solution run, and review on a schedule so it sticks.
      </p>
      <h2 className="text-xl font-semibold">Privacy</h2>
      <p className="text-muted">
        Your code runs in your browser. We store only your latest code snapshot so you can resume,
        and the code you send with “Nudge me”.
      </p>
    </main>
  )
}
