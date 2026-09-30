import { describe, expect, it } from "vitest"

import { DEV_USERS, isValidDevUserId, readDevUserId } from "@/lib/auth/dev"
import { isProtectedPath, redirectTarget, safeNextPath } from "@/lib/auth/routes"

describe("route access", () => {
  it.each(["/today", "/drills", "/drills/session", "/review", "/stats", "/settings"])(
    "%s needs sign-in",
    (path) => expect(isProtectedPath(path)).toBe(true)
  )

  it.each([
    "/",
    "/login",
    "/roadmap",
    "/problems",
    "/patterns/stack",
    "/p/two-sum",
    "/about",
    "/todayx",
  ])("%s is public", (path) => expect(isProtectedPath(path)).toBe(false))

  it("only allows same-site relative redirect targets", () => {
    expect(safeNextPath("/review?x=1")).toBe("/review?x=1")
    expect(safeNextPath(null)).toBe("/today")
    expect(safeNextPath("https://evil.example")).toBe("/today")
    expect(safeNextPath("//evil.example")).toBe("/today")
    expect(safeNextPath("/\\evil.example")).toBe("/today")
    expect(safeNextPath("today")).toBe("/today")
  })
})

describe("proxy redirects (Section 5)", () => {
  it("sends signed-in visitors from the landing page to Today", () => {
    expect(redirectTarget("/", true)).toBe("/today")
    expect(redirectTarget("/", false)).toBeNull()
  })

  it("sends signed-out visitors from private pages to sign in", () => {
    expect(redirectTarget("/review", false)).toBe("/login")
    expect(redirectTarget("/review", true)).toBeNull()
    expect(redirectTarget("/roadmap", false)).toBeNull()
  })
})

describe("dev user cookie", () => {
  it("accepts UUIDs only", () => {
    for (const user of DEV_USERS) expect(isValidDevUserId(user.id)).toBe(true)
    expect(isValidDevUserId("not-a-uuid")).toBe(false)
    expect(isValidDevUserId(undefined)).toBe(false)
  })

  it("reads the dev user from a cookie header", () => {
    const id = DEV_USERS[0].id
    expect(readDevUserId(`a=1; seecode-dev-user=${id}; b=2`)).toBe(id)
    expect(readDevUserId("seecode-dev-user=nope")).toBeNull()
    expect(readDevUserId("")).toBeNull()
  })
})
