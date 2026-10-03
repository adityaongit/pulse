import { DetailShell } from "@/components/shells/DetailShell"
import { SectionShell } from "@/components/shells/SectionShell"
import { Skeleton, SkeletonText } from "@/components/ui/skeleton"

const BODY = "max-w-[65ch] text-[15px] leading-[22px] text-pretty text-foreground-secondary"
const count = <SkeletonText className="w-16 text-xs leading-4" />

/** Your data: the three cards with their static copy and buttons' boxes; only the counts are bars (spec §5.19). */
export default function Loading() {
  const buttons = (n: 1 | 2) => (
    <div className={n === 2 ? "mt-4 grid grid-cols-2 gap-2" : "mt-4"}>
      {Array.from({ length: n }, (_, i) => (
        <Skeleton key={i} className="h-11 w-full rounded-xl" />
      ))}
    </div>
  )
  return (
    <DetailShell
      title="Your data"
      primary={
        <div aria-hidden className="mx-auto flex w-full max-w-[640px] flex-col gap-3 md:gap-4">
          <SectionShell variant="card" level={2} title="Daily scores" aside={count}>
            <SkeletonText className={`${BODY} w-full`} />
            <SkeletonText className={`${BODY} w-full`} />
            <SkeletonText className={`${BODY} w-3/4`} />
            {buttons(2)}
          </SectionShell>
          <SectionShell variant="card" level={2} title="Journal" aside={count}>
            <p className={BODY}>Every check-in answer, hidden behaviours included. The JSON also lists your behaviours.</p>
            {buttons(2)}
          </SectionShell>
          <SectionShell variant="card" level={2} title="Backup">
            <p className={BODY}>
              Everything Pulse stores, as one SQLite file. Your Google access and the sign-in secret are removed from the copy, so a restored Pulse asks you to
              sign in and connect Google again.
            </p>
            {buttons(1)}
          </SectionShell>
        </div>
      }
    />
  )
}
