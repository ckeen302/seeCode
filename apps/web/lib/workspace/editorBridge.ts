// Lets other Workspace panels act on the code editor (e.g. a traceback's "line N" link
// moving the cursor, or rung 4's "Insert as comments") without passing Monaco instances
// around.

export interface EditorHandle {
  /** Moves the cursor to the first character of `line`, scrolls it into view and focuses. */
  goToLine(line: number): void
  focus(): void
  /**
   * Inserts whole lines at the cursor, indented like the code around it, as one edit that
   * ⌘Z undoes; then focuses the editor.
   */
  insertLines(lines: string[]): void
}

let current: EditorHandle | null = null

export function registerEditor(handle: EditorHandle): () => void {
  current = handle
  return () => {
    if (current === handle) current = null
  }
}

export function goToLine(line: number): boolean {
  if (!current) return false
  current.goToLine(line)
  return true
}

export function focusEditor(): void {
  current?.focus()
}

/** False when no editor is mounted (e.g. it failed to load). */
export function insertLines(lines: string[]): boolean {
  if (!current) return false
  current.insertLines(lines)
  return true
}

/**
 * Where `lines` go, given the editor's current line: above it when it holds code (indented
 * like it), or in place of it when it is blank (indented like the code above, one level
 * deeper after a line ending in ":").
 */
export function indentedBlock(
  lines: string[],
  currentLine: string,
  previousCodeLine: string | null
): { text: string; replaceLine: boolean } {
  const indentOf = (line: string) => /^[ \t]*/.exec(line)?.[0] ?? ""
  const blank = currentLine.trim() === ""
  let indent: string
  if (!blank) indent = indentOf(currentLine)
  else if (previousCodeLine === null) indent = ""
  else {
    indent = indentOf(previousCodeLine)
    if (/:\s*(#.*)?$/.test(previousCodeLine)) indent += "    "
  }
  const body = lines.map((line) => `${indent}${line}`).join("\n")
  return { text: blank ? body : `${body}\n`, replaceLine: blank }
}
