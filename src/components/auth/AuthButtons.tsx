"use client"

import * as React from "react"
import { LoaderCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { GoogleG } from "@/components/brand/GoogleG"

/** True from the click until the page is left; reset when the browser restores this page from its back-forward cache. */
function usePending() {
  const [pending, setPending] = React.useState(false)
  React.useEffect(() => {
    const reset = (e: PageTransitionEvent) => e.persisted && setPending(false)
    window.addEventListener("pageshow", reset)
    return () => window.removeEventListener("pageshow", reset)
  }, [])
  return [pending, () => setPending(true)] as const
}

const Spinner = () => <LoaderCircle aria-hidden className="animate-spin motion-reduce:animate-none" strokeWidth={2.25} />


/** "Sign in with Google": a full page navigation to /oauth/start, which redirects to Google's consent. */
export function GoogleSignIn({ label = "Sign in with Google" }: { label?: string }) {
  const [pending, start] = usePending()
  return (
    <Button asChild size="sheet" className="normal-case tracking-normal text-[16px]">
      {/* A plain anchor, not next/link: it leaves the app for Google. */}
      <a href="/oauth/start" onClick={start} aria-disabled={pending || undefined} aria-busy={pending || undefined} className={pending ? "pointer-events-none" : undefined}>
        {pending ? <Spinner /> : <GoogleG />}
        {pending ? "Opening Google…" : label}
      </a>
    </Button>
  )
}

/** "Continue with demo data": posts to /login/demo, which sets a demo session and lands on Home. */
export function DemoSignIn() {
  const [pending, start] = usePending()
  return (
    <form method="post" action="/login/demo" onSubmit={start}>
      <Button type="submit" size="sheet" disabled={pending} aria-busy={pending || undefined} className="normal-case tracking-normal text-[16px]">
        {pending && <Spinner />}
        {pending ? "Loading demo…" : "Continue with demo data"}
      </Button>
    </form>
  )
}
