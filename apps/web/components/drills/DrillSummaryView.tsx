"use client"

import { ArrowRightIcon, RotateCcwIcon, TargetIcon, TimerIcon, TrophyIcon } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { formatPercent, formatSeconds, plural } from "@/components/stats/format"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { finishDrillSession, type DrillSummary } from "@/lib/api/drills"
import { FIELD_LABELS } from "@/lib/workspace/plan"
import { cn } from "@/lib/utils"

/** A switch (role="switch") styled as a pill toggle. */
export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: string
  disabled?: boolean
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{label}</span>
        {description ? <span className="text-sm text-muted">{description}</span> : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 inline-flex h-6 w-10 shrink-0 items-center rounded-full border transition-colors disabled:opacity-50",
          checked ? "border-accent bg-accent" : "border-border bg-surface-2"
        )}
      >
        <span
          aria-hidden
          className={cn(
            "inline-block size-4 rounded-full shadow-sm transition-transform",
            checked ? "translate-x-5 bg-on-accent" : "translate-x-1 bg-muted"
          )}
        />
      </button>
    </label>
  )
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof TrophyIcon
  label: string
  value: string
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-4">
      <span className="flex items-center gap-1.5 text-xs text-muted">
        <Icon aria-hidden className="size-3.5" />
        {label}
      </span>
      <span className="font-mono text-2xl font-semibold tabular-nums">{value}</span>
    </div>
  )
}

export function Bar({ value, label }: { value: number; label: string }) {
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-surface-2"
      role="img"
      aria-label={label}
    >
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-500"
        style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` }}
      />
    </div>
  )
}

/** The end screen (Section 6.6): accuracy by field, median time, misses, add-to-review. */
export function DrillSummaryView({
  summary: initial,
  onAgain,
}: {
  summary: DrillSummary
  onAgain: () => void
}) {
  const [summary, setSummary] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggle = async (value: boolean) => {
    setSaving(true)
    setError(null)
    try {
      setSummary(await finishDrillSession(summary.sessionId, value))
    } catch {
      setError("Couldn't update your review list. Try again.")
    } finally {
      setSaving(false)
    }
  }

  const headline =
    summary.answered === 0
      ? "No cards answered"
      : summary.accuracy !== null && summary.accuracy >= 0.8
        ? "Sharp work."
        : summary.accuracy !== null && summary.accuracy >= 0.5
          ? "Good session."
          : "Every miss is a pattern you'll spot next time."

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-muted">
          {summary.mode === "recognition" ? "Recognition drill" : "Toolkit drill"} ·{" "}
          {plural(summary.answered, "card")} answered
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">{headline}</h1>
      </header>

      <div className="grid grid-cols-2 gap-3 min-[640px]:grid-cols-4">
        <Stat icon={TargetIcon} label="Accuracy" value={formatPercent(summary.accuracy) ?? "–"} />
        <Stat icon={TrophyIcon} label="Correct" value={`${summary.correct}/${summary.answered}`} />
        <Stat
          icon={TimerIcon}
          label="Median time"
          value={formatSeconds(summary.medianSeconds) ?? "–"}
        />
        <Stat icon={TimerIcon} label="Over 30 s" value={String(summary.overtime)} />
      </div>

      {summary.fields ? (
        <Card className="flex flex-col gap-4" aria-labelledby="summary-fields">
          <h2 id="summary-fields" className="text-base font-semibold">
            Accuracy by field
          </h2>
          <ul className="flex flex-col gap-3">
            {(["pattern", "structures", "time", "space", "twist"] as const).map((field) => {
              const tally = summary.fields![field]
              return (
                <li
                  key={field}
                  className="grid grid-cols-[96px_minmax(0,1fr)_64px] items-center gap-3"
                >
                  <span className="text-sm">{FIELD_LABELS[field]}</span>
                  <Bar
                    value={tally.total ? tally.correct / tally.total : 0}
                    label={`${FIELD_LABELS[field]}: ${tally.correct} of ${tally.total} correct`}
                  />
                  <span className="text-right font-mono text-sm text-muted tabular-nums">
                    {tally.total ? `${tally.correct}/${tally.total}` : "–"}
                  </span>
                </li>
              )
            })}
          </ul>
        </Card>
      ) : null}

      {summary.patterns.length ? (
        <Card className="flex flex-col gap-3" aria-labelledby="summary-patterns">
          <h2 id="summary-patterns" className="text-base font-semibold">
            By pattern
          </h2>
          <ul className="flex flex-col divide-y divide-border">
            {summary.patterns.map((p) => (
              <li key={p.patternId} className="flex items-center justify-between gap-3 py-2">
                <Link href={`/patterns/${p.patternId}`} className="text-sm hover:underline">
                  {p.patternName}
                </Link>
                <span className="font-mono text-sm text-muted tabular-nums">
                  {p.correct}/{p.answered}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card className="flex flex-col gap-4" aria-labelledby="summary-missed">
        <h2 id="summary-missed" className="text-base font-semibold">
          {summary.missed.length ? `Missed (${summary.missed.length})` : "No misses"}
        </h2>
        {summary.missed.length ? (
          <>
            <ul className="flex flex-col gap-2">
              {summary.missed.map((miss) => (
                <li
                  key={miss.cardId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface-2 px-3 py-2 text-sm"
                >
                  <span>
                    {miss.title ?? (
                      <>
                        “{miss.phrase}” → <code className="font-mono">{miss.tool}</code>
                      </>
                    )}
                  </span>
                  <span className="text-xs text-muted">
                    {miss.inReview ? "In your review queue" : "Not in review"}
                  </span>
                </li>
              ))}
            </ul>
            <Switch
              checked={summary.addMissedToReview}
              onChange={(value) => void toggle(value)}
              disabled={saving}
              label="Add missed to review"
              description="Missed cards come back tomorrow so they stick."
            />
            {error ? (
              <p role="alert" className="text-sm text-error">
                {error}
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted">Every card right. Try a longer session next.</p>
        )}
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button onClick={onAgain}>
          <RotateCcwIcon />
          Another round
        </Button>
        <Button asChild variant="secondary">
          <Link href="/today">
            Back to Today
            <ArrowRightIcon />
          </Link>
        </Button>
      </div>
    </div>
  )
}
