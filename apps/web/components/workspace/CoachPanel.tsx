"use client"

import {
  ArrowUpRightIcon,
  CircleCheckIcon,
  EllipsisIcon,
  FlagIcon,
  GraduationCapIcon,
  LightbulbIcon,
  LogInIcon,
  RotateCcwIcon,
  RotateCwIcon,
} from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import Link from "next/link"
import { useState } from "react"

import { EndAttemptDialog, HintLadder } from "@/components/workspace/HintLadder"
import { PlanCard, focusPlanCard } from "@/components/workspace/PlanCard"
import { WrapUpPanel } from "@/components/workspace/WrapUpPanel"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { usePatterns } from "@/lib/api/hooks"
import { canCheckPlan, patternName } from "@/lib/workspace/plan"
import { OUTCOME_COPY } from "@/lib/workspace/wrapup"
import { isSolvedAttempt, useWorkspace, workspaceStore } from "@/stores/workspace"

// The coach column (Section 7.1): the Plan card, the hint ladder and, after a passing
// Submit, the wrap-up sliding over them. Also the attempt's menu (Start over, End attempt),
// the plan-first tip, and the guest's "Save your progress".

function StartOverDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const active = useWorkspace((state) => state.attemptStatus === "active")
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogTitle>Start over?</AlertDialogTitle>
        <AlertDialogDescription>
          {active
            ? "You get the starter code, an empty plan and closed hints. This attempt is set aside and won't count."
            : "You get the starter code, an empty plan and closed hints, for a fresh try at this problem."}
        </AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => void workspaceStore.getState().restart()}>
            Start over
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function AttemptMenu() {
  const ready = useWorkspace((state) => state.coach === "ready")
  const canEnd = useWorkspace((state) => state.mode === "user" && state.attemptStatus === "active")
  const busy = useWorkspace((state) => state.restarting || state.ending)
  const [dialog, setDialog] = useState<"restart" | "end" | null>(null)
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted hover:text-text"
            aria-label="Attempt options"
            disabled={!ready || busy}
          >
            <EllipsisIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setDialog("restart")}>
            <RotateCcwIcon />
            Start over
          </DropdownMenuItem>
          {canEnd ? (
            <DropdownMenuItem onSelect={() => setDialog("end")}>
              <FlagIcon />
              End attempt
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <StartOverDialog
        open={dialog === "restart"}
        onOpenChange={(open) => setDialog(open ? "restart" : null)}
      />
      <EndAttemptDialog
        open={dialog === "end"}
        onOpenChange={(open) => setDialog(open ? "end" : null)}
      />
    </>
  )
}

function SyncStatus() {
  const show = useWorkspace(
    (state) => state.mode === "user" && state.coach === "ready" && state.attemptStatus === "active"
  )
  const dirty = useWorkspace((state) => state.dirty)
  if (!show) return null
  return (
    <span className="text-xs text-muted" data-testid="sync-status">
      {dirty ? "Saving…" : "Saved"}
    </span>
  )
}

