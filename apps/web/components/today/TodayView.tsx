"use client"

import {
  ArrowRightIcon,
  CalendarDaysIcon,
  ChartLineIcon,
  CompassIcon,
  FlameIcon,
  RotateCcwIcon,
  SparklesIcon,
  ZapIcon,
} from "lucide-react"
import Link from "next/link"

import { PatternChip } from "@/components/patterns/PatternChip"
import { DifficultyChip } from "@/components/problems/DifficultyChip"
import { ProblemLink } from "@/components/problems/ProblemLink"
import { formatRelative, formatSeconds, plural } from "@/components/stats/format"
import { ErrorState, RequireAuth, SignedOutState } from "@/components/today/PageStates"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { drillSessionHref } from "@/lib/api/drills"
import { useMe, usePatterns } from "@/lib/api/hooks"
import type { PatternSummary } from "@/lib/api/schemas"
import { useToday, type TodayData } from "@/lib/api/today"
import { cn } from "@/lib/utils"

export function greetingFor(hour: number): string {
  if (hour >= 5 && hour < 12) return "Good morning"
  if (hour >= 12 && hour < 18) return "Good afternoon"
  return "Good evening"
}

export function firstName(displayName: string | null | undefined): string {
  const first = displayName?.trim().split(/\s+/)[0]
  return first || "there"
}

/** Section 6.2: estimated minutes for the due reviews (about one minute each). */
export function reviewMinutes(count: number): string {
  return count <= 1 ? "about 1 minute" : `about ${count} minutes`
}

/**
 * Rise in, one card after another (CSS, so reduced motion turns it off). No fade: text keeps
 * full contrast while it moves.
 */
function Appear({
  index,
  children,
  className,
}: {
  index: number
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn("animate-in duration-300 fill-mode-both slide-in-from-bottom-2", className)}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      {children}
    </div>
  )
}

