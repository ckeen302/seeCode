"use client"

import { ArrowRightIcon, CheckIcon, LockIcon, MapIcon } from "lucide-react"
import { motion } from "motion/react"
import Link from "next/link"
import { useMemo, useState } from "react"

import { PatternStateBadge, ProgressRing } from "@/components/patterns/PatternChip"
import {
  NODE_H,
  NODE_W,
  layoutRoadmap,
  lockReason,
  nextPattern,
  type PlacedNode,
} from "@/components/roadmap/layout"
import { useReducedMotion } from "@/components/settings/motion"
import { ErrorState, PageHeader, useSignInHref } from "@/components/today/PageStates"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { STATE_LABELS, useRoadmap, type RoadmapNode } from "@/lib/api/patterns"
import { useAuth } from "@/lib/auth/session"
import { cn } from "@/lib/utils"
import { familyColor } from "@/lib/workspace/plan"

const NODE_STYLES: Record<RoadmapNode["state"], string> = {
  locked: "border-dashed border-border bg-bg text-muted",
  available: "border-border bg-surface text-text hover:border-muted",
  in_progress: "border-accent bg-surface text-text shadow-[0_0_0_3px_var(--window)]",
  mastered: "border-accent bg-accent text-on-accent",
}

function nodeLabel(node: RoadmapNode, reason: string | null): string {
  const progress = node.progress
    ? `, ${node.progress.solved} of ${node.problemCount} solved`
    : `, ${node.problemCount} problems`
  return `${node.name}: ${STATE_LABELS[node.state]}${progress}.${reason ? ` ${reason}` : ""}`
}

function GraphNode({
  placed,
  reason,
  index,
  onHover,
  reduced,
}: {
  placed: PlacedNode
  reason: string | null
  index: number
  onHover: (id: string | null) => void
  reduced: boolean
}) {
  const { node } = placed
  const solved = node.progress?.solved ?? 0
  const mastered = node.state === "mastered"
  const link = (
    <Link
      href={`/patterns/${node.id}`}
      aria-label={nodeLabel(node, reason)}
      onPointerEnter={() => onHover(node.id)}
      onPointerLeave={() => onHover(null)}
      onFocus={() => onHover(node.id)}
      onBlur={() => onHover(null)}
      className={cn(
        "absolute flex items-center gap-3 rounded-lg border px-3 transition-[border-color,transform,box-shadow] duration-150 hover:-translate-y-0.5",
        NODE_STYLES[node.state]
      )}
      style={{ left: placed.left, top: placed.top, width: NODE_W, height: NODE_H }}
    >
      <span className="relative flex size-10 shrink-0 items-center justify-center">
        {node.state === "locked" ? (
          <LockIcon aria-hidden className="size-4" />
        ) : mastered ? (
          <span className="flex size-9 items-center justify-center rounded-full bg-on-accent/15">
            <CheckIcon aria-hidden className="size-5" />
          </span>
        ) : (
          <>
            <ProgressRing value={solved} total={node.problemCount} size={40} />
            <span className="absolute font-mono text-xs tabular-nums">
              {node.progress ? `${solved}/${node.problemCount}` : node.problemCount}
            </span>
          </>
        )}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="flex items-start gap-1.5">
          <span
            aria-hidden
            className="mt-1.5 size-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: mastered ? "currentColor" : familyColor(node.family) }}
          />
          <span className="line-clamp-2 text-sm leading-tight font-semibold">{node.name}</span>
        </span>
        <span className={cn("text-xs", mastered ? "text-on-accent/80" : "text-muted")}>
          {node.state === "locked"
            ? "Locked"
            : node.progress
              ? `${STATE_LABELS[node.state]} · ${solved} of ${node.problemCount} solved`
              : `${node.problemCount} problems`}
        </span>
      </span>
    </Link>
  )
  return (
    <motion.div
      initial={reduced ? false : { y: 6 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.25, delay: reduced ? 0 : 0.08 * index }}
    >
      {reason ? (
        <Tooltip>
          <TooltipTrigger asChild>{link}</TooltipTrigger>
          <TooltipContent side="bottom">{reason}</TooltipContent>
        </Tooltip>
      ) : (
        link
      )}
    </motion.div>
  )
}

