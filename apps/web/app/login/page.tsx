import type { Metadata } from "next"
import { AppLink } from "@/components/shell/AppLink"

import { LoginPanel } from "@/components/auth/LoginPanel"
import { safeNextPath } from "@/lib/auth/routes"

export const metadata: Metadata = { title: "Sign in" }

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams
  const next = safeNextPath(typeof params.next === "string" ? params.next : null)
  const authFailed = params.error === "auth"

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-12">
      <AppLink href="/" className="text-base font-semibold tracking-tight">
        SeeCode
      </AppLink>
      <main id="main" className="w-full max-w-sm">
        <LoginPanel next={next} authFailed={authFailed} />
      </main>
    </div>
  )
}
