import { NextResponse, type NextRequest } from "next/server"

import { safeNextPath } from "@/lib/auth/routes"
import { createSupabaseServerClient } from "@/lib/supabase/server"

// OAuth return URL: exchange the one-time code for a session cookie, then continue.
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const next = safeNextPath(url.searchParams.get("next"))

  if (code) {
    const supabase = await createSupabaseServerClient()
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      if (!error) return NextResponse.redirect(new URL(next, url.origin))
    }
  }
  return NextResponse.redirect(new URL("/login?error=auth", url.origin))
}
