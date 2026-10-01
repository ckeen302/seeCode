// How test values are shown in the Tests panel. Inputs, expected values and outputs all
// arrive as JSON, so they share one convention: JSON literals (true, false, null), the
// same way the problem examples are written, with a space after each comma.

/**
 * Longest text a value block renders. Hidden inputs stay far below it (about 8 KB); a wrong
 * answer can be huge (a million-item list), and laying that out would freeze the tab.
 */
export const MAX_SHOWN_CHARS = 20_000

class Budget {
  constructor(public left: number) {}
  get spent(): boolean {
    return this.left <= 0
  }
}

function format(value: unknown, budget: Budget): string {
  if (budget.spent) return ""
  let text: string
  if (value === undefined) text = ""
  else if (value === null) text = "null"
  else if (typeof value === "string") text = JSON.stringify(value)
  else if (typeof value === "number" || typeof value === "boolean") text = String(value)
  else if (Array.isArray(value)) {
    // Stops formatting items once the budget is spent, so a huge list costs little.
    const parts: string[] = []
    for (const item of value) {
      if (budget.spent) break
      parts.push(format(item, budget))
      budget.left -= 2
    }
    return `[${parts.join(", ")}]`
  } else if (typeof value === "object") {
    const parts: string[] = []
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (budget.spent) break
      parts.push(`${JSON.stringify(key)}: ${format(item, budget)}`)
      budget.left -= key.length + 4
    }
    return `{${parts.join(", ")}}`
  } else text = String(value)
  budget.left -= text.length
  return text
}

export function formatValue(value: unknown): string {
  return format(value, new Budget(Number.POSITIVE_INFINITY))
}

/** A value for display: `formatValue`, cut at `limit` characters. */
export function formatValueForDisplay(
  value: unknown,
  limit: number = MAX_SHOWN_CHARS
): { text: string; truncated: boolean } {
  const budget = new Budget(limit + 1)
  const text = format(value, budget)
  if (!budget.spent && text.length <= limit) return { text, truncated: false }
  return { text: text.slice(0, limit), truncated: true }
}

/** "12 ms", "0.4 ms", "under 0.1 ms" */
export function formatMs(ms: number): string {
  if (ms < 0.05) return "under 0.1 ms"
  if (ms < 1) return `${ms.toFixed(1)} ms`
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

/**
 * Splits an example's input text, e.g. `nums = [5, 11], target = 10`, into one
 * `name = value` per argument: at the top-level commas (outside brackets and quotes) that
 * are followed by `name =`. Text in another shape comes back whole, with no name.
 */
export function splitExampleInput(input: string): { name: string | null; value: string }[] {
  const parts: string[] = []
  let depth = 0
  let quote: string | null = null
  let start = 0
  for (let i = 0; i < input.length; i++) {
    const char = input[i]
    if (quote) {
      if (char === "\\") i++
      else if (char === quote) quote = null
      continue
    }
    if (char === '"' || char === "'") quote = char
    else if ("([{".includes(char)) depth++
    else if (")]}".includes(char)) depth = Math.max(0, depth - 1)
    else if (char === "," && depth === 0 && /^\s*[A-Za-z_]\w*\s*=(?!=)/.test(input.slice(i + 1))) {
      parts.push(input.slice(start, i))
      start = i + 1
    }
  }
  parts.push(input.slice(start))
  return parts.map((part) => {
    const match = /^\s*([A-Za-z_]\w*)\s*=(?!=)\s*([\s\S]*?)\s*$/.exec(part)
    return match ? { name: match[1], value: match[2] } : { name: null, value: part.trim() }
  })
}
