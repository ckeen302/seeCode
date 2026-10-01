// Supabase client for the browser (sign-in and session). Null until Supabase is configured.
import { createBrowserClient } from "@supabase/ssr"
import type { SupabaseClient } from "@supabase/supabase-js"

import { env, supabaseConfigured } from "@/lib/env"

let browserClient: SupabaseClient | null = null

export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (!supabaseConfigured || !env.supabaseUrl || !env.supabaseAnonKey) return null
  browserClient ??= createBrowserClient(env.supabaseUrl, env.supabaseAnonKey)
  return browserClient
}