/** The pattern graph: plain SVG edges under absolutely placed node links (no graph library). */
export function RoadmapGraph({
  nodes,
  solvedInPrereq,
}: {
  nodes: RoadmapNode[]
  solvedInPrereq: number
}) {
  const layout = useMemo(() => layoutRoadmap(nodes, solvedInPrereq), [nodes, solvedInPrereq])
  const [hovered, setHovered] = useState<string | null>(null)
  const reduced = useReducedMotion()

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface [background-image:radial-gradient(var(--border)_1px,transparent_1px)] [background-size:20px_20px]">
      <div
        className="relative mx-auto"
        style={{ width: layout.width, height: layout.height, minWidth: layout.width }}
        data-testid="roadmap-graph"
      >
        <svg
          aria-hidden
          width={layout.width}
          height={layout.height}
          className="absolute inset-0 overflow-visible"
        >
          {layout.edges.map((edge, index) => {
            const lit = hovered !== null && (edge.from === hovered || edge.to === hovered)
            return (
              <motion.path
                key={edge.id}
                data-edge={edge.id}
                d={edge.d}
                fill="none"
                stroke={edge.met || lit ? "var(--accent)" : "var(--muted)"}
                strokeOpacity={edge.met || lit ? 1 : 0.5}
                strokeWidth={lit ? 2.5 : 2}
                strokeDasharray={edge.met ? undefined : "4 5"}
                strokeLinecap="round"
                initial={reduced ? false : { pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.5, delay: reduced ? 0 : 0.15 + 0.08 * index }}
              />
            )
          })}
          {layout.nodes.map((placed) =>
            placed.node.prereqs.length ? (
              <circle
                key={`in-${placed.node.id}`}
                cx={placed.left}
                cy={placed.top + NODE_H / 2}
                r={3}
                fill="var(--muted)"
              />
            ) : null
          )}
        </svg>
        {layout.nodes.map((placed, index) => (
          <GraphNode
            key={placed.node.id}
            placed={placed}
            index={index}
            reduced={reduced}
            onHover={setHovered}
            reason={lockReason(placed.node, nodes, solvedInPrereq)}
          />
        ))}
      </div>
    </div>
  )
}

function Legend() {
  const items: { state: RoadmapNode["state"]; text: string }[] = [
    { state: "locked", text: "Solve its prerequisites first" },
    { state: "available", text: "Ready to start" },
    { state: "in_progress", text: "At least one solved" },
    { state: "mastered", text: "Two problems mastered" },
  ]
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted" aria-label="Legend">
      {items.map((item) => (
        <li key={item.state} className="flex items-center gap-2">
          <PatternStateBadge state={item.state} />
          {item.text}
        </li>
      ))}
    </ul>
  )
}

function NextUp({ node }: { node: RoadmapNode }) {
  const solved = node.progress?.solved ?? 0
  return (
    <Card className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-xs font-medium tracking-wide text-muted uppercase">Next up</p>
        <h2 className="text-base font-semibold">{node.name}</h2>
        <p className="text-sm text-muted">
          {node.state === "in_progress"
            ? `${solved} of ${node.problemCount} solved. Keep going to unlock what comes after.`
            : "Unlocked and ready. Start with its idea and template."}
        </p>
      </div>
      <Button asChild>
        <Link href={`/patterns/${node.id}`}>
          {node.state === "in_progress" ? "Continue" : "Start"}
          <ArrowRightIcon />
        </Link>
      </Button>
    </Card>
  )
}

export function SignInBanner({ text }: { text: string }) {
  const href = useSignInHref()
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent/40 bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))] px-4 py-3">
      <p className="text-sm">{text}</p>
      <Button asChild size="sm">
        <Link href={href}>Get started free</Link>
      </Button>
    </div>
  )
}

// Roadmap (Section 6.3): patterns left to right with prerequisite edges and per-user state.
export function RoadmapView() {
  const auth = useAuth()
  const roadmap = useRoadmap()
  const signedOut = auth.status === "signed_out"

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Roadmap"
        description="Patterns build on each other. Solve two problems in a pattern to unlock the ones after it."
      />
      {signedOut ? (
        <SignInBanner text="Sign in to track progress and unlock patterns as you go." />
      ) : null}
      {roadmap.isPending ? (
        <div aria-busy="true" aria-label="Loading the roadmap">
          <Skeleton className="h-72 w-full rounded-lg" />
        </div>
      ) : roadmap.isError ? (
        <ErrorState
          title="We couldn't load the roadmap"
          error={roadmap.error}
          onRetry={() => void roadmap.refetch()}
        />
      ) : roadmap.data.patterns.length === 0 ? (
        <Card className="flex items-center gap-3 text-muted">
          <MapIcon aria-hidden className="size-5" />
          No patterns yet.
        </Card>
      ) : (
        <>
          {!signedOut && nextPattern(roadmap.data.patterns) ? (
            <NextUp node={nextPattern(roadmap.data.patterns) as RoadmapNode} />
          ) : null}
          <RoadmapGraph
            nodes={roadmap.data.patterns}
            solvedInPrereq={roadmap.data.unlockRule.solvedInPrereq}
          />
          <Legend />
        </>
      )}
    </div>
  )
}
