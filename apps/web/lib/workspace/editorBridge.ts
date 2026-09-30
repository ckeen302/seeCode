// Lets other Workspace panels act on the code editor (e.g. a traceback's "line N" link
// moving the cursor) without passing Monaco instances around.

export interface EditorHandle {
  /** Moves the cursor to the first character of `line`, scrolls it into view and focuses. */
  goToLine(line: number): void
  focus(): void
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
