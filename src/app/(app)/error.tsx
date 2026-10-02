"use client"

import * as React from "react"
import { CircleAlert } from "lucide-react"
import { EmptyState } from "@/components/shells/EmptyState"
import { CONTENT_COLUMN } from "@/components/shells/PageShell"
import { TopBar } from "@/components/shells/TopBar"

const RELOAD_FLAG = "pulse:access-reload"

/**
 * Is the Cloudflare Access session gone? Access answers an expired session with a redirect to its
 * login domain: a manual-redirect probe sees an opaque redirect, and a followed one fails as an opaque
 * network error (CORS). A plain server error answers 200/500 from our own origin.
 */
async function accessExpired() {
  try {
    const res = await fetch(window.location.href, { method: "HEAD", cache: "no-store", credentials: "same-origin", redirect: "manual" })
    if (res.type === "opaqueredirect" || res.redirected) return true
    try {
      sessionStorage.removeItem(RELOAD_FLAG) // the session works again: re-arm the guard
    } catch {}
    return false
  } catch {
    return navigator.onLine // offline is not an expired session
  }
}

/** Error view for every (app) route: the shell stays, the screen offers a retry (spec §7, plan U13). */
export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  React.useEffect(() => {
    let cancelled = false
    void accessExpired().then((expired) => {
      if (!expired || cancelled) return
      try {
        // One full reload per session (it takes the browser through the Access login); never a loop.
        if (sessionStorage.getItem(RELOAD_FLAG)) return
        sessionStorage.setItem(RELOAD_FLAG, String(Date.now()))
      } catch {
        return
      }
      window.location.reload()
    })
    return () => {
      cancelled = true
    }
  }, [error])

  return (
    <>
      <TopBar>
        <h1 className="truncate text-[13px] leading-4 font-bold tracking-[0.1em] uppercase">Pulse</h1>
      </TopBar>
      <div className={CONTENT_COLUMN}>
        <div role="alert" className="pt-16">
          <EmptyState icon={CircleAlert} body="Couldn't load this screen." action={{ label: "Try again", onClick: () => retry() }} />
        </div>
      </div>
    </>
  )
}
