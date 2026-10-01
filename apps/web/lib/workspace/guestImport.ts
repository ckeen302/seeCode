// Journey 4.1: a guest's attempts (`seecode:guest:attempts`) go to the account right after
// sign-in, through `POST /guest/import`. One upload runs at a time per page; the Workspace
// waits for it before `POST /attempts`, so an imported unsolved attempt is the one resumed.
import { importGuestAttemptsRequest } from "@/lib/api/attempts"
import type { ApiClient } from "@/lib/api/client"
import {
  browserStorage,
  readGuestAttempts,
  removeGuestAttempts,
  type StorageLike,
} from "@/lib/workspace/storage"

export interface GuestImportResult {
  /** Attempts sent (0 when there was nothing to send). */
  sent: number
  /** Attempts the API added (an attempt sent twice is added once). */
  imported: number
}

export type GuestImportEvent =
  { ok: true; result: GuestImportResult } | { ok: false; error: unknown }

let inFlight: Promise<GuestImportResult> | null = null
const listeners = new Set<(event: GuestImportEvent) => void>()

/** Hears about every upload that sent something, whoever started it (for the toast). */
export function onGuestImport(listener: (event: GuestImportEvent) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Whether this browser holds guest attempts that were not uploaded yet. */
export function hasGuestAttempts(storage: StorageLike | null = browserStorage()): boolean {
  return readGuestAttempts(storage).length > 0
}

/**
 * Uploads this browser's guest attempts, then forgets the ones the API took. A failure
 * keeps them for the next try (the API never imports the same attempt twice).
 */
export function importGuestAttempts(
  api: ApiClient,
  storage: StorageLike | null = browserStorage()
): Promise<GuestImportResult> {
  if (inFlight) return inFlight
  const upload = async (): Promise<GuestImportResult> => {
    const attempts = readGuestAttempts(storage)
    if (attempts.length === 0) return { sent: 0, imported: 0 }
    let imported: number
    try {
      imported = await importGuestAttemptsRequest(api, attempts)
    } catch (error) {
      listeners.forEach((listener) => listener({ ok: false, error }))
      throw error
    }
    removeGuestAttempts(storage, attempts)
    const result = { sent: attempts.length, imported }
    listeners.forEach((listener) => listener({ ok: true, result }))
    return result
  }
  // `.finally` runs after the assignment, even when `upload` settles at once.
  const running = upload().finally(() => {
    if (inFlight === running) inFlight = null
  })
  inFlight = running
  return running
}
