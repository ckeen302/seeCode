// Custom test cases (Section 7.5): the user types each argument as JSON. Section 20 caps
// custom case arguments at 10 KB.

export const MAX_CUSTOM_CASES = 10
export const MAX_CUSTOM_ARGS_BYTES = 10 * 1024
export const CUSTOM_ID_PREFIX = "custom-"

export function isCustomCaseId(id: string): boolean {
  return id.startsWith(CUSTOM_ID_PREFIX)
}

/** The next free id: custom-1, custom-2, ... */
export function nextCustomCaseId(existing: readonly { id: string }[]): string {
  const used = existing
    .map((item) => Number(item.id.slice(CUSTOM_ID_PREFIX.length)))
    .filter((n) => Number.isInteger(n))
  return `${CUSTOM_ID_PREFIX}${Math.max(0, ...used) + 1}`
}

/** Splits a parameter list on top-level commas (type hints may hold commas in brackets). */
function splitTopLevel(params: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ""
  for (const char of params) {
    if ("([{".includes(char)) depth++
    else if (")]}".includes(char)) depth--
    if (char === "," && depth === 0) {
      parts.push(current)
      current = ""
    } else {
      current += char
    }
  }
  parts.push(current)
  return parts.map((part) => part.trim()).filter(Boolean)
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Argument names of `entry` in the starter code (`self` left out), e.g. ["nums", "target"].
 * Null when the signature cannot be read.
 */
export function parseParamNames(starterCode: string, entry: string): string[] | null {
  const def = new RegExp(`def\\s+${escapeRegExp(entry)}\\s*\\(([\\s\\S]*?)\\)\\s*(?:->[^:]*)?:`)
  const match = def.exec(starterCode)
  if (!match) return null
  const names = splitTopLevel(match[1])
    .map((param) => param.split(/[:=]/)[0].replace(/^\*+/, "").trim())
    .filter((name) => name && name !== "/" && name !== "*")
  if (names[0] === "self") names.shift()
  return names.every((name) => /^[A-Za-z_]\w*$/.test(name)) ? names : null
}

/** Names for `count` arguments: the signature's names, or "arg 1", "arg 2", ... */
export function argumentNames(starterCode: string, entry: string, count: number): string[] {
  const names = parseParamNames(starterCode, entry)
  if (names && names.length === count) return names
  return Array.from({ length: count }, (_, index) => names?.[index] ?? `arg ${index + 1}`)
}

export type ArgParse = { ok: true; value: unknown } | { ok: false; error: string }

/** Parses one argument typed as JSON. */
export function parseArgument(text: string): ArgParse {
  if (!text.trim()) return { ok: false, error: 'Enter a value, e.g. 3, "text" or [1, 2].' }
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch {
    return {
      ok: false,
      error: 'Not valid JSON. Strings need double quotes ("abc"); use true, false and null.',
    }
  }
}

export type CustomArgsResult =
  { ok: true; args: unknown[] } | { ok: false; errors: (string | null)[]; tooLarge: boolean }

/** Section 20: custom case arguments are at most 10 KB (as JSON, in UTF-8). */
export function customArgsTooLarge(args: readonly unknown[]): boolean {
  return new TextEncoder().encode(JSON.stringify(args)).length > MAX_CUSTOM_ARGS_BYTES
}

/** Validates every argument of a custom case, and the 10 KB size cap. */
export function parseCustomArgs(texts: readonly string[]): CustomArgsResult {
  const parsed = texts.map(parseArgument)
  const errors = parsed.map((result) => (result.ok ? null : result.error))
  if (errors.some(Boolean)) return { ok: false, errors, tooLarge: false }
  const args = parsed.map((result) => (result.ok ? result.value : null))
  if (customArgsTooLarge(args)) return { ok: false, errors: texts.map(() => null), tooLarge: true }
  return { ok: true, args }
}

/** An argument as the user edits it: compact JSON. */
export function argumentText(value: unknown): string {
  return JSON.stringify(value) ?? ""
}
