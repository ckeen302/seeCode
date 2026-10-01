"use client"

import { useQueryClient } from "@tanstack/react-query"
import { LogInIcon, LogOutIcon, UsersIcon } from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"
import { useMe } from "@/lib/api/hooks"
import { signOut, useAuth } from "@/lib/auth/session"

/**
 * The account button: the sidebar shows the name next to the avatar; `compact` (the
 * Workspace top bar) shows the avatar alone, opens the menu downward, and comes back to
 * the current page after sign-in.
 */
export function ProfileMenu({
  labelClassName,
  compact = false,
}: {
  labelClassName?: string
  compact?: boolean
}) {
  const auth = useAuth()
  const me = useMe()
  const router = useRouter()
  const pathname = usePathname()
  const queryClient = useQueryClient()

  if (auth.status === "loading") {
    return <Skeleton className={compact ? "size-8 rounded-full" : "h-9 w-full"} />
  }

  if (auth.status === "signed_out") {
    return (
      <Button
        asChild
        variant="ghost"
        size={compact ? "sm" : "md"}
        className={
          compact
            ? "gap-2 text-muted hover:text-text"
            : "w-full justify-start gap-3 px-3 text-muted hover:text-text"
        }
      >
        <Link href={compact ? `/login?next=${encodeURIComponent(pathname)}` : "/login"}>
          <LogInIcon />
          <span className={labelClassName}>Sign in</span>
        </Link>
      </Button>
    )
  }

  const name = me.data?.displayName ?? auth.user.name ?? auth.user.email ?? "Signed in"
  const initial = name.trim().charAt(0).toUpperCase() || "?"
  const isDev = auth.user.provider === "dev"

  async function handleSignOut() {
    await signOut()
    queryClient.clear()
    router.replace("/")
    router.refresh()
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size={compact ? "icon" : "md"}
          className={compact ? "rounded-full" : "w-full justify-start gap-3 px-2"}
          aria-label={`Account: ${name}`}
        >
          <span
            aria-hidden
            className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold text-text"
          >
            {initial}
          </span>
          {compact ? null : (
            <span className={`truncate text-left ${labelClassName ?? ""}`}>{name}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side={compact ? "bottom" : "top"}
        align={compact ? "end" : "start"}
        className="w-56"
      >
        <div className="px-2 py-1">
          <p className="truncate font-medium">{name}</p>
          <p className="truncate text-xs text-muted">
            {isDev ? "Dev sign-in (local only)" : (auth.user.email ?? "Signed in")}
          </p>
        </div>
        {isDev ? (
          <Button asChild variant="ghost" size="sm" className="justify-start">
            <Link href="/login">
              <UsersIcon />
              Switch dev user
            </Link>
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" className="justify-start" onClick={handleSignOut}>
          <LogOutIcon />
          Sign out
        </Button>
      </PopoverContent>
    </Popover>
  )
}
