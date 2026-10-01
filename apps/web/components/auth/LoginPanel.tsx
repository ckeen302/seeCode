"use client"

import { CircleAlertIcon, UserPlusIcon, UserRoundIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardTitle } from "@/components/ui/card"
import { DEV_USERS } from "@/lib/auth/dev"
import { signInAsDevUser } from "@/lib/auth/session"
import { env, supabaseConfigured } from "@/lib/env"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

type Provider = "github" | "google"

export function LoginPanel({ next, authFailed }: { next: string; authFailed: boolean }) {
  const router = useRouter()
  const [pending, setPending] = useState<Provider | null>(null)
  const [error, setError] = useState<string | null>(
    authFailed ? "Sign-in didn't finish. Please try again." : null
  )

  async function signInWith(provider: Provider) {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return
    setPending(provider)
    setError(null)
    const callback = new URL("/auth/callback", window.location.origin)
    callback.searchParams.set("next", next)
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: callback.toString() },
    })
    if (oauthError) {
      setPending(null)
      setError("Couldn't reach the sign-in service. Please try again.")
    }
  }

  function continueAsDevUser(id: string) {
    signInAsDevUser(id)
    router.replace(next)
    router.refresh()
  }

  return (
    <Card className="flex flex-col gap-5 p-6">
      <div className="flex flex-col gap-1">
        <CardTitle className="text-xl">Sign in to SeeCode</CardTitle>
        <p className="text-sm text-muted">Save your progress and get daily reviews.</p>
      </div>

      {error ? (
        <p role="alert" className="flex items-start gap-2 text-sm">
          <CircleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-error" />
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <Button
          onClick={() => signInWith("github")}
          disabled={!supabaseConfigured || pending !== null}
        >
          {pending === "github" ? "Opening GitHub…" : "Continue with GitHub"}
        </Button>
        <Button
          variant="secondary"
          onClick={() => signInWith("google")}
          disabled={!supabaseConfigured || pending !== null}
        >
          {pending === "google" ? "Opening Google…" : "Continue with Google"}
        </Button>
        {!supabaseConfigured ? (
          <p className="text-xs text-muted">
            Sign-in with GitHub and Google isn&apos;t set up on this server yet.
          </p>
        ) : null}
      </div>

      {env.devBypass ? (
        <section
          aria-labelledby="dev-sign-in"
          className="flex flex-col gap-2 border-t border-border pt-4"
        >
          <h2 id="dev-sign-in" className="text-sm font-medium">
            Developer sign-in
          </h2>
          <p className="text-xs text-muted">Local development only. No account needed.</p>
          {DEV_USERS.map((user) => (
            <Button
              key={user.id}
              variant="ghost"
              className="justify-start"
              onClick={() => continueAsDevUser(user.id)}
            >
              <UserRoundIcon />
              Continue as {user.label}
            </Button>
          ))}
          <Button
            variant="ghost"
            className="justify-start"
            onClick={() => continueAsDevUser(crypto.randomUUID())}
          >
            <UserPlusIcon />
            New dev user
          </Button>
        </section>
      ) : null}
    </Card>
  )
}
