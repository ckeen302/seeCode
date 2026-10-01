// Pattern templates (Section 6.4): find the slot markers (`# SETUP` … `# RETURN`, optionally
// followed by ": note") and split lines into tokens for light Python highlighting.

export interface TemplateLine {
  text: string
  /** The slot this line belongs to, from its `# SLOT` marker. */
  slot: string | null
}

const MARKER = /#\s*(SETUP|LOOP|UPDATE|RECORD|RETURN)\b/

export function parseTemplate(template: string): TemplateLine[] {
  const lines = template.replace(/\n+$/, "").split("\n")
  return lines.map((text) => {
    const match = MARKER.exec(text)
    return { text, slot: match ? match[1].toLowerCase() : null }
  })
}

export type TokenKind = "keyword" | "string" | "number" | "comment" | "builtin" | "text"
export interface Token {
  kind: TokenKind
  text: string
}

const KEYWORDS = new Set([
  "def",
  "class",
  "return",
  "if",
  "elif",
  "else",
  "for",
  "while",
  "in",
  "not",
  "and",
  "or",
  "is",
  "None",
  "True",
  "False",
  "break",
  "continue",
  "pass",
  "lambda",
  "import",
  "from",
  "with",
  "as",
  "yield",
])
const BUILTINS = new Set([
  "len",
  "range",
  "enumerate",
  "min",
  "max",
  "sum",
  "sorted",
  "set",
  "dict",
  "list",
  "abs",
  "zip",
  "self",
])

const TOKEN =
  /(#.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)|(\s+|.)/g

/** Splits one line of Python into highlight tokens (comments run to the end of the line). */
export function tokenizePython(line: string): Token[] {
  const tokens: Token[] = []
  const push = (kind: TokenKind, text: string) => {
    const last = tokens[tokens.length - 1]
    if (last && last.kind === kind && kind === "text") last.text += text
    else tokens.push({ kind, text })
  }
  for (const match of line.matchAll(TOKEN)) {
    if (match[1]) push("comment", match[1])
    else if (match[2]) push("string", match[2])
    else if (match[3]) push("number", match[3])
    else if (match[4]) {
      const word = match[4]
      push(KEYWORDS.has(word) ? "keyword" : BUILTINS.has(word) ? "builtin" : "text", word)
    } else push("text", match[0])
  }
  return tokens
}
