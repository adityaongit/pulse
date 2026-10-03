import Link from "next/link"
import { format, parseISO } from "date-fns"
import { Check, ChevronDown, CircleAlert, Minus, TriangleAlert } from "lucide-react"
import { cn } from "@/lib/utils"
import { ago } from "@/lib/format"
import { HEALTH_SIGNUP_URL } from "@/lib/google"
import type { SettingsVM } from "@/server/queries/types"
import { SectionShell } from "@/components/shells/SectionShell"
import { SyncNowButton } from "@/components/shells/SyncNowButton"
import { UserAvatar } from "@/components/shells/UserAvatar"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { GoogleFit } from "@/components/brand/GoogleFit"
import { Mark } from "@/components/brand/Mark"
import { AvatarButtons, DisconnectButton, EditProfileButton } from "./SettingsClient"
import { CAPTION } from "@/components/metrics/primitives"

const BODY = "max-w-[65ch] text-[15px] leading-[22px] text-pretty text-foreground-secondary"
/** One settings row: label left, value right, 52 px tall, hairline between rows. */
const ROW = "flex min-h-13 items-center justify-between gap-3 py-2"
const ROW_LABEL = "text-[15px] leading-[22px]"
const ROW_VALUE = "truncate text-right text-[15px] leading-[22px] text-foreground-secondary tabular-nums"
/** The logo tile beside a row's name (account photo, data source mark). */
const TILE = "grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-white/[0.06]"

export type SettingsAccount = { email: string | null; avatar: string | null; customPhoto: boolean }

/** Who is signed in: photo, account, change photo, sign out (U20). Sign out is a plain form post, so it works before hydration. */
export function Account({ account }: { account: SettingsAccount }) {
  const owner = account.email !== null
  return (
    <SectionShell variant="card" level={2} id="account" title="Account">
      <div className="flex min-h-11 items-center gap-3">
        <span className="size-14 shrink-0">
          <UserAvatar src={account.avatar} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] leading-[22px] font-semibold">{owner ? account.email : "Demo"}</p>
          <p className="text-[13px] leading-[18px] text-muted-foreground">{owner ? "Google account" : "Signed in to the demo"}</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {owner && <AvatarButtons customPhoto={account.customPhoto} />}
        <form method="post" action="/logout" className={cn(!owner && "col-span-2")}>
          <Button type="submit" variant="outline" size="touch" className="w-full">
            Sign out
          </Button>
        </form>
      </div>
    </SectionShell>
  )
}

/** The status line under the source name, and what to do about it. Connected says nothing more: its line has the last sync. */
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

function OAuthLink({ label }: { label: string }) {
  return (
    <Button asChild size="touch" variant="default" className="w-full">
      <Link href="/oauth/start" prefetch={false}>
        {label}
      </Link>
    </Button>
  )
}

function SyncIcon({ status }: { status: SettingsVM["sync"][number]["status"] }) {
  if (status === "ok") return <Check aria-hidden className="size-4 text-optimal" strokeWidth={2.5} />
  if (status === "stale") return <TriangleAlert aria-hidden className="size-4 text-warning" strokeWidth={2} />
  if (status === "error") return <CircleAlert aria-hidden className="size-4 text-recovery-red-text" strokeWidth={2} />
  return <Minus aria-hidden className="size-4 text-muted-foreground" strokeWidth={2} />
}

const STATUS_WORD = { ok: "up to date", stale: "behind", error: "failed", never: "not synced yet" }

/** Per data type, folded under one summary line; it opens itself when something failed or fell behind. */
function DataTypes({ rows, now }: { rows: SettingsVM["sync"]; now: number }) {
  const failing = rows.filter((r) => r.status === "error").length
  const behind = rows.filter((r) => r.status === "stale").length
  const summary = failing ? `${failing} failing` : behind ? `${behind} behind` : rows.every((r) => r.status === "ok") ? "All up to date" : "Waiting for first sync"
  return (
    <details id="sync" open={failing + behind > 0} className="group mt-4 border-t border-border">
      <summary className="flex min-h-13 cursor-pointer list-none items-center justify-between gap-3 rounded-md py-2 outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        <span className={ROW_LABEL}>Data types</span>
        <span className="flex items-center gap-2">
          <span className={cn("text-[13px] leading-[18px]", failing ? "text-recovery-red-text" : behind ? "text-warning" : "text-muted-foreground")}>{summary}</span>
          <ChevronDown aria-hidden className="size-4 text-muted-foreground transition-transform duration-200 ease-standard group-open:rotate-180" strokeWidth={2} />
        </span>
      </summary>
      <ul className="divide-y divide-border border-t border-border">
        {rows.map((r) => (
          <li key={r.key} className="flex min-h-12 items-center gap-3 py-2">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[15px] leading-[22px]">{r.label}</span>
              {r.status === "error" && r.error && <span className={cn(CAPTION, "text-recovery-red-text")}>{r.error}</span>}
            </span>
            <span className={cn(CAPTION, "shrink-0 font-numeric tabular-nums")}>{r.lastSuccessAt ? ago(r.lastSuccessAt, now) : "Never"}</span>
            <SyncIcon status={r.status} />
            <span className="sr-only">, {STATUS_WORD[r.status]}</span>
          </li>
        ))}
      </ul>
    </details>
  )
}

