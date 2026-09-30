import { describe, expect, it, vi } from "vitest"
import { z } from "zod"

import { ApiError, createApiClient } from "@/lib/api/client"
import { shouldRetry } from "@/lib/api/hooks"
import { ProfileSchema } from "@/lib/api/schemas"

const PROFILE = {
  id: "00000000-0000-4000-8000-000000000001",
  displayName: "Dev user 0001",
  timezone: "UTC",
  settings: {},
  createdAt: "2026-09-30T03:13:28.192065Z",
}

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

describe("api client", () => {
  it("sends auth headers and parses the response", async () => {
    const fetch = vi.fn(async () => json(200, PROFILE))
    const api = createApiClient({
      baseUrl: "http://api.test/api/v1",
      getHeaders: async () => ({ "X-Dev-User": PROFILE.id }),
      fetch,
    })
    await expect(api.get("/me", ProfileSchema)).resolves.toEqual(PROFILE)
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("http://api.test/api/v1/me")
    expect(init.headers).toMatchObject({ "X-Dev-User": PROFILE.id, Accept: "application/json" })
  })

  it("sends JSON bodies", async () => {
    const fetch = vi.fn(async () => json(200, { ok: true }))
    const api = createApiClient({ baseUrl: "", fetch })
    await api.post("/x", z.object({ ok: z.boolean() }), { a: 1 })
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.method).toBe("POST")
    expect(init.body).toBe('{"a":1}')
    expect(init.headers).toMatchObject({ "Content-Type": "application/json" })
  })

  it("turns the error envelope into ApiError", async () => {
    const fetch = vi.fn(async () =>
      json(409, { error: { code: "rung_order", message: "Open rung 2 first." } })
    )
    const api = createApiClient({ baseUrl: "", fetch })
    const error = await api.get("/x", z.unknown()).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 409, code: "rung_order", message: "Open rung 2 first." })
  })

  it("reports non-envelope failures as internal", async () => {
    const fetch = vi.fn(async () => new Response("Bad gateway", { status: 502 }))
    const api = createApiClient({ baseUrl: "", fetch })
    const error = (await api.get("/x", z.unknown()).catch((e: unknown) => e)) as ApiError
    expect(error.code).toBe("internal")
    expect(error.status).toBe(502)
  }, 1000)

  it("refreshes the session once after a 401", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json(401, { error: { code: "unauthorized", message: "expired" } }))
      .mockResolvedValueOnce(json(200, PROFILE))
    const refreshAuth = vi.fn(async () => true)
    const api = createApiClient({ baseUrl: "", fetch, refreshAuth })
    await expect(api.get("/me", ProfileSchema)).resolves.toEqual(PROFILE)
    expect(refreshAuth).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it("gives up when the refresh fails", async () => {
    const fetch = vi.fn(async () =>
      json(401, { error: { code: "unauthorized", message: "Sign in to continue." } })
    )
    const api = createApiClient({ baseUrl: "", fetch, refreshAuth: async () => false })
    await expect(api.get("/me", ProfileSchema)).rejects.toMatchObject({ status: 401 })
    expect(fetch).toHaveBeenCalledOnce()
  })

  it("rejects responses that do not match the schema", async () => {
    const fetch = vi.fn(async () => json(200, { ...PROFILE, id: "nope" }))
    const api = createApiClient({ baseUrl: "", fetch })
    await expect(api.get("/me", ProfileSchema)).rejects.toThrow()
  })

  it("never retries 4xx answers, retries server errors once", () => {
    expect(shouldRetry(0, new ApiError(404, "not_found", "x"))).toBe(false)
    expect(shouldRetry(0, new ApiError(503, "internal", "x"))).toBe(true)
    expect(shouldRetry(1, new ApiError(503, "internal", "x"))).toBe(false)
    expect(shouldRetry(0, new TypeError("network"))).toBe(true)
  })
})
