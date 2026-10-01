// Signal phrases highlighted in a problem statement after answering (Section 6.6).

export interface TextPart {
  text: string
  /** Index into the phrase list when this part is a signal phrase. */
  signal: number | null
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Splits `text` around every occurrence of the phrases (case-insensitive, longest first so
 * a phrase inside a longer one does not win).
 */
export function splitBySignals(text: string, phrases: readonly string[]): TextPart[] {
  const usable = phrases
    .map((phrase, index) => ({ phrase: phrase.trim(), index }))
    .filter((p) => p.phrase.length > 1)
    .sort((a, b) => b.phrase.length - a.phrase.length)
  if (!usable.length) return [{ text, signal: null }]
  const pattern = new RegExp(usable.map((p) => escapeRegExp(p.phrase)).join("|"), "gi")
  const parts: TextPart[] = []
  let last = 0
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0
    if (start > last) parts.push({ text: text.slice(last, start), signal: null })
    const found = usable.find((p) => p.phrase.toLowerCase() === match[0].toLowerCase())
    parts.push({ text: match[0], signal: found ? found.index : null })
    last = start + match[0].length
  }
  if (last < text.length) parts.push({ text: text.slice(last), signal: null })
  return parts
}

/** A signal's target ("hashing", "toolkit:counter", "structure:counter") in words. */
export function describePointsTo(
  pointsTo: string,
  names: { patterns?: Record<string, string>; structures?: Record<string, string> }
): string {
  const [kind, id] = pointsTo.includes(":") ? pointsTo.split(":", 2) : ["pattern", pointsTo]
  if (kind === "toolkit") return `Python tool: ${id.replace(/_/g, " ")}`
  if (kind === "structure") return `Structure: ${names.structures?.[id] ?? id.replace(/_/g, " ")}`
  return `Pattern: ${names.patterns?.[id] ?? id.replace(/_/g, " ")}`
}
