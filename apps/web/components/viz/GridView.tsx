"use client"

// Grid (Section 8.5): a list of lists as 32×32 cells with row and column indexes.
import { memo } from "react"

import { cn } from "@/lib/utils"
import type { GridBlock } from "@/lib/viz/layout"
import { BlockTitle, plural } from "@/components/viz/shared"

function GridViewImpl({ block }: { block: GridBlock }) {
  const width = Math.max(0, ...block.rows.map((row) => row.cells.length))
  const more = block.total - block.rows.length
  return (
    <figure className="flex min-w-0 flex-col gap-1.5" data-block="grid" data-name={block.name}>
      <figcaption>
        <BlockTitle name={block.name} caption={plural(block.total, "row")} />
      </figcaption>
      {block.rows.length === 0 ? (
        <p className="font-mono text-sm text-muted">[] (empty)</p>
      ) : (
        <div className="max-w-full overflow-x-auto">
          <table className="border-separate border-spacing-0.5 font-mono text-sm">
            <caption className="sr-only">
              {block.name}: {plural(block.total, "row")}
            </caption>
            <thead>
              <tr>
                <td />
                {Array.from({ length: width }, (_, c) => (
                  <th key={c} scope="col" className="text-center text-xs font-normal text-muted">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r}>
                  <th scope="row" className="pr-1 text-right text-xs font-normal text-muted">
                    {r}
                  </th>
                  {row.cells.map((cell, c) => (
                    <td
                      key={c}
                      className={cn(
                        "h-8 min-w-8 max-w-24 truncate rounded-md border bg-surface-2 px-1 text-center",
                        cell.changed ? "border-accent" : "border-border"
                      )}
                    >
                      {cell.text}
                    </td>
                  ))}
                  {row.total > row.cells.length ? (
                    <td className="px-1 text-xs text-muted">+{row.total - row.cells.length}</td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
          {more > 0 ? <p className="text-xs text-muted">+{more} more rows</p> : null}
        </div>
      )}
    </figure>
  )
}

export const GridView = memo(GridViewImpl)
