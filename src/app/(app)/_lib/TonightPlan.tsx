"use client"

import * as React from "react"
import { AlarmClock, Pencil, Sunset } from "lucide-react"
import { FEATURES } from "@/lib/features"
import { cn } from "@/lib/utils"
import { CARD_BUTTON } from "@/components/metrics/primitives"
import { openSheet } from "@/components/shells/SheetTrigger"
import { clock, hmm } from "@/lib/format"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { SleepPlanVM } from "@/server/queries/types"

// 32 px once the card is 288 px wide; narrower cards (the laptop half-column) step down to 26 and then 22 px so the
// two times never overflow (U18 H-01: at 1280 px the 26 px times ran into the card edge).
const TIME = "font-numeric text-[22px] leading-none font-bold tabular-nums @[15rem]:text-[26px] @[18rem]:text-[32px]"
const LABEL = "text-xs leading-4 font-bold tracking-[0.1em] uppercase text-foreground-secondary"

/** A smart alarm set in Pulse (`FEATURES.sleepAlarm`): its time and how it wakes you. */
export type SleepAlarmVM = { at: number; mode: "exact" | "window" }

/**
 * Home's "Tonight's sleep" body: bedtime for the chosen goal, typical wake, goal toggle (spec §7.1, journey 4). With an
 * alarm (the reference app, home-09) the right block is the alarm and an "Edit alarm" button closes the card.
 */
export function TonightPlan({ plan, timeZone, alarm }: { plan: SleepPlanVM; timeZone: string; alarm?: SleepAlarmVM | null }) {
  const wake = FEATURES.sleepAlarm && alarm ? alarm : null
  const [key, setKey] = React.useState<SleepPlanVM["plans"][number]["key"]>("peak")
  const chosen = plan.plans.find((p) => p.key === key) ?? plan.plans[0]
  const bed = clock(chosen.bedtimeAt, timeZone)
  return (
    <div role="group" aria-label={`Bed by ${bed} for ${chosen.label.toLowerCase()}`} className="@container flex flex-1 flex-col gap-4">
      {/* the reference app's "(sunset) 11:20 - - - - (alarm) 8:30" [latest-home-top-1]: two time blocks joined by a dashed rule. */}
      {/* Stretched, the times centre in the space above the toggle rather than leaving it all under them (SYM4). */}
      <div className="my-auto grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5">
        <span className="flex items-center gap-2">
          <Sunset aria-hidden className="size-6 shrink-0 text-foreground-secondary" strokeWidth={1.5} />
          <span className={TIME} aria-live="polite">
            {bed}
          </span>
        </span>
        <span aria-hidden className="h-0 w-full max-w-28 justify-self-center border-t-2 border-dashed border-foreground/20" />
        <span className="flex items-center gap-2">
          <AlarmClock aria-hidden className="size-6 shrink-0 text-foreground-secondary" strokeWidth={1.5} />
          <span className={TIME}>{clock(wake ? wake.at : plan.wakeAt, timeZone)}</span>
        </span>
        <span className={LABEL}>Recommended bedtime</span>
        <span />
        {wake ? (
          <span className={cn(LABEL, "text-right")}>
            <span className="inline-flex items-center gap-1.5 text-optimal-text">
              <span aria-hidden className="size-1.5 rounded-full bg-optimal" />
              Alarm on
            </span>
            <span className="block">{wake.mode === "exact" ? "Exact time" : "Wake window"}</span>
          </span>
        ) : (
          <span className={cn(LABEL, "text-right")}>Typical wake</span>
        )}
      </div>
      <ToggleGroup
        type="single"
        value={key}
        onValueChange={(v) => v && setKey(v as typeof key)}
        spacing={0}
        aria-label="Sleep goal"
        // At the foot of a stretched card, level with the Energy Bank's Charged / Drained tiles beside it (SYM4).
        className="mt-auto grid w-full grid-cols-3 gap-0.5 rounded-lg bg-muted p-0.5"
      >
        {plan.plans.map((p) => (
          <ToggleGroupItem
            key={p.key}
            value={p.key}
            aria-label={`${p.label}, ${Math.round(p.share * 100)} percent of need`}
            className="h-10 rounded-md! px-2 text-[13px] font-bold tracking-[0.1em] text-muted-foreground uppercase transition-[background-color,color] duration-150 ease-standard hover:bg-transparent hover:text-foreground data-[state=on]:bg-secondary data-[state=on]:text-foreground"
          >
            {p.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <p className="text-xs leading-4 font-medium text-muted-foreground">
        Need tonight: <span className="font-numeric tabular-nums">{hmm(plan.needMin)}</span>
      </p>
      {wake && (
        <button type="button" aria-haspopup="dialog" onClick={() => openSheet("alarm")} className={CARD_BUTTON}>
          <Pencil aria-hidden className="size-4" strokeWidth={2} />
          Edit alarm
        </button>
      )}
    </div>
  )
}
