"use client"

import {
  CalendarDaysIcon,
  ChartLineIcon,
  FootprintsIcon,
  ListChecksIcon,
  MapIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  RotateCcwIcon,
  SearchIcon,
  SettingsIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react"
import { usePathname } from "next/navigation"

import { AppLink } from "@/components/shell/AppLink"
import { useCommandPalette } from "@/components/shell/CommandPalette"
import { ProfileMenu } from "@/components/shell/ProfileMenu"
import { Shortcut } from "@/components/shell/Shortcut"
import { ThemeToggle, useSidebarCollapsed } from "@/components/shell/Preferences"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useReviewsDue } from "@/lib/api/today"
import { HOTKEYS } from "@/lib/keyboard"
import { setSidebarCollapsed } from "@/lib/sidebar"
import { cn } from "@/lib/utils"

interface NavItem {
  href: string
  label: string
  icon: LucideIcon
}

// Section 5: Today, Roadmap, Problems, Drills, Review (due badge), Stats; Settings at the bottom.
// Walkthroughs (/viz, the public gallery) sits after Problems (docs/DECISIONS.md).
export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/today", label: "Today", icon: CalendarDaysIcon },
  { href: "/roadmap", label: "Roadmap", icon: MapIcon },
  { href: "/problems", label: "Problems", icon: ListChecksIcon },
  { href: "/viz", label: "Walkthroughs", icon: FootprintsIcon },
  { href: "/drills", label: "Drills", icon: ZapIcon },
  { href: "/review", label: "Review", icon: RotateCcwIcon },
  { href: "/stats", label: "Stats", icon: ChartLineIcon },
]
const SETTINGS_ITEM: NavItem = { href: "/settings", label: "Settings", icon: SettingsIcon }

export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

type Variant = "desktop" | "sheet"

/** Classes that apply only to the collapsible desktop sidebar. */
function collapsible(variant: Variant, classes: string): string | false {
  return variant === "desktop" && classes
}

function NavLink({
  item,
  variant,
  reviewsDue,
  onNavigate,
}: {
  item: NavItem
  variant: Variant
  reviewsDue?: number
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  const active = isActivePath(pathname, item.href)
  const Icon = item.icon
  const badge = item.href === "/review" && reviewsDue ? reviewsDue : null

  const link = (
    <AppLink
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex h-9 items-center gap-3 rounded-md px-3 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-text aria-[current=page]:bg-surface-2 aria-[current=page]:font-medium aria-[current=page]:text-text",
        collapsible(variant, "sidebar-collapsed:justify-center sidebar-collapsed:px-0")
      )}
    >
      <Icon aria-hidden className="size-4 shrink-0" />
      <span className={cn(collapsible(variant, "sidebar-collapsed:sr-only"))}>{item.label}</span>
      {badge ? (
        <span
          className={cn(
            "ml-auto rounded-full bg-accent px-1.5 text-xs font-semibold text-on-accent",
            collapsible(
              variant,
              "sidebar-collapsed:absolute sidebar-collapsed:top-0.5 sidebar-collapsed:right-1"
            )
          )}
        >
          {badge}
          <span className="sr-only"> due</span>
        </span>
      ) : null}
    </AppLink>
  )

  if (variant === "sheet") return link
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right" className="hidden sidebar-collapsed:block">
        {item.label}
      </TooltipContent>
    </Tooltip>
  )
}

export function SidebarContent({
  variant,
  reviewsDue,
  onNavigate,
}: {
  variant: Variant
  reviewsDue?: number
  onNavigate?: () => void
}) {
  const palette = useCommandPalette()
  const collapsed = useSidebarCollapsed()
  // The Review badge (Section 5): due items from /today for a signed-in user.
  const dueFromToday = useReviewsDue()
  const due = reviewsDue ?? dueFromToday
  const label = collapsible(variant, "sidebar-collapsed:sr-only")

  return (
    <div className="flex h-full flex-col gap-4 p-3">
      <div
        className={cn(
          "flex h-9 items-center justify-between gap-2 pl-3",
          collapsible(variant, "sidebar-collapsed:justify-center sidebar-collapsed:pl-0")
        )}
      >
        <AppLink
          href="/today"
          onClick={onNavigate}
          className={cn(
            "text-base font-semibold tracking-tight",
            collapsible(variant, "sidebar-collapsed:hidden")
          )}
        >
          SeeCode
        </AppLink>
        {variant === "desktop" ? (
          <Button
            variant="ghost"
            size="icon-sm"
            className="hidden text-muted hover:text-text min-[1200px]:inline-flex"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            onClick={() => setSidebarCollapsed(!collapsed)}
          >
            {collapsed ? <PanelLeftOpenIcon /> : <PanelLeftCloseIcon />}
          </Button>
        ) : null}
      </div>

      <Button
        variant="ghost"
        className={cn(
          "justify-start gap-3 border border-border bg-bg px-3 text-muted hover:text-text",
          collapsible(variant, "sidebar-collapsed:justify-center sidebar-collapsed:px-0")
        )}
        onClick={() => {
          onNavigate?.()
          palette.open()
        }}
        aria-label="Search problems and patterns"
      >
        <SearchIcon />
        <span className={cn(label)}>Search</span>
        <Shortcut
          hotkey={HOTKEYS.commandPalette}
          className={cn("ml-auto", collapsible(variant, "sidebar-collapsed:hidden"))}
        />
      </Button>

      <nav aria-label="Main" className="flex-1">
        <ul className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <li key={item.href}>
              <NavLink item={item} variant={variant} reviewsDue={due} onNavigate={onNavigate} />
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex flex-col gap-1 border-t border-border pt-3">
        <NavLink item={SETTINGS_ITEM} variant={variant} onNavigate={onNavigate} />
        <div
          className={cn(
            "flex items-center gap-1",
            collapsible(variant, "sidebar-collapsed:flex-col-reverse")
          )}
        >
          <div className="min-w-0 flex-1">
            <ProfileMenu labelClassName={cn(label) || undefined} />
          </div>
          <ThemeToggle />
        </div>
      </div>
    </div>
  )
}

/** Desktop sidebar: 220 px, 64 px when collapsed or below 1200 px, hidden below 900 px. */
export function Sidebar({ reviewsDue }: { reviewsDue?: number }) {
  return (
    <aside
      aria-label="Sidebar"
      className="sticky top-0 hidden h-dvh w-[220px] shrink-0 border-r border-border bg-surface transition-[width] min-[900px]:block sidebar-collapsed:w-16"
    >
      <SidebarContent variant="desktop" reviewsDue={reviewsDue} />
    </aside>
  )
}
