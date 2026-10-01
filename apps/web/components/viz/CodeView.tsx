"use client"

// CodeView (Section 8.6): the traced code with line numbers; the current line is marked
// "about to run" (a line event fires before its line runs, 8.2) or "returning".
import { memo, useLayoutEffect, useMemo, useRef } from "react"

import { cn } from "@/lib/utils"

const KEYWORDS = new Set(
  "and as assert break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield".split(
    " "
  )
)
const TOKEN =
  /(#.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)/g

export interface Token {
  text: string
  kind: "plain" | "comment" | "marker" | "string" | "number" | "keyword"
}

/** A light Python tokenizer, enough to color one line. */
export function tokenize(line: string): Token[] {
  const out: Token[] = []
  let last = 0
  for (const match of line.matchAll(TOKEN)) {
    const start = match.index ?? 0
    if (start > last) out.push({ text: line.slice(last, start), kind: "plain" })
    const [text, comment, string, number, word] = match
    if (comment) out.push({ text, kind: /^#\s*viz:/.test(comment) ? "marker" : "comment" })
    else if (string) out.push({ text, kind: "string" })
    else if (number) out.push({ text, kind: "number" })
    else if (word) out.push({ text, kind: KEYWORDS.has(word) ? "keyword" : "plain" })
    last = start + text.length
  }
  if (last < line.length) out.push({ text: line.slice(last), kind: "plain" })
  return out
}

const KIND_CLASS: Record<Token["kind"], string> = {
  plain: "",
  comment: "text-muted",
  marker: "text-muted",
  // --good and --accent-2 are below 4.5:1 as light-theme text (docs/DECISIONS.md).
  string: "text-ptr-d",
  number: "text-ptr-d",
  keyword: "text-accent",
}

const Line = memo(function Line({ number, text }: { number: number; text: string }) {
  const tokens = useMemo(() => tokenize(text), [text])
  return (
    <>
      <span aria-hidden className="w-8 shrink-0 pr-3 text-right text-muted select-none">
        {number}
      </span>
      <span className="whitespace-pre">
        {tokens.map((token, i) => (
          <span key={i} className={KIND_CLASS[token.kind]}>
            {token.text}
          </span>
        ))}
      </span>
    </>
  )
})

interface CodeViewProps {
  code: string
  line: number | null
  event: "line" | "return" | null
  errorLine?: number | null
  className?: string
}

function CodeViewImpl({ code, line, event, errorLine, className }: CodeViewProps) {
  const lines = useMemo(() => code.replace(/\n$/, "").split("\n"), [code])
  const scroller = useRef<HTMLDivElement>(null)
  const current = useRef<HTMLLIElement>(null)

  // Keep the current line in view without scrolling the page.
  useLayoutEffect(() => {
    const box = scroller.current
    const row = current.current
    if (!box || !row) return
    const top = row.offsetTop - box.offsetTop
    if (top < box.scrollTop + 8) box.scrollTop = Math.max(0, top - 24)
    else if (top + row.offsetHeight > box.scrollTop + box.clientHeight - 8) {
      box.scrollTop = top + row.offsetHeight - box.clientHeight + 24
    }
  }, [line])

  const status = event === "return" ? "returning" : "about to run"
  return (
    <section aria-label="Code" className={cn("flex min-h-0 min-w-0 flex-col gap-2", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-medium text-muted">Code</h3>
        {line !== null ? (
          <span className="text-xs text-muted">
            Line {line} is{" "}
            <span className={event === "return" ? "font-medium text-text" : "text-accent"}>
              {status}
            </span>
          </span>
        ) : null}
      </div>
      <div
        ref={scroller}
        className="relative max-h-72 min-h-0 overflow-auto rounded-lg border border-border bg-bg py-2"
        tabIndex={0}
        aria-label="Code, scrollable"
      >
        <ol className="font-mono text-[13px] leading-5">
          {lines.map((text, i) => {
            const number = i + 1
            const isCurrent = number === line
            const isError = number === errorLine
            return (
              <li
                key={number}
                ref={isCurrent ? current : undefined}
                aria-current={isCurrent ? "step" : undefined}
                className={cn(
                  "relative flex pr-3 transition-colors duration-150",
                  isCurrent && (event === "return" ? "bg-accent-2/15" : "bg-accent/15"),
                  isError && !isCurrent && "bg-error/10"
                )}
                data-line={number}
              >
                {isCurrent ? (
                  <span
                    aria-hidden
                    className={cn(
                      "absolute inset-y-0 left-0 w-0.5",
                      event === "return" ? "bg-accent-2" : "bg-accent"
                    )}
                  />
                ) : null}
                {isCurrent ? <span className="sr-only">{`${status}: `}</span> : null}
                <Line number={number} text={text} />
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}

export const CodeView = memo(CodeViewImpl)
