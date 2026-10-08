import type { ReactNode } from "react"
import { Activity, Droplet, Heart, Thermometer, Wind } from "lucide-react"
import type { FormatKey } from "@/lib/format"
import type { Vital, VitalKey } from "@/server/queries/types"
import { KeyStatRow, KeyStatRowSkeleton } from "@/components/metrics/KeyStatRow"
import { dayHref, metricHref } from "@/lib/url"

const ICON: Record<VitalKey, ReactNode> = {
  resp: <Wind />,
  spo2: <Droplet />,
  restingHr: <Heart />,
  hrv: <Activity />,
  skinTempDev: <Thermometer />,
}
const FORMAT: Record<VitalKey, FormatKey> = { resp: "decimal1", spo2: "int", restingHr: "int", hrv: "int", skinTempDev: "signed1" }
const GRID = "grid grid-cols-2 gap-3 *:last:col-span-2 xl:grid-cols-5 xl:gap-4 xl:*:last:col-span-1"
const NOTE = "Resting heart rate, HRV and skin temperature use Google’s personal ranges when it has them; otherwise your range is your baseline ± 2 SD over 60 nights."

const DETAIL_KEY: Record<VitalKey, string> = { resp: "resp", spo2: "spo2", restingHr: "rhr", hrv: "hrv", skinTempDev: "skin" }

export function VitalTiles({ vitals, day, today }: { vitals: Vital[]; day: string; today: string }) {
  return (
    <>
      <div className={GRID}>
        {vitals.map((x, i) => (
          <KeyStatRow
            key={x.key}
            variant="tile"
            wide={i === vitals.length - 1 && "xl"}
            spark={{ values: x.trend.points.slice(-30).map((p) => p.value), band: x.range, caption: "Last 30 nights" }}
            icon={ICON[x.key]}
            label={x.key === "restingHr" || x.key === "hrv" ? x.short : x.label}
            metric={x.metric}
            unit={x.unit}
            format={FORMAT[x.key]}
            direction="none"
            chip={x.chip ?? undefined}
            href={dayHref(metricHref(DETAIL_KEY[x.key]), day, today)}
          />
        ))}
      </div>
      <p className="mt-3 text-xs leading-4 font-medium text-pretty text-muted-foreground">{NOTE}</p>
    </>
  )
}

const SKELETON_LABEL: [VitalKey, string][] = [
  ["resp", "Respiratory rate"],
  ["spo2", "Blood oxygen"],
  ["restingHr", "RHR"],
  ["hrv", "HRV"],
  ["skinTempDev", "Skin temperature"],
]

export function VitalTilesSkeleton() {
  return (
    <>
      <div className={GRID}>
        {SKELETON_LABEL.map(([k, l]) => (
          <KeyStatRowSkeleton key={k} variant="tile" label={l} icon={ICON[k]} />
        ))}
      </div>
      <p className="mt-3 text-xs leading-4 font-medium text-pretty text-muted-foreground">{NOTE}</p>
    </>
  )
}
