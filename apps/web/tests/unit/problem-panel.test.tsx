import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { MAX_NOTE_BYTES, NOTES_SAVE_DELAY_MS, NotesBox } from "@/components/workspace/NotesBox"
import { ProblemPanel } from "@/components/workspace/ProblemPanel"
import type { AuthSnapshot } from "@/lib/auth/session"

import { HINTS, stubApi } from "./coach-fixtures"
import { renderWithProviders, resetWorkspace, setWorkspace } from "./coach-render"
import { PALINDROME } from "./fixtures"

// The problem panel (Section 7.2): signal highlights after rung 2, and notes.

const auth = vi.hoisted(() => ({ current: { status: "signed_out", user: null } as AuthSnapshot }))
vi.mock("@/lib/auth/session", () => ({
  useAuth: () => auth.current,
  getAuthHeaders: async () => ({}),
  refreshSession: async () => false,
}))

const SIGNED_IN: AuthSnapshot = {
  status: "signed_in",
  user: { id: "11111111-1111-4111-8111-111111111111", email: null, name: null, provider: "dev" },
}

const PROBLEM = {
  ...PALINDROME,
  summary:
    "Decide whether `s` reads the same forward and backward once you ignore letter case.\n\nA string with no letters counts too.",
  constraints: ["1 ≤ len(s) ≤ 2·10⁵", "**Letter case** does not matter"],
}

afterEach(() => {
  resetWorkspace()
  auth.current = { status: "signed_out", user: null }
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe("signal highlights", () => {
  beforeEach(() => {
    stubApi()
  })

  it("marks nothing before rung 2", () => {
    setWorkspace({ openedRungs: [HINTS[1]] })
    renderWithProviders(<ProblemPanel problem={PROBLEM} />)
    expect(document.querySelectorAll("mark")).toHaveLength(0)
  })

  it("marks every signal phrase in the summary and constraints once rung 2 is open", async () => {
    setWorkspace({ openedRungs: [HINTS[1], HINTS[2]] })
    renderWithProviders(<ProblemPanel problem={PROBLEM} />)
    const marks = [...document.querySelectorAll("mark")].map((mark) => mark.textContent)
    expect(marks).toEqual([
      "reads the same forward and backward",
      "letter case",
      "Letter case", // inside **bold**, whatever its case
    ])
    // Hover or focus shows what the phrase means.
    const first = document.querySelector("mark") as HTMLElement
    act(() => first.focus())
    expect(
      (await screen.findAllByText("Mirrored pairs: check from both ends inward.")).length
    ).toBeGreaterThan(0)
  })

  it("never marks a phrase inside a longer word", () => {
    setWorkspace({ openedRungs: [HINTS[1], HINTS[2]] })
    renderWithProviders(
      <ProblemPanel problem={{ ...PROBLEM, summary: "Mind the letter cases.", constraints: [] }} />
    )
    expect(document.querySelectorAll("mark")).toHaveLength(0)
  })
})

describe("notes", () => {
  it("asks guests to sign in", () => {
    stubApi()
    renderWithProviders(<NotesBox slug="valid-palindrome" />)
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login")
    expect(screen.queryByRole("textbox", { name: "Notes" })).not.toBeInTheDocument()
  })

  it("loads the notes, then saves 800 ms after the last keystroke", async () => {
    auth.current = SIGNED_IN
    const saved: string[] = []
    const fetchMock = stubApi({
      "/problems/valid-palindrome/notes": (init?: RequestInit) => {
        if (init?.method === "PUT") saved.push(JSON.parse(String(init.body)).body)
        const body = init?.method === "PUT" ? JSON.parse(String(init.body)).body : "old note"
        return new Response(JSON.stringify({ body, updatedAt: "2026-09-30T12:00:00Z" }), {
          headers: { "Content-Type": "application/json" },
        })
      },
    })
    renderWithProviders(<NotesBox slug="valid-palindrome" />)
    const box = await screen.findByDisplayValue("old note")
    vi.useFakeTimers()
    fireEvent.change(box, { target: { value: "new" } })
    fireEvent.change(box, { target: { value: "new note" } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(NOTES_SAVE_DELAY_MS - 1)
    })
    expect(saved).toEqual([])
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(saved).toEqual(["new note"])
    vi.useRealTimers()
    await waitFor(() => expect(screen.getByText("Saved")).toBeInTheDocument())
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/problems\/valid-palindrome\/notes$/),
      expect.objectContaining({ method: "PUT" })
    )
  })

  it("saves right away when the page hides", async () => {
    auth.current = SIGNED_IN
    const puts: RequestInit[] = []
    stubApi({
      "/problems/valid-palindrome/notes": (init?: RequestInit) => {
        if (init?.method === "PUT") puts.push(init)
        return new Response(JSON.stringify({ body: "", updatedAt: null }), {
          headers: { "Content-Type": "application/json" },
        })
      },
    })
    renderWithProviders(<NotesBox slug="valid-palindrome" />)
    const box = await screen.findByRole("textbox", { name: "Notes" })
    await waitFor(() => expect(box).toBeEnabled())
    fireEvent.change(box, { target: { value: "leaving" } })
    fireEvent(window, new Event("pagehide"))
    await waitFor(() => expect(puts).toHaveLength(1))
    expect(puts[0]).toMatchObject({ keepalive: true })
  })

  it("refuses notes over 10 KB", async () => {
    auth.current = SIGNED_IN
    stubApi({ "/problems/valid-palindrome/notes": { body: "", updatedAt: null } })
    renderWithProviders(<NotesBox slug="valid-palindrome" />)
    const box = await screen.findByRole("textbox", { name: "Notes" })
    await waitFor(() => expect(box).toBeEnabled())
    fireEvent.change(box, { target: { value: "é".repeat(MAX_NOTE_BYTES / 2 + 1) } })
    expect(
      within(box.parentElement as HTMLElement).getByText(
        "Notes can be at most 10 KB. Shorten them to save."
      )
    ).toBeInTheDocument()
  })
})
