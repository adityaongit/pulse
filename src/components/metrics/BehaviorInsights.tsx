import { Lightbulb } from "lucide-react"
import type { BehaviorChip } from "@/core/algorithms/behaviorChips"
import { SectionShell } from "@/components/shells/SectionShell"
import { StatusChip } from "./primitives"

const TONE = { up: "optimal", down: "warning", neutral: "neutral" } as const
const DIR = { up: "up", down: "down", neutral: "flat" } as const

/**
 * The reference app's Behavior Insights card on Recovery (recovery-11, spec §11 R34): a lightbulb title linking to
 * Journal insights, one line of copy, then a chip per behaviour from the day before, green up when it has gone with a
 * higher next-day Recovery, orange down when lower, grey when no clear effect.
 */
export function BehaviorInsights({ chips, href }: { chips: BehaviorChip[]; href: string }) {
  if (!chips.length) return null
  return (
    <SectionShell variant="card" level={2} title="Behavior insights" info={false} href={href} icon={<Lightbulb />}>
      <p className="text-[15px] leading-[22px] text-pretty text-foreground-secondary">Some of your behaviors from yesterday may have affected your Recovery score today.</p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {chips.map((c) => (
          <li key={c.key}>
            <StatusChip tone={TONE[c.effect]} delta={DIR[c.effect]} className="min-h-8 rounded-lg px-3 text-[13px]">
              {c.label}
              <span className="sr-only">{c.effect === "up" ? ", went with higher Recovery" : c.effect === "down" ? ", went with lower Recovery" : ", no clear effect"}</span>
            </StatusChip>
          </li>
        ))}
      </ul>
    </SectionShell>
  )
}
