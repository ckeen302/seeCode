import { tokenizePython, type TokenKind } from "@/components/patterns/template"
import { cn } from "@/lib/utils"

// Token colors keep 4.5:1 on --bg in both themes (Section 18.1).
const TOKEN_CLASSES: Record<TokenKind, string> = {
  keyword: "text-accent font-medium",
  string: "text-ptr-d",
  number: "text-text",
  comment: "text-muted italic",
  builtin: "text-text font-medium",
  text: "",
}

export function HighlightedLine({ line }: { line: string }) {
  if (!line) return <>{" "}</>
  return (
    <>
      {tokenizePython(line).map((token, index) =>
        token.kind === "text" ? (
          token.text
        ) : (
          <span key={index} className={TOKEN_CLASSES[token.kind]}>
            {token.text}
          </span>
        )
      )}
    </>
  )
}

/** A read-only Python code block with light highlighting. */
export function CodeBlock({
  code,
  className,
  label,
}: {
  code: string
  className?: string
  label?: string
}) {
  const lines = code.replace(/\n+$/, "").split("\n")
  return (
    <pre
      className={cn(
        "overflow-x-auto rounded-md border border-border bg-bg p-4 font-mono text-sm leading-6",
        className
      )}
      role={label ? "region" : undefined}
      aria-label={label}
      tabIndex={0}
    >
      <code>
        {lines.map((line, index) => (
          <div key={index}>
            <HighlightedLine line={line} />
          </div>
        ))}
      </code>
    </pre>
  )
}
