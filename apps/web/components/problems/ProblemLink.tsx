"use client"

import { useQueryClient } from "@tanstack/react-query"
import Link from "next/link"

import { warmUpWorkspace } from "@/lib/workspace/warmup"

type LinkProps = Omit<React.ComponentProps<typeof Link>, "href">

/** A link to a problem's Workspace that warms up Python and the editor on hover or focus. */
export function ProblemLink({
  slug,
  onPointerEnter,
  onFocus,
  ...props
}: LinkProps & { slug: string }) {
  const queryClient = useQueryClient()
  return (
    <Link
      href={`/p/${slug}`}
      onPointerEnter={(event) => {
        warmUpWorkspace(slug, queryClient)
        onPointerEnter?.(event)
      }}
      onFocus={(event) => {
        warmUpWorkspace(slug, queryClient)
        onFocus?.(event)
      }}
      {...props}
    />
  )
}
