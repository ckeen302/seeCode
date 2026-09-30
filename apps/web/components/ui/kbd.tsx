import { cn } from "cn"

function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "pointer-events-none inline-flex h-5 min-w-5 items-center justify-center gap-1 rounded-sm border border-border px-1 font-mono text-xs text-muted select-none",
        className
      )}
      {...props}
    />
  )
}

export { Kbd }
