import Link from "next/link"
import { format, parseISO } from "date-fns"
import { Check, CircleAlert, Minus, TriangleAlert } from "lucide-react"
import { cn } from "@/lib/utils"
import { ago } from "@/lib/format"
import type { SettingsVM } from "@/server/queries/types"
import { SectionShell } from "@/components/shells/SectionShell"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { HEALTH_SIGNUP_URL } from "@/lib/google"
import { GoogleG } from "@/components/brand/GoogleG"
import { Mark } from "@/components/brand/Mark"
import { DisconnectButton, EditProfileButton } from "./SettingsClient"
import { CAPTION, LABEL } from "@/components/metrics/primitives"

const BODY = "max-w-[65ch] text-[15px] leading-[22px] text-pretty text-foreground-secondary"

/** The status line under the source name, and what to do about it. Connected says nothing more: its line has the account and sync. */
const SOURCE: Record<SettingsVM["source"]["status"], { line?: string; tone?: string; body?: string }> = {
  demo: {
    line: "180 days of generated data",
    body: "Every screen runs on realistic generated data. Set GOOGLE_OAUTH_ENABLED=true on the server to use your Fitbit data.",
  },
  not_connected: { line: "Not connected", body: "Connect the Google account your Fitbit Air syncs to. Pulse only reads data." },
  not_linked: {
    line: "No Google Health profile",
    tone: "text-warning",
    body: "This Google account has no Google Health profile, so there is no Fitbit data to read. Set up Google Health with this account (or move your Fitbit account to it), or disconnect and sign in with the account your Fitbit Air uses.",
  },
  connected: {},
  revoked: { line: "Access revoked", tone: "text-recovery-red-text", body: "Google access was revoked or expired. Sync is paused until you reconnect." },
}

function OAuthLink({ label, variant }: { label: string; variant: "default" | "secondary" }) {
  return (
    <Button asChild size="touch" variant={variant} className="w-full">
      <Link href="/oauth/start" prefetch={false}>
        {label}
      </Link>
    </Button>
  )
}

/**
 * Data source (spec §7.14): the source as one row (logo, name, last sync) with no status pill;
 * the status only shows when something needs doing, and the actions sit in an even two-column row.
 */
export function DataSource({
  source,
  lastSyncAt = null,
  now,
}: {
  source: SettingsVM["source"]
  lastSyncAt?: number | null
  now: number
}) {
  const s = SOURCE[source.status]
  // The account itself is named once, beside Sign out.
  const line = s.line ?? (lastSyncAt ? `Synced ${ago(lastSyncAt, now)}` : "Not synced yet")
  const actions =
    source.status === "connected" ? (
      <>
        <OAuthLink label="Reconnect" variant="secondary" />
        <DisconnectButton />
      </>
    ) : source.status === "not_linked" ? (
      <>
        <Button asChild size="touch" variant="default" className="w-full">
          <a href={HEALTH_SIGNUP_URL} target="_blank" rel="noreferrer">
            Set up
          </a>
        </Button>
        <DisconnectButton />
      </>
    ) : source.status === "revoked" ? (
      <>
        <OAuthLink label="Reconnect Google" variant="default" />
        <DisconnectButton />
      </>
    ) : source.status === "not_connected" ? (
      <div className="col-span-2">
        <OAuthLink label="Connect Google" variant="default" />
      </div>
    ) : null
  return (
    <SectionShell variant="card" level={2} id="source" title="Data source">
      <div className="flex min-h-11 items-center gap-3">
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/[0.06]">
          {source.status === "demo" ? <Mark className="size-5" /> : <GoogleG className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] leading-[22px] font-semibold">{source.label}</p>
          <p className={cn("truncate text-[13px] leading-[18px] text-muted-foreground tabular-nums", s.tone)}>{line}</p>
        </div>
      </div>
      {s.body && <p className={cn(BODY, "mt-3")}>{s.body}</p>}
      {actions && <div className="mt-4 grid grid-cols-2 gap-2">{actions}</div>}
    </SectionShell>
  )
}

function SyncIcon({ status }: { status: SettingsVM["sync"][number]["status"] }) {
  if (status === "ok") return <Check aria-hidden className="size-4 text-optimal" strokeWidth={2.5} />
  if (status === "stale") return <TriangleAlert aria-hidden className="size-4 text-warning" strokeWidth={2} />
  if (status === "error") return <CircleAlert aria-hidden className="size-4 text-recovery-red-text" strokeWidth={2} />
  return <Minus aria-hidden className="size-4 text-muted-foreground" strokeWidth={2} />
}

const STATUS_WORD = { ok: "up to date", stale: "behind", error: "failed", never: "not synced yet" }

