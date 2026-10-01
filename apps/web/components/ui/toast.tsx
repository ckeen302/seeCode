"use client"

import { cn } from "cn"
import { CircleAlertIcon, CircleCheckIcon, InfoIcon, XIcon } from "lucide-react"
import { Toast as ToastPrimitive } from "radix-ui"

import { dismissToast, useToasts, type ToastTone } from "@/lib/toast"

/** Section 18.4: toasts sit bottom-right for 4 s. Radix announces them politely (F8 focuses). */
export const TOAST_MS = 4000

const ICONS: Record<ToastTone, React.ReactNode> = {
  success: <CircleCheckIcon aria-hidden className="size-4 text-good" />,
  error: <CircleAlertIcon aria-hidden className="size-4 text-error" />,
  info: <InfoIcon aria-hidden className="size-4 text-accent" />,
}

export function Toaster() {
  const items = useToasts()
  return (
    <ToastPrimitive.Provider duration={TOAST_MS} swipeDirection="right" label="Notifications">
      {items.map((item) => (
        <ToastPrimitive.Root
          key={item.id}
          type="foreground"
          onOpenChange={(open) => {
            if (!open) dismissToast(item.id)
          }}
          className={cn(
            "flex w-full items-start gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-text shadow-popover",
            "data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-bottom-2 data-closed:animate-out data-closed:fade-out-0",
            "data-[swipe=move]:translate-x-(--radix-toast-swipe-move-x) data-[swipe=cancel]:translate-x-0 data-[swipe=end]:animate-out data-[swipe=end]:fade-out-0"
          )}
        >
          <span className="mt-0.5 shrink-0">{ICONS[item.tone]}</span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <ToastPrimitive.Title className="font-medium">{item.title}</ToastPrimitive.Title>
            {item.description ? (
              <ToastPrimitive.Description className="text-muted">
                {item.description}
              </ToastPrimitive.Description>
            ) : null}
          </div>
          <ToastPrimitive.Close
            aria-label="Dismiss"
            className="-mt-0.5 -mr-1 inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-text"
          >
            <XIcon aria-hidden className="size-3.5" />
          </ToastPrimitive.Close>
        </ToastPrimitive.Root>
      ))}
      <ToastPrimitive.Viewport className="fixed right-4 bottom-4 z-[100] m-0 flex w-80 max-w-[calc(100vw-2rem)] list-none flex-col gap-2 p-0 outline-none" />
    </ToastPrimitive.Provider>
  )
}
