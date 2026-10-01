"use client"

import { useQueryClient } from "@tanstack/react-query"
import {
  DownloadIcon,
  MonitorIcon,
  MoonIcon,
  SettingsIcon,
  SunIcon,
  Trash2Icon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useId, useMemo, useState } from "react"

import { Switch } from "@/components/drills/DrillSummaryView"
import { applyReducedMotion } from "@/components/settings/motion"
import { useThemePreference } from "@/components/shell/Preferences"
import {
  ErrorState,
  LoadingState,
  PageHeader,
  RequireAuth,
  SignedOutState,
} from "@/components/today/PageStates"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useMe } from "@/lib/api/hooks"
import {
  browserTimeZone,
  deleteMe,
  downloadJson,
  exportFileName,
  exportMe,
  patchMe,
  resolveSettings,
  type ProfilePatch,
  type ResolvedSettings,
} from "@/lib/api/profile"
import type { Profile } from "@/lib/api/schemas"
import { signOut } from "@/lib/auth/session"
import { setThemePreference } from "@/lib/theme"
import { cn } from "@/lib/utils"

// --error with white text is 4.4:1 in the light theme; a slightly deeper red passes 4.5:1.
const DANGER =
  "bg-[color-mix(in_srgb,var(--error)_88%,black)] hover:bg-[color-mix(in_srgb,var(--error)_80%,black)]"

type Status = { tone: "info" | "error"; text: string } | null

function SettingsSection({
  id,
  title,
  description,
  children,
  danger = false,
}: {
  id: string
  title: string
  description?: string
  children: React.ReactNode
  danger?: boolean
}) {
  return (
    <Card aria-labelledby={id} className={cn("flex flex-col gap-5", danger && "border-error/40")}>
      <div className="flex flex-col gap-0.5">
        <h2 id={id} className="text-base font-semibold">
          {title}
        </h2>
        {description ? <p className="text-sm text-muted">{description}</p> : null}
      </div>
      {children}
    </Card>
  )
}

