"use client"

import { CheckIcon, ChevronDownIcon, EyeIcon, LockIcon } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { useId, useState } from "react"

import { FieldBadge } from "@/components/workspace/FieldBadge"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { usePatterns, useStructures } from "@/lib/api/hooks"
import type {
  Complexity,
  FieldResult,
  PatternSummary,
  PlanCard as PlanCardValue,
  PlanField,
  PlanGrade,
  PlanReveal,
  Structure,
} from "@/lib/api/schemas"
import { formatHotkey, useIsMac } from "@/lib/keyboard"
import { cn } from "@/lib/utils"
import { COACH_HOTKEYS, PLAN_CARD_ATTR } from "@/lib/workspace/hotkeys"
import { REVEAL_RUNG, findRung } from "@/lib/workspace/ladder"
import {
  COMMON_SPACE,
  COMMON_TIME,
  MAX_PLAN_CHECKS,
  MAX_STRUCTURES,
  MAX_TWIST_CHARS,
  MORE_SPACE,
  MORE_TIME,
  NOT_SURE,
  familyColor,
  patternName,
  patternOptions,
  revealedPlan,
  sameField,
  samePlan,
} from "@/lib/workspace/plan"
import { isPlanRevealed, useWorkspace, workspaceStore } from "@/stores/workspace"

// The Plan card (Section 7.3): pattern, structures, time, space and twist, checked by the API
// at most 3 times per attempt. Feedback shows per field; the reference plan appears read-only
// after the third check or once rung 3 is open.

const PLAN_TITLE_ID = "plan-card-title"

/** ⌘⇧P (17.4): focus the Plan card's first control (or the card itself when all are off). */
export function focusPlanCard(): boolean {
  const card = document.querySelector<HTMLElement>(`[${PLAN_CARD_ATTR}]`)
  if (!card) return false
  card.scrollIntoView({ block: "nearest" })
  const control = card.querySelector<HTMLElement>(
    "button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])"
  )
  ;(control ?? card).focus()
  return true
}

/** The badge and one-line nudge of a field, while it still holds what was checked. */
interface FieldFeedback {
  result: FieldResult
  nudge: string | null
}

function feedbackFor(
  field: PlanField,
  plan: PlanCardValue,
  checked: PlanCardValue | null,
  grade: PlanGrade | null
): FieldFeedback | null {
  if (!grade || !checked || !sameField(plan, checked, field)) return null
  const graded = grade.fields[field]
  const nudge = "feedback" in graded ? graded.feedback : "nudge" in graded ? graded.nudge : null
  return { result: graded.result, nudge: graded.result === "correct" ? null : (nudge ?? null) }
}

