"use client"

import {
  CalendarDaysIcon,
  ChartLineIcon,
  CheckCircle2Icon,
  FlameIcon,
  RotateCcwIcon,
  TrophyIcon,
  ZapIcon,
} from "lucide-react"
import Link from "next/link"

import { Bar } from "@/components/drills/DrillSummaryView"
import { PatternStateBadge } from "@/components/patterns/PatternChip"
import { LineChart, StackedBars, weekLabel } from "@/components/stats/charts"
import { formatPercent, formatSeconds, plural } from "@/components/stats/format"
import {
  ErrorState,
  LoadingState,
  PageHeader,
  RequireAuth,
  SignedOutState,
} from "@/components/today/PageStates"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useStats, type StatsData } from "@/lib/api/stats"

export const RUNG_LABELS = [
  "No hints",
  "Clarify",
  "Signals",
  "Approach",
  "Plan",
  "Walkthrough",
  "Solution",
]

function Tile({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof FlameIcon
  label: string
  value: string
  detail?: string
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-4">
      <span className="flex items-center gap-1.5 text-xs text-muted">
        <Icon aria-hidden className="size-3.5" />
        {label}
      </span>
      <span className="font-mono text-2xl font-semibold tabular-nums">{value}</span>
      {detail ? <span className="text-xs text-muted">{detail}</span> : null}
    </div>
  )
}

