"use client"

import Editor from "@monaco-editor/react"
import { RotateCcwIcon } from "lucide-react"
import type * as Monaco from "monaco-editor"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { useResolvedTheme } from "@/components/shell/Preferences"
import { RunnerStatusBadge } from "@/components/workspace/RunnerStatusBadge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  EDITOR_THEME_NAMES,
  configureMonacoLoader,
  defineEditorThemes,
  editorOptions,
} from "@/lib/editor/monaco"
import { errorLine } from "@/lib/runner/traceback"
import { registerEditor } from "@/lib/workspace/editorBridge"
import { useMediaQuery } from "@/lib/useMediaQuery"
import { useWorkspace, workspaceStore } from "@/stores/workspace"

configureMonacoLoader()

type CodeEditor = Monaco.editor.IStandaloneCodeEditor
type MonacoApi = typeof Monaco

const MARKER_OWNER = "seecode"

function EditorLoading() {
  return (
    <div className="flex h-full flex-col gap-2 bg-surface px-4 py-3" aria-hidden>
      {[70, 85, 55, 40, 65].map((width, index) => (
        <Skeleton key={index} className="h-4" style={{ width: `${width}%` }} />
      ))}
    </div>
  )
}

/**
 * The code editor (Section 7.1): Monaco in Python mode with the SeeCode theme. Mounted once
 * per problem (the Workspace keys it by slug); the editor owns the text and reports every
 * change to the store.
 */
export function EditorPanel() {
  const slug = useWorkspace((state) => state.slug)
  const starterCode = useWorkspace((state) => state.problem?.starterCode ?? "")
  const results = useWorkspace((state) => state.results)
  const theme = useResolvedTheme()
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)") ?? false
  const options = useMemo(() => editorOptions(reducedMotion), [reducedMotion])
  const editorRef = useRef<CodeEditor | null>(null)
  const monacoRef = useRef<MonacoApi | null>(null)
  const [initialCode] = useState(() => workspaceStore.getState().code)

  const handleMount = useCallback((editor: CodeEditor, monaco: MonacoApi) => {
    editorRef.current = editor
    monacoRef.current = monaco
    // The font loads with `display: swap`; measure again once it is ready.
    void document.fonts?.ready.then(() => monaco.editor.remeasureFonts())
  }, [])

  // Traceback links and the Tests panel move the cursor through this handle.
  useEffect(
    () =>
      registerEditor({
        goToLine(line) {
          const editor = editorRef.current
          const model = editor?.getModel()
          if (!editor || !model) return
          const target = Math.min(Math.max(1, line), model.getLineCount())
          const column = model.getLineFirstNonWhitespaceColumn(target) || 1
          editor.setPosition({ lineNumber: target, column })
          editor.revealLineInCenterIfOutsideViewport(target)
          editor.focus()
        },
        focus() {
          editorRef.current?.focus()
        },
      }),
    []
  )

  // Marks the line of the latest error with a squiggle (the message shows on hover).
  useEffect(() => {
    const monaco = monacoRef.current
    const model = editorRef.current?.getModel()
    if (!monaco || !model) return
    const failed = results?.find((result) => result.status === "error" && result.error)
    const line = failed?.error ? errorLine(failed.error) : null
    if (!failed?.error || line === null || line > model.getLineCount()) {
      monaco.editor.setModelMarkers(model, MARKER_OWNER, [])
      return
    }
    const message = failed.error.trimEnd().split("\n").at(-1) ?? "Error"
    monaco.editor.setModelMarkers(model, MARKER_OWNER, [
      {
        severity: monaco.MarkerSeverity.Error,
        message,
        startLineNumber: line,
        startColumn: model.getLineFirstNonWhitespaceColumn(line) || 1,
        endLineNumber: line,
        endColumn: model.getLineMaxColumn(line),
      },
    ])
  }, [results])

  function resetCode() {
    const editor = editorRef.current
    const model = editor?.getModel()
    if (!editor || !model) return
    // An edit, not setValue: ⌘Z brings the old code back.
    editor.pushUndoStop()
    editor.executeEdits("reset", [{ range: model.getFullModelRange(), text: starterCode }])
    editor.pushUndoStop()
    editor.focus()
  }

  return (
    <section aria-label="Code" className="flex h-full min-h-0 flex-col bg-surface">
      <div className="flex h-10 shrink-0 items-center gap-3 border-b border-border px-3">
        <span className="text-sm font-medium">Python</span>
        <RunnerStatusBadge />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="ml-auto text-muted hover:text-text"
              aria-label="Reset to the starter code (undo with ⌘Z)"
              onClick={resetCode}
            >
              <RotateCcwIcon />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Reset to the starter code</TooltipContent>
        </Tooltip>
      </div>
      <div className="min-h-0 flex-1" data-testid="code-editor">
        <Editor
          path={`file:///seecode/${slug}.py`}
          defaultLanguage="python"
          defaultValue={initialCode}
          theme={EDITOR_THEME_NAMES[theme]}
          options={options}
          beforeMount={(monaco) => defineEditorThemes(monaco as unknown as MonacoApi)}
          onMount={(editor, monaco) =>
            handleMount(editor as unknown as CodeEditor, monaco as unknown as MonacoApi)
          }
          onChange={(value) => workspaceStore.getState().setCode(value ?? "")}
          loading={<EditorLoading />}
        />
      </div>
    </section>
  )
}
