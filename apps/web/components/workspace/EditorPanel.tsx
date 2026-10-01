"use client"

import Editor, { loader } from "@monaco-editor/react"
import { CircleAlertIcon, RotateCcwIcon, RotateCwIcon } from "lucide-react"
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
import { useIsMac } from "@/lib/keyboard"
import { errorLine } from "@/lib/runner/traceback"
import { registerEditor } from "@/lib/workspace/editorBridge"
import { codeTooLarge } from "@/lib/workspace/limits"
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

/** Monaco comes from the CDN; when that fails (offline, blocked) its loader never retries. */
function EditorLoadError() {
  return (
    <div role="alert" className="flex h-full flex-col items-start gap-2 bg-surface px-4 py-4">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <CircleAlertIcon aria-hidden className="size-4 text-error" />
        The code editor couldn&apos;t load.
      </p>
      <p className="text-sm text-muted">
        Check your connection, then reload the page. Your code is kept in this browser.
      </p>
      <Button size="sm" variant="secondary" onClick={() => window.location.reload()}>
        <RotateCwIcon />
        Reload
      </Button>
    </div>
  )
}

/** Whether Monaco failed to load from the CDN. */
function useEditorLoadFailed(): boolean {
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const init = loader.init()
    init.catch((error: unknown) => {
      // Unmounting cancels the wait; that is not a failure.
      if ((error as { type?: string } | null)?.type !== "cancelation") setFailed(true)
    })
    return () => init.cancel()
  }, [])
  return failed
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
  const tooLarge = useWorkspace((state) => codeTooLarge(state.code))
  const theme = useResolvedTheme()
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)") ?? false
  const mac = useIsMac() ?? false
  const options = useMemo(() => editorOptions(reducedMotion, mac), [reducedMotion, mac])
  const editorRef = useRef<CodeEditor | null>(null)
  const monacoRef = useRef<MonacoApi | null>(null)
  const [initialCode] = useState(() => workspaceStore.getState().code)
  const loadFailed = useEditorLoadFailed()
  // Monaco loads after the first render; results that came before it still get their marker.
  const [mounted, setMounted] = useState(false)

  const handleMount = useCallback((editor: CodeEditor, monaco: MonacoApi) => {
    editorRef.current = editor
    monacoRef.current = monaco
    setMounted(true)
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
  }, [results, mounted])

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
        {tooLarge ? (
          <span
            role="status"
            title="SeeCode saves code up to 50 KB."
            className="inline-flex min-w-0 items-center gap-1.5 text-xs text-text"
          >
            <CircleAlertIcon aria-hidden className="size-3.5 shrink-0 text-error" />
            <span className="truncate">Over 50 KB: shorten it to save your changes</span>
          </span>
        ) : null}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="ml-auto text-muted hover:text-text"
              aria-label={`Reset to the starter code (undo with ${mac ? "⌘Z" : "Ctrl+Z"})`}
              onClick={resetCode}
            >
              <RotateCcwIcon />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Reset to the starter code</TooltipContent>
        </Tooltip>
      </div>
      <div className="min-h-0 flex-1" data-testid="code-editor">
        {loadFailed ? (
          <EditorLoadError />
        ) : (
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
        )}
      </div>
    </section>
  )
}
