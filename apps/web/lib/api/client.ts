// Typed fetch for the SeeCode API (Section 17.1): adds auth headers, retries once after
// refreshing an expired session, turns the error envelope into ApiError, and parses
// every response with a zod schema.
import type { z } from "zod"

import { ErrorEnvelopeSchema } from "@/lib/api/schemas"

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message)
    this.name = "ApiError"
  }
}

export interface ApiClientOptions {
  baseUrl: string
  getHeaders?: () => Promise<Record<string, string>>
  /** Called once after a 401; return true if the request should be retried. */
  refreshAuth?: () => Promise<boolean>
  fetch?: typeof fetch
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"

// Hosts and proxies can answer with HTML (e.g. a 502 page while a free server wakes up).
function parseJson(text: string): unknown {
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

export function createApiClient(options: ApiClientOptions) {
  // Looked up on each request, so a fetch replaced later (tests, polyfills) is used.
  const doFetch: typeof fetch = options.fetch ?? ((input, init) => fetch(input, init))

  async function request<T>(
    method: Method,
    path: string,
    schema: z.ZodType<T>,
    body?: unknown
  ): Promise<T> {
    const send = async () =>
      doFetch(`${options.baseUrl}${path}`, {
        method,
        headers: {
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(await options.getHeaders?.()),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      })

    let response = await send()
    if (response.status === 401 && options.refreshAuth && (await options.refreshAuth())) {
      response = await send()
    }

    const payload = parseJson(await response.text())
    if (!response.ok) {
      const envelope = ErrorEnvelopeSchema.safeParse(payload)
      throw envelope.success
        ? new ApiError(response.status, envelope.data.error.code, envelope.data.error.message)
        : new ApiError(response.status, "internal", `Request failed (${response.status}).`)
    }
    return schema.parse(payload)
  }

  return {
    get: <T>(path: string, schema: z.ZodType<T>) => request("GET", path, schema),
    post: <T>(path: string, schema: z.ZodType<T>, body?: unknown) =>
      request("POST", path, schema, body),
    put: <T>(path: string, schema: z.ZodType<T>, body?: unknown) =>
      request("PUT", path, schema, body),
    patch: <T>(path: string, schema: z.ZodType<T>, body?: unknown) =>
      request("PATCH", path, schema, body),
    delete: <T>(path: string, schema: z.ZodType<T>) => request("DELETE", path, schema),
  }
}

export type ApiClient = ReturnType<typeof createApiClient>
