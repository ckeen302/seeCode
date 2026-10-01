"use client"

import { Fragment } from "react"

import { splitBySignals } from "@/components/drills/highlight"
import { renderInline } from "@/components/workspace/Markdown"
import type { ProblemCard } from "@/lib/api/drills"
import type { Signal } from "@/lib/api/schemas"

function Highlighted({ text, signals }: { text: string; signals: readonly Signal[] }) {
  const parts = splitBySignals(
    text,
    signals.map((s) => s.phrase)
  )
  return (
    <>
      {parts.map((part, index) =>
        part.signal === null ? (
          <Fragment key={index}>{renderInline(part.text)}</Fragment>
        ) : (
          <mark
            key={index}
            className="rounded-sm bg-signal px-0.5 text-text"
            title={signals[part.signal]?.meaning}
          >
            {part.text}
            <sup className="ml-0.5 font-mono text-[10px] text-muted">{part.signal + 1}</sup>
          </mark>
        )
      )}
    </>
  )
}

/** A problem statement with its title hidden (recognition drills and plan reviews). */
export function ProblemStatement({
  card,
  signals = [],
}: {
  card: ProblemCard
  signals?: readonly Signal[]
}) {
  const paragraphs = card.summary.trim().split(/\n\s*\n/)
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 leading-7">
        {paragraphs.map((paragraph, index) => (
          <p key={index}>
            <Highlighted text={paragraph} signals={signals} />
          </p>
        ))}
      </div>
      {card.examples.length ? (
        <div className="flex flex-col gap-2">
          {card.examples.map((example, index) => (
            <div
              key={index}
              className="rounded-md border border-border bg-bg p-3 font-mono text-sm leading-6"
            >
              <div className="mb-1 font-sans text-xs font-medium text-muted">
                Example {index + 1}
              </div>
              <div className="break-words whitespace-pre-wrap">
                <span className="text-muted">Input: </span>
                {example.input}
              </div>
              <div className="break-words whitespace-pre-wrap">
                <span className="text-muted">Output: </span>
                {example.output}
              </div>
              {example.explanation ? (
                <div className="mt-1 font-sans text-sm text-muted">
                  {renderInline(example.explanation)}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {card.constraints.length ? (
        <div className="flex flex-col gap-1.5">
          <div className="text-xs font-medium text-muted">Constraints</div>
          <ul className="flex flex-col gap-1 text-sm">
            {card.constraints.map((constraint) => (
              <li key={constraint} className="flex gap-2">
                <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-muted" />
                <span>
                  <Highlighted text={constraint} signals={signals} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        Target
        <span className="rounded-full border border-border px-2 py-0.5 font-mono text-text">
          time {card.targets.time}
        </span>
        <span className="rounded-full border border-border px-2 py-0.5 font-mono text-text">
          space {card.targets.space}
        </span>
      </div>
    </div>
  )
}
