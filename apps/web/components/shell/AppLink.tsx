"use client"

import Link from "next/link"

import { redirectTarget } from "@/lib/auth/routes"
import { useAuth } from "@/lib/auth/session"

/**
 * A Link that skips prefetching pages proxy.ts would redirect for this visitor (a private
 * page while signed out, the landing page while signed in). Next.js answers a redirected
 * segment prefetch with a 404, which only adds noise.
 */
export function AppLink({ prefetch, ...props }: React.ComponentProps<typeof Link>) {
  const auth = useAuth()
  const path = typeof props.href === "string" ? props.href.split(/[?#]/)[0] : props.href.pathname
  const mayRedirect =
    path !== undefined &&
    path !== null &&
    (auth.status === "loading"
      ? redirectTarget(path, true) !== null || redirectTarget(path, false) !== null
      : redirectTarget(path, auth.status === "signed_in") !== null)
  return <Link prefetch={mayRedirect ? false : prefetch} {...props} />
}
