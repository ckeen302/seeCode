import { NextResponse, type NextRequest } from "next/server"

import { DEV_USER_COOKIE, isValidDevUserId } from "@/lib/auth/dev"
import { redirectTarget, safeNextPath } from "@/lib/auth/routes"
import { env } from "@/lib/env"
import { updateSession } from "@/lib/supabase/proxy"

// Runs before every page request: refreshes the Supabase session, sends signed-in
// visitors from the landing page to Today, and signed-out visitors from private pages
// to /login (Section 5). This is an optimistic check; the API verifies every request.
export async function proxy(request: NextRequest) {
  const { response, signedIn: supabaseSignedIn } = await updateSession(request)
  const devSignedIn = env.devBypass && isValidDevUserId(request.cookies.get(DEV_USER_COOKIE)?.value)
  const signedIn = supabaseSignedIn || devSignedIn
  const { pathname, search } = request.nextUrl

  const target = redirectTarget(pathname, signedIn)
  if (!target) return response
  const url = new URL(target, request.url)
  if (target === "/login") url.searchParams.set("next", safeNextPath(pathname + search))
  return redirectKeepingCookies(url, response)
}

// A refreshed session must survive the redirect.
function redirectKeepingCookies(url: URL, from: NextResponse): NextResponse {
  const redirect = NextResponse.redirect(url)
  for (const cookie of from.cookies.getAll()) redirect.cookies.set(cookie)
  return redirect
}

// Skips static files and /api/ (the optional same-origin API proxy; the API checks auth).
export const config = {
  matcher: [
    "/((?!api/|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|py/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|woff2?)$).*)",
  ],
}
