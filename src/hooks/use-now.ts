import * as React from "react"

// One minute clock shared by every relative-time label. The server snapshot is null, so relative
// times render after hydration and never drift between server and client HTML.
let now = 0
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | undefined

function subscribe(cb: () => void) {
  listeners.add(cb)
  if (!timer) {
    now = Date.now()
    timer = setInterval(() => {
      now = Date.now()
      listeners.forEach((l) => l())
    }, 60_000)
  }
  return () => {
    listeners.delete(cb)
    if (!listeners.size && timer) {
      clearInterval(timer)
      timer = undefined
    }
  }
}

export const useNow = () => React.useSyncExternalStore(subscribe, () => (now ||= Date.now()), () => null)
