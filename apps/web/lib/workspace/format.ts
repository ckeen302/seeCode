// How test values are shown in the Tests panel. Inputs, expected values and outputs all
// arrive as JSON, so they share one convention: JSON literals (true, false, null), the
// same way the problem examples are written, with a space after each comma.

export function formatValue(value: unknown): string {
  if (value === undefined) return ""
  if (value === null) return "null"
  if (typeof value === "string") return JSON.stringify(value)
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  if (Array.isArray(value)) return `[${value.map(formatValue).join(", ")}]`
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).map(
      ([key, item]) => `${JSON.stringify(key)}: ${formatValue(item)}`
    )
    return `{${entries.join(", ")}}`
  }
  return String(value)
}

/** "12 ms", "0.4 ms" */
export function formatMs(ms: number): string {
  if (ms < 1) return `${ms.toFixed(1)} ms`
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(2)} s`
}
