import { Activity, Heart, Moon, Thermometer, Wind } from "lucide-react"
import * as fx from "@/components/__fixtures__/kit"
import { TrendChart } from "@/components/charts/TrendChart"
import { ContributorRow } from "@/components/metrics/ContributorRow"
import { DriverList } from "@/components/metrics/DriverList"
import { InsightCard } from "@/components/metrics/InsightCard"
import { ScoreDial } from "@/components/metrics/ScoreDial"
import { DetailShell } from "@/components/shells/DetailShell"
import { SectionShell } from "@/components/shells/SectionShell"
import { Card } from "@/components/ui/card"

const ICON: Record<string, React.ReactNode> = { hrv: <Activity />, rhr: <Heart />, rr: <Wind />, sleep: <Moon />, temp: <Thermometer /> }

/** DetailShell specimen, laid out like Recovery (spec §7.2). */
export default function KitDetailPage() {
  return (
    <DetailShell
      title="Recovery"
      subtitle="Kit specimen"
      dateSwitcher={{ mode: "day" }}
      info={{
        title: "How Recovery works",
        body: (
          <p>
            Recovery shows how ready your body is to take on strain, from 0 to 100%. Pulse scores it each morning from last night&apos;s heart
            rate variability, resting heart rate, respiratory rate, sleep performance and skin temperature, each compared with your own baseline.
          </p>
        ),
      }}
      hero={<ScoreDial variant="recovery" size="lg" value={72} />}
      summary={
        <Card className="gap-0 px-4 py-1 ring-0">
          <div className="divide-y divide-border">
            {fx.contributors.map(({ key, ...c }) => (
              <ContributorRow key={key} variant="recovery" icon={ICON[key]} {...c} />
            ))}
          </div>
          <p className="my-3 rounded-lg bg-inset px-3 py-2 text-xs leading-4 font-medium text-foreground-secondary">Dot: today. Shaded: your normal range.</p>
        </Card>
      }
      insight={<InsightCard {...fx.insight} />}
      primary={
        <SectionShell variant="card" title="Recovery trend" level={2}>
          <TrendChart label="Recovery" data={fx.ok(fx.recoveryTrend)} unit="%" format="int" colorBy="band" direction="up" deltas={{ w: 4, m: -3, "6m": 2 }} />
        </SectionShell>
      }
      secondary={[
        <SectionShell key="drivers" variant="card" title="What shaped it" id="drivers" level={2}>
          <DriverList variant="recovery" unit="pts" data={fx.recoveryDrivers} />
        </SectionShell>,
        <SectionShell key="forecast" variant="card" title="Tomorrow's forecast" level={2}>
          <div className="flex items-center gap-4">
            <ScoreDial variant="stat" size="sm" value={71} max={100} color="recovery-green" unit="%" label="Tomorrow" extraTags={["estimate"]} />
            <p className="text-xs leading-4 font-medium text-muted-foreground">Estimate. Based on today&apos;s strain and your recent trend.</p>
          </div>
        </SectionShell>,
      ]}
    />
  )
}
