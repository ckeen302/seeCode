import { Card } from "@/components/ui/card"

/** Stand-in for pages that later milestones build (Section 23). */
export function PagePlaceholder({
  title,
  milestone,
  children,
}: {
  title: string
  milestone: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <Card className="flex flex-col gap-2">
        <p className="text-muted">This page is built in milestone {milestone}.</p>
        {children}
      </Card>
    </div>
  )
}
