"use client"

import { useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"

import { api } from "@/lib/api/hooks"
import { useAuth } from "@/lib/auth/session"
import { toast } from "@/lib/toast"
import { hasGuestAttempts, importGuestAttempts, onGuestImport } from "@/lib/workspace/guestImport"

// Journey 4.1: once someone signs in, whatever they did as a guest in this browser goes to
// their account, on whichever page they land. Mounted once, next to the toasts.

/** Queries whose answers do not depend on the user: an import leaves them alone. */
const CONTENT_KEYS = new Set(["problem", "patterns", "structures", "toolkit"])

export function GuestImport() {
  const auth = useAuth()
  const queryClient = useQueryClient()
  const userId = auth.status === "signed_in" ? auth.user.id : null

  useEffect(
    () =>
      onGuestImport((event) => {
        if (!event.ok) {
          toast("Couldn't save your guest progress yet", {
            description: "It's still in this browser. SeeCode will try again on your next visit.",
            tone: "error",
          })
          return
        }
        const { imported } = event.result
        if (imported === 0) return
        toast("Saved your progress", {
          description: `${imported} ${imported === 1 ? "problem" : "problems"} from your guest session ${imported === 1 ? "is" : "are"} now in your account.`,
          tone: "success",
        })
        void queryClient.invalidateQueries({
          predicate: (query) => !CONTENT_KEYS.has(String(query.queryKey[0])),
        })
      }),
    [queryClient]
  )

  useEffect(() => {
    if (!userId || !hasGuestAttempts()) return
    importGuestAttempts(api).catch(() => {
      // Reported through onGuestImport; tried again on the next page load.
    })
  }, [userId])

  return null
}
