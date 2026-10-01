// Small formatting helpers shared by Today, Stats, Drills, Review and the Problems list.

/** "45 s", "2 min 5 s", "1 h 4 min"; null for no value. */
export function formatSeconds(seconds: number | null | undefined): string | null {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return null
  const total = Math.max(0, Math.round(seconds))
  if (total < 60) return `${total} s`
  const minutes = Math.floor(total / 60)
  const rest = total % 60
  if (minutes < 60) return rest ? `${minutes} min ${rest} s` : `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return mins ? `${hours} h ${mins} min` : `${hours} h`
}

/** "just now", "5 minutes ago", "yesterday", "3 days ago", "on Sep 2". */
export function formatRelative(
  iso: string | null | undefined,
  now: Date = new Date()
): string | null {
  if (!iso) return null
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return null
  const seconds = Math.round((now.getTime() - then.getTime()) / 1000)
  if (seconds < 60) return "just now"
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`
  const startOfDay = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const days = Math.round((startOfDay(now) - startOfDay(then)) / 86_400_000)
  if (days <= 1) return "yesterday"
  if (days < 7) return `${days} days ago`
  return `on ${then.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
}

/** "75%"; null for no value. */
export function formatPercent(rate: number | null | undefined): string | null {
  if (rate === null || rate === undefined || !Number.isFinite(rate)) return null
  return `${Math.round(rate * 100)}%`
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}
