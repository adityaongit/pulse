import { existsSync } from "node:fs"
import path from "node:path"
import { connection } from "next/server"
import { AppShell } from "@/components/shells/AppShell"
import { getConfig } from "@/server/config"
import { getShellStatus, requestSync } from "@/server/queries/settings"

/** The Home avatar photo: AVATAR_URL, else the first `public/avatar.{jpg,png,webp}` present, else none (spec §11 M6). */
function avatarSrc() {
  const file = ["avatar.jpg", "avatar.png", "avatar.webp"].find((f) => existsSync(path.join(process.cwd(), "public", f)))
  return getConfig().avatarUrl ?? (file ? `/${file}` : null)
}

// Drops Next's generated manifest link (no crossorigin outside Vercel previews), leaving the root
// layout's own <link crossorigin="use-credentials"> as the only one.
export const metadata = { manifest: null }

export default async function AppLayout({ children }: LayoutProps<"/">) {
  // Request time only: the status, "today" and the config must never be frozen into a prerender
  // (and getConfig() throws at build time without an .env).
  await connection()
  // Fire and forget: the worker throttles itself; the page renders from what is already stored.
  requestSync()
  return <AppShell status={{ ...getShellStatus(), avatar: avatarSrc() }}>{children}</AppShell>
}
