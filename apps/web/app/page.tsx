import {
  ArrowRightIcon,
  BrainIcon,
  CheckIcon,
  LayersIcon,
  ListChecksIcon,
  PuzzleIcon,
  RepeatIcon,
  ShieldCheckIcon,
} from "lucide-react"
import Link from "next/link"

import { LiveDemo } from "@/components/landing/LiveDemo"
import { PatternStrip } from "@/components/landing/PatternStrip"
import { ProblemLink } from "@/components/problems/ProblemLink"
import { Button } from "@/components/ui/button"

const FEATURES = [
  {
    icon: PuzzleIcon,
    title: "Pattern + twist",
    text: "Every problem is a pattern you know plus one twist. You build a map, not a pile of memorized answers.",
  },
  {
    icon: LayersIcon,
    title: "Plan, then hints",
    text: "Plan the approach first, then code. Stuck? Pull one rung of help at a time; the answer is the last rung.",
  },
  {
    icon: RepeatIcon,
    title: "Review that sticks",
    text: "Solved problems come back on a schedule. Rebuild the plan in a minute, right before you'd forget it.",
  },
]

const RUNGS = [
  ["Clarify", "What the problem really asks"],
  ["Signals", "Phrases that point to an approach"],
  ["Approach", "The pattern, and why not the others"],
  ["Plan", "The template's slots, filled in words"],
  ["Walkthrough", "Watch the solution run on real data"],
  ["Solution", "The code, explained, as the last rung"],
] as const

const SKILLS = [
  ["Recognize the approach", "Grind until it clicks", "30-second recognition drills"],
  ["Execute without bugs", "Copy a solution", "Plan card, hint ladder, tests in the browser"],
  ["Remember it next month", "Hope", "Spaced review of every problem you solve"],
  ["Understand why it works", "Watch a video", "Step through it with pointers and narration"],
] as const

