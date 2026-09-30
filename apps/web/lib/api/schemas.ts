// zod schemas mirroring the API (Section 16). Every response is parsed with one of these.
import { z } from "zod"

export const ErrorEnvelopeSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
})

export const HealthSchema = z.object({
  ok: z.boolean(),
  contentVersion: z.string(),
})
export type Health = z.infer<typeof HealthSchema>

export const ProfileSchema = z.object({
  id: z.uuid(),
  displayName: z.string().nullable(),
  timezone: z.string(),
  settings: z.record(z.string(), z.unknown()),
  createdAt: z.iso.datetime({ offset: true }),
})
export type Profile = z.infer<typeof ProfileSchema>
