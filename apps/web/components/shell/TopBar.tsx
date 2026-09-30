"use client"

import { MenuIcon } from "lucide-react"
import { useState } from "react"

import { AppLink } from "@/components/shell/AppLink"
import { SidebarContent } from "@/components/shell/Sidebar"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

/** Below 900 px the sidebar hides behind a menu button (Section 18.6). */
export function TopBar() {
  const [open, setOpen] = useState(false)
  return (
    <header className="sticky top-0 z-40 flex h-12 items-center gap-2 border-b border-border bg-surface px-3 min-[900px]:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Open menu">
            <MenuIcon />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" showCloseButton={false}>
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <SheetDescription className="sr-only">Main navigation</SheetDescription>
          <SidebarContent variant="sheet" onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <AppLink href="/today" className="text-base font-semibold tracking-tight">
        SeeCode
      </AppLink>
    </header>
  )
}
