import { AppShell } from "@/components/shell/AppShell"

// The walkthrough gallery uses the app's sidebar shell, like the (app) pages.
export default function VizLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>
}