function ChartCard({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  const id = title.toLowerCase().replace(/\W+/g, "-")
  return (
    <Card aria-labelledby={id} className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        <h2 id={id} className="text-base font-semibold">
          {title}
        </h2>
        <p className="text-sm text-muted">{description}</p>
      </div>
      {children}
    </Card>
  )
}

function WeeksTable({ stats }: { stats: StatsData }) {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-muted hover:text-text">Show as a table</summary>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[520px] text-left">
          <thead className="text-xs text-muted">
            <tr>
              <th scope="col" className="py-1 pr-3 font-medium">
                Week of
              </th>
              <th scope="col" className="py-1 pr-3 font-medium">
                Median plan time
              </th>
              <th scope="col" className="py-1 pr-3 font-medium">
                Solved
              </th>
              <th scope="col" className="py-1 pr-3 font-medium">
                Drill cards
              </th>
              <th scope="col" className="py-1 pr-3 font-medium">
                Reviews
              </th>
              <th scope="col" className="py-1 font-medium">
                First-attempt rungs 0–6
              </th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {stats.weeks.map((week) => (
              <tr key={week.weekStart} className="border-t border-border">
                <td className="py-1.5 pr-3 font-sans">{weekLabel(week.weekStart)}</td>
                <td className="py-1.5 pr-3">{formatSeconds(week.medianPlanSeconds) ?? "–"}</td>
                <td className="py-1.5 pr-3">{week.solved}</td>
                <td className="py-1.5 pr-3">{week.drills}</td>
                <td className="py-1.5 pr-3">{week.reviews}</td>
                <td className="py-1.5">{week.firstAttemptRungs.join(" · ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

function PatternTable({ stats }: { stats: StatsData }) {
  return (
    <Card aria-labelledby="stats-patterns" className="flex min-w-0 flex-col gap-4 p-0">
      <h2 id="stats-patterns" className="px-5 pt-5 text-base font-semibold">
        By pattern
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead className="text-xs text-muted">
            <tr>
              <th scope="col" className="py-2 pl-5 font-medium">
                Pattern
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                Solved
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                Median hint rung
                <span className="sr-only"> on first attempts</span>
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                Drill accuracy
                <span className="sr-only"> over the last 30 answers</span>
              </th>
              <th scope="col" className="py-2 pr-5 font-medium">
                State
              </th>
            </tr>
          </thead>
          <tbody>
            {stats.patterns.map((p) => (
              <tr key={p.patternId} className="border-t border-border">
                <td className="py-3 pl-5">
                  <Link href={`/patterns/${p.patternId}`} className="font-medium hover:underline">
                    {p.patternName}
                  </Link>
                </td>
                <td className="w-40 py-3 pr-4">
                  <div className="flex items-center gap-2">
                    <span className="w-10 font-mono tabular-nums">
                      {p.solved}/{p.total}
                    </span>
                    <Bar
                      value={p.total ? p.solved / p.total : 0}
                      label={`${p.solved} of ${p.total} solved`}
                    />
                  </div>
                </td>
                <td className="py-3 pr-4 font-mono tabular-nums">
                  {p.medianFirstRung === null ? (
                    <span className="text-muted">–</span>
                  ) : (
                    <span title={RUNG_LABELS[Math.round(p.medianFirstRung)]}>
                      {p.medianFirstRung}
                    </span>
                  )}
                </td>
                <td className="py-3 pr-4 font-mono tabular-nums">
                  {p.drillAccuracy === null ? (
                    <span className="text-muted">–</span>
                  ) : (
                    <>
                      {formatPercent(p.drillAccuracy)}{" "}
                      <span className="font-sans text-xs text-muted">of {p.drillAnswers}</span>
                    </>
                  )}
                </td>
                <td className="py-3 pr-5">
                  <PatternStateBadge state={p.state} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function Misses({ stats }: { stats: StatsData }) {
  const top = stats.commonMisses[0]?.count ?? 1
  return (
    <Card aria-labelledby="stats-misses" className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        <h2 id="stats-misses" className="text-base font-semibold">
          Your common misses
        </h2>
        <p className="text-sm text-muted">
          What your plans most often got wrong, over the last 8 weeks.
        </p>
      </div>
      {stats.commonMisses.length ? (
        <ol className="flex flex-col gap-3">
          {stats.commonMisses.map((miss) => (
            <li
              key={`${miss.kind}-${miss.id}`}
              className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_32px] items-center gap-3 text-sm"
            >
              <span className="truncate">{miss.label}</span>
              <Bar value={miss.count / top} label={`Missed ${plural(miss.count, "time")}`} />
              <span className="text-right font-mono text-muted tabular-nums">{miss.count}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted">Nothing yet. Misses show up after a few plans.</p>
      )}
    </Card>
  )
}

function StatsContent({ stats }: { stats: StatsData }) {
  const { totals } = stats
  const fresh = totals.solved + totals.drills + totals.reviews === 0
  const planPoints = stats.weeks.map((w) => ({
    label: weekLabel(w.weekStart),
    value: w.medianPlanSeconds,
  }))
  const rungBars = stats.weeks.map((w) => ({
    label: weekLabel(w.weekStart),
    values: w.firstAttemptRungs,
  }))

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Your progress"
        description="The number that matters most: how fast you reach a correct plan on a problem you haven't seen."
      />
      {fresh ? (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-accent/40">
          <p className="text-sm">
            Your stats fill in as you practice. Solve a problem or run a drill to get started.
          </p>
          <div className="flex gap-2">
            <Button asChild size="sm">
              <Link href="/today">Go to Today</Link>
            </Button>
            <Button asChild size="sm" variant="secondary">
              <Link href="/drills">Try a drill</Link>
            </Button>
          </div>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-3 min-[640px]:grid-cols-3 min-[1200px]:grid-cols-6">
        <Tile
          icon={FlameIcon}
          label="Streak"
          value={plural(stats.streak, "day")}
          detail={`Longest ${plural(stats.longestStreak, "day")}`}
        />
        <Tile
          icon={CheckCircle2Icon}
          label="Solved"
          value={`${totals.solved}/${totals.problems}`}
        />
        <Tile icon={TrophyIcon} label="Mastered" value={String(totals.mastered)} />
        <Tile icon={ZapIcon} label="Drill cards" value={String(totals.drills)} />
        <Tile
          icon={RotateCcwIcon}
          label="Reviews"
          value={String(totals.reviews)}
          detail={
            stats.reviewRetention.rate === null
              ? undefined
              : `${formatPercent(stats.reviewRetention.rate)} remembered`
          }
        />
        <Tile icon={CalendarDaysIcon} label="Active days" value={String(totals.activeDays)} />
      </div>

      <div className="grid grid-cols-1 gap-4 min-[1200px]:grid-cols-2">
        <ChartCard
          title="Median plan time"
          description="Seconds to a correct plan, per week. Lower is better."
        >
          <LineChart
            points={planPoints}
            format={(v) => formatSeconds(v) ?? "–"}
            emptyText="No correct plans yet"
            ariaLabel="Line chart of median plan time per week, last 8 weeks"
          />
        </ChartCard>
        <ChartCard
          title="Hints on first attempts"
          description="How far down the hint ladder each first attempt went, per week."
        >
          <StackedBars
            bars={rungBars}
            seriesLabels={RUNG_LABELS.map((label, i) => `${i} ${label}`)}
            emptyText="No first attempts yet"
            ariaLabel="Stacked bar chart of the highest hint rung on first attempts per week"
          />
        </ChartCard>
      </div>
      <WeeksTable stats={stats} />

      <div className="flex flex-col gap-4">
        <PatternTable stats={stats} />
        <Misses stats={stats} />
      </div>
    </div>
  )
}

function StatsLoader() {
  const stats = useStats()
  if (stats.isPending) return <LoadingState label="Loading your stats" />
  if (stats.isError) {
    return (
      <ErrorState
        title="We couldn't load your stats"
        error={stats.error}
        onRetry={() => void stats.refetch()}
      />
    )
  }
  return <StatsContent stats={stats.data} />
}

// Stats (Section 6.8).
export function StatsView() {
  return (
    <RequireAuth
      loadingLabel="Loading your stats"
      signedOut={
        <SignedOutState
          title="Stats"
          icon={ChartLineIcon}
          pitch="See your plan time drop and your hint use shrink, pattern by pattern."
          points={[
            "Median plan time per week",
            "Hint depth on first attempts",
            "Your most common misses",
          ]}
        />
      }
    >
      <StatsLoader />
    </RequireAuth>
  )
}
