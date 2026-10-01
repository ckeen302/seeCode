import { SettingsSync } from "@/components/settings/SettingsSync"
import { AppShell } from "@/components/shell/AppShell"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <SettingsSync />
      {children}
    </AppShell>
  )
}
