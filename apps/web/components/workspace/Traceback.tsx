"use client"

import { parseTraceback } from "@/lib/runner/traceback"
import { goToLine } from "@/lib/workspace/editorBridge"
import { cn } from "@/lib/utils"

/** A Python traceback; each `line N` of the user's code jumps to that editor line. */
export function Traceback({ text, className }: { text: string; className?: string }) {
  const segments = parseTraceback(text.trimEnd())
  return (
    <pre
      className={cn(
        "overflow-x-auto rounded-md border border-border border-l-2 border-l-error bg-surface-2 px-3 py-2 font-mono text-sm break-words whitespace-pre-wrap text-text",
        className
      )}
    >
      {segments.map((segment, index) =>
        segment.kind === "text" ? (
          segment.text
        ) : (
          <button
            key={index}
            type="button"
            onClick={() => goToLine(segment.line)}
            aria-label={`Go to line ${segment.line} in the editor`}
            title="Show this line in the editor"
            className="rounded-sm font-mono text-accent underline decoration-dotted underline-offset-2 hover:decoration-solid"
          >
            {segment.text}
          </button>
        )
      )}
    </pre>
  )
}