export function SyncStatus({ vm, now }: { vm: Pick<SettingsVM, "mode" | "sync" | "import">; now: number }) {
  return (
    <SectionShell variant="card" level={2} id="sync" title="Sync status">
      {vm.import && (
        <div className="mb-3 space-y-2" role="status" aria-live="polite">
          <p className="text-[15px] leading-[22px] tabular-nums">
            Importing history: {vm.import.done} of {vm.import.total} days
          </p>
          <Progress value={(vm.import.done / vm.import.total) * 100} aria-label="Import progress" className="h-1.5 bg-muted" />
        </div>
      )}
      <ul className="divide-y divide-border">
        {vm.sync.map((r) => {
          const when = r.lastSuccessAt ? ago(r.lastSuccessAt, now) : "Never"
          const text = vm.mode === "demo" && r.lastSuccessAt ? `Updated ${when}` : when
          return (
            <li key={r.key} className="flex min-h-13 items-center gap-3 py-2">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[15px] leading-[22px]">{r.label}</span>
                {r.status === "error" && r.error && <span className={cn(CAPTION, "text-recovery-red-text")}>{r.error}</span>}
              </span>
              <span className={cn(CAPTION, "shrink-0 font-numeric tabular-nums")}>{text}</span>
              <SyncIcon status={r.status} />
              <span className="sr-only">, {STATUS_WORD[r.status]}</span>
            </li>
          )
        })}
        {vm.sync.length === 0 && <li className={cn(CAPTION, "py-3")}>Nothing has synced yet.</li>}
      </ul>
    </SectionShell>
  )
}

export function Profile({ profile }: { profile: SettingsVM["profile"] }) {
  const rows: [string, string][] = [
    ["Birth date", format(parseISO(profile.birthDate), "d MMM yyyy")],
    ["Age", String(profile.age)],
    ["Sex", profile.sex === "male" ? "Male" : "Female"],
    ["Max heart rate", `${profile.maxHr} bpm, ${profile.maxHrSource}`],
    ["Height", profile.heightCm ? `${profile.heightCm} cm` : "Not set"],
    ["Time zone", profile.timeZone],
  ]
  return (
    <SectionShell variant="card" level={2} title="Profile">
      <dl className="divide-y divide-border">
        {rows.map(([k, v]) => (
          <div key={k} className="flex min-h-13 items-center justify-between gap-3 py-2">
            <dt className={LABEL}>{k}</dt>
            <dd className="truncate text-right text-[15px] leading-[22px] tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <EditProfileButton
          defaults={{ birthDate: profile.birthDate, sex: profile.sex, maxHr: profile.maxHrSource === "set" ? profile.maxHr : null, heightCm: profile.heightCm }}
        />
        <p className={CAPTION}>Time zone comes from the server (TZ).</p>
      </div>
    </SectionShell>
  )
}

export function About({ version, scoringVersion }: { version: string; scoringVersion: number }) {
  return (
    <SectionShell variant="card" level={2} title="About" fill>
      <p className={BODY}>
        Scoring is ported from noop (PolyForm Noncommercial 1.0.0). Google Health ingestion follows Hælan (AGPL-3.0). Pulse is for personal use and is
        not a medical device.
      </p>
      {/* At the foot when the card is stretched to Profile's height beside it (SYM9). */}
      <dl className="mt-auto divide-y divide-border pt-3">
        {[
          ["Version", version],
          ["Scoring version", String(scoringVersion)],
        ].map(([k, v]) => (
          <div key={k} className="flex min-h-13 items-center justify-between gap-3 py-2">
            <dt className="text-[15px] leading-[22px]">{k}</dt>
            <dd className="font-numeric text-[15px] font-semibold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
    </SectionShell>
  )
}

/**
 * Settings body: Data source and Sync status, Profile, About. One column through tablet (spec §7.14); from 1280 px
 * two columns, Data source over Profile on the left and Sync status over About on the right (U18 ST-01). Each row's
 * cards share their top and bottom (SYM9).
 */
/** Who is signed in, and Sign out (U20): a plain form post, so it works before hydration. */
export function Account({ email }: { email: string | null }) {
  return (
    <div className="flex flex-col items-center gap-3 pt-3 text-center">
      <p className={CAPTION}>{email ? `Signed in as ${email}` : "Signed in to the demo"}</p>
      <form method="post" action="/logout" className="w-full max-w-[400px]">
        <Button type="submit" variant="outline-pill" size="sheet">
          Sign out
        </Button>
      </form>
    </div>
  )
}

const lastSync = (rows: SettingsVM["sync"]) => rows.reduce<number | null>((m, r) => (r.lastSuccessAt && (!m || r.lastSuccessAt > m) ? r.lastSuccessAt : m), null)

export function SettingsView({ vm, now, email = null }: { vm: SettingsVM; now: number; email?: string | null }) {
  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-2 xl:gap-4">
      <div className="flex min-w-0 flex-col *:flex-1 xl:col-start-1 xl:row-start-1">
        <DataSource source={vm.source} lastSyncAt={lastSync(vm.sync)} now={now} />
      </div>
      <div className="flex min-w-0 flex-col *:flex-1 xl:col-start-2 xl:row-start-1">
        <SyncStatus vm={vm} now={now} />
      </div>
      <div className="flex min-w-0 flex-col *:flex-1 xl:col-start-1 xl:row-start-2">
        <Profile profile={vm.profile} />
      </div>
      <div className="flex min-w-0 flex-col *:flex-1 xl:col-start-2 xl:row-start-2">
        <About version={vm.version} scoringVersion={vm.scoringVersion} />
      </div>
      <div className="xl:col-span-2">
        <Account email={email} />
      </div>
    </div>
  )
}
