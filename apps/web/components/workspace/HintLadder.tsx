"use client"

import {
  ArrowUpRightIcon,
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  FlagIcon,
  ListPlusIcon,
  LockIcon,
  PlayIcon,
  TargetIcon,
} from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"

import { InlineMarkdown, Markdown } from "@/components/workspace/Markdown"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { usePatterns, useStructures, useToolkit } from "@/lib/api/hooks"
import type { HintContent, HintOf } from "@/lib/api/schemas"
import { formatHotkey, useHotkey, useIsMac } from "@/lib/keyboard"
import { cn } from "@/lib/utils"
import { insertLines } from "@/lib/workspace/editorBridge"
import { COACH_HOTKEYS } from "@/lib/workspace/hotkeys"
import { RUNGS, findRung, nextRung, type RungInfo } from "@/lib/workspace/ladder"
import { BRUTE_FORCE, familyColor, patternName } from "@/lib/workspace/plan"
import { signalTarget } from "@/lib/workspace/signals"
import { useWorkspace, workspaceStore } from "@/stores/workspace"

// The hint ladder (Section 7.4): six rungs, opened strictly in order. A rung's content
// arrives from the API only when it opens. Opening a counted rung asks for an inline
// confirm first (no modal); free rungs (fading, 11.6) open on the first click.

/** Rung 6's Copy button waits this long: "Try typing it yourself" (7.4). */
export const COPY_DELAY_SECONDS = 10

function confirmCopy(rung: number): string {
  if (rung === 6) {
    return "Rung 6 shows the full solution. The attempt then counts as solved with the solution, and it comes back for review sooner."
  }
  if (rung === 5) return "Rung 5 runs the reference solution step by step. It counts as a hint."
  return "Hints count toward this attempt, and a problem solved with fewer of them is scheduled for review later."
}

// ---------------------------------------------------------------- rung bodies

function ClarifyBody({ hint }: { hint: HintOf<1> }) {
  return <Markdown text={hint.clarify} className="flex flex-col gap-2" />
}

function SignalsBody({ hint }: { hint: HintOf<2> }) {
  const patterns = usePatterns()
  const toolkit = useToolkit()
  const structures = useStructures()
  const target = (pointsTo: string) => {
    const { kind, id } = signalTarget(pointsTo)
    if (kind === "toolkit") {
      const tool = toolkit.data?.find((card) => card.id === id)?.tool
      return { label: tool ?? id, mono: true, family: null }
    }
    if (kind === "structure") {
      return {
        label: structures.data?.find((item) => item.id === id)?.label ?? id,
        mono: false,
        family: null,
      }
    }
    const pattern = patterns.data?.find((item) => item.id === id)
    return { label: pattern?.name ?? id, mono: false, family: pattern?.family ?? null }
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-start gap-2 rounded-md bg-surface-2 px-2.5 py-2 text-sm">
        <TargetIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
        <span>
          <InlineMarkdown text={hint.constraintReading} />
        </span>
      </p>
      <ul className="flex flex-col gap-3" aria-label="Signals">
        {hint.signals.map((signal) => {
          const points = target(signal.pointsTo)
          return (
            <li key={signal.phrase} className="flex flex-col gap-1">
              <p className="text-sm font-medium">
                <mark
                  className="rounded-sm px-0.5 text-text"
                  style={{
                    backgroundColor: `color-mix(in srgb, ${familyColor(points.family ?? "signal")} 22%, transparent)`,
                  }}
                >
                  “{signal.phrase}”
                </mark>
              </p>
              <p className="text-sm text-muted">{signal.meaning}</p>
              <p className="text-xs text-muted">
                Points to{" "}
                <span className={cn("text-text", points.mono && "font-mono")}>{points.label}</span>
              </p>
            </li>
          )
        })}
      </ul>
      <p className="text-xs text-muted">These phrases are now highlighted in the problem.</p>
    </div>
  )
}

