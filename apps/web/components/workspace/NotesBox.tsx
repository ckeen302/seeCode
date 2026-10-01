"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { NotebookPenIcon } from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useId, useRef, useState } from "react"

import { getNotes, putNotes } from "@/lib/api/attempts"
import { api } from "@/lib/api/hooks"
import type { NoteView } from "@/lib/api/schemas"
import { useAuth } from "@/lib/auth/session"

// Notes (Section 7.2): free text per user per problem at the bottom of the problem panel,
// saved 800 ms after the last keystroke (`PUT /problems/{slug}/notes`) and when the page
// is hidden. Guests are offered sign-in instead: notes live with an account.

export const NOTES_SAVE_DELAY_MS = 800
/** Section 20: notes are at most 10 KB (UTF-8). */
export const MAX_NOTE_BYTES = 10 * 1024

type SaveState = "idle" | "saving" | "saved" | "error" | "too-long"

const encoder = new TextEncoder()

export function notesQueryKey(slug: string, userId: string) {
  return ["notes", slug, userId] as const
}

function NotesEditor({ slug, userId }: { slug: string; userId: string }) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: notesQueryKey(slug, userId),
    queryFn: () => getNotes(api, slug),
    staleTime: Number.POSITIVE_INFINITY,
  })
  const [draft, setDraft] = useState<string | null>(null)
  const [state, setState] = useState<SaveState>("idle")
  const pending = useRef<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const id = useId()

  const flush = useCallback(
    (keepalive = false) => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
      const body = pending.current
      if (body === null) return
      pending.current = null
      setState("saving")
      putNotes(api, slug, body, keepalive ? { keepalive: true } : undefined)
        .then((saved: NoteView) => {
          queryClient.setQueryData(notesQueryKey(slug, userId), saved)
          if (pending.current === null) setState("saved")
        })
        .catch(() => {
          // Kept for the next keystroke or page hide.
          pending.current ??= body
          setState("error")
        })
    },
    [queryClient, slug, userId]
  )

  useEffect(() => {
    const onHide = () => flush(true)
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush(true)
    }
    window.addEventListener("pagehide", onHide)
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      window.removeEventListener("pagehide", onHide)
      document.removeEventListener("visibilitychange", onVisibility)
      flush(true)
    }
  }, [flush])

  const value = draft ?? query.data?.body ?? ""
  const status =
    state === "saving"
      ? "Saving…"
      : state === "saved"
        ? "Saved"
        : state === "error"
          ? "Couldn't save. SeeCode will try again."
          : state === "too-long"
            ? "Notes can be at most 10 KB. Shorten them to save."
            : ""

  return (
    <div className="flex flex-col gap-2">
      <textarea
        id={id}
        aria-label="Notes"
        aria-describedby={`${id}-status`}
        value={value}
        disabled={query.isPending}
        placeholder={
          query.isPending
            ? "Loading your notes…"
            : query.isError
              ? "Your notes couldn't be loaded. New notes still save."
              : "Anything worth remembering: a trick, a mistake, a question. Only you see these."
        }
        rows={4}
        onChange={(event) => {
          const next = event.target.value
          setDraft(next)
          if (timer.current) clearTimeout(timer.current)
          if (encoder.encode(next).length > MAX_NOTE_BYTES) {
            pending.current = null
            setState("too-long")
            return
          }
          pending.current = next
          setState("idle")
          timer.current = setTimeout(() => flush(), NOTES_SAVE_DELAY_MS)
        }}
        className="min-h-24 w-full resize-y rounded-md border border-border bg-bg p-2.5 text-sm text-text placeholder:text-muted hover:border-muted/60 disabled:opacity-70"
      />
      <p id={`${id}-status`} aria-live="polite" className="min-h-4 text-xs text-muted">
        {status}
      </p>
    </div>
  )
}

/** The notes box under the problem (7.2). */
export function NotesBox({ slug }: { slug: string }) {
  const auth = useAuth()
  return (
    <div className="flex flex-col gap-3">
      <h2 className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted uppercase">
        <NotebookPenIcon aria-hidden className="size-3.5" />
        Notes
      </h2>
      {auth.status === "signed_in" ? (
        <NotesEditor key={`${slug}:${auth.user.id}`} slug={slug} userId={auth.user.id} />
      ) : auth.status === "signed_out" ? (
        <p className="text-sm text-muted">
          <Link href="/login" className="text-text underline underline-offset-2">
            Sign in
          </Link>{" "}
          to keep notes on this problem.
        </p>
      ) : null}
    </div>
  )
}
