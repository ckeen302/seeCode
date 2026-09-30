// Public configuration, inlined at build time (NEXT_PUBLIC_*; Section 22.2).
// Each variable must be referenced literally for Next.js to inline it.

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

export const env = {
  apiUrl: (clean(process.env.NEXT_PUBLIC_API_URL) ?? "http://localhost:8000/api/v1").replace(
    /\/+$/,
    ""
  ),
  supabaseUrl: clean(process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  devBypass: clean(process.env.NEXT_PUBLIC_AUTH_DEV_BYPASS) === "true",
} as const

export const supabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey)
