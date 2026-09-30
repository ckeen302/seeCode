import { useCallback, useSyncExternalStore } from "react"

/** Whether a media query matches; null during server rendering and hydration. */
export function useMediaQuery(query: string): boolean | null {
  const subscribe = useCallback(
    (listener: () => void) => {
      const media = window.matchMedia(query)
      media.addEventListener("change", listener)
      return () => media.removeEventListener("change", listener)
    },
    [query]
  )
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => null
  )
}
