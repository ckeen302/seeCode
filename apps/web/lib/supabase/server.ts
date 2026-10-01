// Supabase client for Server Components and Route Handlers. Null until configured.
import { createServerClient } from "@supabase/ssr"
import type { SupabaseClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"

import { env, supabaseConfigured } from "@/lib/env"

export async function createSupabaseServerClient(): Promise<SupabaseClient | null> {
  if (!supabaseConfigured || !env.supabaseUrl || !env.supabaseAnonKey) return null
  const cookieStore = await cookies()
  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // proxy.ts refreshes the session on every navigation instead.
        }
      },
    },
  })
}
