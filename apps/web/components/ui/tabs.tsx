"use client"

import * as React from "react"
import { cn } from "cn"
import { Tabs as TabsPrimitive } from "radix-ui"

// shadcn/ui Tabs (Radix), rewritten to the Section 18 tokens: an underline marks the
// current tab.
function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root data-slot="tabs" className={cn("flex flex-col", className)} {...props} />
  )
}

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn("flex items-center gap-1", className)}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm whitespace-nowrap text-muted transition-colors select-none hover:text-text disabled:pointer-events-none disabled:opacity-50 data-[state=active]:text-text data-[state=active]:after:absolute data-[state=active]:after:inset-x-2.5 data-[state=active]:after:-bottom-[5px] data-[state=active]:after:h-0.5 data-[state=active]:after:rounded-full data-[state=active]:after:bg-accent [&_svg]:size-3.5 [&_svg]:shrink-0",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("min-h-0 flex-1 outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsContent, TabsList, TabsTrigger }
