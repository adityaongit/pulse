"use client"

import * as React from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"

const KEY = "pulse:workout-banner-dismissed"
const dismissed = () => {
  try {
    return localStorage.getItem(KEY) === "1"
  } catch {
    return false
  }
}
const subscribe = (on: () => void) => {
  window.addEventListener("storage", on)
  return () => window.removeEventListener("storage", on)
}

/**
 * activity-01's "Get More from Your Workouts": what logging exercises adds, closed for good with X (kept on this device).
 * Shown only with the strength trainer (FEATURES.strengthTrainer).
 */
export function WorkoutBanner() {
  // Hidden on the server and until the device says it wasn't dismissed.
  const stored = React.useSyncExternalStore(subscribe, dismissed, () => true)
  const [closed, setClosed] = React.useState(false)
  if (stored || closed) return null
  const close = () => {
    setClosed(true)
    try {
      localStorage.setItem(KEY, "1")
    } catch {}
  }
  return (
    <aside aria-label="Get more from your workouts" className="relative rounded-2xl bg-linear-to-r from-insight-from to-insight-to p-px">
      <div className="rounded-[15px] bg-card p-4 pr-12">
        <p className="text-[17px] leading-6 font-semibold">Get more from your workouts</p>
        <p className="mt-1 text-[15px] leading-[22px] text-pretty text-foreground-secondary">
          Strain counts your heart rate. Log your sets and Pulse adds the muscular load too.
        </p>
      </div>
      <Button variant="ghost" size="icon-touch" aria-label="Dismiss" onClick={close} className="absolute top-1 right-1">
        <X aria-hidden strokeWidth={2} className="size-5" />
      </Button>
    </aside>
  )
}
