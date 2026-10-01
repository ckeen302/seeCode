import { Fragment } from "react"

// A small, safe Markdown subset for problem text (Section 7.2): paragraphs, "- " lists,
// `inline code`, **bold** and *italic*. It builds React nodes, never HTML strings.
//
// As in CommonMark, an emphasis marker must hug its text: no space just inside either
// `*`. Italic also needs no letter or digit just outside, so arithmetic stays as written:
// `"*" multiplies the two: 3 * 4` or `2*3*4` are not italic.
const INLINE =
  /(`[^`\n]+`)|(\*\*(?![\s*])[^*\n]*?[^\s*]\*\*)|((?<![\p{L}\p{N}_*])\*(?![\s*])[^*\n]*?[^\s*]\*(?![\p{L}\p{N}_*]))/gu

/**
 * Turns a run of plain text (outside code spans) into nodes, e.g. to highlight signal
 * phrases (7.2). `key` is unique within the rendered text.
 */
export type Decorate = (text: string, key: string) => React.ReactNode

const plain: Decorate = (text) => text

export function renderInline(text: string, decorate: Decorate = plain): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  let last = 0
  for (const match of text.matchAll(INLINE)) {
    const index = match.index ?? 0
    if (index > last) nodes.push(decorate(text.slice(last, index), `t${last}`))
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
      nodes.push(<strong key={index}>{decorate(token.slice(2, -2), `b${index}`)}</strong>)
    } else {
      nodes.push(<em key={index}>{decorate(token.slice(1, -1), `i${index}`)}</em>)
    }
    last = index + token.length
  }
  if (last < text.length) nodes.push(decorate(text.slice(last), `t${last}`))
  return nodes.map((node, index) =>
    typeof node === "string" || node === null ? node : <Fragment key={index}>{node}</Fragment>
  )
}

export function InlineMarkdown({ text, decorate }: { text: string; decorate?: Decorate }) {
  return <>{renderInline(text, decorate)}</>
}

export function Markdown({
  text,
  className,
  decorate,
}: {
  text: string
  className?: string
  decorate?: Decorate
}) {
  const blocks = text.trim().split(/\n\s*\n/)
  return (
    <div className={className}>
      {blocks.map((block, index) => {
        const lines = block.split("\n")
        if (lines.every((line) => /^\s*[-*] /.test(line))) {
          return (
            <ul key={index} className="list-disc space-y-1 pl-5">
              {lines.map((line, i) => (
                <li key={i}>{renderInline(line.replace(/^\s*[-*] /, ""), decorate)}</li>
              ))}
            </ul>
          )
        }
        return (
          <p key={index}>
            {lines.map((line, i) => (
              <Fragment key={i}>
                {i > 0 ? <br /> : null}
                {renderInline(line, decorate)}
              </Fragment>
            ))}
          </p>
        )
      })}
    </div>
  )
}
