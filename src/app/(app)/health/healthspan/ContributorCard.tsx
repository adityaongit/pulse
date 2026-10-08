"use client"

import Link from "next/link"
import { ArrowRight, ChevronDown, CircleGauge, Dumbbell, Footprints, Heart, Moon, Timer } from "lucide-react"
import { useSearchParams } from "next/navigation"
import { formatValue, isSymbolUnit, NBSP, type FormatKey } from "@/lib/format"
import type { HealthspanContributor } from "@/server/queries/types"
import { ContributorRow } from "@/components/metrics/ContributorRow"
import { CAPTION, TEXT_LINK } from "@/components/metrics/primitives"
import { SectionShell } from "@/components/shells/SectionShell"
import { Accordion as AccordionPrimitive } from "radix-ui"

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

const withUnit = (text: string, unit?: string) => (unit ? `${text}${isSymbolUnit(unit) ? "" : NBSP}${unit}` : text)

/**
 * A Healthspan group (Sleep, Strain, Fitness): one row per factor that opens in place (health-03), showing how the
 * factor stands ("Outperforming"), the target for your age, the evidence and VIEW TREND. `?contributor=` opens a row
 * on arrival.
 */
export function ContributorCard({ title, items, className }: { title: string; items: HealthspanContributor[]; className?: string }) {
  const linked = useSearchParams().get("contributor")
  return (
    <SectionShell
      variant="card"
      title={title}
      info={{ title: `${title} and Pulse Age`, body: "Each factor's bar marks your 6-month average above it and your 30-day average below it, from poor to good for your age. Pulse Age uses the 6-month average; Pace of Aging compares the 30 days with it." }}
      className={className}
      fill
    >
      <AccordionPrimitive.Root type="multiple" defaultValue={linked ? [linked] : []} className="flex flex-1 flex-col divide-y divide-border">
        {items.map((c) => {
          const s = SHOW[c.key] ?? { format: "decimal1" as const }
          const k = s.scale ?? 1
          const show = (v: number) => withUnit(formatValue(s.format, v * k), s.unit)
          return (
            <AccordionPrimitive.Item key={c.key} value={c.key} className="flex flex-1 flex-col justify-center">
              <AccordionPrimitive.Header>
                <AccordionPrimitive.Trigger className="group/factor -mx-2 flex w-[calc(100%+1rem)] items-start gap-1 rounded-lg px-2 text-left outline-none transition-[background-color] duration-150 ease-standard hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50">
                  <ContributorRow
                    variant="healthspan"
                    icon={ICON[c.key]}
                    label={c.label}
                    metric={c.metric.value === null ? c.metric : { ...c.metric, value: c.metric.value * k }}
                    recent={c.recent === null ? null : c.recent * k}
                    unit={s.unit}
                    format={s.format}
                    domain={[c.domain[0] * k, c.domain[1] * k]}
                    years={c.years}
                    higherIsBetter={c.higherIsBetter}
                    reasonCopy={c.metric.value === null ? c.caption : undefined}
                    className="min-w-0 flex-1"
                  />
                  <ChevronDown aria-hidden strokeWidth={2} className="mt-3.5 size-5 shrink-0 text-muted-foreground transition-[rotate] duration-200 ease-standard group-data-[state=open]/factor:rotate-180" />
                </AccordionPrimitive.Trigger>
              </AccordionPrimitive.Header>
              <AccordionPrimitive.Content className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down motion-reduce:animate-none">
                <div className="space-y-3 pb-5">
                  {c.state && (
                    <div className="space-y-1">
                      <p className="text-[17px] leading-6 font-semibold">{c.state.title}</p>
                      <p className="max-w-[65ch] text-[15px] leading-[22px] text-pretty text-foreground-secondary">{c.state.body}</p>
                    </div>
                  )}
                  <p className="text-[15px] leading-[22px] text-foreground-secondary">Target for your age: {show(c.target)}</p>
                  {c.caption && c.metric.value !== null && <p className={CAPTION}>{c.caption}</p>}
                  <p className="max-w-[65ch] text-[15px] leading-[22px] text-pretty">{c.explanation}</p>
                  <p className={CAPTION}>Source: {c.source}.</p>
                  <Link href={c.trendHref} className={TEXT_LINK}>
                    View trend
                    <ArrowRight aria-hidden className="size-3.5" strokeWidth={2} />
                  </Link>
                </div>
              </AccordionPrimitive.Content>
            </AccordionPrimitive.Item>
          )
        })}
      </AccordionPrimitive.Root>
    </SectionShell>
  )
}
