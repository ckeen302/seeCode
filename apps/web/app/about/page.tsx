import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { ProblemLink } from "@/components/problems/ProblemLink"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = { title: "About the method" }

const PRINCIPLES = [
  {
    title: "Pattern + twist",
    text: "Most interview problems are a known pattern with one change. Valid Palindrome is two pointers from both ends, plus skipping characters that aren't letters or digits. Learning problems this way builds a connected map, so a new problem looks like a twist on something you know.",
  },
  {
    title: "Plan before you code",
    text: "The Plan card asks for the pattern, the data structures, the target time and space, and the twist. Producing a plan, even a wrong one, teaches more than reading a right one. Each field gets its own feedback.",
  },
  {
    title: "Help in layers",
    text: "Stuck? The hint ladder opens one rung at a time: clarify, signals, approach, plan, walkthrough, solution. There is always a next step, and the full answer is the last rung, not the first.",
  },
  {
    title: "Recognition drills",
    text: "Read a problem with its title hidden and plan it in 30 seconds. About thirty reps in fifteen minutes, mixing patterns on purpose, so you learn to choose an approach rather than recall one.",
  },
  {
    title: "Spaced review",
    text: "Every problem you solve comes back on a schedule: soon at first, then at growing intervals. You rebuild the plan in a minute. Misses come back sooner; easy ones wait longer.",
  },
  {
    title: "See it run",
    text: "Walkthroughs step through real code on real data, with pointers, windows and one line of narration per step. Predict mode pauses and asks what happens next.",
  },
]

const SCIENCE = [
  ["Retrieval practice", "Recalling a plan strengthens memory more than rereading it."],
  [
    "Interleaving",
    "Mixing patterns trains you to tell them apart, which is the real interview skill.",
  ],
  ["Spacing", "Reviews just before you'd forget make knowledge last."],
  [
    "Worked-example fading",
    "Your first problem in a pattern gives you more support; later ones give less.",
  ],
] as const

// About (Section 5): the method, the learning science behind it, and privacy.
export default function AboutPage() {
  return (
    <main id="main" className="mx-auto flex w-full max-w-3xl flex-col gap-12 px-4 py-12">
      <div className="flex flex-col gap-4">
        <Link
          href="/"
          className="inline-flex w-fit items-center gap-1 rounded-md text-sm text-muted hover:text-text"
        >
          <ArrowLeftIcon aria-hidden className="size-4" />
          SeeCode
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">About the method</h1>
        <p className="text-lg text-muted">
          SeeCode teaches every problem as a known pattern plus one twist: plan first, pull hints in
          layers, see the solution run, and review on a schedule so it sticks.
        </p>
      </div>

      <section aria-labelledby="how" className="flex flex-col gap-4">
        <h2 id="how" className="text-xl font-semibold">
          How it works
        </h2>
        <ol className="flex flex-col gap-3">
          {PRINCIPLES.map((principle, index) => (
            <li
              key={principle.title}
              className="flex gap-4 rounded-lg border border-border bg-surface p-5"
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-2 font-mono text-xs">
                {index + 1}
              </span>
              <span className="flex flex-col gap-1">
                <span className="font-semibold">{principle.title}</span>
                <span className="text-muted">{principle.text}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="science" className="flex flex-col gap-4">
        <h2 id="science" className="text-xl font-semibold">
          The learning science
        </h2>
        <dl className="grid grid-cols-1 gap-3 min-[640px]:grid-cols-2">
          {SCIENCE.map(([term, text]) => (
            <div key={term} className="flex flex-col gap-1 rounded-lg border border-border p-4">
              <dt className="font-medium">{term}</dt>
              <dd className="text-sm text-muted">{text}</dd>
            </div>
          ))}
        </dl>
        <p className="text-muted">
          The number we watch is the time it takes you to reach a correct plan on a problem you
          haven&apos;t seen. If it goes down, the method is working.
        </p>
      </section>

      <section aria-labelledby="privacy" className="flex flex-col gap-3">
        <h2 id="privacy" className="text-xl font-semibold">
          Privacy
        </h2>
        <p className="text-muted">
          Your code runs in your browser. We store only your latest code snapshot so you can resume,
          and the code you send with “Nudge me”. You can export all your data or delete your account
          from Settings at any time.
        </p>
      </section>

      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <ProblemLink slug="valid-palindrome">
            Try a problem
            <ArrowRightIcon />
          </ProblemLink>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/roadmap">See the roadmap</Link>
        </Button>
      </div>
    </main>
  )
}
