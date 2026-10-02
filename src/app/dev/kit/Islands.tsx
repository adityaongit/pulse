"use client"

import * as React from "react"
import { CircleGauge, Heart, Wind } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ResponsiveSheet } from "@/components/shells/ResponsiveSheet"
import { ContributorRow } from "@/components/metrics/ContributorRow"
import { DriverList } from "@/components/metrics/DriverList"
import { KeyStatRow } from "@/components/metrics/KeyStatRow"
import { healthspan, impactDrivers, vitals } from "@/components/__fixtures__/kit"

// Client-only demos: sheets and onSelect handlers cannot be passed from a server page.

export function SheetDemo() {
  const [open, setOpen] = React.useState<false | "default" | "tall">(false)
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="touch" variant="secondary" onClick={() => setOpen("default")}>
        Open sheet
      </Button>
      <Button size="touch" variant="secondary" onClick={() => setOpen("tall")}>
        Open tall sheet
      </Button>
      <ResponsiveSheet
        open={!!open}
        onOpenChange={(o) => !o && setOpen(false)}
        size={open === "tall" ? "tall" : "default"}
        title="How Recovery works"
        description="Updated each morning"
        footer={
          <>
            <Button size="touch" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="touch" onClick={() => setOpen(false)}>
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-[15px] leading-[22px] text-pretty text-foreground-secondary">
          <p>
            Recovery shows how ready your body is to take on strain, from 0 to 100%. Pulse scores it each morning from last night&apos;s heart rate
            variability, resting heart rate, respiratory rate, sleep performance and skin temperature, each compared with your own baseline.
          </p>
          <p>Recovery needs 7 nights of HRV before the first score and stays provisional until 14.</p>
        </div>
      </ResponsiveSheet>
    </div>
  )
}

export function SelectableImpact() {
  const [selected, setSelected] = React.useState<string | undefined>("alcohol")
  return <DriverList variant="impact" unit="%" data={impactDrivers} selectedKey={selected} onSelect={setSelected} />
}

const HS_ICON: Record<string, React.ReactNode> = { vo2: <CircleGauge />, rhr: <Heart />, lean: <CircleGauge /> }

export function HealthspanList() {
  const [open, setOpen] = React.useState<string | null>(null)
  const item = healthspan.find((h) => h.key === open)
  return (
    <>
      <div className="divide-y divide-border">
        {healthspan.map(({ key, ...h }) => (
          <ContributorRow key={key} variant="healthspan" icon={HS_ICON[key]} {...h} onSelect={() => setOpen(key)} />
        ))}
      </div>
      <ResponsiveSheet open={!!open} onOpenChange={(o) => !o && setOpen(null)} title={item?.label ?? ""}>
        <p className="text-[15px] leading-[22px] text-foreground-secondary">Contributor detail sheet (journey 5).</p>
      </ResponsiveSheet>
    </>
  )
}

export function SelectableTile() {
  const [open, setOpen] = React.useState(false)
  const v = vitals[0]
  return (
    <>
      <KeyStatRow variant="tile" icon={<Wind />} direction="neutral" label={v.label} metric={v.metric} unit={v.unit} format={v.format} chip={v.chip} onSelect={() => setOpen(true)} />
      <ResponsiveSheet open={open} onOpenChange={setOpen} title="Respiratory rate">
        <p className="text-[15px] leading-[22px] text-foreground-secondary">Vital detail sheet (journey 6).</p>
      </ResponsiveSheet>
    </>
  )
}
