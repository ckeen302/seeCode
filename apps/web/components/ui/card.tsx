import { cn } from "cn"

// Section 18.4: surface, 10 px radius, 16-24 px padding, title 15/600.
function Card({ className, ...props }: React.ComponentProps<"section">) {
  return (
    <section
      data-slot="card"
      className={cn("rounded-lg border border-border bg-surface p-5 text-text", className)}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2 data-slot="card-title" className={cn("text-base font-semibold", className)} {...props} />
  )
}

export { Card, CardTitle }