function Segmented<T extends string>({
  legend,
  name,
  value,
  options,
  onChange,
}: {
  legend: string
  name: string
  value: T
  options: { value: T; label: string; icon?: typeof SunIcon }[]
  onChange: (value: T) => void
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      <div className="inline-flex w-fit flex-wrap gap-1 rounded-md border border-border bg-bg p-1">
        {options.map((option) => (
          <label
            key={option.value}
            className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-sm px-3 text-sm text-muted transition-colors hover:text-text has-[:checked]:bg-surface-2 has-[:checked]:font-medium has-[:checked]:text-text has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent"
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {option.icon ? <option.icon aria-hidden className="size-4" /> : null}
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function timeZones(current: string): string[] {
  let zones: string[] = []
  try {
    zones =
      (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.(
        "timeZone"
      ) ?? []
  } catch {
    zones = []
  }
  return [...new Set(["UTC", current, ...zones])].sort((a, b) =>
    a === "UTC" ? -1 : b === "UTC" ? 1 : a.localeCompare(b)
  )
}

function Settings({ profile }: { profile: Profile }) {
  const queryClient = useQueryClient()
  const router = useRouter()
  const settings = resolveSettings(profile.settings)
  // The theme on screen is this browser's choice (the sidebar toggle changes it too).
  const theme = useThemePreference()
  const [name, setName] = useState(profile.displayName ?? "")
  const [status, setStatus] = useState<Status>(null)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmText, setConfirmText] = useState("")
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const nameId = useId()
  const zoneId = useId()
  const confirmId = useId()
  const zones = useMemo(() => timeZones(profile.timezone), [profile.timezone])
  const browserZone = browserTimeZone()

  const save = async (patch: ProfilePatch, done = "Saved.") => {
    setSaving(true)
    setStatus(null)
    try {
      const updated = await patchMe(patch)
      queryClient.setQueryData(["me", profile.id], updated)
      setStatus({ tone: "info", text: done })
    } catch (caught) {
      setStatus({
        tone: "error",
        text: caught instanceof Error ? caught.message : "Couldn't save. Try again.",
      })
    } finally {
      setSaving(false)
    }
  }

  const setSetting = <K extends keyof ResolvedSettings>(key: K, value: ResolvedSettings[K]) => {
    // Show the change right away; the server's answer replaces it.
    queryClient.setQueryData<Profile>(["me", profile.id], (old) =>
      old ? { ...old, settings: { ...old.settings, [key]: value } } : old
    )
    void save({ settings: { [key]: value } })
  }

  const trimmed = name.trim()
  const nameChanged = trimmed !== (profile.displayName ?? "")

  const exportData = async () => {
    setExporting(true)
    setStatus(null)
    try {
      downloadJson(await exportMe(), exportFileName())
      setStatus({ tone: "info", text: "Your data was downloaded as a JSON file." })
    } catch (caught) {
      setStatus({
        tone: "error",
        text: caught instanceof Error ? caught.message : "Couldn't export your data.",
      })
    } finally {
      setExporting(false)
    }
  }

  const deleteAccount = async () => {
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteMe()
      await signOut()
      queryClient.clear()
      router.replace("/")
    } catch (caught) {
      setDeleteError(caught instanceof Error ? caught.message : "Couldn't delete your account.")
      setDeleting(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" />
      {status ? (
        <p
          className={cn(
            "rounded-md border px-3 py-2 text-sm",
            status.tone === "error" ? "border-error/40 text-error" : "border-border text-muted"
          )}
          role={status.tone === "error" ? "alert" : "status"}
        >
          {status.text}
        </p>
      ) : null}

      <SettingsSection id="settings-profile" title="Profile">
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (nameChanged && trimmed) void save({ displayName: trimmed }, "Name saved.")
          }}
        >
          <label htmlFor={nameId} className="text-sm font-medium">
            Display name
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              id={nameId}
              value={name}
              maxLength={60}
              onChange={(event) => setName(event.target.value)}
              className="h-9 w-72 max-w-full rounded-md border border-border bg-bg px-3 text-sm"
            />
            <Button type="submit" variant="secondary" disabled={!nameChanged || !trimmed || saving}>
              Save name
            </Button>
          </div>
          <p className="text-xs text-muted">Today greets you by your first name.</p>
        </form>
        <div className="flex flex-col gap-2">
          <label htmlFor={zoneId} className="text-sm font-medium">
            Time zone
          </label>
          <div className="flex flex-wrap gap-2">
            <select
              id={zoneId}
              value={profile.timezone}
              onChange={(event) => void save({ timezone: event.target.value }, "Time zone saved.")}
              className="h-9 w-72 max-w-full rounded-md border border-border bg-bg px-2 text-sm"
            >
              {zones.map((zone) => (
                <option key={zone} value={zone}>
                  {zone.replace(/_/g, " ")}
                </option>
              ))}
            </select>
            {browserZone && browserZone !== profile.timezone ? (
              <Button
                variant="ghost"
                onClick={() => void save({ timezone: browserZone }, "Time zone saved.")}
              >
                Use {browserZone.replace(/_/g, " ")}
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted">
            Streaks and &ldquo;due today&rdquo; follow your days here.
          </p>
        </div>
      </SettingsSection>

      <SettingsSection id="settings-appearance" title="Appearance">
        <Segmented
          legend="Theme"
          name="theme"
          value={theme}
          options={[
            { value: "dark", label: "Dark", icon: MoonIcon },
            { value: "light", label: "Light", icon: SunIcon },
            { value: "system", label: "System", icon: MonitorIcon },
          ]}
          onChange={(value) => {
            setThemePreference(value)
            setSetting("theme", value)
          }}
        />
        <Segmented
          legend="Reduced motion"
          name="reduced-motion"
          value={settings.reducedMotion}
          options={[
            { value: "system", label: "Follow system" },
            { value: "on", label: "Always reduce" },
            { value: "off", label: "Full motion" },
          ]}
          onChange={(value) => {
            applyReducedMotion(value)
            setSetting("reducedMotion", value)
          }}
        />
      </SettingsSection>

      <SettingsSection id="settings-practice" title="Practice">
        <Switch
          checked={settings.drillTimer}
          onChange={(value) => setSetting("drillTimer", value)}
          label="Drill timer"
          description="Show the 30-second ring on drill and review cards. It never cuts you off."
        />
        <Switch
          checked={settings.sound}
          onChange={(value) => setSetting("sound", value)}
          label="Sound effects"
          description="A soft chime after drill and review answers."
        />
      </SettingsSection>

      <SettingsSection
        id="settings-editor"
        title="Code editor"
        description="Saved to your account for the Workspace editor."
      >
        <Segmented
          legend="Font size"
          name="editor-font-size"
          value={String(settings.editorFontSize)}
          options={["12", "13", "14", "16", "18"].map((size) => ({
            value: size,
            label: `${size} px`,
          }))}
          onChange={(value) => setSetting("editorFontSize", Number(value))}
        />
        <Segmented
          legend="Screen reader mode"
          name="monaco-accessibility"
          value={settings.monacoAccessibility}
          options={[
            { value: "auto", label: "Detect" },
            { value: "on", label: "On" },
            { value: "off", label: "Off" },
          ]}
          onChange={(value) => setSetting("monacoAccessibility", value)}
        />
      </SettingsSection>

      <SettingsSection
        id="settings-data"
        title="Your data"
        description="Everything SeeCode stores about you: profile, attempts, plans, drills and reviews."
      >
        <div>
          <Button variant="secondary" onClick={() => void exportData()} disabled={exporting}>
            <DownloadIcon />
            {exporting ? "Preparing…" : "Export my data"}
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection
        id="settings-danger"
        title="Delete account"
        description="Deletes your profile and all your progress for good. This can't be undone."
        danger
      >
        <div>
          <Button variant="danger" className={DANGER} onClick={() => setConfirmOpen(true)}>
            <Trash2Icon />
            Delete account
          </Button>
        </div>
      </SettingsSection>

      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open)
          if (!open) {
            setConfirmText("")
            setDeleteError(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>Delete your account?</AlertDialogTitle>
          <AlertDialogDescription>
            Your attempts, plans, drills, reviews and streak are deleted right away. Export your
            data first if you want a copy.
          </AlertDialogDescription>
          <div className="flex flex-col gap-2">
            <label htmlFor={confirmId} className="text-sm">
              Type <span className="font-mono font-semibold">delete</span> to confirm
            </label>
            <input
              id={confirmId}
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              autoComplete="off"
              className="h-9 rounded-md border border-border bg-bg px-3 text-sm"
            />
          </div>
          {deleteError ? (
            <p role="alert" className="text-sm text-error">
              {deleteError}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              className={DANGER}
              disabled={confirmText.trim().toLowerCase() !== "delete" || deleting}
              onClick={(event) => {
                event.preventDefault()
                void deleteAccount()
              }}
            >
              {deleting ? "Deleting…" : "Delete forever"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function SettingsLoader() {
  const me = useMe()
  if (me.isPending) return <LoadingState label="Loading your settings" />
  if (me.isError) {
    return (
      <ErrorState
        title="We couldn't load your settings"
        error={me.error}
        onRetry={() => void me.refetch()}
      />
    )
  }
  return <Settings profile={me.data} />
}

// Settings (Section 6.9).
export function SettingsView() {
  return (
    <RequireAuth
      loadingLabel="Loading your settings"
      signedOut={
        <SignedOutState
          title="Settings"
          icon={SettingsIcon}
          pitch="Your name, theme, timers and data live here once you sign in."
        />
      }
    >
      <SettingsLoader />
    </RequireAuth>
  )
}
