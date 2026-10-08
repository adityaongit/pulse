import { partColor } from "@/lib/bands"
import { hmm } from "@/lib/format"
import { cn } from "@/lib/utils"
import { LABEL } from "./primitives"

export type BreakdownItem = { key: string; label: string; detail?: string; value: number }

/**
 * A Trend View breakdown (spec §11 R29): a caps title with its unit in muted text ("Strain breakdown (days)"), one
 * segmented bar in proportion, then a row per part: colour square, bold count ("6x") or duration ("1:57"), label and
 * threshold ("Optimal (80%+)"). Parts with nothing in them keep their row but take no room in the bar.
 */
export function BreakdownBar({ title, unit, items }: { title: string; unit: "days" | "duration"; items: BreakdownItem[] }) {
  const total = items.reduce((a, i) => a + i.value, 0)
  const [name, aside] = title.split(/ (?=\()/)
  const amount = (v: number) => (unit === "days" ? `${v}x` : hmm(v))
  return (
    <section aria-label={title} className="min-w-0">
      <h3 className={cn(LABEL, "text-foreground")}>
        {name} {aside && <span className="text-muted-foreground">{aside}</span>}
      </h3>
      <div aria-hidden className="mt-3 flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-muted">
        {total > 0 &&
          items
            .filter((i) => i.value > 0)
            .map((i) => <span key={i.key} className="h-full first:rounded-l-full last:rounded-r-full" style={{ flexGrow: i.value, background: partColor(i.key) }} />)}
      </div>
      <ul className="mt-3 space-y-2">
        {items.map((i) => (
          <li key={i.key} className="flex items-center gap-2.5 text-[15px] leading-5">
            <span aria-hidden className="size-2.5 shrink-0 rounded-[2px]" style={{ background: partColor(i.key) }} />
            <span className="min-w-[3.5ch] font-numeric font-bold tabular-nums">{amount(i.value)}</span>
            <span className="min-w-0 text-foreground-secondary">
              {i.label}
              {i.detail && <span className="text-muted-foreground"> ({i.detail})</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
