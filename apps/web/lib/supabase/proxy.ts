// Session refresh for proxy.ts: validates the Supabase session on each navigation and
// writes refreshed auth cookies (and their no-cache headers) to the response.
import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

import { env, supabaseConfigured } from "@/lib/env"

export async function updateSession(
  request: NextRequest
): Promise<{ response: NextResponse; signedIn: boolean }> {
  let response = NextResponse.next({ request })
  if (!supabaseConfigured || !env.supabaseUrl || !env.supabaseAnonKey) {
    return { response, signedIn: false }
  }

  const supabase = createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value)
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options)
        }
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value)
      },
    },
  })

  // getClaims verifies the token (and refreshes it when expired). Do not run code
  // between creating the client and this call.
  const { data } = await supabase.auth.getClaims()
  return { response, signedIn: Boolean(data?.claims) }
}
