import * as React from "react"

/** A media query as React state. The server snapshot is `false`. */
export function useMediaQuery(query: string) {
  const subscribe = React.useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query)
      mql.addEventListener("change", onChange)
      return () => mql.removeEventListener("change", onChange)
    },
    [query]
  )
  return React.useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false)
}

/** True under `prefers-reduced-motion: reduce`. Charts pass `isAnimationActive={!reduced}`. */
export const useReducedMotion = () => useMediaQuery("(prefers-reduced-motion: reduce)")
