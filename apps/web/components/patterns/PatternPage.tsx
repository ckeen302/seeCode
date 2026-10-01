"use client"

import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  PlayIcon,
  RadarIcon,
  WrenchIcon,
} from "lucide-react"
import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"

import { CodeBlock, HighlightedLine } from "@/components/patterns/CodeBlock"
import { PatternStateBadge, ProgressRing } from "@/components/patterns/PatternChip"
import { parseTemplate } from "@/components/patterns/template"
import { DifficultyChip } from "@/components/problems/DifficultyChip"
import { ProblemLink } from "@/components/problems/ProblemLink"
import { ProblemStatusIcon } from "@/components/problems/ProblemStatusIcon"
import { SignInBanner } from "@/components/roadmap/RoadmapView"
import { ErrorState, LoadingState } from "@/components/today/PageStates"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { WalkthroughPlayer } from "@/components/viz/WalkthroughPlayer"
import { Markdown } from "@/components/workspace/Markdown"
import { ApiError } from "@/lib/api/client"
import { useRoadmap, usePattern, type PatternProblem, type PatternView } from "@/lib/api/patterns"
import { useAuth } from "@/lib/auth/session"
import { cn } from "@/lib/utils"
import { demoPayload } from "@/lib/viz/payloads"
import { familyColor } from "@/lib/workspace/plan"

const FAMILY_NAMES: Record<string, string> = {
  hashing: "Hashing",
  two_pointers: "Two pointers",
  stack: "Stack",
  binary_search: "Binary search",
}

export function familyName(family: string): string {
  return FAMILY_NAMES[family] ?? family.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())
}

const isSolved = (problem: PatternProblem) =>
  problem.status === "solved" || problem.status === "mastered"

/** Where Start / Continue goes: the first unsolved problem by roadmap order, else the first. */
export function startTarget(problems: readonly PatternProblem[]): {
  problem: PatternProblem | null
  label: string
} {
  const ordered = [...problems].sort((a, b) => a.order - b.order)
  const anyProgress = ordered.some((p) => p.status && p.status !== "new")
  const next = ordered.find((p) => !isSolved(p))
  if (next) return { problem: next, label: anyProgress ? "Continue" : "Start" }
  return { problem: ordered[0] ?? null, label: "Practice again" }
}

