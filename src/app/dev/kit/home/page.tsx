import { CalendarRange, ChevronRight, HeartPulse, Infinity as InfinityIcon, Brain, TrendingUp } from "lucide-react"
import Link from "next/link"
import * as fx from "@/components/__fixtures__/kit"
import { DayStrip } from "@/components/metrics/DayStrip"
import { KeyStatRow } from "@/components/metrics/KeyStatRow"
import { ScoreDial } from "@/components/metrics/ScoreDial"
import { SleepCard } from "@/components/metrics/SleepCard"
import { ActivityCard } from "@/components/metrics/ActivityCard"
import { PageShell } from "@/components/shells/PageShell"
import { SectionShell } from "@/components/shells/SectionShell"

/** PageShell layout="home" and layout="grid-2" specimens (spec §4.4, §7.1). */
export default function KitHomePage() {
  return (
    <PageShell
      title="Home"
      dateSwitcher={{ mode: "day" }}
      layout="home"
      slots={{
        top: (
          <div className="space-y-6">
            <div className="-mx-4 md:mx-0">
              <DayStrip indicator="recovery" days={fx.stripDays} />
            </div>
            <p aria-hidden className="text-center text-[13px] leading-4 font-semibold tracking-[0.35em] text-foreground-secondary uppercase">Pulse</p>
            <div className="flex items-start justify-center gap-2">
              <ScoreDial variant="sleep" size="md" value={74} href="/sleep" />
              <ScoreDial variant="recovery" size="md-hero" value={85} href="/recovery" />
              <ScoreDial variant="strain" size="md" value={14.2} target={[12, 15]} extraTags={["so_far"]} href="/strain" />
            </div>
          </div>
        ),
        left: (
          <SectionShell variant="section" title="Key statistics" aside="vs. 30-day average">
            <div className="divide-y divide-border rounded-xl bg-card px-4 py-1">
              {fx.keyStats.map(({ key, ...s }) => (
                <KeyStatRow key={key} variant="row" {...s} />
              ))}
            </div>
          </SectionShell>
        ),
        right: (
          <SectionShell variant="section" title="My Day">
            <SectionShell variant="card" title="Today's activities">
              <div className="space-y-1.5">
                <SleepCard {...fx.timeline.sleep} timeZone={fx.TZ} />
                <ActivityCard {...fx.timeline.run} timeZone={fx.TZ} />
              </div>
            </SectionShell>
          </SectionShell>
        ),
        bottom: (
          <div className="space-y-8">
            <Link
              href="/reports/2026-W39"
              className="flex h-14 items-center gap-3 rounded-xl bg-linear-to-r from-banner-from to-banner-to px-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <CalendarRange aria-hidden className="size-5" strokeWidth={1.75} />
              <span className="flex-1 text-base leading-[22px] font-semibold">Your week in review</span>
              <span className="text-xs leading-4 font-medium text-muted-foreground">Sep 22 - Sep 28</span>
              <ChevronRight aria-hidden className="size-4 text-foreground-secondary" strokeWidth={1.75} />
            </Link>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:gap-4">
              {[
                ["Healthspan", InfinityIcon],
                ["Health Monitor", HeartPulse],
                ["Stress Monitor", Brain],
                ["Fitness", TrendingUp],
              ].map(([title, Icon]) => {
                const I = Icon as typeof Brain
                return (
                  <SectionShell key={String(title)} variant="card" title={String(title)} href="/health">
                    <I aria-hidden className="size-6 text-muted-foreground" strokeWidth={1.75} />
                  </SectionShell>
                )
              })}
            </div>
          </div>
        ),
      }}
    />
  )
}
