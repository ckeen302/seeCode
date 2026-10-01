"use client"

import { FootprintsIcon } from "lucide-react"

import type { WalkthroughInput, WalkthroughPayload } from "@/lib/api/schemas"
import { argumentNames } from "@/lib/workspace/customCases"
import { formatValueForDisplay } from "@/lib/workspace/format"

// Where the walkthrough player (Section 8.6) goes: hint rung 5 and "See it run" after a solve
// both show it in the bottom panel's Walkthrough tab. Until the player lands (M4), this card
// lists the inputs it will run and says what the walkthrough does, without showing any of the
// solution. The player keeps this file's name and props: `{ payload: WalkthroughPayload }`.

const MAX_VALUE_CHARS = 200

function value(item: unknown): string {
  const { text, truncated } = formatValueForDisplay(item, MAX_VALUE_CHARS)
  return truncated ? `${text}…` : text
}

function InputLines({ input, names }: { input: WalkthroughInput; names: string[] }) {
  if (input.ops) {
    return (
      <span className="block">
        {input.ops.length} {input.ops.length === 1 ? "call" : "calls"}:{" "}
        {input.ops.map((op) => String(op[0])).join(", ")}
      </span>
    )
  }
  return (
    <>
      {(input.args ?? []).map((arg, index) => (
        <span key={index} className="block">
          <span className="text-muted">{names[index]} = </span>
          {value(arg)}
        </span>
      ))}
    </>
  )
}

/** What the walkthrough does, in words that give nothing of the solution away. */
export function describe(moments: number, predictions: number): string {
  let text =
    "The reference solution runs on real data, one step at a time. You watch what it keeps track of change, with a one-line reason for every step"
  if (moments > 0) {
    text += `, and ${moments} key ${moments === 1 ? "moment" : "moments"} marked on the timeline`
  }
  text += "."
  if (predictions > 0) {
    text += ` Before some steps you predict what happens next (${predictions} ${predictions === 1 ? "question" : "questions"}).`
  }
  return text
}

export function WalkthroughSlot({ payload }: { payload: WalkthroughPayload }) {
  const argCount = payload.inputs.find((input) => input.args)?.args?.length ?? 0
  const names = argumentNames(payload.code, payload.entry, argCount)
  const moments = payload.viz.events.length
  const predictions = payload.viz.predict.length
  return (
    <section
      aria-labelledby="walkthrough-slot-title"
      className="flex max-w-2xl flex-col gap-3 rounded-lg border border-border bg-bg p-4"
    >
      <div className="flex items-center gap-2">
        <FootprintsIcon aria-hidden className="size-4 text-accent" />
        <h3 id="walkthrough-slot-title" className="text-sm font-semibold">
          Step-through walkthrough
        </h3>
      </div>
      <p className="text-sm text-muted">{describe(moments, predictions)}</p>
      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium text-muted">Inputs</p>
        <ul className="flex flex-col gap-2" aria-label="Walkthrough inputs">
          {payload.inputs.map((input) => (
            <li key={input.label} className="rounded-md border border-border bg-surface p-2.5">
              <p className="text-xs font-medium">{input.label}</p>
              <p className="mt-1 font-mono text-xs break-words">
                <InputLines input={input} names={names} />
              </p>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-muted">The interactive player arrives in the next update.</p>
    </section>
  )
}
