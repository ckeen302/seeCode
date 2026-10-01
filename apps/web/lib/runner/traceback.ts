// Traceback line mapping (Section 9.2). The harness compiles the user's code as
// "<solution>" after running the prelude separately, so `File "<solution>", line N` is
// editor line N. PRELUDE_LINES mirrors harness.py and stays 0.

export const PRELUDE_LINES = 0

const SOLUTION_LINE = /File "<solution>", line (\d+)/g

export type TracebackSegment =
  { kind: "text"; text: string } | { kind: "line"; text: string; line: number }

/** Maps a harness line number to an editor line, or null for a prelude line. */
export function editorLine(harnessLine: number): number | null {
  const line = harnessLine - PRELUDE_LINES
  return line >= 1 ? line : null
}

/**
 * Splits a traceback into plain text and "line N" references to the user's code. Only the
 * `line N` part of each `File "<solution>", line N` becomes a link.
 */
export function parseTraceback(text: string): TracebackSegment[] {
  const segments: TracebackSegment[] = []
  let last = 0
  for (const match of text.matchAll(SOLUTION_LINE)) {
    const line = editorLine(Number(match[1]))
    if (line === null) continue
    const linkStart = (match.index ?? 0) + match[0].indexOf("line ")
    const linkEnd = (match.index ?? 0) + match[0].length
    if (linkStart > last) segments.push({ kind: "text", text: text.slice(last, linkStart) })
    segments.push({ kind: "line", text: text.slice(linkStart, linkEnd), line })
    last = linkEnd
  }
  if (last < text.length) segments.push({ kind: "text", text: text.slice(last) })
  return segments
}

/** The editor line the error points at: the innermost frame in the user's code. */
export function errorLine(text: string): number | null {
  let found: number | null = null
  for (const match of text.matchAll(SOLUTION_LINE)) {
    const line = editorLine(Number(match[1]))
    if (line !== null) found = line
  }
  return found
}

/** The last line of a traceback, e.g. "IndexError: string index out of range". */
export function errorSummary(text: string): string {
  const lines = text.trimEnd().split("\n")
  return lines[lines.length - 1]?.trim() ?? ""
}
