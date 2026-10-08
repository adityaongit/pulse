"use client"

import * as React from "react"
import Link from "next/link"
import { ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"
import { GLASS } from "@/components/shells/AppNav"
import { CoachGlyph } from "../../coach/Coach"

type State = { text: string | null; failed: boolean }

/**
 * activity-01's coach pill: "Analyzing…" while the coach reads the workout, then its one-line take; tapping opens the
 * coach with a question about this workout. Pinned over the page's foot, clear of the round action. One request per
 * workout per tab session (kept in sessionStorage); a failure hides the pill.
 */
export function CoachGlance({ id, question }: { id: string; question: string }) {
  const key = `pulse:coach-glance:${id}`
  const [s, setS] = React.useState<State>({ text: null, failed: false })
  React.useEffect(() => {
    let cached: string | null = null
    try {
      cached = sessionStorage.getItem(key)
    } catch {}
    const ctl = new AbortController()
    ;(cached ? Promise.resolve(cached) : fetch("/api/coach/workout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }), signal: ctl.signal })
      .then(async (r) => {
        const j = (await r.json().catch(() => null)) as { text?: string } | null
        if (!r.ok || !j?.text) throw new Error("glance")
        try {
          sessionStorage.setItem(key, j.text)
        } catch {}
        return j.text
      }))
      .then((text) => setS({ text, failed: false }))
      .catch((e: Error) => e.name !== "AbortError" && setS({ text: null, failed: true }))
    return () => ctl.abort()
  }, [id, key])
  if (s.failed) return null
  return (
    <div className="sticky bottom-[max(calc(env(safe-area-inset-bottom)+12px),24px)] z-20 mr-[68px] md:mr-0">
      <Link
        href={`/coach?q=${encodeURIComponent(question)}`}
        aria-label={s.text ? `Coach: ${s.text} Ask the coach about this workout.` : "Coach is analyzing this workout. Ask the coach about it."}
        className={cn(GLASS, "flex min-h-14 items-center gap-3 rounded-[28px] py-2 pr-3 pl-2 outline-none transition-[scale] duration-150 ease-standard focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.98]")}
      >
        <CoachGlyph />
        <span aria-hidden className={cn("min-w-0 flex-1 text-[15px] leading-5 font-medium", s.text ? "line-clamp-2 text-pretty" : "animate-pulse text-foreground-secondary motion-reduce:animate-none")}>
          {s.text ?? "Analyzing…"}
        </span>
        <ChevronUp aria-hidden strokeWidth={2} className="size-5 shrink-0 text-foreground-secondary" />
      </Link>
    </div>
  )
}
