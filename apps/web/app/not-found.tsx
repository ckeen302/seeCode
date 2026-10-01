import { AppLink } from "@/components/shell/AppLink"

import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <main
      id="main"
      className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center"
    >
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-muted">That page doesn&apos;t exist.</p>
      <Button asChild variant="secondary">
        <AppLink href="/">Go home</AppLink>
      </Button>
    </main>
  )
}
