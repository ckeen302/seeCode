"use client"

import { useQueryClient } from "@tanstack/react-query"
import { LogInIcon, LogOutIcon, UsersIcon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"
import { useMe } from "@/lib/api/hooks"
import { signOut, useAuth } from "@/lib/auth/session"

export function ProfileMenu({ labelClassName }: { labelClassName?: string }) {
  const auth = useAuth()
  const me = useMe()
  const router = useRouter()
  const queryClient = useQueryClient()

  if (auth.status === "loading") {
    return <Skeleton className="h-9 w-full" />
  }

  if (auth.status === "signed_out") {
    return (
      <Button
        asChild
        variant="ghost"
        className="w-full justify-start gap-3 px-3 text-muted hover:text-text"
      >
        <Link href="/login">
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
          className="w-full justify-start gap-3 px-2"
          aria-label={`Account: ${name}`}
        >
          <span
            aria-hidden
            className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold text-text"
          >
            {initial}
          </span>
          <span className={`truncate text-left ${labelClassName ?? ""}`}>{name}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-56">
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
