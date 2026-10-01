// Public configuration, inlined at build time (NEXT_PUBLIC_*; Section 22.2).
// Each variable must be referenced literally for Next.js to inline it.

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

/** Latest stable Pyodide at M2 (verified on npm and jsDelivr); NEXT_PUBLIC_PYODIDE_VERSION overrides it. */
export const DEFAULT_PYODIDE_VERSION = "314.0.7"

export const env = {
  apiUrl: (clean(process.env.NEXT_PUBLIC_API_URL) ?? "http://localhost:8000/api/v1").replace(
    /\/+$/,
    ""
  ),
  supabaseUrl: clean(process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  devBypass: clean(process.env.NEXT_PUBLIC_AUTH_DEV_BYPASS) === "true",
  pyodideVersion: clean(process.env.NEXT_PUBLIC_PYODIDE_VERSION) ?? DEFAULT_PYODIDE_VERSION,
} as const

export const supabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey)

/** Where the pinned Pyodide release is served from (Section 9.1: jsDelivr CDN). */
export function pyodideIndexUrl(version: string = env.pyodideVersion): string {
  return `https://cdn.jsdelivr.net/pyodide/v${version.replace(/^v/, "")}/full/`
}
