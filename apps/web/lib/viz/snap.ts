// Text for snapshots (Section 8.3): values read as Python writes them, since the code is
// Python. Also the loose comparison a typed predict answer gets.
import type { NodeSnap, Snap } from "@/lib/viz/types"

/** How long an inline value may get before it is cut with "…". */
export const MAX_INLINE = 80

/** A Python string literal: single quotes unless the text has one and no double quote. */
export function pyStr(text: string): string {
  const quote = text.includes("'") && !text.includes('"') ? '"' : "'"
  let out = quote
  for (const char of text) {
    if (char === "\\") out += "\\\\"
    else if (char === quote) out += `\\${quote}`
    else if (char === "\n") out += "\\n"
    else if (char === "\t") out += "\\t"
    else if (char === "\r") out += "\\r"
    else if (char < " " || char === "\x7f") {
      out += `\\x${char.charCodeAt(0).toString(16).padStart(2, "0")}`
    } else out += char
  }
  return out + quote
}

function primText(v: number | boolean | null, float = false): string {
  if (v === null) return "None"
  if (v === true) return "True"
  if (v === false) return "False"
  if (float && Number.isInteger(v) && Math.abs(v) < 1e16)
    return Object.is(v, -0) ? "-0.0" : `${v}.0`
  return String(v)
}

/** A node's short name, e.g. `ListNode(3)`. Renderers for nodes arrive with PARITY_PLAN phase 2. */
export function nodeText(node: NodeSnap): string {
  return `${node.cls}(${snapText(node.val, 24)})`
}

function cut(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, Math.max(1, limit - 1))}…`
}

function more(shown: number, total: number): string {
  return total > shown ? `${shown ? ", " : ""}…+${total - shown}` : ""
}

/** The value as Python's repr shows it, cut to `limit` characters. */
export function snapText(snap: Snap, limit: number = MAX_INLINE): string {
  return cut(fullText(snap, limit), limit)
}

function fullText(snap: Snap, limit: number): string {
  switch (snap.t) {
    case "prim":
      return primText(snap.v, snap.f)
    case "str":
      return pyStr(snap.v) + (snap.n > snap.v.length ? `…(${snap.n} chars)` : "")
    case "list": {
      const items = joinItems(snap.v, limit) + more(snap.v.length, snap.n)
      if (snap.cls === "tuple") return snap.n === 1 ? `(${items},)` : `(${items})`
      return snap.cls === "list" ? `[${items}]` : `${snap.cls}([${items}])`
    }
    case "deque":
      return `deque([${joinItems(snap.v, limit)}${more(snap.v.length, snap.n)}])`
    case "dict": {
      const parts: string[] = []
      let length = 0
      for (const [key, value] of snap.v) {
        const part = `${fullText(key, limit)}: ${fullText(value, limit)}`
        parts.push(part)
        length += part.length + 2
        if (length > limit) break
      }
      const body = `{${parts.join(", ")}${more(parts.length, snap.n)}}`
      return snap.cls === "dict" ? body : `${snap.cls}(${body})`
    }
    case "set": {
      const cls = snap.cls ?? "set"
      if (snap.n === 0) return `${cls}()`
      const body = `{${joinItems(snap.v, limit)}${more(snap.v.length, snap.n)}}`
      return cls === "set" ? body : `${cls}(${body})`
    }
    case "obj":
      return snap.v
    case "node":
      return nodeText(snap)
    case "trunc":
      return "…"
  }
}

function joinItems(items: Snap[], limit: number): string {
  const parts: string[] = []
  let length = 0
  for (const item of items) {
    const text = fullText(item, limit)
    parts.push(text)
    length += text.length + 2
    if (length > limit) break
  }
  const rest = items.length - parts.length
  return parts.join(", ") + (rest > 0 ? ", …" : "")
}

/**
 * The text inside a cell (array, grid, stack, queue): strings without quotes, so a row of
 * tokens reads `9 1 3 - /`; an empty string shows as `''`.
 */
export function cellText(snap: Snap, limit = 24): string {
  if (snap.t === "str") return snap.v === "" ? "''" : cut(snap.v, limit)
  return snapText(snap, limit)
}

export function isPrimitive(snap: Snap): boolean {
  return snap.t === "prim" || snap.t === "str"
}

/** An integer value (not a bool), or null. */
export function intValue(snap: Snap | undefined): number | null {
  if (!snap || snap.t !== "prim" || typeof snap.v !== "number") return null
  return Number.isInteger(snap.v) ? snap.v : null
}

/** The items of a sequence (list, tuple, deque, or a string's characters). */
export function sequenceItems(snap: Snap): Snap[] | null {
  if (snap.t === "list" || snap.t === "deque") return snap.v
  if (snap.t === "str") return Array.from(snap.v).map((char) => ({ t: "str", v: char, n: 1 }))
  return null
}

export function sequenceLength(snap: Snap): number | null {
  if (snap.t === "list" || snap.t === "deque") return snap.n
  if (snap.t === "str") return snap.n
  return null
}

/** Structural equality of two snapshots. */
export function snapEquals(a: Snap | undefined, b: Snap | undefined): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return JSON.stringify(a) === JSON.stringify(b)
}

// ---------------------------------------------------------------- typed answers

/** Canonical text for loose comparison: no spaces, one quote style, Python literals. */
function canonical(text: string): string {
  return text
    .replace(/\s+/g, "")
    .replace(/"/g, "'")
    .replace(/\btrue\b/gi, "True")
    .replace(/\bfalse\b/gi, "False")
    .replace(/\b(null|none)\b/gi, "None")
}

function unquote(text: string): string | null {
  const match = /^(['"])([\s\S]*)\1$/.exec(text)
  return match ? match[2] : null
}

/**
 * Whether a typed answer means the same value as `answer`: numbers by value ("5.0" is 5),
 * True/False and None in Python's or JSON's spelling, strings with or without quotes, and
 * anything else by its Python text, ignoring spaces and the quote style.
 */
export function matchesTypedAnswer(input: string, answer: Snap): boolean {
  const text = input.trim()
  if (!text) return false
  if (answer.t === "prim") {
    if (typeof answer.v === "number") {
      const value = Number(text)
      return text !== "" && Number.isFinite(value) && Math.abs(value - answer.v) < 1e-9
    }
    if (typeof answer.v === "boolean") {
      const lower = text.toLowerCase()
      return answer.v ? ["true", "yes"].includes(lower) : ["false", "no"].includes(lower)
    }
    return ["none", "null"].includes(text.toLowerCase())
  }
  if (answer.t === "str") {
    const bare = unquote(text) ?? text
    return answer.n === answer.v.length && (bare === answer.v || text === answer.v)
  }
  return canonical(text) === canonical(snapText(answer, Number.MAX_SAFE_INTEGER))
}
