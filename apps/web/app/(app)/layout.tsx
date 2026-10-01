import { AppShell } from "@/components/shell/AppShell"

// Saved settings apply on every page (SettingsSync is in the root Providers).
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>
}