/**
 * Data source (spec §7.14): the source as one row (logo, name, last sync), its status only when something needs
 * doing, Sync now, and the per-type sync status folded underneath.
 */
export function DataSource({ vm, now }: { vm: Pick<SettingsVM, "source" | "sync" | "import">; now: number }) {
  const { source } = vm
  const s = SOURCE[source.status]
  const last = vm.sync.reduce<number | null>((m, r) => (r.lastSuccessAt && (!m || r.lastSuccessAt > m) ? r.lastSuccessAt : m), null)
  const line = s.line ?? (last ? `Synced ${ago(last, now)}` : "Not synced yet")
  const actions =
    source.status === "connected" ? (
      <>
        <SyncNowButton className="w-full" />
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
        <OAuthLink label="Reconnect Google" />
        <DisconnectButton />
      </>
    ) : source.status === "not_connected" ? (
      <div className="col-span-2">
        <OAuthLink label="Connect Google" />
      </div>
    ) : (
      <div className="col-span-2">
        <SyncNowButton className="w-full" />
      </div>
    )
  return (
    <SectionShell variant="card" level={2} id="source" title="Data source">
      <div className="flex min-h-11 items-center gap-3">
        <span aria-hidden className={TILE}>
          {source.status === "demo" ? <Mark className="size-5" /> : <GoogleFit className="size-6" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] leading-[22px] font-semibold">{source.label}</p>
          <p className={cn("truncate text-[13px] leading-[18px] text-muted-foreground tabular-nums", s.tone)}>{line}</p>
        </div>
      </div>
      {s.body && <p className={cn(BODY, "mt-3")}>{s.body}</p>}
      {vm.import && (
        <div className="mt-4 space-y-2" role="status" aria-live="polite">
          <p className="text-[15px] leading-[22px] tabular-nums">
            Importing history: {vm.import.done} of {vm.import.total} days
          </p>
          <Progress value={(vm.import.done / vm.import.total) * 100} aria-label="Import progress" className="h-1.5 bg-muted" />
        </div>
      )}
      <div className="mt-4 grid grid-cols-2 gap-2">{actions}</div>
      {source.status !== "demo" && vm.sync.length > 0 && <DataTypes rows={vm.sync} now={now} />}
    </SectionShell>
  )
}

export function Profile({ profile }: { profile: SettingsVM["profile"] }) {
  const rows: [string, string][] = [
    ["Birth date", format(parseISO(profile.birthDate), "d MMM yyyy")],
    ["Age", String(profile.age)],
    ["Sex", profile.sex === "male" ? "Male" : "Female"],
    ["Height", profile.heightCm ? `${profile.heightCm} cm` : "Not set"],
    ["Max heart rate", `${profile.maxHr} bpm, ${profile.maxHrSource}`],
    ["Time zone", profile.timeZone],
  ]
  return (
    <SectionShell
      variant="card"
      level={2}
      title="Profile"
      action={
        <EditProfileButton
          defaults={{ birthDate: profile.birthDate, sex: profile.sex, maxHr: profile.maxHrSource === "set" ? profile.maxHr : null, heightCm: profile.heightCm }}
        />
      }
    >
      <dl className="divide-y divide-border">
        {rows.map(([k, v]) => (
          <div key={k} className={ROW}>
            <dt className={ROW_LABEL}>{k}</dt>
            <dd className={ROW_VALUE}>{v}</dd>
          </div>
        ))}
      </dl>
      <p className={cn(CAPTION, "mt-2")}>The time zone comes from the server&apos;s TZ setting.</p>
    </SectionShell>
  )
}

export function About({ version, scoringVersion }: { version: string; scoringVersion: number }) {
  return (
    <SectionShell variant="card" level={2} title="About">
      <p className={BODY}>
        Scoring is ported from noop. Pulse is for personal use and is not a medical device.
      </p>
      <dl className="mt-3 divide-y divide-border">
        {[
          ["Version", version],
          ["Scoring version", String(scoringVersion)],
        ].map(([k, v]) => (
          <div key={k} className={ROW}>
            <dt className={ROW_LABEL}>{k}</dt>
            <dd className={cn(ROW_VALUE, "font-numeric font-semibold")}>{v}</dd>
          </div>
        ))}
      </dl>
    </SectionShell>
  )
}

/**
 * Settings body: Account, Data source (with sync), Profile, About, as one 640 px column at every width. A list of
 * settings reads top to bottom; the old two-column grid stretched short cards to their neighbour's height.
 */
export function SettingsView({ vm, now, account }: { vm: SettingsVM; now: number; account: SettingsAccount }) {
  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-3 md:gap-4">
      <Account account={account} />
      <DataSource vm={vm} now={now} />
      <Profile profile={vm.profile} />
      <About version={vm.version} scoringVersion={vm.scoringVersion} />
    </div>
  )
}