function ApproachBody({ hint }: { hint: HintOf<3> }) {
  const patterns = usePatterns()
  const pattern = patterns.data?.find((item) => item.id === hint.patternId)
  const name = patternName(hint.patternId, patterns.data) ?? hint.patternId
  return (
    <div className="flex flex-col gap-3">
      {hint.patternId === BRUTE_FORCE ? (
        <span className="w-fit rounded-full border border-border px-2.5 py-0.5 text-xs">
          {name}
        </span>
      ) : (
        <Link
          href={`/patterns/${hint.patternId}`}
          className="inline-flex w-fit items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-xs font-medium hover:border-accent"
        >
          <span
            aria-hidden
            className="size-1.5 rounded-full"
            style={{ backgroundColor: familyColor(pattern?.family) }}
          />
          {name}
          <ArrowUpRightIcon aria-hidden className="size-3 text-muted" />
          <span className="sr-only">(pattern page)</span>
        </Link>
      )}
      <Markdown text={hint.approach} className="flex flex-col gap-2 text-sm" />
      <div className="flex flex-col gap-1 border-l-2 border-border pl-3">
        <p className="text-xs font-medium text-muted">Why not the obvious route</p>
        <Markdown text={hint.whyNot} className="flex flex-col gap-2 text-sm" />
      </div>
    </div>
  )
}

