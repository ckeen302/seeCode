"use client"

import { Button } from "@/components/ui/button"
import { Card, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useMe } from "@/lib/api/hooks"

export function greetingFor(hour: number): string {
  if (hour >= 5 && hour < 12) return "Good morning"
  if (hour >= 12 && hour < 18) return "Good afternoon"
  return "Good evening"
}

export function firstName(displayName: string | null | undefined): string {
  const first = displayName?.trim().split(/\s+/)[0]
  return first || "there"
}

// Today (Section 6.2). M0 shows the greeting from /me; the cards arrive in M6.
export function TodayView() {
  const me = useMe()

  if (me.isPending) {
    return (
      <div className="flex flex-col gap-6" aria-busy="true">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-28 w-full" />
      </div>
    )
  }

  if (me.isError) {
    return (
      <Card role="alert" className="flex flex-col items-start gap-3">
        <CardTitle>Couldn&apos;t load your profile</CardTitle>
        <p className="text-sm text-muted">{me.error.message}</p>
        <Button variant="secondary" size="sm" onClick={() => void me.refetch()}>
          Try again
        </Button>
      </Card>
    )
  }

  const now = new Date()
  const date = now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {greetingFor(now.getHours())}, {firstName(me.data.displayName)}
        </h1>
        <p className="text-sm text-muted">{date}</p>
      </header>
      <Card className="flex flex-col gap-2">
        <CardTitle>Your daily plan</CardTitle>
        <p className="text-sm text-muted">
          Reviews, your next roadmap problem and a weak-spot drill appear here in milestone M6.
        </p>
      </Card>
    </div>
  )
}
