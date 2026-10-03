import { connection } from "next/server"
import { AppShell } from "@/components/shells/AppShell"
import { currentSession } from "@/server/auth"
import { avatarSrc } from "@/server/avatar"
import { getDb } from "@/server/db"
import { getShellStatus, requestSync } from "@/server/queries/settings"

// Drops Next's generated manifest link (no crossorigin outside Vercel previews), leaving the root
// layout's own <link crossorigin="use-credentials"> as the only one.
export const metadata = { manifest: null }

export default async function AppLayout({ children }: LayoutProps<"/">) {
  // Request time only: the status, "today" and the config must never be frozen into a prerender
  // (and getConfig() throws at build time without an .env).
  await connection()
  // Fire and forget: the worker throttles itself; the page renders from what is already stored.
  requestSync()
  const session = await currentSession()
  const seed = session?.kind === "owner" ? session.email : "pulse-demo"
  return <AppShell status={{ ...getShellStatus(), avatar: avatarSrc(getDb()), avatarSeed: seed }}>{children}</AppShell>
}