/** Slot text as a Python comment: backticks around identifiers are dropped. */
export function slotComment(label: string, text: string): string {
  return `# ${label}: ${text.replace(/`([^`]*)`/g, "$1")}`
}

function PlanBody({ hint }: { hint: HintOf<4> }) {
  const [status, setStatus] = useState<"idle" | "done" | "no-editor">("idle")
  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col gap-2">
        {hint.slots.map((slot, index) => (
          <li key={slot.id} className="grid grid-cols-[auto_1fr] gap-x-2 text-sm">
            <span className="font-mono text-xs leading-5 text-muted">{index + 1}</span>
            <div>
              <span className="font-medium">{slot.label}. </span>
              <InlineMarkdown text={slot.text} />
            </div>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            const done = insertLines(hint.slots.map((slot) => slotComment(slot.label, slot.text)))
            setStatus(done ? "done" : "no-editor")
          }}
        >
          <ListPlusIcon />
          Insert as comments
        </Button>
        <span role="status" className="text-xs text-muted">
          {status === "done"
            ? "Added at your cursor. ⌘Z takes them out."
            : status === "no-editor"
              ? "The code editor isn't ready yet."
              : null}
        </span>
      </div>
    </div>
  )
}

function WalkthroughBody() {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted">
        The walkthrough opens in the panel under the editor, on the first example.
      </p>
      <Button
        size="sm"
        variant="secondary"
        className="w-fit"
        onClick={() => void workspaceStore.getState().showWalkthrough()}
      >
        <PlayIcon />
        Show the walkthrough
      </Button>
    </div>
  )
}

function useCountdown(seconds: number): number {
  const [left, setLeft] = useState(seconds)
  useEffect(() => {
    if (left <= 0) return
    const timer = setTimeout(() => setLeft((value) => value - 1), 1000)
    return () => clearTimeout(timer)
  }, [left])
  return left
}

function SolutionBody({ hint, canEnd }: { hint: HintOf<6>; canEnd: boolean }) {
  const left = useCountdown(COPY_DELAY_SECONDS)
  const [copied, setCopied] = useState(false)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const ending = useWorkspace((state) => state.ending)
  return (
    <div className="flex flex-col gap-3">
      <Markdown text={hint.explanation} className="flex flex-col gap-2 text-sm" />
      <div className="overflow-hidden rounded-md border border-border">
        <div className="flex h-8 items-center justify-between border-b border-border bg-surface-2 pr-1 pl-3">
          <span className="text-xs text-muted">Solution</span>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs"
            disabled={left > 0}
            onClick={() => {
              void navigator.clipboard
                ?.writeText(hint.code)
                .then(() => setCopied(true))
                .catch(() => setCopied(false))
            }}
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
            {left > 0 ? `Try typing it yourself (${left})` : copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <pre
          tabIndex={0}
          aria-label="Solution code"
          className="max-h-80 overflow-auto bg-bg p-3 font-mono text-xs leading-5"
        >
          <code>{hint.code}</code>
        </pre>
      </div>
      {hint.toolkit.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-muted">Python tools it uses</p>
          <ul className="flex flex-col gap-2">
            {hint.toolkit.map((card) => (
              <li key={card.id} className="rounded-md bg-surface-2 px-2.5 py-2 text-sm">
                <code className="font-mono text-accent">{card.tool}</code>
                <span className="text-muted"> for “{card.phrases[0]}”</span>
                <pre className="mt-1 font-mono text-xs whitespace-pre-wrap text-muted">
                  {card.example}
                </pre>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {canEnd ? (
        <>
          <Button
            size="sm"
            variant="secondary"
            className="w-fit"
            disabled={ending}
            onClick={() => setConfirmEnd(true)}
          >
            <FlagIcon />
            End attempt
          </Button>
          <EndAttemptDialog open={confirmEnd} onOpenChange={setConfirmEnd} />
        </>
      ) : null}
    </div>
  )
}

/** Confirm for "End attempt" (7.9): it records the attempt as not solved. */
export function EndAttemptDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogTitle>End this attempt?</AlertDialogTitle>
        <AlertDialogDescription>
          It counts as not solved yet, and the problem comes back for review soon so you can try it
          fresh. Your code stays here.
        </AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep going</AlertDialogCancel>
          <AlertDialogAction onClick={() => void workspaceStore.getState().end()}>
            End attempt
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function RungBody({ hint, canEnd }: { hint: HintContent; canEnd: boolean }) {
  switch (hint.rung) {
    case 1:
      return <ClarifyBody hint={hint} />
    case 2:
      return <SignalsBody hint={hint} />
    case 3:
      return <ApproachBody hint={hint} />
    case 4:
      return <PlanBody hint={hint} />
    case 5:
      return <WalkthroughBody />
    case 6:
      return <SolutionBody hint={hint} canEnd={canEnd} />
  }
}

// ---------------------------------------------------------------- rungs

type RungState = "opened" | "next" | "locked"

function RungNumber({ rung, state }: { rung: number; state: RungState }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-full border font-mono text-xs transition-colors",
        state === "opened" && "border-accent bg-accent text-on-accent",
        state === "next" && "border-accent text-accent",
        state === "locked" && "border-border text-muted"
      )}
    >
      {rung}
    </span>
  )
}

function Rung({
  info,
  hint,
  state,
  free,
  active,
  opening,
  confirming,
  canEnd,
  onAsk,
  onCancel,
  onOpen,
}: {
  info: RungInfo
  hint: HintContent | undefined
  state: RungState
  free: boolean
  active: boolean
  opening: boolean
  confirming: boolean
  canEnd: boolean
  onAsk: () => void
  onCancel: () => void
  onOpen: () => void
}) {
  const [expanded, setExpanded] = useState(true)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const itemRef = useRef<HTMLLIElement>(null)
  const wasOpened = useRef(state === "opened")

  // A rung opened just now scrolls into view once its content has grown in.
  useEffect(() => {
    const opened = state === "opened"
    if (!opened || wasOpened.current) {
      wasOpened.current = opened
      return
    }
    wasOpened.current = true
    const timer = setTimeout(() => itemRef.current?.scrollIntoView?.({ block: "nearest" }), 200)
    return () => clearTimeout(timer)
  }, [state])
  const bodyId = `rung-${info.rung}-body`
  const label = `Rung ${info.rung}, ${info.name}`

  useEffect(() => {
    if (confirming) confirmRef.current?.focus()
  }, [confirming])

  let header: React.ReactNode
  const title = (
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="flex items-center gap-2 text-sm font-medium">
        {info.name}
        {free ? (
          <span className="rounded-full bg-surface-2 px-1.5 text-[11px] font-medium text-muted">
            Free
          </span>
        ) : null}
      </span>
      {state === "opened" ? null : <span className="text-xs text-muted">{info.blurb}</span>}
    </span>
  )
  if (state === "opened") {
    header = (
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={bodyId}
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center gap-3 rounded-md px-1 py-1.5 text-left hover:bg-surface-2"
      >
        <RungNumber rung={info.rung} state={state} />
        <span className="sr-only">{label}, opened</span>
        <span aria-hidden className="contents">
          {title}
        </span>
        <ChevronDownIcon
          aria-hidden
          className={cn(
            "size-4 shrink-0 text-muted transition-transform",
            !expanded && "-rotate-90"
          )}
        />
      </button>
    )
  } else if (state === "next" && active) {
    header = (
      <button
        type="button"
        aria-expanded={confirming}
        aria-busy={opening}
        disabled={opening}
        onClick={confirming ? onCancel : free ? onOpen : onAsk}
        className="group flex w-full items-center gap-3 rounded-md px-1 py-1.5 text-left hover:bg-surface-2 disabled:opacity-70"
      >
        <RungNumber rung={info.rung} state={state} />
        <span className="sr-only">Open {label}</span>
        <span aria-hidden className="contents">
          {title}
        </span>
        <span
          aria-hidden
          className="shrink-0 text-xs font-medium text-accent group-hover:underline"
        >
          {opening ? "Opening…" : "Open"}
        </span>
      </button>
    )
  } else {
    header = (
      <div className="flex items-center gap-3 px-1 py-1.5 opacity-70" aria-disabled="true">
        <RungNumber rung={info.rung} state="locked" />
        <span className="sr-only">
          {label}, {active ? `opens after rung ${info.rung - 1}` : "locked"}
        </span>
        <span aria-hidden className="contents">
          {title}
        </span>
        <LockIcon aria-hidden className="size-3.5 shrink-0 text-muted" />
      </div>
    )
  }

  return (
    <li ref={itemRef} className="flex flex-col" data-rung={info.rung} data-state={state}>
      {header}
      <AnimatePresence initial={false}>
        {confirming ? (
          <motion.div
            key="confirm"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div
              role="group"
              aria-label={`Confirm opening ${info.name}`}
              className="mt-1 ml-9 flex flex-col gap-2 rounded-md border border-border bg-surface-2 p-3"
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.stopPropagation()
                  onCancel()
                }
              }}
            >
              <p className="text-sm">{confirmCopy(info.rung)}</p>
              <div className="flex gap-2">
                <Button ref={confirmRef} size="sm" disabled={opening} onClick={onOpen}>
                  {opening ? "Opening…" : `Open ${info.name.toLowerCase()}`}
                </Button>
                <Button size="sm" variant="ghost" onClick={onCancel}>
                  Not yet
                </Button>
              </div>
            </div>
          </motion.div>
        ) : null}
        {hint && expanded ? (
          <motion.div
            key="body"
            id={bodyId}
            role="region"
            aria-label={label}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="pt-1 pr-1 pb-3 pl-10 text-sm leading-6">
              <RungBody hint={hint} canEnd={canEnd} />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </li>
  )
}

/** The hint ladder (Section 7.4). */
export function HintLadder() {
  const opened = useWorkspace((state) => state.openedRungs)
  const openingRung = useWorkspace((state) => state.openingRung)
  const hintError = useWorkspace((state) => state.hintError)
  const freeRungs = useWorkspace((state) => state.fading.freeRungs)
  const active = useWorkspace(
    (state) => state.attemptStatus === "active" && state.coach === "ready"
  )
  const canEnd = useWorkspace((state) => state.mode === "user" && state.attemptStatus === "active")
  const [confirming, setConfirming] = useState<number | null>(null)
  const mac = useIsMac()
  const next = nextRung(opened)

  const open = (rung: number) => {
    void workspaceStore
      .getState()
      .openRung(rung)
      .then(() => setConfirming(null))
  }
  const ask = (rung: number) => {
    if (freeRungs.includes(rung)) open(rung)
    else setConfirming(rung)
  }

  // ⌘⇧H (17.4): ask for the next rung; the confirm takes focus, so Enter opens it.
  useHotkey(
    COACH_HOTKEYS.nextHint,
    () => {
      if (next === null || !active) return
      if (confirming === next) open(next)
      else ask(next)
    },
    { enabled: active && next !== null, stopPropagation: true, ignoreInDialogs: true }
  )

  return (
    <section
      aria-labelledby="hint-ladder-title"
      className="flex flex-col gap-2 rounded-lg border border-border bg-bg px-3 pt-4 pb-2"
    >
      <div className="flex items-baseline gap-2 px-1">
        <h3 id="hint-ladder-title" className="text-base font-semibold">
          Hints
        </h3>
        {next !== null && active ? (
          <span className="ml-auto text-xs text-muted">
            Next hint{" "}
            {mac === null ? null : (
              <kbd className="font-mono">{formatHotkey(COACH_HOTKEYS.nextHint, mac)}</kbd>
            )}
          </span>
        ) : null}
      </div>
      <ol className="flex flex-col">
        {RUNGS.map((info) => {
          const hint = findRung(opened, info.rung)
          const state: RungState = hint ? "opened" : info.rung === next ? "next" : "locked"
          return (
            <Rung
              key={info.rung}
              info={info}
              hint={hint}
              state={state}
              free={freeRungs.includes(info.rung)}
              active={active}
              opening={openingRung === info.rung}
              confirming={confirming === info.rung && state === "next"}
              canEnd={canEnd}
              onAsk={() => ask(info.rung)}
              onCancel={() => setConfirming(null)}
              onOpen={() => open(info.rung)}
            />
          )
        })}
      </ol>
      {hintError ? (
        <p role="alert" className="text-sm text-error">
          {hintError}
        </p>
      ) : null}
    </section>
  )
}
