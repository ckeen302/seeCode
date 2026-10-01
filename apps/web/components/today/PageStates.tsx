"use client"

import { LogInIcon, RotateCwIcon, type LucideIcon } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Card, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/lib/auth/session"
import { cn } from "@/lib/utils"

// The four page states of Section 6 (loading, empty, error, ready), shared by every page.

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  eyebrow?: React.ReactNode
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1.5">
        {eyebrow ? <div className="text-sm text-muted">{eyebrow}</div> : null}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="max-w-2xl text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}

export function ErrorState({
  title,
  error,
  onRetry,
  className,
}: {
  title: string
  error?: unknown
  onRetry?: () => void
  className?: string
}) {
  const message =
    error instanceof Error && error.message
      ? error.message
      : "Check your connection, then try again."
  return (
    <Card role="alert" className={cn("flex flex-col items-start gap-3", className)}>
      <CardTitle>{title}</CardTitle>
      <p className="text-sm text-muted">{message}</p>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          <RotateCwIcon />
          Try again
        </Button>
      ) : null}
    </Card>
  )
}

export function LoadingState({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label={label}>
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-5 w-96 max-w-full" />
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-28 w-full rounded-lg" />
      ))}
    </div>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  children,
  actions,
  className,
}: {
  icon?: LucideIcon
  title: string
  children?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <Card className={cn("flex flex-col items-center gap-3 px-6 py-10 text-center", className)}>
      {Icon ? (
        <span className="flex size-10 items-center justify-center rounded-full bg-surface-2 text-accent">
          <Icon aria-hidden className="size-5" />
        </span>
      ) : null}
      <CardTitle>{title}</CardTitle>
      {children ? <div className="max-w-md text-sm text-muted">{children}</div> : null}
      {actions ? <div className="mt-1 flex flex-wrap justify-center gap-2">{actions}</div> : null}
    </Card>
  )
}

/** The sign-in link that comes back to this page afterwards. */
export function useSignInHref(): string {
  const pathname = usePathname() ?? "/"
  return `/login?next=${encodeURIComponent(pathname)}`
}

/**
 * A private page for a visitor who is not signed in (proxy.ts normally sends them to
 * /login first; this covers a session that ends while the page is open).
 */
export function SignedOutState({
  title,
  pitch,
  icon,
  points = [],
}: {
  title: string
  pitch: string
  icon?: LucideIcon
  points?: string[]
}) {
  const href = useSignInHref()
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={title} />
      <EmptyState
        icon={icon}
        title="Sign in to use this page"
        actions={
          <>
            <Button asChild>
              <Link href={href}>
                <LogInIcon />
                Continue to sign in
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/p/valid-palindrome">Try a problem first</Link>
            </Button>
          </>
        }
      >
        <p>{pitch}</p>
        {points.length ? (
          <ul className="mt-3 flex flex-col gap-1 text-left">
            {points.map((point) => (
              <li key={point} className="flex gap-2">
                <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />
                {point}
              </li>
            ))}
          </ul>
        ) : null}
      </EmptyState>
    </div>
  )
}

/** Renders `children` for a signed-in user, a skeleton while auth loads, else `signedOut`. */
export function RequireAuth({
  children,
  signedOut,
  loadingLabel,
}: {
  children: React.ReactNode
  signedOut: React.ReactNode
  loadingLabel: string
}) {
  const auth = useAuth()
  if (auth.status === "loading") return <LoadingState label={loadingLabel} />
  if (auth.status === "signed_out") return <>{signedOut}</>
  return <>{children}</>
}