/** Section 7.3: the first Run before any plan check suggests checking the plan first. */
function RunTip() {
  const show = useWorkspace((state) => state.runTip)
  return (
    <AnimatePresence initial={false}>
      {show ? (
        <motion.div
          key="run-tip"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          role="status"
          className="flex flex-col gap-2 rounded-lg border border-accent/40 bg-accent/5 p-3"
        >
          <p className="flex items-start gap-2 text-sm">
            <LightbulbIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
            Planning first helps it stick. Check your plan?
          </p>
          <div className="flex gap-2 pl-6">
            <Button
              size="sm"
              onClick={() => {
                const store = workspaceStore.getState()
                if (canCheckPlan(store.plan)) void store.checkPlan()
                else {
                  store.dismissRunTip()
                  focusPlanCard()
                }
              }}
            >
              Check plan
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => workspaceStore.getState().skipPlanTip()}
            >
              Skip
            </Button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

/** Section 11.6: the first problem of a pattern gives the pattern and links its page. */
function NewPatternNote({ patternId }: { patternId: string }) {
  const patterns = usePatterns()
  const name = patternName(patternId, patterns.data) ?? "this pattern"
  return (
    <section
      aria-label="New pattern"
      className="flex items-start gap-2 rounded-lg border border-border bg-bg p-3 text-sm"
    >
      <GraduationCapIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
      <div className="flex flex-col gap-1">
        <p>
          Your first <span className="font-medium">{name}</span> problem: the pattern is given, and
          the first two hints are open and free.
        </p>
        <Link
          href={`/patterns/${patternId}`}
          className="inline-flex w-fit items-center gap-1 text-muted hover:text-text"
        >
          Read the pattern page
          <ArrowUpRightIcon aria-hidden className="size-3.5" />
        </Link>
      </div>
    </section>
  )
}

function StatusCards() {
  const notice = useWorkspace((state) => state.notice)
  const submitError = useWorkspace((state) => state.submitError)
  const submitting = useWorkspace((state) => state.submitting)
  const outcome = useWorkspace((state) => state.outcome)
  const solved = useWorkspace(isSolvedAttempt)
  const wrapUp = useWorkspace((state) => state.wrapUp)
  const wrapUpOpen = useWorkspace((state) => state.wrapUpOpen)
  const finished = useWorkspace((state) => state.attemptStatus === "finished")
  const [restart, setRestart] = useState(false)

  return (
    <>
      {notice ? (
        <p role="status" className="rounded-lg border border-border bg-bg p-3 text-sm">
          {notice}
        </p>
      ) : null}
      {submitting ? (
        <p role="status" className="text-sm text-muted">
          Saving your solve…
        </p>
      ) : null}
      {submitError ? (
        <div role="alert" className="flex flex-col gap-2 rounded-lg border border-error/50 p-3">
          <p className="text-sm">{submitError}</p>
          <Button
            size="sm"
            variant="secondary"
            className="w-fit"
            onClick={() => void workspaceStore.getState().retrySubmit()}
          >
            <RotateCwIcon />
            Try again
          </Button>
        </div>
      ) : null}
      {wrapUp && !wrapUpOpen ? (
        <div className="flex items-center gap-2 rounded-lg border border-border border-l-2 border-l-good bg-bg p-3">
          <CircleCheckIcon aria-hidden className="size-4 text-good" />
          <p className="flex-1 text-sm font-medium">Solved.</p>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => workspaceStore.getState().setWrapUpOpen(true)}
          >
            Show wrap-up
          </Button>
        </div>
      ) : null}
      {finished && !solved && outcome ? (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-bg p-3">
          <p className="text-sm">{OUTCOME_COPY[outcome]}</p>
          <Button size="sm" variant="secondary" className="w-fit" onClick={() => setRestart(true)}>
            <RotateCcwIcon />
            Start over
          </Button>
          <StartOverDialog open={restart} onOpenChange={setRestart} />
        </div>
      ) : null}
    </>
  )
}

function GuestSave() {
  return (
    <section
      aria-labelledby="guest-save-title"
      className="flex flex-col gap-2 rounded-lg border border-border bg-bg p-3"
    >
      <h3 id="guest-save-title" className="text-sm font-semibold">
        Save your progress
      </h3>
      <p className="text-sm text-muted">
        You&apos;re solving as a guest, so this lives in this browser only. Sign in to keep it, get
        reviews when it&apos;s about to fade, and track your streak.
      </p>
      <Button asChild size="sm" variant="secondary" className="w-fit">
        <Link href="/login">
          <LogInIcon />
          Sign in
        </Link>
      </Button>
    </section>
  )
}

function CoachSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading your attempt">
      <Skeleton className="h-5 w-16" />
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-6 w-3/4" />
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-8" />
        <Skeleton className="h-8" />
      </div>
      <Skeleton className="h-8 w-full" />
      <Skeleton className="mt-4 h-5 w-14" />
      {[1, 2, 3, 4, 5, 6].map((row) => (
        <Skeleton key={row} className="h-7 w-full" />
      ))}
    </div>
  )
}

function CoachError() {
  return (
    <div role="alert" className="flex flex-col gap-2 rounded-lg border border-border bg-bg p-4">
      <p className="text-sm font-medium">We couldn&apos;t load your attempt.</p>
      <p className="text-sm text-muted">
        Your code is safe in this browser. Check your connection, then try again.
      </p>
      <Button
        size="sm"
        variant="secondary"
        className="w-fit"
        onClick={() => void workspaceStore.getState().loadAttempt()}
      >
        <RotateCwIcon />
        Try again
      </Button>
    </div>
  )
}

/** The coach column (Section 7.1). */
export function CoachPanel() {
  const coach = useWorkspace((state) => state.coach)
  const guest = useWorkspace((state) => state.mode === "guest")
  const givenPattern = useWorkspace((state) => state.fading.givenPattern)
  const wrapUp = useWorkspace((state) => state.wrapUp)
  const wrapUpOpen = useWorkspace((state) => state.wrapUpOpen)

  return (
    <aside aria-label="Coach" className="relative flex h-full flex-col overflow-clip bg-surface">
      <div
        // While the wrap-up covers the coach, the coach underneath is out of the tab order.
        inert={wrapUpOpen && wrapUp !== null}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border pr-2 pl-4">
          <h2 className="text-xs font-medium tracking-wide text-muted uppercase">Coach</h2>
          <div className="ml-auto flex items-center gap-1">
            <SyncStatus />
            <AttemptMenu />
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          {coach === "loading" ? <CoachSkeleton /> : null}
          {coach === "error" ? <CoachError /> : null}
          {coach === "ready" ? (
            <>
              <StatusCards />
              {givenPattern ? <NewPatternNote patternId={givenPattern} /> : null}
              <RunTip />
              <PlanCard />
              <HintLadder />
              {guest ? <GuestSave /> : null}
            </>
          ) : null}
        </div>
      </div>
      <AnimatePresence>
        {wrapUpOpen && wrapUp ? <WrapUpPanel key="wrap-up" wrapUp={wrapUp} /> : null}
      </AnimatePresence>
    </aside>
  )
}
