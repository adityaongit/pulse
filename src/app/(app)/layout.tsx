import { Suspense } from "react"
import { connection } from "next/server"
import { redirect } from "next/navigation"
import { currentUser } from "@/server/auth"
import { AppShell } from "@/components/shells/AppShell"
import { FEATURES } from "@/lib/features"
import { activityLogContext } from "@/server/queries/home"
import { ActivitySheets } from "./activity/LogActivity"
import { CheckInSheet } from "./journal/CheckIn"
import { avatarSrc } from "@/server/avatar"
import { coachAccess } from "@/server/coach/store"
import { getDb } from "@/server/db"
import { ctxOf } from "@/server/queries/common"
import { getShellStatus } from "@/server/queries/settings"
import { requestSync } from "@/server/worker"

// Drops Next's generated manifest link (no crossorigin outside Vercel previews), leaving the root
// layout's own <link crossorigin="use-credentials"> as the only one.
export const metadata = { manifest: null }

export default async function AppLayout({ children }: LayoutProps<"/">) {
  // Request time only: the status, "today" and the config must never be frozen into a prerender
  // (and getConfig() throws at build time without an .env).
  await connection()
  // The proxy only checks that a session cookie exists; this checks the session itself.
  const user = await currentUser()
  if (!user) redirect("/login")
  const db = getDb()
  // Scores need age, sex and time zone: a new account fills in its profile first.
  const ctx = await ctxOf(db, user.userId).catch((e: Error) => {
    if (e.message === "profile_missing") return null
    throw e
  })
  if (!ctx) redirect("/onboarding")
  // Fire and forget: the worker throttles itself; the page renders from what is already stored.
  requestSync({ userId: user.userId })
  const [status, avatar, coach, logging] = await Promise.all([
    getShellStatus(ctx),
    avatarSrc(db, user.userId),
    coachAccess(db, user.userId),
    // The hidden Add / Start Activity flows read today's Strain Target and recent workouts only when one is on.
    FEATURES.logActivity || FEATURES.startActivity ? activityLogContext(ctx) : null,
  ])
  return (
    <AppShell live status={{ ...status, avatar, coach, userId: user.userId }}>
      {children}
      {/* One check-in sheet for every screen, opened over it by `?checkin=1` (spec §11 UX2). */}
      <Suspense>
        <CheckInSheet />
        {logging && <ActivitySheets {...logging} />}
      </Suspense>
    </AppShell>
  )
}
