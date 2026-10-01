// Who is signed in, on the client: a Supabase session, or the dev user cookie when
// NEXT_PUBLIC_AUTH_DEV_BYPASS is on. Exposed as an external store so React renders
// "loading" during hydration (matching the server) and the real state right after.
import type { Session } from "@supabase/supabase-js"
import { useSyncExternalStore } from "react"

import { clearDevUserCookie, readDevUserId, writeDevUserCookie } from "@/lib/auth/dev"
import { env } from "@/lib/env"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

export interface SignedInUser {
  id: string
  email: string | null
  name: string | null
  provider: "supabase" | "dev"
}

export type AuthSnapshot =
  | { status: "loading"; user: null }
  | { status: "signed_out"; user: null }
  | { status: "signed_in"; user: SignedInUser }

const LOADING: AuthSnapshot = { status: "loading", user: null }
const SIGNED_OUT: AuthSnapshot = { status: "signed_out", user: null }

let snapshot: AuthSnapshot = LOADING
let started = false
let supabaseSession: Session | null = null
let supabaseReady = false
const listeners = new Set<() => void>()

function userFromSession(session: Session): SignedInUser {
  const metadata = session.user.user_metadata ?? {}
  const name =
    typeof metadata.full_name === "string"
      ? metadata.full_name
      : typeof metadata.name === "string"
        ? metadata.name
        : null
  return { id: session.user.id, email: session.user.email ?? null, name, provider: "supabase" }
}

function devUser(): SignedInUser | null {
  if (!env.devBypass) return null
  const id = readDevUserId(document.cookie)
  return id ? { id, email: null, name: null, provider: "dev" } : null
}

function compute(): AuthSnapshot {
  if (supabaseSession) return { status: "signed_in", user: userFromSession(supabaseSession) }
  if (getSupabaseBrowserClient() && !supabaseReady) return LOADING
  const dev = devUser()
  return dev ? { status: "signed_in", user: dev } : SIGNED_OUT
}

function publish(): void {
  const next = compute()
  if (JSON.stringify(next) !== JSON.stringify(snapshot)) {
    snapshot = next
    listeners.forEach((listener) => listener())
  }
}

function start(): void {
  if (started) return
  started = true
  const supabase = getSupabaseBrowserClient()
  if (!supabase) {
    publish()
    return
  }
  // Fires INITIAL_SESSION first, then sign-in, sign-out and token refresh events.
  supabase.auth.onAuthStateChange((_event, session) => {
    supabaseSession = session
    supabaseReady = true
    publish()
  })
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  start()
  return () => listeners.delete(listener)
}

export function useAuth(): AuthSnapshot {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => LOADING
  )
}

/** Headers that identify the user to the API: a bearer token, or X-Dev-User. */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const supabase = getSupabaseBrowserClient()
  if (supabase) {
    const { data } = await supabase.auth.getSession()
    if (data.session) return { Authorization: `Bearer ${data.session.access_token}` }
  }
  const dev = devUser()
  return dev ? { "X-Dev-User": dev.id } : {}
}

/** After a 401: try one token refresh. True if a new session is available. */
export async function refreshSession(): Promise<boolean> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return false
  const { data, error } = await supabase.auth.refreshSession()
  return !error && Boolean(data.session)
}

export function signInAsDevUser(id: string): void {
  writeDevUserCookie(id)
  publish()
}

export async function signOut(): Promise<void> {
  const supabase = getSupabaseBrowserClient()
  if (supabase) await supabase.auth.signOut()
  clearDevUserCookie()
  supabaseSession = null
  publish()
}