// Landing (Section 6.1). Signed-in visitors go straight to Today (proxy.ts).
export default function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 min-[640px]:px-8">
        <Link href="/" className="text-base font-semibold tracking-tight">
          SeeCode
        </Link>
        <nav aria-label="Site" className="flex items-center gap-1 text-sm">
          <Link
            href="/roadmap"
            className="hidden rounded-md px-3 py-2 text-muted hover:text-text min-[640px]:inline"
          >
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

      <main id="main" className="flex flex-1 flex-col">
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute top-[-200px] left-1/2 size-[640px] -translate-x-1/2 rounded-full bg-accent/10 blur-3xl"
          />
          <div className="relative mx-auto flex w-full max-w-6xl flex-col items-start gap-6 px-4 pt-14 pb-10 min-[640px]:px-8 min-[900px]:pt-20">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted">
              <span aria-hidden className="size-1.5 rounded-full bg-good" />
              Free. Python in your browser. No setup.
            </span>
            <h1 className="max-w-3xl text-3xl font-semibold tracking-tight min-[640px]:text-[44px] min-[640px]:leading-[52px]">
              Learn to see the approach, not memorize the answer.
            </h1>
            <p className="max-w-xl text-lg text-text/75">
              Plan it, visualize it, remember it. Free.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="md" className="h-10 px-5">
                <ProblemLink slug="valid-palindrome">
                  Try a problem
                  <ArrowRightIcon />
                </ProblemLink>
              </Button>
              <Button asChild variant="secondary" size="md" className="h-10 px-5">
                <Link href="/login">Sign in</Link>
              </Button>
            </div>
            <p className="text-sm text-text/75">
              No account needed to try. Sign in to save progress.
            </p>
          </div>
          <div className="relative mx-auto w-full max-w-6xl px-4 pb-16 min-[640px]:px-8">
            <LiveDemo />
          </div>
        </section>

        <section
          aria-labelledby="ideas"
          className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-16 min-[640px]:px-8"
        >
          <div className="flex max-w-2xl flex-col gap-2">
            <h2 id="ideas" className="text-2xl font-semibold tracking-tight">
              Built for the moment you see a new problem
            </h2>
            <p className="text-muted">
              Watching solutions feels like progress until an unseen problem shows up. SeeCode
              trains the part that transfers: spotting the approach and producing it yourself.
            </p>
          </div>
          <ul className="grid grid-cols-1 gap-4 min-[900px]:grid-cols-3">
            {FEATURES.map((feature) => (
              <li
                key={feature.title}
                className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-6"
              >
                <span className="flex size-10 items-center justify-center rounded-full bg-surface-2 text-accent">
                  <feature.icon aria-hidden className="size-5" />
                </span>
                <h3 className="text-lg font-semibold">{feature.title}</h3>
                <p className="text-muted">{feature.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="ladder" className="border-y border-border bg-surface/50">
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-16 min-[640px]:px-8 min-[900px]:grid-cols-2">
            <div className="flex flex-col gap-3">
              <h2 id="ladder" className="text-2xl font-semibold tracking-tight">
                Help in layers, never a dead end
              </h2>
              <p className="text-muted">
                The hint ladder follows how experts think. Each rung gives just enough to get you
                moving again, and how far you went is how we know what to bring back for review.
              </p>
              <ul className="mt-2 flex flex-col gap-2 text-sm">
                {[
                  "Plan card graded field by field: pattern, structures, time, space, twist",
                  "Tests run in your browser with Python, instantly",
                  "Daily plan on Today: reviews, next problem, a weak-spot drill",
                ].map((line) => (
                  <li key={line} className="flex gap-2">
                    <CheckIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-good" />
                    {line}
                  </li>
                ))}
              </ul>
            </div>
            <ol className="flex flex-col gap-2">
              {RUNGS.map(([name, line], index) => (
                <li
                  key={name}
                  className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3"
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border font-mono text-xs">
                    {index + 1}
                  </span>
                  <span className="flex flex-col">
                    <span className="font-medium">{name}</span>
                    <span className="text-sm text-muted">{line}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section
          aria-labelledby="compare"
          className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-16 min-[640px]:px-8"
        >
          <h2 id="compare" className="text-2xl font-semibold tracking-tight">
            Practice the skills interviews test
          </h2>
          <div
            className="overflow-x-auto rounded-lg border border-border"
            role="region"
            aria-label="How SeeCode compares"
            tabIndex={0}
          >
            <table className="w-full min-w-[560px] border-collapse text-left text-sm">
              <thead className="bg-surface text-xs text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Skill
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Passive prep
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    SeeCode
                  </th>
                </tr>
              </thead>
              <tbody>
                {SKILLS.map(([skill, passive, ours]) => (
                  <tr key={skill} className="border-t border-border">
                    <th scope="row" className="px-4 py-3 font-medium">
                      {skill}
                    </th>
                    <td className="px-4 py-3 text-muted">{passive}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-2">
                        <CheckIcon aria-hidden className="size-4 shrink-0 text-good" />
                        {ours}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section
          aria-labelledby="patterns"
          className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-16 min-[640px]:px-8"
        >
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-col gap-2">
              <h2 id="patterns" className="text-2xl font-semibold tracking-tight">
                Start with the patterns
              </h2>
              <p className="text-muted">Each one has a template, its signals and its problems.</p>
            </div>
            <Button asChild variant="secondary">
              <Link href="/roadmap">
                <ListChecksIcon />
                See the roadmap
              </Link>
            </Button>
          </div>
          <PatternStrip />
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 pb-20 min-[640px]:px-8">
          <div className="flex flex-col items-start gap-4 rounded-xl border border-accent/40 bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))] p-8 min-[900px]:flex-row min-[900px]:items-center min-[900px]:justify-between">
            <div className="flex flex-col gap-1">
              <h2 className="flex items-center gap-2 text-xl font-semibold">
                <BrainIcon aria-hidden className="size-5 text-accent" />
                Ten minutes is enough to feel the difference
              </h2>
              <p className="text-text/75">
                Solve Valid Palindrome now. No account, nothing to install.
              </p>
            </div>
            <Button asChild className="h-10 px-5">
              <ProblemLink slug="valid-palindrome">
                Start solving
                <ArrowRightIcon />
              </ProblemLink>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-6 text-sm text-muted min-[640px]:px-8">
          <span className="font-semibold text-text">SeeCode</span>
          <Link href="/about" className="hover:text-text">
            About
          </Link>
          <Link href="/problems" className="hover:text-text">
            Problems
          </Link>
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheckIcon aria-hidden className="size-4" />
            Your code runs in your browser.
          </span>
        </div>
      </footer>
    </div>
  )
}
