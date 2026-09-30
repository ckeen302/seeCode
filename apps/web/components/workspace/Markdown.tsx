import { Fragment } from "react"

// A small, safe Markdown subset for problem text (Section 7.2): paragraphs, "- " lists,
// `inline code`, **bold** and *italic*. It builds React nodes, never HTML strings.

const INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\s][^*\n]*\*)/g

export function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  let last = 0
  for (const match of text.matchAll(INLINE)) {
    const index = match.index ?? 0
    if (index > last) nodes.push(text.slice(last, index))
    const token = match[0]
    if (match[1]) {
      nodes.push(
        <code
          key={index}
          className="rounded-sm border border-border bg-surface-2 px-1 py-px font-mono text-[0.9em]"
        >
          {token.slice(1, -1)}
        </code>
      )
    } else if (match[2]) {
      nodes.push(<strong key={index}>{token.slice(2, -2)}</strong>)
    } else {
      nodes.push(<em key={index}>{token.slice(1, -1)}</em>)
    }
    last = index + token.length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

export function InlineMarkdown({ text }: { text: string }) {
  return <>{renderInline(text)}</>
}

export function Markdown({ text, className }: { text: string; className?: string }) {
  const blocks = text.trim().split(/\n\s*\n/)
  return (
    <div className={className}>
      {blocks.map((block, index) => {
        const lines = block.split("\n")
        if (lines.every((line) => /^\s*[-*] /.test(line))) {
          return (
            <ul key={index} className="list-disc space-y-1 pl-5">
              {lines.map((line, i) => (
                <li key={i}>{renderInline(line.replace(/^\s*[-*] /, ""))}</li>
              ))}
            </ul>
          )
        }
        return (
          <p key={index}>
            {lines.map((line, i) => (
              <Fragment key={i}>
                {i > 0 ? <br /> : null}
                {renderInline(line)}
              </Fragment>
            ))}
          </p>
        )
      })}
    </div>
  )
}
