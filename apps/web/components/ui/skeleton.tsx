import { cn } from "cn"

// Loading placeholder (Section 6: skeletons, not spinners).
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn("animate-pulse rounded-md bg-surface-2", className)}
      {...props}
    />
  )
}

export { Skeleton }
