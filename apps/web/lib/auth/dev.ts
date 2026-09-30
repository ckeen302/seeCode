// Dev sign-in (AUTH_DEV_BYPASS, Section 22.1): the API accepts `X-Dev-User: <uuid>`
// when it runs with ENV=development. The chosen user lives in a cookie so the proxy
// can gate routes on the server as well.

export const DEV_USER_COOKIE = "seecode-dev-user"

export const DEV_USERS = [
  { id: "00000000-0000-4000-8000-000000000001", label: "Dev user 0001" },
  { id: "00000000-0000-4000-8000-000000000002", label: "Dev user 0002" },
] as const

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isValidDevUserId(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID.test(value)
}

export function readDevUserId(cookieHeader: string): string | null {
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=")
    if (name === DEV_USER_COOKIE) {
      const value = decodeURIComponent(rest.join("="))
      return isValidDevUserId(value) ? value : null
    }
  }
  return null
}

export function writeDevUserCookie(id: string): void {
  document.cookie = `${DEV_USER_COOKIE}=${encodeURIComponent(id)}; path=/; max-age=31536000; samesite=lax`
}

export function clearDevUserCookie(): void {
  document.cookie = `${DEV_USER_COOKIE}=; path=/; max-age=0; samesite=lax`
}
