// Route access rules (Section 5).

/** Routes that need a signed-in user. Everything else is public. */
export const PROTECTED_PREFIXES = ["/today", "/drills", "/review", "/stats", "/settings"] as const

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
}

/** Only same-site relative paths may be used as a post-sign-in redirect. */
export function safeNextPath(next: string | null | undefined, fallback = "/today"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback
  }
  return next
}

/**
 * Where proxy.ts sends a visitor instead of this page, or null to serve it (Section 5):
 * signed-in visitors skip the landing page; signed-out visitors sign in first.
 */
export function redirectTarget(pathname: string, signedIn: boolean): "/today" | "/login" | null {
  if (pathname === "/" && signedIn) return "/today"
  if (!signedIn && isProtectedPath(pathname)) return "/login"
  return null
}
