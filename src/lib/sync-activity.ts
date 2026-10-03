import * as React from "react"

// Client-side "a sync is running" flag, so the band's syncing ring turns on the moment Sync now is pressed,
// before the server status catches up. A counter, so overlapping syncs keep it on until the last one ends.
let running = 0
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

/** Marks a sync as running; call the returned function when it ends. */
export function startSyncing(): () => void {
  running++
  emit()
  let done = false
  return () => {
    if (done) return
    done = true
    running--
    emit()
  }
}

const subscribe = (cb: () => void) => {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export const useSyncing = () => React.useSyncExternalStore(subscribe, () => running > 0, () => false)
