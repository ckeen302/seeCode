// Public API data fetched by the Next.js server (Section 17.1: public pages call the API
// from the server with `revalidate: 3600`).
import { ProblemPublicSchema } from "@/lib/api/schemas"
import { env } from "@/lib/env"

/**
 * The API base URL as the server sees it: the same-origin proxy target when one is set
 * (then NEXT_PUBLIC_API_URL may be the relative "/api/v1"), else NEXT_PUBLIC_API_URL.
 */
export function serverApiUrl(): string | null {
  const proxyTarget = process.env.API_PROXY_TARGET?.trim().replace(/\/+$/, "")
  if (proxyTarget) return `${proxyTarget}/api/v1`
  return /^https?:\/\//.test(env.apiUrl) ? env.apiUrl : null
}

const TitleSchema = ProblemPublicSchema.pick({ title: true })

/** A problem's title for the tab, or null when the API does not answer quickly. */
export async function fetchProblemTitle(slug: string): Promise<string | null> {
  const base = serverApiUrl()
  if (!base) return null
  try {
    const response = await fetch(`${base}/content/problems/${encodeURIComponent(slug)}`, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(2000),
    })
    if (!response.ok) return null
    const parsed = TitleSchema.safeParse(await response.json())
    return parsed.success ? parsed.data.title : null
  } catch {
    return null
  }
}
