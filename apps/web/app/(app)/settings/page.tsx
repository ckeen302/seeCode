import type { Metadata } from "next"

import { SettingsView } from "@/components/settings/SettingsView"

export const metadata: Metadata = { title: "Settings" }

// Section 6.9.
export default function SettingsPage() {
  return <SettingsView />
}
