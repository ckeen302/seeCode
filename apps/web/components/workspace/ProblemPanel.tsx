"use client"

import { ArrowUpRightIcon, CircleCheckIcon } from "lucide-react"

import { DifficultyChip } from "@/components/problems/DifficultyChip"
import { InlineMarkdown, Markdown } from "@/components/workspace/Markdown"
import type { ProblemPublic } from "@/lib/api/schemas"
import { useWorkspace } from "@/stores/workspace"

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xs font-medium tracking-wide text-muted uppercase">{children}</h2>
}

/** Section 7.2: the statement, examples, constraints and targets. Signals arrive in M3. */
export function ProblemPanel({ problem }: { problem: ProblemPublic }) {
  const solved = useWorkspace((state) => state.solved)

  return (
    <section
      aria-label="Problem"
      className="h-full overflow-y-auto bg-surface px-5 pt-5 pb-8 text-base"
    >
      <div className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold tracking-tight">{problem.title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <DifficultyChip difficulty={problem.difficulty} />
          {solved ? (
            <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-border px-2.5 text-xs font-medium">
              <CircleCheckIcon aria-hidden className="size-3.5 text-good" />
              Solved
            </span>
          ) : null}
          <a
            href={problem.leetcodeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex items-center gap-1 rounded-md text-sm text-muted hover:text-text"
          >
            Open on LeetCode
            <ArrowUpRightIcon aria-hidden className="size-3.5" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </div>
      </div>

      <Markdown text={problem.summary} className="mt-5 flex flex-col gap-3 leading-6" />

      <div className="mt-6 flex flex-col gap-3">
        <SectionTitle>Examples</SectionTitle>
        <ol className="flex flex-col gap-3">
          {problem.examples.map((example, index) => (
            <li key={index} className="rounded-lg border border-border bg-bg p-3">
              <p className="text-xs font-medium text-muted">Example {index + 1}</p>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-sm">
                <dt className="text-muted">Input</dt>
                <dd className="min-w-0 break-words whitespace-pre-wrap">{example.input}</dd>
                <dt className="text-muted">Output</dt>
                <dd className="min-w-0 break-words whitespace-pre-wrap">{example.output}</dd>
              </dl>
              {example.explanation ? (
                <p className="mt-2 text-sm text-muted">
                  <InlineMarkdown text={example.explanation} />
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      </div>

      <div className="mt-6 flex flex-col gap-3">
        <SectionTitle>Constraints</SectionTitle>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
          {problem.constraints.map((constraint, index) => (
            <li key={index}>
              <InlineMarkdown text={constraint} />
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-6 flex flex-col gap-3">
        <SectionTitle>Targets</SectionTitle>
        <ul className="flex flex-wrap gap-2" aria-label="Complexity targets">
          <li className="inline-flex h-6 items-center rounded-full border border-border bg-surface-2 px-2.5 font-mono text-xs">
            {problem.targets.time} time
          </li>
          <li className="inline-flex h-6 items-center rounded-full border border-border bg-surface-2 px-2.5 font-mono text-xs">
            {problem.targets.space} space
          </li>
        </ul>
      </div>
    </section>
  )
}
