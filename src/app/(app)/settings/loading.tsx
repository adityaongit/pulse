import { DetailShell } from "@/components/shells/DetailShell"
import { SectionShell } from "@/components/shells/SectionShell"
import { Skeleton, SkeletonText } from "@/components/ui/skeleton"

const BODY = "text-[15px] leading-[22px]"
const ROW = "flex min-h-13 items-center justify-between gap-3 py-2"
const PROFILE = ["Birth date", "Age", "Sex", "Height", "Max heart rate", "Time zone"]

/** A name and status line beside a 56 px disc (Account) or 44 px tile (Data source). */
function Identity({ tile }: { tile: string }) {
  return (
    <div className="flex min-h-11 items-center gap-3">
      <Skeleton className={tile} />
      <div className="min-w-0 flex-1">
        <SkeletonText className={`${BODY} w-28`} />
        <SkeletonText className="w-40 text-[13px] leading-[18px]" />
      </div>
    </div>
  )
}

const Buttons = () => (
  <div className="mt-4 grid grid-cols-2 gap-2">
    <Skeleton className="h-11 rounded-xl" />
    <Skeleton className="h-11 rounded-xl" />
  </div>
)

/** Settings: SettingsView's one 640 px column of Account, Data source, Profile, About, with static labels (spec §7.14, §5.19). */
export default function Loading() {
  return (
    <DetailShell
      title="Settings"
      dismiss="close"
      primary={
        <div aria-hidden className="mx-auto flex w-full max-w-[640px] flex-col gap-3 md:gap-4">
          <SectionShell variant="card" level={2} title="Account">
            <Identity tile="size-14 rounded-full" />
            <Buttons />
          </SectionShell>
          <SectionShell variant="card" level={2} title="Data source">
            <Identity tile="size-11 rounded-xl" />
            {/* The status body (demo, not connected) and the Data types row (a connected source) take about the same
                height, and a connected source shows only the row, so the skeleton shows the row. */}
            <Buttons />
            <div className={`${ROW} mt-4 border-t border-border`}>
              <span className={BODY}>Data types</span>
              <SkeletonText className="w-24 text-[13px] leading-[18px]" />
            </div>
          </SectionShell>
          <SectionShell variant="card" level={2} title="Profile" action={<Skeleton className="h-5 w-14 rounded-full" />}>
            <dl className="divide-y divide-border">
              {PROFILE.map((k) => (
                <div key={k} className={ROW}>
                  <dt className={BODY}>{k}</dt>
                  <SkeletonText className={`${BODY} w-24`} />
                </div>
              ))}
            </dl>
            <SkeletonText className="mt-2 w-56 text-xs leading-4" />
          </SectionShell>
          <SectionShell variant="card" level={2} title="About">
            <SkeletonText className={`${BODY} w-full md:w-3/4`} />
            <SkeletonText className={`${BODY} w-2/3 md:hidden`} />
            <dl className="mt-3 divide-y divide-border">
              {["Version", "Scoring version"].map((k) => (
                <div key={k} className={ROW}>
                  <dt className={BODY}>{k}</dt>
                  <SkeletonText className={`${BODY} w-10`} />
                </div>
              ))}
            </dl>
          </SectionShell>
        </div>
      }
    />
  )
}
