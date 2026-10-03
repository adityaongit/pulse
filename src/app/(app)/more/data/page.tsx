import { connection } from "next/server"
import { format, parseISO } from "date-fns"
import { Download } from "lucide-react"
import { currentSession } from "@/server/auth"
import { getYourData } from "@/server/queries/settings"
import { CAPTION } from "@/components/metrics/primitives"
import { DetailShell } from "@/components/shells/DetailShell"
import { SectionShell } from "@/components/shells/SectionShell"
import { Button } from "@/components/ui/button"

export const metadata = { title: "Your data" }

const BODY = "max-w-[65ch] text-[15px] leading-[22px] text-pretty text-foreground-secondary"
const grouped = new Intl.NumberFormat("en")

/** A plain download link styled as a button: the route answers with an attachment. */
function DownloadLink({ href, label, variant = "secondary" }: { href: string; label: string; variant?: "secondary" | "default" }) {
  return (
    <Button asChild variant={variant} size="touch" className="w-full">
      <a href={href} download>
        <Download aria-hidden />
        {label}
      </a>
    </Button>
  )
}

/** Your data `/more/data` (U21): daily scores and journal answers as CSV or JSON, and an owner-only SQLite backup. */
export default async function YourDataPage() {
  await connection()
  const vm = getYourData()
  const owner = (await currentSession())?.kind === "owner"
  const since = vm.first ? ` since ${format(parseISO(vm.first), "d MMM yyyy")}` : ""

  return (
    <DetailShell
      title="Your data"
      primary={
        <div className="mx-auto flex w-full max-w-[640px] flex-col gap-3 md:gap-4">
          <SectionShell variant="card" level={2} title="Daily scores" aside={<span className={`${CAPTION} tabular-nums`}>{grouped.format(vm.days)} days</span>}>
            <p className={BODY}>
              One row per day{since}: Recovery, Strain, sleep performance, hours and consistency, heart rate variability, resting heart rate, respiratory rate,
              stress and steps.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <DownloadLink href="/export/daily?format=csv" label="CSV" />
              <DownloadLink href="/export/daily?format=json" label="JSON" />
            </div>
          </SectionShell>

          <SectionShell variant="card" level={2} title="Journal" aside={<span className={`${CAPTION} tabular-nums`}>{grouped.format(vm.answers)} answers</span>}>
            <p className={BODY}>Every check-in answer, hidden behaviours included. The JSON also lists your behaviours.</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <DownloadLink href="/export/journal?format=csv" label="CSV" />
              <DownloadLink href="/export/journal?format=json" label="JSON" />
            </div>
          </SectionShell>

          <SectionShell variant="card" level={2} title="Backup">
            <p className={BODY}>
              Everything Pulse stores, as one SQLite file. Your Google access and the sign-in secret are removed from the copy, so a restored Pulse asks you to
              sign in and connect Google again.
            </p>
            <div className="mt-4">
              {owner ? (
                <DownloadLink href="/export/backup" label="Download backup" variant="default" />
              ) : (
                <>
                  <Button variant="secondary" size="touch" className="w-full" disabled>
                    <Download aria-hidden />
                    Download backup
                  </Button>
                  <p className={`${CAPTION} mt-2`}>Backups are for the owner&apos;s Google account. Demo data is generated, so there is nothing to keep.</p>
                </>
              )}
            </div>
          </SectionShell>

          <p className={CAPTION}>No export includes your Google access tokens.</p>
        </div>
      }
    />
  )
}