function Section({
  id,
  title,
  icon: Icon,
  children,
  description,
}: {
  id: string
  title: string
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>
  children: React.ReactNode
  description?: string
}) {
  return (
    <section aria-labelledby={`${id}-title`} id={id} className="flex scroll-mt-20 flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id={`${id}-title`} className="flex items-center gap-2 text-xl font-semibold">
          {Icon ? <Icon aria-hidden className="size-5 text-muted" /> : null}
          {title}
        </h2>
        {description ? <p className="text-sm text-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  )
}

function Header({ pattern, lockedReason }: { pattern: PatternView; lockedReason: string | null }) {
  const solved = pattern.progress?.solved ?? 0
  const { problem, label } = startTarget(pattern.problems)
  return (
    <header className="flex flex-col gap-5">
      <Link
        href="/roadmap"
        className="inline-flex w-fit items-center gap-1 rounded-md text-sm text-muted hover:text-text"
      >
        <ArrowLeftIcon aria-hidden className="size-4" />
        Roadmap
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="size-2 rounded-full"
                style={{ backgroundColor: familyColor(pattern.family) }}
              />
              {familyName(pattern.family)}
            </span>
            <PatternStateBadge state={pattern.state} />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">{pattern.name}</h1>
          <p className="max-w-2xl text-lg text-muted">{pattern.idea}</p>
        </div>
        <div className="flex items-center gap-4 rounded-lg border border-border bg-surface p-4">
          {pattern.progress ? (
            <div className="flex items-center gap-3">
              <ProgressRing value={solved} total={pattern.problemCount} size={44} />
              <div className="flex flex-col">
                <span className="text-sm font-medium">
                  {solved} of {pattern.problemCount} solved
                </span>
                <span className="text-xs text-muted">{pattern.progress.mastered} mastered</span>
              </div>
            </div>
          ) : (
            <span className="text-sm text-muted">{pattern.problemCount} problems</span>
          )}
          {problem ? (
            <Button asChild>
              <ProblemLink slug={problem.slug}>
                {label}
                <ArrowRightIcon />
              </ProblemLink>
            </Button>
          ) : null}
        </div>
      </div>
      {lockedReason ? (
        <p className="flex items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted">
          <LockIcon aria-hidden className="size-4" />
          {lockedReason} You can still read it and try its problems.
        </p>
      ) : null}
    </header>
  )
}

const NAV = [
  ["idea", "The idea"],
  ["signals", "Signals"],
  ["template", "Template"],
  ["demo", "See it move"],
  ["variations", "Variations"],
  ["problems", "Problems"],
  ["mistakes", "Mistakes"],
  ["toolkit", "Toolkit"],
] as const

function SectionNav() {
  return (
    <nav
      aria-label="On this page"
      className="sticky top-12 z-10 -mx-4 overflow-x-auto border-y border-border bg-bg/90 px-4 py-2 backdrop-blur min-[640px]:-mx-8 min-[640px]:px-8 min-[900px]:top-0"
    >
      <ul className="flex gap-1 text-sm whitespace-nowrap">
        {NAV.map(([id, label]) => (
          <li key={id}>
            <a
              href={`#${id}`}
              className="inline-flex h-8 items-center rounded-md px-2.5 text-muted hover:bg-surface-2 hover:text-text"
            >
              {label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/** The template with its slots; hovering or focusing a slot lights up its lines and vice versa. */
export function TemplateExplorer({
  template,
  slots,
}: {
  template: string
  slots: PatternView["slots"]
}) {
  const [active, setActive] = useState<string | null>(null)
  const lines = parseTemplate(template)
  return (
    <div className="grid grid-cols-1 gap-4 min-[900px]:grid-cols-[minmax(0,1fr)_280px]">
      <pre
        className="overflow-x-auto rounded-md border border-border bg-bg py-3 font-mono text-sm leading-6"
        role="region"
        aria-label="Template code"
        tabIndex={0}
      >
        <code>
          {lines.map((line, index) => (
            <div
              key={index}
              data-slot={line.slot ?? undefined}
              onPointerEnter={() => line.slot && setActive(line.slot)}
              onPointerLeave={() => line.slot && setActive(null)}
              className={cn(
                "border-l-2 border-transparent px-4 transition-colors",
                line.slot && active === line.slot && "border-accent bg-window",
                line.slot && active && active !== line.slot && "opacity-60"
              )}
            >
              <HighlightedLine line={line.text} />
            </div>
          ))}
        </code>
      </pre>
      <ol className="flex flex-col gap-2" aria-label="Template slots">
        {slots.map((slot) => (
          <li key={slot.id}>
            <button
              type="button"
              onPointerEnter={() => setActive(slot.id)}
              onPointerLeave={() => setActive(null)}
              onFocus={() => setActive(slot.id)}
              onBlur={() => setActive(null)}
              aria-pressed={active === slot.id}
              className={cn(
                "flex w-full flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left transition-colors",
                active === slot.id ? "border-accent bg-window" : "border-border bg-surface"
              )}
            >
              <span className="flex items-center gap-2">
                <span className="font-mono text-xs text-muted uppercase">{slot.id}</span>
                <span className="text-sm font-medium">{slot.label}</span>
              </span>
              <span className="text-sm text-muted">{slot.prompt}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}

function formatArg(value: unknown): string {
  return JSON.stringify(value)
}

function Demo({ pattern }: { pattern: PatternView }) {
  const names = /def\s+\w+\(self,\s*([^)]*)\)/.exec(pattern.demo.code)?.[1].split(",") ?? []
  const events = pattern.demo.viz.events
  // The player loads Python only when asked: the page stays light until then.
  const [watching, setWatching] = useState(false)
  const payload = useMemo(() => demoPayload(pattern.demo), [pattern.demo])
  const playerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!watching) return
    // The button that started it is gone; the player takes focus, so its keys work at once.
    playerRef.current
      ?.querySelector<HTMLElement>("[data-testid=walkthrough-player]")
      ?.focus({ preventScroll: true })
  }, [watching])
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted">The template on a small example</p>
          <p className="font-mono text-sm">
            {pattern.demo.args
              .map((arg, i) => `${names[i]?.trim() || `arg${i + 1}`} = ${formatArg(arg)}`)
              .join(", ")}
          </p>
        </div>
        {watching ? null : (
          <Button onClick={() => setWatching(true)}>
            <PlayIcon />
            Watch it run
          </Button>
        )}
      </div>
      {watching ? (
        <div ref={playerRef}>
          <WalkthroughPlayer payload={payload} predictDefault={false} autoPlay loop />
        </div>
      ) : (
        <>
          <CodeBlock code={pattern.demo.code} label="Demo code" />
          {events.length ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">What to watch</p>
              <ul className="flex flex-wrap gap-2">
                {events.map((event) => (
                  <li
                    key={event.id}
                    className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs"
                  >
                    <span aria-hidden className="size-2 rotate-45 bg-accent" />
                    <span className="font-medium">{event.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </Card>
  )
}

function TwistCell({ problem }: { problem: PatternProblem }) {
  const [shown, setShown] = useState(false)
  if (!problem.twist) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-muted">
        <LockIcon aria-hidden className="size-3.5" />
        Solve it to see the twist
      </span>
    )
  }
  return shown ? (
    <span className="flex items-start gap-2 text-sm">
      <span>{problem.twist}</span>
      <button
        type="button"
        onClick={() => setShown(false)}
        className="shrink-0 rounded-sm text-muted hover:text-text"
        aria-label={`Hide the twist of ${problem.title}`}
      >
        <EyeOffIcon aria-hidden className="size-4" />
      </button>
    </span>
  ) : (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setShown(true)}
      className="-ml-3 text-muted"
      aria-label={`Show twist of ${problem.title}`}
    >
      <EyeIcon />
      Show twist
    </Button>
  )
}

function ProblemsTable({ problems }: { problems: PatternProblem[] }) {
  const ordered = [...problems].sort((a, b) => a.order - b.order)
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="w-full min-w-[560px] border-collapse text-left">
        <caption className="sr-only">Problems in this pattern</caption>
        <thead>
          <tr className="text-xs text-muted">
            <th scope="col" className="w-12 py-2 pl-4 font-medium">
              <span className="sr-only">Status</span>
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              Problem
            </th>
            <th scope="col" className="w-28 py-2 pr-3 font-medium">
              Difficulty
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Twist
            </th>
          </tr>
        </thead>
        <tbody>
          {ordered.map((problem) => (
            <tr key={problem.slug} className="border-t border-border hover:bg-surface-2/60">
              <td className="py-3 pl-4">
                <ProblemStatusIcon status={problem.status ?? "new"} className="flex" />
              </td>
              <td className="py-3 pr-3">
                <ProblemLink slug={problem.slug} className="font-medium hover:underline">
                  {problem.title}
                </ProblemLink>
              </td>
              <td className="py-3 pr-3">
                <DifficultyChip difficulty={problem.difficulty} />
              </td>
              <td className="py-3 pr-4">
                <TwistCell problem={problem} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PatternContent({ pattern }: { pattern: PatternView }) {
  const auth = useAuth()
  const roadmap = useRoadmap()
  const node = roadmap.data?.patterns.find((p) => p.id === pattern.id)
  const lockedReason =
    pattern.state === "locked" && node
      ? `Unlocks after you solve ${roadmap.data?.unlockRule.solvedInPrereq ?? 2} problems in ${node.prereqs
          .map((id) => roadmap.data?.patterns.find((p) => p.id === id)?.name ?? id)
          .join(" and ")}.`
      : null

  return (
    <div className="flex flex-col gap-10">
      <Header pattern={pattern} lockedReason={lockedReason} />
      {auth.status === "signed_out" ? (
        <SignInBanner text="Sign in to track which of these problems you've solved and see their twists." />
      ) : null}
      <SectionNav />

      <Section id="idea" title="The idea">
        <Card className="flex flex-col gap-4">
          <Markdown
            text={pattern.explanation}
            className="flex max-w-3xl flex-col gap-3 leading-7"
          />
        </Card>
      </Section>

      <Section
        id="signals"
        title="When to reach for it"
        icon={RadarIcon}
        description="Phrases in a problem that point to this pattern."
      >
        <ul className="grid grid-cols-1 gap-3 min-[640px]:grid-cols-2">
          {pattern.signals.map((signal) => (
            <li
              key={signal.phrase}
              className="flex flex-col gap-1.5 rounded-lg border border-border bg-surface p-4"
            >
              <span className="w-fit rounded-sm bg-signal px-1.5 font-medium">
                “{signal.phrase}”
              </span>
              <span className="text-sm text-muted">{signal.meaning}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        id="template"
        title="Template"
        description="Every problem in this pattern fills these five slots. Hover a slot to find it in the code."
      >
        <TemplateExplorer template={pattern.template} slots={pattern.slots} />
      </Section>

      <Section id="demo" title="See it move">
        <Demo pattern={pattern} />
      </Section>

      <Section id="variations" title="Variations">
        <ul className="grid grid-cols-1 gap-3 min-[640px]:grid-cols-2">
          {pattern.variations.map((variation, index) => (
            <li
              key={variation.name}
              className="flex gap-3 rounded-lg border border-border bg-surface p-4"
            >
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-2 font-mono text-xs">
                {index + 1}
              </span>
              <span className="flex flex-col gap-1">
                <span className="font-medium">{variation.name}</span>
                <span className="text-sm text-muted">{variation.line}</span>
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        id="problems"
        title="Problems"
        description="Each one is this pattern plus one twist. A twist shows once you've solved its problem."
      >
        <ProblemsTable problems={pattern.problems} />
      </Section>

      <Section id="mistakes" title="Common mistakes" icon={AlertTriangleIcon}>
        <Card>
          <ul className="flex flex-col gap-3">
            {pattern.mistakes.map((mistake) => (
              <li key={mistake} className="flex gap-3 text-sm">
                <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-accent-2" />
                <span>{mistake}</span>
              </li>
            ))}
          </ul>
        </Card>
      </Section>

      <Section
        id="toolkit"
        title="Python toolkit"
        icon={WrenchIcon}
        description="Phrases that call for a Python tool. Toolkit drills train these."
      >
        {pattern.toolkitCards.length ? (
          <ul className="grid grid-cols-1 gap-3 min-[640px]:grid-cols-2">
            {pattern.toolkitCards.map((card) => (
              <li
                key={card.id}
                className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4"
              >
                <code className="w-fit rounded-sm bg-surface-2 px-1.5 py-0.5 font-mono text-sm font-semibold">
                  {card.tool}
                </code>
                <p className="text-sm text-muted">
                  {card.phrases.map((phrase) => `“${phrase}”`).join(" · ")}
                </p>
                <CodeBlock code={card.example} className="p-2 text-xs leading-5" />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No toolkit cards for this pattern yet.</p>
        )}
      </Section>
    </div>
  )
}

// Pattern page (Section 6.4).
export function PatternPage({ patternId }: { patternId: string }) {
  const query = usePattern(patternId)
  if (query.isPending) return <LoadingState label="Loading the pattern" rows={4} />
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404) {
      return (
        <Card className="flex flex-col items-start gap-3">
          <h1 className="text-xl font-semibold">Pattern not found</h1>
          <p className="text-sm text-muted">There&apos;s no pattern called “{patternId}”.</p>
          <Button asChild variant="secondary" size="sm">
            <Link href="/roadmap">Open the roadmap</Link>
          </Button>
        </Card>
      )
    }
    return (
      <ErrorState
        title="We couldn't load this pattern"
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    )
  }
  return <PatternContent pattern={query.data} />
}
