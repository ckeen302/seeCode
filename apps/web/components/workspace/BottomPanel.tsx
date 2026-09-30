"use client"

import { ChevronDownIcon, ChevronUpIcon, FootprintsIcon, ScanSearchIcon } from "lucide-react"

import { TestsPanel } from "@/components/workspace/TestsPanel"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { HOTKEYS, formatHotkey, useIsMac } from "@/lib/keyboard"
import { useWorkspace, workspaceStore, type BottomTab } from "@/stores/workspace"

/** Height of the tab row, which stays visible while the panel is collapsed. */
export const BOTTOM_HEADER_PX = 41

function ComingSoon({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof FootprintsIcon
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="flex h-full items-start px-4 py-4">
      <div className="flex max-w-md items-start gap-3 rounded-lg border border-border bg-bg p-4">
        <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-sm text-muted">{children}</p>
        </div>
      </div>
    </div>
  )
}

/** The middle column's bottom panel (Section 7.1): Tests, Walkthrough, Trace my code. */
export function BottomPanel({
  collapsed,
  onToggleCollapsed,
}: {
  collapsed: boolean
  onToggleCollapsed: (collapsed: boolean) => void
}) {
  const tab = useWorkspace((state) => state.bottomTab)
  const running = useWorkspace((state) => state.running)
  const mac = useIsMac()
  const hint = (hotkey: (typeof HOTKEYS)[keyof typeof HOTKEYS]) =>
    mac === null ? undefined : formatHotkey(hotkey, mac)
  const toggleLabel = collapsed ? "Show the tests panel" : "Hide the tests panel"

  return (
    <section aria-label="Tests" className="@container flex h-full min-h-0 flex-col bg-surface">
      <Tabs
        value={tab}
        onValueChange={(value) => {
          workspaceStore.getState().setBottomTab(value as BottomTab)
          if (collapsed) onToggleCollapsed(false)
        }}
        className="h-full min-h-0"
      >
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-2">
          <TabsList aria-label="Bottom panel">
            <TabsTrigger value="tests">Tests</TabsTrigger>
            <TabsTrigger value="walkthrough">Walkthrough</TabsTrigger>
            <TabsTrigger value="trace">
              <span>
                Trace<span className="@max-[520px]:hidden"> my code</span>
              </span>
            </TabsTrigger>
          </TabsList>
          <div className="ml-auto flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted hover:text-text"
                  aria-label={toggleLabel}
                  aria-expanded={!collapsed}
                  onClick={() => onToggleCollapsed(!collapsed)}
                >
                  {collapsed ? <ChevronUpIcon /> : <ChevronDownIcon />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                {toggleLabel} {hint(HOTKEYS.toggleBottomPanel)}
              </TooltipContent>
            </Tooltip>
            <Button
              variant="secondary"
              size="sm"
              shortcut={hint(HOTKEYS.run)}
              shortcutClassName="hidden @min-[600px]:inline"
              aria-busy={running === "run"}
              onClick={() => void workspaceStore.getState().run()}
            >
              Run
            </Button>
            <Button
              size="sm"
              shortcut={hint(HOTKEYS.submit)}
              shortcutClassName="hidden @min-[600px]:inline"
              aria-busy={running === "submit"}
              onClick={() => void workspaceStore.getState().submit()}
            >
              Submit
            </Button>
          </div>
        </div>
        {collapsed ? null : (
          <>
            <TabsContent value="tests" className="min-h-0">
              <TestsPanel />
            </TabsContent>
            <TabsContent value="walkthrough" className="min-h-0">
              <ComingSoon icon={FootprintsIcon} title="Walkthrough">
                Step through the reference solution on real data, with a one-line reason for every
                step and a predict mode. It arrives in milestone M4.
              </ComingSoon>
            </TabsContent>
            <TabsContent value="trace" className="min-h-0">
              <ComingSoon icon={ScanSearchIcon} title="Trace my code">
                Run your own code step by step and watch every variable change. It arrives in
                milestone M4.
              </ComingSoon>
            </TabsContent>
          </>
        )}
      </Tabs>
    </section>
  )
}