function FieldRow({
  label,
  labelId,
  htmlFor,
  feedback,
  extra,
  children,
}: {
  label: string
  labelId: string
  htmlFor?: string
  feedback: FieldFeedback | null
  extra?: React.ReactNode
  children: React.ReactNode
}) {
  const nudgeId = `${labelId}-nudge`
  return (
    <div className="flex min-w-0 flex-col gap-1.5" data-field={label.toLowerCase()}>
      <div className="flex min-h-4 items-center gap-2">
        <label id={labelId} htmlFor={htmlFor} className="text-xs font-medium text-muted">
          {label}
        </label>
        {extra}
        <span className="ml-auto" aria-live="polite">
          {feedback ? <FieldBadge result={feedback.result} /> : null}
        </span>
      </div>
      {children}
      <AnimatePresence initial={false}>
        {feedback?.nudge ? (
          <motion.p
            id={nudgeId}
            key={feedback.nudge}
            initial={{ opacity: 0, y: -2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-xs leading-4 text-muted"
          >
            {feedback.nudge}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

function FamilyDot({ family }: { family: string | null }) {
  return (
    <span
      aria-hidden
      className="size-1.5 shrink-0 rounded-full"
      style={{ backgroundColor: familyColor(family) }}
    />
  )
}

function PatternField({
  value,
  patterns,
  disabled,
  given,
  feedback,
  onChange,
}: {
  value: string | null
  patterns: PatternSummary[] | undefined
  disabled: boolean
  given: boolean
  feedback: FieldFeedback | null
  onChange: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const options = patternOptions(patterns ?? [])
  const selected = options.find((option) => option.id === value) ?? null
  const real = options.filter((option) => option.family !== null)
  const other = options.filter((option) => option.family === null)
  const pick = (id: string) => {
    onChange(id)
    setOpen(false)
  }
  return (
    <FieldRow
      label="Pattern"
      labelId="plan-pattern-label"
      feedback={feedback}
      extra={
        given ? (
          <span className="inline-flex h-4 items-center gap-1 rounded-full bg-surface-2 px-1.5 text-[11px] font-medium text-text">
            <LockIcon aria-hidden className="size-3" />
            Given
          </span>
        ) : null
      }
    >
      {patterns === undefined && !given ? (
        <Skeleton className="h-8 w-full" />
      ) : (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-labelledby="plan-pattern-label plan-pattern-value"
              aria-describedby={feedback?.nudge ? "plan-pattern-label-nudge" : undefined}
              disabled={disabled || given}
              className="flex h-8 w-full min-w-0 items-center gap-2 rounded-md border border-border bg-surface-2 px-2.5 text-left text-sm transition-colors hover:border-muted/60 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <span id="plan-pattern-value" className="flex min-w-0 flex-1 items-center gap-2">
                {selected ? (
                  <>
                    <FamilyDot family={selected.family} />
                    <span className="truncate">{selected.name}</span>
                  </>
                ) : (
                  <span className="truncate text-muted">Pick a pattern</span>
                )}
              </span>
              <ChevronDownIcon aria-hidden className="size-4 shrink-0 text-muted" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-56 p-0">
            <Command loop label="Filter patterns">
              <CommandInput placeholder="Type to filter…" className="h-9 text-sm" />
              <CommandList className="max-h-64">
                <CommandEmpty className="py-4">No pattern matches.</CommandEmpty>
                <CommandGroup heading="Patterns">
                  {real.map((option) => (
                    <CommandItem
                      key={option.id}
                      value={option.name}
                      onSelect={() => pick(option.id)}
                    >
                      <FamilyDot family={option.family} />
                      <span className="flex-1">{option.name}</span>
                      {option.id === value ? (
                        <CheckIcon aria-hidden className="text-accent" />
                      ) : null}
                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandGroup heading="Other">
                  {other.map((option) => (
                    <CommandItem
                      key={option.id}
                      value={option.name}
                      onSelect={() => pick(option.id)}
                    >
                      <span className="flex-1">{option.name}</span>
                      {option.id === value ? (
                        <CheckIcon aria-hidden className="text-accent" />
                      ) : null}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}
    </FieldRow>
  )
}

function StructuresField({
  value,
  structures,
  disabled,
  feedback,
  onChange,
}: {
  value: string[]
  structures: Structure[] | undefined
  disabled: boolean
  feedback: FieldFeedback | null
  onChange: (next: string[]) => void
}) {
  const full = value.length >= MAX_STRUCTURES
  return (
    <FieldRow label="Structures" labelId="plan-structures-label" feedback={feedback}>
      {structures === undefined ? (
        <div className="flex flex-wrap gap-1.5">
          {[16, 20, 14, 18].map((width) => (
            <Skeleton key={width} className="h-6 rounded-full" style={{ width: width * 4 }} />
          ))}
        </div>
      ) : (
        <div
          role="group"
          aria-labelledby="plan-structures-label"
          aria-describedby="plan-structures-help"
          className="flex flex-wrap gap-1.5"
        >
          {structures.map((structure) => {
            const on = value.includes(structure.id)
            const blocked = !on && full
            return (
              <button
                key={structure.id}
                type="button"
                aria-pressed={on}
                aria-disabled={disabled || blocked || undefined}
                disabled={disabled}
                onClick={() => {
                  if (blocked) return
                  onChange(
                    on ? value.filter((id) => id !== structure.id) : [...value, structure.id]
                  )
                }}
                className={cn(
                  "inline-flex h-6 items-center gap-1 rounded-full border px-2.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-70",
                  on
                    ? "border-accent bg-accent/15 text-text"
                    : "border-border bg-surface-2 text-text hover:border-muted/60",
                  blocked && "cursor-not-allowed opacity-50 hover:border-border"
                )}
              >
                {on ? <CheckIcon aria-hidden className="size-3 text-accent" /> : null}
                {structure.label}
              </button>
            )
          })}
        </div>
      )}
      <p id="plan-structures-help" className={cn("text-xs text-muted", !full && "sr-only")}>
        Up to {MAX_STRUCTURES}. Remove one to pick another.
      </p>
    </FieldRow>
  )
}

function ComplexityField({
  field,
  value,
  common,
  more,
  disabled,
  feedback,
  onChange,
}: {
  field: "time" | "space"
  value: Complexity | null
  common: readonly Complexity[]
  more: readonly Complexity[]
  disabled: boolean
  feedback: FieldFeedback | null
  onChange: (value: Complexity) => void
}) {
  const label = field === "time" ? "Time" : "Space"
  const id = `plan-${field}`
  return (
    <FieldRow label={label} labelId={`${id}-label`} htmlFor={id} feedback={feedback}>
      <Select
        value={value ?? ""}
        onValueChange={(next) => onChange(next as Complexity)}
        disabled={disabled}
      >
        <SelectTrigger
          id={id}
          aria-describedby={feedback?.nudge ? `${id}-label-nudge` : undefined}
          className="font-mono"
        >
          <SelectValue placeholder={<span className="font-sans">Pick</span>} />
        </SelectTrigger>
        <SelectContent>
          {common.map((option) => (
            <SelectItem key={option} value={option} className="font-mono">
              {option}
            </SelectItem>
          ))}
          <SelectSeparator />
          <SelectItem value={NOT_SURE}>Not sure</SelectItem>
          {more.length > 0 ? (
            <>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel>More</SelectLabel>
                {more.map((option) => (
                  <SelectItem key={option} value={option} className="font-mono">
                    {option}
                  </SelectItem>
                ))}
              </SelectGroup>
            </>
          ) : null}
        </SelectContent>
      </Select>
    </FieldRow>
  )
}

function TwistField({
  value,
  disabled,
  feedback,
  onChange,
}: {
  value: string
  disabled: boolean
  feedback: FieldFeedback | null
  onChange: (value: string) => void
}) {
  const near = value.length >= MAX_TWIST_CHARS - 20
  return (
    <FieldRow
      label="Twist"
      labelId="plan-twist-label"
      htmlFor="plan-twist"
      feedback={feedback}
      extra={
        <span
          id="plan-twist-count"
          className={cn("font-mono text-[11px] text-muted tabular-nums", near && "text-text")}
        >
          {value.length}/{MAX_TWIST_CHARS}
        </span>
      }
    >
      <input
        id="plan-twist"
        type="text"
        value={value}
        maxLength={MAX_TWIST_CHARS}
        disabled={disabled}
        autoComplete="off"
        spellCheck
        placeholder="What's different about this problem?"
        aria-describedby={
          feedback?.nudge ? "plan-twist-count plan-twist-label-nudge" : "plan-twist-count"
        }
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-full min-w-0 rounded-md border border-border bg-surface-2 px-2.5 text-sm text-text transition-colors placeholder:text-muted hover:border-muted/60 disabled:cursor-not-allowed disabled:opacity-70"
      />
    </FieldRow>
  )
}

/** Section 7.3: the reference plan, read-only, once the plan is revealed. */
function ReferencePlan({
  reveal,
  reason,
  patterns,
  structures,
}: {
  reveal: PlanReveal
  reason: string
  patterns: PatternSummary[] | undefined
  structures: Structure[] | undefined
}) {
  const label = (id: string) => structures?.find((item) => item.id === id)?.label ?? id
  const pattern = patterns?.find((item) => item.id === reveal.patternId)
  return (
    <motion.section
      aria-label="Reference plan"
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-2 rounded-md border border-accent/40 bg-accent/5 p-3"
    >
      <p className="flex items-center gap-1.5 text-xs font-medium text-text">
        <EyeIcon aria-hidden className="size-3.5 text-accent" />
        Reference plan
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
        <dt className="text-xs leading-5 text-muted">Pattern</dt>
        <dd className="flex min-w-0 items-center gap-2">
          <FamilyDot family={pattern?.family ?? null} />
          {patternName(reveal.patternId, patterns) ?? reveal.patternId}
        </dd>
        <dt className="text-xs leading-5 text-muted">Structures</dt>
        <dd>{reveal.structures.map(label).join(", ")}</dd>
        <dt className="text-xs leading-5 text-muted">Time</dt>
        <dd className="font-mono">{reveal.time}</dd>
        <dt className="text-xs leading-5 text-muted">Space</dt>
        <dd className="font-mono">{reveal.space}</dd>
        <dt className="text-xs leading-5 text-muted">Twist</dt>
        <dd>{reveal.twist}</dd>
      </dl>
      <p className="text-xs text-muted">{reason}</p>
    </motion.section>
  )
}

function checksLeftText(left: number): string {
  if (left <= 0) return "No checks left"
  return `${left} ${left === 1 ? "check" : "checks"} left`
}

function GradeSummary({ grade, changed }: { grade: PlanGrade; changed: boolean }) {
  return (
    <div role="status" className="flex flex-col gap-1.5 text-sm">
      <p className="font-medium">
        {grade.correct
          ? "Your plan is on track. Time to code it."
          : "Not quite yet. The notes under each field point the way."}
      </p>
      {grade.note ? (
        <p className="rounded-md border border-border bg-surface-2 px-2.5 py-2 text-xs text-muted">
          {grade.note}
        </p>
      ) : null}
      {changed ? (
        <p className="text-xs text-muted">You changed the plan since the last check.</p>
      ) : null}
    </div>
  )
}

/** The Plan card (Section 7.3). */
export function PlanCard() {
  const plan = useWorkspace((state) => state.plan)
  const checkedPlan = useWorkspace((state) => state.checkedPlan)
  const grade = useWorkspace((state) => state.planGrade)
  const checksLeft = useWorkspace((state) => state.checksLeft)
  const checking = useWorkspace((state) => state.checking)
  const planError = useWorkspace((state) => state.planError)
  const givenPattern = useWorkspace((state) => state.fading.givenPattern)
  const active = useWorkspace((state) => state.attemptStatus === "active")
  const ready = useWorkspace((state) => state.coach === "ready")
  const openedRungs = useWorkspace((state) => state.openedRungs)
  const revealed = useWorkspace(isPlanRevealed)
  const patterns = usePatterns()
  const structures = useStructures()
  const mac = useIsMac()
  const errorId = useId()

  const reveal = revealedPlan(grade, findRung(openedRungs, REVEAL_RUNG)?.reveal)
  const locked = !ready || !active || revealed
  const store = workspaceStore.getState
  const feedback = (field: PlanField) => feedbackFor(field, plan, checkedPlan, grade)
  const checksUsed = MAX_PLAN_CHECKS - checksLeft

  return (
    <section
      {...{ [PLAN_CARD_ATTR]: "" }}
      tabIndex={-1}
      aria-labelledby={PLAN_TITLE_ID}
      className="flex flex-col gap-3 rounded-lg border border-border bg-bg p-4 outline-none"
    >
      <div className="flex items-baseline gap-2">
        <h3 id={PLAN_TITLE_ID} className="text-base font-semibold">
          Plan
        </h3>
        <span className="ml-auto text-xs text-muted" data-testid="plan-checks-left">
          {revealed ? "Revealed" : checksLeftText(checksLeft)}
        </span>
      </div>
      {revealed && reveal ? (
        <ReferencePlan
          reveal={reveal}
          reason={
            grade?.reveal && checksUsed >= MAX_PLAN_CHECKS
              ? "Shown after your third check. Compare it with yours below."
              : "Shown because rung 3 is open. Compare it with yours below."
          }
          patterns={patterns.data}
          structures={structures.data}
        />
      ) : null}
      <form
        className="flex flex-col gap-3"
        aria-describedby={planError ? errorId : undefined}
        onSubmit={(event) => {
          event.preventDefault()
          void store().checkPlan()
        }}
      >
        <PatternField
          value={plan.pattern}
          patterns={patterns.data}
          disabled={locked}
          given={givenPattern !== null}
          feedback={feedback("pattern")}
          onChange={(pattern) => store().setPlan({ pattern })}
        />
        <StructuresField
          value={plan.structures}
          structures={structures.data}
          disabled={locked}
          feedback={feedback("structures")}
          onChange={(next) => store().setPlan({ structures: next })}
        />
        <div className="grid grid-cols-2 gap-3">
          <ComplexityField
            field="time"
            value={plan.time}
            common={COMMON_TIME}
            more={MORE_TIME}
            disabled={locked}
            feedback={feedback("time")}
            onChange={(time) => store().setPlan({ time })}
          />
          <ComplexityField
            field="space"
            value={plan.space}
            common={COMMON_SPACE}
            more={MORE_SPACE}
            disabled={locked}
            feedback={feedback("space")}
            onChange={(space) => store().setPlan({ space })}
          />
        </div>
        <TwistField
          value={plan.twist}
          disabled={locked}
          feedback={feedback("twist")}
          onChange={(twist) => store().setPlan({ twist })}
        />
        {grade && checkedPlan ? (
          <GradeSummary grade={grade} changed={!samePlan(plan, checkedPlan)} />
        ) : null}
        {locked ? null : (
          <Button
            type="submit"
            className="w-full"
            disabled={checking}
            aria-busy={checking}
            shortcut={mac === null ? undefined : formatHotkey(COACH_HOTKEYS.checkPlan, mac)}
          >
            {checking ? "Checking…" : "Check plan"}
          </Button>
        )}
        {planError ? (
          <p id={errorId} role="alert" className="text-sm text-error">
            {planError}
          </p>
        ) : null}
      </form>
    </section>
  )
}
