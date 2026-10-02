"use client"

import * as React from "react"
import { clock, hmm } from "@/lib/format"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { SleepPlanVM } from "@/server/queries/types"

const TIME = "font-numeric text-[32px] leading-none font-bold tabular-nums"
const LABEL = "text-xs leading-4 font-bold tracking-[0.08em] uppercase text-foreground-secondary"

/** Home's "Tonight's sleep" body: bedtime for the chosen goal, typical wake, goal toggle (spec §7.1, journey 4). */
export function TonightPlan({ plan, timeZone }: { plan: SleepPlanVM; timeZone: string }) {
  const [key, setKey] = React.useState<SleepPlanVM["plans"][number]["key"]>("peak")
  const chosen = plan.plans.find((p) => p.key === key) ?? plan.plans[0]
  const bed = clock(chosen.bedtimeAt, timeZone)
  return (
    <div role="group" aria-label={`Bed by ${bed} for ${chosen.label.toLowerCase()}`} className="space-y-4">
      <div className="grid grid-cols-[auto_minmax(1rem,1fr)_auto] items-center gap-x-3 gap-y-1.5">
        <span className={TIME} aria-live="polite">
          {bed}
        </span>
        <span aria-hidden className="border-t border-dashed border-border" />
        <span className={TIME}>{clock(plan.wakeAt, timeZone)}</span>
        <span className={LABEL}>Recommended bedtime</span>
        <span />
        <span className={`${LABEL} text-right`}>Typical wake</span>
      </div>
      <ToggleGroup
        type="single"
        value={key}
        onValueChange={(v) => v && setKey(v as typeof key)}
        spacing={0}
        aria-label="Sleep goal"
        className="grid w-full grid-cols-3 gap-0.5 rounded-lg bg-muted p-0.5"
      >
        {plan.plans.map((p) => (
          <ToggleGroupItem
            key={p.key}
            value={p.key}
            aria-label={`${p.label}, ${Math.round(p.share * 100)} percent of need`}
            className="h-10 rounded-md! px-2 text-[13px] font-bold tracking-[0.06em] text-muted-foreground uppercase transition-[background-color,color] duration-150 ease-standard hover:bg-transparent hover:text-foreground data-[state=on]:bg-secondary data-[state=on]:text-foreground"
          >
            {p.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <p className="text-xs leading-4 font-medium text-muted-foreground">
        Need tonight: <span className="font-numeric tabular-nums">{hmm(plan.needMin)}</span>
      </p>
    </div>
  )
}
