import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { currentUser } from "@/server/auth"
import { getDb } from "@/server/db"
import { authorizeRedirect, createCode, issuerOf, resourceOf, validateAuthorize } from "@/server/mcp/oauth"
import { AuthShell } from "@/components/shells/AuthShell"
import { Button } from "@/components/ui/button"

export const metadata = { title: "Connect ChatGPT", robots: { index: false, follow: false }, referrer: "no-referrer" as const }

export default async function ConsentPage({ searchParams }: PageProps<"/oauth/mcp/consent">) {
  const h = await headers()
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(await searchParams)) {
    if (Array.isArray(value)) for (const v of value) params.append(key, v)
    else if (value !== undefined) params.set(key, value)
  }
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`
  const issuer = issuerOf(origin)
  let auth
  try { auth = await validateAuthorize(params, resourceOf(origin)) } catch {
    redirect(`/oauth/mcp/authorize?${params}`)
  }
  const me = await currentUser()
  if (!me) redirect(`/login?next=${encodeURIComponent(`/oauth/mcp/authorize?${params}`)}`)
  const authorization = auth
  const userId = me.userId
  const query = params.toString()
  async function decide(form: FormData) {
    "use server"
    const user = await currentUser()
    if (!user || user.userId !== userId) redirect(`/login?next=${encodeURIComponent(`/oauth/mcp/authorize?${query}`)}`)
    const allow = form.get("decision") === "allow"
    const result = allow ? { code: await createCode(getDb(), user.userId, authorization) } : { error: "access_denied" }
    redirect(authorizeRedirect(authorization.redirectUri, new URLSearchParams(query), issuer, result))
  }
  return (
    <AuthShell>
      <h1 className="mt-8 text-2xl font-semibold">Connect {auth.clientName}</h1>
      <p className="mt-4 text-[15px] leading-6 text-muted-foreground">
        {auth.clientName} is asking to read your Pulse account ({me.email}) and log water, food, weight, mood and symptoms.
        Log tools save immediately when the agent calls them.
      </p>
      <p className="mt-3 text-[13px] leading-5 text-muted-foreground">Finish your Pulse profile before using the connection. You can revoke access in Settings › Agents.</p>
      <form action={decide} className="mt-8 flex flex-col gap-3">
        <Button type="submit" size="sheet" name="decision" value="allow">Allow</Button>
        <Button type="submit" size="sheet" variant="secondary" name="decision" value="deny">Deny</Button>
      </form>
    </AuthShell>
  )
}
