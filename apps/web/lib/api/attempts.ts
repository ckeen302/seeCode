// Attempt, guest and per-problem endpoints (Section 16.2) as plain async functions. The
// Workspace store takes them as one `AttemptApi`, so tests can swap in a fake.
import type { ApiClient } from "@/lib/api/client"
import {
  AttemptViewSchema,
  EndResultSchema,
  GuestImportResultSchema,
  GuestPlanResultSchema,
  HintContentSchema,
  NoteViewSchema,
  PatchResultSchema,
  PlanCheckResultSchema,
  SubmitResultSchema,
  WalkthroughPayloadSchema,
  type AttemptView,
  type HintContent,
  type NoteView,
  type PlanCard,
  type PlanCheckResult,
  type PlanGrade,
  type SubmitResult,
  type WalkthroughPayload,
  type Outcome,
} from "@/lib/api/schemas"
import type { TestResult } from "@/lib/runner/types"
import type { GuestAttempt } from "@/lib/workspace/storage"

/** `PATCH /attempts/{id}`: only what changed since the last sync. */
export interface AttemptPatch {
  code?: string
  activeSecondsDelta?: number
  runsDelta?: number
  lastResults?: TestResult[]
  /** The user dismissed the "Planning first helps it stick" tip with Skip (7.3). */
  planSkipped?: true
}

export interface AttemptApi {
  /** Resumes the active attempt of `slug`, or creates one. */
  start(slug: string): Promise<AttemptView>
  get(id: string): Promise<AttemptView>
  patch(id: string, body: AttemptPatch, options?: { keepalive?: boolean }): Promise<unknown>
  checkPlan(id: string, plan: PlanCard): Promise<PlanCheckResult>
  openRung(id: string, rung: number): Promise<HintContent>
  submit(id: string, code: string, results: TestResult[]): Promise<SubmitResult>
  end(id: string): Promise<{ outcome: Outcome }>
  restart(id: string): Promise<AttemptView>
  walkthrough(slug: string): Promise<WalkthroughPayload>
  guestCheckPlan(
    slug: string,
    plan: PlanCard,
    checkNumber: number,
    openedRung: number
  ): Promise<{ grade: PlanGrade }>
  guestHint(slug: string, rung: number): Promise<HintContent>
}

const path = (slug: string) => encodeURIComponent(slug)

export function createAttemptApi(api: ApiClient): AttemptApi {
  return {
    start: (slug) => api.post("/attempts", AttemptViewSchema, { slug }),
    get: (id) => api.get(`/attempts/${id}`, AttemptViewSchema),
    patch: (id, body, options) => api.patch(`/attempts/${id}`, PatchResultSchema, body, options),
    checkPlan: (id, plan) => api.post(`/attempts/${id}/plan`, PlanCheckResultSchema, { plan }),
    openRung: (id, rung) => api.post(`/attempts/${id}/hints`, HintContentSchema, { rung }),
    submit: (id, code, results) =>
      api.post(`/attempts/${id}/submit`, SubmitResultSchema, { code, results }),
    end: (id) => api.post(`/attempts/${id}/end`, EndResultSchema, { reason: "gave_up" }),
    restart: (id) => api.post(`/attempts/${id}/restart`, AttemptViewSchema),
    walkthrough: (slug) => api.get(`/problems/${path(slug)}/walkthrough`, WalkthroughPayloadSchema),
    guestCheckPlan: (slug, plan, checkNumber, openedRung) =>
      api.post(`/guest/problems/${path(slug)}/plan`, GuestPlanResultSchema, {
        plan,
        checkNumber,
        openedRung,
      }),
    guestHint: (slug, rung) =>
      api.get(`/guest/problems/${path(slug)}/hints/${rung}`, HintContentSchema),
  }
}

/** `POST /guest/import` (signed in): uploads a guest's attempts; returns how many were added. */
export async function importGuestAttemptsRequest(
  api: ApiClient,
  attempts: GuestAttempt[]
): Promise<number> {
  const result = await api.post("/guest/import", GuestImportResultSchema, { attempts })
  return result.imported
}

export function getNotes(api: ApiClient, slug: string): Promise<NoteView> {
  return api.get(`/problems/${path(slug)}/notes`, NoteViewSchema)
}

export function putNotes(
  api: ApiClient,
  slug: string,
  body: string,
  options?: { keepalive?: boolean }
): Promise<NoteView> {
  return api.put(`/problems/${path(slug)}/notes`, NoteViewSchema, { body }, options)
}
