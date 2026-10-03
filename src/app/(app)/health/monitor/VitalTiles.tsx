"use client"

import * as React from "react"
import { Activity, Droplet, Heart, Thermometer, Wind } from "lucide-react"
import { formatValue, isSymbolUnit, type FormatKey } from "@/lib/format"
import type { Vital, VitalKey } from "@/server/queries/types"
import { TrendChart } from "@/components/charts/TrendChart"
import { KeyStatRow, KeyStatRowSkeleton } from "@/components/metrics/KeyStatRow"
import { StatusChip, ValueUnit } from "@/components/metrics/primitives"
import { ResponsiveSheet } from "@/components/shells/ResponsiveSheet"

const ICON: Record<VitalKey, React.ReactNode> = {
  resp: <Wind />,
  spo2: <Droplet />,
  restingHr: <Heart />,
  hrv: <Activity />,
  skinTempDev: <Thermometer />,
}
const FORMAT: Record<VitalKey, FormatKey> = { resp: "decimal1", spo2: "int", restingHr: "int", hrv: "int", skinTempDev: "signed1" }
const NOTE = "Your normal range is your baseline plus or minus two standard deviations, from the last 60 nights."

/** The five vital tiles, each opening its vital sheet (journey 6), plus the ranges note cell. */
export function VitalTiles({ vitals }: { vitals: Vital[] }) {
  const [open, setOpen] = React.useState<VitalKey | null>(null)
  const [last, setLast] = React.useState<Vital | null>(null)
  const v = vitals.find((x) => x.key === open) ?? last
  const fmt = v ? FORMAT[v.key] : "int"
  // Ranges always show one decimal, as the chips do, so a whole-number reading never looks equal to its bound.
  const rangeFmt = v?.key === "skinTempDev" ? "signed1" : "decimal1"
  const unit = (u: string) => (isSymbolUnit(u) ? u : ` ${u}`)

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5 xl:gap-4">
        {vitals.map((x) => (
          <KeyStatRow
            key={x.key}
            variant="tile"
            icon={ICON[x.key]}
            // WHOOP's tiles abbreviate the two heart metrics ("RHR", "HRV") [latest-health-monitor-1]; the sheet keeps the full name.
            label={x.key === "restingHr" || x.key === "hrv" ? x.short : x.label}
            metric={x.metric}
            unit={x.unit}
            format={FORMAT[x.key]}
            direction="none"
            chip={x.chip ?? undefined}
            onSelect={() => {
              setOpen(x.key)
              setLast(x)
            }}
          />
        ))}
        <p className="p-4 text-xs leading-4 font-medium text-pretty text-muted-foreground xl:hidden">{NOTE}</p>
      </div>
      <p className="mt-3 hidden text-xs leading-4 font-medium text-muted-foreground xl:block">{NOTE}</p>

      <ResponsiveSheet open={!!open} onOpenChange={(o) => !o && setOpen(null)} title={v?.label ?? "Vital"}>
        {v && (
          <div className="space-y-4">
            <div className="space-y-2">
              <ValueUnit value={formatValue(fmt, v.metric.value)} unit={v.unit} className="block font-numeric text-4xl leading-10 font-bold tracking-[-0.01em]" />
              {v.chip && v.metric.value !== null && <StatusChip tone={v.chip.tone}>{v.chip.text}</StatusChip>}
            </div>
            {v.range && (
              <p className="text-[15px] leading-[22px] text-foreground-secondary tabular-nums">
                Your normal range: {formatValue(rangeFmt, v.range.low)} - {v.key === "spo2" ? 100 : formatValue(rangeFmt, v.range.high)}
                {unit(v.unit)}
              </p>
            )}
            <TrendChart
              label={v.label}
              data={{ value: v.trend.points.map((p) => ({ date: p.day, value: p.value })), reason: null, provisional: false }}
              unit={v.unit}
              format={fmt}
              colorBy="single"
              fixedRange="6m"
              baseline={v.trend.baseline}
            />
          </div>
        )}
      </ResponsiveSheet>
    </>
  )
}

const SKELETON_LABEL: [VitalKey, string][] = [
  ["resp", "Respiratory rate"],
  ["spo2", "Blood oxygen"],
  ["restingHr", "RHR"],
  ["hrv", "HRV"],
  ["skinTempDev", "Skin temp (from baseline)"],
]

/** Loading shape (spec §5.19): the same grid of five tiles and the note, with bars for the readings. */
export function VitalTilesSkeleton() {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5 xl:gap-4">
        {SKELETON_LABEL.map(([k, l]) => (
          <KeyStatRowSkeleton key={k} variant="tile" label={l} icon={ICON[k]} />
        ))}
        <p className="p-4 text-xs leading-4 font-medium text-pretty text-muted-foreground xl:hidden">{NOTE}</p>
      </div>
      <p className="mt-3 hidden text-xs leading-4 font-medium text-muted-foreground xl:block">{NOTE}</p>
    </>
  )
}
