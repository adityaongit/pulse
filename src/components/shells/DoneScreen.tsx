"use client"

import * as React from "react"
import { Check } from "lucide-react"

/** How long the confirmation stays before the task closes. */
export const DONE_MS = 1600

/**
 * The reference app's confirmation after a full-screen task saves ("SAVED / Have a great day!", journal-03;
 * "SUCCESS", dashboard-06): a green ring with a check, a caps title and one line. It closes itself after `DONE_MS`.
 */
export function DoneScreen({ title, body, onDone }: { title: string; body: string; onDone: () => void }) {
  const done = React.useRef(onDone)
  React.useEffect(() => {
    done.current = onDone
  })
  React.useEffect(() => {
    const t = window.setTimeout(() => done.current(), DONE_MS)
    return () => window.clearTimeout(t)
  }, [])
  return (
    <div role="status" className="flex flex-1 flex-col items-center justify-center gap-6 px-6 pb-16 text-center">
      <span className="grid size-30 place-items-center rounded-full ring-[5px] ring-optimal ring-inset animate-in fade-in-0 zoom-in-75 duration-300 ease-out-expo motion-reduce:zoom-in-100">
        <Check aria-hidden strokeWidth={2.5} className="size-12 text-optimal" />
      </span>
      <div className="space-y-2 animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-both delay-100 duration-300 ease-out-expo motion-reduce:slide-in-from-bottom-0">
        <p className="text-xl leading-7 font-bold tracking-[0.1em] uppercase">{title}</p>
        <p className="text-[15px] leading-[22px] text-pretty text-muted-foreground">{body}</p>
      </div>
    </div>
  )
}