function TodayCard({
  icon: Icon,
  eyebrow,
  title,
  children,
  action,
  accent = false,
  labelId,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>
  eyebrow: string
  title: React.ReactNode
  children?: React.ReactNode
  action?: React.ReactNode
  accent?: boolean
  labelId: string
}) {
  return (
    <Card
      aria-labelledby={labelId}
      className={cn(
        "flex h-full flex-col gap-4 transition-colors hover:border-muted/40",
        accent && "border-accent/50 bg-[color-mix(in_srgb,var(--accent)_6%,var(--surface))]"
      )}
    >
      <div className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted uppercase">
        <Icon aria-hidden className={cn("size-4", accent ? "text-accent" : "text-muted")} />
        {eyebrow}
      </div>
      <div className="flex flex-1 flex-col gap-2">
        <h2 id={labelId} className="text-lg font-semibold tracking-tight">
          {title}
        </h2>
        {children}
      </div>
      {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
    </Card>
  )
}

function patternById(patterns: readonly PatternSummary[] | undefined, id: string) {
  return patterns?.find((pattern) => pattern.id === id)
}

function ReviewsCard({
  today,
  patterns,
}: {
  today: TodayData
  patterns: PatternSummary[] | undefined
}) {
  const chips = [...new Set(today.reviewPatterns)].slice(0, 5)
  return (
    <TodayCard
      icon={RotateCcwIcon}
      eyebrow="Reviews due"
      labelId="today-reviews"
      accent
      title={`${plural(today.reviewsDue, "review")} waiting`}
      action={
        <Button asChild>
          <Link href="/review">
            Start review
            <ArrowRightIcon />
          </Link>
        </Button>
      }
    >
      <p className="text-sm text-muted">
        Rebuild each plan from memory, {reviewMinutes(today.reviewsDue)} in all. Recall now is what
        makes it stick.
      </p>
      {chips.length ? (
        <div className="flex flex-wrap gap-1.5" aria-label="Patterns in today's reviews">
          {chips.map((id) => {
            const pattern = patternById(patterns, id)
            return <PatternChip key={id} name={pattern?.name ?? id} family={pattern?.family} />
          })}
        </div>
      ) : null}
    </TodayCard>
  )
}

function ContinueCard({
  next,
  patterns,
  primary,
}: {
  next: NonNullable<TodayData["continue"]>
  patterns: PatternSummary[] | undefined
  primary: boolean
}) {
  const pattern = next.patternId ? patternById(patterns, next.patternId) : undefined
  const lastTime = formatRelative(next.lastActiveAt)
  return (
    <TodayCard
      icon={CompassIcon}
      eyebrow={next.inProgress ? "Pick up where you left off" : "Continue your roadmap"}
      labelId="today-continue"
      title={next.title}
      action={
        <Button asChild variant={primary ? "primary" : "secondary"}>
          <ProblemLink slug={next.slug}>
            {next.inProgress ? "Resume" : "Open"}
            <ArrowRightIcon />
          </ProblemLink>
        </Button>
      }
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <DifficultyChip difficulty={next.difficulty} />
        {pattern ? <PatternChip name={pattern.name} family={pattern.family} /> : null}
      </div>
      <p className="text-sm text-muted">
        {next.inProgress && lastTime
          ? `Last time: ${lastTime}. Your code and plan are saved.`
          : "Plan first, then code. Pull a hint whenever you're stuck."}
      </p>
    </TodayCard>
  )
}

function DrillCard({
  drill,
  primary,
}: {
  drill: NonNullable<TodayData["drill"]>
  primary: boolean
}) {
  return (
    <TodayCard
      icon={ZapIcon}
      eyebrow="5-minute drill"
      labelId="today-drill"
      title={drill.patternName}
      action={
        <Button asChild variant={primary ? "primary" : "secondary"}>
          <Link
            href={drillSessionHref({
              mode: "recognition",
              patternFilter: drill.patternId,
              size: 10,
            })}
          >
            Start drill
            <ArrowRightIcon />
          </Link>
        </Button>
      }
    >
      <p className="text-sm text-muted">{drill.reason}</p>
      <p className="text-sm text-muted">10 quick cards: read, plan in 30 seconds, see why.</p>
    </TodayCard>
  )
}

function WeekCard({ week }: { week: TodayData["week"] }) {
  const items = [
    { label: "Problems solved", value: String(week.solved) },
    { label: "Drill cards", value: String(week.drills) },
    { label: "Reviews", value: String(week.reviews) },
    { label: "Median plan time", value: formatSeconds(week.medianPlanSeconds) ?? "–" },
  ]
  return (
    <Card aria-labelledby="today-week" className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2
          id="today-week"
          className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted uppercase"
        >
          <CalendarDaysIcon aria-hidden className="size-4" />
          This week
        </h2>
        <Link
          href="/stats"
          className="inline-flex items-center gap-1 rounded-md text-sm text-muted hover:text-text"
        >
          <ChartLineIcon aria-hidden className="size-4" />
          All stats
        </Link>
      </div>
      <dl className="grid grid-cols-2 gap-4 min-[640px]:grid-cols-4">
        {items.map((item) => (
          <div key={item.label} className="flex flex-col gap-0.5">
            <dt className="text-xs text-muted">{item.label}</dt>
            <dd className="font-mono text-xl font-semibold tabular-nums">{item.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}

function StartCard({ start }: { start: NonNullable<TodayData["start"]> }) {
  const steps = [
    { title: "Learn the pattern", text: "Read the idea, see the template and its slots." },
    { title: "Plan, then code", text: "Fill the Plan card, then solve with hints as needed." },
    { title: "Come back tomorrow", text: "Reviews and drills keep it from fading." },
  ]
  return (
    <Appear index={1}>
      <Card
        aria-labelledby="today-start"
        className="relative flex flex-col gap-6 overflow-hidden border-accent/50 p-6 min-[640px]:p-8"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-24 size-64 rounded-full bg-accent/10 blur-3xl"
        />
        <div className="flex flex-col gap-2">
          <p className="flex items-center gap-2 text-xs font-medium tracking-wide text-accent uppercase">
            <SparklesIcon aria-hidden className="size-4" />
            Your first step
          </p>
          <h2 id="today-start" className="text-2xl font-semibold tracking-tight">
            Start with your first pattern: {start.patternName}
          </h2>
          <p className="max-w-xl text-muted">
            Every problem is a known pattern plus one twist. Learn this one, solve its first
            problem, and your daily plan fills in from there.
          </p>
        </div>
        <ol className="grid grid-cols-1 gap-3 min-[640px]:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.title} className="flex gap-3 rounded-md border border-border bg-bg p-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border font-mono text-xs">
                {index + 1}
              </span>
              <span className="flex flex-col">
                <span className="text-sm font-medium">{step.title}</span>
                <span className="text-sm text-muted">{step.text}</span>
              </span>
            </li>
          ))}
        </ol>
        <div>
          <Button asChild>
            <Link href={`/patterns/${start.patternId}`}>
              Open the pattern
              <ArrowRightIcon />
            </Link>
          </Button>
        </div>
      </Card>
    </Appear>
  )
}

function StreakChip({ streak }: { streak: number }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-full border px-2.5 text-xs font-medium",
        streak > 0 ? "border-accent-2/60 text-text" : "border-border text-muted"
      )}
      title="Days in a row with a review, drill or solved problem"
    >
      <FlameIcon aria-hidden className={cn("size-3.5", streak > 0 && "text-accent-2")} />
      {streak > 0 ? `${plural(streak, "day")} streak` : "No streak yet"}
    </span>
  )
}

function TodaySkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading your day">
      <div className="grid grid-cols-1 gap-4 min-[900px]:grid-cols-2">
        <Skeleton className="h-48 rounded-lg" />
        <Skeleton className="h-48 rounded-lg" />
      </div>
      <Skeleton className="h-32 rounded-lg" />
    </div>
  )
}

function TodayCards() {
  const today = useToday()
  const patterns = usePatterns()

  if (today.isPending) return <TodaySkeleton />
  if (today.isError) {
    return (
      <ErrorState
        title="We couldn't load your day"
        error={today.error}
        onRetry={() => void today.refetch()}
      />
    )
  }

  const data = today.data
  if (data.start) return <StartCard start={data.start} />

  const cards: React.ReactNode[] = []
  if (data.reviewsDue > 0) {
    cards.push(<ReviewsCard key="reviews" today={data} patterns={patterns.data} />)
  }
  if (data.continue) {
    cards.push(
      <ContinueCard
        key="continue"
        next={data.continue}
        patterns={patterns.data}
        primary={cards.length === 0}
      />
    )
  }
  if (data.drill) {
    cards.push(<DrillCard key="drill" drill={data.drill} primary={cards.length === 0} />)
  }

  return (
    <div className="flex flex-col gap-4">
      {data.reviewsDue === 0 ? (
        <p className="text-sm text-muted">No reviews due today. You&apos;re all caught up.</p>
      ) : null}
      {cards.length ? (
        <div className="grid grid-cols-1 gap-4 min-[900px]:grid-cols-2">
          {cards.map((card, index) => (
            <Appear
              key={index}
              index={index}
              className={cn(cards.length % 2 === 1 && index === 0 && "min-[900px]:col-span-2")}
            >
              {card}
            </Appear>
          ))}
        </div>
      ) : (
        <Card className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">You&apos;ve mastered every problem</h2>
          <p className="text-sm text-muted">
            Keep the patterns fresh with a drill, or browse the problems list.
          </p>
        </Card>
      )}
      <Appear index={cards.length}>
        <WeekCard week={data.week} />
      </Appear>
    </div>
  )
}

function TodayHeader() {
  const me = useMe()
  const today = useToday()
  const now = new Date()
  const date = now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })
  const name = me.data?.displayName ?? today.data?.greetingName ?? null

  return (
    <header className="flex flex-col gap-2">
      {me.isPending && !today.data ? (
        <Skeleton className="h-8 w-72" />
      ) : (
        <h1 className="text-2xl font-semibold tracking-tight">
          {greetingFor(now.getHours())}, {firstName(name)}
        </h1>
      )}
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
        <span>{date}</span>
        {today.data ? <StreakChip streak={today.data.streak} /> : null}
      </div>
    </header>
  )
}

// Today (Sections 6.2 and 11.8): reviews due, the next roadmap problem, a weak-spot drill
// and this week's numbers; a brand-new user sees one "Start with your first pattern" card.
export function TodayView() {
  return (
    <RequireAuth
      loadingLabel="Loading your day"
      signedOut={
        <SignedOutState
          title="Today"
          icon={CalendarDaysIcon}
          pitch="Today is your daily plan: one clear next step every time you come back."
          points={[
            "Reviews that are due, about a minute each",
            "The next problem on your roadmap",
            "A 5-minute drill on your weakest pattern",
          ]}
        />
      }
    >
      <div className="flex flex-col gap-8">
        <TodayHeader />
        <TodayCards />
      </div>
    </RequireAuth>
  )
}
