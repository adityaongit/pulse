import { loginReturn } from "@/lib/login-return"
import type { Metadata } from "next"
import Link from "next/link"
import { connection } from "next/server"
import { redirect } from "next/navigation"
import { signupMode, userCount } from "@/server/admin"
import { currentUser } from "@/server/auth"
import { getConfig } from "@/server/config"
import { getDb } from "@/server/db"
import { DemoSignIn } from "@/components/auth/AuthButtons"
import { LoginForm } from "@/components/auth/AuthForm"
import { AUTH_FOOTNOTE, AUTH_LINK, AuthHero } from "@/components/auth/AuthHero"
import { AuthShell } from "@/components/shells/AuthShell"

export const metadata: Metadata = { title: "Sign in" }

/**
 * Sign in `/login`. A real instance signs in with an email or username and a password (Google only feeds the data,
 * connected from inside), and links to sign-up while it is open (or points invitees to their link). A demo instance
 * offers the demo only.
 */
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  await connection()
  const next = loginReturn((await searchParams).next)
  if (await currentUser()) redirect(next)
  const { dataSource } = getConfig()

  if (dataSource !== "google") {
    return (
      <AuthShell
        actions={
          <>
            <DemoSignIn next={next} />
            <p className={AUTH_FOOTNOTE}>
              This server runs on generated data. To use your own, set up a Google OAuth client (see <span translate="no">docs/setup.md</span>).
            </p>
          </>
        }
      >
        <AuthHero title="Know when to push, and when to rest" body="Recovery, Strain and Sleep from your Fitbit Air, scored on your own server." />
      </AuthShell>
    )
  }

  const db = getDb()
  // A new server (no accounts) links to sign-up for its owner whatever the mode.
  const [mode, first] = await Promise.all([signupMode(db), userCount(db).then((n) => n === 0)])
  return (
    <AuthShell>
      <AuthHero compact title="Welcome back" body="Sign in to see today’s Recovery, Strain and Sleep." />
      <div className="mt-8 space-y-5">
        <LoginForm next={next} />
        <p className={AUTH_FOOTNOTE}>
          {mode === "closed" && !first ? (
            "Your data stays on this server."
          ) : mode === "invite" && !first ? (
            "New to Pulse? Open the invite link you were sent."
          ) : (
            <>
              New to Pulse?{" "}
              <Link href="/signup" className={AUTH_LINK}>
                Create account
              </Link>
            </>
          )}
        </p>
      </div>
    </AuthShell>
  )
}
