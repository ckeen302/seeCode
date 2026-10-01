"use client"

// VariablesPanel (Sections 8.5 ScalarRow and ObjectChip, 8.6): the deepest frame's plain
// values as `name = value` chips; pointers carry their color dot and the returned value shows
// on a return step.
import { memo } from "react"

import { cn } from "@/lib/utils"
import type { Scene } from "@/lib/viz/layout"
import { POINTER_BG } from "@/components/viz/shared"

function VariablesPanelImpl({ scene, step }: { scene: Scene; step: number }) {
  const where = scene.depth > 1 ? `in ${scene.func}(), depth ${scene.depth}` : `in ${scene.func}()`
  return (
    <section aria-label="Variables" className="flex min-w-0 flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-medium text-muted">Variables</h3>
        <span className="truncate font-mono text-xs text-muted">{where}</span>
      </div>
      {scene.scalars.length === 0 && scene.ret === null ? (
        <p className="text-sm text-muted">No plain values here; the structures are drawn above.</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5" data-step={step}>
          {scene.scalars.map((item) => (
            <li
              key={item.name}
              className={cn(
                "inline-flex h-7 max-w-full items-center gap-1.5 rounded-md border bg-surface-2 px-2 font-mono text-sm",
                item.changed ? "border-accent" : "border-border"
              )}
              data-var={item.name}
            >
              {item.pointer ? (
                <span
                  aria-hidden
                  className={cn("size-2 shrink-0 rounded-full", POINTER_BG[item.pointer])}
                />
              ) : null}
              <span className="text-muted">{item.name}</span>
              <span aria-hidden className="text-muted">
                =
              </span>
              <span className="sr-only">is</span>
              <span className="truncate text-text">{item.text}</span>
              {item.changed ? <span className="sr-only">(changed)</span> : null}
            </li>
          ))}
          {scene.ret !== null ? (
            <li className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-md border border-accent-2 px-2 font-mono text-sm">
              <span className="text-muted">returns</span>
              <span className="truncate text-text">{scene.ret}</span>
            </li>
          ) : null}
        </ul>
      )}
    </section>
  )
}

export const VariablesPanel = memo(VariablesPanelImpl)
