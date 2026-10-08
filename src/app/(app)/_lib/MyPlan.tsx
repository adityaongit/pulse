import { ChevronDown } from "lucide-react"
import { SectionShell } from "@/components/shells/SectionShell"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { CARD_MATERIAL } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { CAPTION, LABEL } from "./view"

import type { HomeVM } from "@/server/queries/types"

type PlanVM = NonNullable<HomeVM["plan"]>

/**
 * "My Plan": one collapsible plan card with days left and a progress bar (the reference app, home-11). Built for when
 * Pulse has a plan source; Home renders it only behind `FEATURES.myPlan`.
 */
export function MyPlan({ plan, children }: { plan: PlanVM; children?: React.ReactNode }) {
  const pct = Math.round(plan.done * 100)
  return (
    <SectionShell variant="section" title="My Plan">
      <Collapsible className={cn(CARD_MATERIAL, "p-4 xl:p-5")}>
        <CollapsibleTrigger className="group/plan flex w-full items-start justify-between gap-3 rounded-md text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <span className="min-w-0">
            <span className={cn(LABEL, "block")}>{plan.title}</span>
            <span className={cn(CAPTION, "block text-foreground-secondary")}>
              <span className="font-numeric tabular-nums">{plan.daysLeft}</span> {plan.daysLeft === 1 ? "day" : "days"} left
            </span>
          </span>
          <ChevronDown aria-hidden strokeWidth={1.75} className="size-5 shrink-0 text-foreground-secondary transition-[rotate] duration-200 ease-standard group-data-[state=open]/plan:rotate-180" />
        </CollapsibleTrigger>
        <p className={cn(LABEL, "mt-3")}>
          <span className="font-numeric text-base tabular-nums">{pct}%</span> accomplished
        </p>
        <Progress value={pct} aria-label={`${plan.title}: ${pct}% accomplished`} className="mt-2 h-1 bg-dial-track" />
        {children && <CollapsibleContent className="pt-3">{children}</CollapsibleContent>}
      </Collapsible>
    </SectionShell>
  )
}
