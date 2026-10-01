// Workspace coach shortcuts (Section 17.4). Run, Submit and ⌘J live in lib/keyboard.ts.
import type { Hotkey } from "@/lib/keyboard"

export const COACH_HOTKEYS = {
  /** ⌘⇧P: move focus to the Plan card. */
  focusPlan: { key: "p", mod: true, shift: true },
  /** ⌘⇧H: ask for the next hint rung (it still asks to confirm, unless the rung is free). */
  nextHint: { key: "h", mod: true, shift: true },
  /** ⌘↵ inside the Plan card checks the plan instead of running the code (7.3). */
  checkPlan: { key: "Enter", mod: true },
} as const satisfies Record<string, Hotkey>

/** The Plan card's root carries this attribute, so ⌘↵ inside it checks the plan. */
export const PLAN_CARD_ATTR = "data-plan-card"

export function isInPlanCard(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(`[${PLAN_CARD_ATTR}]`) !== null
}
