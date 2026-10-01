"use client"

import { ArrowRightIcon, BrainIcon, LockIcon, WrenchIcon, ZapIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useId, useState } from "react"

import { formatPercent } from "@/components/stats/format"
import { PageHeader, RequireAuth, SignedOutState } from "@/components/today/PageStates"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { DRILL_SIZES, drillSessionHref, type DrillMode } from "@/lib/api/drills"
import { useRoadmap } from "@/lib/api/patterns"
import { useStats } from "@/lib/api/stats"
import { cn } from "@/lib/utils"

const MODES: {
  mode: DrillMode
  title: string
  line: string
  detail: string
  icon: typeof BrainIcon
}[] = [
  {
    mode: "recognition",
    title: "Recognition",
    line: "Read the problem, plan it in 30 seconds.",
    detail: "Pattern, structures, time and space. Mixed patterns on purpose.",
    icon: BrainIcon,
  },
  {
    mode: "toolkit",
    title: "Toolkit",
    line: "Match phrases to Python tools.",
    detail: "“ignore letter case” → .lower(). Type it, or pick from four.",
    icon: WrenchIcon,
  },
]

const optionCard =
  "relative flex cursor-pointer flex-col gap-3 rounded-lg border border-border bg-surface p-5 transition-colors hover:border-muted has-[:checked]:border-accent has-[:checked]:bg-[color-mix(in_srgb,var(--accent)_7%,var(--surface))] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent"

function Picker() {
  const router = useRouter()
  const roadmap = useRoadmap()
  const stats = useStats()
  const [mode, setMode] = useState<DrillMode>("recognition")
  const [pattern, setPattern] = useState<string>("")
  const [size, setSize] = useState<number>(10)
  const patternId = useId()

  const patterns = roadmap.data?.patterns ?? []
  const accuracy = new Map(
    (stats.data?.patterns ?? []).map((p) => [p.patternId, p.drillAccuracy] as const)
  )
  const start = () => router.push(drillSessionHref({ mode, patternFilter: pattern || null, size }))

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Drills"
        description="Fast reps that train the step most courses skip: knowing which approach fits a problem you've never seen."
      />

      <form
        className="flex flex-col gap-8"
        onSubmit={(event) => {
          event.preventDefault()
          start()
        }}
      >
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-3 text-sm font-medium">Kind of drill</legend>
          <div className="grid grid-cols-1 gap-3 min-[640px]:grid-cols-2">
            {MODES.map((option) => (
              <label key={option.mode} className={optionCard}>
                <input
                  type="radio"
                  name="drill-mode"
                  value={option.mode}
                  checked={mode === option.mode}
                  onChange={() => setMode(option.mode)}
                  className="sr-only"
                />
                <span className="flex size-10 items-center justify-center rounded-full bg-surface-2 text-accent">
                  <option.icon aria-hidden className="size-5" />
                </span>
                <span className="text-lg font-semibold">{option.title}</span>
                <span>{option.line}</span>
                <span className="text-sm">{option.detail}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid grid-cols-1 gap-6 min-[640px]:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label htmlFor={patternId} className="text-sm font-medium">
              Pattern
            </label>
            <select
              id={patternId}
              value={pattern}
              onChange={(event) => setPattern(event.target.value)}
              className="h-9 rounded-md border border-border bg-surface px-3 text-sm"
            >
              <option value="">Mixed (all unlocked patterns)</option>
              {patterns.map((p) => {
                const acc = formatPercent(accuracy.get(p.id))
                return (
                  <option key={p.id} value={p.id} disabled={p.state === "locked"}>
                    {p.name}
                    {p.state === "locked" ? " (locked)" : acc ? ` · ${acc} lately` : ""}
                  </option>
                )
              })}
            </select>
            <p className="text-xs text-muted">
              {pattern
                ? "7 in 10 cards come from this pattern; the rest keep you mixing."
                : "Interleaving patterns is what makes recognition stick."}
            </p>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">Session length</legend>
            <div className="flex gap-2">
              {DRILL_SIZES.map((option) => (
                <label
                  key={option}
                  className="flex h-9 flex-1 cursor-pointer items-center justify-center rounded-md border border-border bg-surface text-sm transition-colors hover:bg-surface-2 has-[:checked]:border-accent has-[:checked]:bg-window has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent"
                >
                  <input
                    type="radio"
                    name="drill-size"
                    value={option}
                    checked={size === option}
                    onChange={() => setSize(option)}
                    className="sr-only"
                  />
                  {option} cards
                </label>
              ))}
            </div>
            <p className="text-xs text-muted">About {Math.round(size / 2)} minutes.</p>
          </fieldset>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="md">
            <ZapIcon />
            Start drill
            <Kbd className="border-on-accent/40 text-on-accent">↵</Kbd>
          </Button>
          {patterns.some((p) => p.state === "locked") ? (
            <span className="inline-flex items-center gap-1.5 text-sm text-muted">
              <LockIcon aria-hidden className="size-3.5" />
              Locked patterns join the pool as you unlock them.
            </span>
          ) : null}
        </div>
      </form>

      <section
        aria-labelledby="drill-how"
        className="grid grid-cols-1 gap-3 min-[900px]:grid-cols-3"
      >
        <h2 id="drill-how" className="sr-only">
          How drills work
        </h2>
        {[
          ["Read", "The title is hidden, so you recognize the problem, not its name."],
          ["Plan", "Pick the pattern, structures and complexity. Enter checks it."],
          ["See why", "The signals light up in the text, so next time you spot them first."],
        ].map(([title, text], index) => (
          <div
            key={title}
            className={cn("flex gap-3 rounded-lg border border-border bg-surface p-4")}
          >
            <span className="font-mono text-sm text-muted">{index + 1}</span>
            <span className="flex flex-col gap-0.5">
              <span className="font-medium">{title}</span>
              <span className="text-sm text-muted">{text}</span>
            </span>
          </div>
        ))}
        <p className="text-xs text-muted min-[900px]:col-span-3">
          Missed cards are added to your review queue.{" "}
          <ArrowRightIcon aria-hidden className="inline size-3" /> They come back tomorrow.
        </p>
      </section>
    </div>
  )
}

// Drills picker (Section 6.6).
export function DrillPicker() {
  return (
    <RequireAuth
      loadingLabel="Loading drills"
      signedOut={
        <SignedOutState
          title="Drills"
          icon={ZapIcon}
          pitch="Drills train recognition, the step that makes unseen problems feel familiar."
          points={[
            "Recognition: read a problem, plan it in 30 seconds",
            "Toolkit: match phrases to Python tools",
            "Misses come back in your review queue",
          ]}
        />
      }
    >
      <Picker />
    </RequireAuth>
  )
}
