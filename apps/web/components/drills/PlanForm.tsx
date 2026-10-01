"use client"

import { useId } from "react"

import { FieldResultBadge } from "@/components/drills/FieldResultBadge"
import type {
  Complexity,
  PatternSummary,
  PlanCard,
  PlanField,
  PlanGrade,
  Structure,
} from "@/lib/api/schemas"
import { cn } from "@/lib/utils"
import {
  COMMON_SPACE,
  COMMON_TIME,
  MAX_STRUCTURES,
  MAX_TWIST_CHARS,
  MORE_SPACE,
  MORE_TIME,
  NOT_SURE,
  patternOptions,
} from "@/lib/workspace/plan"

// The compact Plan card of drills and reviews (Sections 6.6 and 6.7): pattern, structures,
// time and space as native radios and checkboxes styled as chips (arrow keys move within a
// group), and an optional twist. After answering, each field shows its result badge.

const chip =
  "relative inline-flex h-8 cursor-pointer items-center rounded-md border border-border bg-surface px-2.5 text-sm transition-colors select-none hover:bg-surface-2 has-[:checked]:border-accent has-[:checked]:bg-window has-[:checked]:text-text has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent has-[:disabled]:cursor-default has-[:disabled]:hover:bg-surface"

function FieldShell({
  legend,
  result,
  hint,
  children,
}: {
  legend: string
  result?: PlanGrade["fields"][PlanField]["result"]
  hint?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-2 flex w-full items-center justify-between gap-2 text-xs font-medium text-muted">
        <span>{legend}</span>
        {result ? <FieldResultBadge result={result} /> : null}
      </legend>
      {children}
      {hint ? <div className="text-xs text-muted">{hint}</div> : null}
    </fieldset>
  )
}

function RadioChips<T extends string>({
  name,
  options,
  value,
  onChange,
  disabled,
  correct,
  mono = false,
}: {
  name: string
  options: { value: T; label: string }[]
  value: T | null
  onChange: (value: T) => void
  disabled?: boolean
  correct?: string | null
  mono?: boolean
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => (
        <label
          key={option.value}
          className={cn(
            chip,
            mono && "font-mono",
            disabled && correct === option.value && "border-good"
          )}
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            disabled={disabled}
            className="sr-only"
          />
          {option.label}
        </label>
      ))}
    </div>
  )
}

function complexityOptions(common: readonly Complexity[], more: readonly Complexity[]) {
  return { common: [...common, NOT_SURE], more: [...more] }
}

function ComplexityField({
  name,
  legend,
  value,
  onChange,
  disabled,
  common,
  more,
  result,
  correct,
}: {
  name: string
  legend: string
  value: Complexity | null
  onChange: (value: Complexity) => void
  disabled?: boolean
  common: readonly Complexity[]
  more: readonly Complexity[]
  result?: PlanGrade["fields"]["time"]["result"]
  correct?: string | null
}) {
  const id = useId()
  const { common: shown, more: rest } = complexityOptions(common, more)
  const inMore = value !== null && rest.includes(value)
  return (
    <FieldShell legend={legend} result={result}>
      <RadioChips
        name={name}
        options={shown.map((c) => ({ value: c, label: c }))}
        value={inMore ? null : value}
        onChange={onChange}
        disabled={disabled}
        correct={correct}
        mono
      />
      {rest.length ? (
        <div className="flex items-center gap-2">
          <label htmlFor={id} className="text-xs text-muted">
            More
          </label>
          <select
            id={id}
            value={inMore ? (value ?? "") : ""}
            onChange={(event) => event.target.value && onChange(event.target.value as Complexity)}
            disabled={disabled}
            className="h-8 rounded-md border border-border bg-surface px-2 font-mono text-sm"
          >
            <option value="">–</option>
            {rest.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </FieldShell>
  )
}

export function PlanForm({
  plan,
  onChange,
  patterns,
  structures,
  grade,
  disabled = false,
  namePrefix = "plan",
}: {
  plan: PlanCard
  onChange: (plan: PlanCard) => void
  patterns: readonly PatternSummary[]
  structures: readonly Structure[]
  grade?: PlanGrade | null
  disabled?: boolean
  namePrefix?: string
}) {
  const twistId = useId()
  const reveal = grade?.reveal ?? null
  const set = <K extends keyof PlanCard>(key: K, value: PlanCard[K]) =>
    onChange({ ...plan, [key]: value })
  const full = plan.structures.length >= MAX_STRUCTURES

  return (
    <div className="flex flex-col gap-5">
      <FieldShell legend="Pattern" result={grade?.fields.pattern.result}>
        <RadioChips
          name={`${namePrefix}-pattern`}
          options={patternOptions(patterns).map((p) => ({ value: p.id, label: p.name }))}
          value={plan.pattern}
          onChange={(value) => set("pattern", value)}
          disabled={disabled}
          correct={reveal?.patternId}
        />
      </FieldShell>

      <FieldShell
        legend={`Structures (up to ${MAX_STRUCTURES})`}
        result={grade?.fields.structures.result}
      >
        <div className="flex flex-wrap gap-1.5">
          {structures.map((structure) => {
            const checked = plan.structures.includes(structure.id)
            return (
              <label
                key={structure.id}
                className={cn(
                  chip,
                  disabled && reveal?.structures.includes(structure.id) && "border-good"
                )}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={checked}
                  disabled={disabled || (!checked && full)}
                  onChange={() =>
                    set(
                      "structures",
                      checked
                        ? plan.structures.filter((id) => id !== structure.id)
                        : [...plan.structures, structure.id]
                    )
                  }
                />
                {structure.label}
              </label>
            )
          })}
        </div>
      </FieldShell>

      <div className="grid grid-cols-1 gap-5 min-[1200px]:grid-cols-2">
        <ComplexityField
          name={`${namePrefix}-time`}
          legend="Time"
          value={plan.time}
          onChange={(value) => set("time", value)}
          disabled={disabled}
          common={COMMON_TIME}
          more={MORE_TIME}
          result={grade?.fields.time.result}
          correct={reveal?.time}
        />
        <ComplexityField
          name={`${namePrefix}-space`}
          legend="Space"
          value={plan.space}
          onChange={(value) => set("space", value)}
          disabled={disabled}
          common={COMMON_SPACE}
          more={MORE_SPACE}
          result={grade?.fields.space.result}
          correct={reveal?.space}
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={twistId} className="text-xs font-medium text-muted">
            Twist <span className="font-normal">(optional)</span>
          </label>
          {grade && plan.twist.trim() ? (
            <FieldResultBadge result={grade.fields.twist.result} />
          ) : null}
        </div>
        <input
          id={twistId}
          type="text"
          value={plan.twist}
          maxLength={MAX_TWIST_CHARS}
          onChange={(event) => set("twist", event.target.value)}
          disabled={disabled}
          placeholder="What changes from the plain pattern?"
          className="h-9 rounded-md border border-border bg-surface px-3 text-sm placeholder:text-muted disabled:opacity-70"
        />
      </div>
    </div>
  )
}
