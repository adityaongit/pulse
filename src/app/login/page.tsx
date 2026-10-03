import type { Metadata } from "next"
import { connection } from "next/server"
import { CircleAlert } from "lucide-react"
import { getConfig } from "@/server/config"
import { Mark } from "@/components/brand/Mark"
import { DemoSignIn, GoogleSignIn } from "@/components/auth/AuthButtons"
import { AuthShell } from "@/components/shells/AuthShell"

export const metadata: Metadata = { title: "Sign in" }

/** What a failed sign-in says; codes come from /oauth/callback (`GoogleError.code` or Google's own `error`). */
const ERRORS: Record<string, string> = {
  access_denied: "Google sign-in was cancelled. Try again, and allow every permission on the consent screen.",
  auth_revoked: "Google didn't grant offline access. Remove Pulse under Google Account › Security › Third-party access, then sign in again.",
  account_not_linked:
    "That Google account has no Google Health profile, so Pulse has nothing to read. Sign in with the account your Fitbit Air uses, or set up Google Health first.",
  email_unverified: "That Google account's email isn't verified yet. Verify it with Google, then sign in again.",
}
const FALLBACK = "Sign-in didn't finish. Try again."

const HEADLINE = "text-[32px] leading-[38px] font-bold tracking-[-0.02em] text-balance"
const BODY = "text-[16px] leading-6 text-pretty text-foreground-secondary"
const FOOTNOTE = "text-center text-[13px] leading-[18px] text-pretty text-muted-foreground"

/**
 * Sign in `/login` (U20). A Google instance offers Google only; a demo instance (no OAuth client) offers the demo
 * only. `?error=not_owner` turns the screen into "this Pulse belongs to someone else".
 */
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  await connection()
  const google = !!getConfig().google
  const raw = (await searchParams).error
  const error = typeof raw === "string" ? raw : null
  const notOwner = error === "not_owner"

  return (
    <AuthShell
      actions={
        <>
          {error && !notOwner && (
            <p role="alert" className="mb-1 flex gap-2.5 rounded-2xl bg-recovery-red/12 px-4 py-3 text-[14px] leading-5 text-pretty text-foreground">
              <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-recovery-red-text" strokeWidth={2.25} />
              {ERRORS[error] ?? FALLBACK}
            </p>
          )}
          {google ? <GoogleSignIn label={notOwner ? "Use another Google account" : undefined} /> : <DemoSignIn />}
          <p className={FOOTNOTE}>
            {google
              ? "Pulse reads your Google Health data and keeps it on this server. It never writes to your account."
              : "This server runs on generated data. To use your own, set up a Google OAuth client (see docs/setup.md)."}
          </p>
        </>
      }
    >
      <div className="flex flex-col items-center text-center">
        <div className="relative mb-10 grid size-40 place-items-center">
          {/* The glow breathes with the beat; still under reduced motion. */}
          <div
            aria-hidden
            className="absolute inset-0 rounded-full bg-[radial-gradient(closest-side,var(--optimal),color-mix(in_oklch,var(--strain-text),transparent_40%)_55%,transparent)] opacity-35 blur-2xl motion-safe:animate-beat-glow"
          />
          <Mark animated className="relative size-24" title={notOwner ? undefined : "Pulse"} />
        </div>
        {notOwner ? (
          <>
            <h1 className={HEADLINE}>This Pulse belongs to someone else</h1>
            <p className={`${BODY} mt-3 max-w-[32ch]`}>The Google account you chose doesn&apos;t own this server. Only the account that set it up can open it.</p>
          </>
        ) : (
          <>
            <h1 className={HEADLINE}>Know when to push, and when to rest</h1>
            <p className={`${BODY} mt-3 max-w-[32ch]`}>Recovery, Strain and Sleep from your Fitbit Air, scored on your own server.</p>
          </>
        )}
      </div>
    </AuthShell>
  )
}
