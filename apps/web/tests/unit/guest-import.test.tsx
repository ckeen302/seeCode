import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { GuestImport } from "@/components/workspace/GuestImport"
import { Toaster } from "@/components/ui/toast"
import { createApiClient } from "@/lib/api/client"
import type { AuthSnapshot } from "@/lib/auth/session"
import { resetToasts } from "@/lib/toast"
import { hasGuestAttempts, importGuestAttempts, onGuestImport } from "@/lib/workspace/guestImport"
import { GUEST_ATTEMPTS_KEY, readGuestAttempts, upsertGuestAttempt } from "@/lib/workspace/storage"

import { MemoryStorage } from "./coach-fixtures"

// Journey 4.1: a guest's attempts go to the account after sign-in (`POST /guest/import`).

const auth = vi.hoisted(() => ({ current: { status: "signed_out", user: null } as AuthSnapshot }))
vi.mock("@/lib/auth/session", () => ({
  useAuth: () => auth.current,
  getAuthHeaders: async () => ({}),
  refreshSession: async () => false,
}))

const ATTEMPT = {
  slug: "valid-palindrome",
  code: "x = 1",
  solved: true,
  startedAt: "2026-09-30T10:00:00.000Z",
  solvedAt: "2026-09-30T10:20:00.000Z",
  maxRung: 2,
  planChecks: 1,
  activeSeconds: 600,
  plannedFirst: true,
  planSkipped: false,
}

function client(answer: () => Promise<Response>) {
  const fetchMock = vi.fn(answer)
  return {
    api: createApiClient({ baseUrl: "http://api.test/api/v1", fetch: fetchMock }),
    fetchMock,
  }
}

const ok = (imported: number) => async () =>
  new Response(JSON.stringify({ imported }), { headers: { "Content-Type": "application/json" } })

afterEach(() => {
  auth.current = { status: "signed_out", user: null }
  vi.unstubAllGlobals()
  act(() => resetToasts())
})

describe("importGuestAttempts", () => {
  it("uploads every guest attempt once, then forgets them", async () => {
    const storage = new MemoryStorage()
    upsertGuestAttempt(storage, ATTEMPT)
    upsertGuestAttempt(storage, { ...ATTEMPT, slug: "two-sum", solved: false, solvedAt: null })
    const { api, fetchMock } = client(ok(2))
    const [first, second] = await Promise.all([
      importGuestAttempts(api, storage),
      importGuestAttempts(api, storage),
    ])
    expect(first).toEqual({ sent: 2, imported: 2 })
    expect(second).toBe(first)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("http://api.test/api/v1/guest/import")
    expect(JSON.parse(String(init.body)).attempts.map((a: { slug: string }) => a.slug)).toEqual([
      "valid-palindrome",
      "two-sum",
    ])
    expect(storage.getItem(GUEST_ATTEMPTS_KEY)).toBeNull()
    expect(hasGuestAttempts(storage)).toBe(false)
  })

  it("sends nothing when there is nothing to send, and can run again later", async () => {
    const storage = new MemoryStorage()
    const { api, fetchMock } = client(ok(1))
    expect(await importGuestAttempts(api, storage)).toEqual({ sent: 0, imported: 0 })
    upsertGuestAttempt(storage, ATTEMPT)
    expect(await importGuestAttempts(api, storage)).toEqual({ sent: 1, imported: 1 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("keeps the attempts when the upload fails, and tells listeners", async () => {
    const storage = new MemoryStorage()
    upsertGuestAttempt(storage, ATTEMPT)
    const listener = vi.fn()
    const stop = onGuestImport(listener)
    const { api } = client(async () => new Response("", { status: 502 }))
    await expect(importGuestAttempts(api, storage)).rejects.toThrow()
    expect(readGuestAttempts(storage)).toHaveLength(1)
    expect(listener).toHaveBeenCalledWith({ ok: false, error: expect.any(Error) })
    stop()
  })
})

describe("GuestImport", () => {
  it("imports after sign-in and says so in a toast", async () => {
    upsertGuestAttempt(window.localStorage, ATTEMPT)
    const fetchMock = vi.fn(ok(1))
    vi.stubGlobal("fetch", fetchMock)
    auth.current = {
      status: "signed_in",
      user: {
        id: "11111111-1111-4111-8111-111111111111",
        email: null,
        name: null,
        provider: "dev",
      },
    }
    render(
      <QueryClientProvider client={new QueryClient()}>
        <GuestImport />
        <Toaster />
      </QueryClientProvider>
    )
    expect(await screen.findByText("Saved your progress")).toBeInTheDocument()
    expect(
      screen.getByText("1 problem from your guest session is now in your account.")
    ).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/guest\/import$/),
      expect.objectContaining({ method: "POST" })
    )
    expect(window.localStorage.getItem(GUEST_ATTEMPTS_KEY)).toBeNull()
  })

  it("does nothing for a signed-out visitor", () => {
    upsertGuestAttempt(window.localStorage, ATTEMPT)
    const fetchMock = vi.fn(ok(1))
    vi.stubGlobal("fetch", fetchMock)
    render(
      <QueryClientProvider client={new QueryClient()}>
        <GuestImport />
      </QueryClientProvider>
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
