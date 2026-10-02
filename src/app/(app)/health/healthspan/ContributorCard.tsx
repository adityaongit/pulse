"use client"

import * as React from "react"
import { CircleGauge, Dumbbell, Footprints, Heart, Moon, Timer } from "lucide-react"
import { formatValue, isSymbolUnit, type FormatKey } from "@/lib/format"
import type { HealthspanContributor } from "@/server/queries/types"
import { ContributorRow } from "@/components/metrics/ContributorRow"
import { ValueUnit } from "@/components/metrics/primitives"
import { ResponsiveSheet } from "@/components/shells/ResponsiveSheet"
import { SectionShell } from "@/components/shells/SectionShell"

const ICON: Record<string, React.ReactNode> = {
  sleepHours: <Moon />,
  sri: <Moon />,
  zone13: <Timer />,
  zone45: <Timer />,
  strength: <Dumbbell />,
  steps: <Footprints />,
  vo2max: <CircleGauge />,
  restingHr: <Heart />,
}

/** How each Healthspan input is shown: sleep hours in h:mm, weekly minutes in h:mm (spec §7.7). */
const SHOW: Record<string, { format: FormatKey; unit?: string; scale?: number }> = {
  sleepHours: { format: "duration", scale: 60 },
  sri: { format: "int", unit: "%" },
  zone13: { format: "duration" },
  zone45: { format: "duration" },
  strength: { format: "duration" },
  steps: { format: "grouped" },
  vo2max: { format: "decimal1", unit: "ml/kg/min" },
  restingHr: { format: "int", unit: "bpm" },
  leanMass: { format: "decimal1", unit: "kg" },
}

const withUnit = (text: string, unit?: string) => (unit ? `${text}${isSymbolUnit(unit) ? "" : " "}${unit}` : text)

function yearsLine(years: number | null) {
  if (years === null) return null
  const v = formatValue("decimal1", Math.abs(years))
  return v === "0.0" ? "No change from your age" : `${v} years ${years < 0 ? "younger" : "older"} than your age`
}

/** One Healthspan group card ("Sleep", "Strain", "Fitness"); each row opens its contributor sheet (journey 5). */
export function ContributorCard({ title, items }: { title: string; items: HealthspanContributor[] }) {
  const [open, setOpen] = React.useState<string | null>(null)
  const [last, setLast] = React.useState<HealthspanContributor | null>(null)
  const item = items.find((c) => c.key === open) ?? last
  const show = item ? SHOW[item.key] ?? { format: "decimal1" as const } : null
  const scale = (v: number) => v * (show?.scale ?? 1)

  return (
    <SectionShell variant="card" title={title}>
      <div className="divide-y divide-border">
        {items.map((c) => {
          const s = SHOW[c.key] ?? { format: "decimal1" as const }
          const k = s.scale ?? 1
          return (
            <div key={c.key}>
              <ContributorRow
                variant="healthspan"
                icon={ICON[c.key]}
                label={c.label}
                metric={c.metric.value === null ? c.metric : { ...c.metric, value: c.metric.value * k }}
                unit={s.unit}
                format={s.format}
                domain={[c.domain[0] * k, c.domain[1] * k]}
                target={c.target * k}
                years={c.years}
                higherIsBetter={c.higherIsBetter}
                reasonCopy={c.metric.value === null ? c.caption : undefined}
                onSelect={() => {
                  setOpen(c.key)
                  setLast(c)
                }}
              />
              {c.caption && c.metric.value !== null && <p className="-mt-2 pb-3 text-xs leading-4 font-medium text-muted-foreground">{c.caption}</p>}
            </div>
          )
        })}
      </div>
      <ResponsiveSheet open={!!open} onOpenChange={(o) => !o && setOpen(null)} title={item?.label ?? title}>
        {item && show && (
          <div className="space-y-4">
            <ValueUnit
              value={formatValue(show.format, item.metric.value === null ? null : scale(item.metric.value))}
              unit={show.unit}
              className="block font-numeric text-4xl leading-10 font-bold tracking-[-0.01em]"
            />
            <div className="space-y-1 text-[15px] leading-[22px]">
              <p className="text-foreground-secondary">Target for your age: {withUnit(formatValue(show.format, scale(item.target)), show.unit)}</p>
              {yearsLine(item.metric.value === null ? null : item.years) && (
                <p className={item.years! < 0 ? "text-optimal" : item.years! > 0 ? "text-warning" : "text-foreground-secondary"}>{yearsLine(item.years)}</p>
              )}
              {item.metric.value === null && item.caption && <p className="text-foreground-secondary">{item.caption}</p>}
            </div>
            <p className="max-w-[65ch] text-[15px] leading-[22px] text-pretty">{item.explanation}</p>
            <p className="text-xs leading-4 font-medium text-muted-foreground">Source: {item.source}.</p>
          </div>
        )}
      </ResponsiveSheet>
    </SectionShell>
  )
}
